import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Builds crisp parametric anatomical details bound to the equine skeleton:
 *  1. 4 oblique keratin Hoof capsules (with sloped toe/heel wall, coronet rim, sole & frog concavity)
 *  2. 2 cupped, mobile cartilaginous Ears (skinned smoothly to EarL / EarR + Head)
 *  3. 2 multi-layer Equine Eyes + blinking Upper Eyelids
 *  4. Lush layered Mane, Forelock, flowing Tail & Fetlock Tufts (SkinnedMesh driven by spring bones!)
 */

export function buildHoovesGeometry(boneIndexMap, joints) {
  const parts = [];

  // Limb specs: [boneName, limbId, toeFwdOffset, heelBackOffset, halfWidth]
  const specs = [
    ['FL_Hoof', 0, 0.088, -0.046, 0.056],
    ['FR_Hoof', 1, 0.088, -0.046, 0.056],
    ['HL_Hoof', 2, 0.082, -0.044, 0.053], // Hind hooves are slightly narrower/steeper than front!
    ['HR_Hoof', 3, 0.082, -0.044, 0.053],
  ];

  const radialSegs = 28;
  const heightSegs = 8;

  for (const [boneName, limbId, toeOff, heelOff, halfW] of specs) {
    const bIdx = boneIndexMap[boneName];
    const [bx, by, bz] = joints[boneName]; // (x, ~0.085, z)

    const positions = [];
    const hoofParams = [];
    const indices = [];

    // Coronet center (top of hoof capsule) slightly overlapping pastern at y = 0.088..0.052
    // Sole center on ground y = 0.002
    for (let iy = 0; iy <= heightSegs; iy++) {
      const v = iy / heightSegs; // 0 = ground sole, 1 = coronet rim
      for (let ir = 0; ir <= radialSegs; ir++) {
        const u = ir / radialSegs;
        const theta = (u - 0.5) * Math.PI * 2.0; // 0 = forward toe (+Z), +-PI = rear heel (-Z)
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Coronet ring is smaller & positioned back/up along pastern angle; sole flares forward & wider
        const topRadiusX = 0.041;
        const topRadiusZ = 0.043;
        const botRadiusX = halfW;

        // Asymmetric Equine Hoof Wall: longer sloping toe in front (+cosT), shorter steeper heel in back (-cosT)
        // Slight heel cleft indentation at rear (theta ~ +-PI)
        const heelCleft = Math.pow(Math.max(0, -cosT), 6.0) * 0.008;

        const topZ = bz + cosT * topRadiusZ;
        const topX = bx + sinT * topRadiusX;
        // Sloped coronary band: higher at front toe (~0.094m), lower at heel bulbs (~0.052m)
        const topY = by + 0.008 + cosT * 0.018;

        // Ground sole contour
        const soleCenterZ = bz + 0.022;
        const botZ = soleCenterZ + (cosT >= 0 ? cosT * (toeOff - 0.022) : cosT * Math.abs(heelOff + 0.022)) + heelCleft;
        const botX = bx + sinT * botRadiusX * (1.0 - 0.08 * Math.max(0, -cosT));
        const botY = 0.0;

        // Subtle outward curve / coronet bulge
        const wallCurve = Math.sin(v * Math.PI) * 0.0025;
        const px = botX + (topX - botX) * v + sinT * wallCurve;
        const py = botY + (topY - botY) * v;
        const pz = botZ + (topZ - botZ) * v + cosT * wallCurve;

        positions.push(px, py, pz);
        hoofParams.push(theta, v, limbId);
      }
    }

    const rowStride = radialSegs + 1;
    for (let iy = 0; iy < heightSegs; iy++) {
      for (let ir = 0; ir < radialSegs; ir++) {
        const a = iy * rowStride + ir;
        const b = a + 1;
        const c = a + rowStride;
        const d = c + 1;
        // Outward normal check: theta increases from -PI -> 0 (+Z) -> +PI:
        // At theta = 0 (+Z), +ir goes toward +X (sinT > 0), +iy goes +Y -> (b-a)x(c-a) = (+X)x(+Y) = +Z!
        indices.push(a, b, d, a, d, c);
      }
    }

    // Concave Sole & Frog cap on bottom so lifted hooves in gallop/rear look real underneath!
    const soleCenterIdx = positions.length / 3;
    positions.push(bx, 0.014, bz + 0.018); // Concave arch inside sole
    hoofParams.push(0, 0.0, limbId);
    for (let ir = 0; ir < radialSegs; ir++) {
      indices.push(soleCenterIdx, ir + 1, ir);
    }

    // Top inner cap at coronet so no gap is ever visible
    const topCapIdx = positions.length / 3;
    positions.push(bx, by + 0.006, bz);
    hoofParams.push(0, 1.0, limbId);
    const topRow = heightSegs * rowStride;
    for (let ir = 0; ir < radialSegs; ir++) {
      indices.push(topCapIdx, topRow + ir, topRow + ir + 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aHoofParam', new THREE.Float32BufferAttribute(hoofParams, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const vCount = geo.attributes.position.count;
    const skinIdx = new Uint16Array(vCount * 4);
    const skinW = new Float32Array(vCount * 4);
    const fetlockIdx = boneIndexMap[boneName.replace('_Hoof', '_Fetlock')];
    for (let i = 0; i < vCount; i++) {
      const v = hoofParams[i * 3 + 1];
      const wFet = v > 0.85 ? (v - 0.85) / 0.15 * 0.25 : 0.0;
      skinIdx[i * 4] = bIdx;
      skinIdx[i * 4 + 1] = fetlockIdx;
      skinW[i * 4] = 1.0 - wFet;
      skinW[i * 4 + 1] = wFet;
    }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIdx, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
    parts.push(geo);
  }

  return mergeGeometries(parts, false);
}

/**
 * Builds thin, sculpted, cupped Equine Ears skinned to EarL / EarR & Head.
 */
export function buildEarsGeometry(boneIndexMap, joints) {
  const parts = [];
  const headIdx = boneIndexMap.Head;

  for (const [boneName, side] of [['EarL', 1], ['EarR', -1]]) {
    const earIdx = boneIndexMap[boneName];
    const [bx, by, bz] = joints[boneName];

    const uSegs = 20; // Around cross-section (outer back -> edge -> inner cup -> edge -> outer back)
    const vSegs = 14; // From base [0] to pointed tip [1]
    const earHeight = 0.158;

    const positions = [];
    const earUVs = [];
    const indices = [];

    for (let iv = 0; iv <= vSegs; iv++) {
      const v = iv / vSegs;
      // Equine ear narrows at ankle base, widens mid-pinna, then tapers to a graceful slightly-inward-curved tip!
      const widthProfile = Math.sin(Math.pow(v, 0.72) * Math.PI) * 0.032 + (1.0 - v) * 0.016;
      const depthProfile = Math.sin(Math.pow(v, 0.75) * Math.PI) * 0.022 + (1.0 - v) * 0.015;

      // Slight graceful curve: outward & forward, with tiny inward hook at very tip
      const spineX = bx + side * (v * 0.032 - Math.pow(v, 3.0) * 0.010);
      const spineY = by - 0.012 + v * earHeight;
      const spineZ = bz + v * 0.028;

      for (let iu = 0; iu <= uSegs; iu++) {
        const u = iu / uSegs;
        const phi = u * Math.PI * 2.0; // 0 = back of ear, PI = front cupped opening

        // Cupped crescent cross-section!
        // When cos(phi) < 0 (front half facing forward-outward), indent inward to create hollow ear canal!
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);

        const cupOpen = Math.sin(Math.pow(v, 0.8) * Math.PI * 0.92); // Deepest cup in mid-upper ear
        let localZ;
        let isInner = 0.0;
        if (cosP >= 0) {
          // Outer convex back of ear (-Z/+X)
          localZ = -cosP * depthProfile;
        } else {
          // Inner concave front cup of ear (+Z)
          const indent = -cosP; // 0..1
          localZ = -indent * depthProfile * (0.55 * cupOpen - 0.35 * (1.0 - cupOpen));
          isInner = indent * cupOpen;
        }
        const localX = sinP * widthProfile;

        // Rotate ear cross-section slightly outward (~28 deg around Y) so opening faces forward-outward!
        const yaw = side * -0.45;
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const rx = localX * cy + localZ * sy;
        const rz = -localX * sy + localZ * cy;

        positions.push(spineX + rx, spineY, spineZ + rz);
        earUVs.push(isInner, v);
      }
    }

    const stride = uSegs + 1;
    for (let iv = 0; iv < vSegs; iv++) {
      for (let iu = 0; iu < uSegs; iu++) {
        const a = iv * stride + iu;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, d, a, d, b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aEarUV', new THREE.Float32BufferAttribute(earUVs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const vCount = geo.attributes.position.count;
    const skinIdx = new Uint16Array(vCount * 4);
    const skinW = new Float32Array(vCount * 4);
    for (let i = 0; i < vCount; i++) {
      const v = earUVs[i * 2 + 1];
      const wEar = Math.min(1.0, Math.max(0.0, (v - 0.04) / 0.18));
      skinIdx[i * 4] = earIdx;
      skinIdx[i * 4 + 1] = headIdx;
      skinW[i * 4] = wEar;
      skinW[i * 4 + 1] = 1.0 - wEar;
    }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIdx, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
    parts.push(geo);
  }

  return mergeGeometries(parts, false);
}

/**
 * Builds multi-layer Equine Eyeballs (attached directly to Head bone) + blinking Upper Eyelids!
 */
export function buildEyesAndLids(boneMap, boneIndexMap, joints, eyeMaterial, bodyMaterial) {
  const headBone = boneMap.Head;
  const headPos = joints.Head;

  for (const [side, lidBoneName] of [[1, 'EyelidL'], [-1, 'EyelidR']]) {
    const eyeWorld = [side * 0.089, 1.825, 1.026];

    // Eyeball sphere (~21mm radius — horses have the largest eyes of any land mammal!)
    const eyeGeo = new THREE.SphereGeometry(0.022, 28, 22);
    const eyeMesh = new THREE.Mesh(eyeGeo, eyeMaterial);
    eyeMesh.position.set(
      eyeWorld[0] - headPos[0],
      eyeWorld[1] - headPos[1],
      eyeWorld[2] - headPos[2]
    );
    // Orient +Z outward-forward (~62 deg lateral + 18 deg forward-down along skull plane!)
    eyeMesh.rotation.order = 'YXZ';
    eyeMesh.rotation.y = side * 1.12; // ~64 degrees laterally outward, 26 degrees forward!
    eyeMesh.rotation.x = 0.22; // Keep horizontal pupil aligned parallel to ground horizon!
    headBone.add(eyeMesh);

    // Blinking Upper Eyelid hemispherical shell parented to EyelidL / EyelidR bone
    const lidBone = boneMap[lidBoneName];
    const lidGeo = new THREE.SphereGeometry(0.0242, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.48);
    // Populate aRestPos so bodyMaterial compiles cleanly on eyelid shell
    const lidPos = lidGeo.attributes.position;
    const lidRest = new Float32Array(lidPos.count * 3);
    for (let i = 0; i < lidPos.count; i++) {
      lidRest[i * 3] = eyeWorld[0] + lidPos.getX(i);
      lidRest[i * 3 + 1] = eyeWorld[1] + lidPos.getY(i);
      lidRest[i * 3 + 2] = eyeWorld[2] + lidPos.getZ(i);
    }
    lidGeo.setAttribute('aRestPos', new THREE.BufferAttribute(lidRest, 3));

    const lidMesh = new THREE.Mesh(lidGeo, bodyMaterial);
    const lidWorld = joints[lidBoneName];
    lidMesh.position.set(
      eyeWorld[0] - lidWorld[0],
      eyeWorld[1] - lidWorld[1],
      eyeWorld[2] - lidWorld[2]
    );
    lidMesh.rotation.order = 'YXZ';
    lidMesh.rotation.y = side * 1.12;
    lidMesh.rotation.x = 0.08; // Calm, noble hooded upper eyelid resting position; rotates down (+0.95) on blink!
    lidBone.add(lidMesh);
  }
}

/**
 * Helper: deterministic pseudo-random generator for organic hair clumping without Math.random() flicker.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Emits a curved, V-cambered 3D hair ribbon lock along a 3D spline with root-to-tip taper & skin weights.
 */
function createHairLockRibbon(curvePoints, widthRoot, widthMid, widthTip, camber, seed, boneWeightsPerPoint) {
  const nPts = curvePoints.length;
  const cols = 3; // Left edge (-1), raised center spine (0), right edge (+1) -> 3D V-ribbon volume!
  const positions = [];
  const hairParams = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];

  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const sideVec = new THREE.Vector3();

  for (let i = 0; i < nPts; i++) {
    const v = i / (nPts - 1);
    const p = curvePoints[i];

    if (i < nPts - 1) {
      tangent.subVectors(curvePoints[i + 1], p).normalize();
    } else {
      tangent.subVectors(p, curvePoints[i - 1]).normalize();
    }

    // Build stable ribbon frame
    const upRef = Math.abs(tangent.x) > 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    // For side-draping locks vs tail plumes, compute clean outward normal & binormal
    normal.copy(p).setY(0);
    if (normal.lengthSq() < 1e-4) normal.set(0, 0, -1);
    normal.normalize();
    sideVec.crossVectors(tangent, normal);
    if (sideVec.lengthSq() < 1e-4) {
      sideVec.crossVectors(tangent, upRef);
    }
    sideVec.normalize();
    normal.crossVectors(sideVec, tangent).normalize();

    const w = v < 0.45
      ? THREE.MathUtils.lerp(widthRoot, widthMid, v / 0.45)
      : THREE.MathUtils.lerp(widthMid, widthTip, (v - 0.45) / 0.55);

    const bw = boneWeightsPerPoint[i];

    for (let c = 0; c < cols; c++) {
      const u = c - 1; // -1, 0, +1
      const camberLift = (1.0 - Math.abs(u)) * camber * (1.0 - v * 0.5);
      const vx = p.x + sideVec.x * (u * w) + normal.x * camberLift;
      const vy = p.y + sideVec.y * (u * w) + normal.y * camberLift;
      const vz = p.z + sideVec.z * (u * w) + normal.z * camberLift;

      positions.push(vx, vy, vz);
      hairParams.push(u, v, seed);
      skinIndices.push(bw.i0, bw.i1, 0, 0);
      skinWeights.push(bw.w0, bw.w1, 0, 0);
    }
  }

  for (let i = 0; i < nPts - 1; i++) {
    const r0 = i * cols;
    const r1 = (i + 1) * cols;
    for (let c = 0; c < cols - 1; c++) {
      const a = r0 + c;
      const b = a + 1;
      const d = r1 + c;
      const e = d + 1;
      indices.push(a, d, e, a, e, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aHairParam', new THREE.Float32BufferAttribute(hairParams, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the complete SkinnedMesh hair system:
 *  - Flowing Mane along neck crest (draping predominantly to the right side -X, with stray natural locks)
 *  - Forelock draping between the ears over the forehead
 *  - Lush, voluminous 8-bone physics-ready Tail skirt
 *  - Subtle silky Fetlock tufts behind all 4 fetlocks
 */
export function buildHorseHairGeometry(boneIndexMap, joints) {
  const rand = mulberry32(90210);
  const ribbons = [];

  // =========================================================================
  // 1. MANE ALONG NECK CREST (Withers -> Poll, emerging cleanly atop the crest!)
  // =========================================================================
  const maneStations = [
    { pos: [0, 1.59, 0.34], neckHalfW: 0.078, springBone: boneIndexMap.Mane0, neckBone: boneIndexMap.Chest },
    { pos: [0, 1.67, 0.46], neckHalfW: 0.088, springBone: boneIndexMap.Mane1, neckBone: boneIndexMap.Neck1 },
    { pos: [0, 1.79, 0.59], neckHalfW: 0.086, springBone: boneIndexMap.Mane2, neckBone: boneIndexMap.Neck1 },
    { pos: [0, 1.88, 0.71], neckHalfW: 0.078, springBone: boneIndexMap.Mane3, neckBone: boneIndexMap.Neck2 },
    { pos: [0, 1.96, 0.82], neckHalfW: 0.068, springBone: boneIndexMap.Mane4, neckBone: boneIndexMap.Neck3 },
    { pos: [0, 1.98, 0.90], neckHalfW: 0.058, springBone: boneIndexMap.Mane4, neckBone: boneIndexMap.Head },
  ];

  const crestCurve = new THREE.CatmullRomCurve3(
    maneStations.map((s) => new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]))
  );

  const numManeLocks = 112;
  for (let m = 0; m < numManeLocks; m++) {
    const s = m / (numManeLocks - 1); // 0 = withers, 1 = poll behind ears
    const rootPt = crestCurve.getPoint(s);

    // Predominantly drapes to Horse's Right (-X), with ~12% natural stray wisps on Left (+X)
    const isLeftStray = rand() < 0.12;
    const drapeSide = isLeftStray ? 1.0 : -1.0;
    const layer = rand(); // 0 = inner close to neck skin, 1 = outer airy locks

    // Mane length: lush full curtain mid-neck (~32cm), tapering cleanly toward withers & poll
    const archLen = 0.18 + Math.sin(Math.pow(s, 0.85) * Math.PI * 0.94) * 0.16 + (rand() - 0.5) * 0.05;
    const lockLen = isLeftStray ? archLen * 0.55 : archLen;

    // Interpolate station bone indices & local neck half-width so hair arches cleanly OVER neck surface!
    const stFloat = s * (maneStations.length - 1);
    const st0 = Math.min(maneStations.length - 2, Math.floor(stFloat));
    const stFrac = stFloat - st0;
    const springIdx = stFrac < 0.5 ? maneStations[st0].springBone : maneStations[st0 + 1].springBone;
    const neckIdx = stFrac < 0.5 ? maneStations[st0].neckBone : maneStations[st0 + 1].neckBone;
    const neckHalfW = THREE.MathUtils.lerp(maneStations[st0].neckHalfW, maneStations[st0 + 1].neckHalfW, stFrac);

    const segs = 8;
    const pts = [];
    const bWeights = [];
    const wavePhase = rand() * Math.PI * 2.0;
    const zJitter = (rand() - 0.5) * 0.022;

    for (let k = 0; k <= segs; k++) {
      const v = k / segs;
      // Rapidly clears neck crest half-width via smooth fountain arch, then drapes alongside neck!
      const clearArch = Math.sin(Math.min(1.0, v * 2.1) * Math.PI * 0.5);
      const outX = drapeSide * (
        clearArch * (neckHalfW + 0.014 + layer * 0.024)
        + v * 0.028
        + Math.sin(v * 4.8 + wavePhase) * 0.007
      );
      const crestFountain = Math.sin(v * Math.PI * 0.55) * (0.018 + layer * 0.012) * (1.0 - v);
      const dropY = crestFountain - Math.pow(v, 1.25) * lockLen;
      const sweepZ = zJitter - v * 0.055 + Math.cos(v * 3.8 + wavePhase) * 0.007;

      pts.push(new THREE.Vector3(rootPt.x + outX, rootPt.y + dropY, rootPt.z + sweepZ));

      const wSpring = Math.min(1.0, v * 1.15);
      bWeights.push({
        i0: springIdx,
        i1: neckIdx,
        w0: wSpring,
        w1: 1.0 - wSpring,
      });
    }

    ribbons.push(
      createHairLockRibbon(
        pts,
        0.018 + rand() * 0.008,
        0.024 + rand() * 0.010,
        0.004,
        0.005,
        rand(),
        bWeights
      )
    );
  }

  // =========================================================================
  // 2. FORELOCK (Hugging the forehead slope gracefully between the ears!)
  // =========================================================================
  const forelockIdx = boneIndexMap.Forelock;
  const headIdx = boneIndexMap.Head;

  for (let f = 0; f < 28; f++) {
    const spread = (f / 27 - 0.5) * 2.0; // -1..+1 between ears
    const len = 0.14 + (1.0 - Math.abs(spread) * 0.55) * 0.065 + (rand() - 0.5) * 0.025;
    const pts = [];
    const bWeights = [];
    const segs = 6;
    const curl = (rand() - 0.5) * 0.018;
    const loft = 0.008 + rand() * 0.010;

    for (let k = 0; k <= segs; k++) {
      const v = k / segs;
      // Hugs skull bridge from poll (0, 1.965, 0.93) down forehead toward (0, 1.79, 1.065)
      const px = spread * (0.024 * (1.0 - v * 0.35)) + Math.sin(v * 3.5) * curl;
      const py = 1.965 - v * len * 0.86 + Math.sin(v * Math.PI) * loft;
      const pz = 0.930 + v * len * 0.72 + Math.sin(v * Math.PI) * (loft * 0.9);

      pts.push(new THREE.Vector3(px, py, pz));
      const wSpring = Math.min(1.0, v * 1.2);
      bWeights.push({ i0: forelockIdx, i1: headIdx, w0: wSpring, w1: 1.0 - wSpring });
    }

    ribbons.push(createHairLockRibbon(pts, 0.013, 0.017, 0.003, 0.004, rand(), bWeights));
  }

  // =========================================================================
  // 3. VOLUMINOUS FLOWING TAIL (Skinned across 8 dynamic Tail0..Tail7 bones!)
  // =========================================================================
  const tailNames = ['Tail0', 'Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7'];
  const tailBoneIndices = tailNames.map((n) => boneIndexMap[n]);
  const tailSpinePts = tailNames.map((n) => new THREE.Vector3(...joints[n]));
  // Extend wispy hair tips slightly below Tail7 down to y ~ 0.25m
  tailSpinePts.push(new THREE.Vector3(0, 0.24, -0.96));
  const tailCurve = new THREE.CatmullRomCurve3(tailSpinePts);

  const numTailPlumes = 135;
  for (let t = 0; t < numTailPlumes; t++) {
    // Plumes originate either at the dock/upper tailbone (sStart in [0, 0.28]) and cascade down to [0.68..1.0]
    const sStart = Math.pow(rand(), 1.6) * 0.28;
    const sEnd = 0.66 + rand() * 0.34;

    const azim = (rand() - 0.5) * Math.PI * 1.75 + Math.PI; // Fanned radially around -Z / sides
    const sinA = Math.sin(azim);
    const cosA = Math.cos(azim);
    const shellLayer = 0.35 + rand() * 0.65; // Inner core + outer silky curtain
    const waveSeed = rand() * Math.PI * 2.0;

    const segs = 9;
    const pts = [];
    const bWeights = [];

    for (let k = 0; k <= segs; k++) {
      const v = k / segs;
      const s = THREE.MathUtils.lerp(sStart, sEnd, v);
      const center = tailCurve.getPoint(s);

      // Tail volume profile: compact sleek dock at top -> full luxurious skirt mid-tail -> tapered bottom!
      const fullness = Math.sin(Math.pow(s, 0.68) * Math.PI * 0.92);
      const radX = (0.028 + 0.082 * fullness) * shellLayer;
      const radZ = (0.028 + 0.068 * fullness) * shellLayer;

      const waveX = Math.sin(v * 5.2 + waveSeed) * 0.012 * v;
      const waveZ = Math.cos(v * 4.4 + waveSeed) * 0.010 * v;

      pts.push(
        new THREE.Vector3(
          center.x + sinA * radX + waveX,
          center.y,
          center.z + cosA * radZ + waveZ
        )
      );

      // Map s in [0, 1] smoothly onto Tail0..Tail7 (indices 0..7)
      const boneFloat = Math.min(6.999, s * 7.4);
      const b0 = Math.floor(boneFloat);
      const frac = boneFloat - b0;
      bWeights.push({
        i0: tailBoneIndices[b0],
        i1: tailBoneIndices[b0 + 1],
        w0: 1.0 - frac,
        w1: frac,
      });
    }

    ribbons.push(
      createHairLockRibbon(
        pts,
        0.016 + rand() * 0.008,
        0.026 + rand() * 0.012,
        0.004,
        0.006,
        rand(),
        bWeights
      )
    );
  }

  // =========================================================================
  // 4. SUBTLE FETLOCK ERGOTS / FEATHER TUFTS (Behind all 4 fetlock joints)
  // =========================================================================
  for (const prefix of ['FL', 'FR', 'HL', 'HR']) {
    const fetPos = joints[`${prefix}_Fetlock`];
    const fetIdx = boneIndexMap[`${prefix}_Fetlock`];
    for (let j = 0; j < 7; j++) {
      const spread = (j / 6 - 0.5) * 0.036;
      const pts = [
        new THREE.Vector3(fetPos[0] + spread, fetPos[1] + 0.015, fetPos[2] - 0.030),
        new THREE.Vector3(fetPos[0] + spread * 1.2, fetPos[1] - 0.032, fetPos[2] - 0.048),
        new THREE.Vector3(fetPos[0] + spread * 1.1, fetPos[1] - 0.075, fetPos[2] - 0.042),
      ];
      const bw = [
        { i0: fetIdx, i1: fetIdx, w0: 1, w1: 0 },
        { i0: fetIdx, i1: fetIdx, w0: 1, w1: 0 },
        { i0: fetIdx, i1: fetIdx, w0: 1, w1: 0 },
      ];
      ribbons.push(createHairLockRibbon(pts, 0.009, 0.012, 0.002, 0.003, rand(), bw));
    }
  }

  return mergeGeometries(ribbons, false);
}
