/** The horse faces +X and distances are measured in metres. */
export const mix = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function smooth(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

const barrel = profile([
  [-1.174, 1.479, 1.465, .010], [-1.149, 1.534, 1.347, .130],
  [-1.088, 1.599, 1.189, .247], [-.977, 1.642, 1.113, .316],
  [-.821, 1.647, 1.085, .337], [-.641, 1.616, 1.060, .320],
  [-.464, 1.564, .991, .317], [-.270, 1.532, .948, .350],
  [-.048, 1.536, .923, .368], [ .158, 1.573, .938, .352],
  [ .340, 1.652, .964, .310], [ .456, 1.631, .981, .293],
  [ .586, 1.544, .978, .282], [ .706, 1.448, 1.005, .231],
  [ .796, 1.363, 1.048, .140], [ .847, 1.268, 1.167, .044],
  [ .854, 1.228, 1.211, .006]
]);

export const neck = profile([
  [1.171, .511, .703, .077], [1.258, .340, .802, .227],
  [1.392, .307, .893, .246], [1.525, .381, .992, .222],
  [1.649, .478, 1.072, .184], [1.760, .579, 1.108, .155],
  [1.871, .702, 1.117, .130], [1.961, .805, 1.108, .115],
  [2.026, .900, 1.087, .089], [2.068, .970, 1.066, .055],
  [2.082, 1.003, 1.033, .011]
]);

export const skull = profile([
  [ .866, 1.974, 1.951, .008], [ .902, 2.035, 1.854, .067],
  [ .975, 2.077, 1.739, .123], [1.059, 2.078, 1.676, .148],
  [1.126, 2.050, 1.656, .143], [1.209, 1.979, 1.635, .112],
  [1.303, 1.882, 1.585, .087], [1.389, 1.798, 1.538, .091],
  [1.470, 1.732, 1.502, .108], [1.523, 1.692, 1.493, .111],
  [1.570, 1.644, 1.508, .084], [1.600, 1.604, 1.531, .049],
  [1.610, 1.576, 1.551, .007]
]);

const frontLimb = profile([
  [.085, .558, .648, .048], [.133, .524, .628, .044],
  [.172, .503, .602, .055], [.221, .508, .590, .043],
  [.365, .534, .593, .035], [.461, .521, .598, .044],
  [.542, .503, .630, .062], [.592, .504, .627, .052],
  [.705, .472, .618, .059], [.840, .425, .643, .079],
  [.965, .385, .674, .103], [1.100, .357, .717, .127],
  [1.255, .332, .721, .136], [1.412, .350, .646, .100],
  [1.508, .442, .490, .021]
]);

const hindLimb = profile([
  [.085, -.994, -.903, .047], [.133, -1.020, -.918, .046],
  [.180, -1.043, -.931, .054], [.229, -1.033, -.947, .040],
  [.354, -1.011, -.936, .039], [.467, -1.012, -.914, .048],
  [.533, -1.052, -.913, .058], [.592, -1.023, -.877, .058],
  [.717, -.966, -.750, .071], [.839, -.925, -.632, .094],
  [.961, -.929, -.522, .116], [1.074, -.997, -.556, .146],
  [1.206, -1.051, -.621, .151], [1.369, -1.044, -.640, .148],
  [1.495, -1.009, -.669, .122], [1.560, -.862, -.778, .033]
]);

const shoulder = ellipsoid(.523, 1.282, .197, .338, .149, .128, -.79);
const foreChest = ellipsoid(.687, 1.170, .111, .195, .129, .128, 1.00);
const haunch = ellipsoid(-.854, 1.317, .193, .301, .197, .153, -.67);
const cheek = ellipsoid(1.062, 1.826, .073, .166, .127, .078, -1.09);
const brow = ellipsoid(1.104, 2.004, .091, .073, .029, .033, -.25);
const noseWing = ellipsoid(1.493, 1.622, .069, .089, .061, .044, -.42);
const nasalCavity = ellipsoid(1.489, 1.649, .120, .032, .017, .034, -.80);

const skeletons = [
  { front: true, side: 1, offset: -.022 },
  { front: true, side: -1, offset: .048 },
  { front: false, side: 1, offset: .029 },
  { front: false, side: -1, offset: -.065 }
];

export const legShift = (offset, y) => offset * (1 - smooth(.62, 1.29, y));
export const legWidth = (side, y) => side * mix(.227, .191, smooth(.93, 1.52, y));

function makeLeg({ front, side, offset }) {
  const anchors = front
    ? [[.500, 1.165], [.474, .916], [.567, .538], [.550, .163], [.605, .084]]
    : [[-.853, 1.393], [-.659, .953], [-.967, .533], [-.986, .162], [-.948, .084]];
  const joints = anchors.map(([x, y]) => [x + legShift(offset, y), y, legWidth(side, y)]);
  return { front, side, offset, joints, section: front ? frontLimb : hindLimb };
}

export const legs = skeletons.map(makeLeg);
export const neckPivot = [.526, 1.408, 0];
export const headPivot = [1.004, 1.985, 0];
export const tailPivot = [-1.107, 1.502, 0];
export const tailMid = [-1.321, .935, 0];

function profile(rows) {
  const first = rows[0][0];
  const last = rows.at(-1)[0];
  const count = Math.ceil((last - first) / .0016) + 1;
  const rate = (count - 1) / (last - first);
  const data = new Float32Array(count * 3);
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const value = first + i / rate;
    while (segment < rows.length - 2 && value > rows[segment + 1][0]) segment++;
    const a = rows[segment];
    const b = rows[segment + 1];
    const before = rows[Math.max(0, segment - 1)];
    const after = rows[Math.min(rows.length - 1, segment + 2)];
    const length = b[0] - a[0];
    const t = clamp((value - a[0]) / length, 0, 1);
    for (let col = 1; col < 4; col++) {
      const slopeA = (b[col] - before[col]) / (b[0] - before[0]);
      const slopeB = (after[col] - a[col]) / (after[0] - a[0]);
      data[3 * i + col - 1] = mix(a[col], b[col], t * t * (3 - 2 * t))
        + length * t * (1 - t) * ((1 - t) * slopeA - t * slopeB);
    }
    if (data[3 * i] > data[3 * i + 1]) {
      const top = data[3 * i];
      data[3 * i] = data[3 * i + 1];
      data[3 * i + 1] = top;
    }
  }
  return { first, last, count, rate, data };
}

