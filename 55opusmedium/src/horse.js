// Procedural horse: SDF-sculpted skinned body, strand hair, and a
// keyframe-free gait engine (walk / trot / canter) driven by phase functions.
import * as THREE from 'three';
import { Prim, Field, polygonize } from './sdf.js';

const SIDES = [['L', -1], ['R', 1]]; // +z is the horse's right side
// stretches the neck forward: points on the neck/head are pushed along +x
const NECK_DX = (x) => { const t = Math.min(1, Math.max(0, (x - 0.45) / 0.52)); return 0.13 * t * t * (3 - 2 * t); };
const warp = (p) => [p[0] + NECK_DX(p[0]), p[1], p[2]];

export const COATS = {
  bay: { label: 'Bay', coat: 0x74401f, points: 0x15100d, hoof: 0x2b2420, muzzle: 0x3a271c, hair: 0x120e0b, hairTip: 0x2a1b12, sheen: 0xd09a72, belly: 0x8a5532 },
  chestnut: { label: 'Chestnut', coat: 0x93491d, points: 0x7e3b16, hoof: 0x56443a, muzzle: 0x5c3520, hair: 0x9c5022, hairTip: 0xc77d3e, sheen: 0xf0a76c, belly: 0xa65e2e },
  black: { label: 'Black', coat: 0x1c1816, points: 0x131010, hoof: 0x2a2522, muzzle: 0x2a201b, hair: 0x0d0b0a, hairTip: 0x1d1714, sheen: 0x8fa0b2, belly: 0x26201c },
  grey: { label: 'Dapple grey', coat: 0xc2bdb5, points: 0x6c6762, hoof: 0x3b3633, muzzle: 0x4b4441, hair: 0xc9c2b6, hairTip: 0xece6da, sheen: 0xffffff, belly: 0xd2cec7, dapple: 0x8a857e },
  palomino: { label: 'Palomino', coat: 0xd2a058, points: 0xbf8c47, hoof: 0x4f4237, muzzle: 0x6a4934, hair: 0xefe0bd, hairTip: 0xfff7e2, sheen: 0xffe2a8, belly: 0xdcb070 },
};

// ---------------------------------------------------------------- skeleton
function defineBones() {
  const B = [];
  const add = (name, parent, p) => B.push({ name, parent, p: /^(neck|head)/.test(name) ? warp(p) : p });
  add('root', null, [0, 1.3, 0]);
  add('chest', 'root', [0.3, 1.35, 0]);
  add('pelvis', 'root', [-0.45, 1.38, 0]);
  add('neck1', 'chest', [0.48, 1.42, 0]);
  add('neck2', 'neck1', [0.72, 1.7, 0]);
  add('neck3', 'neck2', [0.9, 1.9, 0]);
  add('head', 'neck3', [1.0, 1.99, 0]);
  for (const [n, s] of SIDES) {
    add('scap' + n, 'chest', [0.36, 1.48, 0.13 * s]);
    add('humerus' + n, 'scap' + n, [0.64, 1.14, 0.18 * s]);
    add('forearm' + n, 'humerus' + n, [0.47, 0.93, 0.17 * s]);
    add('fcannon' + n, 'forearm' + n, [0.475, 0.51, 0.165 * s]);
    add('fpastern' + n, 'fcannon' + n, [0.47, 0.19, 0.165 * s]);
    add('fhoof' + n, 'fpastern' + n, [0.53, 0.075, 0.165 * s]);
    add('femur' + n, 'pelvis', [-0.58, 1.3, 0.2 * s]);
    add('tibia' + n, 'femur' + n, [-0.38, 1.0, 0.21 * s]);
    add('hcannon' + n, 'tibia' + n, [-0.665, 0.58, 0.17 * s]);
    add('hpastern' + n, 'hcannon' + n, [-0.65, 0.19, 0.165 * s]);
    add('hhoof' + n, 'hpastern' + n, [-0.59, 0.075, 0.165 * s]);
  }
  TAIL.forEach((p, i) => { if (i < TAIL.length - 1) add('tail' + i, i ? 'tail' + (i - 1) : 'pelvis', [p[0], p[1], 0]); });
  return B;
}
const TAIL = [[-0.86, 1.47], [-0.97, 1.28], [-1.01, 1.1], [-1.04, 0.92], [-1.06, 0.75], [-1.07, 0.58], [-1.075, 0.4]];

