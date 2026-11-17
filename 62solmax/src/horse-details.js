import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Group, Mesh,
  MeshPhysicalMaterial, MeshStandardMaterial, Vector3,
} from 'three';
import { lerp, seededRandom, smoothstep } from './surface.js';

const brownBlack = new Color('#231a17');
const russetHair = new Color('#4b3227');
const warmHair = new Color('#634732');
const earBay = new Color('#915030');
const earTip = new Color('#30221c');
const earWell = new Color('#49312b');
const iris = new Color('#543626');
const pupil = new Color('#0e0b0a');
const tearLine = new Color('#32201a');
const lidEdge = new Color('#6e412d');
const nostrilWell = new Color('#201619');
const nostrilRim = new Color('#574239');
const up = new Vector3(0, 1, 0);
const across = new Vector3(0, 0, 1);
const tau = Math.PI * 2;

export const faceProfiles = {
  eye: { center: [1.300, 2.061], size: [0.036, 0.0188], tilt: -0.235, depth: 0.004 },
  nostril: { center: [1.604, 1.763], size: [0.042, 0.024], tilt: -0.63, depth: 0.010 },
};

function meshBuilder() {
  const positions = [];
  const colors = [];
  const faces = [];

  function vertex(x, y, z, color) {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  }

  function connect(start, ringCount, sides, reverse = false) {
    for (let ring = 0; ring < ringCount - 1; ring++) {
      for (let side = 0; side < sides; side++) {
        const a = start + ring * sides + side;
        const b = start + ring * sides + (side + 1) % sides;
        if (reverse) faces.push(a, a + sides, b + sides, a, b + sides, b);
        else faces.push(a, b, b + sides, a, b + sides, a + sides);
      }
    }
  }

  function geometry() {
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    result.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    result.setIndex(faces);
    result.computeVertexNormals();
    return result;
  }

  return { vertex, connect, geometry, count: () => positions.length / 3 };
}

function strand(builder, points, radius, color, {
  steps = 12, sides = 6, flatness = 1, volume = 0.32,
} = {}) {
  const curve = new CatmullRomCurve3(points);
  const start = builder.count();
  const spine = new Vector3();
  const tangent = new Vector3();
  const u = new Vector3();
  const v = new Vector3();
  const shade = new Color();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    curve.getPoint(t, spine);
    curve.getTangent(t, tangent);
    u.crossVectors(tangent, Math.abs(tangent.z) > 0.90 ? up : across).normalize();
    v.crossVectors(tangent, u);
    const width = radius * Math.max(0.014, (1 - t) ** 0.45 * (volume + 0.73 * Math.sin(Math.PI * t) ** 0.68));
    shade.copy(color).multiplyScalar(lerp(0.78, 1.08, t));
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * tau;
      const a = Math.cos(angle) * width * flatness;
      const b = Math.sin(angle) * width;
      builder.vertex(spine.x + a * u.x + b * v.x, spine.y + a * u.y + b * v.y, spine.z + a * u.z + b * v.z, shade);
    }
  }
  builder.connect(start, steps + 1, sides);
}

function drape(sculpt, x, y, side, lift, minimum) {
  const p = sculpt.sideAt(x, y, side);
  const z = p ? Math.max(Math.abs(p.z), minimum) : minimum;
  return new Vector3(x, y, side * (z + lift));
}

