// Skeleton and body volumes of a ~16-hand (1.6 m at the withers) horse.
// Units: metres. Axes: +X forward (nose), +Y up, +Z the horse's right side.

export const LEG_Z = 0.16; // legs are planar, this far from the midline

/** [name, parent, x, y, z] — rest pose is a square stand, all bones axis-aligned. */
export function boneTable() {
  const t = [
    ['pelvis', null, -0.5, 1.36, 0],
    ['spine1', 'pelvis', -0.22, 1.37, 0],
    ['spine2', 'spine1', 0.08, 1.36, 0],
    ['chest', 'spine2', 0.36, 1.38, 0],
    ['neck1', 'chest', 0.6, 1.36, 0],
    ['neck2', 'neck1', 0.78, 1.56, 0],
    ['neck3', 'neck2', 0.95, 1.76, 0],
    ['head', 'neck3', 1.09, 1.92, 0],
    ['tail1', 'pelvis', -0.82, 1.395, 0],
    ['tail2', 'tail1', -0.93, 1.345, 0],
    ['tail3', 'tail2', -1.02, 1.285, 0],
    ['tail4', 'tail3', -1.07, 1.15, 0],
    ['tail5', 'tail4', -1.095, 0.96, 0],
    ['tail6', 'tail5', -1.105, 0.76, 0],
    ['tail7', 'tail6', -1.11, 0.55, 0],
  ];
  for (const [s, z] of [['L', -1], ['R', 1]]) {
    t.push(
      ['ear' + s, 'head', 1.125, 1.945, 0.058 * z],
      // Foreleg: scapula -> humerus -> radius -> cannon -> pastern -> hoof
      ['scapula' + s, 'chest', 0.44, 1.5, LEG_Z * z],
      ['humerus' + s, 'scapula' + s, 0.74, 1.1, LEG_Z * z],
      ['radius' + s, 'humerus' + s, 0.5, 0.9, LEG_Z * z],
      ['cannonF' + s, 'radius' + s, 0.535, 0.5, LEG_Z * z],
      ['pasternF' + s, 'cannonF' + s, 0.56, 0.215, LEG_Z * z],
      ['hoofF' + s, 'pasternF' + s, 0.635, 0.075, LEG_Z * z],
      // Hind leg: femur -> tibia -> cannon -> pastern -> hoof
      ['femur' + s, 'pelvis', -0.64, 1.22, LEG_Z * z],
      ['tibia' + s, 'femur' + s, -0.42, 0.9, LEG_Z * z],
      ['cannonH' + s, 'tibia' + s, -0.745, 0.6, LEG_Z * z],
      ['pasternH' + s, 'cannonH' + s, -0.735, 0.245, LEG_Z * z],
      ['hoofH' + s, 'pasternH' + s, -0.665, 0.075, LEG_Z * z]
    );
  }
  return t;
}

export const SCULPT_BOUNDS = { min: [-1.12, 0.0, 0], max: [1.62, 2.08, 0.36] };