// ---------------------------------------------------------------- body shape
function definePrims() {
  const P = [];
  const p = (o) => { if (/^(neck|head)/.test(o.bone)) { o.a = warp(o.a); if (o.b) o.b = warp(o.b); } P.push(o); };
  // barrel, belly, hindquarters
  p({ a: [0.42, 1.3, 0], b: [0.05, 1.28, 0], r1: 0.28, r2: 0.325, s: [1, 1, 0.86], k: 0.1, bone: 'chest' });
  p({ a: [0.05, 1.28, 0], b: [-0.42, 1.32, 0], r1: 0.325, r2: 0.3, s: [1, 1, 0.9], k: 0.1, bone: 'root' });
  p({ a: [-0.42, 1.33, 0], b: [-0.76, 1.35, 0], r1: 0.3, r2: 0.235, s: [1, 1, 0.88], k: 0.1, bone: 'pelvis' });
  p({ a: [0.08, 1.47, 0], b: [0.37, 1.5, 0], r1: 0.13, r2: 0.1, s: [1, 1, 0.72], k: 0.1, bone: 'chest' }); // withers
  p({ a: [-0.1, 1.46, 0], b: [-0.35, 1.47, 0], r1: 0.12, r2: 0.13, s: [1, 1, 1.4], k: 0.1, bone: 'root' }); // loin
  for (const [, s] of SIDES) {
    p({ a: [-0.32, 1.43, 0.1 * s], b: [-0.8, 1.39, 0.1 * s], r1: 0.17, r2: 0.155, k: 0.1, bone: 'pelvis' }); // croup
  }
  // neck
  p({ a: [0.42, 1.33, 0], b: [0.72, 1.67, 0], r1: 0.265, r2: 0.185, s: [1, 1, 0.58], k: 0.1, bone: 'neck1' });
  p({ a: [0.72, 1.67, 0], b: [0.93, 1.9, 0], r1: 0.185, r2: 0.12, s: [1, 1, 0.56], k: 0.08, bone: 'neck2' });
  p({ a: [0.3, 1.57, 0], b: [0.68, 1.84, 0], r1: 0.1, r2: 0.082, s: [1, 1, 0.65], k: 0.1, bone: 'neck1' }); // crest
  p({ a: [0.68, 1.84, 0], b: [0.96, 2.02, 0], r1: 0.082, r2: 0.066, s: [1, 1, 0.65], k: 0.08, bone: 'neck2' });
  p({ a: [0.92, 1.84, 0], b: [0.98, 1.93, 0], r1: 0.1, s: [1, 1, 0.7], k: 0.06, bone: 'neck3' }); // throatlatch
  // head
  p({ a: [1.0, 1.98, 0], b: [1.08, 1.92, 0], r1: 0.092, r2: 0.098, s: [1, 1, 0.95], k: 0.05, bone: 'head' }); // cranium
  p({ a: [0.97, 1.84, 0], b: [1.06, 1.77, 0], r1: 0.118, r2: 0.098, s: [1, 1, 0.78], k: 0.06, bone: 'head' }); // jowl
  p({ a: [1.08, 1.92, 0], b: [1.29, 1.56, 0], r1: 0.082, r2: 0.064, s: [1, 1, 1], k: 0.05, bone: 'head' }); // face
  p({ a: [1.06, 1.76, 0], b: [1.26, 1.48, 0], r1: 0.058, r2: 0.044, s: [1, 1, 0.9], k: 0.05, bone: 'head' }); // jaw
  p({ a: [1.285, 1.535, 0], b: [1.325, 1.48, 0], r1: 0.071, r2: 0.067, s: [1, 1, 0.92], k: 0.04, bone: 'head', tone: 3 }); // muzzle
  p({ a: [1.265, 1.448, 0], r1: 0.042, k: 0.035, bone: 'head', tone: 3 }); // chin
  for (const [, s] of SIDES) {
    p({ a: [1.065, 1.905, 0.072 * s], b: [1.13, 1.885, 0.07 * s], r1: 0.034, r2: 0.028, k: 0.04, bone: 'head' }); // brow
    p({ a: [1.0, 1.82, 0.075 * s], b: [1.06, 1.76, 0.07 * s], r1: 0.05, k: 0.05, bone: 'head' }); // cheek muscle
  }
  // tail dock
  p({ a: [-0.82, 1.47, 0], b: [-0.97, 1.28, 0], r1: 0.075, r2: 0.055, k: 0.06, bone: 'tail0' });
  p({ a: [-0.97, 1.28, 0], b: [-1.0, 1.14, 0], r1: 0.055, r2: 0.04, k: 0.04, bone: 'tail1' });

  for (const [n, s] of SIDES) {
    // ---- foreleg
    p({ a: [0.38, 1.47, 0.14 * s], b: [0.62, 1.12, 0.17 * s], r1: 0.1, r2: 0.15, s: [1, 1, 0.62], k: 0.1, bone: 'scap' + n });
    p({ a: [0.62, 1.2, 0.09 * s], b: [0.55, 1.0, 0.08 * s], r1: 0.15, r2: 0.12, s: [1, 1, 0.9], k: 0.08, bone: 'chest' }); // breast
    p({ a: [0.6, 1.12, 0.17 * s], b: [0.46, 0.98, 0.17 * s], r1: 0.13, r2: 0.11, s: [1, 1, 0.72], k: 0.08, bone: 'humerus' + n });
    p({ a: [0.47, 0.96, 0.17 * s], b: [0.475, 0.56, 0.165 * s], r1: 0.085, r2: 0.045, s: [1, 1, 0.78], k: 0.05, bone: 'forearm' + n });
    p({ a: [0.478, 0.53, 0.165 * s], b: [0.478, 0.47, 0.165 * s], r1: 0.05, r2: 0.045, s: [1, 1, 0.82], k: 0.03, bone: 'fcannon' + n, tone: 1 });
    p({ a: [0.475, 0.48, 0.165 * s], b: [0.47, 0.22, 0.165 * s], r1: 0.036, r2: 0.033, s: [1.2, 1, 0.75], k: 0.03, bone: 'fcannon' + n, tone: 1 });
    p({ a: [0.47, 0.2, 0.165 * s], b: [0.46, 0.18, 0.165 * s], r1: 0.048, r2: 0.046, s: [1, 1, 0.85], k: 0.03, bone: 'fpastern' + n, tone: 1 });
    p({ a: [0.47, 0.18, 0.165 * s], b: [0.53, 0.085, 0.165 * s], r1: 0.038, r2: 0.04, s: [1, 1, 0.9], k: 0.025, bone: 'fpastern' + n, tone: 1 });
    p({ a: [0.53, 0.085, 0.165 * s], b: [0.565, 0.02, 0.165 * s], r1: 0.045, r2: 0.06, s: [1, 1, 0.9], k: 0.015, bone: 'fhoof' + n, tone: 2, flat: true });
    // ---- hind leg
    p({ a: [-0.55, 1.25, 0.15 * s], b: [-0.4, 1.0, 0.19 * s], r1: 0.2, r2: 0.13, s: [1, 1, 0.75], k: 0.1, bone: 'femur' + n }); // thigh
    p({ a: [-0.8, 1.32, 0.12 * s], b: [-0.6, 0.98, 0.15 * s], r1: 0.15, r2: 0.11, s: [1, 1, 0.85], k: 0.08, bone: 'femur' + n }); // hamstring
    p({ a: [-0.42, 1.0, 0.19 * s], b: [-0.65, 0.63, 0.17 * s], r1: 0.11, r2: 0.058, s: [1, 1, 0.8], k: 0.06, bone: 'tibia' + n }); // gaskin
    p({ a: [-0.56, 0.95, 0.17 * s], b: [-0.715, 0.64, 0.17 * s], r1: 0.07, r2: 0.03, s: [1, 1, 0.7], k: 0.05, bone: 'tibia' + n }); // achilles
    p({ a: [-0.665, 0.6, 0.17 * s], b: [-0.665, 0.52, 0.17 * s], r1: 0.055, r2: 0.047, s: [1, 1, 0.8], k: 0.03, bone: 'hcannon' + n, tone: 1 }); // hock
    p({ a: [-0.718, 0.625, 0.17 * s], r1: 0.032, k: 0.03, bone: 'hcannon' + n, tone: 1 }); // point of hock
    p({ a: [-0.665, 0.52, 0.168 * s], b: [-0.655, 0.22, 0.165 * s], r1: 0.038, r2: 0.034, s: [1.2, 1, 0.75], k: 0.03, bone: 'hcannon' + n, tone: 1 });
    p({ a: [-0.65, 0.2, 0.165 * s], b: [-0.658, 0.18, 0.165 * s], r1: 0.048, r2: 0.046, s: [1, 1, 0.85], k: 0.03, bone: 'hpastern' + n, tone: 1 });
    p({ a: [-0.65, 0.18, 0.165 * s], b: [-0.59, 0.085, 0.165 * s], r1: 0.038, r2: 0.04, s: [1, 1, 0.9], k: 0.025, bone: 'hpastern' + n, tone: 1 });
    p({ a: [-0.59, 0.085, 0.165 * s], b: [-0.555, 0.02, 0.165 * s], r1: 0.045, r2: 0.06, s: [1, 1, 0.9], k: 0.015, bone: 'hhoof' + n, tone: 2, flat: true });
  }
  return P;
}

