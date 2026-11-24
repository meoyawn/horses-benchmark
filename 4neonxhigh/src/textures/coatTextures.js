/**
 * coatTextures.js — 100% Procedural PBR Texture Synthesizer & Velvet Equine Coat Shader.
 * Matte-velvet Charlie sheen + micro-fine directional hair grain (zero plastic gloss!),
 * authentic multi-scale dapples, organic feathered blaze/socks, keratin-striated hooves,
 * horizontal-pupil equine iris, and silky multi-layered hair-card strand textures.
 */

import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const COAT_PRESETS = {
  bay: {
    name: 'Bay',
    baseColor: new THREE.Color('#6b3015'),
    highlightColor: new THREE.Color('#8e4721'),
    shadowColor: new THREE.Color('#39170a'),
    pointColor: new THREE.Color('#130e0c'),
    pointStrength: 0.96,
    muzzleColor: new THREE.Color('#1c1614'),
    bellyTint: new THREE.Color('#7a4020'),
    dappleStrength: 0.0,
    dorsalStripe: 0.0,
    sheenColor: new THREE.Color('#b6794d'),
    sheen: 0.78,
    blazeStrength: 0.92,
    socks: new THREE.Vector4(0.0, 0.0, 0.95, 0.72),
    maneColor: new THREE.Color('#120e0d'),
    maneTipColor: new THREE.Color('#271c16'),
    tailColor: new THREE.Color('#110d0c'),
    tailTipColor: new THREE.Color('#251a14'),
    hoofDark: new THREE.Color('#1f1d1b'),
    hoofPale: new THREE.Color('#c6b89e'),
    eyeLidColor: new THREE.Color('#1b1411'),
  },
  dappleGrey: {
    name: 'Dapple Grey',
    baseColor: new THREE.Color('#cdd1d7'),
    highlightColor: new THREE.Color('#e6e9ee'),
    shadowColor: new THREE.Color('#848b96'),
    pointColor: new THREE.Color('#515862'),
    pointStrength: 0.76,
    muzzleColor: new THREE.Color('#2c2e33'),
    bellyTint: new THREE.Color('#d8dce2'),
    dappleStrength: 0.88,
    dorsalStripe: 0.0,
    sheenColor: new THREE.Color('#eef2f8'),
    sheen: 0.68,
    blazeStrength: 0.15,
    socks: new THREE.Vector4(0.0, 0.0, 0.0, 0.0),
    maneColor: new THREE.Color('#9ea4ae'),
    maneTipColor: new THREE.Color('#d9dde3'),
    tailColor: new THREE.Color('#696f78'),
    tailTipColor: new THREE.Color('#c2c7d0'),
    hoofDark: new THREE.Color('#2e3034'),
    hoofPale: new THREE.Color('#b8b3a6'),
    eyeLidColor: new THREE.Color('#2c2d32'),
  },
  chestnut: {
    name: 'Chestnut',
    baseColor: new THREE.Color('#943f18'),
    highlightColor: new THREE.Color('#bd5c28'),
    shadowColor: new THREE.Color('#5a220c'),
    pointColor: new THREE.Color('#702c10'),
    pointStrength: 0.42,
    muzzleColor: new THREE.Color('#442417'),
    bellyTint: new THREE.Color('#ad5527'),
    dappleStrength: 0.08,
    dorsalStripe: 0.0,
    sheenColor: new THREE.Color('#d88850'),
    sheen: 0.82,
    blazeStrength: 1.0,
    socks: new THREE.Vector4(0.90, 0.0, 0.95, 0.92),
    maneColor: new THREE.Color('#87421d'),
    maneTipColor: new THREE.Color('#c98d52'),
    tailColor: new THREE.Color('#793918'),
    tailTipColor: new THREE.Color('#be8045'),
    hoofDark: new THREE.Color('#3b322b'),
    hoofPale: new THREE.Color('#cfc0a5'),
    eyeLidColor: new THREE.Color('#3a2016'),
  },
  black: {
    name: 'Friesian Black',
    baseColor: new THREE.Color('#191718'),
    highlightColor: new THREE.Color('#2c2625'),
    shadowColor: new THREE.Color('#0b0a0b'),
    pointColor: new THREE.Color('#0c0b0c'),
    pointStrength: 0.65,
    muzzleColor: new THREE.Color('#161415'),
    bellyTint: new THREE.Color('#1c191a'),
    dappleStrength: 0.0,
    dorsalStripe: 0.0,
    sheenColor: new THREE.Color('#584c45'),
    sheen: 0.85,
    blazeStrength: 0.20,
    socks: new THREE.Vector4(0.0, 0.0, 0.0, 0.0),
    maneColor: new THREE.Color('#0e0d0e'),
    maneTipColor: new THREE.Color('#1d1918'),
    tailColor: new THREE.Color('#0d0c0d'),
    tailTipColor: new THREE.Color('#1a1716'),
    hoofDark: new THREE.Color('#151414'),
    hoofPale: new THREE.Color('#9f9789'),
    eyeLidColor: new THREE.Color('#111011'),
  },
  palomino: {
    name: 'Palomino',
    baseColor: new THREE.Color('#be8a3d'),
    highlightColor: new THREE.Color('#dfb263'),
    shadowColor: new THREE.Color('#855820'),
    pointColor: new THREE.Color('#a26f2b'),
    pointStrength: 0.30,
    muzzleColor: new THREE.Color('#352b26'),
    bellyTint: new THREE.Color('#d8af6c'),
    dappleStrength: 0.10,
    dorsalStripe: 0.0,
    sheenColor: new THREE.Color('#f7dfa8'),
    sheen: 0.85,
    blazeStrength: 0.95,
    socks: new THREE.Vector4(0.85, 0.85, 0.95, 0.95),
    maneColor: new THREE.Color('#dfd5be'),
    maneTipColor: new THREE.Color('#f6f1e4'),
    tailColor: new THREE.Color('#dad0b8'),
    tailTipColor: new THREE.Color('#f5efe0'),
    hoofDark: new THREE.Color('#423930'),
    hoofPale: new THREE.Color('#d6c9b0'),
    eyeLidColor: new THREE.Color('#2c2420'),
  },
  buckskin: {
    name: 'Buckskin',
    baseColor: new THREE.Color('#b5884a'),
    highlightColor: new THREE.Color('#d1a86a'),
    shadowColor: new THREE.Color('#765428'),
    pointColor: new THREE.Color('#15110e'),
    pointStrength: 0.98,
    muzzleColor: new THREE.Color('#1d1815'),
    bellyTint: new THREE.Color('#caa369'),
    dappleStrength: 0.05,
    dorsalStripe: 0.92,
    sheenColor: new THREE.Color('#e5c388'),
    sheen: 0.76,
    blazeStrength: 0.0,
    socks: new THREE.Vector4(0.0, 0.0, 0.0, 0.0),
    maneColor: new THREE.Color('#15110e'),
    maneTipColor: new THREE.Color('#2e241b'),
    tailColor: new THREE.Color('#14100d'),
    tailTipColor: new THREE.Color('#2b2118'),
    hoofDark: new THREE.Color('#1c1917'),
    hoofPale: new THREE.Color('#c4b69b'),
    eyeLidColor: new THREE.Color('#1b1613'),
  },
};

