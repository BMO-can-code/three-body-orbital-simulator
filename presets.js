import { makeBody, centerOfMassFrame, G_DEFAULT, DEFAULT_INTEGRATOR } from './physics.js';

const C = (m, color, px, py, pz, vx, vy, vz) => makeBody(m, color, 0, px, py, pz, vx, vy, vz);

function setSizes(bodies) {
  for (const b of bodies) b.size = 0.11 * Math.cbrt(b.m) + 0.03;
  return bodies;
}

function star(p1, p2) {
  return [
    C(1, 0x67e8f9, -1, 0, 0, p1, p2, 0),
    C(1, 0xf0abfc, 1, 0, 0, p1, p2, 0),
    C(1, 0xfcd34d, 0, 0, 0, -2 * p1, -2 * p2, 0),
  ];
}

function trojanBodies(M, m, a) {
  const bodies = [
    makeBody(M, 0xfcd34d, 0, 0, 0, 0, 0, 0, 0),
    makeBody(m, 0x67e8f9, 0, a, 0, 0, 0, 0, 0),
    makeBody(m, 0xf0abfc, 0, a / 2, (a * Math.sqrt(3)) / 2, 0, 0, 0, 0),
  ];
  centerOfMassFrame(bodies);
  const omega = Math.sqrt((G_DEFAULT * (M + 2 * m)) / (a * a * a));
  for (const b of bodies) {
    b.vx = -omega * b.y;
    b.vy = omega * b.x;
  }
  centerOfMassFrame(bodies);
  return setSizes(bodies);
}

const TIGHT = Object.freeze({ hMax: 0.001, c: 0.005, eps: 1e-6 });
const TIGHT2 = Object.freeze({ hMax: 0.0005, c: 0.005, eps: 1e-5 });
const TIGHT3 = Object.freeze({ hMax: 0.0005, c: 0.003, eps: 1e-7 });

const sd = (key, name, p1, p2, desc, T, int) => ({
  key, name, group: 'Choreographies', desc,
  cite: 'Šuvakov & Dmitrašinović 2013 · van derbei suite',
  bodies: setSizes(star(p1, p2)),
  T, expect: 'bounded', ...(int ? { int } : {}),
});

