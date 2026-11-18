// Builds the horse body mesh: SDF sculpt -> surface nets -> skin weights, tags and baked AO.
// Pure JS (no three.js) so it can run in a worker.

import { SDFScene, OP_ADD } from './sdf.js';
import { polygonize } from './mesher.js';
import { buildAnatomy, skeletonDef, WARP, HEAD } from './anatomy.js';

const TAGS = ['hoof', 'skin', 'eyeskin', 'barrel'];

// Crack-free local refinement: edges whose endpoints both lie inside a region are split at their
// midpoint (which is then projected onto the SDF surface); triangles with 1, 2 or 3 split edges are
// re-triangulated accordingly. Used to give the eyelids and nostrils more resolution.
function refineRegions(positions, normals, indices, field, regions, levels) {
  let P = Array.from(positions), N = Array.from(normals), I = Array.from(indices);
  const inside = (v) => {
    const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
    for (const r of regions) if ((x - r.c[0]) ** 2 + (y - r.c[1]) ** 2 + (z - r.c[2]) ** 2 < r.r * r.r) return true;
    return false;
  };
  const project = (v) => {
    let x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
    const e = 0.0006;
    let gx = 0, gy = 0, gz = 1;
    for (let it = 0; it < 6; it++) {
      const d = field(x, y, z);
      gx = (field(x + e, y, z) - field(x - e, y, z)) / (2 * e);
      gy = (field(x, y + e, z) - field(x, y - e, z)) / (2 * e);
      gz = (field(x, y, z + e) - field(x, y, z - e)) / (2 * e);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-10) break;
      let s = d / g2;
      const step = Math.abs(s) * Math.sqrt(g2);
      if (step > 0.004) s *= 0.004 / step;
      x -= gx * s; y -= gy * s; z -= gz * s;
      if (Math.abs(d) < 1e-6) break;
    }
    const gl = Math.hypot(gx, gy, gz) || 1;
    P[3 * v] = x; P[3 * v + 1] = y; P[3 * v + 2] = z;
    N[3 * v] = gx / gl; N[3 * v + 1] = gy / gl; N[3 * v + 2] = gz / gl;
  };
  for (let lev = 0; lev < levels; lev++) {
    const nv0 = P.length / 3;
    const mark = new Uint8Array(nv0);
    for (let v = 0; v < nv0; v++) mark[v] = inside(v) ? 1 : 0;
    const mids = new Map();
    const mid = (a, b) => {
      if (!mark[a] || !mark[b]) return -1;
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      let m = mids.get(key);
      if (m === undefined) {
        m = P.length / 3;
        P.push((P[3 * a] + P[3 * b]) / 2, (P[3 * a + 1] + P[3 * b + 1]) / 2, (P[3 * a + 2] + P[3 * b + 2]) / 2);
        N.push(0, 0, 1);
        mids.set(key, m);
      }
      return m;
    };
    const out = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      const n = (ab >= 0) + (bc >= 0) + (ca >= 0);
      if (n === 0) out.push(a, b, c);
      else if (n === 3) out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      else if (n === 1) {
        if (ab >= 0) out.push(a, ab, c, ab, b, c);
        else if (bc >= 0) out.push(a, b, bc, a, bc, c);
        else out.push(a, b, ca, ca, b, c);
      } else {
        if (ca < 0) out.push(ab, b, bc, a, ab, bc, a, bc, c);
        else if (ab < 0) out.push(bc, c, ca, b, bc, ca, b, ca, a);
        else out.push(ca, a, ab, c, ca, ab, c, ab, b);
      }
    }
    I = out;
    for (let v = nv0; v < P.length / 3; v++) project(v);
  }
  const nv = P.length / 3;
  return {
    positions: new Float32Array(P), normals: new Float32Array(N),
    indices: nv > 65535 ? new Uint32Array(I) : new Uint16Array(I),
  };
}

