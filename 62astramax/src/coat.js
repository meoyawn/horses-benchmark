import * as THREE from 'three';
import { faceAxis, faceUp, headOrigin } from './anatomy.js';

const palettes = {
  bay: {
    body: '#743522', sun: '#ae6038', seal: '#371c1a',
    points: '#171516', muzzle: '#392f2d', sheen: '#9c7057', shading: 1,
  },
  chestnut: {
    body: '#a45132', sun: '#c97a45', seal: '#713824',
    points: '#75412f', muzzle: '#624b42', sheen: '#bc8869', shading: 0.65,
  },
  grey: {
    body: '#a6a6a3', sun: '#cbc9c1', seal: '#686c70',
    points: '#424346', muzzle: '#3f4041', sheen: '#b4b4ad', shading: 0.59,
  },
};

function repeatingVolume(samples, size, format) {
  const texture = new THREE.Data3DTexture(samples, size, size, size);
  texture.format = format;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// A small periodic volume supplies pigment and hair grain. Sampling in three
// dimensions keeps the coat continuous around the cheeks, elbows and hocks.
function pigmentVolume() {
  const size = 48;
  const samples = new Uint8Array(size ** 3 * 4);
  let state = 9173461;
  for (let i = 0; i < samples.length; i++) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    samples[i] = state >>> 24;
  }
  return repeatingVolume(samples, size, THREE.RGBAFormat);
}

const dappleTileWidth = 0.72; // metres

function greyDappleVolume() {
  const size = 112, cells = 10, cellWidth = size / cells;
  const samples = new Uint8Array(size ** 3 * 2);
  let seed = 1222853;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const centreInCell = cell => (cell + 0.5 + (random() - 0.5) * 0.69) * cellWidth;
  const wrap = i => (i + size) % size;

  // Each ellipsoid deposits one isolated group of pale hairs. A slice through
  // its flank naturally shows a smaller, dimmer dapple than a central slice.
  const spots = Array.from({ length: cells ** 3 }, (_, cell) => {
    const cx = centreInCell(cell % cells);
    const cy = centreInCell(Math.floor(cell / cells) % cells);
    const cz = centreInCell(Math.floor(cell / (cells * cells)));
    const radius = (0.022 + 0.013 * random()) * size / dappleTileWidth;
    const rx = radius * (0.89 + 0.23 * random());
    const ry = radius * (0.90 + 0.22 * random());
    const rz = radius * (0.91 + 0.23 * random());
    const intensity = 0.77 + 0.23 * random(), rank = random();
    return {cx, cy, cz, rx, ry, rz, intensity, rank, reach: Math.max(rx, ry, rz), scale: 1};
  });
  const separation = (a, b) => Math.min(Math.abs(a - b), size - Math.abs(a - b));
  // Leave space between neighbors, including across each boundary of the tile.
  for (let i = 0; i < spots.length; i++) {
    const a = spots[i];
    for (let j = 0; j < i; j++) {
      const b = spots[j], reach = a.reach + b.reach;
      const dx = separation(a.cx, b.cx);
      if (dx >= reach) continue;
      const dy = separation(a.cy, b.cy), dz = separation(a.cz, b.cz);
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      if (distanceSquared >= reach * reach) continue;
      const scale = Math.sqrt(distanceSquared) / reach;
      a.scale = Math.min(a.scale, scale);
      b.scale = Math.min(b.scale, scale);
    }
  }
  for (const spot of spots) {
    const {cx, cy, cz, intensity, rank, scale} = spot;
    const rx = spot.rx * scale, ry = spot.ry * scale, rz = spot.rz * scale;
    for (let z = Math.floor(cz - rz); z <= cz + rz; z++) {
      const dz = (z - cz) / rz, layer = wrap(z) * size * size;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
        const dy = (y - cy) / ry, row = layer + wrap(y) * size;
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const dx = (x - cx) / rx, core = 1 - dx * dx - dy * dy - dz * dz;
          if (core <= 0) continue;
          const strength = Math.round(255 * intensity * core * core * (3 - 2 * core));
          const index = 2 * (row + wrap(x));
          if (strength <= samples[index]) continue;
          samples[index] = strength;
          // Premultiplying keeps the seed's density rank stable through filtering.
          samples[index + 1] = Math.round(strength * rank);
        }
      }
    }
  }
  return repeatingVolume(samples, size, THREE.RGFormat);
}

