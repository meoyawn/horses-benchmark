// The sculpt: muscle masses, bones and tendons of the horse laid out as
// smoothly blended volumes. Coordinates are model space (see skeleton.js).
//
// Large soft masses come first and are blended widely; smaller forms sit only
// a centimetre or two proud of them so they read as muscle under skin.
import { SUB, Group, ball, cone, ellipsoid } from '../sculpt/sdf.js';
import { HEAD_ANGLE, J, headPoint as H } from './skeleton.js';

const Z = [0, 0, 1];
const HEAD_DEG = -HEAD_ANGLE * 180 / Math.PI;

export function buildSculpt() {
  const groups = [];
  const group = (name, opts) => {
    const g = new Group(name, opts);
    groups.push(g);
    return g;
  };
  const b = (bone) => ({ skin: { bone } });

  // ---------------------------------------------------------------- trunk ---
  const spine = { skin: { spine: true }, reach: 0.07 };
  const trunk = group('trunk', { k: 0.1 });
  trunk.add(
    // rib cage: deep and narrow between the shoulders, round further back
    ellipsoid([0.36, 1.21, 0], [0.35, 0.345, 0.235], { k: 0.1, ...spine, name: 'ribsFront' }),
    ellipsoid([0.02, 1.195, 0], [0.42, 0.33, 0.295], { k: 0.14, ...spine, name: 'ribsRear' }),
    ellipsoid([-0.29, 1.24, 0], [0.3, 0.265, 0.27], { k: 0.14, ...spine, name: 'abdomen' }),
    // long back muscles either side of the spine
    cone([0.34, 1.425, 0], [-0.42, 1.435, 0], 0.078, 0.082, { k: 0.1, squash: [...Z, 1.9], ...spine, name: 'back' }),
    // withers
    cone([0.5, 1.515, 0], [0.26, 1.5, 0], 0.082, 0.06, { k: 0.1, squash: [...Z, 0.58], ...spine, name: 'withers' }),
    // croup
    ellipsoid([-0.5, 1.36, 0], [0.32, 0.21, 0.2], { k: 0.12, rot: [0, 0, -18], ...spine, name: 'croup' }),
    // volume between the shoulder blades at the base of the neck
    ellipsoid([0.56, 1.33, 0], [0.21, 0.26, 0.19], { k: 0.12, ...spine, name: 'shoulderCore' }),
    // breast and sternum between the forelegs
    ellipsoid([0.67, 1.13, 0], [0.175, 0.21, 0.185], { k: 0.1, ...spine, name: 'breast' }),
    ellipsoid([0.5, 0.965, 0], [0.2, 0.1, 0.12], { k: 0.08, ...spine, name: 'sternum' }),
    ellipsoid([0.735, 1.05, 0.07], [0.08, 0.11, 0.07], { k: 0.07, mirror: true, ...spine, name: 'pectoral' }),
  );

  // ----------------------------------------------------------------- neck ---
  const nk = { skin: { neck: true }, reach: 0.06 };
  const neck = group('neck', { k: 0.11 });
  neck.add(
    cone([0.5, 1.33, 0], [0.65, 1.39, 0], 0.25, 0.245, { k: 0.08, squash: [...Z, 0.54], ...nk, name: 'neckRoot' }),
    cone([0.65, 1.39, 0], [0.78, 1.535, 0], 0.245, 0.205, { k: 0.08, squash: [...Z, 0.52], ...nk, name: 'neckA' }),
    cone([0.78, 1.535, 0], [0.91, 1.67, 0], 0.205, 0.158, { k: 0.08, squash: [...Z, 0.5], ...nk, name: 'neckB' }),
    cone([0.91, 1.67, 0], [1.02, 1.78, 0], 0.158, 0.12, { k: 0.08, squash: [...Z, 0.5], ...nk, name: 'neckC' }),
    cone([1.02, 1.78, 0], [1.085, 1.835, 0], 0.12, 0.102, { k: 0.07, squash: [...Z, 0.58], ...nk, name: 'neckD' }),
    // crest
    cone([0.5, 1.56, 0], [0.67, 1.675, 0], 0.046, 0.044, { k: 0.07, squash: [...Z, 0.75], ...nk, name: 'crestA' }),
    cone([0.67, 1.675, 0], [0.85, 1.792, 0], 0.044, 0.042, { k: 0.07, squash: [...Z, 0.75], ...nk, name: 'crestB' }),
    cone([0.85, 1.792, 0], [1.01, 1.872, 0], 0.042, 0.04, { k: 0.06, squash: [...Z, 0.75], ...nk, name: 'crestC' }),
    cone([1.01, 1.872, 0], [1.125, 1.912, 0], 0.04, 0.04, { k: 0.05, squash: [...Z, 0.8], ...nk, name: 'crestD' }),
    // windpipe / underline
    cone([0.77, 1.24, 0], [0.885, 1.4, 0], 0.085, 0.072, { k: 0.07, ...nk, name: 'throatA' }),
    cone([0.885, 1.4, 0], [0.975, 1.555, 0], 0.072, 0.06, { k: 0.06, ...nk, name: 'throatB' }),
    cone([0.975, 1.555, 0], [1.025, 1.685, 0], 0.06, 0.05, { k: 0.05, ...nk, name: 'throatC' }),
    // strap muscles down the side of the neck
    cone([0.64, 1.33, 0.08], [0.98, 1.69, 0.04], 0.1, 0.05, { k: 0.08, mirror: true, ...nk, name: 'neckMuscle' }),
  );

  // -------------------------------------------------------------- hind leg ---
  const hind = group('hind', { k: 0.09, mirror: true });
  const hipToThigh = (x, z) => ({ grad: ['pelvis', 'femurR'], from: [x, 1.36, z], to: [x, 1.08, z] });
  hind.add(
    // croup and upper quarter as one broad mass
    ellipsoid([-0.5, 1.33, 0.115], [0.31, 0.22, 0.165], { k: 0.1, rot: [0, 0, -14], skin: { bone: 'pelvis' }, reach: 0.06, name: 'quarter' }),
    ball([-0.33, 1.435, 0.2], 0.04, { k: 0.09, skin: { bone: 'pelvis' }, name: 'pointOfHip' }),
    // thigh
    ellipsoid([-0.61, 1.1, 0.155], [0.2, 0.26, 0.13], { k: 0.1, rot: [0, 0, 10], reach: 0.05, skin: hipToThigh(-0.6, 0.16), name: 'thigh' }),
    ellipsoid([-0.5, 1.05, 0.2], [0.08, 0.13, 0.072], { k: 0.1, rot: [0, 0, -14], reach: 0.05, skin: hipToThigh(-0.5, 0.2), name: 'stifleMass' }),
    ball([-0.475, 0.972, 0.216], 0.044, { k: 0.08, ...b('femurR'), name: 'patella' }),
    cone([-0.76, 1.33, 0.09], [-0.745, 0.98, 0.14], 0.085, 0.06, { k: 0.09, reach: 0.05, skin: hipToThigh(-0.74, 0.12), name: 'buttock' }),
    // gaskin
    cone([-0.585, 0.95, 0.2], [-0.735, 0.615, 0.16], 0.1, 0.05, { k: 0.06, squash: [...Z, 0.76], ...b('tibiaR'), name: 'gaskin' }),
    cone([-0.675, 0.94, 0.182], [-0.765, 0.72, 0.165], 0.065, 0.028, { k: 0.05, ...b('tibiaR'), name: 'gastrocnemius' }),
    cone([-0.765, 0.74, 0.163], [-0.802, 0.655, 0.158], 0.02, 0.022, {
      k: 0.02, name: 'achilles',
      skin: { grad: ['tibiaR', 'cannonHR'], from: [-0.77, 0.72, 0.16], to: [-0.79, 0.65, 0.16] },
    }),
    // hock
    ellipsoid([-0.746, 0.585, 0.158], [0.057, 0.07, 0.044], {
      k: 0.03, name: 'hock',
      skin: { grad: ['tibiaR', 'cannonHR'], from: [-0.74, 0.63, 0.158], to: [-0.745, 0.555, 0.158] },
    }),
    ball([-0.802, 0.652, 0.158], 0.027, { k: 0.025, ...b('cannonHR'), name: 'pointOfHock' }),
    // cannon with its flexor tendons
    cone([-0.752, 0.54, 0.156], [-0.755, 0.245, 0.152], 0.033, 0.03, { k: 0.02, squash: [...Z, 0.84], ...b('cannonHR'), name: 'cannonH' }),
    cone([-0.787, 0.56, 0.156], [-0.789, 0.255, 0.152], 0.0175, 0.017, { k: 0.016, ...b('cannonHR'), name: 'tendonH' }),
    ellipsoid([-0.757, 0.21, 0.152], [0.043, 0.046, 0.039], {
      k: 0.02, name: 'fetlockH',
      skin: { grad: ['cannonHR', 'pasternHR'], from: [-0.757, 0.235, 0.152], to: [-0.75, 0.185, 0.152] },
    }),
    ball([-0.788, 0.2, 0.152], 0.03, { k: 0.02, skin: { bones: { cannonHR: 0.5, pasternHR: 0.5 } }, name: 'sesamoidH' }),
    cone([-0.75, 0.19, 0.152], [-0.686, 0.085, 0.152], 0.031, 0.039, { k: 0.02, ...b('pasternHR'), name: 'pasternH' }),
    ellipsoid([-0.69, 0.06, 0.152], [0.058, 0.03, 0.054], { k: 0.015, rot: [0, 0, 17], ...b('hoofHR'), name: 'coronetH' }),
    // hollows either side of the hamstring tendon above the hock
    ellipsoid([-0.757, 0.71, 0.196], [0.017, 0.05, 0.018], { op: SUB, k: 0.016, name: 'hockHollowOuter' }),
    ellipsoid([-0.757, 0.71, 0.124], [0.017, 0.05, 0.018], { op: SUB, k: 0.016, name: 'hockHollowInner' }),
  );

  // -------------------------------------------------------------- foreleg ---
  const fore = group('fore', { k: 0.07, mirror: true });
  fore.add(
    ellipsoid([0.585, 1.35, 0.15], [0.16, 0.29, 0.062], {
      k: 0.12, rot: [0, 0, 37], reach: 0.06, name: 'shoulderBlade',
      skin: { bones: { scapulaR: 0.7, chest: 0.3 } },
    }),
    ball([0.765, 1.14, 0.16], 0.065, { k: 0.09, skin: { bones: { humerusR: 0.5, scapulaR: 0.5 } }, name: 'pointOfShoulder' }),
    ellipsoid([0.49, 1.09, 0.172], [0.15, 0.19, 0.06], {
      k: 0.1, rot: [0, 0, -20], reach: 0.05, name: 'triceps',
      skin: { bones: { humerusR: 0.55, scapulaR: 0.25, chest: 0.2 } },
    }),
    cone([0.745, 1.115, 0.165], [0.55, 0.95, 0.175], 0.07, 0.066, { k: 0.09, ...b('humerusR'), name: 'upperArm' }),
    ball([0.447, 0.935, 0.19], 0.047, { k: 0.05, ...b('radiusR'), name: 'elbow' }),
    // forearm
    cone([0.535, 0.9, 0.175], [0.532, 0.52, 0.152], 0.078, 0.048, { k: 0.04, squash: [...Z, 0.86], ...b('radiusR'), name: 'forearm' }),
    cone([0.575, 0.89, 0.178], [0.552, 0.62, 0.155], 0.052, 0.024, { k: 0.035, ...b('radiusR'), name: 'extensor' }),
    cone([0.475, 0.89, 0.18], [0.508, 0.6, 0.156], 0.05, 0.024, { k: 0.035, ...b('radiusR'), name: 'flexor' }),
    // knee
    ellipsoid([0.536, 0.47, 0.15], [0.047, 0.062, 0.046], {
      k: 0.025, name: 'knee',
      skin: { grad: ['radiusR', 'cannonFR'], from: [0.535, 0.505, 0.15], to: [0.535, 0.44, 0.15] },
    }),
    ball([0.495, 0.487, 0.153], 0.022, { k: 0.02, ...b('radiusR'), name: 'accessoryCarpal' }),
    // cannon
    cone([0.533, 0.42, 0.149], [0.532, 0.235, 0.147], 0.031, 0.028, { k: 0.02, squash: [...Z, 0.86], ...b('cannonFR'), name: 'cannonF' }),
    cone([0.502, 0.43, 0.149], [0.503, 0.24, 0.147], 0.0158, 0.0155, { k: 0.015, ...b('cannonFR'), name: 'tendonF' }),
    ellipsoid([0.531, 0.2, 0.147], [0.041, 0.044, 0.037], {
      k: 0.02, name: 'fetlockF',
      skin: { grad: ['cannonFR', 'pasternFR'], from: [0.531, 0.225, 0.147], to: [0.537, 0.175, 0.147] },
    }),
    ball([0.503, 0.19, 0.147], 0.028, { k: 0.02, skin: { bones: { cannonFR: 0.5, pasternFR: 0.5 } }, name: 'sesamoidF' }),
    cone([0.537, 0.182, 0.147], [0.607, 0.082, 0.147], 0.03, 0.038, { k: 0.02, ...b('pasternFR'), name: 'pasternF' }),
    ellipsoid([0.602, 0.058, 0.147], [0.058, 0.03, 0.054], { k: 0.015, rot: [0, 0, 17], ...b('hoofFR'), name: 'coronetF' }),
  );

  // ----------------------------------------------------------------- head ---
  const hd = { skin: { bone: 'head' }, reach: 0.03 };
  const rotH = (extra = 0, yaw = 0) => [0, yaw, HEAD_DEG + extra];
  const head = group('head', { k: 0.03 });
  head.add(
    ellipsoid(H(0.075, 0.0), [0.115, 0.078, 0.082], { k: 0.03, rot: rotH(), ...hd, name: 'cranium' }),
    ball(H(0.0, 0.045), 0.048, { k: 0.03, ...hd, name: 'pollCrest' }),
    // broad flat forehead and the nasal bones running down from it
    ellipsoid(H(0.175, 0.038), [0.11, 0.04, 0.098], { k: 0.04, rot: rotH(), ...hd, name: 'forehead' }),
    cone(H(0.22, 0.03), H(0.52, 0.012), 0.042, 0.034, { k: 0.04, squash: [...Z, 1.25], ...hd, name: 'nasal' }),
    cone(H(0.2, -0.01), H(0.5, -0.02), 0.07, 0.05, { k: 0.04, squash: [...Z, 0.84], ...hd, name: 'face' }),
    cone(H(0.26, -0.07), H(0.5, -0.065), 0.068, 0.046, { k: 0.04, squash: [...Z, 0.78], ...hd, name: 'cheekTeeth' }),
    // lower jaw
    ellipsoid(H(0.2, -0.105, 0.052), [0.118, 0.112, 0.038], { k: 0.022, rot: rotH(), mirror: true, ...hd, name: 'jowl' }),
    ellipsoid(H(0.23, -0.085, 0.064), [0.075, 0.062, 0.028], { k: 0.03, rot: rotH(), mirror: true, ...hd, name: 'masseter' }),
    cone(H(0.27, -0.165, 0.045), H(0.52, -0.1, 0.022), 0.032, 0.026, { k: 0.03, mirror: true, ...hd, name: 'mandible' }),
    // muzzle
    ellipsoid(H(0.57, -0.046), [0.062, 0.064, 0.05], { k: 0.04, rot: rotH(), ...hd, name: 'muzzle' }),
    ellipsoid(H(0.592, -0.004, 0.036), [0.038, 0.03, 0.028], { k: 0.028, rot: rotH(-20), mirror: true, ...hd, name: 'nostrilRim' }),
    ellipsoid(H(0.622, -0.07), [0.034, 0.034, 0.045], { k: 0.025, rot: rotH(), ...hd, name: 'upperLip' }),
    ellipsoid(H(0.585, -0.122), [0.04, 0.025, 0.035], { k: 0.02, rot: rotH(), ...hd, name: 'lowerLip' }),
    ball(H(0.555, -0.132), 0.026, { k: 0.02, ...hd, name: 'chin' }),
    // eye socket: brow above, cheekbone below
    ellipsoid(H(0.2, 0.03, 0.074), [0.05, 0.036, 0.03], { k: 0.03, rot: rotH(), mirror: true, ...hd, name: 'brow' }),
    ellipsoid(H(0.27, -0.036, 0.064), [0.05, 0.013, 0.02], { k: 0.04, rot: rotH(-6), mirror: true, ...hd, name: 'cheekbone' }),
    ball(H(0.0, 0.06, 0.058), 0.026, { k: 0.04, mirror: true, ...hd, name: 'earBase' }),
    // hollows and openings
    ball(H(0.15, 0.04, 0.086), 0.022, { op: SUB, k: 0.03, mirror: true, name: 'templeHollow' }),
    ellipsoid(H(0.222, 0.016, 0.108), [0.026, 0.0135, 0.022], { op: SUB, k: 0.004, rot: rotH(12), mirror: true, name: 'eyeOpening' }),
    ellipsoid(H(0.605, -0.01, 0.055), [0.022, 0.012, 0.018], { op: SUB, k: 0.006, rot: rotH(-35), mirror: true, name: 'nostril' }),
    // mouth: a thin cut round the muzzle, backed by a filler so it stays a groove
    ellipsoid(H(0.585, -0.1), [0.085, 0.0045, 0.1], { op: SUB, k: 0.003, rot: rotH(-8), name: 'mouthCut' }),
    ellipsoid(H(0.573, -0.098), [0.07, 0.03, 0.044], { k: 0.002, rot: rotH(-8), ...hd, name: 'mouthFill' }),
  );

  // ----------------------------------------------------------------- tail ---
  const tail = group('dock', { k: 0.035 });
  tail.add(
    cone([-0.77, 1.46, 0], J.tail2, 0.052, 0.04, {
      k: 0.02, name: 'dockA',
      skin: { grad: ['pelvis', 'tail1'], from: [-0.76, 1.47, 0], to: [-0.83, 1.42, 0] },
    }),
    cone(J.tail2, J.tail3, 0.04, 0.032, {
      k: 0.02, name: 'dockB',
      skin: { grad: ['tail1', 'tail2'], from: [-0.85, 1.41, 0], to: [-0.89, 1.36, 0] },
    }),
    cone(J.tail3, J.tail4, 0.032, 0.026, {
      k: 0.02, name: 'dockC',
      skin: { grad: ['tail2', 'tail3'], from: [-0.905, 1.345, 0], to: [-0.925, 1.295, 0] },
    }),
  );

  return groups;
}
