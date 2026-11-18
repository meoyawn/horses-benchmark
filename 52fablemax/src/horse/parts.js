// Hand-built parametric geometry for the parts that need crisp edges:
// hooves, eyeballs, eyelids and ears.
import * as THREE from 'three';
import { HOOF } from './rig.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};

function finish(positions, indices, extra = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  for (const [name, [data, size]] of Object.entries(extra)) {
    g.setAttribute(name, new THREE.Float32BufferAttribute(data, size));
  }
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Hoof capsule in the hoof bone's frame (origin at the coffin joint, +X toe).
 * Attribute `hoofUv` = (angle around the wall 0..1, height 0 at the ground .. 1
 * at the coronet); height < 0 marks the sole.
 */
export function createHoofGeometry(kind) {
  const spec = HOOF[kind];
  const ground = spec.toe[1];
  const toeX = spec.toe[0], heelX = spec.heel[0];
  const halfW = kind === 'fore' ? 0.066 : 0.061;
  const wallToe = kind === 'fore' ? 0.088 : 0.092;
  const wallHeel = 0.04;
  const slope = (kind === 'fore' ? 51.5 : 54.5) * Math.PI / 180;
  // coronet ring: toe and heel walls rise parallel, leaning back
  const topToe = [toeX - wallToe * Math.cos(slope), ground + wallToe * Math.sin(slope)];
  const topHeel = [heelX - wallHeel * Math.cos(slope), ground + wallHeel * Math.sin(slope)];
  const topHalfW = halfW * 0.8;

  const N = 48;
  const outline = (i, cx, a, b) => {
    const th = (i / N) * TAU;
    const c = Math.cos(th), s = Math.sin(th);
    // rounder toe, narrower heels
    const narrow = 1 - 0.2 * Math.pow(Math.max(0, -c), 1.6);
    return [cx + a * (c > 0 ? Math.pow(c, 0.86) : -Math.pow(-c, 0.95)), b * s * narrow];
  };
  const gCx = (toeX + heelX) / 2, gA = (toeX - heelX) / 2;
  const tCx = (topToe[0] + topHeel[0]) / 2, tA = (topToe[0] - topHeel[0]) / 2;
  const topY = (x) => topHeel[1] + (topToe[1] - topHeel[1]) * (x - topHeel[0]) / (topToe[0] - topHeel[0]);

  const pos = [];
  const uv = [];
  const idx = [];
  const ring = (fn, v) => {
    const start = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const p = fn(i);
      pos.push(p[0], p[1], p[2]);
      uv.push(i / N, v);
    }
    return start;
  };
  const bridge = (a, b) => {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      idx.push(a + i, b + i, b + j, a + i, b + j, a + j);
    }
  };
  const wallPoint = (i, t) => {
    const g = outline(i, gCx, gA, halfW);
    const tp = outline(i, tCx, tA, topHalfW);
    const bulge = 1 + 0.035 * Math.sin(Math.PI * t); // faint convexity of the wall
    const x = g[0] + (tp[0] - g[0]) * t;
    const z = (g[1] + (tp[1] - g[1]) * t) * bulge;
    const y = ground + (topY(tp[0]) - ground) * t;
    return [x, y, z];
  };

  // wall rings from the bearing edge up to the coronet
  const WALL = [0.035, 0.2, 0.42, 0.64, 0.84, 1.0];
  const walls = WALL.map((t) => ring((i) => wallPoint(i, t), t));
  for (let r = 0; r < walls.length - 1; r++) bridge(walls[r], walls[r + 1]);
  // rounded top lip tucked under the hairline, then closed
  const lip = ring((i) => {
    const p = wallPoint(i, 1);
    return [tCx + (p[0] - tCx) * 0.86, p[1] + 0.008, p[2] * 0.86];
  }, 1.02);
  bridge(walls[walls.length - 1], lip);
  const topCentre = pos.length / 3;
  pos.push(tCx, topY(tCx) + 0.012, 0);
  uv.push(0, 1.05);
  for (let i = 0; i < N; i++) idx.push(lip + i, topCentre, lip + ((i + 1) % N));

  // worn bevel, bearing rim and slightly cupped sole
  const bevel = ring((i) => {
    const g = outline(i, gCx, gA, halfW);
    return [gCx + (g[0] - gCx) * 0.965, ground, g[1] * 0.965];
  }, -0.1);
  bridge(bevel, walls[0]);
  const sole = ring((i) => {
    const g = outline(i, gCx, gA, halfW);
    return [gCx + (g[0] - gCx) * 0.8, ground + 0.004, g[1] * 0.8];
  }, -0.5);
  bridge(sole, bevel);
  const soleCentre = pos.length / 3;
  pos.push(gCx, ground + 0.012, 0);
  uv.push(0, -1);
  for (let i = 0; i < N; i++) idx.push(sole + i, sole + ((i + 1) % N), soleCentre);

  return finish(pos, idx, { hoofUv: [uv, 2] });
}

