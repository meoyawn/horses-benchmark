import {
  Bone, BufferAttribute, Color, Group, Matrix4, MeshPhysicalMaterial, Skeleton, SkinnedMesh, Vector3,
} from 'three';
import { createSculpt, lerp, smoothstep } from './surface.js';
import { addHorseDetails, faceProfiles, makeHair } from './horse-details.js';
import { makeMotion } from './motion.js';

const neckPivot = new Vector3(0.63, 1.54, 0);
const headPivot = new Vector3(1.145, 2.125, 0);
const headOrigin = [1.165, 2.111];
const headAngle = -0.72;
const headAxis = [Math.cos(headAngle), Math.sin(headAngle)];
const headCross = [-headAxis[1], headAxis[0]];
const foreheadDirection = new Vector3(headCross[0], headCross[1], 0);

const barrel = [
  [-1.296, 1.433, 0.013, 0.020], [-1.249, 1.419, 0.168, 0.153],
  [-1.163, 1.382, 0.285, 0.252], [-1.029, 1.374, 0.337, 0.322],
  [-0.902, 1.365, 0.354, 0.339], [-0.738, 1.346, 0.344, 0.317],
  [-0.550, 1.332, 0.331, 0.303], [-0.365, 1.305, 0.368, 0.335],
  [-0.160, 1.288, 0.390, 0.374], [0.050, 1.290, 0.397, 0.383],
  [0.263, 1.313, 0.388, 0.355], [0.452, 1.341, 0.404, 0.311],
  [0.610, 1.355, 0.405, 0.285], [0.752, 1.327, 0.354, 0.248],
  [0.870, 1.293, 0.251, 0.211], [0.928, 1.273, 0.145, 0.147],
  [0.973, 1.293, 0.081, 0.085], [0.992, 1.305, 0.006, 0.010],
];

const neck = [
  [1.128, 0.686, 0.037, 0.061], [1.236, 0.714, 0.202, 0.193],
  [1.338, 0.668, 0.291, 0.255], [1.471, 0.645, 0.321, 0.252],
  [1.596, 0.680, 0.303, 0.224], [1.722, 0.724, 0.272, 0.186],
  [1.838, 0.795, 0.221, 0.149], [1.950, 0.902, 0.201, 0.127],
  [2.050, 1.014, 0.174, 0.111], [2.143, 1.116, 0.143, 0.107],
  [2.205, 1.192, 0.101, 0.098], [2.231, 1.205, 0.059, 0.072],
  [2.251, 1.212, 0.008, 0.013],
];

const skull = [
  [-0.121, -0.003, 0.009, 0.013], [-0.085, -0.002, 0.077, 0.091],
  [-0.024, 0.000, 0.110, 0.127], [0.052, -0.004, 0.126, 0.142],
  [0.122, -0.022, 0.129, 0.148], [0.189, -0.044, 0.143, 0.141],
  [0.252, -0.055, 0.144, 0.130], [0.330, -0.049, 0.124, 0.105],
  [0.411, -0.032, 0.101, 0.086], [0.493, -0.022, 0.092, 0.089],
  [0.550, -0.013, 0.091, 0.102], [0.606, -0.008, 0.085, 0.098],
  [0.652, -0.010, 0.061, 0.070], [0.678, -0.010, 0.038, 0.045],
  [0.691, -0.008, 0.010, 0.013],
];

const maneBlack = new Color('#261c19');
const barrelBrown = new Color('#884526');
const toastedBrown = new Color('#a3673e');
const dorsalBrown = new Color('#683821');
const muzzle = new Color('#3b2a25');
const softMuzzle = new Color('#57433a');
const ivory = new Color('#e8d9c4');
const axisY = { axis: [0, 1], cross: [1, 0] };

