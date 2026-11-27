// Mane, forelock and tail: thousands of thin skinned ribbons grown from the
// sculpted surface. The mane sways in the vertex shader; the tail follows a
// simulated bone chain (see tail.js).
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

class Strands {
  constructor() {
    this.pos = []; this.nor = []; this.tone = []; this.sway = []; this.si = []; this.sw = []; this.idx = [];
  }
  /** pts/nors: arrays of [x,y,z]; skin(i) -> [[i0,i1], [w0,w1]] */
  add(pts, nors, width, tone, phase, skin) {
    const n = pts.length, base = this.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1), a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const tan = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const sd = norm(cross(tan, nors[i]));
      const w = width * (1 - 0.8 * s * s) * 0.5;
      const p = pts[i], [bi, bw] = skin(i);
      for (const sg of [-1, 1]) {
        this.pos.push(p[0] + sd[0] * w * sg, p[1] + sd[1] * w * sg, p[2] + sd[2] * w * sg);
        this.nor.push(...nors[i]);
        this.tone.push(tone * (0.85 + 0.35 * s));
        this.sway.push(s, phase);
        this.si.push(bi[0], bi[1], 0, 0);
        this.sw.push(bw[0], bw[1], 0, 0);
      }
      if (i < n - 1) {
        const k = base + i * 2;
        this.idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
  }
  build(material, skeleton) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.pos.length), 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sway, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.userData.tone = this.tone;
    const mesh = new THREE.SkinnedMesh(g, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(skeleton);
    return mesh;
  }
}

