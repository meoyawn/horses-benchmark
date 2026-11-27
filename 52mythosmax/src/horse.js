// Builds the horse: skeleton, skinned body mesh from the sculpt, coat colouring.
import * as THREE from 'three';
import { Sculpt } from './sdf.js';
import { boneTable, sculptHorse, SCULPT_BOUNDS } from './anatomy.js';
import { buildParts } from './parts.js';
import { buildHair } from './hair.js';

export const COATS = {
  bay: { body: '#74401f', dark: '#0f0b09', hair: '#0d0a08', skin: '#191412', points: 1, hoof: '#231e1b' },
  chestnut: { body: '#8a4a22', dark: '#5d2e14', hair: '#7c421d', skin: '#33241d', points: 0.25, hoof: '#3a2e26' },
  black: { body: '#191614', dark: '#0a0908', hair: '#080707', skin: '#121010', points: 1, hoof: '#141211' },
  palomino: { body: '#c4914a', dark: '#a87a3c', hair: '#ece2c8', skin: '#3a2c25', points: 0.15, hoof: '#5a4a3a' },
  grey: { body: '#aeaba6', dark: '#4a4744', hair: '#d2cfc9', skin: '#262321', points: 0.7, hoof: '#2b2826', dapple: 1 },
};
const WHITE = new THREE.Color('#e9e3d9');

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (x, y, z) => {
  const s = Math.sin(x * 12.71 + y * 78.13 + z * 37.39) * 43758.5;
  return s - Math.floor(s);
};
/** Smooth 3D value noise in 0..1. */
export function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz
  );
}

/** Distance (in cells) to the nearest of a set of jittered points: the basis for dapples. */
function cells(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let best = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cx = ix + a, cy = iy + b, cz = iz + c;
    const dx = cx + hash(cx, cy, cz) - x, dy = cy + hash(cy, cz, cx + 7.3) - y, dz = cz + hash(cz, cx, cy + 3.1) - z;
    best = Math.min(best, dx * dx + dy * dy + dz * dz);
  }
  return Math.sqrt(best);
}

/** Coat colour at a rest-pose surface point (p) with normal (n). */
function coatColor(coat, markings, px, py, pz, nx, ny, nz, target) {
  const body = coat._body, dark = coat._dark, skin = coat._skin;
  target.copy(body);
  // Counter-shading and soft mottling.
  let lum = 1 - 0.13 * smooth(0.2, 1, ny) + 0.1 * smooth(0.1, 1, -ny) * smooth(0.8, 1.0, py);
  lum *= 0.93 + 0.14 * noise3(px * 7, py * 7, pz * 7);
  if (coat.dapple) {
    // Pale rings on a darker ground, strongest over the barrel and quarters.
    const spot = 1 - smooth(0.22, 0.5, cells(px * 15, py * 15, pz * 15));
    const where = smooth(0.75, 1.05, py) * (1 - smooth(1.05, 1.3, px)) * (0.6 + 0.4 * noise3(px * 3, py * 3, pz * 3));
    lum *= lerp(1, 0.74 + 0.36 * spot, where);
  }
  target.multiplyScalar(lum);
  // Dark "points": lower legs, and the tail dock.
  const legs = (1 - smooth(0.46, 0.72, py + 0.05 * noise3(px * 20, py * 6, pz * 20))) * coat.points;
  target.lerp(dark, legs);
  target.lerp(dark, smooth(-0.8, -0.87, px) * smooth(1.22, 1.3, py) * 0.95);
  // Bare skin: muzzle, nostrils, around the eyes.
  const mz = Math.hypot(px - 1.49, py - 1.45, pz * 0.8);
  target.lerp(skin, (1 - smooth(0.05, 0.15, mz)) * 0.92);
  const no = Math.hypot(px - 1.521, py - 1.47, Math.abs(pz) - 0.047);
  target.multiplyScalar(0.25 + 0.75 * smooth(0.008, 0.03, no));
  const ey = Math.hypot(px - 1.25, py - 1.803, Math.abs(pz) - 0.089);
  target.lerp(skin, 1 - smooth(0.03, 0.05, ey));

  if (markings) {
    // Star and stripe down the face.
    const rx = px - 1.165, ry = py - 1.865;
    const along = rx * 0.643 - ry * 0.766;
    const facing = nx * 0.766 + ny * 0.643, across = rx * 0.766 + ry * 0.643;
    const wob = 0.6 + 0.8 * noise3(px * 40, py * 40, 0);
    let half = 0;
    if (along > -0.01 && along < 0.115) half = 0.036 * Math.sqrt(Math.max(0, 1 - ((along - 0.052) / 0.062) ** 2)) * wob;
    if (along >= 0.09 && along < 0.31) half = Math.max(half, 0.011 * wob * smooth(0.31, 0.24, along));
    if (facing > 0.2 && across > 0.02 && Math.abs(pz) < half) target.lerp(WHITE, smooth(0, 0.006, half - Math.abs(pz)));
    // One white sock, left hind.
    if (px < 0 && pz < 0) {
      const top = 0.37 + 0.035 * noise3(px * 30, pz * 30, 1.5);
      target.lerp(WHITE, 1 - smooth(top - 0.02, top, py));
    }
  }
}