/**
 * Ear shell, base at the origin, pointing along +Y, opening towards +X.
 * Attribute `earUv` = (0 outer skin .. 1 inner skin, 0 base .. 1 tip).
 */
export function createEarGeometry(length = 0.168) {
  const NT = 22, NA = 22;
  const thickness = 0.0034;
  const pos = [];
  const uv = [];
  const idx = [];
  const radius = (t) => 0.041 * (0.58 + 0.42 * smooth(0, 0.38, t)) * Math.pow(Math.max(0, 1 - Math.pow(t, 3.2)), 0.75);
  const halfArc = (t) => (2.9 - 1.0 * smooth(0.0, 0.45, t) + 0.3 * smooth(0.7, 1, t)); // radians either side of the back
  const axis = (t) => {
    // gentle S-curve: leans back from the base, tip hooks forward and inwards
    const y = length * t;
    const x = -0.02 * Math.sin(Math.PI * t * 0.9) + 0.012 * t * t;
    const z = -0.012 * t * t;
    return [x, y, z];
  };
  const point = (t, a, inset) => {
    const c = axis(t);
    const r = Math.max(0, radius(t) - inset);
    const ang = Math.PI + a; // the closed side faces -X
    // flatten slightly front to back
    return [c[0] + r * Math.cos(ang) * 0.82, c[1], c[2] + r * Math.sin(ang)];
  };
  const grid = (inset, side) => {
    const start = pos.length / 3;
    for (let it = 0; it <= NT; it++) {
      const t = it / NT;
      const ha = halfArc(t);
      for (let ia = 0; ia <= NA; ia++) {
        const a = -ha + (2 * ha * ia) / NA;
        const p = point(t * 0.995, a, inset * (1 - 0.6 * t));
        pos.push(p[0], p[1], p[2]);
        uv.push(side, t);
      }
    }
    return start;
  };
  const outer = grid(0, 0);
  const inner = grid(thickness, 1);
  const W = NA + 1;
  for (let it = 0; it < NT; it++) {
    for (let ia = 0; ia < NA; ia++) {
      const a = it * W + ia, b = a + 1, c = a + W, d = c + 1;
      idx.push(outer + a, outer + d, outer + b, outer + a, outer + c, outer + d);
      idx.push(inner + a, inner + b, inner + d, inner + a, inner + d, inner + c);
    }
    // close the two rims
    const o0 = outer + it * W, o1 = o0 + W, i0 = inner + it * W, i1 = i0 + W;
    idx.push(o0, o1, i1, o0, i1, i0);
    const oe = outer + it * W + NA, oe1 = oe + W, ie = inner + it * W + NA, ie1 = ie + W;
    idx.push(oe, ie1, oe1, oe, ie, ie1);
  }
  return finish(pos, idx, { earUv: [uv, 2] });
}

/** Eyeball: a sphere whose +Z pole carries the iris. */
export function createEyeGeometry(radius = 0.0255) {
  return new THREE.SphereGeometry(radius, 40, 28).rotateX(Math.PI / 2);
}

/**
 * Upper eyelid: a spherical cap segment just proud of the eyeball. It hides
 * above the eye and is rotated about +X to blink.
 */
export function createLidGeometry(radius = 0.0268) {
  // from the pole (+Y) down to 78 degrees, across the visible half
  const g = new THREE.SphereGeometry(radius, 28, 14, -0.15 * Math.PI, 1.3 * Math.PI, 0, 1.36);
  return g;
}
