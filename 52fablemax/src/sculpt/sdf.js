// Implicit-surface sculpting kit.
//
// A model is an ordered list of groups; a group is an ordered list of
// primitives. Primitives are blended inside their group with their own
// smoothing radius, and groups are then blended into the running field. Both
// primitives and groups can be mirrored across the sagittal plane (z = 0).
//
// Distances are first-order normalised (value / |gradient|), so squashed and
// ellipsoidal shapes still blend evenly.

export const ADD = 0;
export const SUB = 1;

const KIND_CONE = 0;
const KIND_ELLIPSOID = 1;

const FAR = 1e3;

/** Cubic polynomial smooth minimum; equals min(a, b) once |a - b| >= k. */
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const diff = a - b;
  const h = k - (diff < 0 ? -diff : diff);
  if (h <= 0) return a < b ? a : b;
  const t = h / k;
  return (a < b ? a : b) - t * t * t * k * (1 / 6);
}

export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

let primCounter = 0;

class Prim {
  constructor(kind) {
    this.id = primCounter++;
    this.kind = kind;
    this.op = ADD;
    this.k = 0.02;
    this.mirror = false;
    this.name = '';
    this.skin = null;     // skinning descriptor (see skinning.js)
    this.reach = 0.03;    // skin influence falloff distance
    this.bound = 0;       // conservative bounding radius around (bx, by, bz)
    this.bx = 0; this.by = 0; this.bz = 0;
    // cone
    this.ax = 0; this.ay = 0; this.az = 0;
    this.ux = 1; this.uy = 0; this.uz = 0;
    this.len = 0; this.r1 = 0; this.r2 = 0;
    this.sn = 0; this.cs = 1; this.lc = 0;
    this.wx = 0; this.wy = 0; this.wz = 0;
    this.gain = 0;        // squash gain (1 / s - 1), 0 = round
    this.g2 = 0;          // 1 / s^2 - 1
    // ellipsoid
    this.cx = 0; this.cy = 0; this.cz = 0;
    this.m00 = 1; this.m01 = 0; this.m02 = 0;
    this.m10 = 0; this.m11 = 1; this.m12 = 0;
    this.m20 = 0; this.m21 = 0; this.m22 = 1;
    this.ix = 1; this.iy = 1; this.iz = 1;
    this.minR = 1;
  }
}

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Rounded cone: the convex hull of two spheres (a, r1) and (b, r2).
 * `squash` = [dirX, dirY, dirZ, factor] flattens the shape along a direction
 * (factor < 1 is thinner, > 1 is wider).
 */
export function cone(a, b, r1, r2, opts = {}) {
  const p = new Prim(KIND_CONE);
  applyCommon(p, opts);
  let bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  if (opts.squash) {
    const w = norm3(opts.squash);
    const s = opts.squash[3];
    p.wx = w[0]; p.wy = w[1]; p.wz = w[2];
    p.gain = 1 / s - 1;
    p.g2 = 1 / (s * s) - 1;
    const t = (bax * w[0] + bay * w[1] + baz * w[2]) * p.gain;
    bax += w[0] * t; bay += w[1] * t; baz += w[2] * t;
  }
  let len = Math.hypot(bax, bay, baz);
  if (len < 1e-6) { len = 1e-6; bax = len; bay = 0; baz = 0; }
  p.ax = a[0]; p.ay = a[1]; p.az = a[2];
  p.ux = bax / len; p.uy = bay / len; p.uz = baz / len;
  p.len = len; p.r1 = r1; p.r2 = r2;
  let sn = (r1 - r2) / len;
  if (sn > 0.999) sn = 0.999;
  if (sn < -0.999) sn = -0.999;
  p.sn = sn;
  p.cs = Math.sqrt(1 - sn * sn);
  p.lc = len * p.cs;
  const grow = opts.squash && opts.squash[3] > 1 ? opts.squash[3] : 1;
  p.bx = (a[0] + b[0]) / 2; p.by = (a[1] + b[1]) / 2; p.bz = (a[2] + b[2]) / 2;
  p.bound = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 + Math.max(r1, r2) * grow;
  return p;
}

/** Sphere shorthand. */
export function ball(c, r, opts = {}) {
  return ellipsoid(c, [r, r, r], opts);
}

/**
 * Ellipsoid with radii `r`, optionally rotated: opts.rot = [rx, ry, rz] Euler
 * angles in degrees applied in Z, then Y, then X order (Z is the lateral axis,
 * so the first angle of interest for side-view shaping is rot[2]).
 */