export function buildHair(horse) {
  const { sculpt, skeleton, rest, root } = horse;
  const bi = (name) => skeleton.bones.findIndex((b) => b.name === name);
  const F = (p) => sculpt.field(p[0], p[1], p[2]);
  const grad = (p) => {
    const e = 0.004;
    return norm([
      F([p[0] + e, p[1], p[2]]) - F([p[0] - e, p[1], p[2]]),
      F([p[0], p[1] + e, p[2]]) - F([p[0], p[1] - e, p[2]]),
      F([p[0], p[1], p[2] + e]) - F([p[0], p[1], p[2] - e]),
    ]);
  };
  /** Walks from p along dir until it meets the body surface. */
  const drop = (p, dir) => {
    for (let i = 0; i < 80; i++) {
      const f = F(p);
      if (f < 0.002) break;
      p = [p[0] + dir[0] * f * 0.8, p[1] + dir[1] * f * 0.8, p[2] + dir[2] * f * 0.8];
    }
    return p;
  };
  /** A strand thrown with direction v0 that then falls under "gravity" g and drapes over the body. */
  const drape = (rootP, v0, g, L, n, clear) => {
    const pts = [], nors = [];
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      let p = [0, 1, 2].map((a) => rootP[a] + L * (v0[a] * s + g[a] * s * s));
      let gr = grad(p);
      for (let it = 0; it < 3; it++) {
        const f = F(p), c = clear * (0.3 + s);
        if (f >= c) break;
        p = [p[0] + gr[0] * (c - f), p[1] + gr[1] * (c - f), p[2] + gr[2] * (c - f)];
        gr = grad(p);
      }
      pts.push(p);
      nors.push(gr);
    }
    return [pts, nors];
  };

  const uniforms = { uTime: { value: 0 }, uFlow: { value: new THREE.Vector3() }, uWind: { value: 1 } };
  const makeMat = (swaying) => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, side: THREE.DoubleSide, envMapIntensity: 0.06 });
    const inject = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 sway;\nuniform float uTime;\nuniform vec3 uFlow;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float s2 = sway.x * sway.x, ph = sway.y * 6.2832;
            vec3 flutter = vec3(sin(uTime * 2.3 + ph + position.x * 5.0), 0.35 * sin(uTime * 3.1 + ph * 1.7), cos(uTime * 1.9 + ph + position.y * 4.0));
            transformed += s2 * (${swaying ? 'uFlow * (0.7 + 0.6 * sway.y) + ' : ''}flutter * 0.012 * uWind);
          }`
        );
    };
    mat.onBeforeCompile = inject;
    // Shadows should follow the swaying hair too.
    mat.userData.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    mat.userData.depth.onBeforeCompile = inject;
    return mat;
  };

  // ---- Mane: along the crest, falling to the right side ---------------------
  const rnd = rng(7);
  const mane = new Strands();
  const neckBones = ['chest', 'neck1', 'neck2', 'neck3'].map(bi);
  const up = [-0.593, 0.805, 0];
  for (let n = 0; n < 1700; n++) {
    const t = 0.04 + 0.94 * rnd();
    const side = rnd() < 0.1 ? -1 : 1;
    const start = [0.5 + 0.57 * t + up[0] * 0.3, 1.47 + 0.42 * t + up[1] * 0.3, (rnd() - 0.5) * 0.03];
    const rootP = drop(start, [-up[0], -up[1], 0]);
    const L = (0.2 + 0.1 * Math.sin(Math.PI * t)) * (0.7 + 0.5 * rnd());
    const v0 = norm([up[0] * 0.45 + (rnd() - 0.5) * 0.3, up[1] * 0.45 + (rnd() - 0.5) * 0.2, side * (0.75 + 0.3 * rnd())]);
    const [pts, nors] = drape(rootP, v0, [-0.1 - 0.1 * rnd(), -0.95, 0], L, 8, 0.012 * (0.4 + rnd()));
    const u = t * 3, lo = Math.min(2, Math.floor(u));
    let fr = u - lo;
    fr = fr * fr * (3 - 2 * fr);
    mane.add(pts, nors, 0.0045, 0.7 + 0.6 * rnd(), rnd(), () => [[neckBones[lo], neckBones[lo + 1]], [1 - fr, fr]]);
  }
  // ---- Forelock: between the ears, down the forehead -------------------------
  const head = bi('head');
  for (let n = 0; n < 300; n++) {
    const rootP = drop([1.115 + 0.06 * rnd(), 2.08, (rnd() - 0.5) * 0.06], [0, -1, 0]);
    const v0 = norm([0.6, -0.45 - 0.25 * rnd(), (rnd() - 0.5) * 0.5]); // down the slope of the forehead
    const [pts, nors] = drape(rootP, v0, [0.1, -0.45, 0], 0.12 + 0.09 * rnd(), 7, 0.01 * (0.4 + rnd()));
    mane.add(pts, nors, 0.004, 0.7 + 0.6 * rnd(), rnd(), () => [[head, head], [1, 0]]);
  }
  const maneMat = makeMat(true);
  const maneMesh = mane.build(maneMat, skeleton);
  maneMesh.castShadow = false; // strands are thinner than a shadow texel; avoids speckle on the neck
  maneMesh.customDepthMaterial = maneMat.userData.depth;
  root.add(maneMesh);

  // ---- Tail: a bundle flowing along the tail bone chain ----------------------
  const names = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6', 'tail7'];
  const J = names.map((n) => [rest[n].x, rest[n].y, 0]);
  J.push([-1.11, 0.33, 0]); // tip of the hair
  const tb = names.map(bi), arc = [0];
  for (let i = 1; i < J.length; i++) arc.push(arc[i - 1] + Math.hypot(J[i][0] - J[i - 1][0], J[i][1] - J[i - 1][1]));
  const total = arc[arc.length - 1];
  const centre = (a) => {
    let i = 0;
    while (i < J.length - 2 && a > arc[i + 1]) i++;
    const u = (a - arc[i]) / (arc[i + 1] - arc[i]);
    const T = norm([J[i + 1][0] - J[i][0], J[i + 1][1] - J[i][1], 0]);
    return { p: [J[i][0] + (J[i + 1][0] - J[i][0]) * u, J[i][1] + (J[i + 1][1] - J[i][1]) * u, 0], T, c: i + u - 0.5 };
  };
  const tail = new Strands();
  const rt = rng(21);
  for (let n = 0; n < 1300; n++) {
    const a0 = 0.22 * rt() ** 1.4, ang = rt() * Math.PI * 2, rf = Math.sqrt(rt());
    const L = total - a0 - 0.45 * rt() ** 2;
    const wav = 0.006 + 0.01 * rt(), wph = rt() * 6.28;
    const pts = [], nors = [], cs = [];
    const N = 13;
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1), a = a0 + s * L, { p, T, c } = centre(a);
      const bundle = 0.028 + 0.05 * Math.sin(Math.PI * Math.min(1, a / total) ** 0.75);
      const dock = 0.05 - 0.1 * a0;
      const rho = (dock + (bundle * rf - dock) * Math.min(1, s * 3.5)) * (1 + 0.5 * s * (rf - 0.5));
      const th = ang + 0.5 * Math.sin(s * 5 + wph);
      const N2 = [-T[1], T[0], 0];
      const o = [N2[0] * Math.cos(th), N2[1] * Math.cos(th), Math.sin(th)];
      const wv = wav * Math.sin(s * 14 + wph) * s;
      pts.push([p[0] + o[0] * rho + wv, p[1] + o[1] * rho, p[2] + o[2] * rho + wv]);
      nors.push(norm([o[0], o[1] + 0.15, o[2]]));
      cs.push(c);
    }
    tail.add(pts, nors, 0.0048, 0.7 + 0.6 * rt(), rt(), (i) => {
      const c = Math.max(0, Math.min(tb.length - 1, cs[i])), lo = Math.min(tb.length - 2, Math.floor(c));
      return [[tb[lo], tb[lo + 1]], [1 - (c - lo), c - lo]];
    });
  }
  const tailMat = makeMat(false);
  const tailMesh = tail.build(tailMat, skeleton);
  tailMesh.customDepthMaterial = tailMat.userData.depth;
  root.add(tailMesh);

  const hair = { mane: maneMesh, tail: tailMesh, uniforms, tailJoints: J };
  hair.setCoat = (coat) => {
    for (const mesh of [maneMesh, tailMesh]) {
      const col = mesh.geometry.attributes.color, tone = mesh.geometry.userData.tone;
      const { r, g, b } = coat._hair;
      for (let i = 0; i < tone.length; i++) col.setXYZ(i, r * tone[i] + 0.004, g * tone[i] + 0.003, b * tone[i] + 0.003);
      col.needsUpdate = true;
    }
  };
  return hair;
}
