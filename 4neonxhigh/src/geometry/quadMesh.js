/**
 * QuadMesh — Pure-JS half-mesh / manifold polygon builder & Pixar Catmull-Clark
 * Subdivision Surface engine with semi-sharp creases and custom per-vertex attributes.
 * Built completely from scratch for procedural organic equine modeling.
 */

const ATTR_KEYS = [
  'hoof',      // 1 on hoof wall/sole, 0 on skin
  'coronet',   // 1 at hoof-skin transition
  'muzzle',    // 1 on soft dark muzzle & nostrils
  'nostril',   // 1 inside nostril cavity
  'mouth',     // 1 along lip crease
  'eyeSocket', // 1 around eye rim / eyelids
  'innerEar',  // 1 inside cupped ear pinna
  'legPoint',  // 1 on lower leg (dark points on Bay/Buckskin)
  'earTip',    // 1 on ear tips (dark points)
  'belly',     // 1 on underside / flank / inner thigh
  'blaze',     // 1 along forehead-to-nose stripe zone
  'sockFL',    // 1 on front-left sock zone
  'sockFR',    // 1 on front-right sock zone
  'sockHL',    // 1 on hind-left sock zone
  'sockHR',    // 1 on hind-right sock zone
  'tailDock',  // 1 on tail dock
];

export { ATTR_KEYS };

export function defaultAttrs(overrides = {}) {
  const a = {};
  for (const k of ATTR_KEYS) a[k] = 0;
  for (const k in overrides) {
    if (k in a) a[k] = overrides[k];
  }
  return a;
}

function edgeKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export class QuadMesh {
  constructor() {
    /** @type {Array<{x:number,y:number,z:number, attrs:Record<string,number>, tag?:string}>} */
    this.verts = [];
    /** @type {Array<number[]>} */
    this.faces = [];
    /** @type {Map<string, number>} edgeKey -> crease sharpness in (0, 1] */
    this.creases = new Map();
  }

  addVert(x, y, z, attrs = null, tag = '') {
    const idx = this.verts.length;
    this.verts.push({
      x,
      y,
      z,
      attrs: defaultAttrs(attrs || {}),
      tag,
    });
    return idx;
  }

  addFace(indices) {
    const idx = this.faces.length;
    this.faces.push([...indices]);
    return idx;
  }

  setCrease(a, b, sharpness = 1.0) {
    if (sharpness <= 0) {
      this.creases.delete(edgeKey(a, b));
    } else {
      this.creases.set(edgeKey(a, b), Math.min(1.0, sharpness));
    }
  }

  getCrease(a, b) {
    return this.creases.get(edgeKey(a, b)) || 0;
  }

  setLoopCrease(loop, sharpness = 1.0, closed = true) {
    const len = loop.length;
    const count = closed ? len : len - 1;
    for (let i = 0; i < count; i++) {
      this.setCrease(loop[i], loop[(i + 1) % len], sharpness);
    }
  }

  /**
   * Bridge two open or closed vertex loops of identical length with quads.
   * For a torso spine along +Z where loopA is rear and loopB is front,
   * and each half-loop goes from top-center (dorsal, x=0) down the +X side to bottom-center (ventral, x=0):
   * At each step i -> i+1 (going downward -Y on +X side),
   * face [loopA[i], loopA[i+1], loopB[i+1], loopB[i]]:
   * e1 = A[i+1]-A[i] ~ (0, -1, 0), e2 = B[i]-A[i] ~ (0, 0, +1) -> e1 x e2 = (-1, 0, 0) INWARD!
   * So [loopA[i], loopB[i], loopB[i+1], loopA[i+1]]:
   * e1 = B[i]-A[i] ~ (0, 0, +1), e2 = A[i+1]-A[i] ~ (0, -1, 0) -> e1 x e2 = (+1, 0, 0) OUTWARD!
   */
  bridgeLoops(loopA, loopB, closed = false, flip = false) {
    const n = loopA.length;
    if (loopB.length !== n) {
      throw new Error(`bridgeLoops length mismatch: ${n} vs ${loopB.length}`);
    }
    const created = [];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const i1 = (i + 1) % n;
      const f = flip
        ? [loopA[i], loopA[i1], loopB[i1], loopB[i]]
        : [loopA[i], loopB[i], loopB[i1], loopA[i1]];
      created.push(this.addFace(f));
    }
    return created;
  }

  /**
   * Find ordered boundary loop(s) of a contiguous set of faces.
   * Returns an array of directed vertex loops (preserving outward CCW winding).
   */
  getRegionBoundaryLoops(faceIndices) {
    const faceSet = new Set(faceIndices);
    const halfEdges = new Set();
    const boundaryNext = new Map();

    for (const fi of faceSet) {
      const f = this.faces[fi];
      if (!f) continue;
      for (let i = 0; i < f.length; i++) {
        const a = f[i];
        const b = f[(i + 1) % f.length];
        halfEdges.add(`${a}->${b}`);
      }
    }

    for (const fi of faceSet) {
      const f = this.faces[fi];
      if (!f) continue;
      for (let i = 0; i < f.length; i++) {
        const a = f[i];
        const b = f[(i + 1) % f.length];
        if (!halfEdges.has(`${b}->${a}`)) {
          boundaryNext.set(a, b);
        }
      }
    }

    const loops = [];
    const visited = new Set();
    for (const start of boundaryNext.keys()) {
      if (visited.has(start)) continue;
      const loop = [];
      let curr = start;
      let guard = 0;
      while (curr !== undefined && !visited.has(curr) && guard++ < 1000) {
        visited.add(curr);
        loop.push(curr);
        curr = boundaryNext.get(curr);
      }
      if (loop.length >= 3) loops.push(loop);
    }
    return loops;
  }

  /**
   * Extrude a contiguous patch of faces (removing the original faces in the patch),
   * returning the new boundary vertex loop!
   * `targetPositions`: array of {x, y, z, attrs?} with same length as boundary loop,
   * OR a callback `(vert, index, loop) => ({x, y, z, attrs})`.
   */
  extrudeRegion(faceIndices, targetFn) {
    const loops = this.getRegionBoundaryLoops(faceIndices);
    if (loops.length !== 1) {
      throw new Error(`extrudeRegion expected 1 boundary loop, got ${loops.length}`);
    }
    const baseLoop = loops[0];

    // Remove the replaced interior faces
    const removeSet = new Set(faceIndices);
    this.faces = this.faces.filter((_, idx) => !removeSet.has(idx));

    // Create new ring vertices
    const newLoop = baseLoop.map((vi, idx) => {
      const v = this.verts[vi];
      const t = typeof targetFn === 'function' ? targetFn(v, idx, baseLoop) : targetFn[idx];
      const mergedAttrs = { ...v.attrs, ...(t.attrs || {}) };
      return this.addVert(t.x, t.y, t.z, mergedAttrs, t.tag || v.tag);
    });

    // Stitch side quads preserving outward CCW winding: [b_i, b_{i+1}, n_{i+1}, n_i]
    const n = baseLoop.length;
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      this.addFace([baseLoop[i], baseLoop[i1], newLoop[i1], newLoop[i]]);
    }

    return { baseLoop, newLoop };
  }

  /**
   * Extrude an open closed-ring loop (like the end of a leg or ear) by adding a new ring
   * and stitching quads outward.
   */
  extrudeLoop(baseLoop, targetFn) {
    const newLoop = baseLoop.map((vi, idx) => {
      const v = this.verts[vi];
      const t = typeof targetFn === 'function' ? targetFn(v, idx, baseLoop) : targetFn[idx];
      const mergedAttrs = { ...v.attrs, ...(t.attrs || {}) };
      return this.addVert(t.x, t.y, t.z, mergedAttrs, t.tag || v.tag);
    });

    const n = baseLoop.length;
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      this.addFace([baseLoop[i], baseLoop[i1], newLoop[i1], newLoop[i]]);
    }
    return newLoop;
  }

  /**
   * Cap a closed loop cleanly with quads (for an 8-ring, uses a 2-quad or 4-quad cap;
   * for any even ring >= 4, connects nicely; or uses a center quad / hub).
   */
  capLoop(loop, centerOffset = { x: 0, y: 0, z: 0 }, attrs = null, flip = false) {
    const n = loop.length;
    if (n === 4) {
      const f = flip ? [loop[3], loop[2], loop[1], loop[0]] : [loop[0], loop[1], loop[2], loop[3]];
      return [this.addFace(f)];
    }

    // Compute centroid
    let cx = 0, cy = 0, cz = 0;
    const avgAttrs = defaultAttrs();
    for (const vi of loop) {
      const v = this.verts[vi];
      cx += v.x; cy += v.y; cz += v.z;
      for (const k of ATTR_KEYS) avgAttrs[k] += v.attrs[k];
    }
    cx = cx / n + (centerOffset.x || 0);
    cy = cy / n + (centerOffset.y || 0);
    cz = cz / n + (centerOffset.z || 0);
    for (const k of ATTR_KEYS) avgAttrs[k] /= n;
    if (attrs) Object.assign(avgAttrs, attrs);

    // For an 8-ring, a super-clean all-quad cap is 2 quads across if 6, or inner 4-ring if 8!
    if (n === 8) {
      // Create inner 4-vertex quad rotated to match 0, 2, 4, 6
      const inner = [];
      for (let j = 0; j < 4; j++) {
        const vA = this.verts[loop[j * 2]];
        const ix = cx * 0.62 + vA.x * 0.38;
        const iy = cy * 0.62 + vA.y * 0.38;
        const iz = cz * 0.62 + vA.z * 0.38;
        inner.push(this.addVert(ix, iy, iz, avgAttrs));
      }
      const created = [];
      // 4 quads around rim? Wait: 8 outer vertices to 4 inner vertices isn't 1:1 quads!
      // Instead, standard grid cap for 8-ring:
      // Outer ring 0,1,2,3,4,5,6,7 -> add 1 center vertex? Wait: 1 center gives 4 quads using every other?
      // No! Look at a 2x2 grid boundary: it has 8 vertices!
      // Corners: 0, 2, 4, 6. Edge midpoints: 1, 3, 5, 7.
      // Add ONE center vertex C! Then the 4 quads are:
      // [0, 1, C, 7], [1, 2, 3, C], [C, 3, 4, 5], [7, C, 5, 6] !!
      // ZERO triangles, 100% pure quads, 4-valent center vertex!!
      this.verts.length -= 4; // undo temporary inner verts
      const cIdx = this.addVert(cx, cy, cz, avgAttrs);
      const qFaces = [
        [loop[0], loop[1], cIdx, loop[7]],
        [loop[1], loop[2], loop[3], cIdx],
        [cIdx, loop[3], loop[4], loop[5]],
        [loop[7], cIdx, loop[5], loop[6]],
      ];
      for (const q of qFaces) {
        created.push(this.addFace(flip ? [...q].reverse() : q));
      }
      return created;
    }

    if (n === 6) {
      // Clean 2-quad cap for 6-ring: [0,1,2,3] and [0,3,4,5]!
      const qFaces = [
        [loop[0], loop[1], loop[2], loop[3]],
        [loop[0], loop[3], loop[4], loop[5]],
      ];
      return qFaces.map((q) => this.addFace(flip ? [...q].reverse() : q));
    }

    // General fallback: single n-gon face (Catmull-Clark splits any n-gon into n quads!)
    const f = flip ? [...loop].reverse() : [...loop];
    return [this.addFace(f)];
  }

  /**
   * Compact unused vertices (such as deleted interior patch vertices from extrudeRegion).
   */
  compact() {
    const used = new Set();
    for (const f of this.faces) {
      for (const vi of f) used.add(vi);
    }
    const oldToNew = new Map();
    const newVerts = [];
    for (let i = 0; i < this.verts.length; i++) {
      if (used.has(i)) {
        oldToNew.set(i, newVerts.length);
        newVerts.push(this.verts[i]);
      }
    }
    const newFaces = this.faces.map((f) => f.map((vi) => oldToNew.get(vi)));
    const newCreases = new Map();
    for (const [k, val] of this.creases.entries()) {
      const [aStr, bStr] = k.split('_');
      const na = oldToNew.get(Number(aStr));
      const nb = oldToNew.get(Number(bStr));
      if (na !== undefined && nb !== undefined) {
        newCreases.set(edgeKey(na, nb), val);
      }
    }
    this.verts = newVerts;
    this.faces = newFaces;
    this.creases = newCreases;
    return this;
  }

  /**
   * Mirror a half-mesh (built on x >= 0) across x = 0, welding centerline vertices (|x| < eps).
   * Swaps left/right sock attributes on the mirrored side automatically!
   */
  mirrorAndWeld(eps = 1e-4) {
    this.compact();
    const origVertCount = this.verts.length;
    const origFaceCount = this.faces.length;
    const mirrorMap = new Array(origVertCount);

    for (let i = 0; i < origVertCount; i++) {
      const v = this.verts[i];
      if (Math.abs(v.x) <= eps) {
        v.x = 0;
        mirrorMap[i] = i;
      } else {
        const mAttrs = { ...v.attrs };
        // Swap left/right sock masks so each leg can have independent markings
        mAttrs.sockFL = v.attrs.sockFR;
        mAttrs.sockFR = v.attrs.sockFL;
        mAttrs.sockHL = v.attrs.sockHR;
        mAttrs.sockHR = v.attrs.sockHL;
        const mTag = v.tag ? v.tag.replace('_L', '_R') : '';
        mirrorMap[i] = this.addVert(-v.x, v.y, v.z, mAttrs, mTag);
      }
    }

    for (let fi = 0; fi < origFaceCount; fi++) {
      const f = this.faces[fi];
      // Reversing winding preserves outward normals under reflection across X=0
      const mf = [];
      for (let j = f.length - 1; j >= 0; j--) {
        mf.push(mirrorMap[f[j]]);
      }
      this.faces.push(mf);
    }

    const origCreases = Array.from(this.creases.entries());
    for (const [k, sharpness] of origCreases) {
      const [aStr, bStr] = k.split('_');
      const ma = mirrorMap[Number(aStr)];
      const mb = mirrorMap[Number(bStr)];
      if (ma !== mb) {
        this.creases.set(edgeKey(ma, mb), sharpness);
      }
    }

    return this;
  }

  /**
   * Perform one level of Pixar Catmull-Clark Subdivision Surface refinement
   * with semi-sharp creases and smooth per-vertex attribute interpolation.
   */
  subdivideOnce() {
    this.compact();
    const V = this.verts;
    const F = this.faces;
    const numV = V.length;
    const numF = F.length;

    // Helper to clone/average vertices + attributes
    const makeZero = () => ({ x: 0, y: 0, z: 0, attrs: defaultAttrs() });
    const addScaled = (dst, src, w) => {
      dst.x += src.x * w;
      dst.y += src.y * w;
      dst.z += src.z * w;
      for (const k of ATTR_KEYS) dst.attrs[k] += src.attrs[k] * w;
    };
    const lerpVert = (a, b, t) => {
      const out = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        attrs: defaultAttrs(),
      };
      for (const k of ATTR_KEYS) {
        out.attrs[k] = a.attrs[k] + (b.attrs[k] - a.attrs[k]) * t;
      }
      return out;
    };

    // 1. Face points
    const facePoints = new Array(numF);
    for (let fi = 0; fi < numF; fi++) {
      const f = F[fi];
      const fp = makeZero();
      const inv = 1 / f.length;
      for (const vi of f) addScaled(fp, V[vi], inv);
      facePoints[fi] = fp;
    }

    // 2. Build edge adjacency & vertex incidence
    /** @type {Map<string, {a:number, b:number, faces:number[], sharpness:number, mid:any, point:any, newIndex:number}>} */
    const edgeMap = new Map();
    const vertFaces = Array.from({ length: numV }, () => []);
    const vertEdges = Array.from({ length: numV }, () => []);

    for (let fi = 0; fi < numF; fi++) {
      const f = F[fi];
      const len = f.length;
      for (let i = 0; i < len; i++) {
        const a = f[i];
        const b = f[(i + 1) % len];
        vertFaces[a].push(fi);
        const key = edgeKey(a, b);
        let e = edgeMap.get(key);
        if (!e) {
          const mid = makeZero();
          addScaled(mid, V[a], 0.5);
          addScaled(mid, V[b], 0.5);
          e = {
            a: Math.min(a, b),
            b: Math.max(a, b),
            faces: [],
            sharpness: this.creases.get(key) || 0,
            mid,
            point: null,
            newIndex: -1,
          };
          edgeMap.set(key, e);
          vertEdges[e.a].push(e);
          vertEdges[e.b].push(e);
        }
        e.faces.push(fi);
      }
    }

    // 3. Edge points
    for (const e of edgeMap.values()) {
      if (e.faces.length < 2 || e.sharpness >= 1.0) {
        e.point = e.mid;
      } else {
        const smooth = makeZero();
        addScaled(smooth, V[e.a], 0.25);
        addScaled(smooth, V[e.b], 0.25);
        addScaled(smooth, facePoints[e.faces[0]], 0.25);
        addScaled(smooth, facePoints[e.faces[1]], 0.25);
        e.point = e.sharpness > 0 ? lerpVert(smooth, e.mid, e.sharpness) : smooth;
      }
    }

    // 4. Updated original vertices
    const nextMesh = new QuadMesh();
    for (let vi = 0; vi < numV; vi++) {
      const orig = V[vi];
      const incFaces = vertFaces[vi];
      const incEdges = vertEdges[vi];
      const n = incFaces.length;
      const boundaryEdges = incEdges.filter((e) => e.faces.length < 2);
      const sharpEdges = incEdges.filter((e) => e.sharpness > 0);

      let updated;
      if (boundaryEdges.length >= 2) {
        if (boundaryEdges.length === 2) {
          const n1 = boundaryEdges[0].a === vi ? boundaryEdges[0].b : boundaryEdges[0].a;
          const n2 = boundaryEdges[1].a === vi ? boundaryEdges[1].b : boundaryEdges[1].a;
          updated = makeZero();
          addScaled(updated, orig, 0.75);
          addScaled(updated, V[n1], 0.125);
          addScaled(updated, V[n2], 0.125);
        } else {
          updated = { x: orig.x, y: orig.y, z: orig.z, attrs: { ...orig.attrs } };
        }
      } else {
        // Standard smooth Catmull-Clark vertex
        const Q = makeZero();
        for (const fi of incFaces) addScaled(Q, facePoints[fi], 1 / n);
        const R = makeZero();
        const m = incEdges.length;
        for (const e of incEdges) addScaled(R, e.mid, 1 / m);

        const smooth = makeZero();
        addScaled(smooth, Q, 1 / n);
        addScaled(smooth, R, 2 / n);
        addScaled(smooth, orig, (n - 3) / n);

        if (sharpEdges.length === 2) {
          const avgSharp = 0.5 * (sharpEdges[0].sharpness + sharpEdges[1].sharpness);
          const n1 = sharpEdges[0].a === vi ? sharpEdges[0].b : sharpEdges[0].a;
          const n2 = sharpEdges[1].a === vi ? sharpEdges[1].b : sharpEdges[1].a;
          const creasePt = makeZero();
          addScaled(creasePt, orig, 0.75);
          addScaled(creasePt, V[n1], 0.125);
          addScaled(creasePt, V[n2], 0.125);
          updated = lerpVert(smooth, creasePt, avgSharp);
        } else if (sharpEdges.length >= 3) {
          const avgSharp = sharpEdges.reduce((s, e) => s + e.sharpness, 0) / sharpEdges.length;
          updated = lerpVert(smooth, orig, avgSharp);
        } else {
          updated = smooth;
        }
      }
      nextMesh.addVert(updated.x, updated.y, updated.z, updated.attrs, orig.tag);
    }

    // 5. Add face point vertices
    const facePointIdx = new Array(numF);
    for (let fi = 0; fi < numF; fi++) {
      const fp = facePoints[fi];
      facePointIdx[fi] = nextMesh.addVert(fp.x, fp.y, fp.z, fp.attrs);
    }

    // 6. Add edge point vertices & propagate creases
    for (const e of edgeMap.values()) {
      const ep = e.point;
      e.newIndex = nextMesh.addVert(ep.x, ep.y, ep.z, ep.attrs);
      if (e.sharpness > 0) {
        // Hard creases (1.0) remain crisp; semi-sharp soften gently
        const nextSharp = e.sharpness >= 0.99 ? 1.0 : Math.max(0, e.sharpness - 0.35);
        if (nextSharp > 0) {
          nextMesh.setCrease(e.a, e.newIndex, nextSharp);
          nextMesh.setCrease(e.b, e.newIndex, nextSharp);
        }
      }
    }

    // 7. Create refined quads
    for (let fi = 0; fi < numF; fi++) {
      const f = F[fi];
      const len = f.length;
      const fpIdx = facePointIdx[fi];
      for (let i = 0; i < len; i++) {
        const curr = f[i];
        const next = f[(i + 1) % len];
        const prev = f[(i + len - 1) % len];
        const eNext = edgeMap.get(edgeKey(curr, next)).newIndex;
        const ePrev = edgeMap.get(edgeKey(prev, curr)).newIndex;
        nextMesh.addFace([curr, eNext, fpIdx, ePrev]);
      }
    }

    return nextMesh;
  }

  subdivide(levels = 2) {
    let m = this;
    for (let i = 0; i < levels; i++) {
      m = m.subdivideOnce();
    }
    return m;
  }

  /**
   * Verify manifoldness, watertightness, winding consistency, and bounding box.
   */
  verifyTopology() {
    const directed = new Map();
    const undirected = new Map();
    let flippedEdges = 0;

    for (let fi = 0; fi < this.faces.length; fi++) {
      const f = this.faces[fi];
      for (let i = 0; i < f.length; i++) {
        const a = f[i];
        const b = f[(i + 1) % f.length];
        const dk = `${a}->${b}`;
        directed.set(dk, (directed.get(dk) || 0) + 1);
        const uk = edgeKey(a, b);
        undirected.set(uk, (undirected.get(uk) || 0) + 1);
      }
    }

    let boundaryEdges = 0;
    let nonManifoldEdges = 0;
    for (const count of undirected.values()) {
      if (count === 1) boundaryEdges++;
      else if (count > 2) nonManifoldEdges++;
    }
    for (const [dk, count] of directed.entries()) {
      if (count > 1) flippedEdges += count - 1;
    }

    // Compute signed volume and bounding box
    let signedVol = 0;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let badVerts = 0;

    for (const v of this.verts) {
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
        badVerts++;
        continue;
      }
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }

    for (const f of this.faces) {
      const v0 = this.verts[f[0]];
      for (let i = 1; i < f.length - 1; i++) {
        const v1 = this.verts[f[i]];
        const v2 = this.verts[f[i + 1]];
        signedVol +=
          (v0.x * (v1.y * v2.z - v1.z * v2.y) +
            v0.y * (v1.z * v2.x - v1.x * v2.z) +
            v0.z * (v1.x * v2.y - v1.y * v2.x)) /
          6;
      }
    }

    return {
      vertexCount: this.verts.length,
      faceCount: this.faces.length,
      boundaryEdges,
      nonManifoldEdges,
      flippedEdges,
      badVerts,
      signedVolume: signedVol,
      bbox: {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
      },
    };
  }
}