const fragmentDefinitions = /* glsl */ `
  varying vec3 coatRest;
  varying vec3 coatRestNormal;
  uniform highp sampler3D pigmentField, dappleField;
  uniform vec3 coatBody, coatSun, coatSeal, coatPoints, coatMuzzle, coatIvory;
  uniform float greyCoat, sealStrength;

  vec4 coatNoise(vec3 cell) {
    return texture(pigmentField, (cell + 0.5) / 48.0);
  }

  // A broad, soft patch of pigment follows the direction of a muscle or bone.
  float pigmentWash(vec2 point, vec2 centre, vec2 axis, vec2 radius) {
    vec2 d = point - centre;
    vec2 uv = vec2(dot(d, axis), dot(d, vec2(-axis.y, axis.x))) / radius;
    return exp(-dot(uv, uv));
  }

  float faceMark(float z, float facing, vec2 face, float grain) {
    float along = face.x;
    float front = smoothstep(0.012, 0.051, face.y) * smoothstep(0.07, 0.50, facing);
    float axis = 0.017 + 0.006 * sin(39.0 * along) + 0.005 * smoothstep(0.12, 0.34, along);
    float star = (along - 0.137) / 0.068;
    float oval = 0.047 * sqrt(max(0.0, 1.0 - star * star));
    float stripe = 0.013 * smoothstep(0.13, 0.18, along) * (1.0 - smoothstep(0.25, 0.40, along));
    float width = max(oval, stripe) * (1.0 + 0.11 * sin(112.0 * along + 1.6));
    float side = abs(z - axis) + 0.0037 * grain;
    float feather = max(fwidth(side), 0.0020);
    float edge = 1.0 - smoothstep(width - feather, width + feather, side);
    return front * edge * smoothstep(0.064, 0.075, along) * (1.0 - smoothstep(0.36, 0.407, along));
  }

  vec3 horsePigment(vec3 p, vec3 n, out float hairGrain, out float velvet, out float skinRelief) {
    vec3 grain = coatNoise(p * 5.6 + vec3(7.0, 14.0, 2.0)).rgb;
    float lock = coatNoise(p * 21.0 + 1.3 * grain).g;
    float leg = 1.0 - smoothstep(0.76, 1.16, p.y);
    float head = smoothstep(1.12, 1.39, -p.x);
    float flowAngle = mix(-0.15, -1.46, leg);
    flowAngle = mix(flowAngle, -0.75, smoothstep(0.35, 1.10, -p.x) * (1.0 - leg));
    flowAngle = mix(flowAngle, 0.80, head);
    flowAngle += 0.14 * (grain.r - 0.5);
    vec2 growth = vec2(cos(flowAngle), sin(flowAngle));
    vec2 hairPosition = p.xy - mix(vec2(0.0, 1.27), vec2(-1.24, 1.82), head);
    vec3 nap = vec3(dot(hairPosition, growth), dot(hairPosition, vec2(-growth.y, growth.x)), p.z);
    float hairLock = coatNoise(nap * vec3(17.0, 66.0, 70.0) + grain).g;
    float underhair = coatNoise(nap * vec3(34.0, 152.0, 144.0)).b;
    float guardhair = coatNoise(nap * vec3(77.0, 470.0, 438.0)).a;
    hairGrain = 0.33 * hairLock + 0.42 * underhair + 0.25 * guardhair - 0.5;

    float side = smoothstep(0.16, 0.80, abs(n.z));
    float barrel = pigmentWash(p.xy, vec2(-0.09, 1.26), vec2(0.995, 0.10), vec2(0.48, 0.23));
    float shoulder = pigmentWash(p.xy, vec2(-0.57, 1.29), vec2(0.47, 0.88), vec2(0.25, 0.10));
    float haunch = pigmentWash(p.xy, vec2(0.68, 1.37), vec2(0.47, 0.88), vec2(0.27, 0.15));
    float neck = smoothstep(0.39, 0.85, -p.x) * (1.0 - head) * smoothstep(1.18, 1.61, p.y);
    float topline = smoothstep(1.31, 1.57, p.y) * smoothstep(0.10, 0.83, n.y);
    float crest = smoothstep(-0.22, -0.02, p.y - (1.66 - 0.59 * (p.x + 0.48)));
    float warm = 0.045 + side * (0.42 * barrel + 0.22 * shoulder + 0.34 * haunch);
    warm += 0.30 * (grain.g - 0.5);
    vec3 colour = mix(coatBody, coatSun, clamp(warm, 0.0, 1.0));
    float shade = 0.10 + 0.23 * topline + neck * (0.31 + 0.34 * crest);
    shade += 0.24 * smoothstep(0.06, 0.88, -n.y) + 0.19 * (0.5 - grain.b);
    colour = mix(colour, coatSeal, clamp(sealStrength * shade, 0.0, 0.86));

    float dappleArea = smoothstep(0.72, 1.05, p.y) * (1.0 - head);
    if (greyCoat > 0.5) {
      vec3 dapplePosition = vec3(dot(p, vec3(0.859, 0.290, 0.422)),
        dot(p, vec3(-0.320, 0.947, 0.0)), dot(p, vec3(-0.400, -0.135, 0.906)));
      vec2 spot = texture(dappleField, (dapplePosition + 0.009 * grain) / ${dappleTileWidth} + 0.31).rg;
      float quarters = pigmentWash(p.xy, vec2(0.66, 1.34), vec2(0.43, 0.90), vec2(0.35, 0.27));
      float forehand = pigmentWash(p.xy, vec2(-0.55, 1.33), vec2(0.43, 0.90), vec2(0.32, 0.26));
      float region = clamp(0.24 + 0.22 * barrel + 0.75 * quarters + 0.65 * forehand, 0.0, 1.0);
      region *= (0.40 + 0.60 * smoothstep(0.94, 1.22, p.y)) * (1.0 - 0.70 * neck) * (0.75 + 0.25 * side);
      float rank = spot.g / max(spot.r, 0.008);
      float density = 0.31 + 0.62 * region;
      float paleHairs = spot.r * (1.0 - smoothstep(density - 0.10, density + 0.08, rank));
      colour *= 1.0 + dappleArea * region * (0.68 * paleHairs - 0.085);
    } else {
      float pigmentCloud = coatNoise(p * vec3(11.0, 14.0, 12.0) + 1.7 * grain).r;
      float centre = smoothstep(0.46, 0.75, pigmentCloud);
      float border = 1.0 - smoothstep(0.015, 0.13, abs(pigmentCloud - 0.44));
      colour *= 1.0 + (centre * 0.22 - border * 0.14) * dappleArea * 0.38;
    }
    colour *= 1.0 + 0.10 * (lock - 0.5) + 0.29 * hairGrain;

    float hock = 0.82 + 0.056 * n.x + 0.074 * (grain.g - 0.5);
    float darkLeg = 1.0 - smoothstep(0.44, hock + 0.08, p.y);
    colour = mix(colour, coatPoints * (1.0 + 0.22 * hairGrain), darkLeg);

    vec2 fromPoll = p.xy - vec2(${headOrigin.join(', ')});
    vec2 faceAxis = vec2(${faceAxis.join(', ')}), faceUp = vec2(${faceUp.join(', ')});
    vec2 face = vec2(dot(fromPoll, faceAxis), dot(fromPoll, faceUp));
    float eye = pigmentWash(face, vec2(0.105, 0.025), vec2(0.85, -0.527), vec2(0.071, 0.047));
    float cheek = pigmentWash(face, vec2(0.145, -0.078), vec2(0.95, 0.312), vec2(0.11, 0.054));
    float bridge = pigmentWash(face, vec2(0.245, 0.022), vec2(0.998, -0.06), vec2(0.102, 0.035));
    colour = mix(colour, coatSun, side * (0.16 * cheek + 0.12 * bridge));
    colour = mix(colour, coatMuzzle * 0.78, 0.77 * side * eye);

    float jaw = 1.0 - smoothstep(-0.032, 0.062, face.y);
    velvet = head * smoothstep(0.34, 0.53, face.x + 0.038 * jaw + 0.022 * (grain.b - 0.5));
    float nostril = pigmentWash(face, vec2(0.514, 0.034), vec2(0.98, -0.20), vec2(0.064, 0.029));
    float lip = pigmentWash(face, vec2(0.533, -0.029), vec2(0.998, 0.06), vec2(0.097, 0.026));
    vec3 softNose = coatMuzzle * (0.87 + 0.24 * lock + 0.12 * hairLock);
    softNose *= mix(vec3(1.0), vec3(1.22, 1.07, 1.035), lip * side * (1.0 - greyCoat));
    colour = mix(colour, softNose * (1.0 - 0.25 * nostril * side), velvet);
    float follicles = smoothstep(0.67, 0.84, coatNoise(p * 211.0 + grain).r) * velvet * side;
    colour *= 1.0 - 0.16 * follicles;
    // Shallow vessels under the fine skin of the cheek and nose catch light
    // as the head turns. Their height tapers away at both ends.
    float cheekPath = -0.062 + 0.13 * (face.x - 0.12) + 0.009 * sin(38.0 * face.x + 1.0);
    float branchPath = cheekPath - 0.25 * (face.x - 0.255) + 0.004*sin(53.0*face.x);
    float cheekOffset=(face.y-cheekPath)/0.0046, branchOffset=(face.y-branchPath)/0.0028;
    float vessel = exp(-cheekOffset*cheekOffset)
      * smoothstep(0.105,0.16,face.x) * (1.0-smoothstep(0.39,0.48,face.x));
    float branch = exp(-branchOffset*branchOffset)
      * smoothstep(0.242,0.29,face.x) * (1.0-smoothstep(0.34,0.40,face.x));
    skinRelief = head * side * (0.00145 * vessel + 0.00082 * branch) - 0.0001 * follicles;

    float sockLine = 0.267 - 0.030 * n.x + 0.021 * n.z
      + 0.035 * (grain.r - 0.5) + 0.017 * (lock - 0.5);
    float sock = smoothstep(0.20, 0.36, p.x) * smoothstep(0.045, 0.09, p.z)
      * (1.0 - smoothstep(sockLine - 0.005, sockLine + 0.007, p.y));
    float coronetLine = 0.128 + 0.012 * n.x + 0.012 * (lock - 0.5);
    float coronet = smoothstep(0.25, 0.42, -p.x) * smoothstep(0.045, 0.09, -p.z)
      * (1.0 - smoothstep(coronetLine - 0.004, coronetLine + 0.006, p.y));
    vec3 ivory = coatIvory * (0.94 + 0.10 * lock + 0.08 * hairGrain);
    vec3 dusty = ivory * mix(vec3(0.72, 0.64, 0.55), vec3(1.0), smoothstep(0.085, 0.24, p.y));
    colour = mix(colour, dusty, max(sock, coronet));
    return mix(colour, ivory, faceMark(p.z, dot(n.xy, faceUp), face, underhair - 0.5));
  }
`;

