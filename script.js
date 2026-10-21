import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  G_DEFAULT, makeBody, computeAccelerations, adaptiveStep,
  energies, momentum, angularMomentum,
} from './physics.js';
import { PRESETS, GROUP_ORDER, buildPreset } from './presets.js';

const TRAIL_LENGTH = 2400;
const MAX_STEPS_PER_FRAME = 4000;
const SPAWN_COLORS = [0x67e8f9, 0xf0abfc, 0xfcd34d, 0x86efac, 0xfca5a5, 0xc4b5fd];
let spawnColorIndex = 0;

let bodies = [];
let meshes = [];
let glows = [];
let trails = [];
let currentKey = null;
let currentInt = null;
let e0 = 0;
let running = true;
let speed = 1;
let showTrails = true;
let mode = 'orbit';
let simT = 0;
let totalSteps = 0;
let spawnDrag = null;
let spawnPreview = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(3.2, -2.4, 3.4);
camera.up.set(0, 0, 1);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('container').appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.4, 0.82
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const ambient = new THREE.AmbientLight(0x404060, 0.4);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0x8888ff, 0.5);
dirLight2.position.set(-5, -3, -5);
scene.add(dirLight2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1;
controls.maxDistance = 40;
controls.target.set(0, 0, 0);

const starsGeo = new THREE.BufferGeometry();
{
  const starCount = 3000;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount * 3; i++) starPos[i] = (Math.random() - 0.5) * 300;
  starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.08, transparent: true, opacity: 0.6,
  })));
}

function makeRing(radius) {
  const seg = 128;
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x4ecdc4, transparent: true, opacity: 0.06 });
  scene.add(new THREE.Line(geo, mat));
}
makeRing(1);
makeRing(2);

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
const glowTexture = createGlowTexture();

