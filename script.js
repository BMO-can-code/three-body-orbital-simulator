import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  G_DEFAULT, computeAccelerations, adaptiveStep, energies,
} from './physics.js';
import { PRESETS, GROUP_ORDER, buildPreset } from './presets.js';

const TRAIL_LENGTH = 1500;
const MAX_STEPS_PER_FRAME = 4000;

const COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1'];

const C = (hex) => new THREE.Color(hex);

let bodies = [];
let meshes = [];
let trails = [];
let trailHistory = [];
let glows = [];
let currentKey = 'figure8';
let currentInt = null;
let running = true;
let speed = 1;
let showTrails = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(3, 1.5, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('container').appendChild(renderer.domElement);

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
controls.maxDistance = 30;
controls.target.set(0, 0, 0);

const starsGeo = new THREE.BufferGeometry();
const starCount = 3000;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) starPos[i] = (Math.random() - 0.5) * 300;
starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({
  color: 0xffffff, size: 0.08, transparent: true, opacity: 0.6,
})));

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
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

function toHex(color) {
  return typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color;
}

function colorFor(i) {
  return toHex(bodies[i] && bodies[i].color !== undefined ? bodies[i].color : COLORS[i % COLORS.length]);
}

function loadPreset(key) {
  const { preset, bodies: b, int } = buildPreset(key);
  currentKey = preset.key;
  bodies = b;
  currentInt = { hMax: int.hMax, c: int.c, eps2: int.eps * int.eps };
  computeAccelerations(bodies, G_DEFAULT, currentInt.eps2);

  for (const m of meshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  for (const t of trails) { scene.remove(t); t.geometry.dispose(); t.material.dispose(); }
  for (const g of glows) { scene.remove(g); g.material.dispose(); }

  meshes = []; trails = []; trailHistory = []; glows = [];

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const col = colorFor(i);
    const size = body.size;

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(size, 32, 32),
      new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 0.4,
        roughness: 0.2, metalness: 0.3,
      })
    );
    sphere.position.set(body.x, body.y, body.z);
    scene.add(sphere);
    meshes.push(sphere);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, color: col, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(1.5, 1.5, 1);
    glow.position.set(body.x, body.y, body.z);
    scene.add(glow);
    glows.push(glow);

    trailHistory.push([]);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LENGTH * 3), 3));
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: 0.35,
    }));
    scene.add(trail);
    trails.push(trail);
  }

  document.getElementById('presetSelect').value = key;
  document.querySelectorAll('.orbit-item').forEach((el) => {
    el.classList.toggle('active-orbit', el.dataset.key === key);
  });
}

function resetSimulation() {
  const { bodies: b, int } = buildPreset(currentKey);
  currentInt = { hMax: int.hMax, c: int.c, eps2: int.eps * int.eps };
  for (let i = 0; i < b.length; i++) {
    bodies[i].x = b[i].x; bodies[i].y = b[i].y; bodies[i].z = b[i].z;
    bodies[i].vx = b[i].vx; bodies[i].vy = b[i].vy; bodies[i].vz = b[i].vz;
    bodies[i].ax = 0; bodies[i].ay = 0; bodies[i].az = 0;
    trailHistory[i] = [];
    meshes[i].position.set(bodies[i].x, bodies[i].y, bodies[i].z);
    glows[i].position.set(bodies[i].x, bodies[i].y, bodies[i].z);
    trails[i].geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LENGTH * 3), 3));
    trails[i].geometry.setDrawRange(0, 0);
  }
  computeAccelerations(bodies, G_DEFAULT, currentInt.eps2);
}

function updatePhysics() {
  adaptiveStep(bodies, G_DEFAULT, currentInt);
}

function updateVisuals() {
  for (let i = 0; i < bodies.length; i++) {
    const p = bodies[i];
    meshes[i].position.set(p.x, p.y, p.z);
    glows[i].position.set(p.x, p.y, p.z);
    trailHistory[i].push(p.x, p.y, p.z);
    if (trailHistory[i].length > TRAIL_LENGTH * 3) trailHistory[i].splice(0, 3);
    const positions = new Float32Array(trailHistory[i]);
    trails[i].geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    trails[i].geometry.setDrawRange(0, trailHistory[i].length / 3);
    trails[i].visible = showTrails;
  }
  const e = energies(bodies, G_DEFAULT, currentInt.eps2);
  document.getElementById('keValue').textContent = e.ke.toFixed(4);
  document.getElementById('peValue').textContent = e.pe.toFixed(4);
  document.getElementById('totalValue').textContent = e.e.toFixed(4);
}

function perturb() {
  for (const b of bodies) {
    b.vx += (Math.random() - 0.5) * 0.05;
    b.vy += (Math.random() - 0.5) * 0.05;
    b.vz += (Math.random() - 0.5) * 0.05;
  }
}

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

function buildGallery() {
  const gallery = document.getElementById('orbitGallery');
  for (const group of GROUP_ORDER) {
    const section = document.createElement('div');
    section.className = 'orbit-section';
    section.textContent = group;
    gallery.appendChild(section);
    for (const p of PRESETS) {
      if (p.group !== group) continue;
      const item = document.createElement('div');
      item.className = 'orbit-item';
      item.dataset.key = p.key;
      const name = document.createElement('div');
      name.className = 'orbit-name';
      name.textContent = p.name;
      const desc = document.createElement('div');
      desc.className = 'orbit-desc';
      desc.textContent = p.desc || '';
      item.append(name, desc);
      item.addEventListener('click', () => {
        loadPreset(p.key);
        document.querySelector('[data-tab="simulation"]').click();
      });
      gallery.appendChild(item);
    }
  }
}

populatePresetSelect();
buildGallery();

document.getElementById('presetSelect').addEventListener('change', (e) => {
  loadPreset(e.target.value);
});
document.getElementById('pauseBtn').addEventListener('click', () => {
  running = !running;
  document.getElementById('pauseBtn').textContent = running ? '⏸' : '▶';
});
document.getElementById('resetBtn').addEventListener('click', resetSimulation);
document.getElementById('perturbBtn').addEventListener('click', perturb);
document.getElementById('speedSlider').addEventListener('input', (e) => {
  speed = parseFloat(e.target.value);
  document.getElementById('speedLabel').textContent = speed.toFixed(1) + '\u00d7';
});
document.getElementById('trailToggle').addEventListener('change', (e) => { showTrails = e.target.checked; });
document.getElementById('autoRotateToggle').addEventListener('change', (e) => {
  controls.autoRotate = e.target.checked;
  controls.autoRotateSpeed = 1.5;
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); document.getElementById('pauseBtn').click(); }
  if (e.code === 'KeyR') { e.preventDefault(); resetSimulation(); }
  if (e.code === 'KeyP') { e.preventDefault(); perturb(); }
});

loadPreset('figure8');

let frameAccum = 0;

function animate() {
  requestAnimationFrame(animate);
  if (running) {
    frameAccum += speed;
    let steps = 0;
    while (frameAccum >= 1 && steps < MAX_STEPS_PER_FRAME) {
      updatePhysics();
      frameAccum -= 1;
      steps++;
    }
    if (steps === 0) updatePhysics();
    updateVisuals();
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.__APP_READY = true;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
