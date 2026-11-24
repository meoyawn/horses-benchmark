/**
 * horseMesh.js — Anatomically sculpted procedural Warmblood/Thoroughbred 3D horse
 * built from scratch using a manifold quad control cage, Pixar Catmull-Clark subdivision,
 * anatomical muscle/tendon sculpting, and separate multi-layer realistic eyes.
 *
 * Coordinate convention:
 *   +Z = forward (chest -> nose)
 *   +Y = up (ground y = 0, withers ~1.62m, poll ~2.06m)
 *   +X = horse's left side (mirrored symmetrically across X = 0)
 */

import * as THREE from 'three';
import { QuadMesh } from './quadMesh.js';

/**
 * Evaluate an anatomically shaped half-cross-section (j = 0..8, dorsal -> ventral).
 */
function sampleSection(spec, j) {
  const ANGLES = [
    0.0,            // 0: dorsal centerline (spine / crest / nasal bridge)
    0.13 * Math.PI, // 1: upper-dorsal (withers slope / brow / bridge edge)
    0.27 * Math.PI, // 2: upper-lateral (hip / scapula / eye socket / nostril)
    0.42 * Math.PI, // 3: mid-upper side (ribcage / cheek / facial crest)
    0.56 * Math.PI, // 4: mid-lateral (widest barrel / shoulder / jowl)
    0.70 * Math.PI, // 5: lower-lateral (lower rib / elbow / mouth crease)
    0.82 * Math.PI, // 6: lower-ventral (belly side / pectoral / mandible)
    0.92 * Math.PI, // 7: inner-ventral (sternum / throat / chin side)
    1.0 * Math.PI,  // 8: ventral centerline (belly midline / brisket / windpipe / chin)
  ];

  const theta = ANGLES[j];
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  const rTop = spec.rTop;
  const rBot = spec.rBot;
  const rLat = spec.rLat;

  let localU = cosT >= 0 ? cosT * rTop : cosT * rBot;
  let localX = sinT * rLat;

  // 1) Width bulge bias
  if (spec.widestShift) {
    const shiftFactor = 1.0 + spec.widestShift * (-cosT) * sinT;
    localX *= Math.max(0.45, shiftFactor);
  }
  // 2) Broad muscular croup / flat forehead
  if (spec.dorsalFlat && j === 1) {
    localU += spec.dorsalFlat * 0.14 * rTop;
    localX *= 1.0 + spec.dorsalFlat * 0.28;
  }
  if (spec.dorsalGroove && j === 0) {
    localU -= spec.dorsalGroove;
  }
  // 3) Prominent withers ridge & arched neck crest
  if (spec.dorsalPinch && (j === 1 || j === 2)) {
    const f = j === 1 ? 0.30 : 0.14;
    localX *= 1.0 - spec.dorsalPinch * f;
  }
  // 4) Jugular groove along neck sides
  if (spec.jugular && (j === 4 || j === 5)) {
    localX -= spec.jugular * (j === 5 ? 1.0 : 0.65);
  }
  // 5) Paired sculpted pectoral chest muscles with visible midline cleavage!
  if (spec.pectoral) {
    if (j === 5) localX += spec.pectoral * 0.018;
    if (j === 6 || j === 7) {
      localU -= spec.pectoral * 0.036;
      localX += spec.pectoral * 0.014;
    }
    if (j === 8) localU += spec.pectoral * 0.024;
  }
  // 6) Sweeping rounded equine jowl / masseter cheek muscle!
  if (spec.jowl) {
    if (j === 4) localX += spec.jowl * 0.016;
    if (j === 5) {
      localX += spec.jowl * 0.032;
      localU -= spec.jowl * 0.022;
    }
    if (j === 6) {
      localX += spec.jowl * 0.024;
      localU -= spec.jowl * 0.036;
    }
    if (j === 7) {
      localU -= spec.jowl * 0.016;
    }
    // Slight intermandibular groove right between the left/right jawbones!
    if (j === 8) localU += spec.jowl * 0.012;
  }
  // 7) Supraorbital brow ridge & broad forehead
  if (spec.brow) {
    if (j === 1) {
      localX += spec.brow * 0.018;
      localU += spec.brow * 0.010;
    }
    if (j === 2) {
      localX += spec.brow * 0.008;
    }
  }
  // 8) Facial crest bony ridge & refined cheek hollow
  if (spec.facialCrest) {
    if (j === 2) localX += spec.facialCrest * 0.012;
    if (j === 3) localX += spec.facialCrest * 0.006;
    if (j === 4) localX -= spec.facialCrest * 0.007;
  }
  // 9) Soft nostril flare & mouth crease along muzzle
  if (spec.nostrilFlare && (j === 2 || j === 3)) {
    localX += spec.nostrilFlare * (j === 2 ? 0.013 : 0.009);
  }
  if (spec.mouthCrease && j === 5) {
    localX -= spec.mouthCrease * 0.013;
  }

  if (j === 0 || j === 8) localX = 0;

  const cosP = Math.cos(spec.pitch);
  const sinP = Math.sin(spec.pitch);

  const y = spec.cy + localU * cosP;
  const z = spec.cz - localU * sinP + (spec.zBias ? spec.zBias(j) : 0);

  return { x: localX, y, z };
}

/**
 * Cap an open 9-vertex half-loop cleanly against X=0 using 6 pure quads.
 */
function capHalfLoop(mesh, loop, centerPoints, isFront = false, attrs = null) {
  const cVerts = centerPoints.map((pt, idx) => {
    const src = mesh.verts[loop[idx + 2]];
    const a = { ...src.attrs, ...(attrs || {}) };
    return mesh.addVert(0, pt.y, pt.z, a, src.tag);
  });

  const quads = [
    [loop[0], loop[1], loop[2], cVerts[0]],
    [cVerts[0], loop[2], loop[3], cVerts[1]],
    [cVerts[1], loop[3], loop[4], cVerts[2]],
    [cVerts[2], loop[4], loop[5], cVerts[3]],
    [cVerts[3], loop[5], loop[6], cVerts[4]],
    [cVerts[4], loop[6], loop[7], loop[8]],
  ];

  const created = [];
  for (const q of quads) {
    created.push(mesh.addFace(isFront ? [...q].reverse() : q));
  }
  return { faces: created, centerVerts: cVerts };
}

