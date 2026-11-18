// Surface-nets mesher for the sculpt, written for this project.
//
// The field is symmetric about z = 0, so only the z >= 0 half is polygonised
// on a rectilinear (non-uniform) grid and then mirrored. The grid is processed
// in blocks: each block keeps a short list of the primitives that can matter
// inside it, which keeps millions of field samples cheap.
import { cullProgram, evalProgram, visitPrims } from './sdf.js';

const BLOCK = 8;

/** Node coordinates from `lo` to at least `hi` with a position dependent step. */
export function makeAxis(lo, hi, stepAt) {
  const out = [lo];
  let x = lo;
  while (x < hi) {
    const h1 = stepAt(x);
    const h = stepAt(x + h1 * 0.5);
    x += h;
    out.push(x);
  }
  return Float64Array.from(out);
}

/**
 * @param groups   sculpt groups (see sdf.js)
 * @param axes     { x, y, z } node coordinate arrays; z must start at 0
 * @param skin     { boneCount, mirrorBone: Int32Array, weigh(prim, x, y, z, mirrored, scale, acc) }
 * @param onProgress optional async callback(fraction, label)
 */
export async function polygonise(groups, axes, skin, onProgress) {
  const X = axes.x, Y = axes.y, Z = axes.z;
  const nx = X.length - 1, ny = Y.length - 1, nz = Z.length - 1;
  const NX = nx + 1, NY = ny + 1, NZ = nz + 1;
  const nodeCount = NX * NY * NZ;
  const values = new Float32Array(nodeCount);
  const nbx = Math.ceil(nx / BLOCK), nby = Math.ceil(ny / BLOCK), nbz = Math.ceil(nz / BLOCK);
  const blockCount = nbx * nby * nbz;
  const blockProg = new Array(blockCount).fill(null);
  const blockAo = new Array(blockCount).fill(null);
  const tick = onProgress || (async () => {});
  const stats = { nodes: nodeCount, activeBlocks: 0, blocks: blockCount, sampled: 0 };

  const nodeIndex = (i, j, k) => (i * NY + j) * NZ + k;

  // ---- pass 1: classify blocks and sample the field near the surface -------
  let lastYield = performance.now();
  for (let bi = 0; bi < nbx; bi++) {
    const i0 = bi * BLOCK, i1 = bi === nbx - 1 ? nx : i0 + BLOCK - 1;
    const x0 = X[i0], x1 = X[Math.min(i1 + 1, nx)];
    for (let bj = 0; bj < nby; bj++) {
      const j0 = bj * BLOCK, j1 = bj === nby - 1 ? ny : j0 + BLOCK - 1;
      const y0 = Y[j0], y1 = Y[Math.min(j1 + 1, ny)];
      for (let bk = 0; bk < nbz; bk++) {
        const k0 = bk * BLOCK, k1 = bk === nbz - 1 ? nz : k0 + BLOCK - 1;
        const z0 = Z[k0], z1 = Z[Math.min(k1 + 1, nz)];
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
        const radius = 0.5 * Math.hypot(x1 - x0, y1 - y0, z1 - z0);
        const reach = radius * 1.3;
        const prog = cullProgram(groups, cx, cy, cz, reach, 0.02);
        const fc = prog.length ? evalProgram(prog, cx, cy, cz) : 1e3;
        const b = (bi * nby + bj) * nbz + bk;
        if (Math.abs(fc) > reach + 0.012) {
          const fill = fc < 0 ? -1 : 1;
          for (let i = i0; i <= i1; i++) {
            for (let j = j0; j <= j1; j++) {
              const base = (i * NY + j) * NZ;
              for (let k = k0; k <= k1; k++) values[base + k] = fill;
            }
          }
          continue;
        }
        blockProg[b] = prog;
        stats.activeBlocks++;
        for (let i = i0; i <= i1; i++) {
          const x = X[i];
          for (let j = j0; j <= j1; j++) {
            const y = Y[j];
            const base = (i * NY + j) * NZ;
            for (let k = k0; k <= k1; k++) values[base + k] = evalProgram(prog, x, y, Z[k]);
          }
        }
        stats.sampled += (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1);
      }
    }
    if (performance.now() - lastYield > 60) {
      await tick(0.55 * (bi + 1) / nbx, 'Sampling muscle and bone');
      lastYield = performance.now();
    }
  }

  // ---- pass 2: one vertex per cell that straddles the surface ---------------
  const cellVertex = new Int32Array(nx * ny * nz).fill(-1);
  const cellIndex = (i, j, k) => (i * ny + j) * nz + k;
  const pos = [];          // xyz triples (half mesh)
  const vBlock = [];       // block index per vertex
  const vStep = [];        // local cell size per vertex
  const corner = new Float64Array(8);
  const EDGE_A = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3];
  const EDGE_B = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];

  for (let b = 0; b < blockCount; b++) {
    if (blockProg[b] === null) continue;
    const bk = b % nbz, bj = ((b - bk) / nbz) % nby, bi = (((b - bk) / nbz) - bj) / nby;
    const i0 = bi * BLOCK, i1 = Math.min(i0 + BLOCK, nx);
    const j0 = bj * BLOCK, j1 = Math.min(j0 + BLOCK, ny);
    const k0 = bk * BLOCK, k1 = Math.min(k0 + BLOCK, nz);
    for (let i = i0; i < i1; i++) {
      for (let j = j0; j < j1; j++) {
        for (let k = k0; k < k1; k++) {
          const n0 = nodeIndex(i, j, k);
          let inside = 0;
          for (let c = 0; c < 8; c++) {
            const v = values[n0 + ((c & 1) ? NY * NZ : 0) + ((c & 2) ? NZ : 0) + ((c & 4) ? 1 : 0)];
            corner[c] = v;
            if (v < 0) inside++;
          }
          if (inside === 0 || inside === 8) continue;
          let sx = 0, sy = 0, sz = 0, count = 0;
          for (let e = 0; e < 12; e++) {
            const a = EDGE_A[e], bb = EDGE_B[e];
            const va = corner[a], vb = corner[bb];
            if ((va < 0) === (vb < 0)) continue;
            const t = va / (va - vb);
            const ax = (a & 1) ? X[i + 1] : X[i], bx = (bb & 1) ? X[i + 1] : X[i];
            const ay = (a & 2) ? Y[j + 1] : Y[j], by = (bb & 2) ? Y[j + 1] : Y[j];
            const az = (a & 4) ? Z[k + 1] : Z[k], bz = (bb & 4) ? Z[k + 1] : Z[k];
            sx += ax + (bx - ax) * t;
            sy += ay + (by - ay) * t;
            sz += az + (bz - az) * t;
            count++;
          }
          cellVertex[cellIndex(i, j, k)] = pos.length / 3;
          pos.push(sx / count, sy / count, sz / count);
          vBlock.push(b);
          vStep.push(Math.min(X[i + 1] - X[i], Y[j + 1] - Y[j], Z[k + 1] - Z[k]));
        }
      }
    }
  }
  const half = pos.length / 3;
  await tick(0.6, 'Stretching the hide');

  // ---- pass 3: quads around every sign-changing grid edge -------------------
  // Vertex ids: [0, half) = right side (z > 0), [half, 2 * half) = mirrored.
  const quads = [];
  const vert = (i, j, k) => {
    if (k >= 0) return cellVertex[cellIndex(i, j, k)];
    const c = cellVertex[cellIndex(i, j, -1 - k)];
    return c < 0 ? -1 : c + half;
  };
  const pushQuad = (a, b, c, d, flip, alsoMirror) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) quads.push(d, c, b, a); else quads.push(a, b, c, d);
    if (alsoMirror) {
      // mirrored copy has the opposite winding
      if (flip) quads.push(a + half, b + half, c + half, d + half);
      else quads.push(d + half, c + half, b + half, a + half);
    }
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        if (cellVertex[cellIndex(i, j, k)] < 0) continue;
        const n0 = nodeIndex(i, j, k);
        const in0 = values[n0] < 0;
        // x edge
        if (j > 0 && (values[n0 + NY * NZ] < 0) !== in0) {
          pushQuad(vert(i, j - 1, k - 1), vert(i, j, k - 1), vert(i, j, k), vert(i, j - 1, k), !in0, k > 0);
        }
        // y edge
        if (i > 0 && (values[n0 + NZ] < 0) !== in0) {
          pushQuad(vert(i - 1, j, k - 1), vert(i - 1, j, k), vert(i, j, k), vert(i, j, k - 1), !in0, k > 0);
        }
        // z edge
        if (i > 0 && j > 0 && (values[n0 + 1] < 0) !== in0) {
          pushQuad(vert(i - 1, j - 1, k), vert(i, j - 1, k), vert(i, j, k), vert(i - 1, j, k), !in0, true);
        }
      }
    }
  }
  await tick(0.64, 'Stretching the hide');

  // ---- pass 4: pull vertices onto the true surface, take exact normals ------
  const total = half * 2;
  const P = new Float32Array(total * 3);
  const N = new Float32Array(total * 3);
  const AO = new Float32Array(total);
  const skinIndex = new Uint16Array(total * 4);
  const skinWeight = new Float32Array(total * 4);
  const acc = new Float32Array(skin.boneCount);
  const E = 0.0007;
  const AO_STEPS = [0.012, 0.03, 0.06, 0.10];
  const AO_WEIGHT = [0.36, 0.28, 0.21, 0.15];

  let dmin = 0;
  const cand = [];
  const collect = (prim, d, mirrored) => {
    if (d < dmin) dmin = d;
    cand.push(prim, d, mirrored);
  };

  for (let v = 0; v < half; v++) {
    const prog = blockProg[vBlock[v]];
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const maxStep = vStep[v] * 0.8;
    for (let it = 0; it < 2; it++) {
      const f = evalProgram(prog, x, y, z);
      const gx = (evalProgram(prog, x + E, y, z) - f) / E;
      const gy = (evalProgram(prog, x, y + E, z) - f) / E;
      const gz = (evalProgram(prog, x, y, z + E) - f) / E;
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-8) break;
      let s = f / g2;
      const len = Math.abs(s) * Math.sqrt(g2);
      if (len > maxStep) s *= maxStep / len;
      x -= gx * s; y -= gy * s; z -= gz * s;
    }
    if (z < 0) z = 0;
    let gx = evalProgram(prog, x + E, y, z) - evalProgram(prog, x - E, y, z);
    let gy = evalProgram(prog, x, y + E, z) - evalProgram(prog, x, y - E, z);
    let gz = evalProgram(prog, x, y, z + E) - evalProgram(prog, x, y, z - E);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;

    // ambient occlusion from the field itself
    let aoProg = blockAo[vBlock[v]];
    if (aoProg === null) {
      const b = vBlock[v];
      const bk = b % nbz, bj = ((b - bk) / nbz) % nby, bi = (((b - bk) / nbz) - bj) / nby;
      const ax0 = X[bi * BLOCK], ax1 = X[Math.min((bi + 1) * BLOCK, nx)];
      const ay0 = Y[bj * BLOCK], ay1 = Y[Math.min((bj + 1) * BLOCK, ny)];
      const az0 = Z[bk * BLOCK], az1 = Z[Math.min((bk + 1) * BLOCK, nz)];
      aoProg = cullProgram(groups, (ax0 + ax1) / 2, (ay0 + ay1) / 2, (az0 + az1) / 2,
        0.5 * Math.hypot(ax1 - ax0, ay1 - ay0, az1 - az0), 0.12);
      blockAo[b] = aoProg;
    }
    let occ = 0;
    for (let s = 0; s < AO_STEPS.length; s++) {
      const h = AO_STEPS[s];
      const f = evalProgram(aoProg, x + gx * h, y + gy * h, z + gz * h);
      occ += AO_WEIGHT[s] * Math.min(1, Math.max(0, 1 - f / h));
    }
    const ao = 1 - occ;

    // skin weights from the primitives that shape this bit of surface
    acc.fill(0);
    cand.length = 0;
    dmin = 1e9;
    visitPrims(prog, x, y, z, collect);
    for (let c = 0; c < cand.length; c += 3) {
      const prim = cand[c];
      if (prim.skin === null) continue;
      const w = 1 - (cand[c + 1] - dmin) / prim.reach;
      if (w <= 0) continue;
      skin.weigh(prim, x, y, z, cand[c + 2], w * w, acc);
    }
    writeSkin(acc, skinIndex, skinWeight, v);

    const m = v + half;
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    N[v * 3] = gx; N[v * 3 + 1] = gy; N[v * 3 + 2] = gz;
    AO[v] = ao;
    P[m * 3] = x; P[m * 3 + 1] = y; P[m * 3 + 2] = -z;
    N[m * 3] = gx; N[m * 3 + 1] = gy; N[m * 3 + 2] = -gz;
    AO[m] = ao;
    for (let c = 0; c < 4; c++) {
      skinIndex[m * 4 + c] = skin.mirrorBone[skinIndex[v * 4 + c]];
      skinWeight[m * 4 + c] = skinWeight[v * 4 + c];
    }

    if ((v & 2047) === 0 && performance.now() - lastYield > 60) {
      await tick(0.64 + 0.34 * v / half, 'Stretching the hide');
      lastYield = performance.now();
    }
  }

  // ---- pass 5: triangulate along the shorter diagonal -----------------------
  const index = new Uint32Array((quads.length / 4) * 6);
  let o = 0;
  let flipped = 0;
  const d2 = (a, b) => {
    const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  for (let q = 0; q < quads.length; q += 4) {
    let a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3];
    // make sure the quad faces the way the field gradient says it should
    const ux = P[c * 3] - P[a * 3], uy = P[c * 3 + 1] - P[a * 3 + 1], uz = P[c * 3 + 2] - P[a * 3 + 2];
    const vx = P[d * 3] - P[b * 3], vy = P[d * 3 + 1] - P[b * 3 + 1], vz = P[d * 3 + 2] - P[b * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx_ = N[a * 3] + N[b * 3] + N[c * 3] + N[d * 3];
    const ny_ = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1] + N[d * 3 + 1];
    const nz_ = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2] + N[d * 3 + 2];
    if (fx * nx_ + fy * ny_ + fz * nz_ < 0) {
      const t = b; b = d; d = t;
      flipped++;
    }
    if (d2(a, c) <= d2(b, d)) {
      index[o++] = a; index[o++] = b; index[o++] = c;
      index[o++] = a; index[o++] = c; index[o++] = d;
    } else {
      index[o++] = a; index[o++] = b; index[o++] = d;
      index[o++] = b; index[o++] = c; index[o++] = d;
    }
  }
  stats.vertices = total;
  stats.triangles = index.length / 3;
  stats.flippedQuads = flipped;
  await tick(1, 'Done');

  return { position: P, normal: N, ao: AO, skinIndex, skinWeight, index, stats };
}

