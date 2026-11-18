import * as THREE from "three";
import { footIndex, headIndex, tailSkin } from "./rig.js";
import { coatColor, legs, mix, neck, sectionAt, sideSurface, skinAt, smooth, topSurface } from "./sculpt.js";

const tau = Math.PI * 2;
const edgeDark = new THREE.Color(0x231711);
const earCopper = new THREE.Color(0x965d42);
const innerEar = new THREE.Color(0x513127);
const muzzleSkin = new THREE.Color(0x382c29);
const nostrilBlack = new THREE.Color(0x100b0a);
const iris = new THREE.Color(0x744521);
const irisDark = new THREE.Color(0x342016);
const pupil = new THREE.Color(0x0b0806);
const hoofDark = new THREE.Color(0x282420);
const hoofLight = new THREE.Color(0x62523f);
const hoofHeel = new THREE.Color(0x53433a);
const hairDark = new THREE.Color(0x180f0b);
const hairCopper = new THREE.Color(0x50301e);

const earMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .71 });
const hornMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .59 });
const eyeMaterial = new THREE.MeshPhysicalMaterial({
  side: THREE.DoubleSide, vertexColors: true, roughness: .32,
  clearcoat: .18, clearcoatRoughness: .22, specularIntensity: .27
});
const nostrilMaterial = new THREE.MeshStandardMaterial({
  side: THREE.DoubleSide, vertexColors: true, roughness: .78
});
const lipMaterial = new THREE.MeshStandardMaterial({ color: 0x190f0d, roughness: .88 });
const hairMaterial = new THREE.MeshPhysicalMaterial({
  vertexColors: true, roughness: .59, sheen: .13, sheenRoughness: .62,
  sheenColor: new THREE.Color(0x946244), specularIntensity: .36
});

export function addDetails(rig) {
  for (const side of [1, -1]) {
    const ear = makeEar(side);
    rig.ears.push(rig.attach(ear, headIndex));
    const eye = makeEye(side);
    rig.eyes.push(rig.attach(eye, headIndex));
    const nostril = new THREE.Mesh(makeNostril(side), nostrilMaterial);
    rig.attach(nostril, headIndex);
    rig.attach(makeMouth(side), headIndex);
  }

  for (const [index, leg] of legs.entries()) {
    const [x, , z] = leg.joints[4];
    const hoof = makeHoof(index === 2);
    hoof.position.set(x, 0, z);
    rig.attach(hoof, footIndex(index));
  }

  rig.addSkinned(makeMane(), hairMaterial, true);
  rig.addSkinned(makeTail(), hairMaterial, true);
  rig.addSkinned(makeWhiskers(), hairMaterial, false);
  return rig;
}