// ---------------------------------------------------------------- noise
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(
    L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}
function fbm(x, y, z) { return vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.15; }

let seed = 1234567;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---------------------------------------------------------------- gaits
const GAITS = {
  stand: { f: 0.5, duty: 1 },
  walk: {
    f: 0.92, duty: 0.62, ph: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 },
    fore: { A: 0.25, B: 0.25, K: 1.0, E: 0.35, F1: 0.22, F2: 0.75 },
    hind: { A: 0.26, B: 0.26, S: 0.32, H: 0.72, F1: 0.2, F2: 0.75 },
    nod: 0.05, pitch: 0.0, tail: 0.05,
  },
  trot: {
    f: 1.35, duty: 0.44, ph: { LH: 0, RF: 0, RH: 0.5, LF: 0.5 },
    fore: { A: 0.34, B: 0.34, K: 1.5, E: 0.62, F1: 0.36, F2: 1.05 },
    hind: { A: 0.33, B: 0.33, S: 0.52, H: 1.1, F1: 0.33, F2: 1.0 },
    nod: 0.015, pitch: 0.012, tail: 0.25,
  },
  canter: {
    f: 1.6, duty: 0.4, ph: { LH: 0, RH: 0.2, LF: 0.26, RF: 0.42 },
    fore: { A: 0.42, B: 0.4, K: 1.6, E: 0.65, F1: 0.4, F2: 1.1 },
    hind: { A: 0.4, B: 0.38, S: 0.58, H: 1.25, F1: 0.36, F2: 1.05 },
    nod: 0.1, pitch: 0.06, tail: 0.45,
  },
};
export const GAIT_ORDER = ['stand', 'walk', 'trot', 'canter'];

