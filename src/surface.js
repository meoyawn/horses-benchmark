import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(low, high, value) {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
}

export function seededRandom(seed) {
  return function next() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function interpolate(entries, index, channel, t) {
  const a = entries[index];
  const b = entries[index + 1];
  const previous = entries[Math.max(0, index - 1)];
  const next = entries[Math.min(entries.length - 1, index + 2)];
  const span = b[0] - a[0];
  const slopeA = (b[channel] - previous[channel]) / (b[0] - previous[0]);
  const slopeB = (next[channel] - a[channel]) / (next[0] - a[0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a[channel] + (t3 - 2 * t2 + t) * span * slopeA
    + (-2 * t3 + 3 * t2) * b[channel] + (t3 - t2) * span * slopeB;
}

/** Samples a closed stack of elliptical cross sections into a common skin field. */
export function createSculpt() {
  const spacing = 0.0125;
  const origin = [-1.54, -0.03, -0.55];
  const size = [278, 193, 89];
  const [width, height, depth] = size;
  const plane = width * height;
  const scalar = new Float32Array(plane * depth).fill(0.25);

  function loft(entries, { origin: pivot = [0, 0], axis = [1, 0], cross = [0, 1], blend = 0.04 } = {}) {
    const [ax, ay] = axis;
    const [bx, by] = cross;
    const [px, py] = pivot;
    const start = entries[0][0];
    const end = entries[entries.length - 1][0];
    const resolution = 256;
    const sections = new Float32Array((resolution + 1) * 4);
    const lower = [Infinity, Infinity, Infinity];
    const upper = [-Infinity, -Infinity, -Infinity];
    let segment = 0;

    for (let i = 0; i <= resolution; i++) {
      const u = lerp(start, end, i / resolution);
      while (segment < entries.length - 2 && u > entries[segment + 1][0]) segment++;
      const t = (u - entries[segment][0]) / (entries[segment + 1][0] - entries[segment][0]);
      const middle = interpolate(entries, segment, 1, t);
      const height = Math.max(0.001, interpolate(entries, segment, 2, t));
      const width = Math.max(0.001, interpolate(entries, segment, 3, t));
      const centerZ = entries[segment].length > 4 ? interpolate(entries, segment, 4, t) : 0;
      sections.set([middle, height, width, centerZ], i * 4);
      const x = px + ax * u + bx * middle;
      const y = py + ay * u + by * middle;
      lower[0] = Math.min(lower[0], x - Math.abs(bx) * height);
      lower[1] = Math.min(lower[1], y - Math.abs(by) * height);
      lower[2] = Math.min(lower[2], centerZ - width);
      upper[0] = Math.max(upper[0], x + Math.abs(bx) * height);
      upper[1] = Math.max(upper[1], y + Math.abs(by) * height);
      upper[2] = Math.max(upper[2], centerZ + width);
    }

    const padding = blend + spacing * 2;
    const [xMin, yMin, zMin] = lower.map((value, i) => Math.max(0, Math.floor((value - padding - origin[i]) / spacing)));
    const [xMax, yMax, zMax] = upper.map((value, i) => Math.min(size[i] - 1, Math.ceil((value + padding - origin[i]) / spacing)));
    for (let j = yMin; j <= yMax; j++) {
      const y = origin[1] + j * spacing - py;
      for (let i = xMin; i <= xMax; i++) {
        const x = origin[0] + i * spacing - px;
        const u = x * ax + y * ay;
        const cap = Math.max(start - u, u - end);
        if (cap > padding) continue;
        const section = clamp((u - start) / (end - start) * resolution, 0, resolution);
        const index = Math.min(resolution - 1, Math.floor(section));
        const s = index * 4;
        const t = section - index;
        const offset = x * bx + y * by - lerp(sections[s], sections[s + 4], t);
        const radius = lerp(sections[s + 1], sections[s + 5], t);
        if (Math.abs(offset) > radius + padding) continue;
        const halfWidth = lerp(sections[s + 2], sections[s + 6], t);
        const midZ = lerp(sections[s + 3], sections[s + 7], t);
        const sectionDistance = (offset / radius) ** 2;
        const ellipseScale = Math.min(radius, halfWidth);
        const firstZ = Math.max(zMin, Math.floor((midZ - halfWidth - padding - origin[2]) / spacing));
        const lastZ = Math.min(zMax, Math.ceil((midZ + halfWidth + padding - origin[2]) / spacing));
        for (let k = firstZ; k <= lastZ; k++) {
          const z = origin[2] + k * spacing;
          const ellipse = (Math.sqrt(sectionDistance + ((z - midZ) / halfWidth) ** 2) - 1) * ellipseScale;
          const distance = Math.max(cap, ellipse);
          const cell = i + j * width + k * plane;
          const existing = scalar[cell];
          const smoothing = Math.max(0, blend - Math.abs(existing - distance));
          scalar[cell] = Math.min(existing, distance) - smoothing * smoothing / (4 * blend);
        }
      }
    }
  }

  function valueAt(x, y, z) {
    const tx = clamp((x - origin[0]) / spacing, 0, width - 1.00001);
    const ty = clamp((y - origin[1]) / spacing, 0, height - 1.00001);
    const tz = clamp((z - origin[2]) / spacing, 0, depth - 1.00001);
    const i = Math.floor(tx);
    const j = Math.floor(ty);
    const k = Math.floor(tz);
    const cell = i + j * width + k * plane;
    const x0 = tx - i;
    const y0 = ty - j;
    const z0 = tz - k;
    const front = lerp(lerp(scalar[cell], scalar[cell + 1], x0), lerp(scalar[cell + width], scalar[cell + width + 1], x0), y0);
    const backCell = cell + plane;
    const back = lerp(lerp(scalar[backCell], scalar[backCell + 1], x0), lerp(scalar[backCell + width], scalar[backCell + width + 1], x0), y0);
    return lerp(front, back, z0);
  }

  function normalAt(x, y, z) {
    const e = spacing * 0.95;
    return new Vector3(
      valueAt(x + e, y, z) - valueAt(x - e, y, z),
      valueAt(x, y + e, z) - valueAt(x, y - e, z),
      valueAt(x, y, z + e) - valueAt(x, y, z - e),
    ).normalize();
  }

  function sideAt(x, y, side) {
    if (valueAt(x, y, 0) > 0) return null;
    let inside = 0;
    let outside = 0.50;
    for (let i = 0; i < 13; i++) {
      const middle = (inside + outside) / 2;
      if (valueAt(x, y, middle * side) < 0) inside = middle;
      else outside = middle;
    }
    return new Vector3(x, y, (inside + outside) * 0.5 * side);
  }

  function project(start, direction, distance) {
    if (valueAt(start.x, start.y, start.z) > 0) return null;
    const point = new Vector3();
    let inside = 0;
    let outside = distance;
    for (let i = 0; i < 12; i++) {
      const t = (inside + outside) / 2;
      point.copy(start).addScaledVector(direction, t);
      if (valueAt(point.x, point.y, point.z) < 0) inside = t;
      else outside = t;
    }
    return point.copy(start).addScaledVector(direction, (inside + outside) / 2);
  }

  function indent([x, y], [length, breadth], angle, amount) {
    const reach = Math.max(length, breadth);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const firstX = Math.floor((x - reach - origin[0]) / spacing);
    const lastX = Math.ceil((x + reach - origin[0]) / spacing);
    const firstY = Math.floor((y - reach - origin[1]) / spacing);
    const lastY = Math.ceil((y + reach - origin[1]) / spacing);
    for (let j = firstY; j <= lastY; j++) {
      for (let i = firstX; i <= lastX; i++) {
        const dx = origin[0] + i * spacing - x;
        const dy = origin[1] + j * spacing - y;
        const u = (cos * dx + sin * dy) / length;
        const v = (cos * dy - sin * dx) / breadth;
        const press = amount * (1 - smoothstep(0.02, 1, u * u + v * v));
        if (press <= 0) continue;
        for (let k = 0; k < depth; k++) {
          const side = Math.abs(origin[2] + k * spacing);
          scalar[i + j * width + k * plane] += press * smoothstep(0.028, 0.070, side);
        }
      }
    }
  }

  function geometry() {
    const corners = [0, 1, width, width + 1, plane, plane + 1, plane + width, plane + width + 1];
    const edges = [
      [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
      [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7],
    ];
    const neighboringCells = [[width, plane], [plane, 1], [1, width]];
    const cells = new Int32Array(scalar.length).fill(-1);
    const values = new Float32Array(8);
    const vertices = [];
    const normals = [];
    const indices = [];

    for (let k = 0; k < depth - 1; k++) {
      for (let j = 0; j < height - 1; j++) {
        for (let i = 0; i < width - 1; i++) {
          const cell = i + j * width + k * plane;
          let inside = 0;
          for (let c = 0; c < 8; c++) {
            values[c] = scalar[cell + corners[c]];
            if (values[c] < 0) inside |= 1 << c;
          }
          if (inside === 0 || inside === 255) continue;
          let x = 0;
          let y = 0;
          let z = 0;
          let crossings = 0;
          for (const [a, b] of edges) {
            if ((values[a] < 0) === (values[b] < 0)) continue;
            const t = values[a] / (values[a] - values[b]);
            x += lerp(a & 1, b & 1, t);
            y += lerp((a >> 1) & 1, (b >> 1) & 1, t);
            z += lerp(a >> 2, b >> 2, t);
            crossings++;
          }
          x = origin[0] + (i + x / crossings) * spacing;
          y = origin[1] + (j + y / crossings) * spacing;
          z = origin[2] + (k + z / crossings) * spacing;
          const normal = normalAt(x, y, z);
          const vertex = vertices.length / 3;
          cells[cell] = vertex;
          vertices.push(x, y, z);
          normals.push(normal.x, normal.y, normal.z);

          for (let axis = 0; axis < 3; axis++) {
            if ((values[0] < 0) === (values[1 << axis] < 0)) continue;
            const [u, v] = neighboringCells[axis];
            const b = cells[cell - u];
            const c = cells[cell - u - v];
            const d = cells[cell - v];
            if (b < 0 || c < 0 || d < 0) continue;
            if (values[0] < 0) indices.push(vertex, b, c, vertex, c, d);
            else indices.push(vertex, d, c, vertex, c, b);
          }
        }
      }
    }

    const mesh = new BufferGeometry();
    mesh.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    mesh.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    mesh.setIndex(indices);
    return mesh;
  }

  return { loft, sideAt, project, indent, geometry };
}