const trailMaterialProto = (color) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.5 } },
  vertexShader: `
    attribute float aFade;
    varying float vFade;
    void main() {
      vFade = aFade;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vFade;
    void main() {
      gl_FragColor = vec4(uColor, vFade * uOpacity);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

function disposeVisuals() {
  for (const m of meshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  for (const g of glows) { scene.remove(g); g.material.dispose(); }
  for (const t of trails) { scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); }
  meshes = [];
  glows = [];
  trails = [];
}

function createVisualFor(b) {
  const colorHex = typeof b.color === 'number' ? b.color : parseInt(b.color, 16);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(b.size, 32, 32),
    new THREE.MeshStandardMaterial({
      color: colorHex, emissive: colorHex, emissiveIntensity: 0.55,
      roughness: 0.25, metalness: 0.2,
    })
  );
  sphere.position.set(b.x, b.y, b.z);
  scene.add(sphere);
  meshes.push(sphere);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: colorHex, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const s = 1.1 + b.size * 3.2;
  glow.scale.set(s, s, 1);
  glow.position.set(b.x, b.y, b.z);
  scene.add(glow);
  glows.push(glow);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LENGTH * 3), 3));
  geo.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(TRAIL_LENGTH), 1));
  geo.setDrawRange(0, 0);
  const trail = new THREE.Line(geo, trailMaterialProto(colorHex));
  trail.frustumCulled = false;
  scene.add(trail);
  trails.push({ line: trail, count: 0 });
}

function createVisuals() {
  disposeVisuals();
  for (const b of bodies) createVisualFor(b);
}

function loadPreset(key) {
  const { preset, bodies: b, int } = buildPreset(key);
  currentKey = preset.key;
  bodies = b;
  currentInt = { hMax: int.hMax, c: int.c, eps2: int.eps * int.eps };
  computeAccelerations(bodies, G_DEFAULT, currentInt.eps2);
  e0 = energies(bodies, G_DEFAULT, currentInt.eps2).e;
  simT = 0;
  totalSteps = 0;
  createVisuals();
  document.getElementById('presetSelect').value = key;

  let r0 = 0;
  for (const b2 of bodies) r0 = Math.max(r0, Math.hypot(b2.x, b2.y, b2.z));
  const dist = Math.min(Math.max(r0 * 3.2, 3.6), 16);
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(dir.multiplyScalar(dist).add(controls.target));
}

function resetSimulation() {
  loadPreset(currentKey);
}

function perturb() {
  for (const b of bodies) {
    if (!b.alive) continue;
    b.vx += (Math.random() - 0.5) * 0.05;
    b.vy += (Math.random() - 0.5) * 0.05;
    b.vz += (Math.random() - 0.5) * 0.05;
  }
}

function pushTrail(trailObj, x, y, z) {
  const attr = trailObj.line.geometry.getAttribute('position');
  const arr = attr.array;
  const fade = trailObj.line.geometry.getAttribute('aFade').array;
  if (trailObj.count < TRAIL_LENGTH) {
    const i = trailObj.count;
    arr[i * 3] = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z;
    trailObj.count++;
  } else {
    arr.copyWithin(0, 3);
    arr[(TRAIL_LENGTH - 1) * 3] = x;
    arr[(TRAIL_LENGTH - 1) * 3 + 1] = y;
    arr[(TRAIL_LENGTH - 1) * 3 + 2] = z;
  }
  const n = trailObj.count;
  for (let i = 0; i < n; i++) fade[i] = n > 1 ? i / (n - 1) : 1;
  attr.needsUpdate = true;
  trailObj.line.geometry.getAttribute('aFade').needsUpdate = true;
  trailObj.line.geometry.setDrawRange(0, n);
  trailObj.line.visible = showTrails;
}

function updateVisuals() {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    meshes[i].position.set(b.x, b.y, b.z);
    glows[i].position.set(b.x, b.y, b.z);
    pushTrail(trails[i], b.x, b.y, b.z);
  }
}

const hud = {
  ke: document.getElementById('keValue'),
  pe: document.getElementById('peValue'),
  e: document.getElementById('eValue'),
  dE: document.getElementById('dEValue'),
  p: document.getElementById('pValue'),
  l: document.getElementById('lValue'),
  t: document.getElementById('tValue'),
  steps: document.getElementById('stepsValue'),
  fps: document.getElementById('fpsValue'),
};
let hudLast = 0;

function updateHud(now) {
  if (now - hudLast < 120) return;
  hudLast = now;
  const { ke, pe, e } = energies(bodies, G_DEFAULT, currentInt.eps2);
  const p = momentum(bodies);
  const l = angularMomentum(bodies);
  hud.ke.textContent = ke.toFixed(4);
  hud.pe.textContent = pe.toFixed(4);
  hud.e.textContent = e.toFixed(4);
  const dE = e0 !== 0 ? ((e - e0) / Math.abs(e0)) * 100 : 0;
  hud.dE.textContent = (dE >= 0 ? '+' : '') + dE.toFixed(4) + '%';
  hud.p.textContent = p.mag.toExponential(1);
  hud.l.textContent = l.mag.toExponential(1);
  hud.t.textContent = simT.toFixed(2);
  hud.steps.textContent = totalSteps.toLocaleString();
}

function stepPhysics(target) {
  let advanced = 0;
  let steps = 0;
  while (advanced < target && steps < MAX_STEPS_PER_FRAME) {
    const h = adaptiveStep(bodies, G_DEFAULT, currentInt, target - advanced);
    advanced += h;
    steps++;
  }
  simT += advanced;
  totalSteps += steps;
}

// ── Spawn mode ──
const raycaster = new THREE.Raycaster();
const spawnPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ndc = new THREE.Vector2();

function pointerToPlane(e) {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const out = new THREE.Vector3();
  return raycaster.ray.intersectPlane(spawnPlane, out) ? out : null;
}

function setSpawnPreview(start, end) {
  if (!spawnPreview) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x4ecdc4, transparent: true, opacity: 0.8 });
    spawnPreview = new THREE.Line(geo, mat);
    spawnPreview.frustumCulled = false;
    scene.add(spawnPreview);
  }
  const arr = spawnPreview.geometry.getAttribute('position').array;
  arr[0] = start.x; arr[1] = start.y; arr[2] = start.z;
  arr[3] = end.x; arr[4] = end.y; arr[5] = end.z;
  spawnPreview.geometry.getAttribute('position').needsUpdate = true;
}

function clearSpawnPreview() {
  if (spawnPreview) {
    scene.remove(spawnPreview);
    spawnPreview.geometry.dispose();
    spawnPreview.material.dispose();
    spawnPreview = null;
  }
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (mode !== 'spawn' || e.button !== 0) return;
  const pt = pointerToPlane(e);
  if (!pt) return;
  spawnDrag = { start: pt.clone(), end: pt.clone() };
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!spawnDrag) return;
  const pt = pointerToPlane(e);
  if (pt) {
    spawnDrag.end.copy(pt);
    setSpawnPreview(spawnDrag.start, spawnDrag.end);
  }
});

window.addEventListener('pointerup', () => {
  if (!spawnDrag) return;
  const { start, end } = spawnDrag;
  spawnDrag = null;
  clearSpawnPreview();
  const vx = (end.x - start.x) * 0.9;
  const vy = (end.y - start.y) * 0.9;
  if (Math.hypot(vx, vy) < 1e-4) return;
  const color = SPAWN_COLORS[spawnColorIndex++ % SPAWN_COLORS.length];
  const body = makeBody(1, color, 0.14, start.x, start.y, 0, vx, vy, 0);
  bodies.push(body);
  computeAccelerations(bodies, G_DEFAULT, currentInt.eps2);
  createVisualFor(body);
});

function setMode(m) {
  mode = m;
  controls.enabled = m === 'orbit';
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === m);
  });
  document.getElementById('spawnHint').classList.toggle('visible', m === 'spawn');
}

function setRunning(r) {
  running = r;
  document.getElementById('pauseBtn').textContent = running ? '⏸' : '▶';
}

// ── UI wiring ──
function populatePresetSelect() {
  const sel = document.getElementById('presetSelect');
  for (const group of GROUP_ORDER) {
    const og = document.createElement('optgroup');
    og.label = group;
    for (const p of PRESETS) {
      if (p.group !== group) continue;
      const opt = document.createElement('option');
      opt.value = p.key;
      opt.textContent = p.name;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
}

function populateOrbitList() {
  const list = document.getElementById('orbitList');
  const notes = {
    lagrange: ' Linearly unstable for equal masses — watch it eventually break apart.',
    euler: ' Linearly unstable — the slightest numerical nudge collapses it.',
    burrau: ' Chaotic by design: after a long quasi-periodic dance, one body is ejected.',
    hierarchical: ' Not a choreography: a stable hierarchical architecture of triple systems.',
  };
  for (const group of GROUP_ORDER) {
    const section = document.createElement('div');
    section.className = 'orbit-section';
    section.textContent = group;
    list.appendChild(section);
    for (const p of PRESETS) {
      if (p.group !== group) continue;
      const item = document.createElement('div');
      item.className = 'orbit-item';
      const name = document.createElement('div');
      name.className = 'orbit-name';
      name.textContent = p.name;
      const desc = document.createElement('div');
      desc.className = 'orbit-desc';
      desc.textContent = p.desc + (notes[p.key] || '');
      const cite = document.createElement('div');
      cite.className = 'orbit-cite';
      cite.textContent = p.cite;
      item.appendChild(name);
      item.appendChild(desc);
      item.appendChild(cite);
      list.appendChild(item);
    }
  }
}

document.getElementById('presetSelect').addEventListener('change', (e) => loadPreset(e.target.value));
document.getElementById('pauseBtn').addEventListener('click', () => setRunning(!running));
document.getElementById('resetBtn').addEventListener('click', resetSimulation);
document.getElementById('perturbBtn').addEventListener('click', perturb);
document.getElementById('speedSlider').addEventListener('input', (e) => {
  speed = parseFloat(e.target.value);
  document.getElementById('speedLabel').textContent = speed.toFixed(1) + '×';
});
document.getElementById('trailToggle').addEventListener('change', (e) => {
  showTrails = e.target.checked;
});
document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); setRunning(!running); }
  if (e.code === 'KeyR') { e.preventDefault(); resetSimulation(); }
  if (e.code === 'KeyP') { e.preventDefault(); perturb(); }
  if (e.code === 'KeyT') {
    e.preventDefault();
    const t = document.getElementById('trailToggle');
    t.checked = !t.checked;
    showTrails = t.checked;
  }
  if (e.code === 'KeyM') { e.preventDefault(); setMode(mode === 'orbit' ? 'spawn' : 'orbit'); }
});

populatePresetSelect();
populateOrbitList();
loadPreset('figure8');

let lastFrame = performance.now();
let fpsEma = 60;

function animate(now) {
  requestAnimationFrame(animate);
  const dtReal = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (dtReal > 0) fpsEma = fpsEma * 0.92 + (1 / dtReal) * 0.08;

  if (running) stepPhysics(dtReal * speed);

  updateVisuals();
  updateHud(now);
  hud.fps.textContent = Math.round(fpsEma);

  controls.update();
  composer.render();
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
