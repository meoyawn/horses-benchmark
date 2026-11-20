// Signed-distance modelling + a Surface Nets polygonizer, written from scratch.
// The horse body is described as a smooth union of anisotropically scaled
// "round cones" (capsules with different end radii), each owned by a bone.

export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export class Prim {
  constructor(o) {
    this.bone = o.bone;
    this.tone = o.tone || 0;
    this.k = o.k ?? 0.05;
    this.flat = !!o.flat;
    const a = o.a, b = o.b || o.a;
    const r1 = o.r1, r2 = o.r2 ?? o.r1;
    const s = o.s || [1, 1, 1];
    this.r1 = r1; this.r2 = r2;
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    this.cx = c[0]; this.cy = c[1]; this.cz = c[2];
    this.isx = 1 / s[0]; this.isy = 1 / s[1]; this.isz = 1 / s[2];
    this.ms = Math.min(s[0], s[1], s[2]);
    const A = [0, 1, 2].map(i => c[i] + (a[i] - c[i]) / s[i]);
    const B = [0, 1, 2].map(i => c[i] + (b[i] - c[i]) / s[i]);
    this.ax = A[0]; this.ay = A[1]; this.az = A[2];
    this.bax = B[0] - A[0]; this.bay = B[1] - A[1]; this.baz = B[2] - A[2];
    this.l2 = this.bax * this.bax + this.bay * this.bay + this.baz * this.baz;
    this.rr = r1 - r2;
    this.a2 = this.l2 - this.rr * this.rr;
    this.il2 = this.l2 > 0 ? 1 / this.l2 : 0;
    this.sphere = this.l2 < 1e-10 || this.a2 <= 1e-10;
    if (this.sphere) {
      const big = r1 >= r2;
      this.sx = big ? A[0] : B[0]; this.sy = big ? A[1] : B[1]; this.sz = big ? A[2] : B[2];
      this.sr = Math.max(r1, r2);
    }
    const R = Math.max(r1, r2);
    this.min = [0, 1, 2].map(i => Math.min(a[i], b[i]) - R * s[i]);
    this.max = [0, 1, 2].map(i => Math.max(a[i], b[i]) + R * s[i]);
    if (this.flat) this.min[1] = Math.max(this.min[1], 0);
  }

  dist(x, y, z) {
    const px = this.cx + (x - this.cx) * this.isx;
    const py = this.cy + (y - this.cy) * this.isy;
    const pz = this.cz + (z - this.cz) * this.isz;
    let d;
    if (this.sphere) {
      const dx = px - this.sx, dy = py - this.sy, dz = pz - this.sz;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz) - this.sr;
    } else {
      // round cone between two points (exact SDF in the scaled space)
      const pax = px - this.ax, pay = py - this.ay, paz = pz - this.az;
      const l2 = this.l2, rr = this.rr, a2 = this.a2, il2 = this.il2;
      const yy = pax * this.bax + pay * this.bay + paz * this.baz;
      const zz = yy - l2;
      const qx = pax * l2 - this.bax * yy, qy = pay * l2 - this.bay * yy, qz = paz * l2 - this.baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) d = Math.sqrt(x2 + z2) * il2 - this.r2;
      else if (Math.sign(yy) * a2 * y2 < k) d = Math.sqrt(x2 + y2) * il2 - this.r1;
      else d = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - this.r1;
    }
    d *= this.ms;
    if (this.flat) d = Math.max(d, -y);
    return d;
  }

  near(x, y, z, m) {
    return x > this.min[0] - m && x < this.max[0] + m &&
      y > this.min[1] - m && y < this.max[1] + m &&
      z > this.min[2] - m && z < this.max[2] + m;
  }
}

export class Field {
  constructor(prims) { this.prims = prims; }

  evalList(x, y, z, list) {
    let d = 1e9;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      d = smin(d, p.dist(x, y, z), p.k);
    }
    return d;
  }

  // full field with AABB culling (used off-grid)
  at(x, y, z) {
    let d = 1e9;
    const P = this.prims;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (!p.near(x, y, z, p.k + 0.04)) continue;
      d = smin(d, p.dist(x, y, z), p.k);
    }
    return d > 1e8 ? 0.25 : d;
  }

  grad(x, y, z, out, e = 0.002) {
    out[0] = this.at(x + e, y, z) - this.at(x - e, y, z);
    out[1] = this.at(x, y + e, z) - this.at(x, y - e, z);
    out[2] = this.at(x, y, z + e) - this.at(x, y, z - e);
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l;
    return out;
  }

  // march along a direction until the surface is crossed
  march(o, dir, maxT = 1, step = 0.002) {
    let prev = this.at(o[0], o[1], o[2]);
    for (let t = step; t < maxT; t += step) {
      const x = o[0] + dir[0] * t, y = o[1] + dir[1] * t, z = o[2] + dir[2] * t;
      const d = this.at(x, y, z);
      if (d < 0 && prev >= 0) {
        const tt = t - step * (d / (d - prev));
        return [o[0] + dir[0] * tt, o[1] + dir[1] * tt, o[2] + dir[2] * tt];
      }
      prev = d;
    }
    return null;
  }
}

