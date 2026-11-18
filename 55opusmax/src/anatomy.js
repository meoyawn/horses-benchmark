// Equine anatomy, sculpted from signed-distance primitives.
// Units: metres. Rest pose: horse standing square, facing +X, Y up, +Z = horse's right side.
// Proportions follow a ~16 hand (1.63 m at the withers) riding horse.

import { Ellipsoid, RoundCone, RoundBox, Sphere, Loft, Hoof, profile, tube, v3, frameFrom } from './sdf.js';

const SIDES = [
  { s: 1, n: 'R' },
  { s: -1, n: 'L' },
];

const deg = Math.PI / 180;

// ---------------- skeleton (rest pose joint positions) ----------------
export function skeletonDef() {
  const B = [];
  const add = (name, parent, pos) => B.push({ name, parent, pos });
  add('root', null, [0, 0, 0]);
  add('body', 'root', [0.0, 1.3, 0]);
  add('chest', 'body', [0.38, 1.36, 0]);
  add('loin', 'body', [-0.26, 1.4, 0]);
  add('pelvis', 'loin', [-0.5, 1.42, 0]);
  add('neck0', 'chest', [0.6, 1.4, 0]);
  add('neck1', 'neck0', [0.8, 1.5, 0]);
  add('neck2', 'neck1', [0.96, 1.64, 0]);
  add('neck3', 'neck2', [1.08, 1.77, 0]);
  add('head', 'neck3', [1.16, 1.88, 0]);
  add('tail0', 'pelvis', [-0.77, 1.48, 0]);
  add('tail1', 'tail0', [-0.845, 1.415, 0]);
  add('tail2', 'tail1', [-0.9, 1.32, 0]);
  add('tail3', 'tail2', [-0.935, 1.2, 0]);
  add('tail4', 'tail3', [-0.952, 1.085, 0]);
  for (const { s, n } of SIDES) {
    add('scap' + n, 'chest', [0.5, 1.5, 0.15 * s]);
    add('humerus' + n, 'scap' + n, [0.78, 1.14, 0.175 * s]);
    add('radius' + n, 'humerus' + n, [0.565, 0.93, 0.16 * s]);
    add('cannonF' + n, 'radius' + n, [0.585, 0.5, 0.145 * s]);
    add('pasternF' + n, 'cannonF' + n, [0.59, 0.175, 0.14 * s]);
    add('hoofF' + n, 'pasternF' + n, [0.665, 0.07, 0.14 * s]);
    add('femur' + n, 'pelvis', [-0.57, 1.26, 0.2 * s]);
    add('tibia' + n, 'femur' + n, [-0.4, 0.95, 0.215 * s]);
    add('cannonH' + n, 'tibia' + n, [-0.635, 0.555, 0.155 * s]);
    add('pasternH' + n, 'cannonH' + n, [-0.64, 0.185, 0.145 * s]);
    add('hoofH' + n, 'pasternH' + n, [-0.58, 0.07, 0.145 * s]);
  }
  return B;
}

// ---------------- trunk length warp ----------------
// The sculpt is authored in "design space"; the final mesh, bones and landmarks are passed
// through this smooth x-warp which shortens the trunk behind the shoulder.
export const WARP = (() => {
  const xs = 0.6, c = 0.075, x0 = -1.6, N = 2200;
  const s = (x) => 1 - c * (1 - smooth01(0.3, 0.6, x));
  const tab = new Float64Array(N + 1);
  const dx = (xs - x0) / N;
  tab[N] = xs;
  for (let i = N - 1; i >= 0; i--) tab[i] = tab[i + 1] - s(x0 + (i + 0.5) * dx) * dx;
  const w = (x) => {
    if (x >= xs) return x;
    if (x <= x0) return tab[0] - (x0 - x) * s(x0);
    const f = (x - x0) / dx, i = Math.floor(f);
    return tab[i] + (tab[i + 1] - tab[i]) * (f - i);
  };
  const p = (q) => [w(q[0]), q[1], q[2]];
  // inverse (final -> design) by bisection on the monotone table
  const inv = (x) => {
    if (x >= xs) return x;
    let lo = x0 - 2, hi = xs;
    for (let i = 0; i < 40; i++) { const m = 0.5 * (lo + hi); if (w(m) < x) lo = m; else hi = m; }
    return 0.5 * (lo + hi);
  };
  return { s, w, p, inv };
})();