function foreleg(side) {
  const offset = side < 0 ? 0 : 0.143;
  const z = side * 0.230;
  const sections = [
    [0.083, 0.684 + offset, 0.036, 0.039, z],
    [0.128, 0.669 + offset, 0.047, 0.044, z],
    [0.187, 0.640 + offset, 0.060, 0.052, z],
    [0.252, 0.630 + offset, 0.045, 0.041, z],
    [0.395, 0.638 + offset * 0.96, 0.041, 0.037, z],
    [0.526, 0.638 + offset * 0.86, 0.046, 0.041, z],
    [0.643, 0.650 + offset * 0.78, 0.062, 0.052, z],
    [0.698, 0.647 + offset * 0.71, 0.063, 0.053, z],
    [0.804, 0.634 + offset * 0.59, 0.067, 0.058, z],
    [0.919, 0.616 + offset * 0.43, 0.085, 0.074, z],
    [1.049, 0.591 + offset * 0.25, 0.104, 0.092, z * 1.02],
    [1.139, 0.565 + offset * 0.17, 0.122, 0.106, z * 1.05],
    [1.245, 0.554 + offset * 0.12, 0.165, 0.132, z * 1.06],
    [1.361, 0.527, 0.172, 0.135, z * 0.99],
    [1.488, 0.499, 0.159, 0.098, z * 0.91],
    [1.584, 0.464, 0.126, 0.082, z * 0.77],
    [1.671, 0.404, 0.018, 0.016, z * 0.60],
  ];
  const joints = [
    new Vector3(0.50, 1.497, z),
    new Vector3(0.561 + offset * 0.17, 1.128, z),
    new Vector3(0.650 + offset * 0.78, 0.649, z),
    new Vector3(0.644 + offset, 0.188, z),
  ];
  return { side, rear: false, sections, joints };
}

function addMusculature(sculpt, side) {
  sculpt.loft([
    [0.0, 0.006, 0.013, 0.015, side * 0.130],
    [0.095, -0.006, 0.058, 0.052, side * 0.233],
    [0.201, -0.013, 0.097, 0.065, side * 0.269],
    [0.323, -0.006, 0.104, 0.058, side * 0.287],
    [0.435, 0.011, 0.085, 0.048, side * 0.290],
    [0.545, -0.003, 0.033, 0.021, side * 0.258],
    [0.579, -0.021, 0.007, 0.009, side * 0.241],
  ], { origin: [0.330, 1.695], axis: [0.6216, -0.7833], cross: [0.7833, 0.6216], blend: 0.041 });
  sculpt.loft([
    [0.0, -0.005, 0.013, 0.017, side * 0.186],
    [0.113, 0.012, 0.104, 0.071, side * 0.265],
    [0.244, 0.009, 0.141, 0.081, side * 0.314],
    [0.363, -0.012, 0.137, 0.079, side * 0.314],
    [0.468, -0.002, 0.080, 0.063, side * 0.299],
    [0.558, 0.012, 0.049, 0.030, side * 0.272],
    [0.606, 0.020, 0.008, 0.013, side * 0.251],
  ], { origin: [-1.037, 1.665], axis: [0.4996, -0.8663], cross: [0.8663, 0.4996], blend: 0.040 });
}

function hindleg(side) {
  const offset = side < 0 ? -0.030 : -0.243;
  const z = side * 0.246;
  const sections = [
    [0.083, -0.869 + offset, 0.031, 0.038, z],
    [0.129, -0.891 + offset, 0.039, 0.040, z],
    [0.186, -0.918 + offset, 0.060, 0.052, z],
    [0.252, -0.931 + offset * 0.98, 0.045, 0.042, z],
    [0.386, -0.945 + offset * 0.86, 0.043, 0.039, z],
    [0.498, -0.968 + offset * 0.73, 0.049, 0.043, z],
    [0.579, -0.982 + offset * 0.64, 0.073, 0.055, z],
    [0.658, -0.928 + offset * 0.55, 0.072, 0.060, z],
    [0.759, -0.848 + offset * 0.55, 0.080, 0.071, z],
    [0.861, -0.754 + offset * 0.51, 0.103, 0.088, z],
    [0.986, -0.677 + offset * 0.43, 0.137, 0.108, z * 0.99],
    [1.088, -0.708 + offset * 0.33, 0.175, 0.129, z * 1.06],
    [1.200, -0.790 + offset * 0.19, 0.220, 0.153, z * 1.06],
    [1.333, -0.889 + offset * 0.08, 0.241, 0.147, z],
    [1.454, -0.916, 0.231, 0.137, z * 0.92],
    [1.565, -0.947, 0.174, 0.089, z * 0.80],
    [1.671, -0.981, 0.065, 0.041, z * 0.58],
    [1.698, -0.980, 0.011, 0.014, z * 0.43],
  ];
  const joints = [
    new Vector3(-0.883, 1.486, z),
    new Vector3(-0.661 + offset * 0.40, 0.989, z),
    new Vector3(-0.975 + offset * 0.64, 0.587, z),
    new Vector3(-0.918 + offset, 0.188, z),
  ];
  return { side, rear: true, sections, joints };
}

