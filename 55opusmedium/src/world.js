// Sky, ground and an endless wind-blown grass field (all procedural).
import * as THREE from 'three';

export const HORIZON = new THREE.Color(0xc9d6dc);
const ZENITH = new THREE.Color(0x5d8fc8);
export const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.35).normalize();

export function makeSky(radius) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uH: { value: HORIZON }, uZ: { value: ZENITH }, uSun: { value: SUN_DIR } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; }`,
    fragmentShader: `uniform vec3 uH; uniform vec3 uZ; uniform vec3 uSun; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = clamp(d.y,0.0,1.0);
        vec3 c = mix(uH, uZ, pow(h, 0.55));
        if (d.y < 0.0) c = mix(uH, uH*0.85, clamp(-d.y*4.0,0.0,1.0));
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0,0.9,0.75) * (pow(s, 600.0)*6.0 + pow(s, 12.0)*0.18);
        gl_FragColor = vec4(c,1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

function groundTexture() {
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#4f6a2c'; ctx.fillRect(0, 0, S, S);
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S, s = 2 + r() * 10;
    const g = 70 + r() * 70, rr = 50 + r() * 50, b = 25 + r() * 25;
    ctx.fillStyle = `rgba(${rr|0},${g|0},${b|0},${0.08 + r() * 0.18})`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      ctx.beginPath(); ctx.ellipse(x + ox, y + oy, s, s * (0.4 + r() * 0.6), r() * 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (let i = 0; i < 500; i++) { // bare earth flecks
    const x = r() * S, y = r() * S;
    ctx.fillStyle = `rgba(${110 + r() * 30 | 0},${90 + r() * 20 | 0},${60 | 0},0.25)`;
    ctx.fillRect(x, y, 1 + r() * 3, 1 + r() * 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makeGround() {
  const tex = groundTexture();
  tex.repeat.set(120, 120);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: 0xb8c2a0 }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  return g;
}

export function makeGrass(count = 140000, half = 15) {
  const seg = 4;
  const base = new THREE.BufferGeometry();
  const P = [], I = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    if (i < seg) { P.push(-0.5, t, 0, 0.5, t, 0); }
    else P.push(0, 1, 0);
  }
  for (let i = 0; i < seg - 1; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (seg - 1) * 2; I.push(a, a + 1, a + 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(I);
  const off = new Float32Array(count * 2), shp = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    off[i * 2] = (Math.random() * 2 - 1) * half;
    off[i * 2 + 1] = (Math.random() * 2 - 1) * half;
    const clump = Math.random() < 0.15 ? 1.6 : 1;
    shp[i * 4] = (0.05 + Math.pow(Math.random(), 1.8) * 0.13) * clump; // height
    shp[i * 4 + 1] = 0.008 + Math.random() * 0.012; // width
    shp[i * 4 + 2] = Math.random() * Math.PI * 2; // facing
    shp[i * 4 + 3] = Math.random(); // tint
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
  geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shp, 4));
  geo.instanceCount = count;

  const uniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uHalf: { value: half }, uHooves: { value: Array.from({ length: 4 }, () => new THREE.Vector3(0, 0, -9)) } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aOffset; attribute vec4 aShape; uniform float uTime; uniform vec2 uCenter; uniform float uHalf; uniform vec3 uHooves[4];
        varying vec2 vGrass;`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(0.0, 1.0, 0.0);`)
      .replace('#include <begin_vertex>', `
        float t = position.y;
        vec2 rel = mod(aOffset - uCenter + uHalf, 2.0 * uHalf) - uHalf;
        vec2 wp = uCenter + rel;
        float fade = 1.0 - smoothstep(uHalf * 0.6, uHalf, length(rel));
        float h = aShape.x * fade;
        float c = cos(aShape.z), s = sin(aShape.z);
        vec3 transformed = vec3(position.x * aShape.y * c, t * h, -position.x * aShape.y * s);
        float wind = sin(uTime * 1.3 + wp.x * 0.31 + wp.y * 0.17) * 0.6 + sin(uTime * 2.7 + wp.x * 1.7 + wp.y * 0.9) * 0.25;
        vec2 bend = vec2(0.18 + wind * 0.25, 0.08 + wind * 0.12) * t * t * h;
        // hooves press the grass aside
        for (int i = 0; i < 4; i++) {
          vec2 d = wp - uHooves[i].xy;
          float r = length(d);
          float k = (1.0 - smoothstep(0.05, 0.22, r)) * uHooves[i].z;
          bend += normalize(d + 1e-4) * k * 0.6 * t * h;
          transformed.y *= 1.0 - 0.55 * k;
        }
        transformed.xz += bend;
        transformed.y -= dot(bend, bend) * 0.8;
        transformed += vec3(wp.x, 0.0, wp.y);
        vGrass = vec2(t, aShape.w);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vGrass;`)
      .replace('#include <color_fragment>', `
        vec3 gb = mix(vec3(0.025, 0.045, 0.012), vec3(0.05, 0.07, 0.018), vGrass.y);
        vec3 gt = mix(vec3(0.11, 0.17, 0.04), vec3(0.2, 0.21, 0.07), vGrass.y * vGrass.y);
        diffuseColor.rgb = mix(gb, gt, smoothstep(0.0, 1.0, vGrass.x));`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.userData.uniforms = uniforms;
  return mesh;
}