function orderLoopAngles(mesh, loop) {
  let cx = 0, cy = 0, cz = 0;
  for (const vi of loop) {
    cx += mesh.verts[vi].x;
    cy += mesh.verts[vi].y;
    cz += mesh.verts[vi].z;
  }
  cx /= loop.length;
  cy /= loop.length;
  cz /= loop.length;

  return loop.map((vi) => {
    const v = mesh.verts[vi];
    return Math.atan2(v.x - cx, v.z - cz);
  });
}

function extrudeLeg(mesh, baseLoop, rings, sideTag, sockAttrKey) {
  const baseAngles = orderLoopAngles(mesh, baseLoop);
  let currLoop = baseLoop;

  const n = baseLoop.length;
  let startIdx = 0;
  let bestAbs = Infinity;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(baseAngles[i]);
    if (a < bestAbs) {
      bestAbs = a;
      startIdx = i;
    }
  }
  const dAngle = Math.atan2(
    Math.sin(baseAngles[(startIdx + 1) % n] - baseAngles[startIdx]),
    Math.cos(baseAngles[(startIdx + 1) % n] - baseAngles[startIdx])
  );
  const dirSign = dAngle >= 0 ? 1 : -1;

  const slotAngles = new Array(n);
  for (let k = 0; k < n; k++) {
    const idx = (startIdx + k) % n;
    slotAngles[idx] = dirSign * (k / n) * Math.PI * 2;
  }

  for (let rIdx = 0; rIdx < rings.length; rIdx++) {
    const r = rings[rIdx];
    const tiltCos = Math.cos(r.tiltX || 0);
    const tiltSin = Math.sin(r.tiltX || 0);

    currLoop = mesh.extrudeLoop(currLoop, (_v, i) => {
      const ang = slotAngles[i];
      const sinA = Math.sin(ang);
      const cosA = Math.cos(ang);

      const rx = r.rx;
      const rz = cosA >= 0 ? (r.rzFront ?? r.rz) : (r.rzBack ?? r.rz);

      let localZ = cosA * rz;
      let localX = sinA * rx;

      if (r.flatFront && cosA > 0.25) {
        localZ -= r.flatFront * (cosA - 0.25) * rz;
        localX *= 1.0 + r.flatFront * 0.14;
      }
      if (r.backPoint && cosA < -0.22) {
        localZ -= r.backPoint * Math.pow(-cosA, 1.45);
        localX *= 1.0 - Math.abs(cosA) * 0.16;
      }
      if (r.tendonGroove && cosA < 0.08 && cosA > -0.82) {
        localX *= 1.0 - r.tendonGroove * Math.abs(sinA) * 0.22;
      }
      if (r.hoofShape) {
        if (cosA > 0) localZ *= 1.14;
        else localX *= 0.88 + 0.12 * (1 + cosA);
      }

      const y = r.cy - localZ * tiltSin;
      const z = r.cz + localZ * tiltCos;
      const x = r.cx + localX;

      const attrs = {
        hoof: r.hoof || 0,
        coronet: r.coronet || 0,
        legPoint: r.legPoint || 0,
        belly: 0,
        muzzle: 0,
        nostril: 0,
        mouth: 0,
        eyeSocket: 0,
        innerEar: 0,
        earTip: 0,
        blaze: 0,
        tailDock: 0,
        [sockAttrKey]: r.sock || 0,
      };

      return { x, y, z, attrs, tag: `${sideTag}_${r.name}` };
    });

    if (r.crease) mesh.setLoopCrease(currLoop, r.crease, true);
  }

  mesh.capLoop(
    currLoop,
    { x: 0, y: 0.012, z: -0.005 },
    { hoof: 1, legPoint: 1, [sockAttrKey]: 0 },
    false
  );

  return { lastLoop: currLoop };
}

/**
 * Extrude an authentic tulip-curved cupped Warmblood ear!
 * Wider cupped mid-belly tapering smoothly inward into a gently curved equine tip.
 */
function extrudeEar(mesh, baseLoop) {
  const baseAngles = orderLoopAngles(mesh, baseLoop);
  const n = baseLoop.length;

  let startIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(Math.atan2(Math.sin(baseAngles[i] - 0.35), Math.cos(baseAngles[i] - 0.35)));
    if (d < bestDiff) {
      bestDiff = d;
      startIdx = i;
    }
  }
  const dAngle = Math.atan2(
    Math.sin(baseAngles[(startIdx + 1) % n] - baseAngles[startIdx]),
    Math.cos(baseAngles[(startIdx + 1) % n] - baseAngles[startIdx])
  );
  const dirSign = dAngle >= 0 ? 1 : -1;

  const slotAngles = new Array(n);
  for (let k = 0; k < n; k++) {
    const idx = (startIdx + k) % n;
    slotAngles[idx] = dirSign * (k / n) * Math.PI * 2;
  }

  // Natural Warmblood ear proportions (15cm tall, fuller curved pinna, tips curving subtly inward!)
  const earRings = [
    { cx: 0.072, cy: 2.058, cz: 1.012, rx: 0.030, rz: 0.036, cup: 0.008, earTip: 0.12, inner: 0.50 },
    { cx: 0.088, cy: 2.110, cz: 1.030, rx: 0.032, rz: 0.035, cup: 0.020, earTip: 0.42, inner: 0.95 },
    { cx: 0.092, cy: 2.156, cz: 1.046, rx: 0.022, rz: 0.024, cup: 0.014, earTip: 0.80, inner: 0.88 },
    // Classic equine tulip inward tip bend!
    { cx: 0.080, cy: 2.192, cz: 1.058, rx: 0.009, rz: 0.011, cup: 0.004, earTip: 1.0,  inner: 0.35, crease: 0.42 },
  ];

  let currLoop = baseLoop;
  for (const er of earRings) {
    currLoop = mesh.extrudeLoop(currLoop, (_v, i) => {
      const a = slotAngles[i];
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);

      let localFwd = cosA * er.rz;
      let localSide = sinA * er.rx;

      let innerEar = 0;
      if (cosA > 0.25) {
        localFwd -= er.cup * (cosA - 0.12);
        innerEar = er.inner * Math.min(1, cosA);
      }

      const yaw = 0.42;
      const dx = localSide * Math.cos(yaw) + localFwd * Math.sin(yaw);
      const dz = -localSide * Math.sin(yaw) + localFwd * Math.cos(yaw);

      return {
        x: er.cx + dx,
        y: er.cy + cosA * 0.004,
        z: er.cz + dz,
        attrs: { earTip: er.earTip, innerEar, muzzle: 0, blaze: 0 },
        tag: 'ear_L',
      };
    });
    if (er.crease) mesh.setLoopCrease(currLoop, er.crease, true);
  }

  mesh.capLoop(currLoop, { x: -0.005, y: 0.010, z: 0.004 }, { earTip: 1.0, innerEar: 0 }, false);
}