export function createCoat() {
  const uniforms = {
    pigmentField: { value: pigmentVolume() },
    dappleField: { value: null },
    greyCoat: { value: 0 },
    sealStrength: { value: 1 },
    coatBody: { value: new THREE.Color() },
    coatSun: { value: new THREE.Color() },
    coatSeal: { value: new THREE.Color() },
    coatPoints: { value: new THREE.Color() },
    coatMuzzle: { value: new THREE.Color() },
    coatIvory: { value: new THREE.Color('#e4d9c8') },
  };
  const material = new THREE.MeshPhysicalMaterial({
    name: 'Short equine coat',
    roughness: 0.47,
    metalness: 0,
    specularIntensity: 0.64,
    sheen: 0.19,
    sheenRoughness: 0.57,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 coatRest;\nvarying vec3 coatRestNormal;',
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ncoatRest = position;\ncoatRestNormal = normal;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' + fragmentDefinitions,
    ).replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float hairGrain;
       float velvet;
       float skinRelief;
       diffuseColor.rgb *= horsePigment(coatRest, normalize(coatRestNormal), hairGrain, velvet, skinRelief);`,
    ).replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       roughnessFactor += 0.17 * hairGrain + 0.20 * velvet + 0.105 * (1.0 - smoothstep(0.45, 1.04, coatRest.y));`,
    ).replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
       vec3 coatDx = dFdx(-vViewPosition);
       vec3 coatDy = dFdy(-vViewPosition);
       vec3 coatU = cross(coatDy, normal);
       vec3 coatV = cross(normal, coatDx);
       float coatArea = dot(coatDx, coatU);
       float strandHeight = 0.00026 * hairGrain * (1.0 - 0.67 * velvet) + skinRelief;
       vec3 napSlope = (coatU * dFdx(strandHeight) + coatV * dFdy(strandHeight))
         * sign(coatArea) / max(abs(coatArea), 1e-10);
       normal = normalize(normal - napSlope * min(1.0, 0.17 / max(length(napSlope), 1e-7)));`,
    );
  };
  material.addEventListener('dispose', () => {
    uniforms.pigmentField.value.dispose();
    uniforms.dappleField.value?.dispose();
  });
  function setCoat(id) {
    const palette = palettes[id] ?? palettes.bay;
    uniforms.coatBody.value.set(palette.body);
    uniforms.coatSun.value.set(palette.sun);
    uniforms.coatSeal.value.set(palette.seal);
    uniforms.coatPoints.value.set(palette.points);
    uniforms.coatMuzzle.value.set(palette.muzzle);
    uniforms.greyCoat.value = Number(id === 'grey');
    if (id === 'grey') uniforms.dappleField.value ??= greyDappleVolume();
    uniforms.sealStrength.value = palette.shading;
    material.sheenColor.set(palette.sheen);
  }
  setCoat('bay');
  return { material, setCoat };
}