export function ellipsoid(c, r, opts = {}) {
  const p = new Prim(KIND_ELLIPSOID);
  applyCommon(p, opts);
  p.cx = c[0]; p.cy = c[1]; p.cz = c[2];
  const rot = opts.rot || [0, 0, 0];
  const R = eulerMatrix(rot[0], rot[1], rot[2]);
  // world -> local is the transpose of the local -> world rotation
  p.m00 = R[0]; p.m01 = R[3]; p.m02 = R[6];
  p.m10 = R[1]; p.m11 = R[4]; p.m12 = R[7];
  p.m20 = R[2]; p.m21 = R[5]; p.m22 = R[8];
  p.ix = 1 / r[0]; p.iy = 1 / r[1]; p.iz = 1 / r[2];
  p.minR = Math.min(r[0], r[1], r[2]);
  p.bx = c[0]; p.by = c[1]; p.bz = c[2];
  p.bound = Math.max(r[0], r[1], r[2]);
  return p;
}

function applyCommon(p, opts) {
  if (opts.op !== undefined) p.op = opts.op;
  if (opts.k !== undefined) p.k = opts.k;
  if (opts.mirror !== undefined) p.mirror = opts.mirror;
  if (opts.name !== undefined) p.name = opts.name;
  if (opts.skin !== undefined) p.skin = opts.skin;
  if (opts.reach !== undefined) p.reach = opts.reach;
}

/** Row-major 3x3 for R = Rx(ax) * Ry(ay) * Rz(az), angles in degrees. */
export function eulerMatrix(axDeg, ayDeg, azDeg) {
  const ax = axDeg * Math.PI / 180, ay = ayDeg * Math.PI / 180, az = azDeg * Math.PI / 180;
  const cx = Math.cos(ax), sx = Math.sin(ax);
  const cy = Math.cos(ay), sy = Math.sin(ay);
  const cz = Math.cos(az), sz = Math.sin(az);
  // Rz
  const z = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const y = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const x = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  return mul3(x, mul3(y, z));
}

function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

/** Signed distance estimate from point (x, y, z) to a primitive. */
export function primDist(p, x, y, z) {
  if (p.kind === KIND_CONE) {
    let px = x - p.ax, py = y - p.ay, pz = z - p.az;
    let pw = 0;
    if (p.gain !== 0) {
      pw = px * p.wx + py * p.wy + pz * p.wz;
      const t = pw * p.gain;
      px += p.wx * t; py += p.wy * t; pz += p.wz * t;
      pw += t; // component along w in stretched space
    }
    const u = px * p.ux + py * p.uy + pz * p.uz;
    const pp = px * px + py * py + pz * pz;
    let v2 = pp - u * u;
    if (v2 < 0) v2 = 0;
    const v = Math.sqrt(v2);
    const tau = u * p.cs - v * p.sn;
    let d;
    if (p.gain === 0) {
      if (tau <= 0) return Math.sqrt(pp) - p.r1;
      if (tau >= p.lc) { const du = u - p.len; return Math.sqrt(du * du + v2) - p.r2; }
      return u * p.sn + v * p.cs - p.r1;
    }
    // squashed: also need the gradient component along the squash direction
    const uw = p.ux * p.wx + p.uy * p.wy + p.uz * p.wz;
    let gw;
    if (tau <= 0) {
      const l = Math.sqrt(pp);
      d = l - p.r1;
      gw = l > 1e-9 ? pw / l : 0;
    } else if (tau >= p.lc) {
      const du = u - p.len;
      const l = Math.sqrt(du * du + v2);
      d = l - p.r2;
      gw = l > 1e-9 ? (pw - p.len * uw) / l : 0;
    } else {
      d = u * p.sn + v * p.cs - p.r1;
      gw = p.sn * uw + (v > 1e-9 ? p.cs * (pw - u * uw) / v : 0);
    }
    return d / Math.sqrt(1 + p.g2 * gw * gw);
  }
  // ellipsoid
  const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
  const lx = (p.m00 * dx + p.m01 * dy + p.m02 * dz) * p.ix;
  const ly = (p.m10 * dx + p.m11 * dy + p.m12 * dz) * p.iy;
  const lz = (p.m20 * dx + p.m21 * dy + p.m22 * dz) * p.iz;
  const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
  const gx = lx * p.ix, gy = ly * p.iy, gz = lz * p.iz;
  const k1 = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (k1 < 1e-9) return -p.minR;
  return k0 * (k0 - 1) / k1;
}

