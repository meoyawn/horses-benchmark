import { clamp, coatColor, distance, skinAt } from "./sculpt.js";

const step = .0105;
const start = [-1.23, .054, -.425];
const end = [1.65, 2.12, .425];
const [nx, ny, nz] = end.map((limit, i) => Math.ceil((limit - start[i]) / step));
const gridX = nx + 1;
const gridXY = gridX * (ny + 1);
const cellXY = nx * ny;
const corners = [0, 1, gridX, 1 + gridX, gridXY, 1 + gridXY, gridX + gridXY, 1 + gridX + gridXY];
const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3],
  [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

function volumetricSamples() {
  const values = new Float32Array(gridXY * (nz + 1));
  let i = 0;
  for (let k = 0; k <= nz; k++) {
    const z = start[2] + k * step;
    for (let j = 0; j <= ny; j++) {
      const y = start[1] + j * step;
      for (let x = 0; x <= nx; x++) {
        values[i++] = distance(start[0] + x * step, y, z);
      }
    }
  }
  return values;
}

function gradient(x, y, z) {
  const h = .0025;
  return [
    (distance(x + h, y, z) - distance(x - h, y, z)) / (2 * h),
    (distance(x, y + h, z) - distance(x, y - h, z)) / (2 * h),
    (distance(x, y, z + h) - distance(x, y, z - h)) / (2 * h)
  ];
}

function meshSurface(values) {
  const ids = new Int32Array(cellXY * nz).fill(-1);
  const positions = [];
  const normals = [];
  const colors = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const origin = i + j * gridX + k * gridXY;
        const first = values[origin] < 0;
        let boundary = false;
        for (let c = 1; c < 8; c++) boundary ||= (values[origin + corners[c]] < 0) !== first;
        if (!boundary) continue;

        let u = 0;
        let v = 0;
        let w = 0;
        let crossings = 0;
        for (const [a, b] of edges) {
          const fa = values[origin + corners[a]];
          const fb = values[origin + corners[b]];
          if ((fa < 0) === (fb < 0)) continue;
          const t = fa / (fa - fb);
          u += (a & 1) * (1 - t) + (b & 1) * t;
          v += ((a >> 1) & 1) * (1 - t) + ((b >> 1) & 1) * t;
          w += (a >> 2) * (1 - t) + ((b >> 2) & 1) * t;
          crossings++;
        }

        let x = start[0] + step * (i + u / crossings);
        let y = start[1] + step * (j + v / crossings);
        let z = start[2] + step * (k + w / crossings);
        const [gx, gy, gz] = gradient(x, y, z);
        const correction = clamp(distance(x, y, z) / (gx * gx + gy * gy + gz * gz || 1), -.005, .005);
        x -= gx * correction;
        y -= gy * correction;
        z -= gz * correction;
        const [dx, dy, dz] = gradient(x, y, z);
        const size = Math.hypot(dx, dy, dz) || 1;
        const [bones, weights] = skinAt(x, y, z);

        const cell = i + j * nx + k * cellXY;
        ids[cell] = positions.length / 3;
        positions.push(x, y, z);
        normals.push(dx / size, dy / size, dz / size);
        colors.push(...coatColor(x, y, z));
        skinIndices.push(...bones);
        skinWeights.push(...weights);

        if (j > 0 && k > 0 && (values[origin + 1] < 0) !== first) {
          appendQuad(cell, cell - nx, cell - nx - cellXY, cell - cellXY, first);
        }
        if (i > 0 && k > 0 && (values[origin + gridX] < 0) !== first) {
          appendQuad(cell, cell - cellXY, cell - cellXY - 1, cell - 1, first);
        }
        if (i > 0 && j > 0 && (values[origin + gridXY] < 0) !== first) {
          appendQuad(cell, cell - 1, cell - 1 - nx, cell - nx, first);
        }
      }
    }
  }

  function appendQuad(a, b, c, d, forward) {
    if (ids[a] < 0 || ids[b] < 0 || ids[c] < 0 || ids[d] < 0) return;
    if (forward) indices.push(ids[a], ids[b], ids[c], ids[a], ids[c], ids[d]);
    else indices.push(ids[a], ids[c], ids[b], ids[a], ids[d], ids[c]);
  }

  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals),
    colors: new Float32Array(colors), indices: new Uint32Array(indices),
    skinIndices: new Uint16Array(skinIndices), skinWeights: new Float32Array(skinWeights)
  };
}

const surface = meshSurface(volumetricSamples());
postMessage(surface, Object.values(surface).map(attribute => attribute.buffer));
