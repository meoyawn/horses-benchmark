import * as THREE from 'three';

const TAU = 2 * Math.PI;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
function ease(a, b, value) {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// Horizontal sculpt sections: height, sagittal center, fore/aft radius,
// transverse radius and distance of the center from the median plane.
const foreSections = [
  [.053, -.695, .004, .004, .176],
  [.069, -.696, .037, .034, .176],
  [.086, -.706, .047, .043, .177],
  [.101, -.698, .045, .041, .177],
  [.124, -.683, .036, .031, .178],
  [.150, -.667, .035, .030, .178],
  [.176, -.656, .044, .036, .178],
  [.193, -.651, .047, .037, .178],
  [.210, -.649, .041, .031, .178],
  [.251, -.650, .036, .027, .178],
  [.341, -.649, .033, .026, .177],
  [.420, -.648, .034, .028, .176],
  [.462, -.650, .038, .032, .176],
  [.487, -.653, .047, .037, .175],
  [.509, -.652, .049, .040, .175],
  [.536, -.644, .044, .038, .175],
  [.586, -.625, .049, .041, .175],
  [.679, -.592, .068, .055, .176],
  [.777, -.560, .085, .068, .179],
  [.856, -.534, .097, .081, .180],
  [.924, -.524, .109, .090, .181],
  [1.004, -.549, .140, .102, .182],
  [1.099, -.593, .151, .111, .180],
  [1.191, -.626, .154, .116, .178],
  [1.274, -.617, .150, .115, .177],
  [1.377, -.570, .135, .104, .175],
  [1.472, -.523, .109, .087, .164],
  [1.542, -.481, .078, .059, .148],
  [1.590, -.458, .014, .013, .133],
  [1.595, -.457, .003, .003, .132],
];

const hindSections = [
  [.053, .669, .004, .004, .181],
  [.069, .669, .036, .032, .181],
  [.086, .668, .046, .041, .181],
  [.104, .676, .043, .037, .182],
  [.128, .690, .035, .030, .183],
  [.153, .707, .036, .031, .184],
  [.177, .719, .044, .036, .185],
  [.195, .725, .045, .036, .185],
  [.217, .726, .039, .030, .185],
  [.265, .733, .035, .027, .185],
  [.375, .748, .032, .026, .184],
  [.448, .755, .037, .030, .184],
  [.480, .760, .044, .035, .184],
  [.508, .763, .051, .040, .184],
  [.537, .757, .066, .046, .183],
  [.565, .731, .063, .047, .182],
  [.598, .708, .061, .050, .181],
  [.657, .660, .077, .058, .181],
  [.735, .606, .105, .073, .182],
  [.815, .556, .129, .086, .185],
  [.885, .525, .151, .095, .189],
  [.935, .523, .172, .102, .190],
  [1.020, .545, .196, .118, .188],
  [1.130, .585, .218, .133, .183],
  [1.220, .618, .233, .142, .180],
  [1.324, .639, .238, .141, .179],
  [1.418, .641, .217, .130, .177],
  [1.496, .625, .185, .102, .166],
  [1.553, .602, .127, .066, .149],
  [1.583, .591, .038, .023, .137],
  [1.591, .590, .003, .003, .134],
];

const jointNames = [
  ['shoulder', 'elbow', 'carpus', 'fetlock', 'coronet'],
  ['hip', 'stifle', 'hock', 'fetlock', 'coronet'],
];
const foreJoints = [
  [-.635, 1.200, .167], [-.478, .936, .176], [-.655, .505, .175],
  [-.651, .187, .178], [-.706, .086, .177],
];
const hindJoints = [
  [.607, 1.287, .164], [.423, .928, .183], [.756, .507, .184],
  [.723, .188, .185], [.668, .086, .181],
];

function stagger(height, offset) {
  return offset * (1 - ease(.075, 1.125, height));
}

function sectionTangent(sections, i, column) {
  const current = sections[i];
  const prev = sections[Math.max(0, i - 1)];
  const next = sections[Math.min(sections.length - 1, i + 1)];
  if (prev === current) return (next[column] - current[column]) / (next[0] - current[0]);
  if (current === next) return (current[column] - prev[column]) / (current[0] - prev[0]);
  const left = (current[column] - prev[column]) / (current[0] - prev[0]);
  const right = (next[column] - current[column]) / (next[0] - current[0]);
  return left * right > 0 ? 2 * left * right / (left + right) : 0;
}

const sampleRate = 500;
const rowSize = 8;

// Bake the cross sections once. During extraction of the complete skin this
// field is sampled much more frequently than the animation or hoof geometry.
function bakeField(sections, offset, fore) {
  const low = sections[0][0];
  const high = sections[sections.length - 1][0];
  const rows = Math.ceil((high - low) * sampleRate) + 2;
  const table = new Float32Array(rows * rowSize);
  const slopes = sections.map((_, i) =>
    [0, ...[1, 2, 3, 4].map((column) => sectionTangent(sections, i, column))]);
  let section = 0;
  for (let row = 0; row < rows; row++) {
    const y = Math.min(high, low + row / sampleRate);
    while (section < sections.length - 2 && sections[section + 1][0] < y) section++;
    const a = sections[section], b = sections[section + 1];
    const length = b[0] - a[0];
    const t = (y - a[0]) / length;
    const sq = t * t, cube = sq * t;
    const values = (col) => (2 * cube - 3 * sq + 1) * a[col]
      + (cube - 2 * sq + t) * length * slopes[section][col]
      + (3 * sq - 2 * cube) * b[col]
      + (cube - sq) * length * slopes[section + 1][col];
    const rx = values(2), rz = values(3);
    const cannon = ease(.205, .255, y) * (1 - ease(.432, .475, y));
    const muscle = ease(.555, .676, y) * (1 - ease(.900, 1.08, y));
    const index = row * rowSize;
    table[index] = values(1) + stagger(y, offset);
    table[index + 1] = values(4);
    table[index + 2] = 1 / rx;
    table[index + 3] = 1 / rz;
    table[index + 4] = Math.sqrt(rx * rz) * (fore ? .96 : .90);
    table[index + 5] = .105 * cannon + .060 * muscle;
    table[index + 6] = .31 * cannon + muscle * (.19 - .58 * (y - .72));
    table[index + 7] = (fore ? -.045 : .060) * muscle;
  }
  return { table, low, high };
}

function fieldDistance(field, x, y, lateral) {
  if (y <= field.low || y >= field.high) return .19;
  const position = (y - field.low) * sampleRate;
  const row = Math.floor(position);
  const fraction = position - row;
  const i = row * rowSize, j = i + rowSize, d = field.table;
  const dx = x - mix(d[i], d[j], fraction);
  const dz = lateral - mix(d[i + 1], d[j + 1], fraction);
  if (Math.abs(dx) > .40 || Math.abs(dz) > .27) return .19;
  const nx = dx * mix(d[i + 2], d[j + 2], fraction);
  let nz = (dz - dx * mix(d[i + 7], d[j + 7], fraction))
    * mix(d[i + 3], d[j + 3], fraction);
  // A shallow groove separates the flexor tendons from the cannon bone.
  const grooveX = mix(d[i + 6], d[j + 6], fraction);
  const groove = Math.max(0, 1 - Math.abs(nx - grooveX) * 3.85);
  nz *= 1 + mix(d[i + 5], d[j + 5], fraction) * groove * groove;
  return Math.min(.19, (Math.sqrt(nx * nx + nz * nz) - 1)
    * mix(d[i + 4], d[j + 4], fraction));
}

function hoofGeometry(fore, pale, side) {
  const positions = [], colors = [], indices = [];
  const sections = 96;
  const levels = [0, .065, .16, .29, .46, .64, .79, .89, .96, 1];
  const base = new THREE.Color(pale ? '#96836d' : '#4b4036');
  const edge = new THREE.Color(pale ? '#b09a7d' : '#675848');
  const color = new THREE.Color();
  for (const u of levels) {
    for (let j = 0; j < sections; j++) {
      const theta = TAU * j / sections;
      const nose = Math.cos(theta), flank = Math.sin(theta);
      const heel = Math.max(0, -nose);
      const cut = Math.pow(heel, 14);
      const bevel = .965 + .035 * Math.min(1, u / .1);
      const reach = nose > 0
        ? mix(fore ? .083 : .079, .044, u)
        : mix(.064, .054, u);
      const x = -nose * reach * bevel - cut * (.010 + .004 * u);
      const width = (fore ? .061 : .056) * mix(1, .79, u);
      const z = flank * width * (1 - .085 * heel) * bevel;
      const crown = .090 + .016 * nose - .012 * heel;
      const y = mix(.012 + .0015 * heel, crown, u) - .086;
      positions.push(x, y, z);
      const grain = .055 * Math.sin(29 * theta + .23 * u + side)
        + .047 * Math.sin(43 * theta - .61 * u)
        + .035 * Math.sin(13 * theta + .48 * u);
      const bands = pale ? .14 * Math.sin(7 * theta + .8) : .045 * Math.sin(7 * theta - 1);
      const growth = .025 * Math.sin(u * 29 + .48 * flank);
      color.copy(base).lerp(edge, .14 + .42 * u + .20 * (1 - ease(0, .19, u)))
        .multiplyScalar(1 + grain + bands + growth);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let k = 0; k < levels.length - 1; k++) {
    for (let j = 0; j < sections; j++) {
      const next = (j + 1) % sections, current = k * sections;
      indices.push(current + j, current + next, current + j + sections,
        current + next, current + next + sections, current + j + sections);
    }
  }
  const bottom = positions.length / 3;
  positions.push(.005, .019 - .086, 0);
  colors.push(base.r * .68, base.g * .68, base.b * .68);
  const crown = positions.length / 3;
  positions.push(.002, .094 - .086, 0);
  colors.push(base.r * .75, base.g * .75, base.b * .75);
  const rim = (levels.length - 1) * sections;
  for (let j = 0; j < sections; j++) {
    const next = (j + 1) % sections;
    indices.push(bottom, next, j, crown, rim + j, rim + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeLeg(fore, side, parent, bones, hoofMaterial) {
  const offset = fore ? (side > 0 ? .042 : -.088) : (side > 0 ? .068 : -.082);
  const neutral=fore ? foreJoints : hindJoints;
  const movingAngles=neutral.slice(1).map(([x,y],i)=>Math.atan2(y-neutral[i][1],x-neutral[i][0]));
  const rest = neutral.map(([x, y, z]) =>
    [x + stagger(y, offset), y, z * side]);
  const chain = [], ids = [], angles = [], lengths = [];
  let owner = parent;
  rest.forEach((point, i) => {
    const prev = i ? rest[i - 1] : [0, 0, 0];
    const bone = new THREE.Bone();
    bone.name = (side > 0 ? 'near ' : 'far ') + (fore ? 'fore ' : 'hind ')
      + jointNames[fore ? 0 : 1][i];
    bone.position.set(point[0] - prev[0], point[1] - prev[1], point[2] - prev[2]);
    owner.add(bone);
    chain.push(bone);
    ids.push(bones.length);
    bones.push(bone);
    if (i) {
      angles.push(Math.atan2(point[1] - prev[1], point[0] - prev[0]));
      lengths.push(Math.hypot(point[0] - prev[0], point[1] - prev[1]));
    }
    owner = bone;
  });
  const hoof = new THREE.Mesh(hoofGeometry(fore, !fore && side > 0, side), hoofMaterial);
  hoof.name = chain[4].name.replace('coronet', 'hoof');
  hoof.castShadow = hoof.receiveShadow = true;
  chain[4].add(hoof);
  return {
    fore, side, offset, rest, chain, ids, angles, movingAngles, lengths,
    field: bakeField(fore ? foreSections : hindSections, offset, fore),
    walkPhase: fore ? (side > 0 ? .75 : .25) : (side > 0 ? 0 : .50),
    trotPhase: (fore && side > 0) || (!fore && side < 0) ? .50 : 0,
  };
}

function gaitSample(phase, fore, trot) {
  const p = phase - Math.floor(phase);
  const duty = trot ? .455 : .628;
  const amplitude = fore ? (trot ? .309 : .242) : (trot ? .300 : .237);
  if (p < duty) {
    const s = p / duty;
    const sweep = 2 * s - 1;
    return {
      x: amplitude * sweep, lift: 0, fold: 0, sweep,
      load: Math.sin(Math.PI * s),
      roll: .205 * ease(.67, 1, s) - .060 * (1 - ease(0, .17, s)),
    };
  }
  const s = (p - duty) / (1 - duty);
  const sin = Math.sin(Math.PI * s), cos = Math.cos(Math.PI * s);
  const smooth = s * s * (3 - 2 * s);
  // Match the velocity of the planted foot on either end of the swing.
  const sweep = 1 - 2 * smooth + 2 * (1 - duty) / duty * s * (1 - s) * (1 - 2 * s);
  const arch = Math.pow(sin, 1.65);
  return {
    x: amplitude * sweep, sweep, load: 0,
    lift: (trot ? (fore ? .185 : .193) : (fore ? .103 : .119)) * arch * (1 + .095 * cos),
    fold: Math.pow(sin, 1.12) * (1 + .22 * cos),
    roll: mix(.205, -.060, smooth) + (trot ? .55 : .40) * arch * (1 + .19 * cos),
  };
}

function articulate(leg, phase, walk, trot, time, rootX, rootY, rootRotation) {
  const { fore, rest, chain, angles, lengths } = leg;
  const moving = walk + trot;
  const a = gaitSample(phase + leg.walkPhase, fore, false);
  const b = gaitSample(phase + leg.trotPhase, fore, true);
  const travel = a.x * walk + b.x * trot;
  const sweep = a.sweep * walk + b.sweep * trot;
  const load = a.load * walk + b.load * trot;
  const roll = a.roll * walk + b.roll * trot;
  const fold = a.fold * walk + b.fold * trot;
  const lift = a.lift * walk + b.lift * trot;
  const xTarget = rest[4][0] - stagger(rest[4][1], leg.offset) * moving + travel - rootX;
  // During breakover the toe becomes the pivot. The coronet must lift even
  // before the foot leaves the ground, or its leading edge cuts through it.
  const rollPivot = Math.sin(Math.abs(roll)) * (roll >= 0 ? .081 : .053)
    - (1 - Math.cos(roll)) * .070;
  const yTarget = rest[4][1] + lift + rollPivot - rootY;
  const c = Math.cos(rootRotation), s = Math.sin(rootRotation);
  const footX = c * xTarget + s * yTarget;
  const footY = -s * xTarget + c * yTarget;
  const pastern = mix(angles[3],leg.movingAngles[3],moving) + .21 * sweep - .13 * load
    + (fore ? .56 : .23) * fold - rootRotation;
  const cannon = mix(angles[2],leg.movingAngles[2],moving) + .34 * sweep - rootRotation
    + (fore ? .71 : -.33) * a.fold * walk
    + (fore ? 1.00 : -.51) * b.fold * trot;
  const fetlockX = footX - lengths[3] * Math.cos(pastern);
  const fetlockY = footY - lengths[3] * Math.sin(pastern);
  const middleX = fetlockX - lengths[2] * Math.cos(cannon);
  const middleY = fetlockY - lengths[2] * Math.sin(cannon);
  const idle = (1 - moving) * Math.sin(time * 1.32 + leg.side * .55);
  let shoulderX = rest[0][0] + travel * (fore ? .16 : .075) + idle * .0025;
  let shoulderY = rest[0][1] + idle * (fore ? .0014 : -.0010);
  const dx = middleX - shoulderX, dy = middleY - shoulderY;
  let reach = Math.hypot(dx, dy);
  const ux = dx / reach, uy = dy / reach;
  const maxReach = lengths[0] + lengths[1] - .0005;
  if (reach > maxReach) {
    shoulderX += ux * (reach - maxReach);
    shoulderY += uy * (reach - maxReach);
    reach = maxReach;
  }
  const along = (lengths[0] ** 2 - lengths[1] ** 2 + reach ** 2) / (2 * reach);
  const across = Math.sqrt(Math.max(0, lengths[0] ** 2 - along ** 2)) * (fore ? 1 : -1);
  const elbowX = shoulderX + along * ux - across * uy;
  const elbowY = shoulderY + along * uy + across * ux;
  const turns = [
    Math.atan2(elbowY - shoulderY, elbowX - shoulderX) - angles[0],
    Math.atan2(middleY - elbowY, middleX - elbowX) - angles[1],
    cannon - angles[2], pastern - angles[3], roll - rootRotation,
  ];
  chain[0].position.x = shoulderX;
  chain[0].position.y = shoulderY;
  for (let i = 0; i < chain.length; i++) {
    chain[i].rotation.z = turns[i] - (i ? turns[i - 1] : 0);
  }
}

export function createLimbs(bodyBone, bones) {
  const hoofMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .65, metalness: 0,
  });
  const legs = [
    makeLeg(true, 1, bodyBone, bones, hoofMaterial),
    makeLeg(true, -1, bodyBone, bones, hoofMaterial),
    makeLeg(false, 1, bodyBone, bones, hoofMaterial),
    makeLeg(false, -1, bodyBone, bones, hoofMaterial),
  ];
  const rootRest = bodyBone.position.clone();
  const rootAngle = bodyBone.rotation.z;
  let phase = .12, walk = 0, trot = 0;
  const select = (x, z) => legs[(x < 0 ? 0 : 2) + (z < 0 ? 1 : 0)];
  function distance(x, y, z) {
    if (y < .052 || y > 1.596 || x < -1.06 || x > 1.09 || Math.abs(z) > .50) return .19;
    return fieldDistance(select(x, z).field, x, y, Math.abs(z));
  }
  function skin(x, y, z) {
    if (y < .05 || y >= 1.56) return null;
    const leg = select(x, z);
    const d = fieldDistance(leg.field, x, y, Math.abs(z));
    if (d >= .162) return null;
    let influence = (1 - ease(.005, .162, d)) * (1 - ease(leg.fore ? .79 : .86, 1.54, y));
    influence *= 1 - ease(.67, .86, y) * (1 - ease(.012, .196, Math.abs(z)));
    if (influence < .002) return null;
    const result = [];
    if (influence < .99999) result.push([0, 1 - influence]);
    else influence = 1;
    const widths = [.102, .050, .035, .023];
    for (let i = 1; i < leg.rest.length; i++) {
      const jointY = leg.rest[i][1], width = widths[i - 1];
      if (y < jointY - width) continue;
      const upper = ease(jointY - width, jointY + width, y);
      if (upper > 0) result.push([leg.ids[i - 1], upper * influence]);
      if (upper < 1) result.push([leg.ids[i], (1 - upper) * influence]);
      return result;
    }
    result.push([leg.ids[4], influence]);
    return result;
  }
  function update(time, dt, mode, speed = 1, poseTrunk) {
    const delta = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, .09));
    const fade = 1 - Math.exp(-6.5 * delta);
    walk = mix(walk, mode === 'walk' ? 1 : 0, fade);
    trot = mix(trot, mode === 'trot' ? 1 : 0, fade);
    const rate = Math.max(0, Math.min(Number.isFinite(speed) ? speed : 1, 3));
    phase = (phase + delta * rate * (.87 + .48 * trot)) % 1;
    poseTrunk?.(time,phase,walk,trot);
    const rootX = bodyBone.position.x - rootRest.x;
    const rootY = bodyBone.position.y - rootRest.y;
    const rotation = bodyBone.rotation.z - rootAngle;
    for (const leg of legs) articulate(leg, phase, walk, trot, time, rootX, rootY, rotation);
  }
  return { distance, skin, update, hoofBones: legs.map((leg) => leg.chain[4]) };
}