export function makeHair(sculpt, projectForehead) {
  const mane = meshBuilder();
  const tail = meshBuilder();
  const random = seededRandom(87019);
  const color = new Color();
  const crest = new CatmullRomCurve3([
    new Vector3(1.198, 2.231, 0), new Vector3(1.038, 2.174, 0),
    new Vector3(0.843, 2.051, 0), new Vector3(0.660, 1.913, 0),
    new Vector3(0.548, 1.803, 0), new Vector3(0.425, 1.738, 0),
    new Vector3(0.317, 1.706, 0),
  ]);

  for (let i = 0; i < 263; i++) {
    const broad = i < 83;
    const t = broad ? i / 83 : random();
    const p = crest.getPoint(t);
    const side = (broad ? i % 7 !== 4 : random() > 0.13) ? -1 : 1;
    const length = lerp(0.12, 0.255, Math.sin(Math.PI * t) ** 0.8) * lerp(0.72, 1.34, random());
    const west = lerp(0.045, 0.135, random());
    const looseness = broad ? 0.006 : 0.011 + random() * 0.012;
    p.x += (random() - 0.5) * 0.022;
    p.y += broad ? 0.006 : 0.012;
    p.z = side * random() * 0.052;
    const points = [
      p,
      drape(sculpt, p.x - west * 0.40, p.y - length * 0.19, side, looseness + 0.012, 0.053),
      drape(sculpt, p.x - west * 0.78, p.y - length * 0.53, side, looseness, 0.070),
      drape(sculpt, p.x - west, p.y - length, side, looseness * 0.69, 0.075),
    ];
    color.copy(brownBlack).lerp(russetHair, random() * 0.63);
    if (!broad) color.lerp(warmHair, 0.04 + random() * 0.32);
    strand(mane, points, broad ? 0.014 + random() * 0.012 : 0.0007 + random() * 0.0012, color,
      { steps: broad ? 14 : 11, sides: broad ? 7 : 4, flatness: 0.86, volume: 0.80 });
  }

  for (let i = 0; i < 105; i++) {
    const broad = i < 30;
    const z = (random() - 0.5) * 0.105;
    const tip = lerp(0.119, 0.232, random()) - Math.abs(z) * 0.57;
    const sweep = lerp(0.008, 0.043, random());
    color.copy(brownBlack).lerp(russetHair, random() * 0.68);
    strand(mane, [
      projectForehead(-0.063 + random() * 0.041, z * 0.68, 0.001),
      projectForehead(0.014, z, 0.013),
      projectForehead(tip * 0.64, z + sweep * 0.58, broad ? 0.007 : 0.014),
      projectForehead(tip, z + sweep, 0.006 + random() * 0.005),
    ], broad ? 0.009 + random() * 0.009 : 0.0008 + random() * 0.0018, color,
    { volume: 0.79, steps: broad ? 15 : 13, sides: broad ? 7 : 4 });
  }

  const fall = new CatmullRomCurve3([
    new Vector3(-1.162, 1.522, 0), new Vector3(-1.299, 1.452, -0.012),
    new Vector3(-1.395, 1.249, -0.021), new Vector3(-1.421, 0.983, -0.043),
    new Vector3(-1.441, 0.706, -0.071), new Vector3(-1.461, 0.401, -0.113),
    new Vector3(-1.542, 0.300, -0.118),
  ]);

  for (let i = 0; i < 171; i++) {
    const broad = i < 36;
    const angle = random() * tau;
    const spread = Math.sqrt(random());
    const end = lerp(0.65, 1, random() ** 0.75);
    const x = Math.cos(angle) * spread;
    const z = Math.sin(angle) * spread;
    const wave = random() * tau;
    const points = [];
    for (let j = 0; j < 8; j++) {
      const t = j / 7;
      const p = fall.getPoint(t * end);
      const belly = 0.31 + 0.70 * Math.sin(Math.PI * (0.10 + t * 0.73));
      p.x += x * belly * 0.078 + Math.sin(wave + t * 7) * t * 0.032;
      p.z += z * belly * 0.106 + Math.cos(wave + t * 6) * t * 0.027;
      points.push(p);
    }
    color.copy(brownBlack).lerp(russetHair, random() ** 2 * 0.86);
    if (!broad) color.lerp(warmHair, random() * 0.36);
    strand(tail, points, broad ? 0.026 + random() * 0.022 : 0.0011 + random() * 0.0023, color,
      { steps: broad ? 22 : 16, sides: broad ? 7 : 4, flatness: 0.91, volume: 0.66 });
  }
  return { mane: mane.geometry(), tail: tail.geometry() };
}