// ---------------- head frame ----------------
// u: from the poll along the face towards the muzzle, v: out of the forehead, w: right.
export const HEAD = (() => {
  const P = [1.24, 1.98, 0];
  const a = -55 * deg;
  const U = [Math.cos(a), Math.sin(a), 0];
  const V = [-Math.sin(a), Math.cos(a), 0];
  const W = [0, 0, 1];
  const S = 1.04; // overall head scale
  const at = (u, v, w) => {
    u *= S; v *= S; w *= S;
    return [P[0] + u * U[0] + v * V[0] + w * W[0], P[1] + u * U[1] + v * V[1] + w * W[1], P[2] + u * U[2] + v * V[2] + w * W[2]];
  };
  const dir = (u, v, w) => v3.norm([u * U[0] + v * V[0] + w * W[0], u * U[1] + v * V[1] + w * W[1], u * U[2] + v * V[2] + w * W[2]]);
  return { P, U, V, W, S, at, dir };
})();

// ---------------- weighting helpers ----------------
function smooth01(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// weight along the x axis (trunk)
function xAttach(bounds, widths, bones) {
  return (x, y, z, out, scale) => {
    // P(param > b_i) = smooth01
    const P = bounds.map((b, i) => smooth01(b - widths[i], b + widths[i], x));
    for (let i = 0; i < bones.length; i++) {
      const above = i === 0 ? 1 : P[i - 1];
      const nextAbove = i < P.length ? P[i] : 0;
      const w = above - nextAbove;
      if (w > 0) out[bones[i]] = (out[bones[i]] || 0) + w * scale;
    }
  };
}

// weight along a polyline: segment i belongs to bones[i]; blends of half width `blend` (metres) at joints
function polyAttach(points, bones, blend = 0.04) {
  const segs = [];
  let acc = 0;
  const jointT = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const d = v3.sub(b, a);
    const L = v3.len(d);
    segs.push({ a, d, L, t0: acc });
    acc += L;
    jointT.push(acc);
  }
  const bl = Array.isArray(blend) ? blend : points.map(() => blend);
  return (x, y, z, out, scale) => {
    // closest point param
    let best = 1e9, bt = 0;
    for (const s of segs) {
      const px = x - s.a[0], py = y - s.a[1], pz = z - s.a[2];
      let u = (px * s.d[0] + py * s.d[1] + pz * s.d[2]) / (s.L * s.L);
      u = Math.min(1, Math.max(0, u));
      const qx = px - s.d[0] * u, qy = py - s.d[1] * u, qz = pz - s.d[2] * u;
      const dd = qx * qx + qy * qy + qz * qz;
      if (dd < best) { best = dd; bt = s.t0 + u * s.L; }
    }
    // inner joints are jointT[1..n-1]; bone i spans jointT[i]..jointT[i+1]
    const inner = jointT.slice(1, jointT.length - 1);
    for (let i = 0; i < bones.length; i++) {
      const lo = i === 0 ? 1 : smooth01(inner[i - 1] - bl[i], inner[i - 1] + bl[i], bt);
      const hi = i < inner.length ? smooth01(inner[i] - bl[i + 1], inner[i] + bl[i + 1], bt) : 0;
      const w = lo - hi;
      if (w > 1e-4) out[bones[i]] = (out[bones[i]] || 0) + w * scale;
    }
  };
}

