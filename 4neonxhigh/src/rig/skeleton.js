/**
 * skeleton.js — Full 39-bone anatomical equine skeleton (THREE.Skeleton)
 * plus anatomically region-gated capsule skin-weight solver for zero cross-leg
 * artifacts and silky organic deformation across body, mane, tail, and fetlocks.
 */

import * as THREE from 'three';

/**
 * Anatomical bone definitions in world rest coordinates (+Z forward, +Y up, +X left).
 * Each entry defines: name, parentName, pos (joint pivot), tip (segment end for skinning),
 * radius (falloff width), and region (gating tag to prevent cross-limb bleeding).
 */
const BONE_SPECS = [
  // Core spine & torso
  { name: 'pelvis',    parent: null,        pos: [0, 1.28, -0.46],  tip: [0, 1.26, -0.78], radius: 0.34, region: 'torso' },
  { name: 'spine1',    parent: 'pelvis',    pos: [0, 1.26, -0.22],  tip: [0, 1.24, 0.06],  radius: 0.34, region: 'torso' },
  { name: 'chest',     parent: 'spine1',    pos: [0, 1.26, 0.24],   tip: [0, 1.28, 0.68],  radius: 0.36, region: 'torso' },

  // Arched neck & head
  { name: 'neck1',     parent: 'chest',     pos: [0, 1.42, 0.68],   tip: [0, 1.62, 0.82],  radius: 0.24, region: 'neck' },
  { name: 'neck2',     parent: 'neck1',     pos: [0, 1.62, 0.82],   tip: [0, 1.82, 0.93],  radius: 0.20, region: 'neck' },
  { name: 'neck3',     parent: 'neck2',     pos: [0, 1.82, 0.93],   tip: [0, 1.95, 0.99],  radius: 0.16, region: 'neck' },
  { name: 'head',      parent: 'neck3',     pos: [0, 1.95, 0.99],   tip: [0, 1.58, 1.40],  radius: 0.18, region: 'head' },
  { name: 'earL',      parent: 'head',      pos: [0.066, 2.04, 1.005],  tip: [0.092, 2.22, 1.055], radius: 0.065, region: 'earL' },
  { name: 'earR',      parent: 'head',      pos: [-0.066, 2.04, 1.005], tip: [-0.092, 2.22, 1.055], radius: 0.065, region: 'earR' },

  // Articulated 4-bone tail chain (dock + cascading hair)
  { name: 'tail1',     parent: 'pelvis',    pos: [0, 1.44, -0.84],  tip: [0, 1.38, -0.97], radius: 0.12, region: 'tail' },
  { name: 'tail2',     parent: 'tail1',     pos: [0, 1.38, -0.97],  tip: [0, 1.15, -1.06], radius: 0.16, region: 'tail' },
  { name: 'tail3',     parent: 'tail2',     pos: [0, 1.15, -1.06],  tip: [0, 0.78, -1.11], radius: 0.22, region: 'tail' },
  { name: 'tail4',     parent: 'tail3',     pos: [0, 0.78, -1.11],  tip: [0, 0.36, -1.14], radius: 0.26, region: 'tail' },

  // Left Foreleg (+X)
  { name: 'shoulderL', parent: 'chest',     pos: [0.165, 1.24, 0.54], tip: [0.162, 0.87, 0.468], radius: 0.24, region: 'foreL' },
  { name: 'forearmL',  parent: 'shoulderL', pos: [0.162, 0.87, 0.468], tip: [0.139, 0.515, 0.506], radius: 0.16, region: 'foreL' },
  { name: 'kneeL',     parent: 'forearmL',  pos: [0.139, 0.515, 0.506], tip: [0.136, 0.192, 0.490], radius: 0.11, region: 'foreL' },
  { name: 'fetlockL',  parent: 'kneeL',     pos: [0.136, 0.192, 0.490], tip: [0.136, 0.072, 0.559], radius: 0.085, region: 'foreL' },
  { name: 'hoofL',     parent: 'fetlockL',  pos: [0.136, 0.072, 0.559], tip: [0.136, 0.0, 0.589], radius: 0.08, region: 'foreL' },

  // Right Foreleg (-X)
  { name: 'shoulderR', parent: 'chest',     pos: [-0.165, 1.24, 0.54], tip: [-0.162, 0.87, 0.468], radius: 0.24, region: 'foreR' },
  { name: 'forearmR',  parent: 'shoulderR', pos: [-0.162, 0.87, 0.468], tip: [-0.139, 0.515, 0.506], radius: 0.16, region: 'foreR' },
  { name: 'kneeR',     parent: 'forearmR',  pos: [-0.139, 0.515, 0.506], tip: [-0.136, 0.192, 0.490], radius: 0.11, region: 'foreR' },
  { name: 'fetlockR',  parent: 'kneeR',     pos: [-0.136, 0.192, 0.490], tip: [-0.136, 0.072, 0.559], radius: 0.085, region: 'foreR' },
  { name: 'hoofR',     parent: 'fetlockR',  pos: [-0.136, 0.072, 0.559], tip: [-0.136, 0.0, 0.589], radius: 0.08, region: 'foreR' },

  // Left Hindleg (+X)
  { name: 'hipL',      parent: 'pelvis',    pos: [0.190, 1.28, -0.52], tip: [0.190, 0.95, -0.44], radius: 0.25, region: 'hindL' },
  { name: 'stifleL',   parent: 'hipL',      pos: [0.190, 0.95, -0.44], tip: [0.152, 0.565, -0.728], radius: 0.17, region: 'hindL' },
  { name: 'hockL',     parent: 'stifleL',   pos: [0.152, 0.565, -0.728], tip: [0.146, 0.195, -0.692], radius: 0.11, region: 'hindL' },
  { name: 'hindFetL',  parent: 'hockL',     pos: [0.146, 0.195, -0.692], tip: [0.146, 0.074, -0.620], radius: 0.085, region: 'hindL' },
  { name: 'hindHoofL', parent: 'hindFetL',  pos: [0.146, 0.074, -0.620], tip: [0.146, 0.0, -0.594], radius: 0.08, region: 'hindL' },

  // Right Hindleg (-X)
  { name: 'hipR',      parent: 'pelvis',    pos: [-0.190, 1.28, -0.52], tip: [-0.190, 0.95, -0.44], radius: 0.25, region: 'hindR' },
  { name: 'stifleR',   parent: 'hipR',      pos: [-0.190, 0.95, -0.44], tip: [-0.152, 0.565, -0.728], radius: 0.17, region: 'hindR' },
  { name: 'hockR',     parent: 'stifleR',   pos: [-0.152, 0.565, -0.728], tip: [-0.146, 0.195, -0.692], radius: 0.11, region: 'hindR' },
  { name: 'hindFetR',  parent: 'hockR',     pos: [-0.146, 0.195, -0.692], tip: [-0.146, 0.074, -0.620], radius: 0.085, region: 'hindR' },
  { name: 'hindHoofR', parent: 'hindFetR',  pos: [-0.146, 0.074, -0.620], tip: [-0.146, 0.0, -0.594], radius: 0.08, region: 'hindR' },
];