export function sectionAt(section, value) {
  const f = clamp((value - section.first) * section.rate, 0, section.count - 1);
  const index = Math.min(section.count - 2, Math.floor(f));
  const t = f - index;
  const offset = index * 3;
  const data = section.data;
  return [
    mix(data[offset], data[offset + 3], t),
    mix(data[offset + 1], data[offset + 4], t),
    mix(data[offset + 2], data[offset + 5], t)
  ];
}

function sectionDistance(section, axis, across, z) {
  const f = clamp((axis - section.first) * section.rate, 0, section.count - 1);
  const i = Math.min(section.count - 2, Math.floor(f));
  const j = i * 3;
  const t = f - i;
  const data = section.data;
  const lower = mix(data[j], data[j + 3], t);
  const upper = mix(data[j + 1], data[j + 4], t);
  const half = Math.max(.003, (upper - lower) * .5);
  const width = Math.max(.003, mix(data[j + 2], data[j + 5], t));
  const u = (across - (upper + lower) * .5) / half;
  const v = z / width;
  const radial = (Math.sqrt(u * u + v * v) - 1) * Math.min(half, width);
  return Math.max(radial, section.first - axis, axis - section.last);
}

function ellipsoid(x, y, z, radiusX, radiusY, radiusZ, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const radius = Math.min(radiusX, radiusY, radiusZ);
  return (px, py, pz) => {
    const dx = px - x;
    const dy = py - y;
    const a = (dx * cos + dy * sin) / radiusX;
    const b = (dy * cos - dx * sin) / radiusY;
    const c = (pz - z) / radiusZ;
    return (Math.sqrt(a * a + b * b + c * c) - 1) * radius;
  };
}

