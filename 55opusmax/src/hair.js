// Mane, forelock and tail: guide strands simulated on the CPU (follow-the-leader verlet with
// shape matching, air drag and capsule collisions), rendered as thousands of interpolated
// camera-facing ribbons whose positions are rebuilt on the GPU from a guide texture.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

let seed = 9137;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += rnd(); return (u - 2) * 0.866; };

export class Capsule {
  constructor(boneA, a, boneB, b, r) {
    this.boneA = boneA; this.boneB = boneB;
    // local offsets (rest rotations are identity, so local = rest - boneRest)
    const ra = boneA.userData.rest, rb = boneB.userData.rest;
    this.la = new THREE.Vector3(a[0] - ra[0], a[1] - ra[1], a[2] - ra[2]);
    this.lb = new THREE.Vector3(b[0] - rb[0], b[1] - rb[1], b[2] - rb[2]);
    this.r = r;
    this.A = new THREE.Vector3(); this.B = new THREE.Vector3();
  }
  update() {
    this.A.copy(this.la).applyMatrix4(this.boneA.matrixWorld);
    this.B.copy(this.lb).applyMatrix4(this.boneB.matrixWorld);
  }
}

// Distance grid of the body sculpt, sampled in rest space (used for hair-vs-skin collisions).
export class SDFGrid {
  constructor(field, warp, min, max, h) {
    this.min = min; this.h = h;
    this.nx = Math.ceil((max[0] - min[0]) / h) + 1;
    this.ny = Math.ceil((max[1] - min[1]) / h) + 1;
    this.nz = Math.ceil((max[2] - min[2]) / h) + 1;
    this.d = new Float32Array(this.nx * this.ny * this.nz);
    let o = 0;
    for (let k = 0; k < this.nz; k++) for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) {
      const x = min[0] + i * h, y = min[1] + j * h, z = min[2] + k * h;
      this.d[o++] = field(warp.inv(x), y, z);
    }
  }
  sample(x, y, z) {
    const fx = (x - this.min[0]) / this.h, fy = (y - this.min[1]) / this.h, fz = (z - this.min[2]) / this.h;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= this.nx - 1 || fy >= this.ny - 1 || fz >= this.nz - 1) return 1;
    const i = fx | 0, j = fy | 0, k = fz | 0;
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const nx = this.nx, sxy = nx * this.ny, D = this.d;
    const o = i + j * nx + k * sxy;
    const c00 = D[o] + (D[o + 1] - D[o]) * tx, c10 = D[o + nx] + (D[o + nx + 1] - D[o + nx]) * tx;
    const c01 = D[o + sxy] + (D[o + sxy + 1] - D[o + sxy]) * tx, c11 = D[o + sxy + nx] + (D[o + sxy + nx + 1] - D[o + sxy + nx]) * tx;
    const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
    return c0 + (c1 - c0) * tz;
  }
}

const _inv = new THREE.Matrix4();
const _p = new THREE.Vector3();

