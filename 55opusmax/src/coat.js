// Procedural coat shading: base colours, countershading, dark points, dapples, pinto/appaloosa
// patterns, white face & leg markings, muzzle skin and hoof horn — all evaluated per pixel
// from the rest-pose position, plus hair-flow micro normals and baked AO.
import * as THREE from 'three';

const srgb = (hex) => new THREE.Color(hex); // THREE.Color converts hex (sRGB) to linear working space

export const COATS = {
  bay: {
    short: 'Bay', label: 'Bay', base: '#5f2b13', belly: '#7a3b1b', top: '#47200d', points: '#0e0a08', pointsAmt: 1,
    skin: '#231d1b', mane: '#120d0a', tail: '#0f0b09', dapple: 0.18, hoof: '#2b2523',
  },
  chestnut: {
    short: 'Chestnut', label: 'Chestnut', base: '#93461b', belly: '#ad5d2c', top: '#7c3914', points: '#6a2e10', pointsAmt: 0.25,
    skin: '#2a211e', mane: '#7c3410', tail: '#6e2e0f', dapple: 0.08, hoof: '#3a302b',
  },
  black: {
    short: 'Black', label: 'Black', base: '#141110', belly: '#1d1814', top: '#0f0d0c', points: '#0b0909', pointsAmt: 0.5,
    skin: '#1a1615', mane: '#0b0908', tail: '#0b0908', dapple: 0.0, hoof: '#211d1c',
  },
  grey: {
    short: 'Grey', label: 'Dapple grey', base: '#b4b2ae', belly: '#cfccc7', top: '#9a9895', points: '#45423f', pointsAmt: 0.8,
    skin: '#252221', mane: '#dcd7d0', tail: '#d2cbc2', dapple: 1.0, dappleDark: '#77746f', hoof: '#2d2928', darkHead: 0.4,
  },
  palomino: {
    short: 'Palomino', label: 'Palomino', base: '#d4a257', belly: '#e1bb7a', top: '#c08c42', points: '#c9954c', pointsAmt: 0.1,
    skin: '#3b302c', mane: '#f0e3c8', tail: '#ece0c6', dapple: 0.2, hoof: '#4a3f37',
  },
  buckskin: {
    short: 'Buckskin', label: 'Buckskin', base: '#c39a5f', belly: '#d5b07a', top: '#a87f47', points: '#110c0a', pointsAmt: 1,
    skin: '#231d1b', mane: '#110c09', tail: '#0f0b09', dapple: 0.1, hoof: '#2b2523', dorsal: 0.0,
  },
  pinto: {
    short: 'Pinto', label: 'Tobiano pinto', base: '#5d2a12', belly: '#723718', top: '#4b220e', points: '#130d0a', pointsAmt: 0.9,
    skin: '#231d1b', mane: '#1a120d', tail: '#e9e4dc', dapple: 0.0, hoof: '#2b2523', pinto: 1,
  },
  appaloosa: {
    short: 'Appaloosa', label: 'Appaloosa', base: '#4a2a1a', belly: '#5a3422', top: '#3d2216', points: '#120c09', pointsAmt: 0.9,
    skin: '#3a2f2c', mane: '#2b1e16', tail: '#2b1e16', dapple: 0.0, hoof: '#3a3330', appy: 1,
  },
};

export const FACE_MARKINGS = ['none', 'star', 'strip', 'blaze', 'bald'];