export class Group {
  constructor(name, opts = {}) {
    this.name = name;
    this.op = opts.op ?? ADD;
    this.k = opts.k ?? 0.04;
    this.mirror = opts.mirror ?? false;
    this.prims = [];
  }
  add(...prims) {
    for (const p of prims) this.prims.push(p);
    return this;
  }
}

// Entry of a compiled program: which primitives of a group matter locally.
// `r` / `l` are arrays of { p, m } where m bit 0 = evaluate as is, bit 1 =
// evaluate the mirrored copy.
function evalPrims(list, x, y, z) {
  let f = FAR;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const p = it.p;
    let d;
    if (it.m === 1) d = primDist(p, x, y, z);
    else if (it.m === 2) d = primDist(p, x, y, -z);
    else d = smin(primDist(p, x, y, z), primDist(p, x, y, -z), p.k);
    f = p.op === ADD ? smin(f, d, p.k) : -smin(-f, d, p.k);
  }
  return f;
}

export function evalProgram(prog, x, y, z) {
  let f = FAR;
  for (let i = 0; i < prog.length; i++) {
    const e = prog[i];
    const g = e.g;
    let d;
    if (g.mirror) {
      if (e.r !== null && e.l !== null) d = smin(evalPrims(e.r, x, y, z), evalPrims(e.l, x, y, -z), g.k);
      else if (e.r !== null) d = evalPrims(e.r, x, y, z);
      else d = evalPrims(e.l, x, y, -z);
    } else {
      d = evalPrims(e.r, x, y, z);
    }
    f = g.op === ADD ? smin(f, d, g.k) : -smin(-f, d, g.k);
  }
  return f;
}

/**
 * Builds the list of groups / primitives that can influence the field inside
 * a ball of radius `radius` around (x, y, z). `margin` widens the selection.
 */
export function cullProgram(groups, x, y, z, radius, margin) {
  const prog = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    let r = null, l = null;
    const prims = g.prims;
    for (let pi = 0; pi < prims.length; pi++) {
      const p = prims[pi];
      const T = radius + p.k + g.k + margin;
      if (g.mirror) {
        if (near(p, x, y, z, T) && primDist(p, x, y, z) < T) (r ??= []).push({ p, m: 1 });
        if (near(p, x, y, -z, T) && primDist(p, x, y, -z) < T) (l ??= []).push({ p, m: 1 });
      } else if (p.mirror) {
        let m = 0;
        if (near(p, x, y, z, T) && primDist(p, x, y, z) < T) m |= 1;
        if (near(p, x, y, -z, T) && primDist(p, x, y, -z) < T) m |= 2;
        if (m) (r ??= []).push({ p, m });
      } else if (near(p, x, y, z, T) && primDist(p, x, y, z) < T) {
        (r ??= []).push({ p, m: 1 });
      }
    }
    if (r !== null || l !== null) prog.push({ g, r, l });
  }
  return prog;
}

function near(p, x, y, z, T) {
  const dx = x - p.bx, dy = y - p.by, dz = z - p.bz;
  const reach = p.bound + T;
  return dx * dx + dy * dy + dz * dz < reach * reach;
}

/** Program that evaluates every primitive (no culling). */
export function fullProgram(groups) {
  const prog = [];
  for (const g of groups) {
    if (g.mirror) {
      const list = g.prims.map((p) => ({ p, m: 1 }));
      prog.push({ g, r: list, l: list });
    } else {
      prog.push({ g, r: g.prims.map((p) => ({ p, m: p.mirror ? 3 : 1 })), l: null });
    }
  }
  return prog;
}

/**
 * Visits every additive primitive of a program with its distance at a point.
 * visit(prim, distance, mirrored)
 */
export function visitPrims(prog, x, y, z, visit) {
  for (let i = 0; i < prog.length; i++) {
    const e = prog[i];
    if (e.g.op !== ADD) continue;
    if (e.r !== null) {
      for (let j = 0; j < e.r.length; j++) {
        const it = e.r[j];
        const p = it.p;
        if (p.op !== ADD) continue;
        if (it.m & 1) visit(p, primDist(p, x, y, z), false);
        if (it.m & 2) visit(p, primDist(p, x, y, -z), true);
      }
    }
    if (e.l !== null) {
      for (let j = 0; j < e.l.length; j++) {
        const p = e.l[j].p;
        if (p.op !== ADD) continue;
        visit(p, primDist(p, x, y, -z), true);
      }
    }
  }
}