function rig(horse, legs) {
  const bones = [];

  function bone(name, at, parent, parentAt) {
    const joint = new Bone();
    joint.name = name;
    joint.position.copy(at).sub(parentAt);
    parent.add(joint);
    bones.push(joint);
    return joint;
  }

  const origin = new Vector3();
  const root = bone('Trunk', origin, horse, origin);
  const neckBone = bone('Neck', neckPivot, root, origin);
  const skullBone = bone('Skull', headPivot, neckBone, neckPivot);
  const tailPivots = [
    new Vector3(-1.209, 1.55, 0), new Vector3(-1.388, 1.169, -0.019), new Vector3(-1.423, 0.76, -0.053),
  ];
  const tail = tailPivots.map(function makeTail(at, index) {
    const parent = index === 0 ? root : bones[bones.length - 1];
    return bone('Tail ' + (index + 1), at, parent, index === 0 ? origin : tailPivots[index - 1]);
  });

  for (const leg of legs) {
    const limb = leg.rear ? 'Hind' : 'Fore';
    const side = leg.side < 0 ? 'left' : 'right';
    const names = leg.rear ? ['Hip', 'Stifle', 'Hock', 'Fetlock'] : ['Shoulder', 'Elbow', 'Knee', 'Fetlock'];
    leg.index = bones.length;
    leg.bones = [];
    leg.joints.forEach(function makeJoint(at, i) {
      const parent = i === 0 ? root : leg.bones[i - 1];
      leg.bones.push(bone(limb + ' ' + side + ' ' + names[i], at, parent, i === 0 ? origin : leg.joints[i - 1]));
    });
  }

  horse.updateMatrixWorld(true);
  return { root, neckBone, skullBone, tail, skeleton: new Skeleton(bones) };
}

function coatColor(x, y, z, target) {
  const change = 0.28 + 0.075 * Math.sin(x * 5.1 + y * 8.1 + Math.sin(z * 14) * 0.44)
    + 0.05 * Math.sin(y * 14 - x * 8 + Math.cos(z * 21)) + 0.029 * Math.cos((x + z) * 62 + y * 39);
  const topline = smoothstep(1.54, 1.776, y) * (1 - smoothstep(0.16, 0.40, Math.abs(z)))
    * (1 - smoothstep(0.53, 0.94, x));
  const lowerPoints = 1 - smoothstep(0.53, 1.00, y + 0.083 * Math.sin(x * 12 + z * 9));
  target.copy(barrelBrown).lerp(toastedBrown, change).lerp(dorsalBrown, topline * 0.62)
    .lerp(maneBlack, lowerPoints * 0.98);
  const darkCrease = smoothstep(0.80, 1.00, y) * (1 - smoothstep(1.04, 1.27, y))
    * (1 - smoothstep(0.08, 0.27, Math.abs(x + 0.55)));
  target.lerp(dorsalBrown, darkCrease * 0.43);
  const dx = x - headOrigin[0];
  const dy = y - headOrigin[1];
  const downFace = dx * headAxis[0] + dy * headAxis[1];
  const forehead = dx * headCross[0] + dy * headCross[1];
  if (x > 1.13 && y > 1.51) {
    const fade = smoothstep(0.38, 0.62, downFace);
    const noseTint = smoothstep(0.64, 0.70, downFace) * 0.48 + smoothstep(0.069, 0.103, forehead) * 0.16;
    target.lerp(muzzle, fade * 0.98).lerp(softMuzzle, fade * noseTint);
    const blazeWidth = 0.032 + 0.021 * Math.exp(-((downFace - 0.182) ** 2) / 0.008)
      + 0.007 * Math.sin(65 * downFace) + 0.005 * Math.sin(121 * downFace);
    const blazeCenter = -0.010 + 0.009 * Math.sin(16 * downFace) - 0.008 * smoothstep(0.23, 0.51, downFace);
    const ridge = 0.074 - 0.043 * smoothstep(0.21, 0.48, downFace);
    const blaze = smoothstep(ridge, ridge + 0.015, forehead)
      * (1 - smoothstep(blazeWidth - 0.004, blazeWidth + 0.003, Math.abs(z - blazeCenter)))
      * smoothstep(0.056, 0.106, downFace) * (1 - smoothstep(0.454, 0.520, downFace));
    target.lerp(ivory, blaze * 0.98);
    const lip = smoothstep(0.43, 0.61, downFace) * (1 - smoothstep(-0.076, -0.026, forehead));
    target.lerp(maneBlack, lip * 0.54);
  }
  if (x < -0.65 && z < 0 && y < 0.32) {
    const sockEnd = 0.242 + Math.sin(z * 98 + x * 27) * 0.016 + Math.sin(x * 69 - z * 24) * 0.019;
    target.lerp(ivory, 1 - smoothstep(sockEnd - 0.005, sockEnd + 0.009, y));
  }
  return target;
}

