// Procedural ear geometry: a lofted, cupped "C" section that tapers to a point.
// Returned in rest-pose world coordinates, ready to be merged into the skinned body.
import { v3 } from './sdf.js';

export function buildEar(lm, scale = 1) {
  const S = scale;
  const L = 0.155 * S; // length
  const Rmax = 0.036 * S;
  const NS = 26, NP = 14;
  const A = v3.norm(lm.axis);
  // front (opening) direction made perpendicular to the axis
  let F = v3.sub(lm.open, v3.mul(A, v3.dot(lm.open, A)));
  F = v3.norm(F);
  const Bk = v3.mul(F, -1); // back of the ear
  const Lt = v3.norm(v3.cross(A, F));
  const outward = Math.sign(v3.dot(Lt, [0, 0, lm.s])) || 1; // lateral away from the head
  const pos = [], tag = [], ao = [];
  const ring = 2 * NP;
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    const sEff = -0.18 + 1.18 * s; // start below the skin so the base is buried
    const sc = Math.max(0, sEff);
    // width profile: swells a little above the base then tapers to a point
    let r = Rmax * Math.pow(Math.max(0, 1 - Math.pow(sc, 1.6)), 0.75) * (0.86 + 0.55 * sc * (1 - sc));
    if (i === NS) r = 0.0006 * S;
    const t = (0.0055 - 0.003 * sc) * S; // wall thickness
    const alpha = (150 - 50 * Math.min(1, sc * 1.4)) * (Math.PI / 180);
    // centreline gently curves forward and the tip turns slightly inward
    const c = v3.add(
      v3.add(lm.base, v3.mul(A, sEff * L)),
      v3.add(v3.mul(F, 0.012 * S * sc * sc), v3.mul(Lt, -0.012 * S * outward * sc * sc)),
    );
    const depth = 0.72; // flatten front-back
    for (let side = 0; side < 2; side++) {
      for (let j = 0; j < NP; j++) {
        const f = j / (NP - 1);
        const phi = side === 0 ? -alpha + 2 * alpha * f : alpha - 2 * alpha * f;
        const rr = side === 0 ? r : Math.max(r - t, r * 0.25);
        const p = v3.add(c, v3.add(v3.mul(Bk, Math.cos(phi) * rr * depth), v3.mul(Lt, Math.sin(phi) * rr)));
        pos.push(...p);
        // inner surface: dark skin, occluded deep inside
        if (side === 1) {
          tag.push(0, 0.85, 0, 0);
          const deep = 1 - Math.abs(phi) / alpha; // 1 at the back of the cup
          ao.push(Math.max(0.25, 0.85 - 0.55 * deep * (1 - sc * 0.6)));
        } else {
          tag.push(0, 0, 0, 0);
          ao.push(0.8 + 0.2 * Math.min(1, sc * 2));
        }
      }
    }
  }
  const idx = [];
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + j, d = (i + 1) * ring + ((j + 1) % ring);
      idx.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(pos), indices: idx, tags: new Float32Array(tag), ao: new Float32Array(ao) };
}
