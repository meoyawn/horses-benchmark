// Sparse "surface nets" polygoniser for an SDFScene.
// 1) classify 8^3-cell blocks as outside / inside / near-surface using primitive culling,
// 2) evaluate the field only in near-surface blocks,
// 3) one vertex per sign-changing cell, one quad per sign-changing edge,
// 4) Newton-project vertices onto the zero set and take normals from the field gradient.

const EDGES = [];
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if ((a & bit) === 0) EDGES.push([a, a | bit]);

export function polygonize(scene, { bounds, h, block = 8, log = () => {} }) {
  const t0 = performance.now();
  const [minx, miny, minz, maxx, maxy, maxz] = bounds;
  const nx = Math.ceil((maxx - minx) / h) + 1;
  const ny = Math.ceil((maxy - miny) / h) + 1;
  const nz = Math.ceil((maxz - minz) / h) + 1;
  const B = block;
  const nbx = Math.ceil((nx - 1) / B), nby = Math.ceil((ny - 1) / B), nbz = Math.ceil((nz - 1) / B);
  const nb = nbx * nby * nbz;
  const blockLists = new Array(nb);
  const state = new Uint8Array(nb); // 0 outside, 1 inside, 2 surface
  const vals = new Float32Array(nx * ny * nz);
  const sxy = nx * ny;
  const bsize = B * h;
  const halfDiag = Math.sqrt(3) * bsize * 0.5;
  const margin = 2.5 * h;

  // --- 1. classify blocks
  let active = 0;
  for (let bk = 0; bk < nbz; bk++)
    for (let bj = 0; bj < nby; bj++)
      for (let bi = 0; bi < nbx; bi++) {
        const b = bi + nbx * (bj + nby * bk);
        const x0 = minx + bi * bsize, y0 = miny + bj * bsize, z0 = minz + bk * bsize;
        const list = scene.cull(x0, y0, z0, x0 + bsize, y0 + bsize, z0 + bsize, margin + halfDiag * 0.2);
        blockLists[b] = list;
        if (list.length === 0) { state[b] = 0; continue; }
        const d = scene.evalList(list, x0 + bsize * 0.5, y0 + bsize * 0.5, z0 + bsize * 0.5);
        if (d > 2.2 * halfDiag) state[b] = 0;
        else if (d < -2.2 * halfDiag) state[b] = 1;
        else { state[b] = 2; active++; }
      }

  // --- 2. fill corners: inactive blocks first (sign only), then exact values
  const fillBlock = (bi, bj, bk, value) => {
    const i0 = bi * B, j0 = bj * B, k0 = bk * B;
    const i1 = Math.min(i0 + B, nx - 1), j1 = Math.min(j0 + B, ny - 1), k1 = Math.min(k0 + B, nz - 1);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      let idx = i0 + nx * j + sxy * k;
      for (let i = i0; i <= i1; i++) vals[idx++] = value;
    }
  };
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const b = bi + nbx * (bj + nby * bk);
    if (state[b] !== 2) fillBlock(bi, bj, bk, state[b] === 1 ? -halfDiag : halfDiag);
  }
  let evals = 0;
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const b = bi + nbx * (bj + nby * bk);
    if (state[b] !== 2) continue;
    const list = blockLists[b];
    const i0 = bi * B, j0 = bj * B, k0 = bk * B;
    const i1 = Math.min(i0 + B, nx - 1), j1 = Math.min(j0 + B, ny - 1), k1 = Math.min(k0 + B, nz - 1);
    for (let k = k0; k <= k1; k++) {
      const z = minz + k * h;
      for (let j = j0; j <= j1; j++) {
        const y = miny + j * h;
        let idx = i0 + nx * j + sxy * k;
        for (let i = i0; i <= i1; i++) {
          vals[idx++] = scene.evalList(list, minx + i * h, y, z);
        }
      }
    }
    evals += (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1);
  }
  const t1 = performance.now();
  log(`field: ${nx}x${ny}x${nz}, ${active}/${nb} active blocks, ${(evals / 1e6).toFixed(2)}M evals, ${(t1 - t0).toFixed(0)} ms`);

  // blocks to scan: active ones and their neighbours
  const scan = new Uint8Array(nb);
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const b = bi + nbx * (bj + nby * bk);
    if (state[b] !== 2) continue;
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = bi + di, cj = bj + dj, ck = bk + dk;
      if (ci < 0 || cj < 0 || ck < 0 || ci >= nbx || cj >= nby || ck >= nbz) continue;
      scan[ci + nbx * (cj + nby * ck)] = 1;
    }
  }

  // --- 3. vertices
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cellVert = new Int32Array(cnx * cny * cnz).fill(-1);
  const pos = [];
  const cellsWithVert = [];
  const cornerOff = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
  const cv = new Float64Array(8);
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    if (!scan[bi + nbx * (bj + nby * bk)]) continue;
    const i0 = bi * B, j0 = bj * B, k0 = bk * B;
    const i1 = Math.min(i0 + B, cnx), j1 = Math.min(j0 + B, cny), k1 = Math.min(k0 + B, cnz);
    for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const base = i + nx * j + sxy * k;
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const v = vals[base + cornerOff[c]];
        cv[c] = v;
        if (v < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let e = 0; e < 12; e++) {
        const a = EDGES[e][0], b = EDGES[e][1];
        const ia = (mask >> a) & 1, ib = (mask >> b) & 1;
        if (ia === ib) continue;
        const t = cv[a] / (cv[a] - cv[b]);
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
        const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
        sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t;
        n++;
      }
      const ci = i + cnx * (j + cny * k);
      cellVert[ci] = pos.length / 3;
      cellsWithVert.push(ci);
      pos.push(minx + (i + sx / n) * h, miny + (j + sy / n) * h, minz + (k + sz / n) * h);
    }
  }

  // --- 4. faces
  const idx = [];
  const cellAt = (i, j, k) => cellVert[i + cnx * (j + cny * k)];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // split along the shorter diagonal
    const dac = (pos[3 * a] - pos[3 * c]) ** 2 + (pos[3 * a + 1] - pos[3 * c + 1]) ** 2 + (pos[3 * a + 2] - pos[3 * c + 2]) ** 2;
    const dbd = (pos[3 * b] - pos[3 * d]) ** 2 + (pos[3 * b + 1] - pos[3 * d + 1]) ** 2 + (pos[3 * b + 2] - pos[3 * d + 2]) ** 2;
    if (!flip) {
      if (dac <= dbd) idx.push(a, b, c, a, c, d);
      else idx.push(a, b, d, b, c, d);
    } else {
      if (dac <= dbd) idx.push(a, c, b, a, d, c);
      else idx.push(a, d, b, b, d, c);
    }
  };
  for (const ci of cellsWithVert) {
    const i = ci % cnx;
    const j = Math.floor(ci / cnx) % cny;
    const k = Math.floor(ci / (cnx * cny));
    const c0 = i + nx * j + sxy * k;
    const in0 = vals[c0] < 0;
    // x edge
    if (j > 0 && k > 0) {
      const in1 = vals[c0 + 1] < 0;
      if (in0 !== in1) quad(cellAt(i, j - 1, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i, j - 1, k), !in0);
    }
    // y edge
    if (i > 0 && k > 0) {
      const in1 = vals[c0 + nx] < 0;
      if (in0 !== in1) quad(cellAt(i - 1, j, k - 1), cellAt(i - 1, j, k), cellAt(i, j, k), cellAt(i, j, k - 1), !in0);
    }
    // z edge
    if (i > 0 && j > 0) {
      const in1 = vals[c0 + sxy] < 0;
      if (in0 !== in1) quad(cellAt(i - 1, j - 1, k), cellAt(i, j - 1, k), cellAt(i, j, k), cellAt(i - 1, j, k), !in0);
    }
  }

  const nv = pos.length / 3;
  const positions = new Float32Array(pos);
  const indices = nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);

  // point -> primitive list lookup (used for projection, normals, skinning, AO)
  const listAt = (x, y, z) => {
    let bi = Math.floor((x - minx) / bsize), bj = Math.floor((y - miny) / bsize), bk = Math.floor((z - minz) / bsize);
    if (bi < 0 || bj < 0 || bk < 0 || bi >= nbx || bj >= nby || bk >= nbz) return null;
    return blockLists[bi + nbx * (bj + nby * bk)];
  };
  const field = (x, y, z) => {
    const list = listAt(x, y, z);
    if (!list || list.length === 0) return 1;
    return scene.evalList(list, x, y, z);
  };

  // --- 5. project onto the surface + gradient normals
  const normals = new Float32Array(nv * 3);
  const e = h * 0.35;
  for (let v = 0; v < nv; v++) {
    let x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    const list = listAt(x, y, z);
    if (!list) continue;
    let gx = 0, gy = 0, gz = 1;
    for (let it = 0; it < 3; it++) {
      const d = scene.evalList(list, x, y, z);
      // tetrahedral gradient
      const a = scene.evalList(list, x + e, y - e, z - e);
      const b = scene.evalList(list, x - e, y - e, z + e);
      const c = scene.evalList(list, x - e, y + e, z - e);
      const dd = scene.evalList(list, x + e, y + e, z + e);
      gx = a - b - c + dd; gy = -a - b + c + dd; gz = -a + b - c + dd;
      const g2 = (gx * gx + gy * gy + gz * gz) / (16 * e * e);
      if (g2 < 1e-10) break;
      const s = d / g2 / (4 * e);
      let mx = gx * s, my = gy * s, mz = gz * s;
      const ml = Math.hypot(mx, my, mz);
      if (ml > h) { mx *= h / ml; my *= h / ml; mz *= h / ml; }
      x -= mx; y -= my; z -= mz;
      if (Math.abs(d) < 1e-5) break;
    }
    positions[3 * v] = x; positions[3 * v + 1] = y; positions[3 * v + 2] = z;
    const gl = Math.hypot(gx, gy, gz) || 1;
    normals[3 * v] = gx / gl; normals[3 * v + 1] = gy / gl; normals[3 * v + 2] = gz / gl;
  }
  const t2 = performance.now();
  log(`mesh: ${nv} verts, ${idx.length / 3} tris, ${(t2 - t1).toFixed(0)} ms`);
  return { positions, normals, indices, listAt, field, h };
}
