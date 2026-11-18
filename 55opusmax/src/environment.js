// Sky dome, sun, image-based lighting from the procedural sky, ground and instanced grass.
import * as THREE from 'three';

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;
const SKY_FRAG = /* glsl */`
  varying vec3 vDir;
  uniform vec3 uSunDir, uZenith, uHorizon, uGround, uSunColor;
  uniform float uSunDisk;
  #include <common>
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
    // warm glow around the sun, stronger towards the horizon
    float sd = max(dot(d, uSunDir), 0.0);
    float horizonGlow = exp(-max(h, 0.0) * 6.0);
    col += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 48.0) * 0.6) * (0.4 + 0.6 * horizonGlow);
    col += uSunColor * pow(sd, 2400.0) * 60.0 * uSunDisk;
    col = mix(col, uGround, smoothstep(0.0, -0.08, h));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.sunDir = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.time = 0;

    // ---- sky
    this.skyUniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDisk: { value: 1 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // ---- lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -3.2; sc.right = 3.2; sc.top = 3.2; sc.bottom = -3.2; sc.near = 0.5; sc.far = 30;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4a2a, 0.35);
    scene.add(this.hemi);

    // ---- fog
    scene.fog = new THREE.Fog(0xcfd8de, 35, 330);

    // ---- ground + grass + far hills
    this._makeGround();
    this._makeGrass();
    this._makeHills();
    this._makeTrees();

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.setTimeOfDay(0.32);
  }

  // t: 0 = sunrise, 0.5 = noon, 1 = sunset
  setTimeOfDay(t) {
    this.tod = t;
    const elev = Math.sin(Math.PI * t) * 58 * (Math.PI / 180) + 4 * (Math.PI / 180);
    const az = (-70 + 140 * t) * (Math.PI / 180) + Math.PI * 0.18;
    this.sunDir.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)).normalize();
    const low = 1 - Math.min(1, elev / (40 * Math.PI / 180));
    const sunCol = new THREE.Color().setRGB(1.0, 0.93 - 0.2 * low, 0.84 - 0.38 * low);
    const zen = new THREE.Color().setRGB(0.08 - 0.02 * low, 0.2 - 0.04 * low, 0.52 - 0.08 * low);
    const hor = new THREE.Color().setRGB(0.5 + 0.28 * low, 0.6 + 0.08 * low, 0.74 - 0.1 * low);
    const gnd = new THREE.Color().setRGB(0.24, 0.25, 0.2);
    const U = this.skyUniforms;
    U.uSunDir.value.copy(this.sunDir);
    U.uZenith.value.copy(zen);
    U.uHorizon.value.copy(hor);
    U.uGround.value.copy(gnd);
    U.uSunColor.value.copy(sunCol);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 2.2 + 1.6 * (1 - low);
    this.hemi.color.copy(zen).lerp(new THREE.Color(1, 1, 1), 0.5);
    this.hemi.groundColor.setRGB(0.22, 0.2, 0.12);
    this.scene.fog.color.copy(hor).multiplyScalar(0.95);
    this.grassUniforms.uSunDir.value.copy(this.sunDir);
    this._bakeEnvironment();
  }

  _bakeEnvironment() {
    // environment map rendered from the sky only
    const envScene = new THREE.Scene();
    const skyCopy = new THREE.Mesh(this.sky.geometry, this.sky.material.clone());
    skyCopy.material.uniforms = THREE.UniformsUtils.clone(this.skyUniforms);
    skyCopy.material.uniforms.uSunDisk.value = 0.0;
    envScene.add(skyCopy);
    // a ground disc so the lower hemisphere carries grass bounce light
    const g = new THREE.Mesh(new THREE.CircleGeometry(300, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.11, 0.13, 0.06) }));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    envScene.add(g);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0.02);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.85;
  }

  _makeGround() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x55702f, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vW;
          float gh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
          float gn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(gh(i), gh(i + vec2(1, 0)), u.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), u.x), u.y); }
          float gf(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * gn(p); p = p * 2.1 + 7.3; a *= 0.5; } return s; }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 p = vW.xz;
            float n1 = gf(p * 0.08), n2 = gf(p * 0.6), n3 = gn(p * 9.0);
            vec3 c1 = vec3(0.1, 0.17, 0.04), c2 = vec3(0.19, 0.25, 0.07), c3 = vec3(0.07, 0.12, 0.03);
            vec3 c = mix(c1, c2, smoothstep(0.35, 0.7, n1));
            c = mix(c, c3, smoothstep(0.55, 0.8, n2) * 0.6);
            c *= 0.85 + 0.3 * n3;
            // dry patches
            c = mix(c, vec3(0.27, 0.24, 0.13), smoothstep(0.62, 0.78, gf(p * 0.05 + 11.0)) * 0.55);
            diffuseColor.rgb = c;
          }`);
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 1, 1), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.ground = ground;
    this.scene.add(ground);
  }

  _makeGrass() {
    const COUNT = 140000;
    const SIZE = 26;
    // a single blade: 4 segments, tapered, slightly curved
    const segs = 4;
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const w = 0.0075 * (1 - t * 0.8);
      if (i < segs) {
        pos.push(-w, t, 0, w, t, 0);
        uvs.push(0, t, 1, t);
      } else {
        pos.push(0, 1, 0);
        uvs.push(0.5, 1);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (i < segs - 1) idx.push(a, b, c, b, d, c);
      else idx.push(a, b, c);
    }
    const blade = new THREE.InstancedBufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    blade.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    blade.setIndex(idx);
    const off = new Float32Array(COUNT * 4);
    const rnd = new Float32Array(COUNT * 4);
    let seed = 12345;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < COUNT; i++) {
      off[4 * i] = R() * SIZE; off[4 * i + 1] = R() * SIZE;
      off[4 * i + 2] = R() * Math.PI * 2; // yaw
      off[4 * i + 3] = 0.04 + 0.12 * Math.pow(R(), 1.8); // height
      rnd[4 * i] = R(); rnd[4 * i + 1] = R(); rnd[4 * i + 2] = R(); rnd[4 * i + 3] = R();
    }
    blade.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    blade.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
    blade.instanceCount = COUNT;
    this.grassUniforms = {
      uFocus: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uSize: { value: SIZE },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uHooves: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b8f3a, roughness: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.grassUniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aOff; attribute vec4 aRnd;
          uniform vec3 uFocus; uniform float uTime; uniform float uSize; uniform vec4 uHooves[4];
          varying float vH; varying vec3 vGCol;`)
        .replace('#include <begin_vertex>', `
          vec2 base = aOff.xy;
          base += floor((uFocus.xz - base) / uSize + 0.5) * uSize;
          float edge = length(base - uFocus.xz) / (uSize * 0.5);
          float hgt = aOff.w * (1.0 - smoothstep(0.7, 1.0, edge));
          float yaw = aOff.z;
          vec3 transformed = vec3(position.x, 0.0, 0.0);
          float t = position.y;
          // bend: static lean + wind
          float wind = sin(uTime * 1.7 + base.x * 0.35 + base.y * 0.21) * 0.5 + sin(uTime * 3.1 + base.x * 1.3) * 0.25;
          float lean = (aRnd.x - 0.5) * 0.9 + wind * 0.35;
          vec2 dir = vec2(cos(yaw), sin(yaw));
          // trampling: blades under and around the hooves bend away
          vec2 push = vec2(0.0);
          for (int i = 0; i < 4; i++) {
            vec2 dh = base - uHooves[i].xz;
            float dd = length(dh);
            push += normalize(dh + 1e-4) * smoothstep(0.16, 0.0, dd) * uHooves[i].w;
          }
          float bend = t * t;
          vec3 local = vec3(transformed.x * cos(yaw), 0.0, transformed.x * sin(yaw));
          local.y = t * hgt * (1.0 - 0.25 * bend * abs(lean));
          local.xz += (dir * lean + push * 2.2) * bend * hgt * 0.8;
          local.y *= 1.0 - 0.7 * min(1.0, length(push));
          transformed = vec3(base.x, 0.0, base.y) + local;
          vH = t;
          vGCol = mix(vec3(0.12, 0.2, 0.05), vec3(0.3, 0.38, 0.1), aRnd.y) * (0.8 + 0.4 * aRnd.z);
          vGCol = mix(vGCol, vec3(0.42, 0.38, 0.18), step(0.94, aRnd.w));`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vH; varying vec3 vGCol;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = vGCol * mix(0.62, 1.12, vH);`);
    };
    const grass = new THREE.Mesh(blade, mat);
    grass.frustumCulled = false;
    grass.receiveShadow = true;
    this.grass = grass;
    this.scene.add(grass);
  }

  _makeHills() {
    // a ring of soft hills on the horizon
    const geo = new THREE.CylinderGeometry(190, 190, 1, 256, 1, true);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
      const a = Math.atan2(z, x);
      const h = 7 + 6 * Math.sin(a * 3 + 1) + 4 * Math.sin(a * 7 + 2) + 2.5 * Math.sin(a * 13 + 0.5) + 1.2 * Math.sin(a * 29) + 0.6 * Math.sin(a * 61);
      p.setY(i, y > 0 ? Math.max(2, h) : -1);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f4a22, roughness: 1, side: THREE.BackSide });
    const hills = new THREE.Mesh(geo, mat);
    this.hills = hills;
    this.scene.add(hills);
  }

  _makeTrees() {
    // clumps of broadleaf trees scattered around the meadow edge (procedural, instanced)
    let seed = 4242;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const crown = new THREE.SphereGeometry(1, 24, 16);
    const p = crown.attributes.position;
    const nrm = crown.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.12 * Math.sin(x * 5.1 + y * 3.3) * Math.cos(z * 4.7 - y * 2.1) + 0.06 * Math.sin(x * 13 + z * 11 + y * 7);
      p.setXYZ(i, x * n, y * n * 0.82, z * n);
      nrm.setXYZ(i, x, y * 1.1 + 0.15, z);
    }
    crown.normalizeNormals();
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 1, 7);
    trunk.translate(0, 0.5, 0);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x2c4a1e, roughness: 0.95, flatShading: false });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2e22, roughness: 1 });
    const N = 80;
    const PER = 5;
    const crowns = new THREE.InstancedMesh(crown, crownMat, N * PER);
    const trunks = new THREE.InstancedMesh(trunk, trunkMat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const col = new THREE.Color();
    let ci = 0;
    for (let i = 0; i < N; i++) {
      const a = R() * Math.PI * 2;
      const r = 85 + R() * 120;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = 5 + R() * 6;
      sc.set(1 + R() * 0.6, h * 0.45, 1 + R() * 0.6);
      m.compose(pos.set(x, 0, z), q.identity(), sc);
      trunks.setMatrixAt(i, m);
      for (let k = 0; k < PER; k++) {
        const s = h * (0.24 + R() * 0.14);
        m.compose(pos.set(x + (R() - 0.5) * h * 0.55, h * 0.6 + R() * h * 0.35, z + (R() - 0.5) * h * 0.55), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), sc.set(s, s, s));
        crowns.setMatrixAt(ci, m);
        crowns.setColorAt(ci, col.setHSL(0.24 + R() * 0.06, 0.38 + R() * 0.15, 0.13 + R() * 0.07));
        ci++;
      }
    }
    crowns.castShadow = false;
    this.trees = new THREE.Group();
    this.trees.add(crowns, trunks);
    this.scene.add(this.trees);
  }

  update(dt, focus, hooves) {
    this.time += dt;
    this.grassUniforms.uTime.value = this.time;
    this.grassUniforms.uFocus.value.copy(focus);
    if (hooves) for (let i = 0; i < 4; i++) this.grassUniforms.uHooves.value[i].copy(hooves[i]);
    // keep the shadow frustum centred on the horse
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 12);
    // texel snapping to reduce shadow shimmering
    this.sky.position.copy(focus).setY(0);
    this.hills.position.set(focus.x, 0, focus.z);
  }
}
