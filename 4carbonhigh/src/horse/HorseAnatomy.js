import * as THREE from 'three';

/**
 * Complete 48-bone anatomical equine skeleton & partition-aware skinning solver.
 * Coordinate convention:
 *   +X = Horse's Left (bilateral mirror across X = 0)
 *   +Y = Up (ground plane at Y = 0)
 *   +Z = Forward (muzzle at +Z, tail at -Z)
 *
 * Sagittal joint flexion/extension is pure rotation around X:
 *   -rotation.x swings a downward limb forward (protraction) or lifts neck/head up
 *   +rotation.x swings a downward limb backward (retraction/flexion) or nods head down
 */
export function createHorseSkeleton() {
  // World-space rest-pose joint coordinates (calibrated to a 16-hand / 1.60m Warmblood)
  const J = {
    Root: [0, 0.0, 0.0],
    Pelvis: [0, 1.35, -0.46],
    Lumbar: [0, 1.43, -0.14],
    Thorax: [0, 1.39, 0.18],
    Belly: [0, 1.08, 0.02],
    Chest: [0, 1.33, 0.46],

    Neck1: [0, 1.44, 0.58],
    Neck2: [0, 1.66, 0.73],
    Neck3: [0, 1.84, 0.84],
    Head: [0, 1.94, 0.91],

    Jaw: [0, 1.75, 0.97],
    MuzzleUpper: [0, 1.52, 1.18], // subtle nostril/upper-lip animation bone
    EarL: [0.064, 1.965, 0.905],
    EarR: [-0.064, 1.965, 0.905],
    EyelidL: [0.094, 1.825, 1.025],
    EyelidR: [-0.094, 1.825, 1.025],
    Forelock: [0, 1.98, 0.945],

    // Dynamic Mane spring bones along neck crest
    Mane0: [0, 1.60, 0.37],
    Mane1: [0, 1.65, 0.53],
    Mane2: [0, 1.75, 0.65],
    Mane3: [0, 1.85, 0.76],
    Mane4: [0, 1.94, 0.85],

    // 8-segment Tail chain (from dock at croup down past hocks)
    Tail0: [0, 1.43, -0.88],
    Tail1: [0, 1.36, -0.96],
    Tail2: [0, 1.23, -1.01],
    Tail3: [0, 1.07, -1.03],
    Tail4: [0, 0.89, -1.03],
    Tail5: [0, 0.71, -1.02],
    Tail6: [0, 0.53, -1.00],
    Tail7: [0, 0.36, -0.98],
  };

  // Forelimbs (FL = +1, FR = -1)
  for (const [prefix, s] of [['FL', 1], ['FR', -1]]) {
    J[`${prefix}_Scapula`] = [s * 0.145, 1.46, 0.39];
    J[`${prefix}_Shoulder`] = [s * 0.185, 1.12, 0.61];
    J[`${prefix}_Elbow`] = [s * 0.162, 0.88, 0.45];
    J[`${prefix}_Knee`] = [s * 0.150, 0.48, 0.46];
    J[`${prefix}_Fetlock`] = [s * 0.150, 0.205, 0.46];
    J[`${prefix}_Hoof`] = [s * 0.150, 0.085, 0.535];
  }

  // Hindlimbs (HL = +1, HR = -1)
  for (const [prefix, s] of [['HL', 1], ['HR', -1]]) {
    J[`${prefix}_Hip`] = [s * 0.175, 1.28, -0.58];
    J[`${prefix}_Stifle`] = [s * 0.195, 0.92, -0.42];
    J[`${prefix}_Hock`] = [s * 0.150, 0.52, -0.73];
    J[`${prefix}_Fetlock`] = [s * 0.150, 0.205, -0.72];
    J[`${prefix}_Hoof`] = [s * 0.150, 0.085, -0.645];
  }

  // Parent relationships
  const hierarchy = [
    ['Root', null],
    ['Pelvis', 'Root'],
    ['Lumbar', 'Pelvis'],
    ['Thorax', 'Lumbar'],
    ['Belly', 'Thorax'],
    ['Chest', 'Thorax'],

    ['Neck1', 'Chest'],
    ['Neck2', 'Neck1'],
    ['Neck3', 'Neck2'],
    ['Head', 'Neck3'],

    ['Jaw', 'Head'],
    ['MuzzleUpper', 'Head'],
    ['EarL', 'Head'],
    ['EarR', 'Head'],
    ['EyelidL', 'Head'],
    ['EyelidR', 'Head'],
    ['Forelock', 'Head'],

    ['Mane0', 'Chest'],
    ['Mane1', 'Neck1'],
    ['Mane2', 'Neck1'],
    ['Mane3', 'Neck2'],
    ['Mane4', 'Neck3'],

    ['Tail0', 'Pelvis'],
    ['Tail1', 'Tail0'],
    ['Tail2', 'Tail1'],
    ['Tail3', 'Tail2'],
    ['Tail4', 'Tail3'],
    ['Tail5', 'Tail4'],
    ['Tail6', 'Tail5'],
    ['Tail7', 'Tail6'],
  ];

  for (const prefix of ['FL', 'FR']) {
    hierarchy.push(
      [`${prefix}_Scapula`, 'Chest'],
      [`${prefix}_Shoulder`, `${prefix}_Scapula`],
      [`${prefix}_Elbow`, `${prefix}_Shoulder`],
      [`${prefix}_Knee`, `${prefix}_Elbow`],
      [`${prefix}_Fetlock`, `${prefix}_Knee`],
      [`${prefix}_Hoof`, `${prefix}_Fetlock`]
    );
  }

  for (const prefix of ['HL', 'HR']) {
    hierarchy.push(
      [`${prefix}_Hip`, 'Pelvis'],
      [`${prefix}_Stifle`, `${prefix}_Hip`],
      [`${prefix}_Hock`, `${prefix}_Stifle`],
      [`${prefix}_Fetlock`, `${prefix}_Hock`],
      [`${prefix}_Hoof`, `${prefix}_Fetlock`]
    );
  }

  const bones = [];
  const boneMap = {};
  const boneIndexMap = {};

  for (let i = 0; i < hierarchy.length; i++) {
    const [name, parentName] = hierarchy[i];
    const bone = new THREE.Bone();
    bone.name = name;

    const wPos = J[name];
    if (parentName) {
      const pPos = J[parentName];
      bone.position.set(
        wPos[0] - pPos[0],
        wPos[1] - pPos[1],
        wPos[2] - pPos[2]
      );
      boneMap[parentName].add(bone);
    } else {
      bone.position.set(wPos[0], wPos[1], wPos[2]);
    }

    // Save rest local position/rotation for animation layering
    bone.userData.restPos = bone.position.clone();
    bone.userData.worldRestPos = new THREE.Vector3(wPos[0], wPos[1], wPos[2]);

    bones.push(bone);
    boneMap[name] = bone;
    boneIndexMap[name] = i;
  }

  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  return { skeleton, bones, boneMap, boneIndexMap, joints: J };
}

