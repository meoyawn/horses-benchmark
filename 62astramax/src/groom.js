import * as THREE from 'three';

const tau = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Each palette describes the depths between locks, the body of the hair, and
// the finer sun-lightened fibers. Colors are interpolated in linear space.
const palettes = {
  bay: ['#161314', '#352824', '#71594b', '#71645a'],
  chestnut: ['#382018', '#77472d', '#b17d53', '#9a7c63'],
  grey: ['#2e2e31', '#676668', '#b8b4ad', '#969392'],
};

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function newSurface() {
  return { positions: [], triangles: [], shades: [], weights: [], fibers: [] };
}

function vertex(surface, point, shade, weights, fiber=point.x*42+point.z*63) {
  const id = surface.shades.length;
  surface.positions.push(point.x, point.y, point.z);
  surface.shades.push(clamp(shade, 0, 1));
  surface.fibers.push(fiber);
  if (weights) surface.weights.push(...weights);
  return id;
}

// A closed elliptical cross-section gives every lock thickness on end-on
// views. The broad side lies against the next layer of hair.
function addLock(surface, steps, sides, sample) {
  const sections = Array.from({ length: steps + 1 }, (_, i) => sample(i / steps));
  const start = surface.shades.length;
  const fibersAcross=Math.max(2,sections[Math.floor(steps/3)].width*1100);
  const tangent = v(0, 0, 0), widthAxis = v(0, 0, 0), outer = v(0, 0, 0);
  const point = v(0, 0, 0);
  for (let i = 0; i <= steps; i++) {
    const s = sections[i];
    tangent.subVectors(sections[Math.min(steps, i + 1)].p, sections[Math.max(0, i - 1)].p).normalize();
    widthAxis.crossVectors(s.normal, tangent).normalize();
    outer.crossVectors(tangent, widthAxis).normalize();
    for (let j = 0; j < sides; j++) {
      const a = tau * j / sides, c = Math.cos(a), h = Math.sin(a);
      point.copy(s.p).addScaledVector(widthAxis, s.width * c).addScaledVector(outer, s.depth * h);
      vertex(surface, point, s.shade + h * .025 + c * .012, s.weights, start%37+c*fibersAcross+.12*Math.sin(i/steps*5+c));
      if (i === steps) continue;
      const a0 = start + i * sides + j, b = start + i * sides + (j + 1) % sides;
      surface.triangles.push(a0, b, a0 + sides, b, b + sides, a0 + sides);
    }
  }
}

const crest = [
  [-1.255, 1.954], [-1.215, 1.973], [-1.125, 1.980], [-.99, 1.958],
  [-.80, 1.875], [-.63, 1.770], [-.48, 1.660], [-.405, 1.623],
];

// Cubic Hermite interpolation keeps the crest fair between its landmarks.
function crestY(x) {
  let i = 0;
  while (i < crest.length - 2 && x > crest[i + 1][0]) i++;
  const a = crest[i], b = crest[i + 1], prev = crest[Math.max(0, i - 1)];
  const next = crest[Math.min(crest.length - 1, i + 2)], span = b[0] - a[0];
  const t = clamp((x - a[0]) / span, 0, 1), t2 = t * t, t3 = t2 * t;
  const m0 = span * (b[1] - prev[1]) / (b[0] - prev[0]);
  const m1 = span * (next[1] - a[1]) / (next[0] - a[0]);
  return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * m1;
}

function maneWeights(u) {
  const atNeck = smooth(.01, .34, u), atHead = smooth(.65, .96, u);
  return [1 - atNeck, atNeck - atHead, atHead, 0];
}

const partings = [0, .059, .143, .198, .272, .357, .416, .487, .562, .629, .714, .772, .857, .928, 1];

function maneGuide(u) {
  let nearest = 0;
  for (const part of partings) if (Math.abs(part - u) < Math.abs(nearest - u)) nearest = part;
  return nearest;
}

function maneSweep(u) {
  return (.155 + .029 * Math.sin(23 * u + .7) + .022 * Math.sin(47 * u)) *
    (.57 + .43 * smooth(0, .19, u));
}