/**
 * Create the hierarchical THREE.Bone tree and THREE.Skeleton.
 */
export function createEquineSkeleton() {
  const bones = [];
  const boneMap = {};
  const worldPos = {};
  const restSegments = [];

  for (let i = 0; i < BONE_SPECS.length; i++) {
    const spec = BONE_SPECS[i];
    const bone = new THREE.Bone();
    bone.name = spec.name;

    const p = new THREE.Vector3(...spec.pos);
    worldPos[spec.name] = p;

    if (spec.parent) {
      const parentBone = boneMap[spec.parent];
      const parentP = worldPos[spec.parent];
      bone.position.copy(p).sub(parentP);
      parentBone.add(bone);
    } else {
      bone.position.copy(p);
    }

    bone.userData.restPosition = bone.position.clone();
    bone.userData.worldRestPos = p.clone();

    bones.push(bone);
    boneMap[spec.name] = bone;
    restSegments.push({
      index: i,
      name: spec.name,
      region: spec.region,
      a: p.clone(),
      b: new THREE.Vector3(...spec.tip),
      radius: spec.radius,
    });
  }

  // Update world matrices in bind pose before constructing Skeleton
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  return {
    rootBone: bones[0],
    bones,
    boneMap,
    skeleton,
    restSegments,
  };
}

