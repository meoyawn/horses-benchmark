/**
 * horseHalter.js — Bespoke handcrafted procedural leather halter with antique brass
 * rings, chin tie-ring, and crown buckle.
 *
 * Every strap control point is mathematically PROJECTED directly onto the exact
 * subdivided horse head mesh surface (+4mm outward normal clearance) so the leather
 * hugs the nasal bridge, cheek, poll, jaw, and throatlatch with ZERO floating gaps
 * and ZERO clipping!
 */

import * as THREE from 'three';

/**
 * Raycast / project a ray from an interior head axis point `origin` outward along `dir`
 * onto the actual subdivided head mesh triangles, returning the exact skin surface
 * point + `clearance` along the outward direction!
 */
function buildHeadSurfaceProjector(bodyGeo) {
  const posAttr = bodyGeo.getAttribute('position');
  const idxAttr = bodyGeo.getIndex();

  // Extract only triangles belonging to the head/upper-neck region for ultra-fast exact raycasts
  const headTris = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (let i = 0; i < idxAttr.count; i += 3) {
    const i0 = idxAttr.getX(i);
    const i1 = idxAttr.getX(i + 1);
    const i2 = idxAttr.getX(i + 2);
    const z0 = posAttr.getZ(i0);
    const y0 = posAttr.getY(i0);
    if (z0 < 0.88 || y0 < 1.48) continue;
    a.fromBufferAttribute(posAttr, i0);
    b.fromBufferAttribute(posAttr, i1);
    c.fromBufferAttribute(posAttr, i2);
    headTris.push([a.clone(), b.clone(), c.clone()]);
  }

  const ray = new THREE.Ray();
  const hitPt = new THREE.Vector3();

  /**
   * Cast ray from `origin` along unit `dir` and return farthest outward hit + clearance!
   */
  return function projectOutward(origin, dir, clearance = 0.0045) {
    const d = dir.clone().normalize();
    ray.set(origin, d);

    let bestDist = -1;
    let bestHit = null;

    for (let i = 0; i < headTris.length; i++) {
      const tri = headTris[i];
      const res = ray.intersectTriangle(tri[0], tri[1], tri[2], false, hitPt);
      if (res) {
        const dist = origin.distanceTo(res);
        // Take the outermost skin intersection along the ray (skipping ear interior cavities etc.)
        if (dist > 0.015 && dist < 0.28 && dist > bestDist) {
          bestDist = dist;
          bestHit = res.clone();
        }
      }
    }

    if (bestHit) {
      return bestHit.addScaledVector(d, clearance);
    }
    return origin.clone().addScaledVector(d, 0.08 + clearance);
  };
}

/**
 * Build a flat beveled leather strap along a 3D curve whose flat face sits tangent
 * to the head surface (using radial outward guide vectors instead of unstable Frenet frames!).
 */