// GLSL shared by colour and depth passes: rebuild a strand vertex from the guide texture.
const HAIR_PARS = /* glsl */`
  uniform sampler2D uGuides;
  uniform float uNodes;
  uniform vec3 uRefSide;
  uniform float uWidth;
  uniform float uPixel;
  attribute vec3 aGuide;
  attribute vec3 aWgt;
  attribute vec4 aStrand; // t, side, lengthScale, rand
  attribute vec3 aOff;    // offset x, y in guide frame, curl phase
  varying float vT;
  varying float vRand;
  varying float vShade;

  vec3 gnode(float g, int i) {
    int n = int(uNodes);
    i = clamp(i, 0, n - 1);
    return texelFetch(uGuides, ivec2(i, int(g)), 0).xyz;
  }
  vec3 gpos(float g, float t) {
    float x = clamp(t, 0.0, 1.0) * (uNodes - 1.0);
    int i = int(floor(x));
    float f = x - float(i);
    vec3 p0 = gnode(g, i - 1), p1 = gnode(g, i), p2 = gnode(g, i + 1), p3 = gnode(g, i + 2);
    if (i == 0) p0 = 2.0 * p1 - p2;
    if (i >= int(uNodes) - 2) p3 = 2.0 * p2 - p1;
    // Catmull-Rom
    return 0.5 * ((2.0 * p1) + (-p0 + p2) * f + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f * f + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * f * f * f);
  }
  vec3 strandPos(float t) {
    float tt = t * aStrand.z;
    return gpos(aGuide.x, tt) * aWgt.x + gpos(aGuide.y, tt) * aWgt.y + gpos(aGuide.z, tt) * aWgt.z;
  }
  void hairVertex(out vec3 pos, out vec3 nrm, out vec3 tng) {
    float t = aStrand.x;
    vec3 P = strandPos(t);
    vec3 P2 = strandPos(min(1.0, t + 0.02));
    vec3 P1 = strandPos(max(0.0, t - 0.02));
    vec3 T = normalize(P2 - P1 + 1e-6);
    vec3 B = normalize(cross(T, uRefSide) + 1e-6);
    vec3 N = cross(B, T);
    // volume: offsets grow along the strand, with a gentle wave
    float grow = (0.25 + 0.75 * sqrt(t)) * (1.0 - 0.25 * smoothstep(0.75, 1.0, t));
    float wave = sin(t * 14.0 + aOff.z) * 0.006 * t + sin(t * 37.0 + aOff.z * 2.0) * 0.0015;
    P += (B * aOff.x + N * aOff.y) * grow + B * wave;
    vec3 V = normalize(cameraPosition - P);
    vec3 S = normalize(cross(T, V) + 1e-6);
    float dist = length(cameraPosition - P);
    float w = uWidth * (1.0 - 0.65 * t * t);
    w = max(w, uPixel * dist * 0.85);
    pos = P + S * w * 0.5 * aStrand.y;
    // tube-like normal: facing the camera, bent towards the ribbon edge
    vec3 facing = normalize(V - T * dot(V, T));
    nrm = normalize(facing + S * aStrand.y * 0.6);
    tng = T;
    vT = t;
    vRand = aStrand.w;
    // crude self shadowing inside the bundle
    vShade = 0.55 + 0.45 * clamp(length(aOff.xy) / 0.05, 0.0, 1.0);
  }
`;

