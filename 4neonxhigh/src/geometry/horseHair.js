/**
 * horseHair.js — Lush, silky, multi-layered flowing hair system for Mane, Forelock,
 * Tail, and snugly-rooted Fetlock Tufts.
 *
 * Mane drapes gloriously down the +X (hero camera) side with soft root volume hugging
 * the dorsal neck crest cleanly so it looks rich and natural from EVERY camera angle!
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

function appendRibbonStrand(buffers, points, widths, widthAxisFn, phase, strandShade) {
  const baseVert = buffers.positions.length / 3;
  const segs = points.length - 1;

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = points[i];
    const halfW = widths[i] * 0.5;
    const axis = widthAxisFn(i, t);

    buffers.positions.push(
      p.x - axis.x * halfW, p.y - axis.y * halfW, p.z - axis.z * halfW,
      p.x + axis.x * halfW, p.y + axis.y * halfW, p.z + axis.z * halfW
    );
    buffers.uvs.push(0, t, 1, t);
    buffers.hairMeta.push(t, phase, strandShade, t, phase, strandShade);
  }

  for (let i = 0; i < segs; i++) {
    const a = baseVert + i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    buffers.indices.push(a, b, c, b, d, c);
  }
}

function finalizeHairGeometry(buffers) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geo.setAttribute('aHairMeta', new THREE.Float32BufferAttribute(buffers.hairMeta, 3));
  geo.setIndex(buffers.indices);
  geo.computeVertexNormals();
  return geo;
}

export function createHairMaterial(hairTextures, rootColor, tipColor, motionScale = 1.0) {
  const uniforms = {
    uRootColor: { value: rootColor.clone() },
    uTipColor: { value: tipColor.clone() },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uBounce: { value: 0 },
    uWind: { value: 0.32 },
    uMotionScale: { value: motionScale },
  };

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: hairTextures.map,
    alphaMap: hairTextures.alphaMap,
    alphaTest: 0.28,
    side: THREE.DoubleSide,
    roughness: 0.56,
    metalness: 0.02,
  });

  mat.userData.hairUniforms = uniforms;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aHairMeta;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uBounce;
        uniform float uWind;
        uniform float uMotionScale;
        varying vec3 vHairMeta;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vHairMeta = aHairMeta;
        float tip = aHairMeta.x;
        float flex = tip * tip * uMotionScale;
        float ph = aHairMeta.y;

        float wave1 = sin(uTime * (2.5 + uSpeed * 2.2) + ph * 6.283 - tip * 3.0);
        float wave2 = cos(uTime * (4.0 + uSpeed * 2.9) + ph * 11.4 - tip * 4.2);

        transformed.x += (wave1 * 0.020 + wave2 * 0.007) * (uWind + uSpeed * 0.30) * flex;
        transformed.z -= (0.048 * uSpeed + 0.014 * uWind + wave1 * 0.012 * (uWind + uSpeed * 0.5)) * flex;
        transformed.y += (uBounce * 0.042 + wave2 * 0.007 * uSpeed) * flex;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uRootColor;
        uniform vec3 uTipColor;
        varying vec3 vHairMeta;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float tipT = clamp(vHairMeta.x, 0.0, 1.0);
        float shade = 0.80 + 0.36 * vHairMeta.z;
        vec3 hairTint = mix(uRootColor, uTipColor, smoothstep(0.15, 0.95, tipT)) * shade;
        diffuseColor.rgb *= hairTint;`
      );
  };

  mat.customProgramCacheKey = () => `equus-hair-v2-${motionScale.toFixed(2)}`;
  return mat;
}

/**
 * Build lush, finely layered flowing Mane draping down the +X side (hero camera side!)
 * plus subtle soft crest-framing locks and a silky contoured Forelock!
 */
