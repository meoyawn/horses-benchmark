import * as THREE from "three";
import { clamp, headPivot, legs, mix, neckPivot, smooth, tailMid, tailPivot } from "./sculpt.js";

const tau = Math.PI * 2;
const zAxis = new THREE.Vector3(0, 0, 1);
const rest = [
  [0, 0, 0], neckPivot, headPivot,
  ...legs.flatMap(leg => leg.joints.slice(0, 4)),
  tailPivot, tailMid
].map(p => new THREE.Vector3(...p));
const tailRootIndex = rest.length - 2;
const tailTipIndex = rest.length - 1;

export const headIndex = 2;
export const footIndex = index => 6 + index * 4;

const limbData = legs.map((leg, index) => {
  const joints = leg.joints.map(p => new THREE.Vector3(...p));
  const directions = joints.slice(1).map((joint, i) => joint.clone().sub(joints[i]).normalize());
  return {
    ...leg, joints, directions, start: 3 + index * 4,
    upperLength: joints[1].distanceTo(joints[2]),
    lowerLength: joints[2].distanceTo(joints[3])
  };
});

export function createRig(surface, material) {
  const model = new THREE.Group();
  const bones = rest.map(point => {
    const bone = new THREE.Bone();
    bone.position.copy(point);
    return bone;
  });
  const skeleton = new THREE.Skeleton(bones);
  const skin = makeSkin(surface, material);
  skin.add(...bones);
  model.add(skin);
  model.updateMatrixWorld(true);
  skeleton.calculateInverses();
  skin.bind(skeleton, new THREE.Matrix4());
  skin.receiveShadow = true;

  const gait = { walk: 0, trot: 0 };
  const ears = [];
  const eyes = [];
  let phase = .04;
  let time = 0;

  function addSkinned(surfaceData, surfaceMaterial, castsShadow = true) {
    const mesh = makeSkin(surfaceData, surfaceMaterial);
    model.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.castShadow = castsShadow;
    return mesh;
  }

  function attach(object, boneIndex) {
    object.position.sub(rest[boneIndex]);
    bones[boneIndex].add(object);
    return object;
  }

  function pose(dt, mode) {
    time += dt;
    const blend = 1 - Math.exp(-dt * 7.5);
    gait.walk = mix(gait.walk, Number(mode === "walk"), blend);
    gait.trot = mix(gait.trot, Number(mode === "trot"), blend);
    const effort = gait.walk + gait.trot;
    phase = (phase + dt * (.85 + gait.trot * .75)) % 1;
    const cycle = phase * tau;
    const chest = bones[0];
    chest.position.set(
      gait.walk * .012 * Math.sin(cycle * 2),
      .0035 * Math.sin(time * 1.45) + gait.walk * .008 * Math.sin(cycle * 2 - .8)
        + gait.trot * (.010 - .024 * Math.cos(cycle * 2)),
      gait.walk * .018 * Math.sin(cycle)
    );
    chest.rotation.set(gait.walk * .014 * Math.sin(cycle - .6), 0,
      gait.walk * .014 * Math.sin(cycle + 1) + gait.trot * .015 * Math.sin(2 * cycle));

    const neck = bones[1];
    positionFrom(neck.position, rest[1], 0);
    neck.rotation.set(.008 * Math.sin(time * 1.27), .028 * Math.sin(time * .58),
      .018 * Math.sin(time * .97) + gait.walk * .073 * Math.sin(cycle * 2 + .9)
        + gait.trot * .038 * Math.sin(cycle * 2 - .6));
    neck.quaternion.premultiply(chest.quaternion);

    const head = bones[2];
    positionFrom(head.position, rest[2], 1);
    head.rotation.set(.011 * Math.sin(time * 1.73), .027 * Math.sin(time * .69 + .4),
      -.013 * Math.sin(time * .97) + gait.walk * .046 * Math.sin(cycle * 2 + 2.1)
        - gait.trot * .027 * Math.sin(cycle * 2));
    head.quaternion.premultiply(neck.quaternion);
    for (const [index, ear] of ears.entries()) {
      const side = index === 0 ? 1 : -1;
      const flick = Math.max(0, Math.sin(time * .74 + index * 1.8)) ** 32;
      ear.rotation.y = side * (.15 + .048 * Math.sin(time * 1.54 + index) + .45 * flick);
      ear.rotation.x = side * (.068 + gait.trot * .045 * Math.sin(2 * cycle + index));
      ear.rotation.z = -.02 + .033 * Math.sin(time * 1.02 + index) + .10 * flick;
    }

    const blink = Math.max(0, Math.cos(time * 1.23 + .91 + .15 * Math.sin(time))) ** 116;
    for (const eye of eyes) eye.morphTargetInfluences[0] = blink;

    const tail = bones[tailRootIndex];
    positionFrom(tail.position, rest[tailRootIndex], 0);
    const swish = (Math.sin(time * 1.21) * .13 + Math.sin(time * 2.15 + .6) * .06);
    tail.rotation.set(swish + .095 * effort * Math.sin(cycle),
      .11 * Math.sin(time * 1.34) + gait.walk * .21 * Math.sin(cycle), gait.trot * .094);
    tail.quaternion.premultiply(chest.quaternion);
    const tip = bones[tailTipIndex];
    positionFrom(tip.position, rest[tailTipIndex], tailRootIndex);
    tip.rotation.set(.082 * Math.sin(time * 1.21 - 1.1), 0,
      .046 * Math.sin(time * 1.61) + gait.trot * .10 * Math.sin(2 * cycle - .8));
    tip.quaternion.premultiply(tail.quaternion);

    for (const [index, leg] of limbData.entries()) {
      const walking = footfall(phase, index, .68, leg.front ? .355 : .385, .127, false);
      const trotting = footfall(phase, index, .46, leg.front ? .473 : .503, .238, true);
      const x = walking.x * gait.walk + trotting.x * gait.trot;
      const lift = walking.y * gait.walk + trotting.y * gait.trot;
      const toe = walking.pitch * gait.walk + trotting.pitch * gait.trot;
      poseLeg(leg, x, lift, toe, effort);
    }
  }

  function positionFrom(target, point, index) {
    const bone = bones[index];
    return target.copy(point).sub(rest[index]).applyQuaternion(bone.quaternion).add(bone.position);
  }

  function poseLeg(leg, x, lift, toe, effort) {
    const [root, elbow, , ankle, hoof] = leg.joints;
    const raised = hoof.clone().add(new THREE.Vector3(x, lift, 0));
    const fetlock = ankle.clone().sub(hoof).applyAxisAngle(zAxis, toe).add(raised);
    const proximal = positionFrom(new THREE.Vector3(), root, 0);
    const arm = elbow.clone().sub(root).applyQuaternion(bones[0].quaternion)
      .applyAxisAngle(zAxis, x * (leg.front ? 1.72 : 1.12) - lift * .25);
    const upper = proximal.clone().add(arm);
    upper.y -= .018 * effort;
    const reach = upper.distanceTo(fetlock);
    const limit = leg.upperLength + leg.lowerLength - .0003;
    if (reach > limit) upper.lerp(fetlock, (reach - limit) / reach);

    const knee = solveJoint(upper, fetlock, leg.upperLength, leg.lowerLength, leg.front ? 1 : -1);
    const points = [proximal, upper, knee, fetlock, raised];
    for (let i = 0; i < 4; i++) {
      const bone = bones[leg.start + i];
      bone.position.copy(points[i]);
      bone.quaternion.setFromUnitVectors(leg.directions[i], points[i + 1].clone().sub(points[i]).normalize());
    }
  }

  pose(0, "stand");
  return { model, bones, ears, eyes, pose, attach, addSkinned };
}