export function buildBody({ h = 0.009, log = () => {} } = {}) {
  const t0 = performance.now();
  const { prims } = buildAnatomy();
  const scene = new SDFScene(prims);
  const bones = skeletonDef();
  const boneIndex = Object.fromEntries(bones.map((b, i) => [b.name, i]));

  // bounds from primitive boxes
  const bounds = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const p of prims) {
    if (p.op !== OP_ADD) continue;
    for (let i = 0; i < 3; i++) {
      bounds[i] = Math.min(bounds[i], p.aabb[i] - 0.03);
      bounds[i + 3] = Math.max(bounds[i + 3], p.aabb[i + 3] + 0.03);
    }
  }
  bounds[1] = Math.max(bounds[1], -0.02);

  const mesh = polygonize(scene, { bounds, h, log });
  const { listAt, field } = mesh;
  // extra resolution around the eyelids and nostrils
  const regions = [];
  for (const s of [1, -1]) {
    regions.push({ c: HEAD.at(0.206, -0.041, 0.1 * s), r: 0.05 });
    regions.push({ c: HEAD.at(0.54, -0.048, 0.07 * s), r: 0.045 });
  }
  const ref = refineRegions(mesh.positions, mesh.normals, mesh.indices, field, regions, 2);
  const positions = ref.positions, normals = ref.normals;
  mesh.indices = ref.indices;
  const nv = positions.length / 3;
  log(`refined: ${nv} verts`);

  // ---- skin weights + tags
  const skinIndex = new Uint16Array(nv * 4);
  const skinWeight = new Float32Array(nv * 4);
  const tags = new Float32Array(nv * 4);
  const dists = new Float64Array(256);
  for (let v = 0; v < nv; v++) {
    const x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    const list = listAt(x, y, z) || [];
    let dmin = 1e9;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.op !== OP_ADD) { dists[i] = 1e9; continue; }
      const d = p.dist(x, y, z);
      dists[i] = d;
      if (d < dmin) dmin = d;
    }
    const acc = {};
    let tsum = 0;
    const tv = [0, 0, 0, 0];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.op !== OP_ADD) continue;
      const fall = p.skin ?? Math.max(p.k * 1.1, 0.022);
      const t = 1 - (dists[i] - dmin) / fall;
      if (t <= 0) continue;
      const w = t * t;
      if (p.bone) acc[p.bone] = (acc[p.bone] || 0) + w;
      else if (p.attach) p.attach(x, y, z, acc, w);
      tsum += w;
      if (p.tag) {
        const ti = TAGS.indexOf(p.tag);
        if (ti >= 0) tv[ti] += w;
      }
    }
    // subtractive tagged features colour their rims too
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.op === OP_ADD || !p.tag) continue;
      const d = p.dist(x, y, z);
      const t = 1 - d / 0.02;
      if (t > 0) {
        const ti = TAGS.indexOf(p.tag);
        if (ti >= 0) tv[ti] += t * t * (tsum || 1);
      }
    }
    for (let i = 0; i < 4; i++) tags[4 * v + i] = tsum > 0 ? Math.min(1, tv[i] / tsum) : 0;
    const entries = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let s = 0;
    for (const e of entries) s += e[1];
    if (s <= 0) { skinIndex[4 * v] = boneIndex.body; skinWeight[4 * v] = 1; continue; }
    for (let j = 0; j < entries.length; j++) {
      skinIndex[4 * v + j] = boneIndex[entries[j][0]];
      skinWeight[4 * v + j] = entries[j][1] / s;
    }
  }
  const t1 = performance.now();
  log(`skin weights: ${(t1 - t0 - 0).toFixed(0)} ms total so far`);

  // ---- baked ambient occlusion (SDF cone-ish sampling along the normal + a few side taps)
  const ao = new Float32Array(nv);
  const steps = [0.015, 0.035, 0.07, 0.12, 0.2, 0.3];
  const wts = [1.0, 0.85, 0.7, 0.5, 0.35, 0.25];
  for (let v = 0; v < nv; v++) {
    const x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    const nx = normals[3 * v], ny = normals[3 * v + 1], nz = normals[3 * v + 2];
    let occ = 0, wsum = 0;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const d = field(x + nx * s, y + ny * s, z + nz * s);
      occ += wts[i] * Math.max(0, (s - d) / s);
      wsum += wts[i];
    }
    // ground occlusion near the hooves
    const g = Math.max(0, 1 - y / 0.25);
    let a = 1 - 1.15 * (occ / wsum);
    a *= 1 - 0.35 * g * g * Math.max(0, 0.5 - 0.5 * ny);
    ao[v] = Math.max(0.08, Math.min(1, a));
  }
  const t2 = performance.now();
  log(`ao: ${(t2 - t1).toFixed(0)} ms`);

  // ---- design space -> final space (trunk length warp)
  for (let v = 0; v < nv; v++) {
    const x = positions[3 * v];
    const sc = WARP.s(x);
    positions[3 * v] = WARP.w(x);
    let nx = normals[3 * v] / sc, ny = normals[3 * v + 1], nz = normals[3 * v + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    normals[3 * v] = nx / l; normals[3 * v + 1] = ny / l; normals[3 * v + 2] = nz / l;
  }
  for (const b of bones) b.pos = WARP.p(b.pos);

  return {
    positions, normals, indices: mesh.indices, skinIndex, skinWeight, tags, ao,
    bones, boneIndex, field, listAt, scene,
    stats: { verts: nv, tris: mesh.indices.length / 3, ms: t2 - t0 },
  };
}
