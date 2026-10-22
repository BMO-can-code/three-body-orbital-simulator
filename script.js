import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  G_DEFAULT, computeAccelerations, adaptiveStep, energies,
} from './physics.js';
import { PRESETS, GROUP_ORDER, buildPreset } from './presets.js';

const TRAIL_LENGTH = 1500;
const TRAIL_DT = 0.005;
const MAX_STEPS_PER_FRAME = 4000;

const COLORS = ['#c8795e', '#7fa8b5', '#c98b86'];

const C = (hex) => new THREE.Color(hex);

let bodies = [];
let meshes = [];
let trails = [];
let trailHistory = [];
let trailBuffers = [];
let trailAttrs = [];
let trailDirty = [];
let trailCounts = [];
let glows = [];
let currentKey = 'figure8';
let currentInt = null;
let running = true;
let speed = 1;
let showTrails = true;
let simTime = 0;
let lastTrailTime = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0c);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(3, 1.5, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('container').appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x3a3b40, 0.5);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xfff6e8, 1.6);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0x93a7c4, 0.35);
dirLight2.position.set(-5, -3, -5);
scene.add(dirLight2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1;
controls.maxDistance = 30;
controls.target.set(0, 0, 0);

const starsGeo = new THREE.BufferGeometry();
const starCount = 1100;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) starPos[i] = (Math.random() - 0.5) * 220;
starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({
  color: 0xd8d2c4, size: 0.055, transparent: true, opacity: 0.32,
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
  trailBuffers = []; trailAttrs = []; trailDirty = []; trailCounts = [];
  simTime = 0;
  lastTrailTime = 0;

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const col = colorFor(i);
    const size = body.size;

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(size, 32, 32),
      new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 0.3,
        roughness: 0.45, metalness: 0.1,
      })
    );
    sphere.position.set(body.x, body.y, body.z);
    scene.add(sphere);
    meshes.push(sphere);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, color: col, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(1.35, 1.35, 1);
    glow.position.set(body.x, body.y, body.z);
    scene.add(glow);
    glows.push(glow);

    const buffer = new Float32Array(TRAIL_LENGTH * 3);
    const attr = new THREE.BufferAttribute(buffer, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    trailHistory.push([]);
    trailBuffers.push(buffer);
    trailAttrs.push(attr);
    trailDirty.push(false);
    trailCounts.push(0);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', attr);
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: 0.5,
    }));
    scene.add(trail);
    trails.push(trail);
  }

  document.getElementById('orbitButtonText').textContent = preset.name;
  document.querySelectorAll('#orbitMenu .orbit-option').forEach((option) => {
    const isCurrent = option.dataset.key === key;
    option.classList.toggle('is-current', isCurrent);
    option.setAttribute('aria-selected', String(isCurrent));
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
    trailDirty[i] = true;
    trailCounts[i] = -1;
    meshes[i].position.set(bodies[i].x, bodies[i].y, bodies[i].z);
    glows[i].position.set(bodies[i].x, bodies[i].y, bodies[i].z);
    trails[i].geometry.setDrawRange(0, 0);
  }
  computeAccelerations(bodies, G_DEFAULT, currentInt.eps2);
  simTime = 0;
  lastTrailTime = 0;
}

function updatePhysics() {
  simTime += adaptiveStep(bodies, G_DEFAULT, currentInt);
}

function recordTrail() {
  if (simTime - lastTrailTime < TRAIL_DT) return;
  lastTrailTime = simTime;
  for (let i = 0; i < bodies.length; i++) {
    const p = bodies[i];
    const hist = trailHistory[i];
    hist.push(p.x, p.y, p.z);
    if (hist.length > TRAIL_LENGTH * 3) hist.splice(0, 3);
    trailDirty[i] = true;
  }
}