/**
 * Generate micro-fine directional short horsehair normal + satin-matte roughness maps.
 * Tiled finely (15x15) with low normal amplitude so coat looks like soft brushed velvet hair,
 * NEVER bumpy leather or shiny plastic!
 */
export function createCoatDetailTextures(size = 512) {
  const rand = mulberry32(42071);

  const hCanvas = document.createElement('canvas');
  hCanvas.width = size;
  hCanvas.height = size;
  const hCtx = hCanvas.getContext('2d');

  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);

  // Ultra-fine, tightly packed short directional coat hair strokes
  const strokeCount = 24000;
  for (let i = 0; i < strokeCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 4 + rand() * 8;
    const angle = (rand() - 0.5) * 0.22;
    const lum = 104 + Math.floor(rand() * 48);
    const alpha = 0.16 + rand() * 0.18;
    hCtx.strokeStyle = `rgba(${lum},${lum},${lum},${alpha.toFixed(2)})`;
    hCtx.lineWidth = 0.6 + rand() * 0.65;

    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len;

    for (const ox of [-size, 0, size]) {
      if (x + ox < -len || x + ox > size + len) continue;
      for (const oy of [-size, 0, size]) {
        if (y + oy < -len || y + oy > size + len) continue;
        hCtx.beginPath();
        hCtx.moveTo(x + ox, y + oy);
        hCtx.lineTo(x + ox + dx, y + oy + dy);
        hCtx.stroke();
      }
    }
  }

  const hData = hCtx.getImageData(0, 0, size, size).data;
  const nCanvas = document.createElement('canvas');
  nCanvas.width = size;
  nCanvas.height = size;
  const nCtx = nCanvas.getContext('2d');
  const nImg = nCtx.createImageData(size, size);
  const out = nImg.data;

  const sampleH = (x, y) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return hData[(wy * size + wx) * 4] / 255;
  };

  const strength = 1.45;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const invLen = 1 / Math.hypot(-dX, -dY, 1.0);

      const idx = (y * size + x) * 4;
      out[idx] = Math.floor((-dX * invLen * 0.5 + 0.5) * 255);
      out[idx + 1] = Math.floor((-dY * invLen * 0.5 + 0.5) * 255);
      out[idx + 2] = Math.floor((invLen * 0.5 + 0.5) * 255);
      out[idx + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);

  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(14, 14);
  normalMap.anisotropy = 8;
  normalMap.needsUpdate = true;

  // Satin-matte roughness map centered around 0.72..0.86 (genuine dry brushed equine coat!)
  const rCanvas = document.createElement('canvas');
  rCanvas.width = size;
  rCanvas.height = size;
  const rCtx = rCanvas.getContext('2d');
  const rImg = rCtx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const h = hData[i * 4] / 255;
    const rv = Math.floor((0.68 + (1.0 - h) * 0.20) * 255);
    rImg.data[i * 4] = rv;
    rImg.data[i * 4 + 1] = rv;
    rImg.data[i * 4 + 2] = rv;
    rImg.data[i * 4 + 3] = 255;
  }
  rCtx.putImageData(rImg, 0, 0);
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(14, 14);
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