function join(a, b, softness) {
  const overlap = Math.max(0, softness - Math.abs(a - b));
  return Math.min(a, b) - overlap * overlap / (4 * softness);
}

function legDistance(leg, x, y, z) {
  return sectionDistance(leg.section, y, x - legShift(leg.offset, y), z - legWidth(leg.side, y));
}

export function distance(x, y, z) {
  const side = Math.abs(z);
  let d = .25;
  if (x < .96 && y > .86 && y < 1.76) {
    d = sectionDistance(barrel, x, y, z);
    if (x > .035) {
      d = join(d, shoulder(x, y, side), .066);
      d = join(d, foreChest(x, y, side), .063);
    }
    if (x < -.32) d = join(d, haunch(x, y, side), .066);
  }
  if (x > .16 && x < 1.37 && y > 1.10) {
    d = join(d, sectionDistance(neck, y, x, z), .076);
  }
  if (x > .80 && y > 1.44) {
    let head = sectionDistance(skull, x, y, z);
    head = join(head, cheek(x, y, side), .026);
    head = join(head, brow(x, y, side), .021);
    head = join(head, noseWing(x, y, side), .018);
    head = -join(-head, nasalCavity(x, y, side), .012);
    d = join(d, head, .036);
  }
  if (y < 1.59 && x > .26 && x < .88) {
    d = join(d, legDistance(z >= 0 ? legs[0] : legs[1], x, y, z), .064);
  }
  if (y < 1.578 && x < -.31 && x > -1.27) {
    const thigh = join(d, legDistance(z >= 0 ? legs[2] : legs[3], x, y, z), .066);
    d = mix(d, thigh, 1 - smooth(1.405, 1.578, y));
  }
  return d;
}

export function sideSurface(x, y, sign = 1) {
  if (distance(x, y, 0) > 0 && distance(x, y, .075 * sign) > 0) return 0;
  let inner = 0;
  let outer = .43;
  for (let i = 0; i < 14; i++) {
    const z = (inner + outer) * .5;
    if (distance(x, y, z * sign) < 0) inner = z;
    else outer = z;
  }
  return (inner + outer) * .5 * sign;
}

export function topSurface(x, z) {
  const [bottom, top] = sectionAt(skull, x);
  let low = (bottom + top) * .5;
  let high = 2.14;
  for (let i = 0; i < 14; i++) {
    const y = (low + high) * .5;
    if (distance(x, y, z) < 0) low = y;
    else high = y;
  }
  return (low + high) * .5;
}

export const neckWeight = (x, y) => smooth(1.43, 1.83, y) * smooth(.27, .63, x);

export function headWeight(x, y) {
  const border = mix(1.044, .855, smooth(1.56, 1.93, y));
  return smooth(border, border + .211, x) * smooth(1.36, 1.52, y);
}

export function skinAt(x, y, z) {
  const indices = [];
  const weights = [];
  let legWeight = 0;
  if (y < 1.54 && (x > .23 || x < -.42)) {
    const legIndex = (x > .23 ? 0 : 2) + (z < 0 ? 1 : 0);
    const leg = legs[legIndex];
    const [, elbow, knee, ankle] = leg.joints;
    const [left, right] = sectionAt(leg.section, y);
    const centralX = (left + right) * .5 + legShift(leg.offset, y);
    const margin = (right - left) * .5;
    const across = 1 - smooth(margin + .025, margin + .15, Math.abs(x - centralX));
    const top = leg.front ? 1.345 : 1.475;
    legWeight = across * smooth(.050, .179, Math.abs(z)) * (1 - smooth(1.029, top, y));

    const a = smooth(elbow[1] - .101, elbow[1] + .100, y);
    const b = smooth(knee[1] - .056, knee[1] + .058, y);
    const c = smooth(ankle[1] - .033, ankle[1] + .043, y);
    const first = 3 + legIndex * 4;
    indices.push(first, first + 1, first + 2, first + 3);
    weights.push(legWeight * a, legWeight * (1 - a) * b,
      legWeight * (1 - a) * (1 - b) * c, legWeight * (1 - a) * (1 - b) * (1 - c));
  }

  const head = headWeight(x, y);
  const neckPart = (1 - head) * neckWeight(x, y);
  indices.push(0, 1, 2);
  weights.push((1 - legWeight) * (1 - head - neckPart),
    (1 - legWeight) * neckPart, (1 - legWeight) * head);

  const order = weights.map((weight, index) => index);
  order.sort((a, b) => weights[b] - weights[a]);
  const chosen = order.slice(0, 4);
  const total = chosen.reduce((sum, index) => sum + weights[index], 0);
  while (chosen.length < 4) chosen.push(-1);
  return [
    chosen.map(index => indices[index] ?? 0),
    chosen.map(index => index < 0 ? 0 : weights[index] / total)
  ];
}