/** Adds every body volume to the sculpt. */
export function sculptHorse(S) {
  const body = { k: 0.12, skin: 0.06 };

  // ---- Trunk -------------------------------------------------------------
  S.ellipsoid(['spine1', 'spine2', 'chest'], [0.06, 1.165, 0], [0.54, 0.335, 0.3], [0, 0, 0], body);
  S.ellipsoid('chest', [0.5, 1.215, 0], [0.31, 0.36, 0.225], [0, 0, 0], body);
  S.ellipsoid('pelvis', [-0.55, 1.25, 0], [0.34, 0.33, 0.25], [0, 0, 18], body);
  S.cone('chest', [0.26, 1.49, 0], [0.5, 1.525, 0], 0.07, 0.07, { sz: 0.8, k: 0.1, skin: 0.06 }); // withers
  S.cone(['pelvis', 'tail1', 'tail2', 'tail3'], [-0.8, 1.4, 0], [-1.035, 1.285, 0], 0.058, 0.028, { k: 0.09 }); // dock

  for (const [s, z] of [['L', -1], ['R', 1]]) {
    const side = z;
    const big = { k: 0.1, skin: 0.05, side };
    const leg = { k: 0.04, skin: 0.022, side };
    const fine = { k: 0.028, skin: 0.022, side };
    const Z = LEG_Z * z;

    // Long back muscles either side of the spine, point of hip, breast.
    S.cone(['pelvis', 'spine1', 'spine2', 'chest'], [-0.52, 1.455, 0.075 * z], [0.34, 1.43, 0.07 * z], 0.09, 0.085, { k: 0.1, skin: 0.06 });
    S.ellipsoid('pelvis', [-0.36, 1.405, 0.185 * z], [0.06, 0.035, 0.03], [0, 0, 0], { k: 0.16, skin: 0.06 }); // point of hip
    S.ball('chest', [0.7, 0.97, 0.07 * z], 0.075, { k: 0.1, skin: 0.05 }); // pectoral

    // ---- Hind leg --------------------------------------------------------
    const femur = 'femur' + s, tibia = 'tibia' + s, canH = 'cannonH' + s, pasH = 'pasternH' + s;
    S.ellipsoid(femur, [-0.57, 1.1, 0.155 * z], [0.25, 0.29, 0.13], [0, 0, 22], big); // thigh
    S.cone(femur, [-0.47, 0.99, 0.165 * z], [-0.565, 0.84, Z], 0.115, 0.075, { k: 0.07, skin: 0.04, side }); // lower thigh
    S.cone(femur, [-0.8, 1.24, 0.11 * z], [-0.69, 0.84, 0.14 * z], 0.115, 0.075, { k: 0.08, skin: 0.04, side }); // hamstrings
    S.ball(femur, [-0.42, 0.93, 0.17 * z], 0.068, { k: 0.1, skin: 0.035, side }); // stifle
    S.cone(tibia, [-0.42, 0.9, Z + 0.005 * z], [-0.74, 0.605, Z], 0.088, 0.048, leg); // gaskin
    S.ellipsoid(tibia, [-0.56, 0.835, Z + 0.005 * z], [0.15, 0.08, 0.068], [0, 0, 42.7], leg);
    S.cone(tibia, [-0.67, 0.83, Z], [-0.808, 0.662, Z], 0.035, 0.024, fine); // Achilles tendon
    S.ellipsoid(canH, [-0.748, 0.598, Z], [0.06, 0.07, 0.047], [0, 0, 0], leg); // hock
    S.cone(canH, [-0.762, 0.61, Z], [-0.808, 0.66, Z], 0.04, 0.028, fine); // point of hock
    S.cone(canH, [-0.74, 0.56, Z], [-0.728, 0.26, Z], 0.031, 0.029, fine); // cannon bone
    S.cone(canH, [-0.775, 0.57, Z], [-0.762, 0.27, Z], 0.021, 0.021, fine); // flexor tendons
    S.ellipsoid(canH, [-0.735, 0.245, Z], [0.047, 0.05, 0.042], [0, 0, 0], fine); // fetlock
    S.ball(pasH, [-0.765, 0.232, Z], 0.033, fine);
    S.cone(pasH, [-0.735, 0.245, Z], [-0.677, 0.087, Z], 0.035, 0.04, fine); // pastern

    // ---- Foreleg ---------------------------------------------------------
    const scap = 'scapula' + s, hum = 'humerus' + s, rad = 'radius' + s, canF = 'cannonF' + s, pasF = 'pasternF' + s;
    S.ellipsoid(scap, [0.57, 1.3, 0.18 * z], [0.3, 0.13, 0.075], [0, 0, -53], big); // shoulder blade
    S.ball(hum, [0.745, 1.1, 0.165 * z], 0.09, { k: 0.08, skin: 0.045, side }); // point of shoulder
    S.ellipsoid(hum, [0.6, 1.005, 0.175 * z], [0.2, 0.125, 0.085], [0, 0, 40], { k: 0.08, skin: 0.04, side });
    S.ball(hum, [0.47, 1.04, 0.165 * z], 0.105, { k: 0.09, skin: 0.045, side }); // triceps
    S.ball(rad, [0.462, 0.925, Z], 0.05, leg); // point of elbow
    S.cone(rad, [0.5, 0.9, Z], [0.535, 0.52, Z], 0.075, 0.045, leg); // forearm
    S.ellipsoid(rad, [0.535, 0.77, Z + 0.005 * z], [0.06, 0.16, 0.058], [0, 0, 5], leg);
    S.ellipsoid(rad, [0.478, 0.8, Z - 0.005 * z], [0.05, 0.13, 0.05], [0, 0, 5], leg);
    S.ellipsoid(canF, [0.538, 0.5, Z], [0.05, 0.058, 0.046], [0, 0, 0], leg); // knee
    S.cone(canF, [0.542, 0.46, Z], [0.558, 0.235, Z], 0.028, 0.027, fine); // cannon bone
    S.cone(canF, [0.512, 0.46, Z], [0.528, 0.24, Z], 0.019, 0.02, fine); // flexor tendons
    S.ellipsoid(canF, [0.56, 0.215, Z], [0.045, 0.048, 0.04], [0, 0, 0], fine); // fetlock
    S.ball(pasF, [0.532, 0.205, Z], 0.032, fine);
    S.cone(pasF, [0.56, 0.215, Z], [0.623, 0.087, Z], 0.034, 0.04, fine); // pastern
  }

  // ---- Neck (deep at the base, flattened sideways) ------------------------
  const nk = ['chest', 'neck1', 'neck2', 'neck3'];
  S.cone(nk, [0.5, 1.47, 0], [1.07, 1.885, 0], 0.14, 0.1, { sz: 0.72, k: 0.1, skin: 0.06 }); // crest
  S.cone(nk, [0.66, 1.25, 0], [1.05, 1.78, 0], 0.185, 0.108, { sz: 0.7, k: 0.1, skin: 0.06 }); // underline

  // ---- Head ---------------------------------------------------------------
  const hd = { k: 0.04, skin: 0.04 };
  S.ellipsoid('head', [1.165, 1.865, 0], [0.125, 0.095, 0.1], [0, 0, -50], { k: 0.06, skin: 0.04 }); // cranium
  S.cone('head', [1.19, 1.845, 0], [1.455, 1.515, 0], 0.085, 0.052, { sz: 0.85, k: 0.05, skin: 0.04 }); // face
  S.ellipsoid('head', [1.47, 1.468, 0], [0.082, 0.066, 0.064], [0, 0, -50], hd); // muzzle
  S.ball('head', [1.432, 1.412, 0], 0.04, { k: 0.03, skin: 0.04 }); // chin
  S.ball('head', [1.462, 1.418, 0], 0.03, { k: 0.025, skin: 0.04 }); // lower lip
  for (const z of [-1, 1]) {
    const side = z;
    S.ellipsoid('head', [1.16, 1.74, 0.07 * z], [0.118, 0.1, 0.042], [0, 0, -50], { k: 0.028, skin: 0.04, side }); // jowl
    S.cone('head', [1.16, 1.7, 0.045 * z], [1.42, 1.435, 0.028 * z], 0.045, 0.03, { ...hd, side }); // jaw bar
    S.ball('head', [1.232, 1.838, 0.07 * z], 0.038, { ...hd, side }); // brow
    S.cone('head', [1.26, 1.755, 0.074 * z], [1.36, 1.635, 0.052 * z], 0.018, 0.012, { k: 0.06, skin: 0.04, side }); // facial crest
    S.ball('head', [1.498, 1.455, 0.04 * z], 0.032, { k: 0.03, skin: 0.04, side }); // nostril flare
    S.ball('head', [1.25, 1.803, 0.089 * z], 0.03, { sub: true, k: 0.014 }); // eye socket
    S.ellipsoid('head', [1.521, 1.47, 0.047 * z], [0.02, 0.029, 0.013], [0, 25 * z, -40], { sub: true, k: 0.012 }); // nostril
  }
}

/** Where things attach, used by the eyes, ears, hooves and hair. */
export const EYE = { x: 1.25, y: 1.803, z: 0.083, r: 0.0255 };