function insetAndRecessQuad(mesh, faceIdx, insetScale, offset, creaseRim = 0.35, attrs = {}) {
  const f = mesh.faces[faceIdx];
  if (!f || f.length !== 4) return null;

  let cx = 0, cy = 0, cz = 0;
  for (const vi of f) {
    cx += mesh.verts[vi].x;
    cy += mesh.verts[vi].y;
    cz += mesh.verts[vi].z;
  }
  cx /= 4; cy /= 4; cz /= 4;

  const v0 = mesh.verts[f[0]];
  const v1 = mesh.verts[f[1]];
  const v3 = mesh.verts[f[3]];
  const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
  const e2x = v3.x - v0.x, e2y = v3.y - v0.y, e2z = v3.z - v0.z;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  nx /= nLen; ny /= nLen; nz /= nLen;

  const outer = [...f];
  mesh.faces.splice(faceIdx, 1);

  const rim = outer.map((vi) => {
    const v = mesh.verts[vi];
    const x = cx + (v.x - cx) * insetScale + nx * (offset.rimOut || 0);
    const y = cy + (v.y - cy) * insetScale + ny * (offset.rimOut || 0);
    const z = cz + (v.z - cz) * insetScale + nz * (offset.rimOut || 0);
    return mesh.addVert(x, y, z, { ...v.attrs, ...(attrs.rim || {}) }, v.tag);
  });

  for (let i = 0; i < 4; i++) {
    const i1 = (i + 1) % 4;
    mesh.addFace([outer[i], outer[i1], rim[i1], rim[i]]);
  }
  if (creaseRim > 0) mesh.setLoopCrease(rim, creaseRim, true);

  const deepScale = offset.deepScale ?? insetScale * 0.55;
  const depth = offset.depth ?? 0.018;
  const deep = outer.map((vi) => {
    const v = mesh.verts[vi];
    const x = cx + (v.x - cx) * deepScale - nx * depth + (offset.dx || 0);
    const y = cy + (v.y - cy) * deepScale - ny * depth + (offset.dy || 0);
    const z = cz + (v.z - cz) * deepScale - nz * depth + (offset.dz || 0);
    return mesh.addVert(x, y, z, { ...v.attrs, ...(attrs.deep || {}) }, v.tag);
  });

  for (let i = 0; i < 4; i++) {
    const i1 = (i + 1) % 4;
    mesh.addFace([rim[i], rim[i1], deep[i1], deep[i]]);
  }
  mesh.addFace([deep[0], deep[1], deep[2], deep[3]]);

  return { cx, cy, cz, nx, ny, nz, rim, deep };
}

/**
 * Post-subdivision anatomical surface sculpting: real equine muscles, tendons,
 * chest cleavage, jowl contour, nostril flare, and crisp hoof grounding.
 */
function applyAnatomicalSculpt(mesh) {
  const gaussian = (val, center, sigma) => {
    const d = (val - center) / sigma;
    return Math.exp(-0.5 * d * d);
  };

  for (const v of mesh.verts) {
    const ax = Math.abs(v.x);
    const sx = Math.sign(v.x) || 1;
    const y = v.y;
    const z = v.z;

    // 1. Jugular groove along lower neck
    if (z > 0.65 && z < 1.02 && y > 1.35 && y < 1.90 && ax > 0.04) {
      const t = (z - 0.72) / 0.24;
      if (t > -0.15 && t < 1.15) {
        const expectedY = 1.37 + t * 0.44;
        const g = gaussian(y, expectedY, 0.036) * gaussian(t, 0.5, 0.48);
        v.x -= sx * 0.009 * g;
      }
    }

    // 2. Sculpted pectoral chest cleavage on front chest (z > 0.60, y: 0.96..1.34)
    if (z > 0.56 && z < 0.84 && y > 0.92 && y < 1.38) {
      const cleft = gaussian(ax, 0.0, 0.042) * gaussian(y, 1.14, 0.14) * gaussian(z, 0.73, 0.08);
      v.z -= 0.016 * cleft;
      const pecBulge = gaussian(ax, 0.115, 0.065) * gaussian(y, 1.14, 0.13) * gaussian(z, 0.72, 0.09);
      v.z += 0.018 * pecBulge;
      v.x += sx * 0.010 * pecBulge;
    }

    // 3. Shoulder blade / deltoid & triceps relief
    if (z > 0.30 && z < 0.76 && y > 1.02 && y < 1.56 && ax > 0.14) {
      const t = (z - 0.38) / 0.30;
      const expectedY = 1.54 - t * 0.36;
      const ridge = gaussian(y, expectedY, 0.055) * gaussian(t, 0.5, 0.45);
      v.x += sx * 0.013 * ridge;
      const behind = gaussian(z, 0.33, 0.075) * gaussian(y, 1.09, 0.10);
      v.x -= sx * 0.009 * behind;
    }

    // 4. Muscular hindquarter gluteal / thigh sweep & clean flank hollow
    if (z < -0.22 && z > -0.84 && y > 0.90 && y < 1.56 && ax > 0.13) {
      const ridge = gaussian(z, -0.58, 0.095) * gaussian(y, 1.24, 0.16);
      v.x += sx * 0.014 * ridge;
      const flank = gaussian(z, -0.21, 0.08) * gaussian(y, 1.26, 0.12);
      v.x -= sx * 0.014 * flank;
    }

    // 5. Stifle muscular prominence
    if (z < -0.22 && z > -0.48 && y > 0.92 && y < 1.16 && ax > 0.13) {
      const stifle = gaussian(z, -0.36, 0.055) * gaussian(y, 1.03, 0.055);
      v.x += sx * 0.014 * stifle;
      v.z += 0.010 * stifle;
    }

    // 6. Taut Achilles tendon hollow just above and forward of the hock!
    if (z < -0.52 && z > -0.76 && y > 0.56 && y < 0.84 && ax > 0.08) {
      const hollow = gaussian(z, -0.63, 0.030) * gaussian(y, 0.68, 0.068);
      v.x -= sx * 0.012 * hollow;
    }

    // 7. Prominent equine jowl / masseter cheek & supraorbital brow + facial crest!
    if (z > 0.95 && z < 1.36 && y > 1.62 && y < 2.02 && ax > 0.03) {
      // Sweeping rounded cheek jowl!
      const jowl = gaussian(z, 1.04, 0.062) * gaussian(y, 1.80, 0.062);
      v.x += sx * 0.016 * jowl;
      v.y -= 0.012 * jowl;
      // Distinct crisp throatlatch tuck right behind jaw!
      const throat = gaussian(z, 0.96, 0.038) * gaussian(y, 1.80, 0.045);
      v.x -= sx * 0.010 * throat;
      // Facial crest bony cheek ridge
      const t = (z - 1.14) / 0.15;
      if (t > -0.1 && t < 1.1) {
        const expectedY = 1.85 - t * 0.14;
        const crest = gaussian(y, expectedY, 0.018) * gaussian(t, 0.5, 0.45);
        v.x += sx * 0.007 * crest;
      }
    }

    // 8. Sculpted upper nostril wing bulge just above nostril opening
    if (z > 1.32 && z < 1.44 && y > 1.56 && y < 1.68 && ax > 0.025) {
      const wing = gaussian(z, 1.385, 0.022) * gaussian(y, 1.622, 0.018) * (1.0 - v.attrs.nostril);
      v.x += sx * 0.008 * wing;
    }

    // 9. Mouth crease indentation between upper and lower lip
    if (z > 1.32 && y > 1.48 && y < 1.65 && v.attrs.mouth > 0.25) {
      const m = v.attrs.mouth;
      v.x -= sx * 0.005 * m;
      v.z -= 0.004 * m;
    }

    // 10. Clean flat hoof grounding at y = 0
    if (v.attrs.hoof > 0.6 && y < 0.012) {
      v.y = Math.max(0.0, y * 0.12);
    }
  }
}