/** Adds fine, hair-like variation to a coat material (no textures needed). */
function addCoatGrain(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 rest;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = rest;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRest;
        float cHash(vec3 p){ return fract(sin(dot(p, vec3(12.71, 78.13, 37.39))) * 43758.5); }
        float cNoise(vec3 x){
          vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(cHash(i), cHash(i+vec3(1,0,0)), f.x), mix(cHash(i+vec3(0,1,0)), cHash(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(cHash(i+vec3(0,0,1)), cHash(i+vec3(1,0,1)), f.x), mix(cHash(i+vec3(0,1,1)), cHash(i+vec3(1,1,1)), f.x), f.y), f.z);
        }
        float coatGrain = 0.5;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float along = cNoise(vRest * vec3(70.0, 330.0, 330.0));
          float down = cNoise(vRest * vec3(330.0, 70.0, 330.0));
          float g = mix(down, along, smoothstep(0.7, 0.95, vRest.y));
          float px = length(fwidth(vRest));
          coatGrain = mix(0.5, g, 1.0 - smoothstep(0.0008, 0.0035, px));
          diffuseColor.rgb *= 0.86 + 0.28 * coatGrain;
          // the line of the mouth
          vec2 pa = vRest.xy - vec2(1.56, 1.395), ba = vec2(-0.118, 0.088);
          float dm = length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
          diffuseColor.rgb *= mix(0.3, 1.0, smoothstep(0.0012, 0.0045, dm));
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (coatGrain - 0.5) * 0.25, 0.08, 1.0);`
      );
  };
}

export function buildHorse(onProgress = () => {}) {
  // ---- Skeleton -----------------------------------------------------------
  const table = boneTable();
  const bones = {}, rest = {}, index = {}, list = [];
  table.forEach(([name, , x, y, z], i) => {
    const b = new THREE.Bone();
    b.name = name;
    bones[name] = b; rest[name] = new THREE.Vector3(x, y, z); index[name] = i;
    list.push(b);
  });
  for (const [name, parent] of table) {
    if (parent) {
      bones[parent].add(bones[name]);
      bones[name].position.copy(rest[name]).sub(rest[parent]);
    } else bones[name].position.copy(rest[name]);
  }
  const root = new THREE.Group();
  root.name = 'horse';
  root.add(bones.pelvis);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);

  // ---- Body ---------------------------------------------------------------
  const sculpt = new Sculpt(index);
  sculptHorse(sculpt);
  const m = sculpt.mesh({ ...SCULPT_BOUNDS, cell: 0.0125 });
  onProgress('body');
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  geo.setAttribute('rest', new THREE.BufferAttribute(m.positions.slice(), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.positions.length), 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(m.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4));
  geo.setIndex(new THREE.BufferAttribute(m.indices, 1));

  const coatMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.56, metalness: 0,
    sheen: 1, sheenRoughness: 0.42, sheenColor: new THREE.Color('#8a6a4a'),
  });
  addCoatGrain(coatMat);
  const mesh = new THREE.SkinnedMesh(geo, coatMat);
  mesh.name = 'body';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.bind(skeleton);

  const horse = { root, mesh, bones, rest, skeleton, sculpt, coatName: 'bay', markings: true };
  horse.parts = buildParts(horse);
  horse.hair = buildHair(horse);

  const tmp = new THREE.Color();
  horse.setCoat = (name = horse.coatName, markings = horse.markings) => {
    const coat = COATS[name];
    horse.coatName = name; horse.markings = markings;
    coat._body = new THREE.Color(coat.body); coat._dark = new THREE.Color(coat.dark);
    coat._skin = new THREE.Color(coat.skin); coat._hair = new THREE.Color(coat.hair);
    const P = m.positions, N = m.normals, C = geo.attributes.color.array;
    for (let i = 0; i < P.length; i += 3) {
      coatColor(coat, markings, P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], tmp);
      C[i] = tmp.r; C[i + 1] = tmp.g; C[i + 2] = tmp.b;
    }
    geo.attributes.color.needsUpdate = true;
    coatMat.sheenColor.copy(coat._body).lerp(new THREE.Color('#ffffff'), 0.35);
    horse.parts.setCoat(coat, markings);
    horse.hair.setCoat(coat);
  };
  horse.setCoat();
  return horse;
}