/** Distance from point P to line segment A-B */
function distPointToSegment(px, py, pz, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (lenSq > 1e-8) {
    t = ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const cz = a.z + abz * t;
  return Math.hypot(px - cx, py - cy, pz - cz);
}

/** Smoothstep helper */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Compute smooth, anatomically gated skinIndex and skinWeight attributes for any geometry
 * (body, mane, tail, or fetlocks) so joints deform organically with zero cross-limb bleeding!
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {Array} restSegments - from createEquineSkeleton()
 * @param {'body'|'mane'|'tail'|'fetlock'} mode
 */
export function computeSkinWeights(geometry, restSegments, mode = 'body') {
  const posAttr = geometry.getAttribute('position');
  const vCount = posAttr.count;
  const skinIndices = new Uint16Array(vCount * 4);
  const skinWeights = new Float32Array(vCount * 4);

  // Pre-filter segment lists for specialized attachment meshes
  const maneSegs = restSegments.filter(
    (s) => s.region === 'neck' || s.name === 'chest' || s.name === 'head'
  );
  const tailSegs = restSegments.filter((s) => s.region === 'tail' || s.name === 'pelvis');
  const fetlockSegs = restSegments.filter(
    (s) => s.name.startsWith('fetlock') || s.name.startsWith('hindFet') || s.name.startsWith('knee') || s.name.startsWith('hock')
  );

  // Reusable small arrays to avoid GC churn
  const topIdx = [0, 0, 0, 0];
  const topW = [0, 0, 0, 0];

  for (let vi = 0; vi < vCount; vi++) {
    const x = posAttr.getX(vi);
    const y = posAttr.getY(vi);
    const z = posAttr.getZ(vi);

    topIdx[0] = topIdx[1] = topIdx[2] = topIdx[3] = 0;
    topW[0] = topW[1] = topW[2] = topW[3] = 0;

    let candidates;
    if (mode === 'mane') {
      candidates = maneSegs;
    } else if (mode === 'tail') {
      candidates = tailSegs;
    } else if (mode === 'fetlock') {
      candidates = fetlockSegs;
    } else {
      candidates = restSegments;
    }

    for (let si = 0; si < candidates.length; si++) {
      const seg = candidates[si];
      let gate = 1.0;

      if (mode === 'body') {
        const reg = seg.region;
        // Strict left/right leg separation so opposite legs NEVER tug each other!
        if (reg === 'foreL') {
          if (x < 0.005 || z < 0.14 || y > 1.38) continue;
          gate *= smoothstep(0.005, 0.075, x) * smoothstep(0.14, 0.30, z) * (1.0 - smoothstep(1.12, 1.36, y));
        } else if (reg === 'foreR') {
          if (x > -0.005 || z < 0.14 || y > 1.38) continue;
          gate *= smoothstep(0.005, 0.075, -x) * smoothstep(0.14, 0.30, z) * (1.0 - smoothstep(1.12, 1.36, y));
        } else if (reg === 'hindL') {
          if (x < 0.005 || z > -0.10 || y > 1.44) continue;
          gate *= smoothstep(0.005, 0.08, x) * smoothstep(-0.10, -0.26, z) * (1.0 - smoothstep(1.18, 1.42, y));
        } else if (reg === 'hindR') {
          if (x > -0.005 || z > -0.10 || y > 1.44) continue;
          gate *= smoothstep(0.005, 0.08, -x) * smoothstep(-0.10, -0.26, z) * (1.0 - smoothstep(1.18, 1.42, y));
        } else if (reg === 'earL') {
          if (x < 0.038 || y < 2.01 || z < 0.96 || z > 1.12) continue;
          gate *= smoothstep(2.01, 2.08, y) * smoothstep(0.038, 0.068, x);
        } else if (reg === 'earR') {
          if (x > -0.038 || y < 2.01 || z < 0.96 || z > 1.12) continue;
          gate *= smoothstep(2.01, 2.08, y) * smoothstep(0.038, 0.068, -x);
        } else if (reg === 'tail') {
          if (z > -0.80 || y < 0.95) continue;
          gate *= smoothstep(-0.80, -0.89, z);
        } else if (reg === 'torso') {
          // Lower legs & ears & nose shouldn't be dragged by torso bones!
          if (y < 0.80) continue;
          gate *= smoothstep(0.80, 1.04, y) * (1.0 - smoothstep(0.75, 0.94, z));
        } else if (reg === 'neck') {
          if (y < 1.12 || z < 0.45) continue;
          gate *= smoothstep(1.12, 1.36, y) * smoothstep(0.45, 0.68, z);
          if (y > 2.02 && Math.abs(x) > 0.055 && z > 0.99) gate *= 0.15;
        } else if (reg === 'head') {
          if (y < 1.42 || z < 0.90) continue;
          gate *= smoothstep(0.90, 1.02, z);
          // Reduce head dominance high up on ears so ears pivot freely
          if (y > 2.04 && Math.abs(x) > 0.052 && z < 1.08) {
            gate *= 1.0 - 0.88 * smoothstep(2.04, 2.13, y);
          }
        }
      } else if (mode === 'fetlock') {
        // Bind each fetlock tuft strictly to its own quadrant leg
        const isFront = z > 0;
        const isLeft = x > 0;
        if (isFront && !seg.region.startsWith('fore')) continue;
        if (!isFront && !seg.region.startsWith('hind')) continue;
        if (isLeft && !seg.region.endsWith('L')) continue;
        if (!isLeft && !seg.region.endsWith('R')) continue;
      }

      if (gate <= 1e-5) continue;

      const d = distPointToSegment(x, y, z, seg.a, seg.b);
      const r = seg.radius * (mode === 'tail' ? 1.45 : mode === 'mane' ? 1.25 : 0.72);
      // Sharp inverse-power + Gaussian hybrid gives tight local limb fidelity with velvety joint blend!
      const w = gate * Math.exp(-Math.pow(d / r, 2.35)) / (0.012 + d * d * 28.0);

      // Insert into top 4 slots
      let minSlot = 0;
      for (let k = 1; k < 4; k++) {
        if (topW[k] < topW[minSlot]) minSlot = k;
      }
      if (w > topW[minSlot]) {
        topW[minSlot] = w;
        topIdx[minSlot] = seg.index;
      }
    }

    let sum = topW[0] + topW[1] + topW[2] + topW[3];
    if (sum <= 1e-8) {
      // Fallback: nearest bone unconditionally
      let bestIdx = 0;
      let bestD = Infinity;
      for (const seg of candidates) {
        const d = distPointToSegment(x, y, z, seg.a, seg.b);
        if (d < bestD) {
          bestD = d;
          bestIdx = seg.index;
        }
      }
      topIdx[0] = bestIdx;
      topW[0] = 1;
      topIdx[1] = topIdx[2] = topIdx[3] = 0;
      topW[1] = topW[2] = topW[3] = 0;
      sum = 1;
    }

    for (let k = 0; k < 4; k++) {
      skinIndices[vi * 4 + k] = topIdx[k];
      skinWeights[vi * 4 + k] = topW[k] / sum;
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  return geometry;
}

/**
 * Helper to reparent a world-space accessory (like eyes or leather halter) cleanly
 * onto a bone in bind pose so it moves rigidly with the head!
 */
export function attachWorldObjectToBone(obj, bone) {
  const boneWorld = bone.userData.worldRestPos;
  obj.position.sub(boneWorld);
  bone.add(obj);
}