function updateVisuals() {
  for (let i = 0; i < bodies.length; i++) {
    const p = bodies[i];
    meshes[i].position.set(p.x, p.y, p.z);
    glows[i].position.set(p.x, p.y, p.z);
    const hist = trailHistory[i];
    if (trailDirty[i] && hist.length / 3 !== trailCounts[i]) {
      trailBuffers[i].set(hist);
      trailAttrs[i].needsUpdate = true;
      trails[i].geometry.setDrawRange(0, hist.length / 3);
      trailCounts[i] = hist.length / 3;
      trailDirty[i] = false;
    }
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

const orbitButton = document.getElementById('orbitButton');
const orbitMenu = document.getElementById('orbitMenu');
const orbitButtonText = document.getElementById('orbitButtonText');

function buildOrbitMenu() {
  for (const group of GROUP_ORDER) {
    const label = document.createElement('div');
    label.className = 'orbit-group';
    label.textContent = group;
    orbitMenu.appendChild(label);

    for (const p of PRESETS) {
      if (p.group !== group) continue;
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'orbit-option';
      option.dataset.key = p.key;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = p.name;
      option.addEventListener('click', () => {
        loadPreset(p.key);
        closeOrbitMenu();
        orbitButton.focus();
      });
      orbitMenu.appendChild(option);
    }
  }
}

function openOrbitMenu() {
  orbitMenu.hidden = false;
  orbitButton.setAttribute('aria-expanded', 'true');
  const current = orbitMenu.querySelector('.orbit-option.is-current') || orbitMenu.querySelector('.orbit-option');
  if (current) current.focus();
}

function closeOrbitMenu() {
  orbitMenu.hidden = true;
  orbitButton.setAttribute('aria-expanded', 'false');
}

orbitButton.addEventListener('click', () => {
  if (orbitMenu.hidden) openOrbitMenu(); else closeOrbitMenu();
});

orbitButton.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (orbitMenu.hidden) openOrbitMenu();
  }
});

orbitMenu.addEventListener('keydown', (e) => {
  const items = [...orbitMenu.querySelectorAll('.orbit-option')];
  const index = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[Math.min(items.length - 1, index + 1)].focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[Math.max(0, index - 1)].focus();
  } else if (e.key === 'Home') {
    e.preventDefault();
    items[0].focus();
  } else if (e.key === 'End') {
    e.preventDefault();
    items[items.length - 1].focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeOrbitMenu();
    orbitButton.focus();
  } else if (e.key === 'Tab') {
    closeOrbitMenu();
  }
});

document.addEventListener('click', (e) => {
  if (!orbitMenu.hidden && !e.target.closest('.orbit-picker')) closeOrbitMenu();
});

buildOrbitMenu();
document.getElementById('pauseBtn').addEventListener('click', () => {
  running = !running;
  const btn = document.getElementById('pauseBtn');
  btn.classList.toggle('is-paused', !running);
  btn.setAttribute('aria-label', running ? 'Pause' : 'Play');
  btn.title = running ? 'Pause (Space)' : 'Play (Space)';
});
document.getElementById('resetBtn').addEventListener('click', resetSimulation);
document.getElementById('perturbBtn').addEventListener('click', perturb);
function setSpeedFromSlider(value) {
  speed = 0.1 * Math.pow(300, (value - 1) / 99);
  document.getElementById('speedLabel').textContent =
    (speed >= 10 ? Math.round(speed) : speed.toFixed(1)) + '\u00d7';
}

document.getElementById('speedSlider').addEventListener('input', (e) => {
  setSpeedFromSlider(parseFloat(e.target.value));
});
document.getElementById('trailToggle').addEventListener('change', (e) => { showTrails = e.target.checked; });
document.getElementById('autoRotateToggle').addEventListener('change', (e) => {
  controls.autoRotate = e.target.checked;
  controls.autoRotateSpeed = 1.5;
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, button, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); document.getElementById('pauseBtn').click(); }
  if (e.code === 'KeyR') { e.preventDefault(); resetSimulation(); }
  if (e.code === 'KeyP') { e.preventDefault(); perturb(); }
});

const requestedKey = new URLSearchParams(location.search).get('preset');
const validKey = PRESETS.some((p) => p.key === requestedKey) ? requestedKey : 'figure8';
loadPreset(validKey);

let frameAccum = 0;

function animate() {
  requestAnimationFrame(animate);
  if (running) {
    frameAccum += speed;
    let steps = 0;
    while (frameAccum >= 1 && steps < MAX_STEPS_PER_FRAME) {
      updatePhysics();
      recordTrail();
      frameAccum -= 1;
      steps++;
    }
    if (steps === 0) { updatePhysics(); recordTrail(); }
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
