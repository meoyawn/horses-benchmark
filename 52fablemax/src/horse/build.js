// Turns the sculpt into renderable geometry.
import * as THREE from 'three';
import { makeAxis, polygonise } from '../sculpt/mesher.js';
import { buildSculpt } from './anatomy.js';
import { SKIN } from './skeleton.js';

const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};

/**
 * Polygonises the body. `quality` scales the sampling density (1 = full).
 * The grid is finer around the head, where the small forms live.
 */
export async function buildBodyGeometry(quality = 1, onProgress) {
  const groups = buildSculpt();
  const coarse = 0.0085 / quality;
  const fine = 0.0046 / quality;
  const axes = {
    x: makeAxis(-1.02, 1.66, (x) => mix(coarse, fine, smooth(0.88, 0.97, x))),
    y: makeAxis(-0.03, 2.08, (y) => mix(coarse, fine, smooth(1.22, 1.31, y))),
    z: makeAxis(0, 0.4, (z) => mix(fine, coarse, smooth(0.11, 0.16, z))),
  };
  const t0 = performance.now();
  const data = await polygonise(groups, axes, SKIN, onProgress);
  data.stats.ms = Math.round(performance.now() - t0);
  data.stats.grid = [axes.x.length, axes.y.length, axes.z.length];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(data.skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(data.skinWeight, 4));
  geometry.setAttribute('ao', new THREE.BufferAttribute(data.ao, 1));
  geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, stats: data.stats, groups };
}