export function buildManeAndForelockGeometry(landmarks) {
  const rand = mulberry32(55102);
  const buffers = { positions: [], uvs: [], hairMeta: [], indices: [] };

  const crestCurve = new THREE.CatmullRomCurve3(landmarks.maneCurve);

  // --- 1. LUSH FLOWING MANE (195 delicate overlapping silky locks!) ---
  const strandCount = 195;
  for (let i = 0; i < strandCount; i++) {
    const u = i / (strandCount - 1);
    const rootPos = crestCurve.getPoint(u);
    const tangent = crestCurve.getTangent(u).normalize();

    const layer = i % 3;
    // 85% lush flowing cascade down +X (hero view side!), 15% soft crest-hugging locks on -X
    const drapeSide = i % 7 === 0 ? -1 : 1;

    const env = Math.sin(Math.pow(u, 0.82) * Math.PI);
    const length =
      (drapeSide > 0 ? 0.17 + env * 0.27 : 0.11 + env * 0.15) +
      (rand() - 0.5) * 0.065 +
      layer * 0.022;
    const width = 0.030 + rand() * 0.020;

    // Root embedded 8mm cleanly inside crest ridge so zero floating root edges ever show!
    const start = rootPos.clone().add(
      new THREE.Vector3(
        drapeSide * (0.002 + layer * 0.004 + (rand() - 0.5) * 0.006),
        -0.004 + layer * 0.005,
        (rand() - 0.5) * 0.010
      )
    );

    // Match exact neck half-width contour along u so hair glides smoothly over neck muscle!
    const neckHalfW = 0.088 + u * 0.082 + layer * 0.008;

    const segs = 8;
    const pts = [];
    const widths = [];
    const waveFreq = 2.6 + rand() * 2.4;
    const waveAmp = 0.006 + rand() * 0.010;
    const wavePhase = rand() * Math.PI * 2;
    const sweepBack = -0.065 - u * 0.065 - rand() * 0.035;

    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      // Smooth hug over upper crest curve, then natural gravity drape along side of neck!
      const archOut = Math.sin(Math.min(1, t * 1.65) * Math.PI * 0.5) * neckHalfW * (0.86 + 0.18 * t);
      const dropY = -Math.pow(t, 1.24) * length;
      const crownArch = Math.sin(Math.min(1, t * 2.2) * Math.PI) * (0.014 + layer * 0.006) * (1.0 - t * 0.65);
      const flutter = Math.sin(t * waveFreq + wavePhase) * waveAmp * t;

      pts.push(
        new THREE.Vector3(
          start.x + drapeSide * (archOut + flutter),
          start.y + dropY + crownArch,
          start.z + sweepBack * Math.pow(t, 1.15) + tangent.z * 0.012 * t
        )
      );
      widths.push(width * (0.72 + Math.sin(t * Math.PI * 0.72) * 0.36) * (1.0 - 0.28 * t * t));
    }

    // Align ribbon face nearly tangential to neck surface so it never shows thin razor edges!
    const neckTangent = tangent.clone().normalize();
    const tilt = (rand() - 0.5) * 0.45;
    const sideMix = new THREE.Vector3(drapeSide * 0.25, 0.15, 0.95).normalize();
    const axis = neckTangent.lerp(sideMix, 0.25 + Math.abs(tilt) * 0.30).normalize();

    appendRibbonStrand(buffers, pts, widths, () => axis, rand(), rand());
  }

  // --- 2. SILKY FULL FORELOCK (54 overlapping feathered strands sweeping softly down the brow!) ---
  const foreCount = 54;
  const fOrigin = landmarks.forelockOrigin;
  for (let i = 0; i < foreCount; i++) {
    const spread = (i / (foreCount - 1) - 0.5) * 2.0;
    const layer = i % 3;
    const centerBias = 1.0 - Math.abs(spread) * 0.72;
    const length = 0.14 + centerBias * 0.10 + (rand() - 0.5) * 0.035;
    const width = 0.028 + rand() * 0.015;

    const start = new THREE.Vector3(
      fOrigin.x + spread * 0.030,
      fOrigin.y + 0.008 + layer * 0.005,
      fOrigin.z - 0.012 + (rand() - 0.5) * 0.008
    );

    const segs = 7;
    const pts = [];
    const widths = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      // Arches cleanly off the poll between the ears, draping softly over upper forehead
      const fwd = t * length * 0.78 + Math.sin(t * Math.PI * 0.85) * (0.026 + layer * 0.009);
      const dn = -t * length * 0.72;
      const sideDrift =
        spread * 0.024 * (1.0 - 0.52 * t) +
        0.016 * Math.pow(t, 1.3) +
        Math.sin(t * 3.5 + i) * 0.003 * t;
      pts.push(new THREE.Vector3(start.x + sideDrift, start.y + dn, start.z + fwd));
      // Natural pointed teardrop taper toward tip
      widths.push(width * (0.90 - 0.55 * t));
    }

    const axis = new THREE.Vector3(0.96, (rand() - 0.5) * 0.18, (rand() - 0.5) * 0.22).normalize();
    appendRibbonStrand(buffers, pts, widths, () => axis, rand(), rand());
  }

  return finalizeHairGeometry(buffers);
}

/**
 * Build a full, silky, tapered 250-strand cascading Equine Tail!
 * Lushly clothes the entire upper tail dock arch from croup to tip and feathers into
 * an authentic pointed natural tail silhouette (never a blunt horizontal cutoff!).
 */
