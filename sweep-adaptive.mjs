import { PRESETS } from './presets.js';
import { energies, allFinite, computeAccelerations, verletStep } from './physics.js';

const KEYS = ['figure8', 'butterfly1', 'butterfly2', 'butterfly3', 'butterfly4', 'moth1', 'moth2',
  'yarn1', 'yarn2', 'yarn3', 'yinyang1', 'yinyang2', 'goggles', 'dragonfly', 'moorish',
  'burrau', 'broucke_a2', 'broucke_a4'];

function chooseH(bodies, hMax, c) {
  let h = hMax;
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const dvx = b.vx - a.vx, dvy = b.vy - a.vy, dvz = b.vz - a.vz;
      const v = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
      if (v > 1e-12) {
        const hi = c * r / v;
        if (hi < h) h = hi;
      }
    }
  return h;
}

function run(preset, { hMax, c, eps, T }) {
  const eps2 = eps * eps;
  const bodies = preset.bodies.map((b) => ({ ...b }));
  computeAccelerations(bodies, 1, eps2);
  const e0 = energies(bodies, 1, eps2).e;
  const r0 = Math.max(...bodies.map((b) => Math.hypot(b.x, b.y, b.z))) || 1;
  let maxR = r0, ok = true, t = 0, guard = 0;
  while (t < T && ok && guard++ < 5e7) {
    const h = Math.min(chooseH(bodies, hMax, c), T - t);
    verletStep(bodies, 1, h, eps2);
    t += h;
    if ((guard & 63) === 0) {
      if (!allFinite(bodies)) { ok = false; break; }
      for (const b of bodies) {
        const r = Math.hypot(b.x, b.y, b.z);
        if (r > maxR) maxR = r;
        if (r > 1e4) { ok = false; break; }
      }
    }
  }
  const ef = energies(bodies, 1, eps2).e;
  const drift = Math.abs((ef - e0) / e0) * 100;
  return { drift, ratio: ok ? maxR / r0 : Infinity, guard };
}

const configs = [
  { hMax: 0.004, c: 0.01, eps: 2e-5, T: 300 },
  { hMax: 0.004, c: 0.01, eps: 1e-4, T: 300 },
  { hMax: 0.004, c: 0.02, eps: 1e-4, T: 300 },
  { hMax: 0.002, c: 0.01, eps: 1e-4, T: 300 },
];

for (const cfg of configs) {
  console.log(`\n=== hMax=${cfg.hMax} c=${cfg.c} eps=${cfg.eps} ===`);
  console.log('preset'.padEnd(13), 'drift%'.padStart(11), 'r/r0'.padStart(9));
  let pass = 0, total = 0;
  const t0 = Date.now();
  for (const key of KEYS) {
    const preset = PRESETS.find((p) => p.key === key);
    const { drift, ratio } = run(preset, cfg);
    const isFig8 = key === 'figure8';
    const okR = ratio < (isFig8 ? 1.5 : 3);
    const okD = drift < (isFig8 ? 0.05 : 0.5);
    const ok = okR && okD;
    if (ok) pass++;
    total++;
    console.log(key.padEnd(13), drift.toFixed(6).padStart(11), Number.isFinite(ratio) ? ratio.toFixed(2).padStart(9) : 'inf', ok ? ' PASS' : '');
  }
  console.log(`${pass}/${total} pass   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