function writeSkin(acc, skinIndex, skinWeight, v) {
  // keep the four strongest bones
  let i0 = -1, i1 = -1, i2 = -1, i3 = -1;
  let w0 = 0, w1 = 0, w2 = 0, w3 = 0;
  for (let b = 0; b < acc.length; b++) {
    const w = acc[b];
    if (w <= w3) continue;
    if (w > w0) { i3 = i2; w3 = w2; i2 = i1; w2 = w1; i1 = i0; w1 = w0; i0 = b; w0 = w; }
    else if (w > w1) { i3 = i2; w3 = w2; i2 = i1; w2 = w1; i1 = b; w1 = w; }
    else if (w > w2) { i3 = i2; w3 = w2; i2 = b; w2 = w; }
    else { i3 = b; w3 = w; }
  }
  const sum = w0 + w1 + w2 + w3;
  const o = v * 4;
  if (sum <= 0) {
    skinIndex[o] = 0; skinWeight[o] = 1;
    return;
  }
  skinIndex[o] = i0; skinWeight[o] = w0 / sum;
  skinIndex[o + 1] = i1 < 0 ? 0 : i1; skinWeight[o + 1] = w1 / sum;
  skinIndex[o + 2] = i2 < 0 ? 0 : i2; skinWeight[o + 2] = w2 / sum;
  skinIndex[o + 3] = i3 < 0 ? 0 : i3; skinWeight[o + 3] = w3 / sum;
}
