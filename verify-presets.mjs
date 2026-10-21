import { PRESETS, buildPreset } from './presets.js';
import {
  verletStep, chooseStepSize, energies, momentum,
  allFinite, G_DEFAULT, computeAccelerations,
} from './physics.js';

const T_MAX = 400;

let failures = 0;

console.log(`verify: adaptive Verlet, T=${T_MAX}, G=${G_DEFAULT}\n`);
console.log(
  'preset'.padEnd(16),
  'cfg'.padEnd(9),
  'drift%'.padStart(10),
  'maxR'.padStart(9),
  'r/r0'.padStart(8),
  '|P|'.padStart(10),
  'verdict'.padStart(10),
);

for (const preset of PRESETS) {
  const { bodies, int } = buildPreset(preset.key);
  const eps2 = int.eps * int.eps;
  computeAccelerations(bodies, G_DEFAULT, eps2);
  const e0 = energies(bodies, G_DEFAULT, eps2);
  const r0 = Math.max(...bodies.map((b) => Math.hypot(b.x, b.y, b.z))) || 1;

  let maxR = r0;
  let finite = true;
  let escaped = false;
  let t = 0;
  let guard = 0;

  while (t < T_MAX && finite && !escaped && guard++ < 1e8) {
    const h = Math.min(chooseStepSize(bodies, int.hMax, int.c), T_MAX - t);
    verletStep(bodies, G_DEFAULT, h, eps2);
    t += h;
    if ((guard & 63) === 0) {
      if (!allFinite(bodies)) { finite = false; break; }
      for (const b of bodies) {
        const r = Math.hypot(b.x, b.y, b.z);
        if (r > maxR) maxR = r;
      }
      if (maxR > 1e4) { escaped = true; break; }
    }
  }
  if (finite) finite = allFinite(bodies);

  const ef = energies(bodies, G_DEFAULT, eps2);
  const drift = e0.e !== 0 ? Math.abs((ef.e - e0.e) / e0.e) * 100 : 0;
  const p = momentum(bodies);
  const ratio = maxR / r0;
  const cfg = int.hMax === 0.004 && int.eps === 2e-5 ? 'default' : 'tight';

  let verdict;
  if (!finite || (t < T_MAX - 1e-6 && !escaped)) verdict = 'FAIL';
  else if (preset.expect === 'free') verdict = drift < 3 ? 'ok(**)' : 'CHECK';
  else if (preset.unstable) verdict = !escaped && drift < 50 ? 'ok(*)' : 'CHECK';
  else if (escaped || ratio >= 3) verdict = 'FAIL';
  else verdict = drift < 3 ? 'PASS' : 'CHECK';

  if (verdict === 'FAIL' || verdict === 'CHECK') failures++;

  console.log(
    preset.key.padEnd(16),
    cfg.padEnd(9),
    drift.toFixed(6).padStart(10),
    escaped ? '  ESC' : maxR.toFixed(2).padStart(9),
    ratio.toFixed(2).padStart(8),
    p.mag.toExponential(1).padStart(10),
    verdict.padStart(10),
  );
}

console.log('\n(*)  = exact but linearly unstable solution; collapse is physical');
console.log('(**) = open/dissociating by design; only energy conservation is required');
console.log(failures === 0 ? '\nALL PRESETS VERIFIED' : `\n${failures} PRESET(S) NEED ATTENTION`);
process.exit(failures === 0 ? 0 : 1);
