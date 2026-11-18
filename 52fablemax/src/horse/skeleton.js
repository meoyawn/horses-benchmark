// Skeleton layout of the horse in its rest pose (standing square).
//
// Model space: +X is forward (towards the nose), +Y is up, +Z is the horse's
// right side. Units are metres; she stands 1.60 m at the withers.
//
// Every bone has an identity rest orientation, so a bone's bind matrix is a
// pure translation to its joint. Right-side joints are listed; the left side
// is mirrored across z = 0.

export const HEAD_ANGLE = 52 * Math.PI / 180; // rest angle of the face below horizontal

/** Joint centres (right side where paired). */
export const J = {
  // trunk
  chest: [0.20, 1.22, 0],
  loin: [-0.20, 1.40, 0],
  pelvis: [-0.42, 1.44, 0],
  dock: [-0.795, 1.445, 0],
  tail2: [-0.865, 1.395, 0],
  tail3: [-0.915, 1.325, 0],
  tail4: [-0.945, 1.245, 0],
  tailEnd: [-0.96, 1.16, 0],
  // neck and head
  neck1: [0.56, 1.36, 0],
  neck2: [0.74, 1.53, 0],
  neck3: [0.90, 1.68, 0],
  neck4: [1.03, 1.80, 0],
  poll: [1.14, 1.88, 0],
  // foreleg
  scapula: [0.50, 1.42, 0.16],     // centre of rotation of the shoulder blade
  shoulder: [0.76, 1.14, 0.195],   // shoulder joint (point of shoulder)
  elbow: [0.52, 0.90, 0.175],
  knee: [0.532, 0.47, 0.150],      // carpus
  fetlockF: [0.532, 0.20, 0.147],
  coffinF: [0.624, 0.065, 0.147],
  // hind leg
  hip: [-0.63, 1.30, 0.17],
  stifle: [-0.52, 0.94, 0.212],
  hock: [-0.76, 0.585, 0.158],
  fetlockH: [-0.757, 0.21, 0.152],
  coffinH: [-0.669, 0.068, 0.152],
};

/** Point in head space -> model space. l: along the face from the poll,
 *  d: towards the forehead / nose bridge, w: lateral. */
export function headPoint(l, d, w = 0) {
  const c = Math.cos(HEAD_ANGLE), s = Math.sin(HEAD_ANGLE);
  return [J.poll[0] + l * c + d * s, J.poll[1] - l * s + d * c, w];
}

const side = (p, sign) => [p[0], p[1], p[2] * sign];

function buildBones() {
  const bones = [];
  const add = (name, pos, parent) => {
    bones.push({ name, pos: [...pos], parent, index: bones.length });
  };
  add('chest', J.chest, null);
  add('loin', J.loin, 'chest');
  add('pelvis', J.pelvis, 'loin');
  add('neck1', J.neck1, 'chest');
  add('neck2', J.neck2, 'neck1');
  add('neck3', J.neck3, 'neck2');
  add('neck4', J.neck4, 'neck3');
  add('head', J.poll, 'neck4');
  add('tail1', J.dock, 'pelvis');
  add('tail2', J.tail2, 'tail1');
  add('tail3', J.tail3, 'tail2');
  add('tail4', J.tail4, 'tail3');
  for (const [suffix, sign] of [['R', 1], ['L', -1]]) {
    add('scapula' + suffix, side(J.scapula, sign), 'chest');
    add('humerus' + suffix, side(J.shoulder, sign), 'scapula' + suffix);
    add('radius' + suffix, side(J.elbow, sign), 'humerus' + suffix);
    add('cannonF' + suffix, side(J.knee, sign), 'radius' + suffix);
    add('pasternF' + suffix, side(J.fetlockF, sign), 'cannonF' + suffix);
    add('hoofF' + suffix, side(J.coffinF, sign), 'pasternF' + suffix);
    add('femur' + suffix, side(J.hip, sign), 'pelvis');
    add('tibia' + suffix, side(J.stifle, sign), 'femur' + suffix);
    add('cannonH' + suffix, side(J.hock, sign), 'tibia' + suffix);
    add('pasternH' + suffix, side(J.fetlockH, sign), 'cannonH' + suffix);
    add('hoofH' + suffix, side(J.coffinH, sign), 'pasternH' + suffix);
  }
  return bones;
}

export const BONES = buildBones();
export const BONE_INDEX = Object.fromEntries(BONES.map((b) => [b.name, b.index]));
for (const b of BONES) b.parentIndex = b.parent === null ? -1 : BONE_INDEX[b.parent];

function mirrorName(name) {
  if (name.endsWith('R')) return name.slice(0, -1) + 'L';
  if (name.endsWith('L')) return name.slice(0, -1) + 'R';
  return name;
}
export const MIRROR_BONE = Int32Array.from(BONES.map((b) => BONE_INDEX[mirrorName(b.name)]));

