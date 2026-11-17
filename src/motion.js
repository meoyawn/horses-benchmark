import { clamp, lerp, smoothstep } from './surface.js';

const tau = Math.PI * 2;
const gaitData = {
  stand: { rate: 0, stride: 0, flex: 0, stance: 1, beats: [0, 0, 0, 0] },
  walk: { rate: 0.79, stride: 0.258, flex: 0.120, stance: 0.64, beats: [0.25, 0.75, 0, 0.50] },
  trot: { rate: 1.39, stride: 0.358, flex: 0.183, stance: 0.42, beats: [0.50, 0, 0, 0.50] },
  canter: { rate: 1.52, stride: 0.462, flex: 0.242, stance: 0.40, beats: [0.43, 0.21, 0.21, 0] },
};

const turn = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function stepAt(gait, leg, index, cycle) {
  if (gait.stride === 0) return { stride: 0, lift: 0, pitch: 0 };
  const phase = (cycle - gait.beats[index] + 1) % 1;
  const length = gait.stride * (leg.rear ? 0.91 : 1);
  const lead = gait === gaitData.canter && index === 0 ? 0.10 : 0;
  if (phase < gait.stance) {
    const t = phase / gait.stance;
    return { stride: length * (1 - 2 * t) + lead, lift: 0, pitch: -0.31 * smoothstep(0.72, 1, t) };
  }
  const t = (phase - gait.stance) / (1 - gait.stance);
  const reach = t * t * (3 - 2 * t);
  return {
    stride: length * (2 * reach - 1) + lead,
    lift: gait.flex * (leg.rear ? 0.83 : 1) * Math.sin(Math.PI * t) ** 1.15,
    pitch: -0.31 * (1 - t) - 0.63 * Math.sin(Math.PI * t) * (1 - t) + 0.26 * Math.sin(Math.PI * reach),
  };
}

function bodyAt(name, cycle) {
  const phase = cycle * tau;
  if (name === 'walk') return { y: -0.024 + 0.015 * Math.cos(phase * 2), pitch: 0.026 * Math.cos(phase - 0.70), nod: 0.095 * Math.sin(phase - 0.40) };
  if (name === 'trot') return { y: 0.018 - 0.068 * Math.sin(phase * 2 - 0.10), pitch: 0.016 * Math.sin(phase * 2), nod: 0.041 * Math.cos(phase * 2) };
  if (name === 'canter') return { y: 0.024 - 0.079 * Math.cos(phase - 1.30), pitch: 0.135 * Math.cos(phase - 0.85), nod: 0.11 * Math.cos(phase - 1.70) };
  return { y: 0, pitch: 0, nod: 0 };
}

function fitLimb(leg, foot, bodyPitch, bodyY) {
  const [root, upper, lower, ankle] = leg.joints;
  const [upperLength, middleLength, lowerLength] = leg.lengths;
  const sin = Math.sin(bodyPitch);
  const cos = Math.cos(bodyPitch);
  const worldX = ankle.x + foot.stride;
  const toeHeight = -0.179 * Math.cos(foot.pitch) + (foot.pitch < 0 ? 0.118 : -0.030) * Math.sin(foot.pitch);
  const worldY = ankle.y + foot.lift + Math.max(0, -0.179 - toeHeight) - bodyY;
  const x = cos * worldX + sin * worldY - root.x;
  const y = -sin * worldX + cos * worldY - root.y;

  const distance = Math.max(0.001, Math.hypot(x, y));
  const ray = Math.atan2(y, x);
  const remaining = middleLength + lowerLength - 0.00015;
  const maxBend = Math.acos(clamp((distance * distance + upperLength * upperLength - remaining * remaining) / (2 * distance * upperLength), -1, 1));
  const blend = leg.rear ? 1.20 * foot.stride + 0.94 * foot.lift : 0.98 * foot.stride + 1.72 * foot.lift;
  const upperAngle = ray + clamp(turn(leg.angles[0] + blend - ray), -maxBend, maxBend);
  const ax = Math.cos(upperAngle) * upperLength;
  const ay = Math.sin(upperAngle) * upperLength;
  const lx = x - ax;
  const ly = y - ay;
  const gap = Math.max(0.0001, Math.hypot(lx, ly));
  const middleAngle = Math.atan2(ly, lx) + (leg.rear ? -1 : 1)
    * Math.acos(clamp((gap * gap + middleLength * middleLength - lowerLength * lowerLength) / (2 * gap * middleLength), -1, 1));
  const lowerAngle = Math.atan2(ly - Math.sin(middleAngle) * middleLength, lx - Math.cos(middleAngle) * middleLength);
  const upperRotation = turn(upperAngle - leg.angles[0]);
  const middleRotation = turn(middleAngle - leg.angles[1]);
  const lowerRotation = turn(lowerAngle - leg.angles[2]);
  leg.bones[0].rotation.z = upperRotation;
  leg.bones[1].rotation.z = middleRotation - upperRotation;
  leg.bones[2].rotation.z = lowerRotation - middleRotation;
  leg.bones[3].rotation.z = foot.pitch - lowerRotation - bodyPitch;
}