function upperWeights(x, y) {
  const crown = 1.145 + (2.05 - y) * 0.235;
  const head = smoothstep(crown - 0.024, crown + 0.121, x) * smoothstep(1.50, 1.70, y);
  const neck = smoothstep(1.48, 1.97, y + (x - 0.66) * 0.36)
    * smoothstep(0.34, 0.57, x) * (1 - head);
  return [[0, 1 - neck - head], [1, neck], [2, head]];
}

function skinWeights(x, y, z, legs) {
  const upper = upperWeights(x, y);
  const leg = legs[(x < -0.095 ? 2 : 0) + (z >= 0 ? 1 : 0)];
  const [root, upperJoint, lowerJoint, ankle] = leg.joints;
  const legContact = smoothstep(0.075, 0.205, Math.abs(z))
    * (leg.rear ? 1 - smoothstep(-0.58, -0.43, x) : smoothstep(0.30, 0.51, x))
    * (1 - smoothstep(upperJoint.y - 0.065, root.y + 0.078, y));
  if (legContact < 0.0001) return upper;
  const distal = 1 - smoothstep(ankle.y - 0.059, ankle.y + 0.062, y);
  const cannon = 1 - smoothstep(lowerJoint.y - 0.096, lowerJoint.y + 0.095, y);
  const second = 1 - smoothstep(upperJoint.y - 0.101, upperJoint.y + 0.113, y);
  const base = leg.index;
  return [
    ...upper.map(([bone, weight]) => [bone, weight * (1 - legContact)]),
    [base, (1 - second) * legContact], [base + 1, (second - cannon) * legContact],
    [base + 2, (cannon - distal) * legContact], [base + 3, distal * legContact],
  ];
}

function tailWeights(x, y) {
  const base = smoothstep(1.05, 1.30, y);
  const tip = 1 - smoothstep(0.62, 0.94, y);
  return [[3, base], [4, 1 - base - tip], [5, tip]];
}

function skinned(geometry, skeleton, material, weights, colorAt) {
  const positions = geometry.getAttribute('position');
  const colors = colorAt ? new Float32Array(positions.count * 3) : null;
  const index = new Uint16Array(positions.count * 4);
  const weight = new Float32Array(positions.count * 4);
  const color = new Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const joints = weights(x, y, z).filter((entry) => entry[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = joints.reduce((sum, entry) => sum + entry[1], 0);
    joints.forEach(function setWeight([boneIndex, amount], j) {
      index[i * 4 + j] = boneIndex;
      weight[i * 4 + j] = amount / total;
    });
    if (colorAt) colorAt(x, y, z, color).toArray(colors, i * 3);
  }
  if (colors) geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(index, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(weight, 4));
  const mesh = new SkinnedMesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.bind(skeleton, new Matrix4());
  return mesh;
}

function coatMaterial() {
  const material = new MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.62,
    sheen: 0.34,
    sheenColor: new Color('#ad7450'),
    sheenRoughness: 0.74,
    clearcoat: 0.13,
    clearcoatRoughness: 0.55,
  });
  material.onBeforeCompile = function addCoatGrain(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCoat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoat = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', coatNoise)
      .replace('#include <color_fragment>', coatFragment);
  };
  return material;
}