function ear(side, parent) {
  const base = new Vector3(1.176, 2.175, side * 0.099);
  const group = new Group();
  group.position.copy(base);
  parent.add(group);
  const shell = meshBuilder();
  const tint = new Color();
  const height = side < 0 ? 0.200 : 0.220;
  for (let i = 0; i <= 23; i++) {
    const t = i / 23;
    const taper = Math.max(0.013, Math.sin(Math.PI * (0.20 + t * 0.80)) ** 0.76);
    const width = 0.053 * taper * (1 - t * 0.19);
    const thickness = 0.035 * taper;
    for (let j = 0; j < 32; j++) {
      const angle = j * tau / 32;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const cup = smoothstep(0.49, 0.99, c) * smoothstep(0.05, 0.23, t) * (1 - smoothstep(0.77, 0.99, t));
      const x = 0.082 * t - 0.035 * t * t + thickness * c - thickness * 1.03 * cup;
      const z = side * (0.091 * t - 0.014 * t * t) + width * s + 0.18 * side * thickness * c;
      tint.copy(earBay).lerp(earTip, smoothstep(0.64, 1, t) * 0.85).lerp(earWell, cup * 0.97);
      tint.multiplyScalar(0.95 + 0.045 * Math.sin(angle * 19 + t * 42));
      shell.vertex(x, t * height, z, tint);
    }
  }
  shell.connect(0, 24, 32, true);
  const mesh = new Mesh(shell.geometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.83, side: DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function hoof(leg) {
  const shell = meshBuilder();
  const ankle = leg.joints[3];
  const pale = leg.rear && leg.side < 0;
  const horn = new Color(pale ? '#a1907c' : '#3a322d');
  const sole = new Color(pale ? '#736356' : '#262321');
  const coronet = new Color(pale ? '#d2bd9e' : '#514135');
  const tint = new Color();
  const width = leg.rear ? 0.057 : 0.065;
  const depth = leg.rear ? 0.070 : 0.075;
  const sections = [
    [0.009, 0.043, 0.020], [0.010, 0.044, 0.92], [0.019, 0.044, 1],
    [0.032, 0.042, 0.99], [0.055, 0.036, 0.94], [0.075, 0.033, 0.88],
    [0.092, 0.027, 0.80], [0.109, 0.024, 0.74], [0.117, 0.024, 0.70],
    [0.126, 0.022, 0.62], [0.128, 0.022, 0.015],
  ];
  for (const [y, middle, scale] of sections) {
    for (let i = 0; i < 40; i++) {
      const angle = i * tau / 40;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const x = middle + Math.sign(c) * Math.abs(c) ** 0.74 * depth * scale;
      const z = width * s * (0.94 + 0.10 * c) * scale;
      tint.copy(horn).lerp(sole, 1 - smoothstep(0.013, 0.040, y))
        .lerp(coronet, smoothstep(0.096, 0.118, y) * 0.73);
      tint.multiplyScalar(0.94 + 0.09 * Math.cos(angle * 17) + 0.045 * Math.sin(angle * 31 - y * 78) + 0.075 * Math.sin(y * 252));
      shell.vertex(x, y - ankle.y, z, tint);
    }
  }
  shell.connect(0, sections.length, 40, true);
  const mesh = new Mesh(shell.geometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  leg.bones[3].add(mesh);
  return mesh;
}

function faceFeature(sculpt, side, { center, size, tilt }, eye, coatColor) {
  const rings = meshBuilder();
  const tint = new Color();
  const ca = Math.cos(tilt);
  const sa = Math.sin(tilt);
  const [cx, cy] = center;
  const anchor = sculpt.sideAt(cx, cy, side);
  const blink = { value: 0 };
  const eyelid = coatColor(anchor.x, anchor.y, anchor.z, new Color()).lerp(lidEdge, 0.42);

  for (let ring = 0; ring <= 19; ring++) {
    const r = Math.max(0.001, ring / 19);
    for (let i = 0; i < 48; i++) {
      const angle = i * tau / 48;
      const cos = Math.cos(angle);
      const sine = Math.sin(angle);
      const u = cos * size[0] * r + (eye ? 0 : -0.009 * sine * sine * r);
      const v = sine * Math.abs(sine) ** (eye ? 0.40 : 0.22) * size[1] * r;
      const x = cx + u * ca - v * sa;
      const y = cy + u * sa + v * ca;
      const p = sculpt.sideAt(x, y, side) ?? sculpt.sideAt(lerp(cx, x, 0.74), lerp(cy, y, 0.74), side) ?? anchor;
      const rim = smoothstep(0.58, 0.77, r) * (1 - smoothstep(0.81, 1, r));
      if (eye) {
        const pupilDistance = Math.hypot((u + 0.002) / 0.020, (v - 0.001) / 0.009);
        tint.copy(iris).multiplyScalar(0.82 + 0.16 * Math.sin(angle * 19 + r * 5))
          .lerp(pupil, 1 - smoothstep(0.80, 1.15, pupilDistance))
          .lerp(tearLine, smoothstep(0.70, 0.82, r))
          .lerp(lidEdge, rim * 0.12);
        const catchlight = 1 - smoothstep(0.62, 1, Math.hypot((u - 0.004) / 0.0035, (v - 0.0054) / 0.0017));
        tint.multiplyScalar(1 - catchlight * 0.3);
        tint.r += catchlight * 0.23;
        tint.g += catchlight * 0.21;
        tint.b += catchlight * 0.18;
      } else {
        tint.copy(nostrilWell).lerp(nostrilRim, rim * (0.79 + sine * 0.15));
      }
      tint.lerp(coatColor(p.x, p.y, p.z, new Color()), smoothstep(0.87, 1, r));
      const emboss = eye ? 0.0065 * (1 - r * r) + 0.0015 * rim : 0.0016 * rim;
      rings.vertex(p.x, p.y, p.z + side * (0.0020 + emboss), tint);
    }
  }

  rings.connect(0, 20, 48);
  const geometry = rings.geometry();
  const material = new MeshPhysicalMaterial({
    vertexColors: true, side: DoubleSide, roughness: eye ? 0.51 : 0.87, clearcoat: eye ? 0.09 : 0,
    specularIntensity: eye ? 0.49 : 0.22,
  });
  if (eye) {
    material.onBeforeCompile = function addBlink(shader) {
      shader.uniforms.blink = blink;
      shader.uniforms.lidColor = { value: eyelid };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vEyeY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeY = position.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float blink;\nuniform vec3 lidColor;\nvarying float vEyeY;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n'
          + 'float cover = smoothstep(0.0, 0.003, vEyeY - ' + (cy + 0.018).toFixed(5) + ' + blink * 0.038);'
          + 'diffuseColor.rgb = mix(diffuseColor.rgb, lidColor, cover * smoothstep(0.0, 0.16, blink));');
    };
    material.customProgramCacheKey = () => String(cy);
  }
  const mesh = new Mesh(geometry, material);
  return { mesh, blink };
}

export function addHorseDetails(sculpt, parent, legs, coatColor) {
  const ears = [];
  const blinks = [];
  const lips = meshBuilder();
  const whiskers = seededRandom(661);
  const noseColor = new Color('#281c19');
  const bristleColor = new Color('#564136');
  for (const side of [-1, 1]) {
    ears.push(ear(side, parent));
    const eye = faceFeature(sculpt, side, faceProfiles.eye, true, coatColor);
    parent.add(eye.mesh);
    blinks.push(eye.blink);
    const nostril = faceFeature(sculpt, side, faceProfiles.nostril, false, coatColor);
    parent.add(nostril.mesh);
    const mouth = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = lerp(1.510, 1.657, t);
      const y = 1.707 - 0.062 * t - 0.012 * Math.sin(t * Math.PI);
      const p = sculpt.sideAt(x, y, side);
      if (p) {
        p.z += side * 0.0027;
        mouth.push(p);
      }
    }
    strand(lips, mouth, 0.0036, noseColor, { steps: 22, sides: 5, flatness: 0.65 });
    for (let i = 0; i < 16; i++) {
      const x = lerp(1.524, 1.676, whiskers());
      const y = lerp(1.66, 1.734, whiskers());
      const root = sculpt.sideAt(x, y, side);
      if (!root) continue;
      const length = 0.007 + whiskers() * 0.013;
      strand(lips, [
        root,
        new Vector3(x + 0.007, y - 0.004, root.z + side * length * 0.7),
        new Vector3(x + 0.010, y - 0.008, root.z + side * length),
      ], 0.00055, bristleColor, { sides: 4, steps: 4 });
    }
  }
  parent.add(new Mesh(lips.geometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.90 })));
  for (const leg of legs) hoof(leg);
  return { ears, blinks };
}
