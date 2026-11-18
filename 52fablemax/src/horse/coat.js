// Procedural materials: the bay coat with its markings, hoof horn, eyes and
// ears. Everything is computed in the shaders from rest-pose coordinates, so
// there are no textures to load.
import * as THREE from 'three';
import { NOISE_GLSL } from '../glsl.js';
import { HEAD_ANGLE, J, headPoint } from './skeleton.js';

const glslVec = (v) => `vec${v.length}(${v.map((n) => n.toFixed(5)).join(', ')})`;

/** Height-field bump mapping from screen-space derivatives. */
const BUMP_GLSL = /* glsl */ `
vec3 hfPerturb(vec3 surfPos, vec3 n, float height, float strength) {
  vec3 px = dFdx(surfPos), py = dFdy(surfPos);
  float hx = dFdx(height), hy = dFdy(height);
  vec3 r1 = cross(py, n), r2 = cross(n, px);
  float det = dot(px, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  return normalize(abs(det) * n - strength * grad);
}
`;

/**
 * Splices code into a built-in material's shaders.
 * hooks: { vertexPars, vertex, fragmentPars, color, roughness, normal, light }
 */
function splice(material, uniforms, hooks) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    if (hooks.vertexPars) vs = vs.replace('#include <common>', `#include <common>\n${hooks.vertexPars}`);
    if (hooks.vertex) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${hooks.vertex}`);
    if (hooks.fragmentPars) fs = fs.replace('#include <common>', `#include <common>\n${hooks.fragmentPars}`);
    if (hooks.color) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${hooks.color}`);
    if (hooks.roughness) fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${hooks.roughness}`);
    if (hooks.normal) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${hooks.normal}`);
    if (hooks.light) fs = fs.replace('#include <aomap_fragment>', hooks.light);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => hooks.key;
  return material;
}

const AO_LIGHT = /* glsl */ `
  {
    float occ = clamp(vAO, 0.0, 1.0);
    float soft = mix(0.42, 1.0, occ);
    reflectedLight.indirectDiffuse *= soft;
    reflectedLight.indirectSpecular *= soft * soft;
    reflectedLight.directDiffuse *= mix(0.72, 1.0, occ);
    reflectedLight.directSpecular *= mix(0.5, 1.0, occ);
    #ifdef USE_SHEEN
      sheenSpecularIndirect *= soft;
      sheenSpecularDirect *= mix(0.6, 1.0, occ);
    #endif
  }