function manePoint(u, t, side, length, lean, lift, wave) {
  const atEnd = .43 + .57 * Math.pow(Math.sin(Math.PI * u), .40);
  const width = (.149 - .015 * u - .031 * u * u) * (.64 + .36 * atEnd);
  const root = -.473 - .745 * u;
  const sweep = lean * t * (.44 + .56 * t) + wave * Math.sin(t * 4.3) * t;
  const x = root + sweep;
  const crown = (.018 + .013 * Math.sin(Math.PI * t * 1.7)) * (1 - t);
  const y = crestY(root + sweep * .59) + crown + lift * (1 - t * .77) - length * atEnd * Math.pow(t, 1.30);
  const spread = Math.sin(t * Math.PI * .46);
  const z = side * ((width + lift * .82) * spread + .014 * Math.sin(Math.PI * t) + .0025);
  return v(x, y, z);
}

function maneLength(u) {
  return .180 + .026 * Math.sin(u * 19 + .2) + .017 * Math.sin(u * 40.1);
}

// Fit the groom to the finished sculpture. A small, varying clearance keeps
// the crest full while the ends of individual locks settle against the skin.
function settleOnSkin(p, distance, clearance) {
  if (!distance) return;
  const e = .0015;
  for (let i = 0; i < 2; i++) {
    const { x, y, z } = p;
    const error = distance(x, y, z) - clearance;
    if (Math.abs(error) < .0006) break;
    const nx = (distance(x + e, y, z) - distance(x - e, y, z)) / (2 * e);
    const ny = (distance(x, y + e, z) - distance(x, y - e, z)) / (2 * e);
    const nz = (distance(x, y, z + e) - distance(x, y, z - e)) / (2 * e);
    const step = error / Math.max(.04, nx * nx + ny * ny + nz * nz);
    p.set(x - nx * step, y - ny * step, z - nz * step);
  }
}

function addMane(surface, rng, distance) {
  const rows = 104, cross = 18;
  // A continuous dark undercoat prevents light leaking through the ridge.
  for (let i = 0; i <= rows; i++) {
    const u = i / rows, weights = maneWeights(u);
    for (let j = 0; j <= cross; j++) {
      const f = 2 * j / cross - 1, side = f < 0 ? -1 : 1, t = Math.abs(f);
      const length = maneLength(u) * (side < 0 ? .40 : .74);
      const p = manePoint(u, t, side, length, maneSweep(u) * (side < 0 ? .39 : .78), -.003, 0);
      if (j === cross / 2) p.z = 0;
      settleOnSkin(p, distance, .014 * (1 - t) * (1 - t) + .002 - .003 * smooth(.74, 1, t));
      vertex(surface, p, .24 + .048 * Math.sin(u * 137 + t * 1.9) + .13 * t, weights);
      if (i === rows || j === cross) continue;
      const a = i * (cross + 1) + j, n = a + cross + 1;
      surface.triangles.push(a, n, a + 1, a + 1, n, n + 1);
    }
  }

  for (const [count, side, fine] of [[112, 1, false], [43, -1, false], [62, 1, true], [18, -1, true]]) {
    for (let i = 0; i < count; i++) {
      const u = (i + .08 + .84 * rng()) / count, phase = rng() * tau, guide = maneGuide(u);
      const len = maneLength(guide) * (.84 + .36 * rng()) * (side < 0 ? .58 : 1);
      const lean = (maneSweep(guide) + .033 * (rng() - .5)) * (side < 0 ? .58 : 1);
      const lift = .004 + .011 * rng() + (fine ? .004 : 0);
      const curl = .025 * Math.sin(37 * guide + .4) + (rng() - .5) * .018;
      const w = fine ? .0015 + .0018 * rng() : .0057 + .0064 * rng();
      const d = fine ? .00085 : .0019 + .0020 * rng();
      const tone = .25 + .29 * rng() + (fine && rng() > .70 ? .18 : 0);
      const weights = maneWeights(u);
      addLock(surface, 13, fine ? 4 : 6, t => {
        const part = u + (guide - u) * .70 * smooth(.19, .96, t);
        const p = manePoint(part, t, side, len, lean, lift, curl);
        p.z += side * (.0015 + .004 * Math.sin(Math.PI * t + phase) * t);
        const clearance = .016 * (1 - t) * (1 - t) + lift * (.87 - .38 * t) + .003 +
          .005 * Math.sin(Math.PI * t) * (.5 + .5 * Math.cos(54 * guide));
        settleOnSkin(p, distance, clearance);
        const normal = v(.24 * (1 - t), .95 * (1 - t), side * (.1 + t)).normalize();
        const taper = Math.max(.018, (1 - Math.pow(t, 1.8)) * (.72 + .30 * Math.sin(t * Math.PI)));
        return { p, normal, weights, width: w * taper, depth: d * taper, shade: tone + .07 * t };
      });
    }
  }
}