// ---- skin weight descriptors ------------------------------------------------
//
// Each sculpt primitive names how the surface it creates follows the bones:
//   { bone: 'tibiaR' }                               rigid
//   { bones: { scapulaR: 0.7, chest: 0.3 } }         fixed mix
//   { grad: ['pelvis', 'femurR'], from: P, to: Q }   blend along a direction
//   { spine: true }                                  chest / loin / pelvis by x
//   { neck: true }                                   chest .. neck1-4 .. head
// Descriptors are written for the right side and mirrored automatically.

const smooth = (a, b, x) => {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};

const NECK_JOINTS = [J.neck1, J.neck2, J.neck3, J.neck4, J.poll];
const NECK_BONES = ['chest', 'neck1', 'neck2', 'neck3', 'neck4', 'head'].map((n) => BONE_INDEX[n]);
const NECK_BLEND = [0.13, 0.09, 0.08, 0.07, 0.05];
const NECK_ARC = [0];
for (let i = 1; i < NECK_JOINTS.length; i++) {
  const a = NECK_JOINTS[i - 1], b = NECK_JOINTS[i];
  NECK_ARC.push(NECK_ARC[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
}

/** Arc-length coordinate of a point projected on the neck line (side view). */
export function neckCoord(x, y) {
  let best = 1e9, bestS = 0;
  const last = NECK_JOINTS.length - 2;
  for (let i = 0; i <= last; i++) {
    const a = NECK_JOINTS[i], b = NECK_JOINTS[i + 1];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    let t = ((x - a[0]) * ex + (y - a[1]) * ey) / (len * len);
    const lo = i === 0 ? -2 : 0, hi = i === last ? 3 : 1;
    t = t < lo ? lo : t > hi ? hi : t;
    const px = a[0] + ex * t, py = a[1] + ey * t;
    const d = (x - px) * (x - px) + (y - py) * (y - py);
    if (d < best) { best = d; bestS = NECK_ARC[i] + t * len; }
  }
  return bestS;
}

const B = BONE_INDEX;

function compileSkin(desc) {
  if (desc.bone) return { type: 0, list: [B[need(desc.bone)], 1] };
  if (desc.bones) {
    const list = [];
    for (const [name, w] of Object.entries(desc.bones)) list.push(B[need(name)], w);
    return { type: 0, list };
  }
  if (desc.grad) {
    const d = [desc.to[0] - desc.from[0], desc.to[1] - desc.from[1], desc.to[2] - desc.from[2]];
    const l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    return { type: 1, a: B[need(desc.grad[0])], b: B[need(desc.grad[1])], from: desc.from, dir: d.map((v) => v / l2) };
  }
  if (desc.spine) return { type: 2 };
  if (desc.neck) return { type: 3 };
  throw new Error('Unknown skin descriptor ' + JSON.stringify(desc));
}

function need(name) {
  if (!(name in B)) throw new Error('Unknown bone ' + name);
  return name;
}

const compiled = new WeakMap();

/** Adds the bone weights a primitive implies at a point into `acc`. */
export function weigh(prim, x, y, z, mirrored, scale, acc) {
  let c = compiled.get(prim);
  if (c === undefined) {
    c = compileSkin(prim.skin);
    compiled.set(prim, c);
  }
  const pz = mirrored ? -z : z;
  const put = (bone, w) => {
    if (w > 0) acc[mirrored ? MIRROR_BONE[bone] : bone] += w * scale;
  };
  switch (c.type) {
    case 0:
      for (let i = 0; i < c.list.length; i += 2) put(c.list[i], c.list[i + 1]);
      break;
    case 1: {
      const t = smooth(0, 1, (x - c.from[0]) * c.dir[0] + (y - c.from[1]) * c.dir[1] + (pz - c.from[2]) * c.dir[2]);
      put(c.a, 1 - t);
      put(c.b, t);
      break;
    }
    case 2: {
      const wPelvis = 1 - smooth(-0.52, -0.30, x);
      const wChest = smooth(-0.34, -0.06, x);
      put(B.pelvis, wPelvis);
      put(B.chest, wChest);
      put(B.loin, Math.max(0, 1 - wPelvis - wChest));
      break;
    }
    case 3: {
      const s = neckCoord(x, y);
      let prev = 1;
      for (let i = 0; i < NECK_ARC.length; i++) {
        const t = smooth(NECK_ARC[i] - NECK_BLEND[i], NECK_ARC[i] + NECK_BLEND[i], s);
        put(NECK_BONES[i], prev - t);
        prev = t;
      }
      put(NECK_BONES[NECK_BONES.length - 1], prev);
      break;
    }
    default:
      break;
  }
}

export const SKIN = { boneCount: BONES.length, mirrorBone: MIRROR_BONE, weigh };