/**
 * Computes clean, anatomically partitioned 4-bone skinning weights for the sculpted horse body.
 * Prevents cross-limb bleeding (Left vs Right) and upper-lip vs lower-jaw bleeding.
 */
export function skinBodyGeometry(geometry, boneIndexMap, J) {
  const posAttr = geometry.attributes.position;
  const count = posAttr.count;
  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  // Define anatomical bone influence capsules:
  // { bone, a, b, radius, falloff, side: 0|+1|-1, part: 'body'|'fore'|'hind'|'head'|'jaw'|'muzzle' }
  const capsules = [
    // Core torso & spine
    { bone: 'Pelvis', a: [0, 1.32, -0.82], b: [0, 1.36, -0.36], r: 0.24, falloff: 0.18, side: 0, part: 'body' },
    { bone: 'Lumbar', a: [0, 1.36, -0.36], b: [0, 1.40, 0.02], r: 0.25, falloff: 0.18, side: 0, part: 'body' },
    { bone: 'Thorax', a: [0, 1.24, 0.00], b: [0, 1.38, 0.34], r: 0.27, falloff: 0.20, side: 0, part: 'body' },
    { bone: 'Belly', a: [0, 0.92, -0.22], b: [0, 0.90, 0.22], r: 0.16, falloff: 0.14, side: 0, part: 'body' },
    { bone: 'Chest', a: [0, 1.06, 0.34], b: [0, 1.45, 0.56], r: 0.25, falloff: 0.19, side: 0, part: 'body' },

    // Tail dock root on body
    { bone: 'Tail0', a: [0, 1.43, -0.88], b: [0, 1.36, -0.96], r: 0.055, falloff: 0.06, side: 0, part: 'body' },

    // Neck chain
    { bone: 'Neck1', a: [0, 1.34, 0.54], b: [0, 1.62, 0.70], r: 0.17, falloff: 0.14, side: 0, part: 'body' },
    { bone: 'Neck2', a: [0, 1.62, 0.70], b: [0, 1.80, 0.81], r: 0.14, falloff: 0.12, side: 0, part: 'body' },
    { bone: 'Neck3', a: [0, 1.80, 0.81], b: [0, 1.92, 0.90], r: 0.11, falloff: 0.10, side: 0, part: 'body' },

    // Head, Upper Muzzle, & Lower Jaw
    { bone: 'Head', a: [0, 1.93, 0.91], b: [0, 1.62, 1.13], r: 0.105, falloff: 0.09, side: 0, part: 'head' },
    { bone: 'MuzzleUpper', a: [0, 1.56, 1.16], b: [0, 1.46, 1.26], r: 0.065, falloff: 0.055, side: 0, part: 'muzzle' },
    { bone: 'Jaw', a: [0, 1.72, 0.98], b: [0, 1.41, 1.22], r: 0.058, falloff: 0.045, side: 0, part: 'jaw' },
  ];

  // Add Forelimbs & Hindlimbs with strict left/right gating
  for (const [prefix, s] of [['FL', 1], ['FR', -1]]) {
    capsules.push(
      { bone: `${prefix}_Scapula`, a: J[`${prefix}_Scapula`], b: J[`${prefix}_Shoulder`], r: 0.11, falloff: 0.11, side: s, part: 'fore' },
      { bone: `${prefix}_Shoulder`, a: J[`${prefix}_Shoulder`], b: J[`${prefix}_Elbow`], r: 0.095, falloff: 0.095, side: s, part: 'fore' },
      { bone: `${prefix}_Elbow`, a: J[`${prefix}_Elbow`], b: J[`${prefix}_Knee`], r: 0.062, falloff: 0.055, side: s, part: 'fore' },
      { bone: `${prefix}_Knee`, a: J[`${prefix}_Knee`], b: J[`${prefix}_Fetlock`], r: 0.042, falloff: 0.042, side: s, part: 'fore' },
      { bone: `${prefix}_Fetlock`, a: J[`${prefix}_Fetlock`], b: J[`${prefix}_Hoof`], r: 0.040, falloff: 0.040, side: s, part: 'fore' },
      { bone: `${prefix}_Hoof`, a: J[`${prefix}_Hoof`], b: [s * 0.150, 0.02, 0.58], r: 0.050, falloff: 0.038, side: s, part: 'fore' }
    );
  }

  for (const [prefix, s] of [['HL', 1], ['HR', -1]]) {
    capsules.push(
      { bone: `${prefix}_Hip`, a: J[`${prefix}_Hip`], b: J[`${prefix}_Stifle`], r: 0.13, falloff: 0.12, side: s, part: 'hind' },
      { bone: `${prefix}_Stifle`, a: J[`${prefix}_Stifle`], b: J[`${prefix}_Hock`], r: 0.082, falloff: 0.075, side: s, part: 'hind' },
      { bone: `${prefix}_Hock`, a: J[`${prefix}_Hock`], b: J[`${prefix}_Fetlock`], r: 0.044, falloff: 0.044, side: s, part: 'hind' },
      { bone: `${prefix}_Fetlock`, a: J[`${prefix}_Fetlock`], b: J[`${prefix}_Hoof`], r: 0.040, falloff: 0.040, side: s, part: 'hind' },
      { bone: `${prefix}_Hoof`, a: J[`${prefix}_Hoof`], b: [s * 0.150, 0.02, -0.60], r: 0.050, falloff: 0.038, side: s, part: 'hind' }
    );
  }

  // Precompute capsule segment vectors and bone indices
  const compiled = capsules.map((c) => {
    const dx = c.b[0] - c.a[0];
    const dy = c.b[1] - c.a[1];
    const dz = c.b[2] - c.a[2];
    const lenSq = dx * dx + dy * dy + dz * dz;
    return {
      ...c,
      idx: boneIndexMap[c.bone],
      dx, dy, dz,
      invLenSq: lenSq > 1e-6 ? 1.0 / lenSq : 0.0,
    };
  });

  // Mouth separating plane for clean Jaw vs Upper Muzzle skinning:
  // Passes through mouth corner (0, 1.485, 1.18) and lips (0, 1.435, 1.26)
  // Tangent along mouth line: dz = +0.08, dy = -0.05 -> upward normal = (0, +0.08, +0.05) / 0.0943
  const mouthPy = 1.485, mouthPz = 1.18;
  const mouthNy = 0.848, mouthNz = 0.530;

  const topIdx = [0, 0, 0, 0];
  const topW = [0, 0, 0, 0];

  for (let v = 0; v < count; v++) {
    const px = posAttr.getX(v);
    const py = posAttr.getY(v);
    const pz = posAttr.getZ(v);

    topIdx[0] = 0; topIdx[1] = 0; topIdx[2] = 0; topIdx[3] = 0;
    topW[0] = 0; topW[1] = 0; topW[2] = 0; topW[3] = 0;

    // Signed distance above mouth cleft plane (positive = upper muzzle/cranium, negative = lower jaw)
    const mouthSide = (py - mouthPy) * mouthNy + (pz - mouthPz) * mouthNz;

    for (let i = 0; i < compiled.length; i++) {
      const c = compiled[i];

      // Prevent cross-side limb bleeding: left limb bones never pull right-side vertices and vice versa
      if (c.side !== 0 && px * c.side < -0.015) continue;

      // Prevent torso bones from grabbing free-hanging lower legs below elbow/stifle
      if (c.part === 'body' && py < 0.82) continue;

      // Partition lower jaw vs upper muzzle cleanly near mouth
      if (c.part === 'jaw') {
        if (pz < 1.02 || mouthSide > 0.012 || Math.abs(px) > 0.085) continue;
      }
      if (c.part === 'muzzle' && mouthSide < -0.012) continue;

      // Point-to-segment distance
      let t = ((px - c.a[0]) * c.dx + (py - c.a[1]) * c.dy + (pz - c.a[2]) * c.dz) * c.invLenSq;
      if (t < 0.0) t = 0.0;
      else if (t > 1.0) t = 1.0;

      const qx = px - (c.a[0] + c.dx * t);
      const qy = py - (c.a[1] + c.dy * t);
      const qz = pz - (c.a[2] + c.dz * t);
      const dist = Math.sqrt(qx * qx + qy * qy + qz * qz);

      // Smooth Gaussian-like kernel around bone capsule
      const excess = Math.max(0.0, dist - c.r);
      const normDist = excess / c.falloff;
      if (normDist > 2.6) continue;

      let w = Math.exp(-2.2 * normDist * normDist);

      // Smooth fade at midline for side-specific upper shoulder/hip capsules
      if (c.side !== 0 && px * c.side < 0.04) {
        w *= Math.max(0.0, (px * c.side + 0.015) / 0.055);
      }

      if (w <= 1e-4) continue;

      // Merge if same bone index already in top 4, else insert into sorted top 4
      let merged = false;
      for (let k = 0; k < 4; k++) {
        if (topW[k] > 0 && topIdx[k] === c.idx) {
          if (w > topW[k]) topW[k] = w;
          merged = true;
          break;
        }
      }
      if (!merged && w > topW[3]) {
        topW[3] = w;
        topIdx[3] = c.idx;
      }
      // Keep top 4 sorted descending
      for (let k = 3; k > 0; k--) {
        if (topW[k] > topW[k - 1]) {
          const tw = topW[k - 1]; topW[k - 1] = topW[k]; topW[k] = tw;
          const ti = topIdx[k - 1]; topIdx[k - 1] = topIdx[k]; topIdx[k] = ti;
        }
      }
    }

    // Fallback if a vertex fell slightly outside all kernels: snap to nearest capsule
    let sum = topW[0] + topW[1] + topW[2] + topW[3];
    if (sum < 1e-5) {
      let bestDist = Infinity;
      let bestBone = boneIndexMap.Thorax;
      for (let i = 0; i < compiled.length; i++) {
        const c = compiled[i];
        if (c.side !== 0 && px * c.side < 0) continue;
        let t = ((px - c.a[0]) * c.dx + (py - c.a[1]) * c.dy + (pz - c.a[2]) * c.dz) * c.invLenSq;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - (c.a[0] + c.dx * t), py - (c.a[1] + c.dy * t), pz - (c.a[2] + c.dz * t));
        if (d < bestDist) {
          bestDist = d;
          bestBone = c.idx;
        }
      }
      topIdx[0] = bestBone;
      topW[0] = 1.0;
      sum = 1.0;
    }

    const invSum = 1.0 / sum;
    const v4 = v * 4;
    skinIndices[v4] = topIdx[0];
    skinIndices[v4 + 1] = topIdx[1];
    skinIndices[v4 + 2] = topIdx[2];
    skinIndices[v4 + 3] = topIdx[3];

    skinWeights[v4] = topW[0] * invSum;
    skinWeights[v4 + 1] = topW[1] * invSum;
    skinWeights[v4 + 2] = topW[2] * invSum;
    skinWeights[v4 + 3] = topW[3] * invSum;
  }

  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4));
}
