import * as THREE from 'three';

export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export function ease(lo, hi, value) {
  const t = clamp((value - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}

export function union(a, b, radius) {
  const k = Math.max(radius - Math.abs(a - b), 0);
  return Math.min(a, b) - k * k / (4 * radius);
}

// Sections describe the underside, topline and half-breadth. Interpolating each
// landmark independently preserves the shape of the belly, crest and jaw.
export function loft(origin, axis, up, sections, relief = null) {
  const first = sections[0][0];
  const last = sections.at(-1)[0];
  const count = Math.ceil((last - first) / .002);
  const scale = count / (last - first);
  const table = new Float32Array((count + 1) * 3);
  let segment = 0;
  for (let i = 0; i <= count; i++) {
    const u = first + i / scale;
    while (segment < sections.length - 2 && u > sections[segment + 1][0]) segment++;
    const a = sections[segment], b = sections[segment + 1];
    const before = sections[Math.max(0, segment - 1)];
    const after = sections[Math.min(sections.length - 1, segment + 2)];
    const width = b[0] - a[0], t = clamp((u - a[0]) / width);
    for (let j = 1; j <= 3; j++) {
      const slope = (b[j] - a[j]) / width;
      const safe = (v) => Math.sign(v) === Math.sign(slope) ? Math.sign(v) * Math.min(Math.abs(v), 2 * Math.abs(slope)) : 0;
      const m0 = safe((b[j] - before[j]) / (b[0] - before[0])) * width;
      const m1 = safe((after[j] - a[j]) / (after[0] - a[0])) * width;
      table[3 * i + j - 1] = (1 - t) * (1 - t) * ((1 + 2 * t) * a[j] + t * m0)
        + t * t * ((3 - 2 * t) * b[j] + (t - 1) * m1);
    }
  }
  const sample = new Float64Array(3);
  function profile(u) {
    const s = clamp((u - first) * scale, 0, count - .000001);
    const j = Math.floor(s), t = s - j, k = 3 * j;
    for (let p = 0; p < 3; p++) sample[p] = table[k + p] + t * (table[k + 3 + p] - table[k + p]);
    return sample;
  }
  function field(x, y, z) {
    const dx = x - origin[0], dy = y - origin[1];
    const u = dx * axis[0] + dy * axis[1];
    const outside = Math.max(first - u, u - last, 0);
    if (outside > .12) return outside;
    const v = dx * up[0] + dy * up[1];
    const [bot, top, w] = profile(u);
    const h = Math.max((top - bot) * .5, .002);
    const dv = v - (top + bot) * .5, yn = dv / h;
    const width = Math.max(.002, w + (relief ? relief(u, v, yn) : 0));
    const zn = z / width;
    const k = Math.sqrt(yn * yn + zn * zn);
    const grad = Math.hypot(yn / h, zn / width);
    const d = grad > .0001 ? k * (k - 1) / grad : -Math.min(h, width);
    if (!outside) return d;
    return Math.hypot(Math.max(0, d), outside);
  }
  function sidePoint(u, v, sign, lift = 0) {
    const [bot, top, w] = profile(u);
    const yn = (2 * v - top - bot) / Math.max(.001, top - bot);
    const width = w + (relief ? relief(u, v, yn) : 0);
    const z = Math.sqrt(Math.max(0, 1 - yn * yn)) * width;
    return new THREE.Vector3(origin[0] + axis[0] * u + up[0] * v, origin[1] + axis[1] * u + up[1] * v, sign * (z + lift));
  }
  return { field, sidePoint };
}

// One vertex per intersected cell. Quads across sign-changing grid edges join the
// surfaces into a single skin, including the transition from shoulder to leg.
export function surfaceGeometry(field, skin, min, max, spacing) {
  const nx = Math.ceil((max[0] - min[0]) / spacing) + 1;
  const ny = Math.ceil((max[1] - min[1]) / spacing) + 1;
  const nz = Math.ceil((max[2] - min[2]) / spacing) + 1;
  const slab = nx * ny, total = slab * nz;
  const values = new Float32Array(total);
  for (let iz = 0; iz < nz; iz++) {
    const z = min[2] + iz * spacing;
    for (let iy = 0; iy < ny; iy++) {
      const y = min[1] + iy * spacing, row = iz * slab + iy * nx;
      for (let ix = 0; ix < nx; ix++) {
        values[row + ix] = field(min[0] + ix * spacing, y, z);
      }
    }
  }
  const position = [], normal = [], joints = [], weights = [], faces = [];
  const cellIds = new Int32Array(total).fill(-1);
  const corners = new Float32Array(8);
  const offsets = [0, 1, nx, nx + 1, slab, slab + 1, slab + nx, slab + nx + 1];
  const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  function face(i, a, b, forward) {
    const p = cellIds[i], q = cellIds[i - a], r = cellIds[i - a - b], s = cellIds[i - b];
    if (q < 0 || r < 0 || s < 0) return;
    if (forward) faces.push(p, q, r, p, r, s);
    else faces.push(p, s, r, p, r, q);
  }
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let iy = 0; iy < ny - 1; iy++) {
      const row = iz * slab + iy * nx;
      for (let ix = 0; ix < nx - 1; ix++) {
        const i = row + ix, below = values[i] < 0;
        if ((values[i + 1] < 0) === below && (values[i + nx] < 0) === below
          && (values[i + nx + 1] < 0) === below && (values[i + slab] < 0) === below
          && (values[i + slab + 1] < 0) === below && (values[i + slab + nx] < 0) === below
          && (values[i + slab + nx + 1] < 0) === below) continue;
        for (let c = 0; c < 8; c++) corners[c] = values[i + offsets[c]];
        let sx = 0, sy = 0, sz = 0, crossings = 0;
        for (const [a, b] of edges) {
          if ((corners[a] < 0) === (corners[b] < 0)) continue;
          const t = corners[a] / (corners[a] - corners[b]);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
          crossings++;
        }
        sx /= crossings; sy /= crossings; sz /= crossings;
        const x = min[0] + (ix + sx) * spacing, y = min[1] + (iy + sy) * spacing, z = min[2] + (iz + sz) * spacing;
        cellIds[i] = position.length / 3;
        position.push(x,y,z);
        const e=spacing*.36;
        const gx=field(x+e,y,z)-field(x-e,y,z);
        const gy=field(x,y+e,z)-field(x,y-e,z);
        const gz=field(x,y,z+e)-field(x,y,z-e);
        const length = Math.hypot(gx,gy,gz) || 1;
        normal.push(gx / length, gy / length, gz / length);
        const influences = skin(x,y,z);
        for (let j = 0; j < 4; j++) {
          joints.push(influences[j]?.[0] ?? 0);
          weights.push(influences[j]?.[1] ?? 0);
        }
        if ((corners[1] < 0) !== below) face(i, nx, slab, below);
        if ((corners[2] < 0) !== below) face(i, slab, 1, below);
        if ((corners[4] < 0) !== below) face(i, 1, nx, below);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(faces);
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  g.computeBoundingSphere();
  return g;
}