const browPath = new THREE.CatmullRomCurve3([
  v(-1.183, 1.969, 0), v(-1.219, 1.998, 0), v(-1.266, 1.993, 0),
  v(-1.311, 1.967, 0), v(-1.356, 1.918, 0), v(-1.402, 1.864, 0),
  v(-1.430, 1.824, 0),
]);

function forelockPoint(s, t, lift, curl) {
  const p = browPath.getPoint(clamp(t, 0, 1));
  const wave = Math.sin(Math.PI * t);
  p.x += .018 * s * s * wave - lift * (.4 + .6 * t);
  p.y += lift * (1 - t * .76) - .009 * s * s;
  p.z = s * (.044 + .022 * wave - .021 * t * t) + .046 * Math.sin(Math.PI * .82 * t) + curl * t * t;
  return p;
}

function addForelock(surface, rng, distance) {
  const rows = 24, cols = 22;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    for (let j = 0; j <= cols; j++) {
      const s = j / cols * 2 - 1;
      const end = .74 - .16 * s * s + .053 * Math.sin(s * 7);
      const p = forelockPoint(s, t * end, -.001, .008);
      settleOnSkin(p, distance, .002 + .011 * (1 - t) * (1 - s * s));
      vertex(surface, p, .22 + .10 * t + .036 * Math.sin(s * 47));
      if (i === rows || j === cols) continue;
      const a = i * (cols + 1) + j, n = a + cols + 1;
      surface.triangles.push(a, n, a + 1, a + 1, n, n + 1);
    }
  }
  for (let i = 0; i < 73; i++) {
    const fine = i > 45, s = rng() * 2 - 1;
    const end = clamp(.79 + .10 * s - .15 * s * s + .085 * Math.sin(s * 7) + .17 * (rng() - .5), .49, .96);
    const lift = .003 + rng() * .009, curl = (rng() - .28) * .060;
    const w = fine ? .0011 + rng() * .0011 : .0029 + rng() * .0027;
    const tone = .24 + .32 * rng();
    addLock(surface, 12, fine ? 4 : 6, t => {
      const p = forelockPoint(s, t * end, lift, curl), taper = Math.max(.015, 1 - Math.pow(t, 1.45));
      settleOnSkin(p, distance, .002 + lift * (.42 + .58 * Math.sin(Math.PI * t)) + .014 * (1 - t) * (1 - s * s));
      const normal = v(-.24 - .71 * t, 1 - .43 * t, s * .16).normalize();
      return { p, normal, width: w * taper, depth: w * .40 * taper, shade: tone + t * .075 };
    });
  }
}

const tailSpine = new THREE.CatmullRomCurve3([
  v(.835, 1.47, 0), v(.986, 1.394, -.004), v(1.063, 1.226, .004),
  v(1.057, 1.034, .017), v(1.096, .843, .022), v(1.179, .638, .008),
  v(1.190, .448, -.014), v(1.105, .273, -.023),
]);

function tailCenter(t) {
  const fraction = clamp(t, 0, 1), p = tailSpine.getPoint(fraction);
  if (t !== fraction) p.addScaledVector(tailSpine.getTangent(fraction), (t - fraction) * 1.30);
  return p;
}

function tailWeights(t) {
  const a = smooth(.10, .31, t), b = smooth(.335, .56, t), c = smooth(.58, .835, t);
  return [1 - a, a - b, b - c, c];
}