function computeHorseUVs(verts) {
  const uvs = new Float32Array(verts.length * 2);
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    let u, vv;
    if (v.y < 0.92 && Math.abs(v.x) > 0.06) {
      const isFront = v.z > -0.05;
      const legCz = isFront ? 0.50 : -0.68;
      const legCx = Math.sign(v.x) * (isFront ? 0.145 : 0.155);
      const ang = Math.atan2(v.x - legCx, v.z - legCz);
      u = (ang / (Math.PI * 2) + 0.5) * 0.45 + (isFront ? 0.0 : 0.5);
      vv = v.y * 0.95;
    } else {
      const spineZ = v.z + Math.max(0, v.y - 1.45) * 0.65;
      u = (spineZ + 0.95) * 0.42;
      const ang = Math.atan2(v.x, v.y - 1.25);
      vv = (ang / Math.PI) * 0.5 + 0.5;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = vv;
  }
  return uvs;
}

export function buildHorseBody(subdivLevels = 2) {
  const mesh = new QuadMesh();

  // =========================================================================
  // 1. SPINE CROSS-SECTIONS (22 sculpted anatomical Warmblood rings)
  // =========================================================================
  const spineSpecs = [
    // --- Hindquarters / Croup (s = 0..3) ---
    {
      name: 'buttockRear',
      cy: 1.28, cz: -0.79, pitch: 0.0,
      rTop: 0.190, rBot: 0.205, rLat: 0.220,
      dorsalFlat: 0.42, dorsalGroove: 0.012, widestShift: 0.12,
      attrs: { belly: 0.15 },
    },
    {
      name: 'rumpMid',
      cy: 1.29, cz: -0.63, pitch: 0.02,
      rTop: 0.280, rBot: 0.305, rLat: 0.285,
      dorsalFlat: 0.55, dorsalGroove: 0.016, widestShift: 0.15,
      attrs: { belly: 0.12 },
    },
    {
      name: 'croupPeak',
      cy: 1.28, cz: -0.46, pitch: -0.04,
      rTop: 0.320, rBot: 0.340, rLat: 0.300,
      dorsalFlat: 0.45, dorsalGroove: 0.012, widestShift: 0.12,
      attrs: { belly: 0.15 },
    },
    {
      name: 'stifleFront',
      cy: 1.26, cz: -0.28, pitch: -0.06,
      rTop: 0.285, rBot: 0.305, rLat: 0.272,
      dorsalFlat: 0.25, widestShift: 0.08,
      attrs: { belly: 0.20 },
    },

    // --- Loin / Barrel / Withers / Chest (s = 4..9) ---
    {
      name: 'flankLoin',
      cy: 1.24, cz: -0.10, pitch: -0.02,
      rTop: 0.268, rBot: 0.318, rLat: 0.275,
      dorsalFlat: 0.15, widestShift: 0.08,
      attrs: { belly: 0.28 },
    },
    {
      name: 'midBarrel',
      cy: 1.22, cz: 0.09, pitch: 0.03,
      rTop: 0.276, rBot: 0.345, rLat: 0.308,
      dorsalFlat: 0.10, widestShift: 0.14,
      attrs: { belly: 0.30 },
    },
    {
      name: 'heartGirth',
      cy: 1.23, cz: 0.27, pitch: 0.07,
      rTop: 0.348, rBot: 0.354, rLat: 0.296,
      dorsalPinch: 0.55, widestShift: 0.16,
      attrs: { belly: 0.25 },
    },
    {
      name: 'withersPeak',
      cy: 1.24, cz: 0.44, pitch: 0.10,
      rTop: 0.392, rBot: 0.338, rLat: 0.276,
      dorsalPinch: 0.82, widestShift: 0.18, pectoral: 0.55,
      attrs: { belly: 0.18 },
    },
    {
      name: 'shoulderPoint',
      cy: 1.24, cz: 0.61, pitch: 0.24,
      rTop: 0.362, rBot: 0.302, rLat: 0.264,
      dorsalPinch: 0.70, widestShift: 0.16, pectoral: 1.15,
      attrs: { belly: 0.12 },
    },
    {
      name: 'chestFront',
      cy: 1.33, cz: 0.72, pitch: 0.56,
      rTop: 0.318, rBot: 0.232, rLat: 0.205,
      dorsalPinch: 0.65, pectoral: 0.95,
      attrs: { belly: 0.05 },
    },

    // --- Gracefully Arched Neck (s = 10..13) ---
    {
      name: 'neckLower',
      cy: 1.49, cz: 0.79, pitch: 0.84,
      rTop: 0.245, rBot: 0.165, rLat: 0.144,
      dorsalPinch: 0.65, jugular: 0.011,
    },
    {
      name: 'neckMid',
      cy: 1.67, cz: 0.87, pitch: 0.90,
      rTop: 0.198, rBot: 0.132, rLat: 0.116,
      dorsalPinch: 0.60, jugular: 0.013,
    },
    {
      name: 'neckUpper',
      cy: 1.835, cz: 0.935, pitch: 0.78,
      rTop: 0.158, rBot: 0.102, rLat: 0.096,
      dorsalPinch: 0.50, jugular: 0.011,
    },
    {
      // Clean crisp throatlatch hollow just behind the sweeping jawbone!
      name: 'throatlatch',
      cy: 1.935, cz: 0.975, pitch: 0.22,
      rTop: 0.130, rBot: 0.084, rLat: 0.084,
      dorsalPinch: 0.25,
    },

    // --- Sculpted Noble Warmblood Head with Broad Rounded Equine Jowl! (s = 14..21) ---
    {
      name: 'pollCranium',
      cy: 1.96, cz: 1.015, pitch: -0.38,
      rTop: 0.116, rBot: 0.175, rLat: 0.106,
      dorsalFlat: 0.35, jowl: 0.95,
    },
    {
      name: 'foreheadEyeBack',
      cy: 1.908, cz: 1.072, pitch: -0.70,
      rTop: 0.102, rBot: 0.188, rLat: 0.114,
      dorsalFlat: 0.52, brow: 1.05, jowl: 1.35,
      attrs: { blaze: 0.75 },
    },
    {
      name: 'eyeFrontBrow',
      cy: 1.842, cz: 1.132, pitch: -0.82,
      rTop: 0.086, rBot: 0.138, rLat: 0.095,
      dorsalFlat: 0.30, brow: 0.55, jowl: 0.65, facialCrest: 0.75,
      attrs: { blaze: 0.95 },
    },
    {
      name: 'nasalUpper',
      cy: 1.772, cz: 1.200, pitch: -0.84,
      rTop: 0.072, rBot: 0.096, rLat: 0.076,
      facialCrest: 1.05,
      attrs: { blaze: 1.0 },
    },
    {
      name: 'nasalLower',
      cy: 1.702, cz: 1.268, pitch: -0.84,
      rTop: 0.064, rBot: 0.080, rLat: 0.065,
      facialCrest: 0.65,
      attrs: { blaze: 0.92, muzzle: 0.18 },
    },
    {
      name: 'muzzleBack',
      cy: 1.636, cz: 1.332, pitch: -0.84,
      rTop: 0.068, rBot: 0.072, rLat: 0.071,
      nostrilFlare: 0.75, mouthCrease: 0.50,
      attrs: { blaze: 0.68, muzzle: 0.75 },
    },
    {
      name: 'muzzleNostril',
      cy: 1.584, cz: 1.384, pitch: -0.84,
      rTop: 0.065, rBot: 0.065, rLat: 0.070,
      nostrilFlare: 1.0, mouthCrease: 0.90,
      attrs: { blaze: 0.42, muzzle: 0.96 },
    },
    {
      name: 'muzzleLipRim',
      cy: 1.550, cz: 1.416, pitch: -0.84,
      rTop: 0.052, rBot: 0.048, rLat: 0.054,
      mouthCrease: 0.80,
      zBias: (j) => (j <= 3 ? 0.016 : j === 5 ? -0.008 : j >= 6 ? -0.004 : 0.006),
      attrs: { blaze: 0.22, muzzle: 1.0 },
    },
  ];

  const loops = spineSpecs.map((spec, sIdx) => {
    const loop = [];
    for (let j = 0; j <= 8; j++) {
      const pt = sampleSection(spec, j);
      const attrs = { ...(spec.attrs || {}) };
      if (attrs.belly) attrs.belly = j >= 6 ? attrs.belly * (j === 8 ? 1.0 : 0.75) : 0;
      if (attrs.blaze) attrs.blaze = j === 0 ? attrs.blaze : j === 1 ? attrs.blaze * 0.32 : 0;
      if (sIdx >= 19 && j === 5) attrs.mouth = sIdx === 21 ? 1.0 : 0.85;
      loop.push(mesh.addVert(pt.x, pt.y, pt.z, attrs, `spine_${spec.name}_${j}`));
    }
    return loop;
  });

  const spineFaces = [];
  for (let s = 0; s < loops.length - 1; s++) {
    spineFaces.push(mesh.bridgeLoops(loops[s], loops[s + 1], false, false));
  }

  const rearCenterPts = [
    { y: 1.435, z: -0.852 },
    { y: 1.375, z: -0.868 },
    { y: 1.300, z: -0.870 },
    { y: 1.220, z: -0.848 },
    { y: 1.135, z: -0.810 },
  ];
  const rearCap = capHalfLoop(mesh, loops[0], rearCenterPts, false, { belly: 0.1 });

  const frontCenterPts = [
    { y: 1.590, z: 1.454 },
    { y: 1.568, z: 1.466 },
    { y: 1.544, z: 1.450 },
    { y: 1.522, z: 1.440 },
    { y: 1.504, z: 1.418 },
  ];
  const frontCap = capHalfLoop(mesh, loops[loops.length - 1], frontCenterPts, true, { muzzle: 1.0 });
  mesh.setCrease(loops[19][5], loops[20][5], 0.45);
  mesh.setCrease(loops[20][5], loops[21][5], 0.58);
  mesh.setCrease(loops[21][5], frontCap.centerVerts[2], 0.52);

  // =========================================================================
  // 2. EXTRUDE HINDLEG, FORELEG, EAR, EYE SOCKET & NOSTRIL
  // =========================================================================
  const faceRef = (s, q) => mesh.faces[spineFaces[s][q]];

  const hindPatchRefs = [faceRef(1, 5), faceRef(1, 6), faceRef(2, 5), faceRef(2, 6)];
  const forePatchRefs = [faceRef(6, 5), faceRef(6, 6), faceRef(7, 5), faceRef(7, 6)];
  const earPatchRefs = [faceRef(13, 1), faceRef(14, 1)];
  const eyeFaceRef = faceRef(15, 2);
  const nostrilFaceRef = faceRef(19, 2);
  const tailCapFaceRef = mesh.faces[rearCap.faces[0]];

  const resolveRefs = (refs) =>
    refs.map((r) => {
      const idx = mesh.faces.indexOf(r);
      if (idx === -1) throw new Error('Failed to resolve face ref!');
      return idx;
    });

  // --- 2A. ATHLETIC HINDLEG (muscular thigh/gaskin, crisp angular backward-pointing HOCK!) ---
  const hindExtrude = mesh.extrudeRegion(resolveRefs(hindPatchRefs), (v) => ({
    x: Math.max(0.08, v.x * 0.93),
    y: Math.min(v.y - 0.05, 1.03),
    z: v.z * 0.96 - 0.02,
    attrs: { belly: 0.08 },
    tag: 'hind_L_thighTop',
  }));

  const hindRings = [
    { name: 'stifle',    cx: 0.190, cy: 0.95,  cz: -0.44, rx: 0.098, rzFront: 0.150, rzBack: 0.158, tiltX: 0.18 },
    { name: 'gaskinTop', cx: 0.175, cy: 0.80,  cz: -0.55, rx: 0.075, rzFront: 0.105, rzBack: 0.125, tiltX: 0.26 },
    { name: 'gaskinBot', cx: 0.162, cy: 0.67,  cz: -0.65, rx: 0.049, rzFront: 0.062, rzBack: 0.086, tiltX: 0.20, legPoint: 0.15 },
    // Prominent angular equine HOCK directly under the buttock line!
    { name: 'hock',      cx: 0.152, cy: 0.565, cz: -0.728, rx: 0.042, rzFront: 0.052, rzBack: 0.082, backPoint: 0.028, legPoint: 0.55 },
    { name: 'cannonTop', cx: 0.148, cy: 0.445, cz: -0.710, rx: 0.033, rzFront: 0.041, rzBack: 0.050, tendonGroove: 0.85, legPoint: 0.88 },
    { name: 'cannonBot', cx: 0.146, cy: 0.290, cz: -0.694, rx: 0.032, rzFront: 0.039, rzBack: 0.047, tendonGroove: 0.92, legPoint: 1.0, sock: 0.42 },
    { name: 'fetlock',   cx: 0.146, cy: 0.195, cz: -0.692, rx: 0.043, rzFront: 0.044, rzBack: 0.056, backPoint: 0.015, legPoint: 1.0, sock: 0.90 },
    { name: 'pastern',   cx: 0.146, cy: 0.124, cz: -0.652, rx: 0.036, rzFront: 0.039, rzBack: 0.039, tiltX: -0.52, legPoint: 1.0, sock: 1.0 },
    { name: 'coronet',   cx: 0.146, cy: 0.074, cz: -0.620, rx: 0.050, rzFront: 0.053, rzBack: 0.048, tiltX: -0.22, hoof: 0.45, coronet: 1.0, legPoint: 1.0, sock: 0.88, crease: 0.45 },
    { name: 'hoofMid',   cx: 0.146, cy: 0.035, cz: -0.604, rx: 0.058, rzFront: 0.066, rzBack: 0.054, hoofShape: true, hoof: 1.0, legPoint: 1.0 },
    { name: 'hoofSole',  cx: 0.146, cy: 0.000, cz: -0.594, rx: 0.063, rzFront: 0.076, rzBack: 0.056, hoofShape: true, hoof: 1.0, legPoint: 1.0, crease: 0.95 },
  ];
  extrudeLeg(mesh, hindExtrude.newLoop, hindRings, 'hind_L', 'sockHL');

  // --- 2B. ATHLETIC FORELEG (muscular forearm, bony flat-fronted knee, sturdy cannon & fetlock!) ---
  const foreExtrude = mesh.extrudeRegion(resolveRefs(forePatchRefs), (v) => ({
    x: Math.max(0.08, v.x * 0.92),
    y: Math.min(v.y - 0.04, 0.95),
    z: v.z * 0.92 + 0.04,
    attrs: { belly: 0.05 },
    tag: 'fore_L_armTop',
  }));

  const foreRings = [
    { name: 'elbow',     cx: 0.162, cy: 0.87,  cz: 0.468, rx: 0.086, rzFront: 0.112, rzBack: 0.122, backPoint: 0.018 },
    { name: 'forearmUp', cx: 0.152, cy: 0.725, cz: 0.486, rx: 0.070, rzFront: 0.084, rzBack: 0.086 },
    { name: 'forearmDn', cx: 0.144, cy: 0.600, cz: 0.496, rx: 0.050, rzFront: 0.056, rzBack: 0.058, legPoint: 0.25 },
    // Crisp sculpted bony CARPUS (KNEE) with visible anatomical silhouette!
    { name: 'knee',      cx: 0.139, cy: 0.515, cz: 0.506, rx: 0.047, rzFront: 0.054, rzBack: 0.054, flatFront: 0.38, backPoint: 0.008, legPoint: 0.65 },
    { name: 'cannonTop', cx: 0.136, cy: 0.410, cz: 0.496, rx: 0.033, rzFront: 0.040, rzBack: 0.048, tendonGroove: 0.88, legPoint: 0.90 },
    { name: 'cannonBot', cx: 0.136, cy: 0.285, cz: 0.494, rx: 0.031, rzFront: 0.039, rzBack: 0.046, tendonGroove: 0.95, legPoint: 1.0, sock: 0.24 },
    { name: 'fetlock',   cx: 0.136, cy: 0.192, cz: 0.490, rx: 0.043, rzFront: 0.044, rzBack: 0.056, backPoint: 0.016, legPoint: 1.0, sock: 0.76 },
    { name: 'pastern',   cx: 0.136, cy: 0.120, cz: 0.529, rx: 0.036, rzFront: 0.039, rzBack: 0.039, tiltX: -0.55, legPoint: 1.0, sock: 0.94 },
    { name: 'coronet',   cx: 0.136, cy: 0.072, cz: 0.559, rx: 0.051, rzFront: 0.055, rzBack: 0.050, tiltX: -0.22, hoof: 0.45, coronet: 1.0, legPoint: 1.0, sock: 0.78, crease: 0.45 },
    { name: 'hoofMid',   cx: 0.136, cy: 0.034, cz: 0.577, rx: 0.060, rzFront: 0.068, rzBack: 0.056, hoofShape: true, hoof: 1.0, legPoint: 1.0 },
    { name: 'hoofSole',  cx: 0.136, cy: 0.000, cz: 0.589, rx: 0.066, rzFront: 0.078, rzBack: 0.058, hoofShape: true, hoof: 1.0, legPoint: 1.0, crease: 0.95 },
  ];
  extrudeLeg(mesh, foreExtrude.newLoop, foreRings, 'fore_L', 'sockFL');

  // --- 2C. TULIP-CURVED CUPPED EAR ---
  const earExtrude = mesh.extrudeRegion(resolveRefs(earPatchRefs), (v) => ({
    x: Math.max(0.050, v.x * 0.96 + 0.008),
    y: v.y + 0.014,
    z: v.z + 0.004,
    attrs: { earTip: 0.05 },
    tag: 'ear_L_base',
  }));
  extrudeEar(mesh, earExtrude.newLoop);

  // --- 2D. SCULPTED EYE SOCKET ---
  const eyeIdx = mesh.faces.indexOf(eyeFaceRef);
  const eyeSocketInfo = insetAndRecessQuad(
    mesh,
    eyeIdx,
    0.76,
    { rimOut: 0.008, deepScale: 0.54, depth: 0.022 },
    0.48,
    { rim: { eyeSocket: 0.90 }, deep: { eyeSocket: 1.0 } }
  );

  // --- 2E. SCULPTED RECESSED NOSTRIL ---
  const nostrilIdx = mesh.faces.indexOf(nostrilFaceRef);
  insetAndRecessQuad(
    mesh,
    nostrilIdx,
    0.72,
    { rimOut: 0.007, deepScale: 0.38, depth: 0.023, dy: 0.003, dz: -0.004 },
    0.45,
    { rim: { muzzle: 1.0, nostril: 0.35 }, deep: { muzzle: 1.0, nostril: 1.0 } }
  );

  // =========================================================================
  // 3. MIRROR & WELD ACROSS X = 0
  // =========================================================================
  const origTailFaceIdx = mesh.faces.indexOf(tailCapFaceRef);
  const origFaceCountBeforeMirror = mesh.faces.length;
  mesh.mirrorAndWeld(1e-4);

  // =========================================================================
  // 4. EXTRUDE SYMMETRIC TAIL DOCK ALONG X = 0
  // =========================================================================
  const tailLeftIdx = origTailFaceIdx;
  const tailRightIdx = origFaceCountBeforeMirror + origTailFaceIdx;
  const tailExtrude = mesh.extrudeRegion([tailLeftIdx, tailRightIdx], (v) => ({
    x: v.x * 0.52,
    y: v.y * 0.5 + 1.44 * 0.5,
    z: v.z - 0.055,
    attrs: { tailDock: 1.0 },
    tag: 'tail_dock',
  }));

  const dockRings = [
    { cy: 1.430, cz: -0.930, rx: 0.044, ry: 0.042 },
    { cy: 1.368, cz: -0.990, rx: 0.032, ry: 0.032 },
    { cy: 1.258, cz: -1.036, rx: 0.022, ry: 0.022 },
    { cy: 1.138, cz: -1.064, rx: 0.014, ry: 0.014 },
  ];
  let tcx = 0, tcy = 0;
  for (const vi of tailExtrude.newLoop) {
    tcx += mesh.verts[vi].x;
    tcy += mesh.verts[vi].y;
  }
  tcx /= tailExtrude.newLoop.length;
  tcy /= tailExtrude.newLoop.length;
  const tailXYAngles = tailExtrude.newLoop.map((vi) =>
    Math.atan2(mesh.verts[vi].y - tcy, mesh.verts[vi].x - tcx)
  );

  let tailLoop = tailExtrude.newLoop;
  for (const dr of dockRings) {
    tailLoop = mesh.extrudeLoop(tailLoop, (_v, i) => {
      const a = tailXYAngles[i];
      return {
        x: Math.cos(a) * dr.rx,
        y: dr.cy + Math.sin(a) * dr.ry,
        z: dr.cz,
        attrs: { tailDock: 1.0 },
        tag: 'tail_dock',
      };
    });
  }
  mesh.capLoop(tailLoop, { x: 0, y: -0.025, z: -0.008 }, { tailDock: 1.0 }, false);

  // =========================================================================
  // 5. PIXAR CATMULL-CLARK SUBDIVISION & ANATOMICAL MICRO-SCULPTING
  // =========================================================================
  const smoothMesh = mesh.subdivide(subdivLevels);
  applyAnatomicalSculpt(smoothMesh);
  const topologyReport = smoothMesh.verifyTopology();

  // =========================================================================
  // 6. CONVERT TO THREE.BufferGeometry
  // =========================================================================
  const vCount = smoothMesh.verts.length;
  const positions = new Float32Array(vCount * 3);
  const aRegion1 = new Float32Array(vCount * 4);
  const aRegion2 = new Float32Array(vCount * 4);
  const aRegion3 = new Float32Array(vCount * 4);
  const aSocks = new Float32Array(vCount * 4);

  for (let i = 0; i < vCount; i++) {
    const v = smoothMesh.verts[i];
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;

    const a = v.attrs;
    aRegion1[i * 4] = a.hoof;
    aRegion1[i * 4 + 1] = a.coronet;
    aRegion1[i * 4 + 2] = a.muzzle;
    aRegion1[i * 4 + 3] = a.nostril;

    aRegion2[i * 4] = a.eyeSocket;
    aRegion2[i * 4 + 1] = a.innerEar;
    aRegion2[i * 4 + 2] = a.legPoint;
    aRegion2[i * 4 + 3] = a.earTip;

    aRegion3[i * 4] = a.belly;
    aRegion3[i * 4 + 1] = a.blaze;
    aRegion3[i * 4 + 2] = a.mouth;
    aRegion3[i * 4 + 3] = a.tailDock;

    aSocks[i * 4] = a.sockFL;
    aSocks[i * 4 + 1] = a.sockFR;
    aSocks[i * 4 + 2] = a.sockHL;
    aSocks[i * 4 + 3] = a.sockHR;
  }

  const indices = [];
  for (const f of smoothMesh.faces) {
    if (f.length === 4) {
      const v0 = smoothMesh.verts[f[0]];
      const v1 = smoothMesh.verts[f[1]];
      const v2 = smoothMesh.verts[f[2]];
      const v3 = smoothMesh.verts[f[3]];
      const d02 = (v0.x - v2.x) ** 2 + (v0.y - v2.y) ** 2 + (v0.z - v2.z) ** 2;
      const d13 = (v1.x - v3.x) ** 2 + (v1.y - v3.y) ** 2 + (v1.z - v3.z) ** 2;
      if (d02 <= d13) indices.push(f[0], f[1], f[2], f[0], f[2], f[3]);
      else indices.push(f[0], f[1], f[3], f[1], f[2], f[3]);
    } else {
      for (let k = 1; k < f.length - 1; k++) indices.push(f[0], f[k], f[k + 1]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(computeHorseUVs(smoothMesh.verts), 2));
  geometry.setAttribute('aRegion1', new THREE.BufferAttribute(aRegion1, 4));
  geometry.setAttribute('aRegion2', new THREE.BufferAttribute(aRegion2, 4));
  geometry.setAttribute('aRegion3', new THREE.BufferAttribute(aRegion3, 4));
  geometry.setAttribute('aSocks', new THREE.BufferAttribute(aSocks, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Nestle eyeballs deeper inside the sculpted supraorbital eye sockets
  const eyeCenterL = new THREE.Vector3(
    eyeSocketInfo.cx - eyeSocketInfo.nx * 0.011,
    eyeSocketInfo.cy - eyeSocketInfo.ny * 0.011,
    eyeSocketInfo.cz - eyeSocketInfo.nz * 0.011
  );
  const eyeCenterR = new THREE.Vector3(-eyeCenterL.x, eyeCenterL.y, eyeCenterL.z);
  const eyeNormalL = new THREE.Vector3(eyeSocketInfo.nx, eyeSocketInfo.ny, eyeSocketInfo.nz).normalize();
  const eyeNormalR = new THREE.Vector3(-eyeNormalL.x, eyeNormalL.y, eyeNormalL.z).normalize();

  const landmarks = {
    eyeL: eyeCenterL,
    eyeR: eyeCenterR,
    eyeNormalL,
    eyeNormalR,
    maneCurve: [
      new THREE.Vector3(0, 2.062, 1.01),
      new THREE.Vector3(0, 2.025, 0.935),
      new THREE.Vector3(0, 1.930, 0.840),
      new THREE.Vector3(0, 1.795, 0.720),
      new THREE.Vector3(0, 1.685, 0.590),
      new THREE.Vector3(0, 1.622, 0.445),
    ],
    forelockOrigin: new THREE.Vector3(0, 2.055, 1.032),
    tailDockCurve: [
      new THREE.Vector3(0, 1.445, -0.848),
      new THREE.Vector3(0, 1.425, -0.932),
      new THREE.Vector3(0, 1.355, -0.994),
      new THREE.Vector3(0, 1.245, -1.038),
      new THREE.Vector3(0, 1.125, -1.064),
    ],
    // Seated snugly into the back of the sculpted fetlock knuckle!
    fetlocks: {
      FL: new THREE.Vector3(0.136, 0.192, 0.456),
      FR: new THREE.Vector3(-0.136, 0.192, 0.456),
      HL: new THREE.Vector3(0.146, 0.195, -0.726),
      HR: new THREE.Vector3(-0.146, 0.195, -0.726),
    },
    hooves: {
      FL: new THREE.Vector3(0.136, 0.0, 0.589),
      FR: new THREE.Vector3(-0.136, 0.0, 0.589),
      HL: new THREE.Vector3(0.146, 0.0, -0.594),
      HR: new THREE.Vector3(-0.146, 0.0, -0.594),
    },
  };

  return {
    quadMesh: smoothMesh,
    geometry,
    eyeCenters: { left: eyeCenterL, right: eyeCenterR },
    landmarks,
    topologyReport,
  };
}

export function buildEquineEyes(landmarks, eyeTexture) {
  const group = new THREE.Group();
  group.name = 'EquineEyes';

  const eyeballGeo = new THREE.SphereGeometry(0.022, 24, 18);
  const corneaGeo = new THREE.SphereGeometry(0.0231, 24, 18);
  const lidGeo = new THREE.SphereGeometry(0.0246, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);

  const irisMat = new THREE.MeshStandardMaterial({
    map: eyeTexture,
    roughness: 0.18,
    metalness: 0.02,
  });

  const corneaMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.02,
    metalness: 0.0,
    transmission: 0.92,
    transparent: true,
    opacity: 0.36,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    reflectivity: 1.0,
    ior: 1.38,
    depthWrite: false,
  });

  const lidMat = new THREE.MeshStandardMaterial({
    color: 0x1b1512,
    roughness: 0.78,
    metalness: 0.0,
  });

  const lids = [];

  for (const side of ['L', 'R']) {
    const pos = side === 'L' ? landmarks.eyeL : landmarks.eyeR;
    const norm = side === 'L' ? landmarks.eyeNormalL : landmarks.eyeNormalR;

    const eyeAnchor = new THREE.Group();
    eyeAnchor.position.copy(pos);
    eyeAnchor.lookAt(pos.clone().add(norm));

    const eyeball = new THREE.Mesh(eyeballGeo, irisMat);
    eyeball.rotation.y = -Math.PI * 0.5;
    eyeAnchor.add(eyeball);

    const cornea = new THREE.Mesh(corneaGeo, corneaMat);
    eyeAnchor.add(cornea);

    const upperLid = new THREE.Mesh(lidGeo, lidMat);
    upperLid.rotation.x = -Math.PI * 0.52;
    eyeAnchor.add(upperLid);
    lids.push({ mesh: upperLid, openRot: -Math.PI * 0.52, closedRot: 0.12 });

    group.add(eyeAnchor);
  }

  return { group, lids, lidMat };
}