// ---------------- the sculpt ----------------
export function buildAnatomy() {
  const prims = [];
  const P = (p) => { prims.push(p); return p; };
  const PS = (arr) => { for (const p of arr) prims.push(p); return arr; };
  const H = HEAD;

  // ===== trunk =====
  const trunkAttach = xAttach([-0.5, -0.26, 0.38], [0.1, 0.12, 0.14], ['pelvis', 'loin', 'body', 'chest']);
  P(new Loft({
    name: 'trunk', tag: 'barrel', attach: trunkAttach, k: 0.05,
    x0: -0.86, x1: 0.93,
    top: profile([[-0.86, 1.36], [-0.82, 1.43], [-0.75, 1.5], [-0.65, 1.552], [-0.55, 1.572], [-0.45, 1.572], [-0.3, 1.552], [-0.15, 1.533], [0.0, 1.528], [0.2, 1.54], [0.35, 1.56], [0.5, 1.572], [0.65, 1.545], [0.8, 1.46], [0.93, 1.32]]),
    bot: profile([[-0.86, 1.3], [-0.78, 1.26], [-0.65, 1.2], [-0.5, 1.13], [-0.4, 1.065], [-0.3, 1.01], [-0.15, 0.955], [0.05, 0.915], [0.25, 0.897], [0.45, 0.893], [0.6, 0.912], [0.75, 0.955], [0.85, 1.02], [0.93, 1.11]]),
    width: profile([[-0.86, 0.09], [-0.75, 0.16], [-0.6, 0.21], [-0.45, 0.25], [-0.3, 0.28], [-0.15, 0.295], [0.05, 0.295], [0.25, 0.28], [0.45, 0.255], [0.6, 0.235], [0.75, 0.21], [0.85, 0.18], [0.93, 0.13]]),
    egg: profile([[-0.86, 0.1], [-0.5, 0.1], [-0.3, 0.04], [0.0, 0.03], [0.25, 0.1], [0.45, 0.2], [0.7, 0.25], [0.93, 0.2]]),
  }));
  // withers: thin ridge of the thoracic spinous processes
  P(new RoundCone({ name: 'withers', a: [0.2, 1.545, 0], b: [0.56, 1.57, 0], ra: 0.05, rb: 0.055, squash: 0.55, k: 0.09, attach: trunkAttach }));
  // long back muscles either side of the spine
  for (const { s } of SIDES) {
    P(new RoundCone({ name: 'longissimus', a: [0.3, 1.49, 0.075 * s], b: [-0.32, 1.5, 0.08 * s], ra: 0.065, rb: 0.065, squash: 0.8, k: 0.07, attach: trunkAttach }));
  }

  // ===== hindquarters =====
  const hindChain = (s) => polyAttach(
    [[-0.5, 1.56, 0.1 * s], [-0.57, 1.26, 0.2 * s], [-0.4, 0.95, 0.215 * s], [-0.635, 0.555, 0.155 * s], [-0.64, 0.185, 0.145 * s]],
    ['pelvis', 'femur' + (s > 0 ? 'R' : 'L'), 'tibia' + (s > 0 ? 'R' : 'L'), 'cannonH' + (s > 0 ? 'R' : 'L')],
    [0.06, 0.09, 0.07, 0.04, 0.03],
  );
  for (const { s, n } of SIDES) {
    const hc = hindChain(s);
    // gluteal mass / croup
    P(new Ellipsoid({ name: 'gluteal', c: [-0.6, 1.41, 0.1 * s], r: [0.27, 0.17, 0.14], dir: [1, -0.15, 0], k: 0.09, bone: 'pelvis' }));
    // point of hip (tuber coxae)
    P(new Ellipsoid({ name: 'tuberCoxae', c: [-0.41, 1.44, 0.21 * s], r: [0.06, 0.04, 0.04], dir: [1, 0.3, 0.2 * s], k: 0.1, bone: 'pelvis' }));
    // thigh: biceps femoris / quadriceps
    P(new Ellipsoid({ name: 'thigh', c: [-0.53, 1.13, 0.2 * s], r: [0.28, 0.2, 0.105], dir: [0.42, -0.9, 0.04 * s], up: [1, 0.4, 0], k: 0.1, attach: hc }));
    // hamstrings: rear contour from the point of buttock to the gaskin
    PS(tube([[-0.82, 1.34, 0.085 * s], [-0.8, 1.12, 0.11 * s], [-0.75, 0.97, 0.13 * s]], [0.085, 0.078, 0.042], { name: 'hamstring', k: 0.1, squash: 0.95, attach: hc }));
    // stifle
    P(new Ellipsoid({ name: 'stifle', c: [-0.33, 1.0, 0.215 * s], r: [0.08, 0.06, 0.055], dir: [0.3, -1, 0], k: 0.06, attach: hc }));
    // stifle fold of skin into the flank
    P(new Ellipsoid({ name: 'flankFold', c: [-0.3, 1.06, 0.165 * s], r: [0.11, 0.07, 0.07], dir: [1, 0.2, 0], k: 0.08, attach: hc }));
    // gaskin (second thigh)
    P(new RoundCone({ name: 'gaskin', a: [-0.47, 0.93, 0.19 * s], b: [-0.62, 0.63, 0.158 * s], ra: 0.1, rb: 0.052, squash: 0.62, k: 0.06, bone: 'tibia' + n }));
    P(new RoundCone({ name: 'gastrocnemius', a: [-0.56, 0.9, 0.182 * s], b: [-0.69, 0.71, 0.158 * s], ra: 0.07, rb: 0.03, squash: 0.7, k: 0.05, bone: 'tibia' + n }));
    // calcaneal tendon & point of hock
    P(new RoundCone({ name: 'achilles', a: [-0.69, 0.77, 0.156 * s], b: [-0.718, 0.645, 0.153 * s], ra: 0.022, rb: 0.026, squash: 0.65, k: 0.03, bone: 'tibia' + n }));
    P(new Sphere({ name: 'pointOfHock', c: [-0.712, 0.627, 0.153 * s], r: 0.031, k: 0.025, bone: 'cannonH' + n }));
    // hock joint
    P(new RoundBox({ name: 'hock', c: [-0.648, 0.565, 0.155 * s], h: [0.058, 0.06, 0.043], r: 0.032, dir: [1, 0.15, 0], k: 0.03, attach: polyAttach([[-0.4, 0.95, 0], [-0.635, 0.555, 0], [-0.64, 0.3, 0]], ['tibia' + n, 'cannonH' + n], [0.03, 0.035, 0.03]) }));
    // hind cannon + flexor tendons
    P(new RoundCone({ name: 'cannonH', a: [-0.645, 0.51, 0.152 * s], b: [-0.64, 0.215, 0.145 * s], ra: 0.035, rb: 0.031, squash: 0.78, k: 0.03, bone: 'cannonH' + n }));
    P(new RoundCone({ name: 'tendonH', a: [-0.674, 0.49, 0.152 * s], b: [-0.672, 0.225, 0.145 * s], ra: 0.021, rb: 0.022, squash: 0.72, k: 0.02, bone: 'cannonH' + n }));
    // hind fetlock, ergot, pastern, hoof
    const lowerH = polyAttach([[-0.64, 0.4, 0], [-0.64, 0.185, 0], [-0.58, 0.07, 0], [-0.52, 0.0, 0]], ['cannonH' + n, 'pasternH' + n, 'hoofH' + n], [0.03, 0.03, 0.012, 0.01]);
    P(new Ellipsoid({ name: 'fetlockH', c: [-0.646, 0.186, 0.145 * s], r: [0.056, 0.051, 0.045], dir: [1, 0.2, 0], k: 0.03, attach: lowerH }));
    P(new Sphere({ name: 'ergotH', c: [-0.69, 0.163, 0.145 * s], r: 0.021, k: 0.03, bone: 'pasternH' + n }));
    P(new RoundCone({ name: 'pasternH', a: [-0.636, 0.173, 0.145 * s], b: [-0.592, 0.077, 0.145 * s], ra: 0.037, rb: 0.037, squash: 0.92, k: 0.02, attach: lowerH }));
    P(new Hoof({ name: 'hoofH', tag: 'hoof', c: [-0.553, 0, 0.145 * s], len: 0.062, wid: 0.057, toeH: 0.085, heelH: 0.038, angle: 56 * deg, flare: 0.24, k: 0.014, bone: 'hoofH' + n }));
  }

  // ===== forehand =====
  for (const { s, n } of SIDES) {
    const lowerF = polyAttach(
      [[0.565, 0.93, 0], [0.585, 0.5, 0], [0.59, 0.175, 0], [0.665, 0.07, 0], [0.75, 0.0, 0]],
      ['radius' + n, 'cannonF' + n, 'pasternF' + n, 'hoofF' + n],
      [0.03, 0.04, 0.03, 0.012, 0.01],
    );
    // shoulder blade with its muscles
    P(new Ellipsoid({ name: 'scapula', c: [0.635, 1.33, 0.16 * s], r: [0.26, 0.12, 0.055], dir: [0.593, -0.805, 0.05 * s], up: [1, 0.6, 0], k: 0.14, bone: 'scap' + n }));
    // point of shoulder
    P(new Ellipsoid({ name: 'pointOfShoulder', c: [0.83, 1.14, 0.155 * s], r: [0.075, 0.062, 0.058], dir: [0.4, -1, 0], k: 0.08, bone: 'humerus' + n }));
    // triceps mass behind the shoulder, above the elbow
    P(new Ellipsoid({ name: 'triceps', c: [0.625, 1.07, 0.165 * s], r: [0.15, 0.115, 0.075], dir: [1, -0.45, 0], k: 0.11, bone: 'humerus' + n }));
    // arm (humerus + biceps)
    P(new RoundCone({ name: 'arm', a: [0.79, 1.12, 0.175 * s], b: [0.59, 0.95, 0.168 * s], ra: 0.075, rb: 0.066, k: 0.06, bone: 'humerus' + n }));
    // elbow (olecranon)
    P(new Ellipsoid({ name: 'olecranon', c: [0.517, 0.99, 0.16 * s], r: [0.052, 0.06, 0.046], dir: [1, 0.6, 0], k: 0.07, bone: 'radius' + n }));
    // breast (pectorals)
    P(new Ellipsoid({ name: 'pectoral', c: [0.805, 1.07, 0.075 * s], r: [0.12, 0.085, 0.072], dir: [0.35, -1, 0], k: 0.1, bone: 'chest' }));
    // forearm + its muscle bellies
    P(new RoundCone({ name: 'forearm', a: [0.57, 0.92, 0.16 * s], b: [0.585, 0.56, 0.148 * s], ra: 0.076, rb: 0.045, squash: 0.82, k: 0.05, attach: lowerF }));
    P(new Ellipsoid({ name: 'extensor', c: [0.607, 0.78, 0.155 * s], r: [0.15, 0.05, 0.05], dir: [0.05, 1, 0], up: [1, 0, 0], k: 0.04, attach: lowerF }));
    P(new Ellipsoid({ name: 'flexor', c: [0.535, 0.79, 0.158 * s], r: [0.14, 0.046, 0.05], dir: [-0.05, 1, 0], up: [1, 0, 0], k: 0.04, attach: lowerF }));
    // knee (carpus) + accessory carpal bone
    P(new RoundBox({ name: 'knee', c: [0.585, 0.505, 0.145 * s], h: [0.044, 0.048, 0.041], r: 0.03, k: 0.04, attach: lowerF }));
    P(new Sphere({ name: 'accessoryCarpal', c: [0.536, 0.52, 0.145 * s], r: 0.025, k: 0.025, attach: lowerF }));
    // front cannon + tendons
    P(new RoundCone({ name: 'cannonF', a: [0.586, 0.46, 0.145 * s], b: [0.59, 0.21, 0.14 * s], ra: 0.034, rb: 0.031, squash: 0.78, k: 0.03, attach: lowerF }));
    P(new RoundCone({ name: 'tendonF', a: [0.556, 0.455, 0.145 * s], b: [0.557, 0.22, 0.14 * s], ra: 0.021, rb: 0.022, squash: 0.72, k: 0.02, attach: lowerF }));
    // fetlock, ergot, pastern, hoof
    P(new Ellipsoid({ name: 'fetlockF', c: [0.584, 0.178, 0.14 * s], r: [0.058, 0.052, 0.046], dir: [1, -0.2, 0], k: 0.03, attach: lowerF }));
    P(new Sphere({ name: 'ergotF', c: [0.541, 0.155, 0.14 * s], r: 0.021, k: 0.03, bone: 'pasternF' + n }));
    P(new RoundCone({ name: 'pasternF', a: [0.598, 0.166, 0.14 * s], b: [0.654, 0.074, 0.14 * s], ra: 0.038, rb: 0.039, squash: 0.92, k: 0.02, attach: lowerF }));
    P(new Hoof({ name: 'hoofF', tag: 'hoof', c: [0.695, 0, 0.14 * s], len: 0.066, wid: 0.063, toeH: 0.088, heelH: 0.04, angle: 53 * deg, flare: 0.24, k: 0.014, bone: 'hoofF' + n }));
  }

  // ===== neck =====
  const neckAttach = polyAttach(
    [[0.36, 1.36, 0], [0.6, 1.4, 0], [0.8, 1.5, 0], [0.96, 1.64, 0], [1.08, 1.77, 0], [1.16, 1.88, 0], [1.3, 2.0, 0]],
    ['chest', 'neck0', 'neck1', 'neck2', 'neck3', 'head'],
    [0.05, 0.08, 0.08, 0.07, 0.06, 0.05, 0.04],
  );
  {
    const crest = [[0.55, 1.6], [0.72, 1.66], [0.88, 1.75], [1.02, 1.84], [1.13, 1.915], [1.2, 1.965]];
    const throat = [[0.9, 1.08], [0.97, 1.24], [1.02, 1.4], [1.05, 1.54], [1.08, 1.66], [1.115, 1.75]];
    const halfW = [0.2, 0.158, 0.118, 0.098, 0.084, 0.074];
    const pts = [], rad = [], sq = [];
    for (let i = 0; i < crest.length; i++) {
      const c = [(crest[i][0] + throat[i][0]) / 2, (crest[i][1] + throat[i][1]) / 2, 0];
      const r = 0.5 * Math.hypot(crest[i][0] - throat[i][0], crest[i][1] - throat[i][1]) * 0.96;
      pts.push(c); rad.push(r); sq.push(halfW[i] / r);
    }
    PS(tube(pts, rad, { name: 'neck', squash: sq, k: 0.04, attach: neckAttach }));
    // crest (nuchal ligament + fat)
    PS(tube([[0.6, 1.585, 0], [0.8, 1.68, 0], [0.98, 1.79, 0], [1.14, 1.9, 0]], [0.05, 0.065, 0.06, 0.05], { name: 'crest', squash: 0.62, k: 0.08, attach: neckAttach }));
    for (const { s } of SIDES) {
      // brachiocephalicus: from the point of shoulder up the lower neck to the jaw
      PS(tube([[0.83, 1.17, 0.11 * s], [0.97, 1.4, 0.09 * s], [1.045, 1.56, 0.078 * s], [1.095, 1.68, 0.066 * s]], [0.062, 0.056, 0.048, 0.04], { name: 'brachioceph', k: 0.09, attach: neckAttach }));
    }
  }

  // ===== head (built in the head frame) =====
  const hb = { bone: 'head' };
  const E = (name, c, r, dir, extra = {}) => P(new Ellipsoid({ name, c: H.at(...c), r: r.map((x) => x * H.S), frame: frameFrom(H.dir(...dir), extra.up ? H.dir(...extra.up) : H.V), ...hb, ...extra }));
  // cranium (braincase behind the eyes)
  E('cranium', [0.085, -0.075, 0], [0.105, 0.085, 0.09], [1, 0, 0], { k: 0.05 });
  // broad flat forehead between the orbits
  E('forehead', [0.16, -0.032, 0], [0.1, 0.034, 0.1], [1, 0, 0], { k: 0.04 });
  // nasal bones: top of the face, straight profile
  P(new RoundCone({ name: 'nasal', a: H.at(0.13, -0.06, 0), b: H.at(0.52, -0.052, 0), ra: 0.062 * H.S, rb: 0.05 * H.S, squash: 1.55, squashAxis: [0, 0, 1], k: 0.05, ...hb }));
  // upper jaw (maxilla, cheek teeth) below the facial crest
  P(new RoundCone({ name: 'maxilla', a: H.at(0.2, -0.13, 0), b: H.at(0.49, -0.1, 0), ra: 0.08 * H.S, rb: 0.056 * H.S, squash: 1.12, k: 0.05, ...hb }));
  // muzzle, lips, chin
  E('muzzle', [0.525, -0.085, 0], [0.07, 0.074, 0.068], [1, 0, 0], { k: 0.04, tag: 'skin' });
  E('upperLip', [0.578, -0.11, 0], [0.036, 0.05, 0.06], [1, -0.25, 0], { k: 0.025, tag: 'skin' });
  E('lowerLip', [0.545, -0.152, 0], [0.046, 0.027, 0.041], [1, -0.25, 0], { k: 0.02, tag: 'skin' });
  E('chin', [0.5, -0.17, 0], [0.042, 0.031, 0.034], [1, -0.4, 0], { k: 0.025, tag: 'skin' });
  for (const { s } of SIDES) {
    // orbit: bony ring around the eye + supraorbital ridge
    E('orbit', [0.2, -0.04, 0.086 * s], [0.052, 0.042, 0.032], [1, 0.1, 0], { k: 0.03 });
    E('brow', [0.19, -0.014, 0.083 * s], [0.046, 0.018, 0.03], [1, 0, 0], { k: 0.03 });
    E('eyeLids', [0.205, -0.041, 0.096 * s], [0.036, 0.027, 0.022], [1, 0.18, 0], { k: 0.018, tag: 'eyeskin' });
    E('eyeOpening', [0.206, -0.041, 0.112 * s], [0.03, 0.0145, 0.02], [1, 0.2, 0], { op: 'sub', k: 0.011, tag: 'eyeskin' });
    // jowl (masseter) and the round angle of the jaw
    E('jowl', [0.205, -0.175, 0.07 * s], [0.105, 0.1, 0.04], [1, 0, 0], { k: 0.035 });
    E('jawAngle', [0.125, -0.235, 0.06 * s], [0.07, 0.05, 0.035], [1, 0.4, 0], { k: 0.035 });
    // mandible branch to the chin
    P(new RoundCone({ name: 'mandible', a: H.at(0.2, -0.255, 0.055 * s), b: H.at(0.49, -0.16, 0.025 * s), ra: 0.032 * H.S, rb: 0.022 * H.S, k: 0.035, ...hb }));
    // facial crest (zygomatic ridge) running forward from below the eye
    P(new RoundCone({ name: 'facialCrest', a: H.at(0.2, -0.088, 0.09 * s), b: H.at(0.34, -0.104, 0.077 * s), ra: 0.012 * H.S, rb: 0.008 * H.S, k: 0.03, ...hb }));
    // nostril: alar wing + crescent opening
    E('ala', [0.532, -0.046, 0.052 * s], [0.06, 0.034, 0.03], [1, 0.25, 0.15 * s], { k: 0.022, tag: 'skin' });
    E('nostril', [0.54, -0.047, 0.071 * s], [0.052, 0.017, 0.024], [1, 0.36, 0.32 * s], { op: 'sub', k: 0.01, tag: 'skin' });
    // ear base
    E('earBase', [0.01, -0.012, 0.055 * s], [0.035, 0.03, 0.03], [-0.6, 0.8, 0.2 * s], { k: 0.03 });
  }
  // ===== tail dock =====
  const tailPts = [[-0.75, 1.495, 0], [-0.845, 1.415, 0], [-0.9, 1.32, 0], [-0.935, 1.2, 0], [-0.952, 1.085, 0], [-0.96, 0.98, 0]];
  const tailAttach = polyAttach(tailPts, ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'], 0.03);
  const tailRad = [0.056, 0.05, 0.043, 0.036, 0.03, 0.022];
  const tailPrims = tube(tailPts, tailRad, { name: 'dock', squash: 0.9, k: 0.015, attach: (x, y, z, out, sc) => tailAttach(x, y, z, out, sc) });
  tailPrims[0].k = 0.06;
  // the first segment blends into the croup: let the pelvis share it
  tailPrims[0].attach = (x, y, z, out, sc) => {
    const t = smooth01(-0.74, -0.8, x);
    out.pelvis = (out.pelvis || 0) + (1 - t) * sc;
    tailAttach(x, y, z, out, sc * t);
  };
  PS(tailPrims);

  return { prims, tailPts, tailRad };
}

// Landmarks used by the rig, the hair and the eyes/ears.
export function landmarks() {
  const H = HEAD;
  const L = { eyes: [], ears: [] };
  for (const { s, n } of SIDES) {
    L.eyes.push({ side: n, s, c: H.at(0.206, -0.041, 0.088 * s), r: 0.027 * H.S, look: v3.norm(H.dir(0.25, 0.05, 1 * s)) });
    L.ears.push({
      side: n, s,
      base: H.at(0.012, -0.004, 0.058 * s),
      axis: v3.norm(H.dir(-0.7, 0.74, 0.28 * s)),
      open: v3.norm(H.dir(0.5, 0.86, 0.55 * s)),
    });
  }
  L.forelockRoot = [H.at(-0.005, 0.0, -0.035), H.at(-0.005, 0.0, 0.035), H.at(0.03, 0.005, 0)];
  L.hooves = {};
  for (const { s, n } of SIDES) {
    L.hooves['F' + n] = { ground: [0.695, 0, 0.14 * s], toe: [0.761, 0, 0.14 * s], heel: [0.629, 0, 0.14 * s] };
    L.hooves['H' + n] = { ground: [-0.553, 0, 0.145 * s], toe: [-0.491, 0, 0.145 * s], heel: [-0.615, 0, 0.145 * s] };
  }
  // everything above is in design space: warp to final space
  const W = WARP.p;
  for (const e of L.eyes) e.c = W(e.c);
  for (const e of L.ears) e.base = W(e.base);
  L.forelockRoot = L.forelockRoot.map(W);
  for (const k in L.hooves) for (const kk of ['ground', 'toe', 'heel']) L.hooves[k][kk] = W(L.hooves[k][kk]);
  return L;
}