function ringGeometry(rings, sides, sample) {
  const points = [];
  const colors = [];
  const triangles = [];
  for (let row = 0; row <= rings; row++) {
    for (let column = 0; column < sides; column++) {
      const [position, color] = sample(row / rings, column / sides * tau);
      points.push(...position);
      colors.push(color.r, color.g, color.b);
      if (row === 0) continue;
      const a = (row - 1) * sides + column;
      const b = (row - 1) * sides + (column + 1) % sides;
      triangles.push(a, a + sides, b + sides, a, b + sides, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(triangles);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeEar(side) {
  const root = new THREE.Vector3(1.005, topSurface(1.005, side * .081) - .013, side * .081);
  const geometry = ringGeometry(33, 48, function earRing(t, theta) {
    const bulb = Math.sin(Math.PI * t);
    const front = Math.cos(theta);
    const span = .0015 + .033 * bulb ** .76 + .020 * (1 - t) ** 2;
    const depth = .002 + .026 * bulb ** .65 + .018 * (1 - t) ** 3;
    const opening = smooth(.10, .27, t) * (1 - smooth(.83, .995, t));
    const cup = Math.max(0, front) ** 8 * opening;
    const x = .035 * t ** 1.35 - .016 * bulb + depth * front - .028 * cup;
    const y = .181 * t + .007 * bulb * Math.sin(theta) * side;
    const z = side * (.035 * t ** 1.6) + span * Math.sin(theta);
    const shade = .25 * (1 - front) + .40 * smooth(.81, 1, t);
    const color = earCopper.clone().lerp(edgeDark, shade).lerp(innerEar, .80 * cup);
    color.multiplyScalar(.92 + .09 * Math.sin(theta * 41 + t * 26) * opening);
    return [[x, y, z], color];
  });
  const mesh = new THREE.Mesh(geometry, earMaterial);
  mesh.position.copy(root);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeHoof(pale) {
  const geometry = ringGeometry(28, 48, function hoofRing(t, theta) {
    const front = Math.cos(theta);
    const side = Math.sin(theta);
    const bottom = smooth(0, .085, t);
    const top = smooth(.91, 1, t);
    const xRadius = mix(.090, .054, t) * mix(.04, 1, bottom) * mix(1, .84, top);
    const zRadius = mix(.069, .053, t) * mix(.04, 1, bottom) * mix(1, .83, top);
    const center = mix(.012, -.009, t);
    const x = center + xRadius * Math.sign(front) * Math.abs(front) ** .84;
    const y = .003 + .105 * t ** 1.4;
    const z = zRadius * side * (.95 + .11 * front);
    const growthLines = .073 * Math.sin(t * 51 + Math.sin(theta * 3) * 2)
      + .076 * Math.sin(theta * 33 + t * .8) + .034 * Math.cos(theta * 83);
    const material = pale ? hoofLight : hoofDark;
    const tone = material.clone().lerp(hoofHeel, .22 * (1 - front))
      .multiplyScalar(.87 + .27 * t + growthLines);
    return [[x, y, z], tone];
  });
  const mesh = new THREE.Mesh(geometry, hornMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function projectedPatch(side, sample) {
  const geometry = ringGeometry(22, 64, function patchRing(radial, angle) {
    const [x, y, lift, color] = sample(Math.max(.001, radial), angle);
    return [[x, y, sideSurface(x, y, side) + side * lift], color];
  });
  return geometry;
}

function makeEye(side) {
  const opened = projectedPatch(side, function openPatch(r, theta) {
    return eyePatch(r, theta, 1);
  });
  const closed = projectedPatch(side, function closedPatch(r, theta) {
    return eyePatch(r, theta, .075);
  });
  opened.morphAttributes.position = [closed.getAttribute("position")];
  opened.morphAttributes.normal = [closed.getAttribute("normal")];
  return new THREE.Mesh(opened, eyeMaterial);

  function eyePatch(r, theta, openness) {
    const u = r * Math.cos(theta);
    const v = r * Math.sin(theta);
    const x = 1.120 + .041 * u;
    const y = 1.981 + .023 * openness * v * (1 - .30 * Math.abs(u)) - .006 * u;
    const z = sideSurface(x, y, side);
    const fur = new THREE.Color(...coatColor(x, y, z));
    const irisR = Math.hypot((u + .13) / .72, (v + .06) / .94);
    const pupilR = Math.hypot((u + .12) / .48, (v + .05) / .54);
    const grain = Math.sin(Math.atan2(v + .06, u + .13) * 61 + irisR * 24) * .13;
    const brown = iris.clone().lerp(irisDark, smooth(.53, .99, irisR) * .82).multiplyScalar(1 + grain);
    const color = brown.lerp(pupil, Math.max(1 - smooth(.86, 1.05, pupilR), smooth(.90, 1.10, irisR)));
    const lower = smooth(-.3, .55, -v);
    const lid = edgeDark.clone().lerp(fur, .24 + .27 * lower);
    color.lerp(lid, smooth(.76, .865, r)).lerp(fur, smooth(.945, 1, r));
    const reflection = Math.exp(-((u + .26) ** 2 / .011 + (v - .29) ** 2 / .019));
    color.lerp(new THREE.Color(0xd4c6aa), reflection * .75 * (1 - smooth(.73, .90, r)));
    const lift = .0009 + .0044 * openness * (1 - r * r) + .0013 * Math.exp(-(((r - .87) / .075) ** 2));
    return [x, y, lift, color];
  }
}

function makeNostril(side) {
  return projectedPatch(side, function nostrilPatch(r, theta) {
    const along = r * Math.cos(theta);
    const across = r * Math.sin(theta);
    const x = 1.491 + .029 * along + .015 * across;
    const y = 1.647 - .027 * along + .012 * across + .003 * along * along;
    const z = sideSurface(x, y, side);
    const fur = new THREE.Color(...coatColor(x, y, z));
    const cavity = nostrilBlack.clone().lerp(muzzleSkin, .32 * smooth(-.1, .75, along));
    const color = cavity.lerp(muzzleSkin, smooth(.62, .89, r)).lerp(fur, smooth(.86, 1, r));
    const lip = Math.exp(-(((r - .84) / .11) ** 2)) * .0017 * (1 - .34 * across);
    return [x, y, .0028 + lip, color];
  });
}

function makeMouth(side) {
  const crease = [[1.373, 1.555], [1.410, 1.549], [1.462, 1.528],
    [1.511, 1.520], [1.549, 1.531], [1.583, 1.551], [1.600, 1.567]];
  const points = crease.map(([x, y]) => new THREE.Vector3(x, y, sideSurface(x, y, side) + side * .0010));
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 32, .00105, 6, false), lipMaterial);
}

function seededRandom(seed) {
  let state = seed;
  return function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function groom(strandCount, segments, sides, random, draw, weight) {
  const positions = [];
  const normals = [];
  const colors = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];
  const xAxis = new THREE.Vector3(1, 0, 0);
  const direction = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const offset = new THREE.Vector3();

  for (let id = 0; id < strandCount; id++) {
    const { points, width, brightness } = draw(id);
    const color = hairDark.clone().lerp(hairCopper, brightness);
    const start = positions.length / 3;

    for (let row = 0; row <= segments; row++) {
      const p = points[row];
      const t = row / segments;
      direction.subVectors(points[Math.min(row + 1, segments)], points[Math.max(row - 1, 0)]).normalize();
      normal.crossVectors(direction, xAxis).normalize();
      binormal.crossVectors(direction, normal).normalize();
      const radius = width * (1 - .94 * t ** 1.8) * (.45 + .55 * smooth(0, .16, t));
      const [bones, weights] = weight(p);

      for (let side = 0; side < sides; side++) {
        const theta = tau * side / sides;
        offset.copy(normal).multiplyScalar(Math.cos(theta)).addScaledVector(binormal, Math.sin(theta));
        positions.push(p.x + offset.x * radius, p.y + offset.y * radius, p.z + offset.z * radius);
        normals.push(offset.x, offset.y, offset.z);
        const tone = .81 + .22 * t + .085 * Math.sin(id + t * 5) + random() * .06;
        colors.push(color.r * tone, color.g * tone, color.b * tone);
        skinIndices.push(...bones);
        skinWeights.push(...weights);
        if (row === 0) continue;
        const a = start + (row - 1) * sides + side;
        const b = start + (row - 1) * sides + (side + 1) % sides;
        indices.push(a, b + sides, a + sides, a, b, b + sides);
      }
    }
  }

  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals),
    colors: new Float32Array(colors), indices: new Uint32Array(indices),
    skinIndices: new Uint16Array(skinIndices), skinWeights: new Float32Array(skinWeights)
  };
}

const headSkin = () => [[headIndex, 0, 0, 0], [1, 0, 0, 0]];
const maneSkin = p => skinAt(p.x, p.y, p.z);
const tailWeight = p => tailSkin(p.y);

function makeMane() {
  const random = seededRandom(73813);
  const segments = 13;
  return groom(1570, segments, 4, random, function drawMane(index) {
    const isForelock = index >= 1240;
    const s = random();
    const spread = random();
    const length = random();
    const flutter = random();
    const phase = random() * tau;
    const points = [];
    const cord = index % 8 === 0;
    const width = cord ? .004 + random() * .005 : .00075 + random() * .0016;
    const brightness = random() ** 3.4 * .58;
    const near = index % 10 !== 1;

    if (isForelock) {
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const x = mix(.994 + s * .055, 1.107 + length * .175, t) + Math.sin(t * 3 + phase) * .007 * t;
        const z = (spread - .48) * .069 + .047 * t + .031 * Math.sin(t * 2 + phase) * t;
        const y = topSurface(x, z) + mix(.009, .002, t) + .009 * Math.sin(Math.PI * t);
        points.push(new THREE.Vector3(x, y, z));
      }
      return { points, width: width * .78, brightness };
    }

    const rootY = 2.067 - s * .420 + .009 * (spread - .5);
    const [crest] = sectionAt(neck, rootY);
    const rootX = mix(crest + .011, .355, smooth(.84, 1.03, s));
    const lengthScale = mix(.24, .350, Math.sin(Math.PI * s)) * (.65 + .44 * length);
    const sign = near ? 1 : -1;
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      const y = rootY - lengthScale * t ** 1.37 + .014 * Math.sin(t * Math.PI);
      const wave = Math.sin(t * 4.5 + phase) * t * (.006 + flutter * .014);
      const x = rootX - (.037 + .106 * spread) * t + wave - .021 * Math.sin(t * Math.PI);
      const surface = sideSurface(x, y, sign);
      const z = surface + sign * (.006 + .021 * Math.sin(t * Math.PI) + .015 * (spread - .5) * t);
      points.push(new THREE.Vector3(x, y + mix(.009, 0, t), z));
    }
    return { points, width, brightness };
  }, maneSkin);
}

function makeTail() {
  const random = seededRandom(81626);
  const segments = 18;
  return groom(1040, segments, 4, random, function drawTail(index) {
    const start = random();
    const s = random();
    const phase = random() * tau;
    const sway = random();
    const length = mix(.94, 1.23, random() ** .72);
    const zSpread = (s - .5) * .198;
    const points = [];
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      const out = .235 * (1 - Math.exp(-t * 9));
      const ripple = .021 * Math.sin(t * 7 + phase) * t;
      const x = -1.104 - out - .09 * Math.sin(t * Math.PI * .91) + mix(-.04, .056, sway) * t + ripple;
      const y = 1.508 - length * t ** 1.36 + .031 * (start - .56) * (1 - t);
      const z = zSpread * (.30 + t * .92) + .027 * Math.sin(t * 4 + phase) * t;
      points.push(new THREE.Vector3(x, y, z));
    }
    const width = index % 9 === 0 ? .005 + random() * .007 : .001 + random() * .002;
    return { points, width, brightness: random() ** 2.6 * .66 };
  }, tailWeight);
}

function makeWhiskers() {
  const random = seededRandom(25539);
  const segments = 5;
  return groom(60, segments, 3, random, function drawWhisker(index) {
    const side = index % 2 === 0 ? -1 : 1;
    const x = 1.449 + .125 * random();
    const y = 1.545 + .05 * random();
    const z = sideSurface(x, y, side);
    const length = .010 + .024 * random();
    const points = [];
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      points.push(new THREE.Vector3(x + t * length * .28, y - (.38 * t + .49 * t * t) * length, z + side * t * length));
    }
    return { points, width: .00026 + .00034 * random(), brightness: .52 + .43 * random() };
  }, headSkin);
}