function solveJoint(a, b, upper, lower, bend) {
  const axis = b.clone().sub(a);
  const distance = axis.length();
  axis.normalize();
  const along = clamp((upper * upper + distance * distance - lower * lower) / (2 * distance), -upper, upper);
  const offset = Math.sqrt(Math.max(0, upper * upper - along * along));
  const perpendicular = new THREE.Vector3(-axis.y, axis.x, 0).normalize();
  return a.clone().addScaledVector(axis, along).addScaledVector(perpendicular, offset * bend);
}

const walkOffsets = [.75, .25, 0, .50];
const trotOffsets = [0, .50, .50, 0];

function footfall(cycle, index, stance, stride, height, trot) {
  const phase = (cycle + (trot ? trotOffsets[index] : walkOffsets[index])) % 1;
  if (phase < stance) {
    return { x: stride * (.52 - phase / stance), y: 0, pitch: 0 };
  }
  const swing = (phase - stance) / (1 - stance);
  const y = height * Math.sin(swing * Math.PI) ** 1.55;
  return {
    x: stride * (smooth(0, 1, swing) - .48),
    y,
    pitch: -Math.sin(swing * tau) * y * (trot ? 3.7 : 3.0)
  };
}

function makeSkin(surface, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(surface.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(surface.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(surface.colors, 3));
  geometry.setAttribute("skinIndex", new THREE.BufferAttribute(surface.skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(surface.skinWeights, 4));
  geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function tailSkin(y) {
  const tip = 1 - smooth(.65, 1.15, y);
  return [[tailRootIndex, tailTipIndex, 0, 0], [1 - tip, tip, 0, 0]];
}