export function createCoatMaterial({ head, warp, hooves }) {
  const uniforms = {
    uBase: { value: srgb('#6e3416') },
    uBelly: { value: srgb('#8d4a22') },
    uTop: { value: srgb('#552811') },
    uPoints: { value: srgb('#0e0a08') },
    uPointsAmt: { value: 1 },
    uSkin: { value: srgb('#231d1b') },
    uHoof: { value: srgb('#2b2523') },
    uDapple: { value: 0.2 },
    uDappleDark: { value: srgb('#6a6866') },
    uDock: { value: srgb('#0f0b09') },
    uDarkHead: { value: 0 },
    uPinto: { value: 0 },
    uAppy: { value: 0 },
    uDorsal: { value: 0 },
    uFace: { value: 3 },
    uSocks: { value: new THREE.Vector4(0, 0.22, 0, 0.12) }, // FR, FL, HR, HL heights (0 = none)
    uSeed: { value: 0.37 },
    uBreath: { value: 0 },
    uHeadM: { value: new THREE.Matrix4() },
    uHoofA: { value: [] }, // per hoof: x, z, len, slope
    uHoofB: { value: [] }, // per hoof: toeH, heelH
    uHairDetail: { value: 1 },
  };
  // world(rest) -> head design coordinates (u, v, w)
  {
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...head.U), new THREE.Vector3(...head.V), new THREE.Vector3(...head.W),
    ).setPosition(...head.P);
    m.multiply(new THREE.Matrix4().makeScale(head.S, head.S, head.S));
    uniforms.uHeadM.value.copy(m).invert();
  }
  // hoof coronet geometry (in final, warped space)
  const order = ['FR', 'FL', 'HR', 'HL'];
  for (const k of order) {
    const hv = hooves[k];
    const front = k[0] === 'F';
    const sx = warp.s(hv.ground[0]);
    const len = (front ? 0.066 : 0.062) * sx;
    const slope = (1 / Math.tan(((front ? 53 : 56) * Math.PI) / 180)) * sx;
    uniforms.uHoofA.value.push(new THREE.Vector4(hv.ground[0], hv.ground[2], len, slope));
    uniforms.uHoofB.value.push(new THREE.Vector4(front ? 0.088 : 0.085, front ? 0.04 : 0.038, 0, 0));
  }

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0.55, 0.45, 0.38),
    anisotropy: 0.45,
    specularIntensity: 0.6,
  });
  mat.userData.uniforms = uniforms;

  const NOISE = /* glsl */`
    float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
    float vnoise(vec3 p) {
      vec3 i = floor(p); vec3 f = fract(p);
      vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      float a = hash13(i), b = hash13(i + vec3(1,0,0)), c = hash13(i + vec3(0,1,0)), d = hash13(i + vec3(1,1,0));
      float e = hash13(i + vec3(0,0,1)), f1 = hash13(i + vec3(1,0,1)), g = hash13(i + vec3(0,1,1)), h = hash13(i + vec3(1,1,1));
      return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
    }
    float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.07 + 13.7; a *= 0.5; } return s / 0.9375; }
    vec2 worley(vec3 p) {
      vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
      for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 o = vec3(hash13(i + g), hash13(i + g + 19.7), hash13(i + g + 47.3));
        vec3 r = g + o - f; float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
      return sqrt(vec2(d1, d2));
    }
    uniform vec3 uBase, uBelly, uTop, uPoints, uSkin, uHoof, uDappleDark, uDock;
    uniform float uPointsAmt, uDapple, uDarkHead, uPinto, uAppy, uDorsal, uFace, uSeed, uHairDetail;
    uniform vec4 uSocks;
    uniform mat4 uHeadM;
  `;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    // ---------- vertex stage: low-frequency coat pattern (evaluated once per vertex)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${NOISE}
        attribute float aAO;
        attribute vec4 aTag;
        uniform float uBreath;
        varying float vAO;
        varying vec4 vTag;
        varying vec3 vRest;
        varying vec3 vRestN;
        varying vec3 vRestT;
        varying vec3 vCoat;
        varying float vWhite0;

        void coatBase(vec3 p, vec3 n, out vec3 col, out float white) {
          vec3 sp = p + uSeed * 7.31;
          float big = fbm(sp * 2.2);
          float belly = smoothstep(0.1, -0.7, n.y) * smoothstep(1.25, 0.95, p.y);
          float topl = smoothstep(0.3, 0.95, n.y) * smoothstep(1.2, 1.5, p.y);
          col = uBase * (0.88 + 0.24 * big);
          col = mix(col, uBelly, belly * 0.75);
          col = mix(col, uTop, topl * 0.6);
          vec3 hd = (uHeadM * vec4(p, 1.0)).xyz;
          float onHead = smoothstep(-0.02, 0.08, hd.x) * step(0.55, p.x);
          float isLeg = step(p.y, 1.0) * (1.0 - smoothstep(0.86, 1.0, p.y));
          float frontLeg = step(0.35, p.x);
          float legTop = mix(0.6, 0.5, frontLeg) + 0.07 * (fbm(sp * 6.0) - 0.5);
          float pts = (1.0 - smoothstep(legTop - 0.09, legTop + 0.06, p.y)) * isLeg;
          pts = max(pts, smoothstep(2.0, 2.06, p.y) * step(1.0, p.x) * 0.9); // ear rims & tips
          pts = max(pts, smoothstep(0.42, 0.56, hd.x) * onHead * 0.55);    // darker muzzle
          col = mix(col, uPoints, clamp(pts * uPointsAmt, 0.0, 1.0));
          if (uDapple > 0.0) {
            vec2 w = worley(sp * vec3(15.0, 17.0, 16.0) + fbm(sp * 5.0) * 0.35);
            float net = smoothstep(0.38, 0.78, w.x) * (0.75 + 0.25 * fbm(sp * 30.0));
            float body = smoothstep(0.75, 1.05, p.y) * (1.0 - onHead * 0.8);
            vec3 dark = mix(col * 0.74, uDappleDark, step(0.5, uDapple));
            col = mix(col, dark, net * body * uDapple * 0.7);
          }
          col = mix(col, uDappleDark * 0.8, onHead * uDarkHead * (0.6 + 0.4 * fbm(sp * 9.0)));
          float dock = smoothstep(0.075, 0.045, abs(p.z)) * smoothstep(-0.74, -0.8, p.x) * step(0.9, p.y);
          col = mix(col, uDock, dock);
          col = mix(col, uPoints, uDorsal * smoothstep(0.03, 0.012, abs(p.z)) * step(-0.75, p.x) * step(p.x, 0.55) * smoothstep(0.6, 0.9, n.y));
          white = 0.0;
          if (uPinto > 0.0) {
            float pn = fbm(sp * vec3(1.4, 1.7, 1.2)) + 0.35 * (1.0 - smoothstep(0.4, 1.2, p.y)) - 0.12 * onHead - 0.08 * smoothstep(0.6, 1.0, p.x);
            pn += 0.06 * fbm(sp * 9.0);
            white = max(white, smoothstep(0.585, 0.61, pn));
          }
          if (uAppy > 0.0) {
            float blanket = smoothstep(0.22, -0.25, p.x + 0.25 * (fbm(sp * 3.0) - 0.5)) * smoothstep(0.95, 1.3, p.y + 0.2 * n.y);
            vec2 w = worley(sp * 13.0);
            float spots = smoothstep(0.42, 0.34, w.x + 0.15 * fbm(sp * 20.0));
            white = max(white, blanket * (1.0 - spots));
          }
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = position; vRestN = normal; vRestT = tangent.xyz; vAO = aAO; vTag = aTag;
        coatBase(position, normal, vCoat, vWhite0);
        // breathing: the barrel swells along its normal
        float barrel = aTag.w * smoothstep(1.32, 0.95, position.y + 0.15 * normal.y);
        transformed += normal * uBreath * barrel * 0.012;`);

    // ---------- fragment stage: crisp markings, skin, hoof horn, hair micro-normals, AO
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${NOISE}
        varying float vAO;
        varying vec4 vTag;
        varying vec3 vRest;
        varying vec3 vRestN;
        varying vec3 vRestT;
        varying vec3 vCoat;
        varying float vWhite0;
        uniform vec4 uHoofA[4];
        uniform vec4 uHoofB[4];

        vec3 coatColor(vec3 p, vec4 tag, out float rough, out float white, out float hoofMask) {
          vec3 sp = p + uSeed * 7.31;
          vec3 col = vCoat;
          white = vWhite0;
          vec3 hd = (uHeadM * vec4(p, 1.0)).xyz;
          float onHead = step(0.04, hd.x) * step(0.55, p.x);
          float isLeg = step(p.y, 0.98);
          // face markings (in head space)
          if (uFace > 0.5 && onHead > 0.5) {
            float front = smoothstep(-0.07, -0.035, hd.y);
            float wob = 0.012 * (vnoise(vec3(hd.x * 18.0, uSeed * 3.0, 1.0)) * 0.7 + vnoise(vec3(hd.x * 45.0, 2.0, uSeed)) * 0.3 - 0.5);
            float m = 0.0;
            float u = hd.x;
            if (uFace < 1.5) { // star
              m = smoothstep(0.034, 0.028, length(vec2((u - 0.15) * 0.8, hd.z + wob)));
            } else if (uFace < 2.5) { // strip
              float wdt = mix(0.012, 0.022, smoothstep(0.15, 0.5, u));
              m = smoothstep(wdt + 0.004, wdt - 0.002, abs(hd.z + wob)) * smoothstep(0.1, 0.13, u) * smoothstep(0.62, 0.5, u);
            } else if (uFace < 3.5) { // blaze
              float wdt = mix(0.03, 0.05, smoothstep(0.25, 0.58, u));
              m = smoothstep(wdt + 0.004, wdt - 0.003, abs(hd.z + wob)) * smoothstep(0.07, 0.1, u);
              m = max(m, smoothstep(0.5, 0.56, u) * smoothstep(0.065, 0.05, abs(hd.z)));
            } else { // bald face
              float wdt = mix(0.075, 0.08, smoothstep(0.2, 0.5, u));
              m = smoothstep(wdt + 0.004, wdt - 0.004, abs(hd.z + wob)) * smoothstep(0.03, 0.07, u);
              front = max(front, smoothstep(0.45, 0.5, u));
            }
            white = max(white, m * front);
          }
          // white socks / stockings, per leg
          float hgt = p.x > 0.0 ? (p.z > 0.0 ? uSocks.x : uSocks.y) : (p.z > 0.0 ? uSocks.z : uSocks.w);
          if (hgt > 0.001 && p.y < hgt + 0.05) {
            float edge = hgt + 0.035 * (vnoise(sp * vec3(25.0, 6.0, 25.0)) * 0.7 + vnoise(sp * vec3(60.0, 14.0, 60.0)) * 0.3 - 0.5);
            white = max(white, smoothstep(edge + 0.008, edge - 0.008, p.y) * isLeg);
          }
          col = mix(col, vec3(0.86, 0.84, 0.8), white);
          // muzzle & eye skin (pink under white markings)
          float skin = max(smoothstep(0.25, 0.75, tag.y), smoothstep(0.2, 0.7, tag.z) * 0.85);
          if (skin > 0.001) {
            vec3 skinCol = uSkin * (0.85 + 0.3 * vnoise(sp * 160.0));
            vec3 pink = vec3(0.55, 0.36, 0.33) * (0.85 + 0.2 * vnoise(sp * 70.0));
            pink = mix(pink, uSkin * 1.2, smoothstep(0.55, 0.75, vnoise(sp * 45.0)));
            col = mix(col, mix(skinCol, pink, white), skin);
            // nostril openings: a dark comma on each side of the muzzle
            if (onHead > 0.5 && abs(hd.z) > 0.045) {
              float du = hd.x - 0.538, dv = hd.y + 0.046 - 2.2 * du * du + 0.12 * du;
              float nd = (du * du) / (0.043 * 0.043) + (dv * dv) / (0.0125 * 0.0125);
              float nos = smoothstep(1.0, 0.45, nd);
              col = mix(col, vec3(0.012, 0.008, 0.007), nos);
            }
          }
          // hoof horn with a crisp coronet
          hoofMask = 0.0;
          float stripes = 0.5;
          if (p.y < 0.11) {
            for (int i = 0; i < 4; i++) {
              vec4 A = uHoofA[i]; vec4 B = uHoofB[i];
              if (abs(p.z - A.y) > 0.09 || abs(p.x - A.x) > 0.14) continue;
              float lf = (p.x - A.x) + p.y * A.w;
              float t = clamp((lf + A.z) / (2.0 * A.z), 0.0, 1.0);
              float band = B.y + (B.x - B.y) * t;
              hoofMask = max(hoofMask, smoothstep(band + 0.0025, band - 0.0025, p.y));
            }
            if (hoofMask > 0.0) {
              float socked = smoothstep(0.08, 0.12, hgt);
              vec3 horn = mix(uHoof, vec3(0.62, 0.55, 0.45), socked);
              stripes = vnoise(vec3(p.x * 380.0, p.y * 6.0, p.z * 380.0));
              horn *= 0.8 + 0.35 * stripes;
              horn = mix(horn, horn * 0.55, smoothstep(0.012, 0.0, p.y));
              col = mix(col, horn, hoofMask);
            }
          }
          rough = mix(mix(0.52, 0.6, white), 0.4, skin);
          rough = mix(rough, 0.32 + 0.15 * stripes, hoofMask);
          return col;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float coatRough, coatWhite, coatHoof;
        vec3 coatAlbedo = coatColor(vRest, vTag, coatRough, coatWhite, coatHoof);
        diffuseColor.rgb = coatAlbedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = coatRough;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // hair micro-structure: fine ridges running along the hair flow
          vec3 Tr = normalize(vRestT);
          vec3 Nr = normalize(vRestN);
          vec3 Br = normalize(cross(Nr, Tr));
          float across = dot(vRest, Br) * 1100.0;
          float along = dot(vRest, Tr) * 45.0;
          float fw = fwidth(across);
          float fade = (1.0 - smoothstep(0.35, 1.2, fw)) * uHairDetail * (1.0 - coatHoof);
          if (fade > 0.001) {
            float h0 = vnoise(vec3(across - 0.5, along, 0.0));
            float h1 = vnoise(vec3(across + 0.5, along, 0.0));
            vec3 Bv = normalize(vBitangent);
            normal = normalize(normal - Bv * (h1 - h0) * 0.09 * fade);
          }
        }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          float ao = vAO;
          reflectedLight.indirectDiffuse *= ao;
          reflectedLight.indirectSpecular *= ao * ao;
          reflectedLight.directDiffuse *= mix(1.0, ao, 0.45);
          reflectedLight.directSpecular *= mix(1.0, ao, 0.6);
        }`);
  };
  mat.customProgramCacheKey = () => 'horse-coat-v2';
  return mat;
}

export function applyCoat(material, preset, face, socks, seed) {
  const u = material.userData.uniforms;
  const c = COATS[preset] || COATS.bay;
  u.uBase.value.set(c.base);
  u.uBelly.value.set(c.belly);
  u.uTop.value.set(c.top);
  u.uPoints.value.set(c.points);
  u.uPointsAmt.value = c.pointsAmt;
  u.uSkin.value.set(c.skin);
  u.uHoof.value.set(c.hoof);
  u.uDapple.value = c.dapple || 0;
  u.uDappleDark.value.set(c.dappleDark || '#6a6866');
  u.uDock.value.set(c.tail);
  u.uDarkHead.value = c.darkHead || 0;
  u.uPinto.value = c.pinto || 0;
  u.uAppy.value = c.appy || 0;
  u.uDorsal.value = c.dorsal || 0;
  if (face !== undefined) u.uFace.value = face;
  if (socks) u.uSocks.value.set(...socks);
  if (seed !== undefined) u.uSeed.value = seed;
  material.sheenColor.set(c.belly).lerp(new THREE.Color(1, 1, 1), 0.35);
}
