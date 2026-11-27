// Implicit-surface sculpting: the horse body is described as a smooth blend of
// simple volumes (tapered capsules and ellipsoids), then turned into a triangle
// mesh with a "surface nets" polygoniser. Every volume is tied to a bone, so the
// same description also yields the skinning weights.

const DEG = Math.PI / 180;

function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}

// Distance from point to a primitive. Writes the axis parameter (0..1) to `out.t`.
const out = { t: 0 };
function primDist(q, x, y, z) {
  if (q.type === 0) {
    // Tapered capsule, optionally flattened sideways by `sz`.
    const px = x - q.ax, py = y - q.ay, pz = (z - q.az) / q.sz;
    let t = (px * q.dx + py * q.dy + pz * q.dz) * q.invLen2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.t = t;
    const cx = px - q.dx * t, cy = py - q.dy * t, cz = pz - q.dz * t;
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const d = len - (q.ra + (q.rb - q.ra) * t);
    if (q.sz === 1 || len < 1e-9) return d;
    const gz = cz / len; // first-order correction for the sideways squash
    return d / Math.sqrt(1 + gz * gz * (1 / (q.sz * q.sz) - 1));
  }
  // Ellipsoid (first-order distance estimate), rotated by a 3x3 matrix.
  const px = x - q.cx, py = y - q.cy, pz = z - q.cz;
  const lx = q.m[0] * px + q.m[1] * py + q.m[2] * pz;
  const ly = q.m[3] * px + q.m[4] * py + q.m[5] * pz;
  const lz = q.m[6] * px + q.m[7] * py + q.m[8] * pz;
  out.t = Math.min(1, Math.max(0, 0.5 + 0.5 * lx * q.irx));
  const ux = lx * q.irx, uy = ly * q.iry, uz = lz * q.irz;
  const k0 = Math.sqrt(ux * ux + uy * uy + uz * uz);
  const vx = ux * q.irx, vy = uy * q.iry, vz = uz * q.irz;
  const k1 = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (k1 < 1e-9) return -q.rmin;
  return (k0 * (k0 - 1)) / k1;
}

function evalField(list, x, y, z) {
  let f = 1e9;
  for (let n = 0; n < list.length; n++) {
    const q = list[n];
    const d = primDist(q, x, y, z);
    f = q.sub ? -smin(-f, d, q.k) : smin(f, d, q.k);
  }
  return f;
}

export class Sculpt {
  constructor(boneIndex) {
    this.boneIndex = boneIndex; // name -> index
    this.prims = [];
  }

  _common(q, bones, o = {}) {
    const names = Array.isArray(bones) ? bones : [bones];
    q.bones = names.map((n) => {
      if (!(n in this.boneIndex)) throw new Error('Unknown bone ' + n);
      return this.boneIndex[n];
    });
    q.k = o.k ?? 0.05; // blend radius with what is already there
    q.sub = !!o.sub; // carve instead of add
    q.skin = o.skin ?? 0.035; // softness of skin-weight falloff
    q.side = o.side ?? 0; // +1 / -1: only influences that side of the body
    q.tag = o.tag || '';
    this.prims.push(q);
    return q;
  }

