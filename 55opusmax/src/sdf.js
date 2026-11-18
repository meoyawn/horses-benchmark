// Signed-distance primitives used to sculpt the horse.
// Everything here is written from scratch; hot paths avoid allocations.

export const OP_ADD = 0;
export const OP_SUB = 1;

export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}

export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

// ---------- small vector helpers (array based, used only at build time) ----------
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  mirrorZ: (a) => [a[0], a[1], -a[2]],
};

// Orthonormal frame from a primary axis and an "up" hint.
export function frameFrom(dir, upHint = [0, 1, 0]) {
  const X = v3.norm(dir);
  let up = upHint;
  if (Math.abs(v3.dot(X, v3.norm(up))) > 0.98) up = Math.abs(X[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const Z = v3.norm(v3.cross(X, up));
  const Y = v3.cross(Z, X);
  return { X, Y, Z };
}

// ---------- primitive base ----------
let primCounter = 0;

class Prim {
  constructor(o) {
    this.id = primCounter++;
    this.op = o.op === 'sub' ? OP_SUB : OP_ADD;
    this.k = o.k ?? 0.03; // smooth blend radius
    this.bone = o.bone ?? null; // single bone attachment
    this.attach = o.attach ?? null; // function(x,y,z,out) for multi-bone weighting
    this.tag = o.tag ?? null;
    this.skin = o.skin ?? null; // skin weight falloff override
    this.name = o.name ?? '';
    this.aabb = [0, 0, 0, 0, 0, 0];
  }
  setAABB(minx, miny, minz, maxx, maxy, maxz) {
    this.aabb[0] = minx; this.aabb[1] = miny; this.aabb[2] = minz;
    this.aabb[3] = maxx; this.aabb[4] = maxy; this.aabb[5] = maxz;
  }
}

export class Sphere extends Prim {
  constructor(o) {
    super(o);
    this.c = o.c; this.r = o.r;
    const [x, y, z] = o.c, r = o.r;
    this.setAABB(x - r, y - r, z - r, x + r, y + r, z + r);
  }
  dist(x, y, z) {
    const c = this.c;
    return Math.hypot(x - c[0], y - c[1], z - c[2]) - this.r;
  }
}

// Oriented ellipsoid (Quilez' bound approximation).
export class Ellipsoid extends Prim {
  constructor(o) {
    super(o);
    this.c = o.c;
    const f = o.frame || frameFrom(o.dir || [1, 0, 0], o.up || [0, 1, 0]);
    this.X = f.X; this.Y = f.Y; this.Z = f.Z;
    this.r = o.r;
    const [rx, ry, rz] = o.r;
    const ext = [0, 1, 2].map((i) => Math.sqrt((f.X[i] * rx) ** 2 + (f.Y[i] * ry) ** 2 + (f.Z[i] * rz) ** 2));
    this.setAABB(o.c[0] - ext[0], o.c[1] - ext[1], o.c[2] - ext[2], o.c[0] + ext[0], o.c[1] + ext[1], o.c[2] + ext[2]);
    this.minR = Math.min(rx, ry, rz);
  }
  dist(x, y, z) {
    const c = this.c, X = this.X, Y = this.Y, Z = this.Z, r = this.r;
    const dx = x - c[0], dy = y - c[1], dz = z - c[2];
    const lx = dx * X[0] + dy * X[1] + dz * X[2];
    const ly = dx * Y[0] + dy * Y[1] + dz * Y[2];
    const lz = dx * Z[0] + dy * Z[1] + dz * Z[2];
    const ax = lx / r[0], ay = ly / r[1], az = lz / r[2];
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax / r[0], by = ay / r[1], bz = az / r[2];
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    if (k1 < 1e-9) return -this.minR;
    return (k0 * (k0 - 1)) / k1;
  }
}

// Tapered capsule (exact round cone), optionally squashed along an axis
// perpendicular to the segment to get an elliptical cross-section.
export class RoundCone extends Prim {
  constructor(o) {
    super(o);
    let a = o.a, b = o.b, ra = o.ra, rb = o.rb ?? o.ra;
    // keep the formula valid: |ra-rb| must stay below the segment length
    const L = v3.len(v3.sub(b, a));
    if (Math.abs(ra - rb) > L * 0.98) {
      if (ra > rb) rb = ra - L * 0.98; else ra = rb - L * 0.98;
    }
    this.a = a; this.b = b; this.ra = ra; this.rb = rb;
    this.ba = v3.sub(b, a);
    this.l2 = v3.dot(this.ba, this.ba);
    this.rr = ra - rb;
    this.a2 = this.l2 - this.rr * this.rr;
    this.il2 = 1 / this.l2;
    this.s = o.squash ?? 1;
    if (this.s !== 1) {
      const d = v3.norm(this.ba);
      let f = o.squashAxis || [0, 0, 1];
      f = v3.sub(f, v3.mul(d, v3.dot(f, d)));
      this.f = v3.norm(f);
      this.sk = 1 / this.s - 1;
    }
    const R = Math.max(ra, rb);
    this.setAABB(
      Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R,
      Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R,
    );
  }
  dist(x, y, z) {
    const a = this.a;
    let px = x - a[0], py = y - a[1], pz = z - a[2];
    if (this.s !== 1) {
      const f = this.f;
      const t = (px * f[0] + py * f[1] + pz * f[2]) * this.sk;
      px += t * f[0]; py += t * f[1]; pz += t * f[2];
    }
    const ba = this.ba, l2 = this.l2, rr = this.rr, a2 = this.a2, il2 = this.il2;
    const yy = px * ba[0] + py * ba[1] + pz * ba[2];
    const zz = yy - l2;
    const qx = px * l2 - ba[0] * yy, qy = py * l2 - ba[1] * yy, qz = pz * l2 - ba[2] * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    let d;
    if (Math.sign(zz) * a2 * z2 > k) d = Math.sqrt(x2 + z2) * il2 - this.rb;
    else if (Math.sign(yy) * a2 * y2 < k) d = Math.sqrt(x2 + y2) * il2 - this.ra;
    else d = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - this.ra;
    return this.s < 1 ? d * this.s : d;
  }
}

// Oriented rounded box.
export class RoundBox extends Prim {
  constructor(o) {
    super(o);
    this.c = o.c;
    const f = o.frame || frameFrom(o.dir || [1, 0, 0], o.up || [0, 1, 0]);
    this.X = f.X; this.Y = f.Y; this.Z = f.Z;
    this.h = o.h; // half sizes
    this.r = o.r ?? 0.01;
    const ext = [0, 1, 2].map((i) => Math.abs(f.X[i]) * o.h[0] + Math.abs(f.Y[i]) * o.h[1] + Math.abs(f.Z[i]) * o.h[2]);
    this.setAABB(o.c[0] - ext[0], o.c[1] - ext[1], o.c[2] - ext[2], o.c[0] + ext[0], o.c[1] + ext[1], o.c[2] + ext[2]);
  }
  dist(x, y, z) {
    const c = this.c, X = this.X, Y = this.Y, Z = this.Z, h = this.h, r = this.r;
    const dx = x - c[0], dy = y - c[1], dz = z - c[2];
    const qx = Math.abs(dx * X[0] + dy * X[1] + dz * X[2]) - (h[0] - r);
    const qy = Math.abs(dx * Y[0] + dy * Y[1] + dz * Y[2]) - (h[1] - r);
    const qz = Math.abs(dx * Z[0] + dy * Z[1] + dz * Z[2]) - (h[2] - r);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }
}

// Monotone-ish cubic (Catmull-Rom) sampling of a 1D profile given as [[x, v], ...] sorted by x.
export function profile(points) {
  const xs = points.map((p) => p[0]);
  const vs = points.map((p) => p[1]);
  const n = xs.length;
  return function (x) {
    if (x <= xs[0]) return vs[0];
    if (x >= xs[n - 1]) return vs[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const x0 = xs[i], x1 = xs[i + 1];
    const t = (x - x0) / (x1 - x0);
    const v0 = vs[i], v1 = vs[i + 1];
    const vm = i > 0 ? vs[i - 1] : v0 - (v1 - v0);
    const xm = i > 0 ? xs[i - 1] : x0 - (x1 - x0);
    const vp = i < n - 2 ? vs[i + 2] : v1 + (v1 - v0);
    const xp = i < n - 2 ? xs[i + 2] : x1 + (x1 - x0);
    // non-uniform Catmull-Rom tangents
    const m0 = ((v1 - vm) / (x1 - xm)) * (x1 - x0);
    const m1 = ((vp - v0) / (xp - x0)) * (x1 - x0);
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * m1;
  };
}

// A body "loft" along the x axis: every x has an elliptical / super-elliptical
// cross-section given by top line, bottom line, half width and an egg factor.
// Profiles are baked into lookup tables for speed.
export class Loft extends Prim {
  constructor(o) {
    super(o);
    this.x0 = o.x0; this.x1 = o.x1;
    const N = 512;
    this.N = N;
    this.top = new Float32Array(N + 1);
    this.bot = new Float32Array(N + 1);
    this.wid = new Float32Array(N + 1);
    this.egg = new Float32Array(N + 1);
    this.pw = o.power ?? 2.0;
    let ymin = 1e9, ymax = -1e9, zmax = 0;
    for (let i = 0; i <= N; i++) {
      const x = o.x0 + ((o.x1 - o.x0) * i) / N;
      this.top[i] = o.top(x); this.bot[i] = o.bot(x); this.wid[i] = o.width(x); this.egg[i] = o.egg ? o.egg(x) : 0;
      ymin = Math.min(ymin, this.bot[i]); ymax = Math.max(ymax, this.top[i]);
      zmax = Math.max(zmax, this.wid[i] * (1 + Math.abs(this.egg[i])));
    }
    this.capK = o.capK ?? 0.04;
    this.setAABB(o.x0, ymin, -zmax, o.x1, ymax, zmax);
  }
  section(x, y, z) {
    let f = ((x - this.x0) / (this.x1 - this.x0)) * this.N;
    if (f < 0) f = 0; else if (f > this.N) f = this.N;
    const i = Math.min(Math.floor(f), this.N - 1);
    const t = f - i;
    const top = this.top[i] + (this.top[i + 1] - this.top[i]) * t;
    const bot = this.bot[i] + (this.bot[i + 1] - this.bot[i]) * t;
    const wid = this.wid[i] + (this.wid[i + 1] - this.wid[i]) * t;
    const egg = this.egg[i] + (this.egg[i + 1] - this.egg[i]) * t;
    const a = (top - bot) * 0.5;
    const yc = (top + bot) * 0.5;
    const dy = y - yc;
    let u = dy / a;
    if (u > 1.5) u = 1.5; else if (u < -1.5) u = -1.5;
    const b = wid * (1 + egg * u);
    // ellipse distance (Quilez approximation) in the (y,z) plane
    const p = this.pw;
    if (p === 2) {
      const ax = dy / a, az = z / b;
      const k0 = Math.sqrt(ax * ax + az * az);
      const bx = ax / a, bz = az / b;
      const k1 = Math.sqrt(bx * bx + bz * bz);
      if (k1 < 1e-9) return -Math.min(a, b);
      return (k0 * (k0 - 1)) / k1;
    }
    // super-ellipse: first order distance f/|grad f|
    const au = Math.abs(dy) / a, av = Math.abs(z) / b;
    const pu = Math.pow(au, p), pv = Math.pow(av, p);
    const S = pu + pv;
    if (S < 1e-12) return -Math.min(a, b);
    const Sr = Math.pow(S, 1 / p);
    const fval = Sr - 1;
    const common = Sr / S; // S^(1/p - 1)
    const gu = (au > 1e-9 ? pu / au : 0) / a;
    const gv = (av > 1e-9 ? pv / av : 0) / b;
    const g = common * Math.sqrt(gu * gu + gv * gv);
    return g > 1e-9 ? fval / g : fval * Math.min(a, b);
  }
  dist(x, y, z) {
    const e = 0.01;
    const d0 = this.section(x, y, z);
    // correct for the slope of the profiles along x (gradient normalisation)
    const gx = (this.section(x + e, y, z) - this.section(x - e, y, z)) / (2 * e);
    let d = d0 / Math.sqrt(1 + gx * gx);
    // cap the ends of the loft
    const cap = Math.max(this.x0 - x, x - this.x1);
    d = smax(d, cap, this.capK);
    return d;
  }
}

// Hoof: an obliquely sheared, slightly flared super-ellipse column cut by the
// ground and by the sloping coronary band.
export class Hoof extends Prim {
  constructor(o) {
    super(o);
    this.c = o.c; // ground centre of the sole
    this.len = o.len; // half length (front-back)
    this.wid = o.wid; // half width
    this.toeH = o.toeH; // coronet height at toe
    this.heelH = o.heelH; // coronet height at heel
    this.slope = 1 / Math.tan(o.angle); // backward shift per unit height
    this.flare = o.flare ?? 0.12;
    this.heelPinch = o.heelPinch ?? 0.15;
    this.fwd = o.fwd || [1, 0, 0];
    this.side = v3.norm(v3.cross(this.fwd, [0, 1, 0]));
    const R = Math.max(o.len, o.wid) + 0.03;
    this.setAABB(o.c[0] - R - 0.05, o.c[1] - 0.01, o.c[2] - R, o.c[0] + R + 0.02, o.c[1] + o.toeH + 0.02, o.c[2] + R);
  }
  raw(x, y, z) {
    const c = this.c, F = this.fwd, S = this.side;
    const dx = x - c[0], dy = y - c[1], dz = z - c[2];
    let lf = dx * F[0] + dz * F[2];
    const ls = dx * S[0] + dz * S[2];
    const h = Math.max(dy, 0);
    lf += h * this.slope; // shear: the column leans back as it rises
    const shrink = 1 - this.flare * (h / this.toeH);
    let a = this.len * shrink;
    let b = this.wid * shrink;
    // heels are a little narrower than the quarters
    if (lf < 0) b *= 1 - this.heelPinch * Math.min(1, -lf / a) ** 2;
    const ax = lf / a, az = ls / b;
    const k0 = Math.sqrt(ax * ax + az * az);
    const bx = ax / a, bz = az / b;
    const k1 = Math.sqrt(bx * bx + bz * bz);
    let d = k1 < 1e-9 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1;
    d *= 0.8; // compensate for the shear stretching distances
    // coronary band: plane through (toe, toeH) and (heel, heelH)
    const t = Math.min(1, Math.max(0, (lf + this.len) / (2 * this.len)));
    const band = this.heelH + (this.toeH - this.heelH) * t;
    d = smax(d, dy - band, 0.012);
    d = smax(d, -dy, 0.009);
    return d;
  }
  dist(x, y, z) {
    return this.raw(x, y, z);
  }
}

// A smooth generalised tube made of chained round cones.
export function tube(points, radii, opts = {}) {
  const prims = [];
  for (let i = 0; i < points.length - 1; i++) {
    const sq = Array.isArray(opts.squash) ? 0.5 * (opts.squash[i] + opts.squash[i + 1]) : opts.squash ?? 1;
    prims.push(
      new RoundCone({
        ...opts,
        a: points[i], b: points[i + 1], ra: radii[i], rb: radii[i + 1],
        squash: sq, k: opts.k ?? 0.02,
        name: (opts.name || 'tube') + i,
      }),
    );
  }
  return prims;
}

// ---------- the scene ----------
export class SDFScene {
  constructor(prims) {
    this.prims = prims;
  }
  // indices of primitives that can influence the field inside the given box
  cull(minx, miny, minz, maxx, maxy, maxz, margin) {
    const out = [];
    for (let i = 0; i < this.prims.length; i++) {
      const p = this.prims[i], b = p.aabb, m = p.k + margin;
      if (b[0] - m > maxx || b[3] + m < minx) continue;
      if (b[1] - m > maxy || b[4] + m < miny) continue;
      if (b[2] - m > maxz || b[5] + m < minz) continue;
      out.push(p);
    }
    return out;
  }
  evalList(list, x, y, z) {
    let d = 1e3;
    for (let i = 0, n = list.length; i < n; i++) {
      const p = list[i];
      const di = p.dist(x, y, z);
      if (p.op === OP_ADD) d = smin(d, di, p.k);
      else d = smax(d, -di, p.k);
    }
    return d;
  }
}