export function makeMotion({ root, neckBone, skullBone, tail }, legs, { ears, blinks }) {
  const settleTime = 0.48;
  let gait = 'stand';
  let cycle = 0;
  let life = 0;
  let change = settleTime;
  let jointPose = { body: bodyAt(gait, 0), feet: legs.map((leg, i) => stepAt(gaitData.stand, leg, i, 0)) };
  let from = jointPose;
  for (const leg of legs) {
    leg.lengths = leg.joints.slice(1).map((joint, i) => leg.joints[i].distanceTo(joint));
    leg.angles = leg.joints.slice(1).map((joint, i) => Math.atan2(joint.y - leg.joints[i].y, joint.x - leg.joints[i].x));
    leg.reach = leg.lengths.reduce((sum, length) => sum + length, 0) - 0.0015;
  }

  function selectGait(next) {
    if (gait === next) return;
    from = jointPose;
    gait = next;
    change = 0;
  }

  function advance(realDelta, speed) {
    const delta = realDelta * speed;
    const style = gaitData[gait];
    life += delta;
    change += realDelta;
    cycle = (cycle + delta * style.rate) % 1;
    const blend = smoothstep(0, settleTime, change);
    const b = bodyAt(gait, cycle);
    const body = {
      y: lerp(from.body.y, b.y, blend),
      pitch: lerp(from.body.pitch, b.pitch, blend),
      nod: lerp(from.body.nod, b.nod, blend),
    };
    const feet = legs.map(function step(leg, i) {
      const target = stepAt(style, leg, i, cycle);
      return {
        stride: lerp(from.feet[i].stride, target.stride, blend),
        lift: lerp(from.feet[i].lift, target.lift, blend),
        pitch: lerp(from.feet[i].pitch, target.pitch, blend),
      };
    });
    jointPose = { body, feet };

    const sin = Math.sin(body.pitch);
    const cos = Math.cos(body.pitch);
    let y = body.y;
    feet.forEach(function capHeight(foot, i) {
      const leg = legs[i];
      const anchor = leg.joints[0];
      const ankle = leg.joints[3];
      const dx = ankle.x + foot.stride - (anchor.x * cos - anchor.y * sin);
      const maxHeight = Math.sqrt(Math.max(0, leg.reach ** 2 - dx ** 2));
      y = Math.min(y, ankle.y + foot.lift + maxHeight - (anchor.x * sin + anchor.y * cos));
    });
    root.position.y = y;
    root.rotation.z = body.pitch;
    root.scale.z = 1 + 0.012 * Math.sin(life * 1.79);
    legs.forEach(function articulate(leg, i) { fitLimb(leg, feet[i], body.pitch, y); });

    neckBone.rotation.z = body.nod - body.pitch * 0.44 + 0.020 * Math.sin(life * 1.76);
    neckBone.rotation.y = 0.052 * Math.sin(life * 0.78) + 0.045;
    skullBone.rotation.z = -body.nod * 0.57 - 0.017 * Math.sin(life * 1.37 + 0.75);
    skullBone.rotation.y = 0.038 * Math.sin(life * 0.91 + 0.22) + 0.068;
    ears.forEach(function swivel(ear, i) {
      const side = i === 0 ? -1 : 1;
      const listening = Math.max(0, Math.sin(life * 1.55 + i * 2)) ** 15;
      ear.rotation.set(0.099 * side + 0.038 * Math.sin(life * 1.93 + i), side * 0.22 + side * 0.36 * listening, -0.081 * side + 0.04 * Math.sin(life * 2.9 + 1.3 * i));
      const blinkPhase = (life + i * 0.022 + 2.7) % 5.62;
      blinks[i].value = blinkPhase < 0.185 ? Math.sin(Math.PI * blinkPhase / 0.185) ** 0.72 : 0;
    });
    tail.forEach(function sway(bone, i) {
      const swish = Math.max(0, Math.sin(life * 0.77 - 0.36 - i * 0.31)) ** 5;
      bone.rotation.x = 0.034 * Math.sin(life * 3.1 - i * 0.78) + (0.084 + 0.051 * i) * swish;
      bone.rotation.z = (i === 0 ? -style.stride * 0.44 * blend : 0) + 0.024 * Math.sin(life * 2.71 - i * 0.87) - body.pitch * 0.17;
    });
  }

  advance(0, 1);
  return { advance, selectGait };
}