export const PRESETS = [
  {
    key: 'figure8', name: 'Figure-8', group: 'Choreographies',
    desc: 'Three equal masses chase each other around a single figure-8 loop. The first known choreographic solution — proved stable in 2000.',
    cite: 'Moore 1993 · Chenciner & Montgomery 2000',
    bodies: setSizes([
      C(1, 0x67e8f9, -0.97000436, 0.24308753, 0, 0.4662036850, 0.4323657300, 0),
      C(1, 0xf0abfc, 0, 0, 0, -0.93240737, -0.86473146, 0),
      C(1, 0xfcd34d, 0.97000436, -0.24308753, 0, 0.4662036850, 0.4323657300, 0),
    ]),
    expect: 'bounded',
  },
  sd('butterfly2', 'Butterfly II', 0.392955223941802, 0.0975792352080344,
    'A tight butterfly with sharply crossing wings — member of the 13-family Šuvakov–Dmitrašinović catalogue.', 7.00390738764014, TIGHT),
  sd('butterfly3', 'Butterfly III', 0.405915588857606, 0.230163127422333,
    'The “tall” butterfly: narrow wings with long vertical excursions, looping every 13.9 time units.', 13.8657626785699),
  sd('butterfly4', 'Butterfly IV', 0.350112121391296, 0.0793394773483276,
    'A wide-glide butterfly on a long 79.5-unit circuit. Its grazing close encounters demand a tighter integrator.', 79.4758748952101, TIGHT2),
  sd('moth1', 'Moth I', 0.464445237398184, 0.396059973403921,
    'A fast compact loop whose crossings resemble moth wings beating around a lantern.', 14.8939113169584),
  sd('moth2', 'Moth II', 0.439165939331987, 0.452967645644678,
    'Neighbouring branch of the Moth family — nearly the same period, slightly different geometry.', 28.6702783225658),
  sd('moth3', 'Moth III', 0.383443534851074, 0.377363693237305,
    'Third member of the Moth family: a rounder, slower weave that closes on itself every 25.8 time units.', 25.8406180475758),
  sd('dragonfly', 'Dragonfly', 0.080584285736084, 0.588836087036132,
    'A long slender body with four rapid wing-beat crossings per period.', 21.2709751966648),
  sd('yarn', 'Yarn', 0.559064247131347, 0.349191558837891,
    'A long stretched-out loop, like a length of yarn pulled taut across the plane.', 55.5017624421301),
  sd('bumblebee', 'Bumblebee', 0.184278506469727, 0.587188195800781,
    'A busy buzzing orbit with frequent close passes and a 63.5-unit period — the most intricate of the compact families.', 63.5345412733264),
  sd('yinyang1', 'Yin-Yang I', 0.513938054919243, 0.304736003875733,
    'Two interlocked teardrops tracing the taijitu symbol, closing one circuit every 17.3 time units.', 17.328369755004, TIGHT),
  sd('yinyang1b', 'Yin-Yang I b', 0.282698682308198, 0.327208786129952,
    'Second branch of the Yin-Yang pair — same silhouette, shorter 11-unit period, sensitive to close-encounter precision.', 10.9625630756217, TIGHT3),
  sd('yinyang2', 'Yin-Yang II', 0.416822143554688, 0.330333312988282,
    'A slower, wider taijitu: one full double-teardrop circuit takes 55.8 time units.', 55.78982856891, TIGHT),
  sd('yinyang2b', 'Yin-Yang II b', 0.417342877101898, 0.313100116109848,
    'Companion branch of Yin-Yang II — nearly identical period, distinct winding.', 54.2075992141846, TIGHT),
  sd('newest', 'Newest', 0.2554309326049807, 0.516385834327506,
    'The most recent addition to the numerical choreography catalogue — a compact, remarkably robust loop.', 0),

  {
    key: 'broucke_henon', name: 'Broucke–Hénon', group: 'Broucke–Hénon families',
    desc: 'A periodic solution from the Broucke–Hénon classification: two bodies sweep mirrored arcs while the third crosses between them, repeating exactly.',
    cite: 'Broucke 1975 · Hénon 1976 · van derbei suite',
    bodies: setSizes([
      C(1, 0x67e8f9, -1, 0, 0, 0, -0.9393326, 0),
      C(1, 0xfcd34d, 0.5, -0.647584, 0, -0.505328, 0.4696663, 0),
      C(1, 0xf0abfc, 0.5, 0.647584, 0, 0.505328, 0.4696663, 0),
    ]),
    expect: 'bounded',
  },

  {
    key: 'lagrange', name: 'Lagrange Triangle', group: 'Classical (1767–1772)',
    desc: 'Three equal masses fixed at the vertices of an equilateral triangle, rotating about its centre. An exact solution — but linearly UNSTABLE for equal masses: expect it to break apart eventually (or instantly with Perturb).',
    cite: 'Lagrange 1772',
    bodies: setSizes([
      C(1, 0xfcd34d, 0, 1, 0, -0.759836, 0, 0),
      C(1, 0x67e8f9, -0.866025, -0.5, 0, 0.379918, -0.658037, 0),
      C(1, 0xf0abfc, 0.866025, -0.5, 0, 0.379918, 0.658037, 0),
    ]),
    expect: 'bounded', unstable: true,
  },
  {
    key: 'trojan', name: 'Trojan Triangle (stable)', group: 'Classical (1767–1772)',
    desc: 'A heavy primary with two light bodies locked 60° apart at the L4/L5 points. Same equilateral geometry as Lagrange’s triangle, but the extreme mass ratio makes it stably periodic — the configuration of Jupiter’s Trojan asteroids.',
    cite: 'Lagrange 1772 · stable mass ratio m/M ≪ 1',
    bodies: trojanBodies(20, 0.3, 2),
    expect: 'bounded',
  },
  {
    key: 'euler', name: 'Euler Collinear', group: 'Classical (1767–1772)',
    desc: 'Three equal masses on a straight line, rotating rigidly about the centre of mass. An exact solution — and famously unstable: the slightest nudge collapses it into a chaotic encounter.',
    cite: 'Euler 1767',
    bodies: setSizes([
      C(1, 0x67e8f9, -1, 0, 0, 0, -1.118034, 0),
      C(1, 0xfcd34d, 0, 0, 0, 0, 0, 0),
      C(1, 0xf0abfc, 1, 0, 0, 0, 1.118034, 0),
    ]),
    expect: 'bounded', unstable: true,
  },

  {
    key: 'burrau', name: 'Burrau “Pythagorean”', group: 'Famous problems',
    desc: 'Masses 3, 4 and 5 start from rest on a right triangle with integer sides. Burrau’s 1913 benchmark: a long quasi-periodic dance, then a violent close encounter ejects one body and leaves a tight binary.',
    cite: 'Burrau 1913 · Szebehely & Peters 1967',
    bodies: setSizes([
      C(3, 0x67e8f9, 1, 3, 0, 0, 0, 0),
      C(4, 0xfcd34d, -2, -1, 0, 0, 0, 0),
      C(5, 0xf0abfc, 1, -1, 0, 0, 0, 0),
    ]),
    expect: 'free', int: { eps: 1e-4 },
  },

  {
    key: 'chaotic', name: 'Chaotic encounter', group: 'Non-periodic',
    desc: 'Three comparable masses thrown in with generic velocities. Sensitive dependence on initial conditions on full display — watch the energy-drift readout spike through close encounters.',
    cite: 'generic initial conditions',
    bodies: setSizes([
      C(1, 0x67e8f9, -1.6, 0.3, 0, 0.2, -0.15, 0),
      C(1.1, 0xf0abfc, 1.4, -0.4, 0, -0.25, 0.2, 0),
      C(0.9, 0xfcd34d, 0.2, 1.2, 0, -0.15, -0.3, 0),
    ]),
    expect: 'free',
  },
  {
    key: 'slingshot', name: 'Slingshot', group: 'Non-periodic',
    desc: 'A light body falls into a tight equal-mass binary and is flung away at high speed — the gravitational slingshot used by interplanetary probes, in its purest three-body form.',
    cite: 'binary–single scattering',
    bodies: setSizes([
      C(4, 0xfcd34d, -0.8, 0, 0, 0, -2.2360680, 0),
      C(4, 0xfcd34d, 0.8, 0, 0, 0, 2.2360680, 0),
      C(0.1, 0x67e8f9, 0, 4.2, 0, 0.3, -1.1, 0),
    ]),
    expect: 'free',
  },
  {
    key: 'ejection', name: 'Ejection', group: 'Non-periodic',
    desc: 'An unstable hierarchy: two bodies form a tight pair while the third spirals in, exchanges energy, and is ejected to infinity. The classic route to a binary + runaway star.',
    cite: 'binary–single ejection',
    bodies: setSizes([
      C(1, 0xfcd34d, -1.1, 0, 0, 0, -0.4767308, 0),
      C(1, 0xfcd34d, 1.1, 0, 0, 0, 0.4767308, 0),
      C(1, 0x67e8f9, 0, 5.5, 0, 0.55, -0.05, 0),
    ]),
    expect: 'free', int: { hMax: 0.002, c: 0.005 },
  },
  {
    key: 'capture', name: 'Binary capture', group: 'Non-periodic',
    desc: 'A third body crosses a wide binary, carries away energy, and the remaining pair hardens into a tighter orbit — how binaries shrink in dense star clusters.',
    cite: 'three-body recombination',
    bodies: setSizes([
      C(3, 0xfcd34d, -1.4, 0, 0, 0, -1.2677314, 0),
      C(3, 0xfcd34d, 1.4, 0, 0, 0, 1.2677314, 0),
      C(1, 0x67e8f9, -4.5, 2.6, 0, 0.75, -0.45, 0),
    ]),
    expect: 'free',
  },
  {
    key: 'hierarchical', name: 'Hierarchical triple', group: 'Non-periodic',
    desc: 'A massive central body with two light companions on well-separated circular orbits — a stable hierarchy, the architecture of most known triple star systems.',
    cite: 'stable hierarchical architecture',
    bodies: setSizes([
      C(16, 0xfcd34d, 0, 0, 0, 0, 0, 0),
      C(0.2, 0x67e8f9, 2, 0, 0, 0, 2.8108030, 0),
      C(0.12, 0xf0abfc, -4, 4, 0, -1.1847887, -1.1847887, 0),
    ]),
    expect: 'bounded',
  },
];

export const GROUP_ORDER = [
  'Choreographies',
  'Broucke–Hénon families',
  'Classical (1767–1772)',
  'Famous problems',
  'Non-periodic',
];

export function buildPreset(key) {
  const p = PRESETS.find((q) => q.key === key) || PRESETS[0];
  const bodies = p.bodies.map((b) => ({ ...b }));
  centerOfMassFrame(bodies);
  const int = { ...DEFAULT_INTEGRATOR, ...(p.int || {}) };
  return { preset: p, bodies, int };
}