const coatNoise = '#include <common>\n' + /* glsl */ `
varying vec3 vCoat;
float coatHash(vec3 p) {
  p = fract(p * vec3(.1031, .1099, .0917));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float coatNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.-2.*f);
  return mix(
    mix(mix(coatHash(i), coatHash(i+vec3(1.,0.,0.)), f.x),
        mix(coatHash(i+vec3(0.,1.,0.)), coatHash(i+vec3(1.,1.,0.)), f.x), f.y),
    mix(mix(coatHash(i+vec3(0.,0.,1.)), coatHash(i+vec3(1.,0.,1.)), f.x),
        mix(coatHash(i+vec3(0.,1.,1.)), coatHash(i+vec3(1.)), f.x), f.y), f.z);
}
`;

const coatFragment = '#include <color_fragment>\n' + /* glsl */ `
  float footprint = max(length(dFdx(vCoat)), length(dFdy(vCoat)));
  vec3 hair = vec3(vCoat.x*195. + vCoat.y*68., vCoat.y*264. - vCoat.x*81., vCoat.z*260.);
  float fine = (coatNoise(hair) - .5) * (1. - smoothstep(.0012, .010, footprint));
  float coatMottle = coatNoise(vCoat * 35.) - .5;
  float dapples = coatNoise(vCoat * vec3(13., 16., 14.) + vec3(1.4, 4.2, 9.2));
  float quarter = smoothstep(-.12, .90, -vCoat.x) * smoothstep(.94, 1.22, vCoat.y);
  diffuseColor.rgb *= 1.0 + .23 * fine + .135 * coatMottle
    + quarter * (.15 * smoothstep(.49, .74, dapples) - .04);
`;

export function createHorse() {
  const horse = new Group();
  horse.name = 'Bay horse';
  const legs = [foreleg(-1), foreleg(1), hindleg(-1), hindleg(1)];
  const sculpt = createSculpt();
  sculpt.loft(barrel);
  sculpt.loft(neck, { ...axisY, blend: 0.11 });
  sculpt.loft(skull, { origin: headOrigin, axis: headAxis, cross: headCross, blend: 0.039 });
  for (const leg of legs) sculpt.loft(leg.sections, { ...axisY, blend: leg.rear ? 0.085 : 0.067 });
  addMusculature(sculpt, -1);
  addMusculature(sculpt, 1);
  for (const profile of Object.values(faceProfiles)) sculpt.indent(profile.center, profile.size, profile.tilt, profile.depth);

  const joints = rig(horse, legs);
  const body = skinned(sculpt.geometry(), joints.skeleton, coatMaterial(),
    function weightBody(x, y, z) { return skinWeights(x, y, z, legs); }, coatColor);
  body.name = 'Sculpted skin';
  horse.add(body);

  const hairMaterial = new MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.68, sheen: 0.40, sheenColor: new Color('#754e35'), sheenRoughness: 0.72,
  });
  function projectForehead(distance, z, lift) {
    const point = new Vector3(headOrigin[0] + headAxis[0] * distance, headOrigin[1] + headAxis[1] * distance, z);
    const surface = sculpt.project(point, foreheadDirection, 0.25);
    return (surface ?? point).addScaledVector(foreheadDirection, lift);
  }
  const hair = makeHair(sculpt, projectForehead);
  horse.add(skinned(hair.mane, joints.skeleton, hairMaterial, upperWeights));
  horse.add(skinned(hair.tail, joints.skeleton, hairMaterial, tailWeights));

  const skullFrame = new Group();
  skullFrame.position.copy(headPivot).negate();
  joints.skullBone.add(skullFrame);
  const details = addHorseDetails(sculpt, skullFrame, legs, coatColor);
  const pose = makeMotion(joints, legs, details);
  return { horse, ...pose };
}