`;

// ----------------------------------------------------------------- coat -----

export function createCoatMaterial() {
  const eye = headPoint(0.222, 0.016, 0.104);
  const uniforms = {
    uCoat: { value: new THREE.Color('#70391a') },
    uCoatLight: { value: new THREE.Color('#9b683a') },
    uCoatDark: { value: new THREE.Color('#3d1f10') },
    uPoint: { value: new THREE.Color('#0e0b0a') },
    uWhite: { value: new THREE.Color('#d6cfc3') },
    uSkin: { value: new THREE.Color('#1a1311') },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0,
    sheen: 0.8,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#8a6a4c'),
    specularIntensity: 0.6,
  });
  return splice(material, uniforms, {
    key: 'horse-coat',
    vertexPars: /* glsl */ `
      attribute float ao;
      varying vec3 vRest;
      varying float vAO;
    `,
    vertex: /* glsl */ `
      vRest = position;
      vAO = ao;
    `,
    fragmentPars: /* glsl */ `
      varying vec3 vRest;
      varying float vAO;
      uniform vec3 uCoat;
      uniform vec3 uCoatLight;
      uniform vec3 uCoatDark;
      uniform vec3 uPoint;
      uniform vec3 uWhite;
      uniform vec3 uSkin;
      ${NOISE_GLSL}
      ${BUMP_GLSL}
      const vec2 POLL = ${glslVec([J.poll[0], J.poll[1]])};
      const vec2 FACE = ${glslVec([Math.cos(HEAD_ANGLE), -Math.sin(HEAD_ANGLE)])};
      const vec2 BROW = ${glslVec([Math.sin(HEAD_ANGLE), Math.cos(HEAD_ANGLE)])};
      const vec3 EYE = ${glslVec(eye)};
      float coatRough;
      float coatSheen;
      float coatFur;
    `,
    color: /* glsl */ `
      {
        vec3 rp = vRest;
        vec2 hp = rp.xy - POLL;
        float hl = dot(hp, FACE);
        float hd = dot(hp, BROW);
        float isLeg = 1.0 - smoothstep(0.80, 0.90, rp.y);

        // broad tonal drift over the body
        float tone = fbm(rp * vec3(2.3, 2.7, 2.3) + 3.0, 3);
        float mottle = fbm(rp * 9.0 + 7.0, 3);
        vec3 col = uCoat * (0.82 + 0.36 * tone) * (0.93 + 0.14 * mottle);
        // faint dapples over the quarters and barrel
        float dapple = smoothstep(0.52, 0.7, vnoise(rp * vec3(15.0, 15.0, 15.0) + 2.0));
        float dappleZone = smoothstep(1.05, 1.3, rp.y) * (1.0 - smoothstep(0.3, 0.7, rp.x)) * smoothstep(0.08, 0.2, abs(rp.z));
        col *= 1.0 + 0.1 * dapple * dappleZone;

        // darker along the top line, paler under the belly and behind the elbow
        float onTrunk = 1.0 - smoothstep(0.55, 0.95, rp.x);
        float top = smoothstep(1.36, 1.62, rp.y) * onTrunk;
        col = mix(col, uCoatDark, 0.45 * top);
        float under = (1.0 - smoothstep(0.90, 1.14, rp.y)) * smoothstep(0.80, 0.92, rp.y);
        col = mix(col, uCoatLight, 0.42 * under);
        float flank = (1.0 - smoothstep(0.0, 0.16, distance(rp.xy, vec2(-0.36, 1.1)))) * smoothstep(0.1, 0.2, abs(rp.z));
        col = mix(col, uCoatLight, 0.25 * flank);

        // black points climbing the legs, higher on the hinds, with a ragged edge
        float edgeNoise = fbm(vec3(rp.x * 8.0, rp.y * 2.6, rp.z * 8.0), 3) - 0.5;
        float kneeLine = (rp.x > 0.0 ? 0.52 : 0.63) + 0.16 * edgeNoise;
        float points = (1.0 - smoothstep(kneeLine - 0.13, kneeLine + 0.15, rp.y)) * isLeg;

        // dark muzzle and bare skin round the eyes and nostrils
        float muzzle = smoothstep(0.47, 0.64, hl + 0.03 * edgeNoise) * step(1.2, rp.y);
        float eyeRing = 1.0 - smoothstep(0.016, 0.045, distance(vec3(rp.xy, abs(rp.z)), EYE));
        float dark = max(points, max(muzzle * 0.88, eyeRing * 0.8));
        col = mix(col, uPoint, dark);

        // white: a star and narrow stripe down the face, a sock and a coronet band
        float wob = (vnoise(vec3(hl * 34.0, rp.z * 46.0, 2.0)) - 0.5) * 0.012;
        float star = 0.031 * exp(-pow((hl - 0.19) / 0.046, 2.0));
        float stripe = 0.0075 * smoothstep(0.2, 0.27, hl) * (1.0 - smoothstep(0.4, 0.5, hl));
        float halfW = max(star, stripe) + wob;
        float blaze = (1.0 - smoothstep(halfW - 0.0025, halfW + 0.0025, abs(rp.z + 0.004)))
          * step(0.02, hd) * step(0.1, hl) * (1.0 - step(0.52, hl)) * step(1.3, rp.y);
        float sockEdge = 0.035 * (fbm(vec3(rp.x * 26.0, 1.0, rp.z * 26.0), 3) - 0.5);
        float hindLeft = step(rp.x, 0.0) * step(rp.z, 0.0);
        float hindRight = step(rp.x, 0.0) * step(0.0, rp.z);
        float sock = hindLeft * (1.0 - smoothstep(0.305, 0.325, rp.y + sockEdge));
        sock = max(sock, hindRight * (1.0 - smoothstep(0.112, 0.128, rp.y + sockEdge * 0.6)));
        float white = max(blaze, sock * isLeg);
        col = mix(col, uWhite * (0.9 + 0.14 * mottle), white);

        coatRough = mix(0.5, 0.42, dark * (1.0 - white));
        coatRough = mix(coatRough, 0.6, white);
        coatSheen = mix(1.0, 0.35, max(dark, white));

        // short hair lying along the body: fine streaks stretched along the lay
        vec3 lay = normalize(mix(vec3(-0.78, -0.62, 0.0), vec3(0.0, -1.0, 0.0), isLeg));
        vec3 side = normalize(cross(lay, vec3(0.0, 0.0, 1.0)));
        vec3 fq = vec3(dot(rp, lay) * 46.0, dot(rp, side) * 620.0, rp.z * 620.0);
        float footprint = max(length(dFdx(rp)), length(dFdy(rp)));
        float fine = 1.0 - smoothstep(0.0003, 0.0008, footprint);
        float coarse = 1.0 - smoothstep(0.0007, 0.0016, footprint);
        float f1 = vnoise(fq);
        float f2 = vnoise(fq * vec3(0.5, 0.31, 0.31) + 5.0);
        coatFur = (f1 - 0.5) * fine + (f2 - 0.5) * 0.6 * coarse;
        col *= 1.0 + 0.1 * coatFur;

        diffuseColor.rgb = col;
      }
    `,
    roughness: /* glsl */ `
      roughnessFactor = clamp(coatRough + 0.06 * coatFur, 0.2, 1.0);
    `,
    normal: /* glsl */ `
      normal = hfPerturb(-vViewPosition, normal, coatFur, 0.0002);
    `,
    light: /* glsl */ `
      #ifdef USE_SHEEN
        sheenSpecularDirect *= coatSheen;
        sheenSpecularIndirect *= coatSheen;
      #endif
      ${AO_LIGHT}
    `,
  });
}

// ---------------------------------------------------------------- hooves ----

export function createHoofMaterial(light = false) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.46,
    metalness: 0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.4,
  });
  const uniforms = {
    uHornA: { value: new THREE.Color(light ? '#b7a184' : '#231c18') },
    uHornB: { value: new THREE.Color(light ? '#7d6a52' : '#3c3028') },
    uDust: { value: new THREE.Color('#6b604f') },
  };
  return splice(material, uniforms, {
    key: light ? 'hoof-light' : 'hoof-dark',
    vertexPars: /* glsl */ `
      attribute vec2 hoofUv;
      varying vec2 vHoofUv;
      varying vec3 vLocal;
    `,
    vertex: /* glsl */ `
      vHoofUv = hoofUv;
      vLocal = position;
    `,
    fragmentPars: /* glsl */ `
      varying vec2 vHoofUv;
      varying vec3 vLocal;
      uniform vec3 uHornA;
      uniform vec3 uHornB;
      uniform vec3 uDust;
      ${NOISE_GLSL}
      float hoofRough;
    `,
    color: /* glsl */ `
      {
        float around = atan(vLocal.z, vLocal.x);
        float h = vHoofUv.y;
        // horn tubules run from the coronet to the ground; growth rings cross them
        float streak = fbm(vec3(around * 22.0, h * 1.4, 0.0), 4);
        float rings = 0.5 + 0.5 * sin(h * 46.0 + 5.0 * vnoise(vec3(around * 3.0, h * 6.0, 1.0)));
        vec3 horn = mix(uHornA, uHornB, smoothstep(0.3, 0.75, streak));
        horn *= 0.9 + 0.14 * rings;
        // dusty towards the ground, dull sole
        float dust = (1.0 - smoothstep(0.0, 0.3, h)) * (0.4 + 0.6 * vnoise(vLocal * 140.0));
        horn = mix(horn, uDust, 0.5 * dust);
        float sole = 1.0 - smoothstep(-0.12, -0.02, h);
        horn = mix(horn, uDust * 0.7, sole);
        // periople: a paler, softer band under the hairline
        horn = mix(horn, horn * 1.25 + 0.02, smoothstep(0.86, 1.0, h));
        diffuseColor.rgb = horn;
        hoofRough = mix(0.42, 0.85, max(dust * 0.8, sole));
      }
    `,
    roughness: /* glsl */ `
      roughnessFactor = hoofRough;
    `,
  });
}

// ------------------------------------------------------------------ eyes ----

export function createEyeMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    ior: 1.38,
    envMapIntensity: 1.5,
  });
  return splice(material, {}, {
    key: 'horse-eye',
    vertexPars: /* glsl */ `varying vec3 vEye;`,
    vertex: /* glsl */ `vEye = normalize(position);`,
    fragmentPars: /* glsl */ `
      varying vec3 vEye;
      ${NOISE_GLSL}
    `,
    color: /* glsl */ `
      {
        vec3 e = normalize(vEye);
        float r = length(e.xy);
        float ang = atan(e.y, e.x);
        // large dark iris with radial fibres
        float fibres = fbm(vec3(ang * 9.0, r * 5.0, 0.0), 3);
        vec3 iris = mix(vec3(0.20, 0.095, 0.035), vec3(0.055, 0.024, 0.010), smoothstep(0.25, 0.8, fibres));
        iris *= 1.0 - 0.55 * smoothstep(0.55, 0.86, r);
        // horizontal slot pupil with a soft, slightly ragged edge
        float slot = pow(abs(e.x) / 0.47, 3.4) + pow(abs(e.y + 0.012 * sin(e.x * 30.0)) / 0.2, 3.4);
        float pupil = 1.0 - smoothstep(0.82, 1.12, slot);
        vec3 col = mix(iris, vec3(0.004, 0.005, 0.009), pupil);
        // sclera beyond the limbus
        vec3 sclera = mix(vec3(0.62, 0.55, 0.5), vec3(0.45, 0.2, 0.17), smoothstep(0.9, 1.0, r));
        col = mix(col, sclera, smoothstep(0.86, 0.9, r) * step(0.0, e.z));
        col = mix(col, sclera, step(e.z, 0.0));
        diffuseColor.rgb = col;
      }
    `,
  });
}

export function createLidMaterial() {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a1a13'), roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
}

// ------------------------------------------------------------------ ears ----

export function createEarMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0,
    sheen: 0.7,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#8a6a4c'),
    side: THREE.DoubleSide,
  });
  const uniforms = {
    uCoat: { value: new THREE.Color('#6a3619') },
    uPoint: { value: new THREE.Color('#0e0b0a') },
    uInner: { value: new THREE.Color('#2a1c18') },
    uFluff: { value: new THREE.Color('#8f7a66') },
  };
  return splice(material, uniforms, {
    key: 'horse-ear',
    vertexPars: /* glsl */ `
      attribute vec2 earUv;
      varying vec2 vEarUv;
      varying vec3 vLocal;
    `,
    vertex: /* glsl */ `
      vEarUv = earUv;
      vLocal = position;
    `,
    fragmentPars: /* glsl */ `
      varying vec2 vEarUv;
      varying vec3 vLocal;
      uniform vec3 uCoat;
      uniform vec3 uPoint;
      uniform vec3 uInner;
      uniform vec3 uFluff;
      ${NOISE_GLSL}
    `,
    color: /* glsl */ `
      {
        float t = vEarUv.y;
        float n = fbm(vLocal * 60.0, 3);
        // outside: coat colour darkening to a black tip and rim
        vec3 outer = mix(uCoat * (0.85 + 0.3 * n), uPoint, smoothstep(0.66, 0.97, t + 0.1 * (n - 0.5)));
        // inside: dark skin with pale fluff, thicker towards the base
        float fluff = smoothstep(0.3, 0.75, fbm(vec3(vLocal.x * 260.0, vLocal.y * 30.0, vLocal.z * 260.0), 3));
        vec3 inner = mix(uInner, uFluff, fluff * (1.0 - 0.75 * smoothstep(0.2, 0.9, t)) * 0.45);
        diffuseColor.rgb = mix(outer, inner, smoothstep(0.4, 0.6, vEarUv.x));
      }
    `,
  });
}