function toLinear(byte) {
  const n = byte / 255;
  return n < .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
}

const linear = rgb => rgb.map(toLinear);
const copper = linear([129, 60, 28]);
const red = linear([78, 31, 19]);
const flank = linear([154, 71, 34]);
const blackPoint = linear([24, 18, 15]);
const face = linear([70, 47, 36]);
const velvet = linear([36, 27, 23]);
const white = linear([222, 209, 186]);
const boneWhite = linear([234, 221, 195]);
const gaussian = x => Math.exp(-x * x);

export function coatColor(x, y, z) {
  const side = Math.abs(z);
  const shoulderLight = gaussian((x - .43) / .33) * gaussian((y - 1.34) / .21);
  const rumpLight = gaussian((x + .87) / .40) * gaussian((y - 1.32) / .22);
  const copperTone = clamp(.32 + .36 * shoulderLight + .45 * rumpLight
    + .14 * Math.sin(x * 4.5 + y * 2), 0, 1);
  const dorsal = smooth(1.42, 1.63, y) * (1 - smooth(.07, .27, side)) * (1 - smooth(.3, 1.05, x));
  const shade = clamp(.45 * dorsal + .23 * (1 - smooth(.96, 1.19, y)), 0, .92);
  const legDark = (1 - smooth(.55 + .048 * Math.sin(x * 27 + z * 16), .930, y)) * .99;
  const muzzle = smooth(1.31, 1.509, x) * (1 - .26 * smooth(1.61, 1.75, y));
  const eyeShade = gaussian((x - 1.115) / .096) * gaussian((y - 1.970) / .072)
    * smooth(.085, .14, side) * .56;
  const snoutShade = clamp(muzzle + eyeShade, 0, .99);
  const velvetGrad = smooth(1.41, 1.60, x) * (1 - smooth(1.57, 1.69, y));

  const [low, high] = sectionAt(skull, x);
  const nasalRidge = smooth(.64, .962, (y - low) / (high - low));
  const waviness = Math.sin(x * 41) * .007 + Math.sin(x * 87 + 1) * .0035;
  const star = .024 + .022 * gaussian((x - 1.125) / .067);
  const blazeWidth = star * smooth(1.005, 1.063, x) * (1 - smooth(1.447, 1.486, x));
  const blaze = nasalRidge * smooth(1.004, 1.034, x) * (1 - smooth(1.445, 1.482, x))
    * (1 - smooth(blazeWidth - .007, blazeWidth + .003, Math.abs(z - waviness)));
  const sockTop = .233 + .018 * Math.sin(z * 53) + .010 * Math.sin(x * 45 + z * 65);
  const sock = z > 0 && x < -.66 ? 1 - smooth(sockTop - .009, sockTop + .010, y) : 0;
  const variation = 1 + .078 * Math.sin(37 * x + 18 * y + Math.cos(z * 21))
    * Math.sin(27 * y - z * 30) + .028 * Math.sin(73 * z - 43 * x + 28 * y);

  return copper.map((value, channel) => {
    let color = mix(value, flank[channel], copperTone);
    color = mix(color, red[channel], shade);
    color = mix(color, blackPoint[channel], legDark);
    color = mix(color, mix(face[channel], velvet[channel], velvetGrad), snoutShade);
    return mix(mix(color, white[channel], blaze), boneWhite[channel], sock) * variation;
  });
}