function tailSection(t, angle, layer) {
  const p = tailCenter(t);
  const tangent = tailCenter(t + .0005).sub(tailCenter(t - .0005)).normalize();
  const xAxis = v(0, 0, 1).cross(tangent).normalize();
  const zAxis = v(0, 0, 0).crossVectors(tangent, xAxis).normalize();
  const a = Math.cos(angle), b = Math.sin(angle);
  const radii = (.052 + .049 * (1 - Math.exp(-9 * t)) + .020 * Math.sin(Math.PI * t))
    * (1 - .62 * smooth(.61, 1.045, t));
  const groove = 1 + .039 * Math.sin(7 * angle + t * 4.2) + .028 * Math.cos(11 * angle - 2.5 * t);
  const radius = radii * groove * layer;
  p.addScaledVector(xAxis, a * radius * (.93 + .085 * t));
  p.addScaledVector(zAxis, b * radius * (1 + .22 * t));
  const normal = xAxis.multiplyScalar(a).addScaledVector(zAxis, b).normalize();
  return { p, normal, weights: tailWeights(t) };
}

function addTail(surface, rng) {
  const rows = 44, sides = 52;
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j < sides; j++) {
      const angle = tau * j / sides;
      const t = (i / rows) * (.885 + .038 * Math.sin(5 * angle) + .031 * Math.cos(3 * angle));
      const s = tailSection(t, angle + .085 * Math.sin(t * 8 + angle), .84 * Math.max(.018, 1 - smooth(.75, .930, t)));
      vertex(surface, s.p, .17 + .14 * t + .06 * Math.cos(11 * angle + 3 * t), s.weights);
      if (i === rows) continue;
      const a = i * sides + j, b = i * sides + (j + 1) % sides;
      surface.triangles.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }

  for (const [count, fine] of [[117, false], [104, true]]) {
    for (let i = 0; i < count; i++) {
      const a = tau * ((i + rng() * .85) / count), phase = rng() * tau;
      const begin = rng() * .042;
      const end = clamp(.891 + .061 * Math.sin(3 * a + 1) + .040 * Math.cos(6 * a) + .135 * (rng() - .42), .75, 1.029);
      const lightFiber = rng() > (fine ? .72 : .92);
      const layer = (fine ? .98 : .83) + .24 * rng() + (lightFiber ? .06 : 0), twist = (rng() - .5) * .71;
      const w = fine ? .0016 + .0026 * rng() : .0058 + .0080 * rng();
      const d = w * (.26 + .13 * rng()), shade = .20 + .33 * rng();
      const glint = lightFiber ? .19 + .12 * rng() : 0;
      const part = Math.round(a / (tau / 9)) * (tau / 9);
      addLock(surface, fine ? 16 : 21, fine ? 4 : 6, u => {
        const t = begin + (end - begin) * u;
        const angle = a + twist * u + .10 * Math.sin(t * 7.2 + phase) + .10 * Math.sin(5 * t + a * 3) +
          (part - a) * .65 * smooth(.55, .97, u);
        const s = tailSection(t, angle, layer + .043 * Math.sin(t * 12 + phase));
        const loose = smooth(.39, 1, u);
        s.p.x += (.032 * Math.sin(part * 2 + 9 * u) + .025 * Math.sin(phase + 8 * u)) * loose;
        s.p.z += (.034 * Math.cos(part * 3 + 7 * u) + .017 * Math.cos(phase + 6 * u)) * loose;
        const taper = Math.max(.012, (.78 + .22 * Math.sin(u * Math.PI)) * (1 - smooth(.77, 1, u)));
        const highlight = glint * (.59 + .41 * Math.sin(3.3 * t + phase) ** 2);
        return { ...s, width: w * taper, depth: d * taper, shade: shade + .110 * t + highlight };
      });
    }
  }
}

function makeTailBones(body) {
  let parent = body;
  return [0, .23, .47, .70].map((t, i) => {
    const bone = new THREE.Bone();
    bone.name = `Tail section ${i + 1}`;
    bone.position.copy(parent.worldToLocal(tailCenter(t)));
    parent.add(bone);
    bone.updateWorldMatrix(true, false);
    parent = bone;
    return bone;
  });
}

