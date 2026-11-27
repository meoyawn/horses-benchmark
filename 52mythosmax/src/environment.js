// Sky dome, sun, pasture ground and grass — all procedural.
import * as THREE from 'three';

const NOISE_GLSL = `
float eHash(vec2 p){ return fract(sin(dot(p, vec2(27.61, 57.58))) * 43758.5); }
float eNoise(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(eHash(i), eHash(i+vec2(1,0)), f.x), mix(eHash(i+vec2(0,1)), eHash(i+vec2(1,1)), f.x), f.y); }
float eFbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*eNoise(p); p = p*2.03 + 17.0; a *= 0.5; } return s; }
`;

function makeSky(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 0.0); gl_Position = (projectionMatrix * vec4(p.xyz, 1.0)).xyww; }`,
    fragmentShader: `
      uniform vec3 uSun; uniform float uTime; varying vec3 vDir;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(vec3(0.74, 0.83, 0.92), vec3(0.17, 0.38, 0.74), pow(h, 0.48));
        float sd = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.86, 0.62) * (pow(sd, 900.0) * 6.0 + pow(sd, 14.0) * 0.22);
        // High thin clouds
        vec2 uv = d.xz / (d.y + 0.18) * 1.3 + uTime * 0.004;
        float c = smoothstep(0.48, 0.82, eFbm(uv)) * smoothstep(0.02, 0.25, d.y);
        col = mix(col, vec3(1.0, 0.98, 0.95) * (0.82 + 0.35 * sd), c * 0.75);
        // Distant hazy hills and the ground below the horizon
        float az = atan(d.z, d.x);
        float hill = 0.018 + 0.03 * eFbm(vec2(az * 2.4, 3.0)) + 0.012 * eNoise(vec2(az * 13.0, 9.0));
        vec3 hillCol = mix(vec3(0.36, 0.47, 0.42), vec3(0.62, 0.72, 0.78), 0.45);
        col = mix(col, hillCol, smoothstep(hill, hill - 0.006, d.y));
        col = mix(col, vec3(0.50, 0.60, 0.45), smoothstep(0.0, -0.02, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  sky.scale.setScalar(900);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

function grassTexture() {
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#4c6a2a';
  g.fillRect(0, 0, S, S);
  let seed = 3;
  const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 26000; i++) {
    const x = r() * S, y = r() * S, l = 3 + r() * 9, a = (r() - 0.5) * 1.2;
    const hue = 70 + r() * 40, light = 18 + r() * 26;
    g.strokeStyle = `hsla(${hue}, ${35 + r() * 30}%, ${light}%, 0.55)`;
    g.lineWidth = 0.6 + r() * 1.2;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.lineTo(x + ox + Math.sin(a) * l, y + oy - Math.cos(a) * l);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeGround() {
  const SIZE = 1600, TILE = 3.2;
  const map = grassTexture();
  map.repeat.setScalar(SIZE / TILE);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;\n' + NOISE_GLSL)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float macro = eFbm(vGround * 0.11), patch_ = eFbm(vGround * 0.9 + 40.0);
        diffuseColor.rgb *= mix(vec3(0.72, 0.80, 0.62), vec3(1.18, 1.12, 0.92), macro) * (0.85 + 0.3 * patch_);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.24, 0.15), smoothstep(0.66, 0.8, patch_ * macro * 2.0) * 0.5);`
      );
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.userData.follow = (p) => {
    // Slide in whole tiles so the texture never appears to move.
    mesh.position.set(Math.round(p.x / TILE) * TILE, 0, Math.round(p.z / TILE) * TILE);
  };
  return mesh;
}

/** Short pasture grass that wraps around a moving centre, so the field is endless. */
function makeGrass(count = 70000, R = 9) {
  const pos = new Float32Array(count * 9), base = new Float32Array(count * 9), col = new Float32Array(count * 9);
  let seed = 11;
  const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const bx = (r() * 2 - 1) * R, bz = (r() * 2 - 1) * R, a = r() * Math.PI, hgt = 0.05 + 0.11 * r() * r();
    const w = 0.006 + 0.006 * r(), lean = (r() - 0.5) * 0.08, ph = r();
    const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
    pos.set([-dx, 0, -dz, dx, 0, dz, lean, hgt, lean * 0.6], i * 9);
    for (let v = 0; v < 3; v++) base.set([bx, ph, bz], i * 9 + v * 3);
    c.setHSL(0.2 + 0.09 * r(), 0.45 + 0.25 * r(), 0.16 + 0.12 * r());
    col.set([c.r * 0.55, c.g * 0.55, c.b * 0.55, c.r * 0.55, c.g * 0.55, c.b * 0.55, c.r * 1.5, c.g * 1.5, c.b * 1.3], i * 9);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('base', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const nor = new Float32Array(count * 9);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const uniforms = { uCentre: { value: new THREE.Vector3() }, uTime: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 base;\nuniform vec3 uCentre;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `vec2 w = mod(base.xz - uCentre.xz + ${R.toFixed(1)}, ${(2 * R).toFixed(1)}) - ${R.toFixed(1)};
        float fade = 1.0 - smoothstep(${(R * 0.6).toFixed(1)}, ${(R * 0.98).toFixed(1)}, length(w));
        vec3 transformed = position * vec3(1.0, fade, 1.0);
        float bend = transformed.y * (0.25 * sin(uTime * 1.6 + base.y * 6.28 + (w.x + uCentre.x) * 0.7) + 0.12);
        transformed.xz += vec2(bend, bend * 0.4) + w + uCentre.xz;`
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

export function buildEnvironment(scene, renderer) {
  const sunDir = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
  const sky = makeSky(sunDir);
  scene.add(sky);
  scene.fog = new THREE.Fog(new THREE.Color(0.62, 0.72, 0.74), 40, 420);

  // Image-based lighting captured from our own sky.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(makeSky(sunDir));
  scene.environment = pmrem.fromScene(skyScene, 0.02).texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(0xfff1dc, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -4.5; sc.right = 4.5; sc.top = 4.5; sc.bottom = -4.5; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.012;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x4a5a30, 0.35));

  const ground = makeGround();
  const grass = makeGrass();
  scene.add(ground, grass);

  return {
    sunDir,
    update(centre, time) {
      sun.target.position.copy(centre);
      sun.position.copy(centre).addScaledVector(sunDir, 30);
      ground.userData.follow(centre);
      grass.userData.uniforms.uCentre.value.copy(centre);
      grass.userData.uniforms.uTime.value = time;
      sky.material.uniforms.uTime.value = time;
      sky.position.copy(centre);
    },
  };
}