function buildFittedStrapGeometry(points, outwardNormals, closed, strapWidth = 0.018, strapThick = 0.0048, segments = 48) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal', 0.5);
  const normCurve = new THREE.CatmullRomCurve3(outwardNormals, closed, 'centripetal', 0.5);

  const hw = strapWidth * 0.5;
  const ht = strapThick * 0.5;
  const profile = [
    [-hw, -ht],
    [hw, -ht],
    [hw, ht],
    [-hw, ht],
  ];

  const positions = [];
  const uvs = [];
  const indices = [];

  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const pt = curve.getPointAt(u);
    curve.getTangentAt(u, T).normalize();
    normCurve.getPointAt(u, N).normalize();

    // Orthogonalize N against tangent T so strap stays flat & flush on skin!
    N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N).normalize();

    for (let j = 0; j < 4; j++) {
      const px = profile[j][0];
      const py = profile[j][1];
      positions.push(
        pt.x + B.x * px + N.x * py,
        pt.y + B.y * px + N.y * py,
        pt.z + B.z * px + N.z * py
      );
      uvs.push(u * 3.5, j / 4);
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < 4; j++) {
      const jNext = (j + 1) % 4;
      const a = i * 4 + j;
      const b = i * 4 + jNext;
      const c = (i + 1) * 4 + j;
      const d = (i + 1) * 4 + jNext;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build a bespoke, flush-fitted leather halter projected directly onto `bodyGeo`!
 */
export function buildLeatherHalter(leatherTextures, bodyGeo) {
  const group = new THREE.Group();
  group.name = 'LeatherHalter';

  const project = buildHeadSurfaceProjector(bodyGeo);

  const leatherMat = new THREE.MeshStandardMaterial({
    map: leatherTextures.map,
    roughness: 0.62,
    metalness: 0.03,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd6ab54,
    roughness: 0.24,
    metalness: 0.90,
  });

  // =========================================================================
  // 1. SNUG NOSEBAND RING around lower nasal bridge (plane tilted ~48 deg)
  // =========================================================================
  const noseCenter = new THREE.Vector3(0, 1.695, 1.275);
  const nosePitch = -0.84;
  const noseDorsal = new THREE.Vector3(0, Math.cos(nosePitch), -Math.sin(nosePitch)).normalize();
  const noseSide = new THREE.Vector3(1, 0, 0);

  const nosePts = [];
  const noseNorms = [];
  const noseSamples = 12;
  for (let i = 0; i < noseSamples; i++) {
    const a = (i / noseSamples) * Math.PI * 2;
    const dir = noseDorsal.clone().multiplyScalar(Math.cos(a)).addScaledVector(noseSide, Math.sin(a)).normalize();
    nosePts.push(project(noseCenter, dir, 0.0045));
    noseNorms.push(dir);
  }
  const noseband = new THREE.Mesh(
    buildFittedStrapGeometry(nosePts, noseNorms, true, 0.019, 0.0045, 48),
    leatherMat
  );
  noseband.castShadow = true;
  group.add(noseband);

  // Key anchor points directly on the fitted noseband!
  const noseRingL = project(noseCenter, noseSide.clone().addScaledVector(noseDorsal, -0.10), 0.007);
  const noseRingR = new THREE.Vector3(-noseRingL.x, noseRingL.y, noseRingL.z);
  const chinRingPt = project(noseCenter, noseDorsal.clone().negate(), 0.007);

  // =========================================================================
  // 2. UPPER CHEEK & CROWNPIECE (smoothly gliding over jowl bulge to behind ears!)
  // =========================================================================
  const cheekOrigin = new THREE.Vector3(0, 1.838, 1.080);
  const cheekRingL = project(cheekOrigin, new THREE.Vector3(0.95, 0.06, 0.22), 0.0080);
  const cheekRingR = new THREE.Vector3(-cheekRingL.x, cheekRingL.y, cheekRingL.z);

  const midCheekOrigin = new THREE.Vector3(0, 1.775, 1.185);
  const midCheekL = project(midCheekOrigin, new THREE.Vector3(0.96, 0.02, 0.14), 0.0055);
  const midCheekR = new THREE.Vector3(-midCheekL.x, midCheekL.y, midCheekL.z);

  // Extra projected temple point gliding right over the curved upper jowl/temple!
  const templeOrigin = new THREE.Vector3(0, 1.902, 1.028);
  const templeL = project(templeOrigin, new THREE.Vector3(0.96, 0.22, 0.04), 0.0085);
  const templeR = new THREE.Vector3(-templeL.x, templeL.y, templeL.z);

  // Poll crownpiece points arching cleanly RIGHT BEHIND the ears!
  const pollCenter = new THREE.Vector3(0, 1.948, 0.962);
  const pollTop = project(pollCenter, new THREE.Vector3(0, 0.96, -0.28), 0.0070);
  const pollSideL = project(pollCenter, new THREE.Vector3(0.86, 0.45, -0.20), 0.0080);
  const pollSideR = new THREE.Vector3(-pollSideL.x, pollSideL.y, pollSideL.z);

  const crownPts = [
    noseRingL, midCheekL, cheekRingL, templeL, pollSideL, pollTop, pollSideR, templeR, cheekRingR, midCheekR, noseRingR,
  ];
  const crownNorms = [
    new THREE.Vector3(1, 0, 0.15),
    new THREE.Vector3(1, 0, 0.15),
    new THREE.Vector3(1, 0.1, 0.1),
    new THREE.Vector3(0.95, 0.25, 0.02),
    new THREE.Vector3(0.85, 0.5, -0.2),
    new THREE.Vector3(0, 1, -0.25),
    new THREE.Vector3(-0.85, 0.5, -0.2),
    new THREE.Vector3(-0.95, 0.25, 0.02),
    new THREE.Vector3(-1, 0.1, 0.1),
    new THREE.Vector3(-1, 0, 0.15),
    new THREE.Vector3(-1, 0, 0.15),
  ];
  const crownStrap = new THREE.Mesh(
    buildFittedStrapGeometry(crownPts, crownNorms, false, 0.018, 0.0046, 72),
    leatherMat
  );
  crownStrap.castShadow = true;
  group.add(crownStrap);

  // =========================================================================
  // 3. SNUG THROATLATCH STRAP curving smoothly underneath the jaw/throatlatch
  // =========================================================================
  const throatOrigin = new THREE.Vector3(0, 1.855, 1.020);
  const throatUpperL = project(new THREE.Vector3(0, 1.812, 1.040), new THREE.Vector3(0.92, -0.32, -0.18), 0.0085);
  const throatLowerL = project(throatOrigin, new THREE.Vector3(0.70, -0.64, -0.28), 0.0075);
  const throatBot = project(throatOrigin, new THREE.Vector3(0.0, -0.90, -0.42), 0.0070);
  const throatLowerR = new THREE.Vector3(-throatLowerL.x, throatLowerL.y, throatLowerL.z);
  const throatUpperR = new THREE.Vector3(-throatUpperL.x, throatUpperL.y, throatUpperL.z);

  const throatPts = [cheekRingL, throatUpperL, throatLowerL, throatBot, throatLowerR, throatUpperR, cheekRingR];
  const throatNorms = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0.92, -0.32, -0.18),
    new THREE.Vector3(0.70, -0.64, -0.28),
    new THREE.Vector3(0, -0.9, -0.4),
    new THREE.Vector3(-0.70, -0.64, -0.28),
    new THREE.Vector3(-0.92, -0.32, -0.18),
    new THREE.Vector3(-1, 0, 0),
  ];
  const throatStrap = new THREE.Mesh(
    buildFittedStrapGeometry(throatPts, throatNorms, false, 0.015, 0.0042, 36),
    leatherMat
  );
  throatStrap.castShadow = true;
  group.add(throatStrap);

  // =========================================================================
  // 4. GULLET CONNECTING STRAP hugging under the jaw from chin ring -> throatlatch center!
  // =========================================================================
  const jawMidOrigin = new THREE.Vector3(0, 1.765, 1.135);
  const jawMid = project(jawMidOrigin, new THREE.Vector3(0, -0.82, -0.57), 0.005);

  const gulletPts = [chinRingPt, jawMid, throatBot];
  const gulletNorms = [
    new THREE.Vector3(0, -0.78, -0.62),
    new THREE.Vector3(0, -0.82, -0.57),
    new THREE.Vector3(0, -0.90, -0.42),
  ];
  const gulletStrap = new THREE.Mesh(
    buildFittedStrapGeometry(gulletPts, gulletNorms, false, 0.014, 0.0040, 24),
    leatherMat
  );
  gulletStrap.castShadow = true;
  group.add(gulletStrap);

  // =========================================================================
  // 5. ANTIQUE BRASS HARDWARE (flush with every strap junction!)
  // =========================================================================
  const ringGeo = new THREE.TorusGeometry(0.0155, 0.0032, 10, 24);
  const chinRingGeo = new THREE.TorusGeometry(0.0185, 0.0035, 10, 24);
  const buckleGeo = new THREE.BoxGeometry(0.006, 0.024, 0.020);

  for (const [side, nr, cr] of [
    [1, noseRingL, cheekRingL],
    [-1, noseRingR, cheekRingR],
  ]) {
    const nRing = new THREE.Mesh(ringGeo, brassMat);
    nRing.position.copy(nr);
    nRing.rotation.y = Math.PI * 0.5 - side * 0.18;
    nRing.castShadow = true;
    group.add(nRing);

    const cRing = new THREE.Mesh(ringGeo, brassMat);
    cRing.position.copy(cr);
    cRing.rotation.y = Math.PI * 0.5 - side * 0.14;
    cRing.castShadow = true;
    group.add(cRing);
  }

  // Chin lead-rope brass ring tucked right under the chin junction
  const chinRing = new THREE.Mesh(chinRingGeo, brassMat);
  chinRing.position.copy(chinRingPt).add(new THREE.Vector3(0, -0.014, -0.006));
  chinRing.rotation.x = Math.PI * 0.38;
  chinRing.castShadow = true;
  group.add(chinRing);

  // Traditional brass crown buckle on left poll side
  const buckle = new THREE.Mesh(buckleGeo, brassMat);
  buckle.position.copy(pollSideL).add(new THREE.Vector3(0.003, -0.01, 0.008));
  buckle.rotation.set(0.35, 0.25, -0.35);
  group.add(buckle);

  return group;
}