// Surface Nets: one vertex per sign-changing cell, quads across sign-changing edges.
export function polygonize(field, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const sxy = nx * ny;
  const BS = 8;
  const prims = field.prims;

  // 1) sample the field in blocks, skipping blocks that are far from the surface
  for (let bk = 0; bk < nz; bk += BS) for (let bj = 0; bj < ny; bj += BS) for (let bi = 0; bi < nx; bi += BS) {
    const i1 = Math.min(bi + BS, nx), j1 = Math.min(bj + BS, ny), k1 = Math.min(bk + BS, nz);
    const x0 = min[0] + bi * h, x1 = min[0] + (i1 - 1) * h;
    const y0 = min[1] + bj * h, y1 = min[1] + (j1 - 1) * h;
    const z0 = min[2] + bk * h, z1 = min[2] + (k1 - 1) * h;
    const cand = prims.filter(p => {
      const m = p.k + 0.03;
      return x1 > p.min[0] - m && x0 < p.max[0] + m && y1 > p.min[1] - m && y0 < p.max[1] + m && z1 > p.min[2] - m && z0 < p.max[2] + m;
    });
    let fill = null;
    if (!cand.length) fill = 0.2;
    else {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
      const R = 0.5 * Math.hypot(x1 - x0, y1 - y0, z1 - z0) + 0.045;
      const dc = field.evalList(cx, cy, cz, cand);
      if (dc > R || dc < -R) fill = dc;
    }
    for (let k = bk; k < k1; k++) for (let j = bj; j < j1; j++) {
      let o = bi + nx * j + sxy * k;
      if (fill !== null) { for (let i = bi; i < i1; i++) F[o++] = fill; continue; }
      const z = min[2] + k * h, y = min[1] + j * h;
      for (let i = bi; i < i1; i++) F[o++] = field.evalList(min[0] + i * h, y, z, cand);
    }
  }

  // 2) one vertex per surface cell
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellIdx = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const corner = new Float32Array(8);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  let nv = 0;
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const o = i + nx * j + sxy * k;
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = F[o + (c & 1) + ((c >> 1) & 1) * nx + ((c >> 2) & 1) * sxy];
      corner[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let ax = 0, ay = 0, az = 0, n = 0;
    for (let e = 0; e < 12; e++) {
      const a = EDGES[e][0], b = EDGES[e][1];
      const va = corner[a], vb = corner[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      ax += (a & 1) + ((b & 1) - (a & 1)) * t;
      ay += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
      az += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
      n++;
    }
    pos.push(min[0] + (i + ax / n) * h, min[1] + (j + ay / n) * h, min[2] + (k + az / n) * h);
    cellIdx[i + cx * (j + cy * k)] = nv++;
  }

  // 3) quads across sign-changing grid edges
  const idx = [];
  const C = (i, j, k) => cellIdx[i + cx * (j + cy * k)];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
    const o = i + nx * j + sxy * k;
    const v0 = F[o];
    const in0 = v0 < 0;
    if ((F[o + 1] < 0) !== in0) quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), in0);
    if ((F[o + nx] < 0) !== in0) quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1), in0);
    if ((F[o + sxy] < 0) !== in0) quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), in0);
  }

  const positions = new Float32Array(pos);
  const normals = new Float32Array(positions.length);
  const g = [0, 0, 0];
  // 4) project vertices onto the true iso-surface and take gradient normals
  for (let v = 0; v < nv; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    for (let it = 0; it < 2; it++) {
      const d = field.at(x, y, z);
      field.grad(x, y, z, g);
      const step = Math.max(-h, Math.min(h, d));
      x -= g[0] * step; y -= g[1] * step; z -= g[2] * step;
    }
    field.grad(x, y, z, g);
    positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
    normals[v * 3] = g[0]; normals[v * 3 + 1] = g[1]; normals[v * 3 + 2] = g[2];
  }
  // 5) make winding agree with the outward gradient
  const indices = new Uint32Array(idx);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const wx = positions[c] - positions[a], wy = positions[c + 1] - positions[a + 1], wz = positions[c + 2] - positions[a + 2];
    const nxx = uy * wz - uz * wy, nyy = uz * wx - ux * wz, nzz = ux * wy - uy * wx;
    const gx = normals[a] + normals[b] + normals[c], gy = normals[a + 1] + normals[b + 1] + normals[c + 1], gz = normals[a + 2] + normals[b + 2] + normals[c + 2];
    if (nxx * gx + nyy * gy + nzz * gz < 0) { const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp; }
  }
  return { positions, normals, indices };
}