function addSurface(surface, parent, bones, material, name) {
  parent.updateWorldMatrix(true, false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
  geometry.setAttribute('fiber',new THREE.Float32BufferAttribute(surface.fibers,1));
  geometry.setIndex(surface.triangles);
  geometry.applyMatrix4(parent.matrixWorld.clone().invert());
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const colors = new THREE.BufferAttribute(new Float32Array(surface.shades.length * 3), 3);
  geometry.setAttribute('color', colors);
  let mesh;
  if (bones) {
    const boneIndex = new Uint8Array(surface.shades.length * 4);
    const last = Math.min(3, bones.length - 1);
    for (let i = 0; i < boneIndex.length; i += 4) {
      boneIndex[i + 1] = 1;
      boneIndex[i + 2] = 2;
      boneIndex[i + 3] = last;
    }
    geometry.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(boneIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(surface.weights, 4));
    mesh = new THREE.SkinnedMesh(geometry, material);
    parent.add(mesh);
    mesh.updateWorldMatrix(true, false);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.frustumCulled = false;
  } else {
    mesh = new THREE.Mesh(geometry, material);
    parent.add(mesh);
  }
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { shades: Float32Array.from(surface.shades), colors };
}

export function createGroom({ body, neck, head, distance }) {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: .49, metalness: 0,
    specularIntensity: .37, sheen: .23, sheenRoughness: .58,
  });
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float fiber; varying float fiberCoord;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nfiberCoord=fiber;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float fiberCoord;')
      .replace('#include <color_fragment>',
        '#include <color_fragment>\nfloat hairDetail=1.0-smoothstep(.14,.60,fwidth(fiberCoord));\n'+
        'diffuseColor.rgb*=1.0+hairDetail*(.16*sin(fiberCoord*6.283)+.09*sin(fiberCoord*13.07+.7));');
  };
  body.updateWorldMatrix(true, true);
  const tailBones = makeTailBones(body);
  const rng = seededRandom(0x57bc772e);
  const batches = [
    [addMane, body, [body, neck, head], 'Mane'],
    [addForelock, head, null, 'Forelock'],
    [addTail, body, tailBones, 'Tail hair'],
  ].map(([build, parent, bones, name]) => {
    const surface = newSurface();
    build(surface, rng, distance);
    return addSurface(surface, parent, bones, material, name);
  });

  let coat;
  function setCoat(id) {
    if (coat === id) return;
    coat = Object.hasOwn(palettes, id) ? id : 'bay';
    const [shadow, middle, light, sheen] = palettes[coat].map(c => new THREE.Color(c));
    const color = new THREE.Color();
    for (const { shades, colors } of batches) {
      for (let i = 0; i < shades.length; i++) {
        const s = shades[i];
        if (s < .51) color.lerpColors(shadow, middle, s / .51);
        else color.lerpColors(middle, light, (s - .51) / .49);
        colors.setXYZ(i, color.r, color.g, color.b);
      }
      colors.needsUpdate = true;
    }
    material.sheenColor.copy(sheen);
  }

  let lastTime, energy = 0, phase = 0;
  function update(time, mode = 'idle') {
    const dt = lastTime === undefined ? 0 : clamp(time - lastTime, 0, .10);
    lastTime = time;
    const target = mode === 'trot' ? 1 : mode === 'walk' ? .48 : 0;
    energy = THREE.MathUtils.damp(energy, target, 4.5, dt);
    phase += dt * (1.25 + energy * 5.1);
    const swishCycle = .5 + .5 * Math.sin(time * .81 + .8 * Math.sin(.22 * time));
    const swish = Math.pow(swishCycle, 13) * (1 - .67 * energy);
    tailBones.forEach((b, i) => {
      const lag = .48 * i;
      b.rotation.x = (.018 + .014 * i + .041 * energy) * Math.sin(phase - lag) +
        (.061 + .012 * i) * swish * Math.sin(2.6 * time - lag);
      b.rotation.z = (.005 + .006 * i + .024 * energy) * Math.sin(phase * 1.9 - lag) + energy * .023;
    });
  }

  setCoat('bay');
  return { update, setCoat };
}