  /** Tapered capsule from a to b. */
  cone(bones, a, b, ra, rb, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], sz = o.sz ?? 1;
    const dz = ((b[2] || 0) - (a[2] || 0)) / sz;
    const q = {
      type: 0, ax: a[0], ay: a[1], az: a[2] || 0, dx, dy, dz, sz, ra, rb,
      invLen2: 1 / Math.max(dx * dx + dy * dy + dz * dz, 1e-12),
      bx: (a[0] + b[0]) / 2, by: (a[1] + b[1]) / 2, bz: ((a[2] || 0) + (b[2] || 0)) / 2,
      br: Math.hypot(dx, dy, dz * sz) / 2 + Math.max(ra, rb),
    };
    return this._common(q, bones, o);
  }

  /** Ellipsoid with radii r, rotated by rz (about Z), then ry, then rx — degrees. */
  ellipsoid(bones, c, r, rot = [0, 0, 0], o = {}) {
    const [ax, ay, az] = [rot[0] * DEG, rot[1] * DEG, rot[2] * DEG]; // x, y, z angles
    const cx_ = Math.cos(ax), sx_ = Math.sin(ax), cy_ = Math.cos(ay), sy_ = Math.sin(ay);
    const cz_ = Math.cos(az), sz_ = Math.sin(az);
    // R = Rz * Ry * Rx ; we need R^T (world -> local), stored row-major.
    const R = [
      cz_ * cy_, cz_ * sy_ * sx_ - sz_ * cx_, cz_ * sy_ * cx_ + sz_ * sx_,
      sz_ * cy_, sz_ * sy_ * sx_ + cz_ * cx_, sz_ * sy_ * cx_ - cz_ * sx_,
      -sy_, cy_ * sx_, cy_ * cx_,
    ];
    const m = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    const q = {
      type: 1, cx: c[0], cy: c[1], cz: c[2] || 0, m,
      irx: 1 / r[0], iry: 1 / r[1], irz: 1 / r[2], rmin: Math.min(r[0], r[1], r[2]),
      bx: c[0], by: c[1], bz: c[2] || 0, br: Math.max(r[0], r[1], r[2]),
    };
    return this._common(q, bones, o);
  }

  ball(bones, c, r, o = {}) {
    return this.ellipsoid(bones, c, [r, r, r], [0, 0, 0], o);
  }

  field(x, y, z) {
    return evalField(this.prims, x, y, z);
  }

  /**
   * Polygonise. The sculpt must be mirror-symmetric about z = 0; only one half
   * is evaluated. Returns typed arrays ready for a skinned BufferGeometry.
   */
  mesh({ min, max, cell }) {
    const h = cell, B = 8;
    const nx = Math.ceil((max[0] - min[0]) / h) + 1;
    const ny = Math.ceil((max[1] - min[1]) / h) + 1;
    const zh = Math.ceil(max[2] / h);
    const nz = 2 * zh + 1;
    const X = (i) => min[0] + i * h, Y = (j) => min[1] + j * h, Z = (k) => (k - zh) * h;
    const val = new Float32Array(nx * ny * nz).fill(1);
    const at = (i, j, k) => i + nx * (j + ny * k);

    // Per-block lists of the primitives that can matter there.
    const bx = Math.ceil(nx / B), by = Math.ceil(ny / B), bz = Math.ceil(nz / B);
    const lists = new Array(bx * by * bz);
    const blockR = (B * h * Math.sqrt(3)) / 2;
    for (let c = 0; c < bz; c++) for (let b = 0; b < by; b++) for (let a = 0; a < bx; a++) {
      const mx = X(a * B + B / 2), my = Y(b * B + B / 2), mz = Z(c * B + B / 2);
      const list = [];
      let solid = false;
      for (const q of this.prims) {
        const reach = q.br + blockR + q.k + 0.03;
        if (Math.hypot(mx - q.bx, my - q.by, mz - q.bz) < reach) {
          list.push(q);
          if (!q.sub) solid = true;
        }
      }
      lists[a + bx * (b + by * c)] = solid ? list : null;
    }
    const listAt = (x, y, z) => {
      const a = Math.min(bx - 1, Math.max(0, Math.floor((x - min[0]) / (h * B))));
      const b = Math.min(by - 1, Math.max(0, Math.floor((y - min[1]) / (h * B))));
      const c = Math.min(bz - 1, Math.max(0, Math.floor((z + zh * h) / (h * B))));
      return lists[a + bx * (b + by * c)];
    };

    // Sample the right half (z >= 0), mirror into the left half.
    for (let k = zh; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const list = lists[((i / B) | 0) + bx * (((j / B) | 0) + by * ((k / B) | 0))];
      if (!list) continue;
      const v = evalField(list, X(i), Y(j), Z(k));
      val[at(i, j, k)] = v;
      val[at(i, j, 2 * zh - k)] = v;
    }

    // Surface nets: one vertex per cell that the surface crosses.
    const cx = nx - 1, cy = ny - 1, cz = nz - 1;
    const cellVert = new Int32Array(cx * cy * cz).fill(-1);
    const pos = [];
    const cv = new Float32Array(8);
    const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const v = val[at(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))];
        cv[c] = v;
        if (v < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let e = 0; e < 24; e += 2) {
        const c0 = EDGES[e], c1 = EDGES[e + 1], v0 = cv[c0], v1 = cv[c1];
        if (v0 < 0 === v1 < 0) continue;
        const t = v0 / (v0 - v1);
        sx += (c0 & 1) + t * ((c1 & 1) - (c0 & 1));
        sy += ((c0 >> 1) & 1) + t * (((c1 >> 1) & 1) - ((c0 >> 1) & 1));
        sz += (c0 >> 2) + t * ((c1 >> 2) - (c0 >> 2));
        n++;
      }
      cellVert[i + cx * (j + cy * k)] = pos.length / 3;
      pos.push(X(i + sx / n), Y(j + sy / n), Z(k + sz / n));
    }

    // One quad per sign-changing lattice edge.
    const idx = [];
    const cellAt = (i, j, k) => cellVert[i + cx * (j + cy * k)];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) { const t = b; b = d; d = t; }
      const d1 = dist2(pos, a, c), d2 = dist2(pos, b, d);
      if (d1 <= d2) idx.push(a, b, c, a, c, d);
      else idx.push(a, b, d, b, c, d);
    };
    for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
      const v0 = val[at(i, j, k)] < 0;
      if (v0 !== val[at(i + 1, j, k)] < 0)
        quad(cellAt(i, j - 1, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i, j - 1, k), !v0);
      if (v0 !== val[at(i, j + 1, k)] < 0)
        quad(cellAt(i - 1, j, k - 1), cellAt(i - 1, j, k), cellAt(i, j, k), cellAt(i, j, k - 1), !v0);
      if (v0 !== val[at(i, j, k + 1)] < 0)
        quad(cellAt(i - 1, j - 1, k), cellAt(i, j - 1, k), cellAt(i, j, k), cellAt(i - 1, j, k), !v0);
    }

    // Snap vertices onto the true surface, take normals from the field gradient,
    // and derive bone weights from how close each primitive is.
    const nv = pos.length / 3;
    const positions = new Float32Array(pos);
    const normals = new Float32Array(nv * 3);
    const skinIndex = new Uint16Array(nv * 4);
    const skinWeight = new Float32Array(nv * 4);
    const nb = Object.keys(this.boneIndex).length;
    const acc = new Float32Array(nb);
    const e = h * 0.5;
    for (let v = 0; v < nv; v++) {
      let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
      const list = listAt(x, y, z) || this.prims;
      let gx = 0, gy = 1, gz = 0;
      for (let it = 0; it < 3; it++) {
        const f = evalField(list, x, y, z);
        gx = evalField(list, x + e, y, z) - evalField(list, x - e, y, z);
        gy = evalField(list, x, y + e, z) - evalField(list, x, y - e, z);
        gz = evalField(list, x, y, z + e) - evalField(list, x, y, z - e);
        const gl = Math.hypot(gx, gy, gz) || 1;
        gx /= gl; gy /= gl; gz /= gl;
        if (it === 2) break;
        const step = Math.max(-h, Math.min(h, f));
        x -= gx * step; y -= gy * step; z -= gz * step;
      }
      if (Math.abs(z) < h * 0.02) { z = 0; gz = 0; }
      positions.set([x, y, z], v * 3);
      const gl = Math.hypot(gx, gy, gz) || 1;
      normals.set([gx / gl, gy / gl, gz / gl], v * 3);

      acc.fill(0);
      let dmin = 1e9;
      for (const q of list) if (!q.sub) dmin = Math.min(dmin, primDist(q, x, y, z));
      for (const q of list) {
        if (q.sub) continue;
        const d = primDist(q, x, y, z);
        let w = Math.exp(-(d - dmin) / q.skin);
        if (q.side) w *= Math.min(1, Math.max(0, 0.5 + (q.side * z) / 0.05));
        if (w < 1e-4) continue;
        const nbq = q.bones.length;
        if (nbq === 1) acc[q.bones[0]] += w;
        else {
          const u = out.t * (nbq - 1), lo = Math.min(nbq - 2, Math.floor(u));
          let fr = u - lo;
          fr = fr * fr * (3 - 2 * fr);
          acc[q.bones[lo]] += w * (1 - fr);
          acc[q.bones[lo + 1]] += w * fr;
        }
      }
      let total = 0;
      for (let s = 0; s < 4; s++) {
        let best = 0;
        for (let b = 1; b < nb; b++) if (acc[b] > acc[best]) best = b;
        skinIndex[v * 4 + s] = best;
        skinWeight[v * 4 + s] = acc[best];
        total += acc[best];
        acc[best] = 0;
      }
      for (let s = 0; s < 4; s++) skinWeight[v * 4 + s] /= total || 1;
    }
    return { positions, normals, indices: new Uint32Array(idx), skinIndex, skinWeight };
  }
}

function dist2(p, a, b) {
  const dx = p[a * 3] - p[b * 3], dy = p[a * 3 + 1] - p[b * 3 + 1], dz = p[a * 3 + 2] - p[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}