export class HairSystem {
  constructor({ name, horse, guides, strands, nodes = 12, width = 0.0012, colliders = [], drag = 2.2, gravity = 9.8, stiffness = 0.06, rootStiff = 0.9, refSide = [0, 0, 1], color = '#120d0a', rough = 0.42, grid = null, margin = 0.005 }) {
    this.name = name;
    this.grid = grid;
    this.margin = margin;
    this.horse = horse;
    this.N = nodes;
    this.G = guides.length;
    this.guides = guides;
    this.colliders = colliders;
    this.drag = drag;
    this.gravity = gravity;
    this.stiffness = stiffness;
    this.rootStiff = rootStiff;
    const N = this.N, G = this.G;
    this.pos = new Float32Array(G * N * 3);
    this.prev = new Float32Array(G * N * 3);
    this.restLocal = new Float32Array(G * N * 3); // rest shape in root-bone space
    this.segLen = new Float32Array(G);
    // initialise along the root direction, then let it settle in the rest pose
    for (let g = 0; g < G; g++) {
      const gd = guides[g];
      this.segLen[g] = gd.length / (N - 1);
      const b = gd.bone.userData.rest;
      gd.local = new THREE.Vector3(gd.root[0] - b[0], gd.root[1] - b[1], gd.root[2] - b[2]);
      gd.dirLocal = new THREE.Vector3(...gd.dir).normalize();
      for (let i = 0; i < N; i++) {
        const k = 3 * (g * N + i);
        const p = _v.copy(gd.dirLocal).multiplyScalar(i * this.segLen[g]).add(new THREE.Vector3(...gd.root));
        if (gd.bend) p.addScaledVector(new THREE.Vector3(...gd.bend), Math.pow(i / (N - 1), 2) * gd.length);
        this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
      }
    }
    this.prev.set(this.pos);
    this.tex = new THREE.DataTexture(new Float32Array(N * G * 4), N, G, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this._buildMesh(strands, width, refSide, color, rough);
  }

  // settle the hair under gravity with the skeleton in its rest pose and record the rest shape
  settle(seconds = 2.5) {
    this.horse.bones[0].updateMatrixWorld(true);
    const saved = this.stiffness;
    this.stiffness = 0;
    for (let i = 0; i < seconds * 120; i++) this.step(1 / 120, true);
    this.stiffness = saved;
    const N = this.N;
    for (let g = 0; g < this.G; g++) {
      const bone = this.guides[g].bone;
      _m.copy(bone.matrixWorld).invert();
      for (let i = 0; i < N; i++) {
        const k = 3 * (g * N + i);
        _v.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]).applyMatrix4(_m);
        this.restLocal[k] = _v.x; this.restLocal[k + 1] = _v.y; this.restLocal[k + 2] = _v.z;
      }
    }
    this.prev.set(this.pos);
    this._upload();
  }

  step(dt, settling = false) {
    const N = this.N, P = this.pos, Q = this.prev;
    for (const c of this.colliders) c.update();
    this._prepGrid();
    const g2 = this.gravity * dt * dt;
    const keep = Math.exp(-this.drag * dt);
    for (let g = 0; g < this.G; g++) {
      const gd = this.guides[g];
      const M = gd.bone.matrixWorld;
      const L = this.segLen[g];
      // root and first segment follow the bone
      _a.copy(gd.local).applyMatrix4(M);
      _b.copy(gd.dirLocal).transformDirection(M).multiplyScalar(L).add(_a);
      let k = 3 * g * N;
      Q[k] = P[k]; Q[k + 1] = P[k + 1]; Q[k + 2] = P[k + 2];
      P[k] = _a.x; P[k + 1] = _a.y; P[k + 2] = _a.z;
      k += 3;
      const rs = this.rootStiff;
      Q[k] = P[k]; Q[k + 1] = P[k + 1]; Q[k + 2] = P[k + 2];
      P[k] += (_b.x - P[k]) * rs; P[k + 1] += (_b.y - P[k + 1]) * rs; P[k + 2] += (_b.z - P[k + 2]) * rs;
      // verlet integration
      for (let i = 2; i < N; i++) {
        const j = 3 * (g * N + i);
        const vx = (P[j] - Q[j]) * keep, vy = (P[j + 1] - Q[j + 1]) * keep, vz = (P[j + 2] - Q[j + 2]) * keep;
        Q[j] = P[j]; Q[j + 1] = P[j + 1]; Q[j + 2] = P[j + 2];
        P[j] += vx; P[j + 1] += vy - g2; P[j + 2] += vz;
      }
      // shape matching towards the settled rest shape (stiffer near the root)
      if (this.stiffness > 0) {
        for (let i = 2; i < N; i++) {
          const j = 3 * (g * N + i);
          const s = this.stiffness * Math.pow(1 - i / (N - 1), 1.5) * (dt * 120);
          _v.set(this.restLocal[j], this.restLocal[j + 1], this.restLocal[j + 2]).applyMatrix4(M);
          P[j] += (_v.x - P[j]) * s; P[j + 1] += (_v.y - P[j + 1]) * s; P[j + 2] += (_v.z - P[j + 2]) * s;
        }
      }
      // follow-the-leader length constraints + collisions
      for (let i = 1; i < N; i++) {
        const j = 3 * (g * N + i), p = j - 3;
        if (i >= 2) { this._collide(P, j); if (this.grid) this._collideGrid(P, j, g); }
        let dx = P[j] - P[p], dy = P[j + 1] - P[p + 1], dz = P[j + 2] - P[p + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const f = L / d;
        const nx = P[p] + dx * f, ny = P[p + 1] + dy * f, nz = P[p + 2] + dz * f;
        // DFTL-style velocity correction keeps the motion lively but stable
        Q[j] += (nx - P[j]) * 0.9; Q[j + 1] += (ny - P[j + 1]) * 0.9; Q[j + 2] += (nz - P[j + 2]) * 0.9;
        P[j] = nx; P[j + 1] = ny; P[j + 2] = nz;
        if (P[j + 1] < 0.004) P[j + 1] = 0.004;
      }
    }
    if (!settling) this._upload();
  }

  _collide(P, j) {
    for (const c of this.colliders) {
      const A = c.A, B = c.B;
      const abx = B.x - A.x, aby = B.y - A.y, abz = B.z - A.z;
      const apx = P[j] - A.x, apy = P[j + 1] - A.y, apz = P[j + 2] - A.z;
      let t = (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = A.x + abx * t, cy = A.y + aby * t, cz = A.z + abz * t;
      const dx = P[j] - cx, dy = P[j + 1] - cy, dz = P[j + 2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const r = c.r;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 1e-6;
        const s = r / d;
        P[j] = cx + dx * s; P[j + 1] = cy + dy * s; P[j + 2] = cz + dz * s;
      }
    }
  }

  _collideGrid(P, j, g) {
    const gd = this.guides[g];
    const bone = gd.collBone || gd.bone;
    const inv = bone.userData._inv;
    const rest = bone.userData.rest;
    _p.set(P[j], P[j + 1], P[j + 2]).applyMatrix4(inv);
    const x = _p.x + rest[0], y = _p.y + rest[1], z = _p.z + rest[2];
    const G = this.grid, m = this.margin;
    const d = G.sample(x, y, z);
    if (d >= m) return;
    const e = G.h * 0.5;
    let gx = G.sample(x + e, y, z) - G.sample(x - e, y, z);
    let gy = G.sample(x, y + e, z) - G.sample(x, y - e, z);
    let gz = G.sample(x, y, z + e) - G.sample(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    const push = m - d;
    _p.x += (gx / gl) * push; _p.y += (gy / gl) * push; _p.z += (gz / gl) * push;
    _p.applyMatrix4(bone.matrixWorld);
    P[j] = _p.x; P[j + 1] = _p.y; P[j + 2] = _p.z;
  }

  _prepGrid() {
    if (!this.grid) return;
    const seen = new Set();
    for (const gd of this.guides) {
      const b = gd.collBone || gd.bone;
      if (seen.has(b)) continue;
      seen.add(b);
      b.userData._inv = (b.userData._inv || new THREE.Matrix4()).copy(b.matrixWorld).invert();
    }
  }

  _upload() {
    const N = this.N, data = this.tex.image.data, P = this.pos;
    for (let g = 0; g < this.G; g++) for (let i = 0; i < N; i++) {
      const k = 3 * (g * N + i), o = 4 * (g * N + i);
      data[o] = P[k]; data[o + 1] = P[k + 1]; data[o + 2] = P[k + 2]; data[o + 3] = 1;
    }
    this.tex.needsUpdate = true;
  }

  _buildMesh(strands, width, refSide, color, rough) {
    const SEG = 18;
    const vPer = (SEG + 1) * 2;
    const count = strands.length;
    const nv = count * vPer;
    const aGuide = new Float32Array(nv * 3), aWgt = new Float32Array(nv * 3), aStrand = new Float32Array(nv * 4), aOff = new Float32Array(nv * 3);
    const idx = new Uint32Array(count * SEG * 6);
    let v = 0, ii = 0;
    for (const s of strands) {
      const base = v;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        for (let side = -1; side <= 1; side += 2) {
          aGuide.set(s.g, v * 3); aWgt.set(s.w, v * 3);
          aStrand[v * 4] = t; aStrand[v * 4 + 1] = side; aStrand[v * 4 + 2] = s.len; aStrand[v * 4 + 3] = s.r;
          aOff[v * 3] = s.off[0]; aOff[v * 3 + 1] = s.off[1]; aOff[v * 3 + 2] = s.phase;
          v++;
        }
      }
      for (let i = 0; i < SEG; i++) {
        const a = base + i * 2;
        idx[ii++] = a; idx[ii++] = a + 1; idx[ii++] = a + 2;
        idx[ii++] = a + 1; idx[ii++] = a + 3; idx[ii++] = a + 2;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    geo.setAttribute('tangent', new THREE.BufferAttribute(new Float32Array(nv * 4), 4));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    geo.setAttribute('aGuide', new THREE.BufferAttribute(aGuide, 3));
    geo.setAttribute('aWgt', new THREE.BufferAttribute(aWgt, 3));
    geo.setAttribute('aStrand', new THREE.BufferAttribute(aStrand, 4));
    geo.setAttribute('aOff', new THREE.BufferAttribute(aOff, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));

    this.uniforms = {
      uGuides: { value: this.tex },
      uNodes: { value: this.N },
      uRefSide: { value: new THREE.Vector3(...refSide) },
      uWidth: { value: width },
      uPixel: { value: 0.0012 },
      uHairColor: { value: new THREE.Color(color) },
      uTipColor: { value: new THREE.Color(color) },
    };
    const U = this.uniforms;
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: rough, metalness: 0, anisotropy: 0.8, specularIntensity: 0.45, envMapIntensity: 0.55 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + HAIR_PARS)
        .replace('#include <beginnormal_vertex>', `
          vec3 hairP, hairN, hairT;
          hairVertex(hairP, hairN, hairT);
          vec3 objectNormal = hairN;
          #ifdef USE_TANGENT
            vec3 objectTangent = hairT;
          #endif`)
        .replace('#include <begin_vertex>', 'vec3 transformed = hairP;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uHairColor, uTipColor;
          varying float vT; varying float vRand; varying float vShade;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 hc = mix(uHairColor, uTipColor, smoothstep(0.3, 1.0, vT));
          hc *= 0.78 + 0.4 * vRand;
          diffuseColor.rgb = hc;`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          float hairAO = vShade * (0.55 + 0.45 * smoothstep(0.0, 0.25, vT));
          reflectedLight.indirectDiffuse *= hairAO;
          reflectedLight.indirectSpecular *= hairAO;
          reflectedLight.directDiffuse *= mix(0.6, 1.0, hairAO);`);
    };
    mat.customProgramCacheKey = () => 'hair-v1';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + HAIR_PARS)
        .replace('#include <begin_vertex>', 'vec3 hairP, hairN, hairT; hairVertex(hairP, hairN, hairT); vec3 transformed = hairP;');
    };
    depth.customProgramCacheKey = () => 'hair-depth-v1';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.customDepthMaterial = depth;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = this.name;
    this.mesh = mesh;
    this.material = mat;
  }

  setColor(base, tip) {
    this.uniforms.uHairColor.value.set(base);
    this.uniforms.uTipColor.value.set(tip || base);
  }
}

