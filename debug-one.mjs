import { PRESETS } from './presets.js';
import { verletStep, energies, G_DEFAULT, DT, computeAccelerations } from './physics.js';

const key = process.argv[2] || 'butterfly1';
const preset = PRESETS.find((p) => p.key === key);
const bodies = preset.bodies.map((b) => ({ ...b }));

computeAccelerations(bodies, G_DEFAULT);
console.log('t=0 bodies:');
for (const b of bodies) {
  console.log(`  m=${b.m} pos=(${b.x.toFixed(6)},${b.y.toFixed(6)}) vel=(${b.vx.toFixed(6)},${b.vy.toFixed(6)}) acc=(${b.ax.toFixed(6)},${b.ay.toFixed(6)})`);
}
console.log('E0:', energies(bodies, G_DEFAULT));

const T = 50, N = Math.round(T / DT);
let maxR = 0;
for (let s = 0; s < N; s++) {
  verletStep(bodies, G_DEFAULT);
  if (s % Math.round(5 / DT) === 0 && s > 0) {
    for (const b of bodies) maxR = Math.max(maxR, Math.hypot(b.x, b.y, b.z));
    const e = energies(bodies, G_DEFAULT);
    console.log(`t=${(s * DT).toFixed(1).padStart(6)}  E=${e.e.toFixed(6).padStart(12)}  maxR=${maxR.toFixed(3)}  b0=(${bodies[0].x.toFixed(3)},${bodies[0].y.toFixed(3)})`);
  }
}
