export const G_DEFAULT = 1;
export const DT = 0.002;

export const DEFAULT_INTEGRATOR = Object.freeze({
  hMax: 0.004,
  c: 0.01,
  eps: 2e-5,
});

export const EPS2 = DEFAULT_INTEGRATOR.eps * DEFAULT_INTEGRATOR.eps;

export function makeBody(m, color, size, px, py, pz, vx, vy, vz) {
  return {
    m, color, size,
    x: px, y: py, z: pz,
    vx, vy, vz,
    ax: 0, ay: 0, az: 0,
    alive: true,
  };
}

export function computeAccelerations(bodies, G, eps2 = EPS2) {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    a.ax = 0; a.ay = 0; a.az = 0;
  }
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const r2 = dx * dx + dy * dy + dz * dz + eps2;
      const inv = G / (r2 * Math.sqrt(r2));
      a.ax += dx * (b.m * inv); a.ay += dy * (b.m * inv); a.az += dz * (b.m * inv);
      b.ax -= dx * (a.m * inv); b.ay -= dy * (a.m * inv); b.az -= dz * (a.m * inv);
    }
  }
}

export function verletStep(bodies, G, dt = DT, eps2 = EPS2) {
  const half = 0.5 * dt;
  for (const b of bodies) {
    if (!b.alive) continue;
    b.vx += half * b.ax;
    b.vy += half * b.ay;
    b.vz += half * b.az;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
  }
  computeAccelerations(bodies, G, eps2);
  for (const b of bodies) {
    if (!b.alive) continue;
    b.vx += half * b.ax;
    b.vy += half * b.ay;
    b.vz += half * b.az;
  }
}

const H_FLOOR = 1e-9;

export function chooseStepSize(bodies, hMax, c) {
  let h = hMax;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const dvx = b.vx - a.vx, dvy = b.vy - a.vy, dvz = b.vz - a.vz;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const v = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
      if (v > 1e-12) {
        const hi = (c * r) / v;
        if (hi < h) h = hi;
      }
    }
  }
  return h > H_FLOOR ? h : H_FLOOR;
}

export function adaptiveStep(bodies, G, opts = {}, dtRemaining = Infinity) {
  const { hMax = DEFAULT_INTEGRATOR.hMax, c = DEFAULT_INTEGRATOR.c, eps2 = EPS2 } = opts;
  const h = Math.min(chooseStepSize(bodies, hMax, c), dtRemaining);
  verletStep(bodies, G, h, eps2);
  return h;
}

export function energies(bodies, G, eps2 = EPS2) {
  let ke = 0, pe = 0;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a.alive) continue;
    ke += 0.5 * a.m * (a.vx * a.vx + a.vy * a.vy + a.vz * a.vz);
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      pe -= G * a.m * b.m / Math.sqrt(dx * dx + dy * dy + dz * dz + eps2);
    }
  }
  return { ke, pe, e: ke + pe };
}

export function momentum(bodies) {
  let px = 0, py = 0, pz = 0;
  for (const b of bodies) {
    if (!b.alive) continue;
    px += b.m * b.vx; py += b.m * b.vy; pz += b.m * b.vz;
  }
  return { px, py, pz, mag: Math.hypot(px, py, pz) };
}

export function angularMomentum(bodies) {
  let lx = 0, ly = 0, lz = 0;
  for (const b of bodies) {
    if (!b.alive) continue;
    lx += b.m * (b.y * b.vz - b.z * b.vy);
    ly += b.m * (b.z * b.vx - b.x * b.vz);
    lz += b.m * (b.x * b.vy - b.y * b.vx);
  }
  return { lx, ly, lz, mag: Math.hypot(lx, ly, lz) };
}

export function centerOfMassFrame(bodies) {
  let M = 0, cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
  for (const b of bodies) {
    M += b.m;
    cx += b.m * b.x; cy += b.m * b.y; cz += b.m * b.z;
    vx += b.m * b.vx; vy += b.m * b.vy; vz += b.m * b.vz;
  }
  if (M === 0) return;
  cx /= M; cy /= M; cz /= M; vx /= M; vy /= M; vz /= M;
  for (const b of bodies) {
    b.x -= cx; b.y -= cy; b.z -= cz;
    b.vx -= vx; b.vy -= vy; b.vz -= vz;
  }
}

export function allFinite(bodies) {
  for (const b of bodies) {
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.z) ||
        !Number.isFinite(b.vx) || !Number.isFinite(b.vy) || !Number.isFinite(b.vz)) return false;
  }
  return true;
}

export function totalMass(bodies) {
  let M = 0;
  for (const b of bodies) if (b.alive) M += b.m;
  return M;
}