// ---------------------------------------------------------------- builders
export function buildHair(horse, warp) {
  const B = horse.bone;
  const W = warp.p;
  const systems = [];
  const field = horse.build.field; // design-space SDF of the body
  const t0 = performance.now();
  const neckGrid = new SDFGrid(field, warp, [0.38, 1.15, -0.27], [1.68, 2.15, 0.27], 0.018);
  const hindGrid = new SDFGrid(field, warp, [-1.0, 0.5, -0.34], [-0.4, 1.64, 0.34], 0.02);
  console.log('[hair] collision grids', (performance.now() - t0).toFixed(0), 'ms');

  // ---------- TAIL ----------
  {
    const dock = ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'].map((n) => B[n].userData.rest);
    const end = W([-0.96, 0.98, 0]);
    const pts = [...dock, end];
    const radii = [0.056, 0.05, 0.043, 0.036, 0.03, 0.022];
    const guides = [];
    const params = [];
    const along = [0.0, 0.22, 0.45, 0.7, 0.95];
    const angles = [-105, -55, 0, 55, 105];
    const total = pts.length - 1;
    const at = (u) => {
      const x = u * total; const i = Math.min(total - 1, Math.floor(x)); const f = x - i;
      const p = new THREE.Vector3(...pts[i]).lerp(new THREE.Vector3(...pts[i + 1]), f);
      const d = new THREE.Vector3(...pts[i + 1]).sub(new THREE.Vector3(...pts[i])).normalize();
      const r = radii[i] + (radii[i + 1] - radii[i]) * f;
      return { p, d, r, bone: B['tail' + Math.min(4, i)] };
    };
    for (const u of along) {
      for (const angDeg of angles) {
        const { p, d, r, bone } = at(u);
        const side = new THREE.Vector3(0, 0, 1);
        const up = new THREE.Vector3().crossVectors(side, d).normalize(); // dorsal direction of the dock
        const a = (angDeg * Math.PI) / 180;
        const off = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).multiplyScalar(r * 0.92);
        const root = p.clone().add(off);
        const length = Math.max(0.45, root.y - 0.42 + 0.06 * Math.abs(Math.sin(a)));
        const dir = d.clone().multiplyScalar(0.8).addScaledVector(off.clone().normalize(), 0.35).normalize();
        guides.push({ bone, collBone: B.pelvis, root: root.toArray(), dir: [dir.x, dir.y, dir.z], length, bend: [0, -1, 0] });
        params.push([u, a]);
      }
    }
    // strands: pick a spot on the dock, blend the 3 nearest guides in (u, angle) space
    const strands = [];
    const COUNT = 3600;
    for (let s = 0; s < COUNT; s++) {
      const u = Math.pow(rnd(), 0.85) * 0.98;
      const a = (rnd() * 2 - 1) * 1.9;
      const d = params.map(([pu, pa], i) => [i, Math.hypot((pu - u) * 4.0, (pa - a) * 0.9)]).sort((x, y) => x[1] - y[1]).slice(0, 3);
      let w = d.map(([, dd]) => 1 / (dd + 0.05));
      const ws = w.reduce((x, y) => x + y, 0);
      w = w.map((x) => x / ws);
      const spread = 0.075 * Math.sqrt(rnd());
      const ang = rnd() * Math.PI * 2;
      strands.push({
        g: d.map((x) => x[0]), w,
        len: 0.7 + 0.3 * Math.pow(rnd(), 0.45),
        r: rnd(), phase: rnd() * 6.28,
        off: [Math.cos(ang) * spread, Math.sin(ang) * spread * 0.8],
      });
    }
    const caps = [];
    for (const s of [1, -1]) {
      const n = s > 0 ? 'R' : 'L';
      caps.push(new Capsule(B['femur' + n], W([-0.68, 1.12, 0.17 * s]), B['tibia' + n], W([-0.7, 0.68, 0.155 * s]), 0.075));
      caps.push(new Capsule(B['cannonH' + n], W([-0.68, 0.6, 0.155 * s]), B['cannonH' + n], W([-0.67, 0.22, 0.145 * s]), 0.045));
    }
    const tail = new HairSystem({
      name: 'tail', horse, guides, strands, nodes: 16, width: 0.0011, colliders: caps, grid: hindGrid, margin: 0.012,
      drag: 1.6, stiffness: 0.035, rootStiff: 0.85, refSide: [0, 0, 1], rough: 0.4,
    });
    systems.push(tail);
  }

  // ---------- MANE ----------
  {
    // find the crest line on the sculpt (design space): topmost surface point at z = 0
    const crest = [];
    const xs = [];
    for (let x = 1.165; x >= 0.5; x -= 0.028) xs.push(x);
    for (const x of xs) {
      let y = 2.3;
      while (y > 1.3 && field(x, y, 0) > 0) y -= 0.004;
      crest.push([x, y]);
    }
    const guides = [];
    const neckChain = ['neck0', 'neck1', 'neck2', 'neck3', 'head'];
    const boneFor = (x) => {
      let best = 'neck0', bd = 1e9;
      for (const n of neckChain) { const d = Math.abs(B[n].userData.rest[0] - x); if (d < bd) { bd = d; best = n; } }
      if (x > 1.12) best = 'head';
      return B[best];
    };
    for (let i = 0; i < crest.length; i++) {
      const [x, y] = crest[i];
      const u = i / (crest.length - 1); // 0 at the poll, 1 at the withers
      const len = 0.13 + 0.16 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 0.04 * u;
      for (const side of [0.004, -0.004]) {
        const root = W([x, y - 0.006, side]);
        const dir = [0.04, 0.32, 1.0];
        guides.push({ bone: boneFor(x), root, dir, length: len * (side > 0 ? 1 : 0.9), bend: [-0.1, -1.0, 0.1] });
      }
    }
    const G = guides.length / 2;
    const strands = [];
    const COUNT = 3000;
    for (let s = 0; s < COUNT; s++) {
      const u = rnd() * (G - 1);
      const i0 = Math.floor(u), f = u - i0;
      const layer = rnd() < 0.5 ? 0 : 1;
      const g0 = i0 * 2 + layer, g1 = Math.min(G - 1, i0 + 1) * 2 + layer;
      strands.push({
        g: [g0, g1, g0], w: [1 - f, f, 0],
        len: 0.78 + 0.22 * rnd(),
        r: rnd(), phase: rnd() * 6.28,
        off: [gauss() * 0.006, (rnd() - 0.2) * 0.02],
      });
    }
    const mane = new HairSystem({
      name: 'mane', horse, guides, strands, nodes: 9, width: 0.001, colliders: [], grid: neckGrid, margin: 0.006,
      drag: 2.6, stiffness: 0.07, rootStiff: 0.92, refSide: [1, 0, 0], rough: 0.42,
    });
    systems.push(mane);
  }

  // ---------- FORELOCK ----------
  {
    const H = horse._head;
    const guides = [];
    const roots = [];
    for (let i = 0; i < 7; i++) {
      const w = (i / 6 - 0.5) * 0.07;
      roots.push({ root: H.at(-0.01 + Math.abs(w) * 0.25, 0.004, w), w });
    }
    for (const r of roots) {
      const dir = H.dir(0.75, 0.6, r.w * 2);
      guides.push({ bone: B.head, root: r.root, dir, length: 0.2 + 0.05 * (1 - Math.abs(r.w) / 0.035), bend: H.dir(1, -0.2, 0) });
    }
    const strands = [];
    for (let s = 0; s < 700; s++) {
      const u = rnd() * (guides.length - 1);
      const i0 = Math.floor(u), f = u - i0;
      strands.push({
        g: [i0, Math.min(guides.length - 1, i0 + 1), i0], w: [1 - f, f, 0],
        len: 0.7 + 0.3 * rnd(), r: rnd(), phase: rnd() * 6.28,
        off: [gauss() * 0.01, rnd() * 0.012],
      });
    }
    const fl = new HairSystem({
      name: 'forelock', horse, guides, strands, nodes: 8, width: 0.001, colliders: [], grid: neckGrid, margin: 0.006,
      drag: 2.6, stiffness: 0.08, rootStiff: 0.9, refSide: [0, 0, 1], rough: 0.42,
    });
    systems.push(fl);
  }

  for (const s of systems) s.settle();
  return systems;
}