const LEGS = [
  { id: 'LF', fore: true, n: 'L' }, { id: 'RF', fore: true, n: 'R' },
  { id: 'LH', fore: false, n: 'L' }, { id: 'RH', fore: false, n: 'R' },
];
for (const L of LEGS) {
  L.chain = (L.fore ? ['scap', 'humerus', 'forearm', 'fcannon', 'fpastern'] : ['femur', 'tibia', 'hcannon', 'hpastern']).map(b => b + L.n);
  L.hoof = (L.fore ? 'fhoof' : 'hhoof') + L.n;
  L.girdle = L.fore ? 'chest' : 'pelvis';
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Joint angles (about the lateral z axis) for one leg at stride phase u.
function legAngles(fore, u, duty, P, out) {
  let main, load = 0, early = 0, late = 0, earlier = 0, st;
  if (u < duty) {
    const s = u / duty;
    main = P.A - (P.A + P.B) * s;
    load = Math.sin(Math.PI * s);
    st = 1 - 0.6 * smooth(0.8, 1, s);
  } else {
    const w = (u - duty) / (1 - duty);
    main = -P.B + (P.A + P.B) * (0.5 - 0.5 * Math.cos(Math.PI * w));
    early = Math.sin(Math.PI * Math.pow(w, 0.7));
    late = Math.sin(Math.PI * Math.pow(w, 1.25));
    earlier = Math.sin(Math.PI * Math.pow(w, 0.5));
    st = 0.4 * (1 - smooth(0, 0.25, w)) + smooth(0.75, 1, w);
  }
  if (fore) {
    out[0] = main; out[1] = 0; out[2] = P.E * late; out[3] = -P.K * early; out[4] = P.F1 * load - P.F2 * earlier;
  } else {
    out[0] = main; out[1] = -P.S * early - 0.05 * load; out[2] = P.H * early + 0.1 * load; out[3] = P.F1 * load - P.F2 * earlier; out[4] = 0;
  }
  out[5] = -0.5 * early; // hoof attitude while airborne
  out[6] = st; // how "planted" the hoof is (1 = flat on the ground)
  return out;
}

const CONTACTS = [new THREE.Vector3(0.09, -0.075, 0), new THREE.Vector3(-0.02, -0.075, 0)];

export class Horse {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'horse';
    const t0 = performance.now();
    this.buildSkeleton();
    this.buildBody();
    this.buildHair();
    this.buildFace();
    this.buildTimeMs = performance.now() - t0;

    this.weights = { stand: 1, walk: 0, trot: 0, canter: 0 };
    this.gait = 'stand';
    this.phase = 0;
    this.time = 0;
    this.groundY = 0;
    this.speed = 0;
    this.steer = 0;
    this.lookTarget = null; // horse-local Vector3
    this.look = { yaw: 0, pitch: 0 };
    this.graze = 0; this.grazeOn = false;
    this.rearT = -1; this.rear = 0;
    this.petT = -1;
    this.swishT = -10; this.swishSide = 1;
    this.earState = [{ yaw: 0, back: 0, t: 0 }, { yaw: 0, back: 0, t: 0 }];
    this._a = new Float32Array(7);
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this.measureSpeeds();
    this.setCoat('bay');
  }

  // ---------------------------------------------------------------- build
  buildSkeleton() {
    this.bones = {}; this.boneIdx = {}; this.restWorld = {};
    const list = [];
    for (const d of defineBones()) {
      const b = new THREE.Bone(); b.name = d.name;
      const p = new THREE.Vector3(...d.p);
      this.restWorld[d.name] = p;
      if (d.parent) { b.position.copy(p).sub(this.restWorld[d.parent]); this.bones[d.parent].add(b); }
      else b.position.copy(p);
      this.bones[d.name] = b; this.boneIdx[d.name] = list.length; list.push(b);
    }
    this.boneList = list;
    this.restLocal = list.map(b => b.position.clone());
    this.bones.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(list);
  }

  buildBody() {
    const prims = definePrims().map(o => new Prim(o));
    this.field = new Field(prims);
    const { positions, normals, indices } = polygonize(this.field, [-1.12, -0.012, -0.42], [1.62, 2.2, 0.42], 0.0095);
    const nv = positions.length / 3;
    const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4);
    const tones = new Float32Array(nv * 4), detail = new Float32Array(nv * 2);
    const nb = this.boneList.length;
    const acc = new Float32Array(nb);
    const ds = new Float32Array(prims.length);
    for (let v = 0; v < nv; v++) {
      const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
      let dmin = 1e9;
      for (let i = 0; i < prims.length; i++) {
        const p = prims[i];
        ds[i] = p.near(x, y, z, 0.15) ? p.dist(x, y, z) : 1e9;
        if (ds[i] < dmin) dmin = ds[i];
      }
      acc.fill(0);
      const t4 = [0, 0, 0, 0];
      let tw = 0;
      for (let i = 0; i < prims.length; i++) {
        if (ds[i] > 1e8) continue;
        const dd = ds[i] - dmin;
        acc[this.boneIdx[prims[i].bone]] += Math.exp(-dd / 0.028);
        const wt = Math.exp(-dd / 0.012);
        t4[prims[i].tone] += wt; tw += wt;
      }
      // top 4 bones
      const top = [];
      for (let b = 0; b < nb; b++) if (acc[b] > 1e-4) top.push(b);
      top.sort((a, b) => acc[b] - acc[a]);
      let sum = 0;
      for (let j = 0; j < 4 && j < top.length; j++) sum += acc[top[j]];
      for (let j = 0; j < 4; j++) {
        skinIndex[v * 4 + j] = j < top.length ? top[j] : 0;
        skinWeight[v * 4 + j] = j < top.length ? acc[top[j]] / sum : 0;
      }
      for (let j = 0; j < 4; j++) tones[v * 4 + j] = t4[j] / tw;
      detail[v * 2] = fbm(x * 6, y * 6, z * 6);
      detail[v * 2 + 1] = fbm(x * 14 + 17, y * 14, z * 9 + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    this.tones = tones; this.detail = detail;
    this.bodyMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.5, metalness: 0,
      sheen: 0.8, sheenRoughness: 0.32, sheenColor: new THREE.Color(0xc89070),
      clearcoat: 0.12, clearcoatRoughness: 0.55,
    });
    this.body = new THREE.SkinnedMesh(geo, this.bodyMat);
    this.body.name = 'horseBody';
    this.body.castShadow = true; this.body.receiveShadow = true;
    this.body.frustumCulled = false;
    this.body.add(this.bones.root);
    this.group.add(this.body);
    this.body.updateMatrixWorld(true);
    this.body.bind(this.skeleton);
    this.vertexCount = nv; this.triCount = indices.length / 3;
  }

  // weights from the body field at a point (used to rig hair)
  weightsAt(x, y, z) {
    const P = this.field.prims;
    let dmin = 1e9; const ds = [];
    for (const p of P) { const d = p.near(x, y, z, 0.2) ? p.dist(x, y, z) : 1e9; ds.push(d); if (d < dmin) dmin = d; }
    const acc = {};
    P.forEach((p, i) => { if (ds[i] < 1e8) acc[p.bone] = (acc[p.bone] || 0) + Math.exp(-(ds[i] - dmin) / 0.03); });
    const top = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = top.reduce((a, b) => a + b[1], 0);
    return top.map(([b, w]) => [this.boneIdx[b], w / s]);
  }

  buildHair() {
    const pos = [], nor = [], col = [], si = [], sw = [], idx = [];
    const shade = []; // per-vertex: 0 root .. 1 tip, plus per-strand random
    const F = this.field;
    const g = [0, 0, 0];
    const T = new THREE.Vector3(), Sd = new THREE.Vector3(), N = new THREE.Vector3(), G = new THREE.Vector3();
    const pushOut = (p, thick) => {
      for (let it = 0; it < 3; it++) {
        const d = F.at(p.x, p.y, p.z);
        if (d >= thick) break;
        F.grad(p.x, p.y, p.z, g);
        p.x += g[0] * (thick - d); p.y += g[1] * (thick - d); p.z += g[2] * (thick - d);
      }
    };
    // emit one ribbon strand
    const emit = (pts, width, weightsFn, sideFn, tone) => {
      const base = pos.length / 3;
      const n = pts.length;
      const r = rand();
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        if (i < n - 1) T.subVectors(pts[i + 1], p); else T.subVectors(p, pts[i - 1]);
        T.normalize();
        sideFn(p, T, Sd);
        Sd.sub(G.copy(T).multiplyScalar(Sd.dot(T))).normalize();
        N.crossVectors(T, Sd).normalize();
        const t = i / (n - 1);
        const w = width * (1 - 0.85 * t * t);
        for (const sgn of [-1, 1]) {
          pos.push(p.x + Sd.x * w * sgn * 0.5, p.y + Sd.y * w * sgn * 0.5, p.z + Sd.z * w * sgn * 0.5);
          nor.push(N.x, N.y, N.z);
          shade.push(t, r, tone);
          const W = weightsFn(t);
          for (let j = 0; j < 4; j++) { si.push(W[j] ? W[j][0] : 0); sw.push(W[j] ? W[j][1] : 0); }
        }
        if (i < n - 1) {
          const a = base + i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    };

    // ---- mane: falls to the right (+z) side, draped over the neck by the SDF
    for (let s = 0; s < 1100; s++) {
      const u = Math.pow(rand(), 0.9);
      const x0 = 0.36 + u * 0.62, x = x0 + NECK_DX(x0);
      const zj = (rand() - 0.5) * 0.035;
      const hit = F.march([x, 2.5, zj], [0, -1, 0], 1.2);
      if (!hit) continue;
      const root = new THREE.Vector3(hit[0], hit[1] - 0.004, hit[2]);
      const W = this.weightsAt(root.x, root.y - 0.03, root.z);
      const len = (0.17 + rand() * 0.14) * (u > 0.9 ? 0.7 : 1);
      const dir = new THREE.Vector3(-0.25 + rand() * 0.15, 0.35, 1).normalize();
      const pts = [root.clone()];
      const p = root.clone();
      const seg = 9, sl = len / seg;
      const thick = 0.004 + rand() * 0.022;
      for (let i = 0; i < seg; i++) {
        dir.y -= 0.32; dir.x += (rand() - 0.5) * 0.08; dir.normalize();
        p.addScaledVector(dir, sl);
        pushOut(p, thick);
        pts.push(p.clone());
      }
      emit(pts, 0.014 + rand() * 0.008, () => W, (pp, t, out) => { F.grad(pp.x, pp.y, pp.z, g); out.crossVectors(t, G.set(g[0], g[1], g[2])); }, 0);
    }
    // ---- forelock
    const headW = [[this.boneIdx.head, 1]];
    for (let s = 0; s < 170; s++) {
      const z = (rand() - 0.5) * 0.06;
      const hit = F.march([1.115 + rand() * 0.03, 2.4, z], [0, -1, 0], 0.6);
      if (!hit) continue;
      const p = new THREE.Vector3(hit[0], hit[1] - 0.003, hit[2]);
      const pts = [p.clone()];
      const dir = new THREE.Vector3(1, 0.5, (rand() - 0.5) * 0.5).normalize();
      const len = 0.13 + rand() * 0.11, seg = 8;
      const thick = 0.004 + rand() * 0.012;
      for (let i = 0; i < seg; i++) {
        dir.y -= 0.3; dir.normalize();
        p.addScaledVector(dir, len / seg);
        pushOut(p, thick);
        pts.push(p.clone());
      }
      emit(pts, 0.013, () => headW, (pp, t, out) => { F.grad(pp.x, pp.y, pp.z, g); out.crossVectors(t, G.set(g[0], g[1], g[2])); }, 0);
    }
    // ---- tail: strands follow the tail bone chain
    const C = TAIL.map(p => new THREE.Vector3(p[0], p[1], 0));
    const cum = [0];
    for (let i = 1; i < C.length; i++) cum.push(cum[i - 1] + C[i].distanceTo(C[i - 1]));
    const total = cum[cum.length - 1];
    const chainAt = (s, out) => {
      let i = 0;
      while (i < C.length - 2 && s > cum[i + 1]) i++;
      const f = (s - cum[i]) / (cum[i + 1] - cum[i]);
      out.lerpVectors(C[i], C[i + 1], f);
      return [i, f];
    };
    const nTailBones = TAIL.length - 1;
    const tailW = (seg, f) => {
      const b = (k) => this.boneIdx['tail' + Math.max(0, Math.min(nTailBones - 1, k))];
      if (seg >= nTailBones) return [[b(nTailBones - 1), 1]];
      if (f < 0.5) return seg === 0 ? [[b(0), 1]] : [[b(seg), 0.5 + f], [b(seg - 1), 0.5 - f]];
      return seg + 1 >= nTailBones ? [[b(seg), 1]] : [[b(seg), 1.5 - f], [b(seg + 1), f - 0.5]];
    };
    const dockLen = cum[2];
    for (let s = 0; s < 1700; s++) {
      const sA = rand() * dockLen * 0.95;
      const sB = total * (0.72 + rand() * 0.3);
      const ang = (rand() - 0.5) * Math.PI * 1.5; // spread around the back half
      const radial = new THREE.Vector3(-Math.cos(ang) * 0.8, 0, Math.sin(ang));
      const spread = 0.03 + rand() * 0.1;
      const seg = 12;
      const pts = [], ws = [];
      const q = new THREE.Vector3();
      for (let i = 0; i <= seg; i++) {
        const u = i / seg;
        const sp = sA + (sB - sA) * u;
        const [ci, f] = chainAt(Math.min(sp, total), q);
        const r0 = 0.055 * (1 - sA / dockLen * 0.4);
        const off = r0 * (1 - u) + spread * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05)) * (0.6 + u) * 0.9;
        const p = q.clone().addScaledVector(radial, off);
        p.y -= Math.max(0, sp - total) * 0.9;
        pts.push(p);
        ws.push(tailW(ci, f));
      }
      const wsCopy = ws;
      emit(pts, 0.012 + rand() * 0.008, (t) => wsCopy[Math.round(t * seg)], (pp, t, out) => out.copy(radial).cross(t).cross(t), 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.setIndex(idx);
    this.hairShade = shade;
    this.hairMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.62, side: THREE.DoubleSide, envMapIntensity: 0.3,
      sheen: 0.6, sheenRoughness: 0.3, sheenColor: new THREE.Color(0x777777),
    });
    this.hair = new THREE.SkinnedMesh(geo, this.hairMat);
    this.hair.name = 'horseHair';
    this.hair.castShadow = true; this.hair.receiveShadow = true;
    this.hair.frustumCulled = false;
    this.group.add(this.hair);
    this.hair.bind(this.skeleton, new THREE.Matrix4());
  }

  buildFace() {
    const head = this.bones.head;
    const hw = this.restWorld.head;
    const F = this.field;
    const toHead = (p) => new THREE.Vector3(p[0], p[1], p[2]).sub(hw);
    // eyes
    this.eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x1a0d07, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.4 });
    const eyeGeo = new THREE.SphereGeometry(0.022, 24, 16);
    this.ears = [];
    for (const [, s] of SIDES) {
      const hit = F.march([1.245, 1.858, 0.3 * s], [0, 0, -s], 0.3);
      const eye = new THREE.Mesh(eyeGeo, this.eyeMat);
      eye.scale.set(1.15, 0.95, 0.8);
      eye.position.copy(toHead(hit)).add(new THREE.Vector3(0, 0, -0.011 * s));
      eye.rotation.y = 0.35 * s;
      head.add(eye);
      // eyelid crease: thin dark ring hugging the eye
      const lid = new THREE.Mesh(new THREE.TorusGeometry(0.0225, 0.0045, 8, 28), new THREE.MeshStandardMaterial({ color: 0x1c130e, roughness: 0.8 }));
      lid.position.copy(eye.position).add(new THREE.Vector3(0, 0, 0.006 * s));
      lid.rotation.y = Math.PI / 2 * 0 + 0.35 * s;
      lid.scale.set(1.2, 0.95, 1);
      lid.castShadow = false;
      head.add(lid);
      // nostrils
      const nh = F.march([1.75, 1.5, 0.038 * s], [-1, 0, 0], 0.5);
      if (nh) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshStandardMaterial({ color: 0x0c0807, roughness: 0.9 }));
        n.scale.set(0.45, 1.05, 0.6);
        n.position.copy(toHead(nh)).add(new THREE.Vector3(-0.004, 0, 0));
        n.rotation.set(0, 0.5 * s, -0.25);
        head.add(n);
      }
      // ears
      const eh = F.march([1.125, 2.4, 0.058 * s], [0, -1, 0], 0.6);
      const pivot = new THREE.Group();
      pivot.position.copy(toHead(eh)).add(new THREE.Vector3(0, -0.012, 0));
      pivot.rotation.order = 'YXZ';
      const ear = new THREE.Mesh(this.makeEarGeometry(), null);
      ear.castShadow = true;
      ear.rotation.set(-0.22 * s, 0, -0.12);
      pivot.add(ear);
      head.add(pivot);
      this.ears.push({ pivot, ear, s });
    }
    this.earMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, sheen: 0.6, sheenRoughness: 0.4 });
    for (const e of this.ears) e.ear.material = this.earMat;
  }

  makeEarGeometry() {
    const prof = [[0.001, 0], [0.03, 0.006], [0.04, 0.035], [0.039, 0.07], [0.03, 0.1], [0.017, 0.128], [0.004, 0.145], [0.0005, 0.148]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(prof, 20);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), z = p.getZ(i);
      z *= 0.8;
      let inner = 0;
      if (x > 0) { x = -x * 0.25; inner = 1; }
      p.setXYZ(i, x, p.getY(i), z);
      col[i * 3] = inner; // inner flag stored temporarily in red channel
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.userData.inner = col.filter((_, i) => i % 3 === 0);
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------- coat
  setCoat(name) {
    const c = COATS[name]; if (!c) return;
    this.coat = name;
    const cc = k => new THREE.Color(c[k]);
    const T = [cc('coat'), cc('points'), cc('hoof'), cc('muzzle')];
    const belly = cc('belly'), dap = c.dapple ? cc('dapple') : null;
    const pos = this.body.geometry.attributes.position;
    const colA = this.body.geometry.attributes.color;
    const tmp = new THREE.Color(), tmp2 = new THREE.Color();
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      tmp.setRGB(0, 0, 0);
      // coat base with lighter belly / flank and darker topline
      const bellyF = smooth(1.15, 0.92, y) * (1 - smooth(0.85, 0.7, y)) * 0.55;
      tmp2.copy(T[0]).lerp(belly, bellyF);
      const n1 = this.detail[v * 2], n2 = this.detail[v * 2 + 1];
      if (dap) {
        // dapples: a darker net around lighter round spots
        const net = 1 - smooth(0.02, 0.13, Math.abs(n2 - 0.5));
        tmp2.lerp(dap, (0.2 + net * 0.32) * smooth(0.5, 1.0, y));
      }
      tmp2.multiplyScalar(0.88 + n1 * 0.24);
      tmp.r += tmp2.r * this.tones[v * 4]; tmp.g += tmp2.g * this.tones[v * 4]; tmp.b += tmp2.b * this.tones[v * 4];
      for (let t = 1; t < 4; t++) {
        const w = this.tones[v * 4 + t];
        tmp.r += T[t].r * w; tmp.g += T[t].g * w; tmp.b += T[t].b * w;
      }
      colA.setXYZ(v, tmp.r, tmp.g, tmp.b);
    }
    colA.needsUpdate = true;
    this.bodyMat.sheenColor.set(c.sheen).multiplyScalar(0.45);
    // hair
    const hc = this.hair.geometry.attributes.color;
    const h0 = cc('hair'), h1 = cc('hairTip');
    for (let v = 0; v < hc.count; v++) {
      const t = this.hairShade[v * 3], r = this.hairShade[v * 3 + 1];
      tmp.copy(h0).lerp(h1, t * 0.6 + r * 0.25).multiplyScalar(0.75 + r * 0.45);
      hc.setXYZ(v, tmp.r, tmp.g, tmp.b);
    }
    hc.needsUpdate = true;
    this.hairMat.sheenColor.copy(h1).multiplyScalar(0.6);
    // ears: outer = coat, inner = darker
    for (const e of this.ears) {
      const g = e.ear.geometry, a = g.attributes.color, inner = g.userData.inner;
      for (let i = 0; i < a.count; i++) {
        tmp.copy(T[0]).lerp(T[1], 0.25);
        if (inner[i]) tmp.multiplyScalar(0.45);
        a.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      a.needsUpdate = true;
    }
    this.earMat.sheenColor.set(c.sheen).multiplyScalar(0.3);
  }

  // ---------------------------------------------------------------- animation
  setGait(g) { if (GAITS[g]) this.gait = g; }
  gaitStep(d) {
    const i = Math.max(0, Math.min(GAIT_ORDER.length - 1, GAIT_ORDER.indexOf(this.gait) + d));
    this.gait = GAIT_ORDER[i];
  }
  startRear() { if (this.rearT < 0) { this.rearT = 0; this.gait = 'stand'; this.grazeOn = false; } }
  pet() { this.petT = 0; }

  resetPose() {
    this.boneList.forEach((b, i) => { b.position.copy(this.restLocal[i]); b.rotation.set(0, 0, 0); });
  }

  applyLeg(L, a, wsum) {
    const B = this.bones;
    const c = L.chain;
    B[c[0]].rotation.z += a[0];
    if (L.fore) { B[c[2]].rotation.z += a[2]; B[c[3]].rotation.z += a[3]; B[c[4]].rotation.z += a[4]; }
    else { B[c[1]].rotation.z += a[1]; B[c[2]].rotation.z += a[2]; B[c[3]].rotation.z += a[3]; }
  }

  measureSpeeds() {
    const L = LEGS[0];
    const toe = (u, g) => {
      this.resetPose();
      legAngles(true, u, g.duty, g.fore, this._a);
      this.applyLeg(L, this._a);
      this.bones.root.updateMatrixWorld(true);
      return this._v.copy(CONTACTS[0]).applyMatrix4(this.bones[L.hoof].matrixWorld).x;
    };
    for (const k of GAIT_ORDER) {
      const g = GAITS[k];
      if (k === 'stand') { g.speed = 0; continue; }
      const dx = toe(0, g) - toe(g.duty * 0.999, g);
      g.speed = dx * g.f / g.duty;
    }
    this.resetPose();
  }

  update(dt, input) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const t = this.time;
    const B = this.bones;
    // gait blend weights
    let fsum = 0, speed = 0;
    for (const k of GAIT_ORDER) {
      const target = k === this.gait ? 1 : 0;
      this.weights[k] += (target - this.weights[k]) * (1 - Math.exp(-dt * 3.2));
      if (k !== 'stand') { fsum += this.weights[k] * GAITS[k].f; speed += this.weights[k] * GAITS[k].speed; }
    }
    const wsum = GAIT_ORDER.reduce((a, k) => a + this.weights[k], 0);
    const moving = 1 - this.weights.stand / wsum;
    fsum += this.weights.stand * 0.9;
    this.phase = (this.phase + dt * fsum / wsum) % 1;
    this.speed = speed / wsum;
    const ph = this.phase;

    this.resetPose();

    // ---- legs: blend all gaits
    const stance = { LF: 0, RF: 0, LH: 0, RH: 0 };
    const hoofSwing = { LF: 0, RF: 0, LH: 0, RH: 0 };
    let rootZ = 0, nod = 0, tailLift = 0;
    for (const k of GAIT_ORDER) {
      const w = this.weights[k] / wsum;
      if (w < 1e-3) continue;
      const g = GAITS[k];
      if (k === 'stand') {
        for (const L of LEGS) stance[L.id] += w;
        // resting (cocked) right hind leg
        const cock = w * (0.5 + 0.5 * smooth(-0.3, 0.3, Math.sin(t * 0.13)));
        B.femurR.rotation.z += 0.06 * cock; B.tibiaR.rotation.z -= 0.16 * cock;
        B.hcannonR.rotation.z += 0.34 * cock; B.hpasternR.rotation.z -= 0.75 * cock;
        hoofSwing.RH += -0.15 * cock; stance.RH -= cock;
        B.pelvis.rotation.x += 0.035 * cock;
        B.root.position.y += -0.004 * cock + 0.003 * Math.sin(t * 1.6) * w;
        continue;
      }
      for (const L of LEGS) {
        const u = (ph + g.ph[L.id]) % 1;
        const a = legAngles(L.fore, u, g.duty, L.fore ? g.fore : g.hind, this._a);
        for (let i = 0; i < 5; i++) a[i] *= w;
        this.applyLeg(L, a);
        hoofSwing[L.id] += a[5] * w;
        stance[L.id] += a[6] * w;
      }
      rootZ += w * g.pitch * Math.sin(2 * Math.PI * (ph + 0.15));
      nod += w * g.nod * (k === 'walk' ? Math.sin(4 * Math.PI * (ph + 0.1)) : Math.sin(2 * Math.PI * (ph + 0.35)));
      tailLift += w * g.tail;
    }
    B.root.rotation.z += rootZ;
    B.root.rotation.x += -this.steer * this.speed * 0.012;

    // ---- graze
    this.graze += ((this.grazeOn ? 1 : 0) - this.graze) * (1 - Math.exp(-dt * 1.6));
    const gz = this.graze * (1 - moving);
    if (gz > 1e-3) {
      B.neck1.rotation.z -= 1.45 * gz; B.neck2.rotation.z -= 0.25 * gz; B.neck3.rotation.z -= 0.1 * gz; B.head.rotation.z += 1.0 * gz;
      B.head.rotation.z += 0.06 * gz * Math.sin(t * 5.5) * (Math.sin(t * 0.7) > 0 ? 1 : 0);
      B.scapL.rotation.z += 0.3 * gz; B.scapR.rotation.z -= 0.12 * gz;
      B.chest.rotation.z -= 0.04 * gz; B.scapL.rotation.z += 0.04 * gz; B.scapR.rotation.z += 0.04 * gz;
    }

    // ---- rear (one-shot)
    let rear = 0;
    if (this.rearT >= 0) {
      this.rearT += dt;
      const r = this.rearT;
      rear = smooth(0, 0.75, r) * (1 - smooth(1.6, 2.6, r));
      if (r > 2.7) this.rearT = -1;
    }
    this.rear = rear;
    if (rear > 1e-3) {
      const e = rear;
      B.root.rotation.z += 0.68 * e;
      for (const n of ['L', 'R']) {
        B['femur' + n].rotation.z += -0.68 * e + 0.32 * e;
        B['tibia' + n].rotation.z += -0.35 * e;
        B['hcannon' + n].rotation.z += 0.42 * e;
        B['scap' + n].rotation.z += 0.25 * e;
        B['forearm' + n].rotation.z += (n === 'L' ? 1.1 : 0.85) * e + 0.15 * e * Math.sin(this.rearT * 9);
        B['fcannon' + n].rotation.z += -1.7 * e;
        B['fpastern' + n].rotation.z += -0.5 * e;
        stance[n + 'F'] *= 1 - e;
        hoofSwing[n + 'F'] -= 0.4 * e;
      }
      B.neck1.rotation.z += -0.38 * e; B.neck2.rotation.z += -0.1 * e; B.head.rotation.z += 0.22 * e;
      tailLift += 0.3 * e;
    }

    // ---- head: look at pointer, idle motion, nodding, pet reaction
    let lookYaw = 0, lookPitch = 0;
    const att = (1 - gz) * (1 - rear) * (1 - 0.6 * moving);
    let target = this.lookTarget;
    if (this.petT >= 0) {
      this.petT += dt;
      if (this.petT > 3) this.petT = -1;
      if (input.cameraLocal) target = input.cameraLocal;
    }
    if (target) {
      const dx = target.x - 1.03, dy = target.y - 1.75, dz = target.z;
      lookYaw = Math.max(-1.1, Math.min(1.1, Math.atan2(-dz, Math.max(dx, -0.6) + 0.6) * 1.0));
      lookPitch = Math.max(-0.6, Math.min(0.45, Math.atan2(dy, Math.hypot(dx, dz))));
    }
    const kL = 1 - Math.exp(-dt * 4);
    this.look.yaw += (lookYaw * att - this.look.yaw) * kL;
    this.look.pitch += (lookPitch * att - this.look.pitch) * kL;
    const ly = this.look.yaw, lp = this.look.pitch;
    B.neck1.rotation.y += ly * 0.32; B.neck2.rotation.y += ly * 0.3; B.neck3.rotation.y += ly * 0.22; B.head.rotation.y += ly * 0.18;
    B.neck1.rotation.x += -ly * 0.06;
    B.neck2.rotation.z += lp * 0.35; B.head.rotation.z += lp * 0.45;
    // steering bend
    B.neck1.rotation.y += this.steer * 0.12 * moving; B.neck2.rotation.y += this.steer * 0.08 * moving;
    // gait nod + idle sway
    B.neck1.rotation.z += nod * 0.6; B.head.rotation.z += -nod * 0.4;
    const idle = (1 - moving) * (1 - gz);
    B.neck1.rotation.z += idle * 0.03 * Math.sin(t * 0.5) ;
    B.head.rotation.y += idle * 0.05 * Math.sin(t * 0.31 + 1);
    if (this.petT >= 0) {
      const pt = this.petT;
      B.head.rotation.x += 0.18 * Math.sin(pt * 22) * Math.exp(-pt * 3) * smooth(0.0, 0.05, pt);
      B.neck2.rotation.z += 0.08 * Math.sin(pt * 3.2) * Math.exp(-pt);
    }
    // breathing
    B.chest.scale.setScalar(1);
    B.root.position.y += 0.0025 * Math.sin(t * (1.2 + moving * 3));

    // ---- tail
    const swishing = t - this.swishT;
    if (swishing > 2.2 && Math.random() < dt * 0.18 * (1 - moving * 0.7)) { this.swishT = t; this.swishSide = Math.random() < 0.5 ? -1 : 1; }
    const sw = swishing < 2 ? Math.sin(Math.min(1, swishing / 2) * Math.PI) : 0;
    B.tail0.rotation.z += -0.15 - tailLift * 0.6 - this.speed * 0.03;
    for (let i = 0; i < TAIL.length - 1; i++) {
      const b = B['tail' + i];
      const fi = i / (TAIL.length - 2);
      b.rotation.x += 0.05 * Math.sin(t * 1.1 - i * 0.6) + this.swishSide * 0.28 * sw * Math.sin(swishing * 7 - i * 0.7) * (0.3 + fi);
      b.rotation.x += 0.06 * moving * Math.sin(2 * Math.PI * ph * 2 - i * 0.8);
      if (i > 0) b.rotation.z += -(tailLift * 0.22 + this.speed * 0.025) * (0.6 + fi) + 0.03 * Math.sin(t * 0.8 - i);
      b.rotation.y += this.steer * this.speed * 0.02;
    }

    // ---- ears
    for (let i = 0; i < 2; i++) {
      const E = this.earState[i], e = this.ears[i];
      E.t -= dt;
      if (E.t < 0) { E.t = 0.6 + Math.random() * 3; E.goal = (Math.random() - 0.4) * 1.1; }
      let goalYaw = E.goal ?? 0, goalBack = 0;
      if (target && att > 0.3) goalYaw = goalYaw * 0.2 + Math.max(-0.4, Math.min(0.9, ly * 0.8 * e.s + 0.1));
      if (this.petT >= 0) { goalYaw = 0; goalBack = -0.2; }
      if (rear > 0.1) { goalBack = 1.1 * rear; goalYaw = 0.6; }
      if (moving > 0.5) goalYaw *= 0.4;
      E.yaw += (goalYaw - E.yaw) * (1 - Math.exp(-dt * 9));
      E.back += (goalBack - E.back) * (1 - Math.exp(-dt * 6));
      e.pivot.rotation.y = -E.yaw * e.s;
      e.pivot.rotation.z = E.back;
      e.pivot.rotation.x = -E.back * 0.35 * e.s;
    }

    // ---- planting: flatten stance hooves, then put the lowest stance hoof on the ground
    this.group.updateMatrixWorld(true);
    for (const L of LEGS) {
      let sum = B.root.rotation.z + B[L.girdle].rotation.z;
      for (const c of L.chain) sum += B[c].rotation.z;
      const st = Math.max(0, Math.min(1, stance[L.id]));
      B[L.hoof].rotation.z = -sum * st + hoofSwing[L.id] * (1 - st);
    }
    this.bones.root.updateMatrixWorld(true);
    const inv = this._m.copy(this.group.matrixWorld).invert();
    let minY = Infinity, hindX = 0;
    for (const L of LEGS) {
      for (const c of CONTACTS) {
        const p = this._v.copy(c).applyMatrix4(B[L.hoof].matrixWorld).applyMatrix4(inv);
        if (stance[L.id] > 0.45) minY = Math.min(minY, p.y);
        if (!L.fore) hindX += p.x / 4;
      }
    }
    if (minY < Infinity) this.groundY += (-minY - this.groundY) * (1 - Math.exp(-dt * 30));
    B.root.position.y += this.groundY;
    if (rear > 1e-3) B.root.position.x += (-0.555 - hindX) * rear;
    this.bones.root.updateMatrixWorld(true);
  }
}