export function buildTailGeometry(landmarks) {
  const rand = mulberry32(88421);
  const buffers = { positions: [], uvs: [], hairMeta: [], indices: [] };

  const dockCurve = new THREE.CatmullRomCurve3(landmarks.tailDockCurve);

  const strandCount = 250;
  for (let i = 0; i < strandCount; i++) {
    // First 60 strands wrap densely around the very top/sides of the dock arch (u in 0..0.38)
    // so there is ZERO bare dock gap where the tail exits the croup!
    const isUpperMantle = i < 60;
    const u = isUpperMantle ? rand() * 0.38 : Math.pow(rand(), 0.72);
    const dockPt = dockCurve.getPoint(u);
    const angle = isUpperMantle
      ? (rand() - 0.5) * Math.PI * 1.4 + Math.PI * 0.5 // biased over top & sides of dock arch!
      : (i * 2.39996 + rand() * 0.35) % (Math.PI * 2);

    const dockRadius = 0.030 * (1.0 - u * 0.52) + 0.004;
    const ox = Math.cos(angle) * dockRadius;
    const oyBias = Math.sin(angle) * dockRadius * 0.70 + (isUpperMantle ? 0.012 : 0.0);
    const ozBias = -Math.abs(Math.sin(angle)) * dockRadius * 0.35 - 0.004;

    const start = new THREE.Vector3(
      dockPt.x + ox,
      dockPt.y + oyBias,
      dockPt.z + ozBias
    );

    // Authentic pointed teardrop tail length distribution:
    // Central core strands reach down to y ~ 0.25, outer flared strands feather higher (0.48..0.72)!
    const radialRank = rand(); // 0 = inner core longest, 1 = outer feathered layers shorter
    const targetEndY = isUpperMantle
      ? 0.42 + radialRank * 0.38
      : 0.24 + Math.pow(radialRank, 1.35) * 0.44;
    const dropDist = Math.max(0.42, start.y - targetEndY);
    const width = 0.028 + rand() * 0.020;

    // Inner long strands stay tighter at bottom, outer shorter strands flare gently outward
    const flareOut = (0.025 + radialRank * 0.068) * (isUpperMantle ? 0.85 : 1.0);
    const backSweep = isUpperMantle
      ? -0.14 - rand() * 0.09
      : -0.08 - rand() * 0.10;
    const waveFreq = 2.1 + rand() * 2.3;
    const waveAmp = 0.009 + rand() * 0.014;
    const wavePhase = rand() * Math.PI * 2;

    const segs = 9;
    const pts = [];
    const widths = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      // Graceful S-arch smoothly clothing the dock curve before cascading down
      const archBack = Math.sin(Math.min(1, t * 1.35) * Math.PI * 0.5) * backSweep;
      const archLift = isUpperMantle ? Math.sin(Math.min(1, t * 2.2) * Math.PI) * 0.024 * (1 - t) : 0;
      const radialSpread = Math.sin(t * Math.PI * 0.72) * flareOut * (1.0 - 0.30 * t * t);
      const x = start.x + Math.cos(angle) * radialSpread + Math.sin(t * waveFreq + wavePhase) * waveAmp * t;
      const y = start.y + archLift - dropDist * Math.pow(t, 1.12);
      const z = start.z + archBack + Math.sin(angle) * radialSpread * 0.45 + Math.cos(t * waveFreq + wavePhase) * waveAmp * 0.5 * t;

      pts.push(new THREE.Vector3(x, y, z));
      widths.push(width * (0.68 + Math.sin(t * Math.PI * 0.78) * 0.44) * (1.0 - 0.38 * t * t));
    }

    const tanAngle = angle + Math.PI * 0.5 + (rand() - 0.5) * 1.05;
    const axis = new THREE.Vector3(Math.cos(tanAngle), (rand() - 0.5) * 0.15, Math.sin(tanAngle)).normalize();

    appendRibbonStrand(buffers, pts, widths, () => axis, rand(), rand());
  }

  return finalizeHairGeometry(buffers);
}

/**
 * Subtle, snugly-embedded fetlock tufts hugging the posterior fetlock contour!
 */
export function buildFetlockTuftsGeometry(landmarks) {
  const rand = mulberry32(31904);
  const buffers = { positions: [], uvs: [], hairMeta: [], indices: [] };

  const legKeys = ['FL', 'FR', 'HL', 'HR'];
  for (const key of legKeys) {
    const origin = landmarks.fetlocks[key];
    for (let i = 0; i < 16; i++) {
      const spread = (i / 15 - 0.5) * 2.0;
      // Root cleanly inside posterior fetlock skin surface!
      const start = new THREE.Vector3(
        origin.x + spread * 0.018,
        origin.y + 0.012 + (rand() - 0.5) * 0.008,
        origin.z + 0.022 - Math.abs(spread) * 0.008
      );
      const len = 0.048 + (1.0 - Math.abs(spread)) * 0.024 + rand() * 0.010;
      const w = 0.015 + rand() * 0.008;
      const segs = 4;
      const pts = [];
      const widths = [];
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        pts.push(
          new THREE.Vector3(
            start.x + spread * 0.010 * t,
            start.y - len * t,
            start.z - 0.018 * Math.pow(t, 1.35)
          )
        );
        widths.push(w * (1.0 - 0.45 * t));
      }
      const axis = new THREE.Vector3(Math.cos(spread * 0.55), 0, Math.sin(spread * 0.55)).normalize();
      appendRibbonStrand(buffers, pts, widths, () => axis, rand(), rand());
    }
  }

  return finalizeHairGeometry(buffers);
}