export function createEquineEyeTexture(size = 512) {
  const rand = mulberry32(9917);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1b1410';
  ctx.fillRect(0, 0, size, size);

  const cx = size * 0.5;
  const cy = size * 0.5;
  const irisR = size * 0.24;

  const scleraGrad = ctx.createRadialGradient(cx, cy, irisR * 0.92, cx, cy, irisR * 1.45);
  scleraGrad.addColorStop(0, '#120d0a');
  scleraGrad.addColorStop(0.45, '#3b332c');
  scleraGrad.addColorStop(1, '#1a1410');
  ctx.fillStyle = scleraGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, irisR * 1.45, 0, Math.PI * 2);
  ctx.fill();

  const irisGrad = ctx.createRadialGradient(cx, cy, irisR * 0.15, cx, cy, irisR);
  irisGrad.addColorStop(0.0, '#542f14');
  irisGrad.addColorStop(0.48, '#3f200c');
  irisGrad.addColorStop(0.82, '#241207');
  irisGrad.addColorStop(1.0, '#0e0704');
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 240; i++) {
    const a = rand() * Math.PI * 2;
    const r0 = irisR * (0.28 + rand() * 0.16);
    const r1 = irisR * (0.72 + rand() * 0.24);
    const bright = rand() > 0.4;
    ctx.strokeStyle = bright
      ? `rgba(155, 98, 45, ${(0.12 + rand() * 0.22).toFixed(2)})`
      : `rgba(22, 10, 4, ${(0.22 + rand() * 0.25).toFixed(2)})`;
    ctx.lineWidth = 1.0 + rand() * 1.8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a + (rand() - 0.5) * 0.08) * r1, cy + Math.sin(a + (rand() - 0.5) * 0.08) * r1);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#050404';
  ctx.beginPath();
  ctx.ellipse(0, 0, irisR * 0.44, irisR * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(i * irisR * 0.08, -irisR * 0.20, irisR * (0.04 + rand() * 0.025), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Ultra-fine feathery silky horsehair strand texture for hair cards!
 * Draws 650 delicate tapered hair strands with wispy air gaps between locks so
 * mane, forelock, and tail read as lush, soft, individually stranded horsehair!
 */
export function createHairStrandTextures(size = 512) {
  const rand = mulberry32(13379);

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d');

  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = size;
  alphaCanvas.height = size;
  const aCtx = alphaCanvas.getContext('2d');

  cCtx.fillStyle = '#808080';
  cCtx.fillRect(0, 0, size, size);
  aCtx.fillStyle = '#000000';
  aCtx.fillRect(0, 0, size, size);

  // Organize fibers into 5 fine feathery sub-wisps across the card width for organic hair separation!
  const subClusters = [-0.30, -0.15, 0.0, 0.15, 0.30];

  for (let i = 0; i < 650; i++) {
    const cluster = subClusters[i % subClusters.length];
    const jitter = (rand() + rand() - 1.0) * 0.11;
    const uCenter = 0.5 + cluster + jitter;
    const edgeFalloff = 1.0 - Math.min(1.0, Math.abs(uCenter - 0.5) * 2.15);

    const x0 = size * (0.5 + (uCenter - 0.5) * 0.78);
    const x1 = size * (uCenter + (rand() - 0.5) * 0.06);
    const ctrlX = (x0 + x1) * 0.5 + (rand() - 0.5) * size * 0.045;
    // Varied natural feathered lengths so tips are jaggedly wispy, NEVER cut straight!
    const tipY = size * (0.38 + edgeFalloff * 0.60 * (0.52 + rand() * 0.48));

    const w = 0.8 + rand() * 1.45;
    const tone = 118 + Math.floor(rand() * 135);

    const cGrad = cCtx.createLinearGradient(0, 0, 0, tipY);
    cGrad.addColorStop(0.0, `rgb(${Math.floor(tone * 0.68)},${Math.floor(tone * 0.68)},${Math.floor(tone * 0.68)})`);
    cGrad.addColorStop(0.50, `rgb(${tone},${tone},${tone})`);
    cGrad.addColorStop(1.0, `rgb(${Math.min(255, Math.floor(tone * 1.22))},${Math.min(255, Math.floor(tone * 1.22))},${Math.min(255, Math.floor(tone * 1.22))})`);

    cCtx.strokeStyle = cGrad;
    cCtx.lineWidth = w;
    cCtx.lineCap = 'round';
    cCtx.beginPath();
    cCtx.moveTo(x0, 0);
    cCtx.quadraticCurveTo(ctrlX, tipY * 0.52, x1, tipY);
    cCtx.stroke();

    const aGrad = aCtx.createLinearGradient(0, 0, 0, tipY);
    aGrad.addColorStop(0.0, 'rgba(255,255,255,0.94)');
    aGrad.addColorStop(0.65, 'rgba(255,255,255,0.88)');
    aGrad.addColorStop(0.88, 'rgba(185,185,185,0.45)');
    aGrad.addColorStop(1.0, 'rgba(0,0,0,0.0)');

    aCtx.strokeStyle = aGrad;
    aCtx.lineWidth = w * 1.05;
    aCtx.lineCap = 'round';
    aCtx.beginPath();
    aCtx.moveTo(x0, 0);
    aCtx.quadraticCurveTo(ctrlX, tipY * 0.52, x1, tipY);
    aCtx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const alphaMap = new THREE.CanvasTexture(alphaCanvas);
  alphaMap.needsUpdate = true;

  return { map, alphaMap };
}

export function createLeatherTextures(size = 256) {
  const rand = mulberry32(7731);
  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const ctx = cCanvas.getContext('2d');

  ctx.fillStyle = '#3b2113';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1.2 + rand() * 2.5;
    const d = Math.floor((rand() - 0.5) * 26);
    ctx.fillStyle = `rgb(${59 + d},${33 + Math.floor(d * 0.6)},${19 + Math.floor(d * 0.4)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(222, 198, 156, 0.52)';
  ctx.lineWidth = 2.0;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.14);
  ctx.lineTo(size, size * 0.14);
  ctx.moveTo(0, size * 0.86);
  ctx.lineTo(size, size * 0.86);
  ctx.stroke();

  const map = new THREE.CanvasTexture(cCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return { map };
}

/**
 * Velvet-satin equine MeshPhysicalMaterial (zero plastic clearcoat!)
 */
export function createHorseCoatMaterial(detailTextures, initialPresetKey = 'bay') {
  const preset = COAT_PRESETS[initialPresetKey] || COAT_PRESETS.bay;

  const uniforms = {
    uBaseColor: { value: preset.baseColor.clone() },
    uHighlightColor: { value: preset.highlightColor.clone() },
    uShadowColor: { value: preset.shadowColor.clone() },
    uPointColor: { value: preset.pointColor.clone() },
    uPointStrength: { value: preset.pointStrength },
    uMuzzleColor: { value: preset.muzzleColor.clone() },
    uBellyTint: { value: preset.bellyTint.clone() },
    uDappleStrength: { value: preset.dappleStrength },
    uDorsalStripe: { value: preset.dorsalStripe },
    uBlazeStrength: { value: preset.blazeStrength },
    uSocks: { value: preset.socks.clone() },
    uHoofDark: { value: preset.hoofDark.clone() },
    uHoofPale: { value: preset.hoofPale.clone() },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.0,
    normalMap: detailTextures.normalMap,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughnessMap: detailTextures.roughnessMap,
    sheen: preset.sheen,
    sheenRoughness: 0.62,
    sheenColor: preset.sheenColor.clone(),
    clearcoat: 0.0,
  });

  material.userData.coatUniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aRegion1;
        attribute vec4 aRegion2;
        attribute vec4 aRegion3;
        attribute vec4 aSocks;
        varying vec4 vRegion1;
        varying vec4 vRegion2;
        varying vec4 vRegion3;
        varying vec4 vSocks;
        varying vec3 vRestPos;
        varying vec3 vRestNorm;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRegion1 = aRegion1;
        vRegion2 = aRegion2;
        vRegion3 = aRegion3;
        vSocks = aSocks;
        vRestPos = position;
        vRestNorm = normal;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uBaseColor;
        uniform vec3 uHighlightColor;
        uniform vec3 uShadowColor;
        uniform vec3 uPointColor;
        uniform float uPointStrength;
        uniform vec3 uMuzzleColor;
        uniform vec3 uBellyTint;
        uniform float uDappleStrength;
        uniform float uDorsalStripe;
        uniform float uBlazeStrength;
        uniform vec4 uSocks;
        uniform vec3 uHoofDark;
        uniform vec3 uHoofPale;

        varying vec4 vRegion1;
        varying vec4 vRegion2;
        varying vec4 vRegion3;
        varying vec4 vSocks;
        varying vec3 vRestPos;
        varying vec3 vRestNorm;

        float hHash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float hNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hHash(i + vec3(0,0,0)), hHash(i + vec3(1,0,0)), f.x),
                mix(hHash(i + vec3(0,1,0)), hHash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hHash(i + vec3(0,0,1)), hHash(i + vec3(1,0,1)), f.x),
                mix(hHash(i + vec3(0,1,1)), hHash(i + vec3(1,1,1)), f.x), f.y),
            f.z
          );
        }

        float hFbm(vec3 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 3; i++) {
            v += a * hNoise(p);
            p *= 2.07;
            a *= 0.5;
          }
          return v;
        }

        // Organic multi-scale dappled grey shading (soft overlapping rings, never polka dots!)
        float dappleCell(vec3 p, float scale) {
          vec3 q = p * scale;
          vec3 i = floor(q);
          vec3 f = fract(q);
          float minDist = 1.0;
          for (int z = -1; z <= 1; z++) {
            for (int y = -1; y <= 1; y++) {
              for (int x = -1; x <= 1; x++) {
                vec3 n = vec3(float(x), float(y), float(z));
                vec3 cell = i + n;
                vec3 rnd = vec3(
                  hHash(cell + vec3(1.1, 2.3, 3.7)),
                  hHash(cell + vec3(4.2, 5.1, 1.9)),
                  hHash(cell + vec3(2.8, 3.4, 6.5))
                );
                float d = length(n + rnd - f);
                minDist = min(minDist, d);
              }
            }
          }
          return smoothstep(0.16, 0.62, minDist);
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float hoofMask = smoothstep(0.32, 0.72, vRegion1.x);
        float coronetMask = clamp(vRegion1.y, 0.0, 1.0);
        float muzzleMask = smoothstep(0.15, 0.88, vRegion1.z);
        float nostrilMask = smoothstep(0.15, 0.75, vRegion1.w);
        float eyeSocketMask = smoothstep(0.20, 0.85, vRegion2.x);
        float innerEarMask = smoothstep(0.20, 0.85, vRegion2.y);
        float legPointMask = clamp(vRegion2.z, 0.0, 1.0);
        float earTipMask = clamp(vRegion2.w, 0.0, 1.0);
        float bellyMask = clamp(vRegion3.x, 0.0, 1.0);
        float blazeMask = clamp(vRegion3.y, 0.0, 1.0);
        float mouthMask = smoothstep(0.20, 0.85, vRegion3.z);

        float mottle = hFbm(vRestPos * 6.5);
        float fineMottle = hNoise(vRestPos * 38.0);
        float upFactor = clamp(vRestNorm.y * 0.5 + 0.5, 0.0, 1.0);

        vec3 coat = mix(uShadowColor, uBaseColor, smoothstep(0.12, 0.65, upFactor));
        coat = mix(coat, uHighlightColor, smoothstep(0.55, 0.96, upFactor) * (0.45 + 0.55 * mottle));
        coat *= 0.92 + 0.16 * mottle + (fineMottle - 0.5) * 0.05;

        // Warm underside / flank shading
        coat = mix(coat, uBellyTint, bellyMask * 0.50);

        // Multi-scale organic dapples concentrated naturally on croup, barrel & upper shoulder
        if (uDappleStrength > 0.01) {
          float bodyZone = smoothstep(0.86, 1.24, vRestPos.y) * smoothstep(0.76, 0.30, vRestPos.z);
          vec3 warp = vec3(mottle - 0.5, fineMottle - 0.5, mottle - 0.5) * 0.04;
          float d1 = dappleCell(vRestPos + warp, 9.2);
          float d2 = dappleCell(vRestPos * 1.15 - warp, 14.5);
          float dap = mix(d1, d2, 0.42);
          float dapMask = smoothstep(0.25, 0.85, dap) * bodyZone * uDappleStrength;
          coat = mix(coat, mix(uHighlightColor, uShadowColor * 0.94, dap), dapMask * 0.68);
        }

        // Primitive dorsal eel-stripe (Buckskin)
        if (uDorsalStripe > 0.01) {
          float spineBand = exp(-pow(vRestPos.x / 0.032, 2.0))
                          * smoothstep(1.25, 1.48, vRestPos.y)
                          * smoothstep(0.65, 0.35, vRestPos.z);
          coat = mix(coat, uPointColor, spineBand * uDorsalStripe * 0.88);
        }

        // Feathered dark points on lower legs & ear tips
        float legFeather = (mottle - 0.5) * 0.28 + (fineMottle - 0.5) * 0.12;
        float pts = smoothstep(0.18, 0.88, legPointMask + legFeather) * uPointStrength;
        coat = mix(coat, uPointColor, pts * (1.0 - hoofMask));
        coat = mix(coat, uPointColor, smoothstep(0.32, 0.92, earTipMask) * uPointStrength * 0.88);

        // Warm rosy-tan inner ear fluff
        vec3 earInteriorCol = mix(uHighlightColor * 1.15, vec3(0.58, 0.44, 0.38), 0.45);
        coat = mix(coat, earInteriorCol, innerEarMask * 0.65);

        // Soft dark velvety muzzle, nostrils, eyelids & lip crease
        coat = mix(coat, uMuzzleColor, muzzleMask * 0.86);
        coat = mix(coat, uMuzzleColor * 0.55, eyeSocketMask * 0.72);
        coat = mix(coat, vec3(0.035, 0.022, 0.022), nostrilMask * 0.96);
        coat = mix(coat, vec3(0.075, 0.052, 0.048), mouthMask * 0.72);

        // Crisp organic feathered white forehead star & nasal blaze (narrower, sharper hair border!)
        if (uBlazeStrength > 0.01) {
          float hairEdge = (mottle - 0.5) * 0.14 + (fineMottle - 0.5) * 0.12;
          float centerRibbon = exp(-pow(vRestPos.x / (0.024 + smoothstep(1.80, 1.94, vRestPos.y) * 0.016), 2.0));
          float starZone = smoothstep(1.86, 1.94, vRestPos.y) * smoothstep(1.16, 1.07, vRestPos.z);
          float noseSpan = smoothstep(1.57, 1.63, vRestPos.y) * smoothstep(1.98, 1.90, vRestPos.y);
          float rawBlaze = uBlazeStrength < 0.45
            ? centerRibbon * starZone
            : centerRibbon * max(starZone, noseSpan * 0.92) * smoothstep(0.15, 0.55, blazeMask);
          float blazeShape = smoothstep(0.42, 0.64, rawBlaze + hairEdge);
          vec3 whiteHair = vec3(0.89, 0.87, 0.84) * (0.94 + 0.10 * fineMottle);
          vec3 snipTint = mix(whiteHair, vec3(0.76, 0.58, 0.54), muzzleMask * 0.45);
          coat = mix(coat, snipTint, blazeShape * min(1.0, uBlazeStrength * 1.35) * (1.0 - nostrilMask));
        }

        // Organic feathered white leg socks (jagged natural hair transition, never a hard band!)
        float sockRaw = dot(vSocks, uSocks);
        float sockJitter = (hNoise(vec3(vRestPos.x * 26.0, vRestPos.y * 8.0, vRestPos.z * 26.0)) - 0.5) * 0.34
                         + (fineMottle - 0.5) * 0.14;
        float sockMask = smoothstep(0.36, 0.62, sockRaw + sockJitter);
        vec3 sockWhite = vec3(0.87, 0.85, 0.81) * (0.94 + 0.10 * fineMottle);
        coat = mix(coat, sockWhite, sockMask * (1.0 - hoofMask));

        // Hooves: keratin vertical fibers + growth rings, pale horn under white socks!
        if (hoofMask > 0.01) {
          float legSockPresence =
            (vRestPos.z > 0.0 ? (vRestPos.x > 0.0 ? uSocks.x : uSocks.y)
                              : (vRestPos.x > 0.0 ? uSocks.z : uSocks.w));
          vec3 hoofBase = mix(uHoofDark, uHoofPale, smoothstep(0.25, 0.75, legSockPresence));
          float verticalFibers = hNoise(vec3(vRestPos.x * 160.0, vRestPos.y * 14.0, vRestPos.z * 160.0));
          float growthRings = sin(vRestPos.y * 290.0 + mottle * 3.0) * 0.5 + 0.5;
          vec3 hoofCol = hoofBase * (0.80 + 0.30 * verticalFibers) * (0.92 + 0.14 * growthRings);
          hoofCol *= mix(1.0, 0.72, coronetMask * 0.6);
          hoofCol = mix(hoofCol, vec3(0.24, 0.20, 0.16), smoothstep(0.028, 0.002, vRestPos.y) * 0.45);
          coat = mix(coat, hoofCol, hoofMask);
        }

        diffuseColor.rgb *= coat;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float rHoof = smoothstep(0.35, 0.75, vRegion1.x);
        float rMuzzle = smoothstep(0.25, 0.85, vRegion1.z);
        float rNostril = smoothstep(0.20, 0.80, vRegion1.w);
        roughnessFactor = mix(roughnessFactor, 0.86, rMuzzle * 0.70);
        roughnessFactor = mix(roughnessFactor, 0.42, rHoof);
        roughnessFactor = mix(roughnessFactor, 0.32, rNostril * 0.65);`
      );
  };

  material.customProgramCacheKey = () => 'equus-coat-v2';
  return material;
}

export function applyCoatPreset(coatMaterial, hairMaterials, eyeLidMat, presetKey) {
  const preset = COAT_PRESETS[presetKey];
  if (!preset) return;

  const u = coatMaterial.userData.coatUniforms;
  if (u) {
    u.uBaseColor.value.copy(preset.baseColor);
    u.uHighlightColor.value.copy(preset.highlightColor);
    u.uShadowColor.value.copy(preset.shadowColor);
    u.uPointColor.value.copy(preset.pointColor);
    u.uPointStrength.value = preset.pointStrength;
    u.uMuzzleColor.value.copy(preset.muzzleColor);
    u.uBellyTint.value.copy(preset.bellyTint);
    u.uDappleStrength.value = preset.dappleStrength;
    u.uDorsalStripe.value = preset.dorsalStripe;
    u.uBlazeStrength.value = preset.blazeStrength;
    u.uSocks.value.copy(preset.socks);
    u.uHoofDark.value.copy(preset.hoofDark);
    u.uHoofPale.value.copy(preset.hoofPale);
  }
  coatMaterial.sheen = preset.sheen;
  coatMaterial.sheenColor.copy(preset.sheenColor);

  if (hairMaterials?.mane?.userData?.hairUniforms) {
    hairMaterials.mane.userData.hairUniforms.uRootColor.value.copy(preset.maneColor);
    hairMaterials.mane.userData.hairUniforms.uTipColor.value.copy(preset.maneTipColor);
  }
  if (hairMaterials?.tail?.userData?.hairUniforms) {
    hairMaterials.tail.userData.hairUniforms.uRootColor.value.copy(preset.tailColor);
    hairMaterials.tail.userData.hairUniforms.uTipColor.value.copy(preset.tailTipColor);
  }
  if (hairMaterials?.fetlock?.userData?.hairUniforms) {
    hairMaterials.fetlock.userData.hairUniforms.uRootColor.value.copy(preset.pointColor);
    hairMaterials.fetlock.userData.hairUniforms.uTipColor.value.copy(preset.maneTipColor);
  }
  if (eyeLidMat) {
    eyeLidMat.color.copy(preset.eyeLidColor);
  }
}
