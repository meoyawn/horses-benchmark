// Procedural outdoor environment: analytic sky with drifting clouds, sun light
// with a shadow frustum that follows the horse, image-based ambient light baked
// from the same sky, and an endless meadow shaded from world-space noise.
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // always at the far plane
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uForEnv;   // 1 when baking the ambient cube map
varying vec3 vDir;
${NOISE_GLSL}

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, 0.0, 1.0);
  float hz = pow(1.0 - up, 3.4);
  vec3 col = mix(uZenith, uHorizon, hz);

  float mu = max(dot(d, uSunDir), 0.0);
  // warm scattering halo around the sun
  col += uSunColor * (0.10 * pow(mu, 6.0) + 0.22 * pow(mu, 48.0)) * (0.55 + 0.45 * hz);

  // clouds: fractal noise on a virtual layer, thinning towards the horizon
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.11) * 1.15 + vec2(uTime * 0.006, uTime * 0.0025);
    float shape = fbm(vec3(cp, 3.1), 5);
    float detail = fbm(vec3(cp * 3.7 + 9.0, 5.3), 3);
    float cover = smoothstep(0.50, 0.74, shape + 0.16 * (detail - 0.5));
    cover *= smoothstep(0.015, 0.20, d.y);
    float lit = 0.62 + 0.38 * pow(mu, 3.0);
    float shade = smoothstep(0.52, 0.90, shape);
    vec3 cloud = mix(vec3(1.0, 0.985, 0.96) * lit, vec3(0.70, 0.76, 0.84), shade * 0.55);
    col = mix(col, cloud, cover * 0.86);
  }

  if (uForEnv < 0.5) {
    // visible sun disc with a soft limb
    col += uSunColor * smoothstep(0.99955, 0.99985, mu) * 6.0;
  }

  // below the horizon: the bounce colour of the meadow
  col = mix(col, uGround, smoothstep(0.0, -0.06, d.y));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createEnvironment(renderer, scene) {
  const sunDir = new THREE.Vector3(0.62, 0.66, 0.43).normalize();

  // Colours are authored in display space; the sky is drawn without tone
  // mapping so the fog colour can match the horizon exactly.
  const zenith = new THREE.Color('#3b76c4');
  const horizon = new THREE.Color('#cfdfeb');
  const groundBounce = new THREE.Color('#5d6a3c');
  const sunColor = new THREE.Color('#fff1d6');

  const skyUniforms = {
    uSunDir: { value: sunDir },
    uZenith: { value: zenith },
    uHorizon: { value: horizon },
    uGround: { value: groundBounce },
    uSunColor: { value: sunColor },
    uTime: { value: 0 },
    uForEnv: { value: 0 },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial);
  sky.scale.setScalar(900);
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  scene.add(sky);

  scene.fog = new THREE.Fog(horizon.clone(), 70, 820);

  // --- ambient light baked from the sky ------------------------------------
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(sky.geometry, skyMaterial);
  envSky.scale.setScalar(50);
  envSky.frustumCulled = false;
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  skyUniforms.uForEnv.value = 1;
  const envTarget = pmrem.fromScene(envScene, 0.035, 0.1, 200);
  skyUniforms.uForEnv.value = 0;
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();

  // --- sun -------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -4.2; sc.right = 4.2; sc.top = 4.2; sc.bottom = -4.2;
  sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 2.6;
  scene.add(sun);
  scene.add(sun.target);

  // --- meadow ----------------------------------------------------------------
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  groundMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGWorld;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        {
          vec2 gp = vGWorld.xz;
          float dist = length(vViewPosition);
          float nearFade = 1.0 - smoothstep(5.0, 38.0, dist);
          float midFade = 1.0 - smoothstep(40.0, 260.0, dist);
          float big = fbm(gp * 0.021 + 3.0, 4);
          float mid = fbm(gp * 0.19 + 11.0, 4);
          float fine = fbm(gp * 2.9, 3);
          float blades = fbm(gp * 17.0 + 5.0, 2) * fbm(gp * 43.0, 2);
          vec3 lush = vec3(0.090, 0.185, 0.032);
          vec3 dry = vec3(0.265, 0.270, 0.085);
          vec3 deep = vec3(0.040, 0.105, 0.028);
          float dryness = smoothstep(0.40, 0.74, big * 0.62 + mid * 0.38 * midFade + 0.19 * (1.0 - midFade));
          vec3 g = mix(lush, dry, dryness * 0.8);
          g = mix(g, deep, smoothstep(0.56, 0.86, mid) * 0.55 * midFade);
          g *= mix(1.0, 0.72 + 0.56 * fine, nearFade);
          g *= mix(1.0, 0.72 + 1.1 * blades, nearFade);
          // darker soil showing between the blades close to the eye
          g *= mix(1.0, 0.8, nearFade);
          diffuseColor.rgb = g;
        }`);
  };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 72).rotateX(-Math.PI / 2), groundMaterial);
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  scene.add(ground);

  // --- far hills: two hazy ridges that give the horizon some shape ------------
  const hills = new THREE.Group();
  const ridge = (radius, height, seed, colour) => {
    const N = 320;
    const pos = new Float32Array((N + 1) * 2 * 3);
    const idx = [];
    const wave = (a) => {
      let h = 0, amp = 1, norm = 0;
      for (let o = 0; o < 5; o++) {
        const f = [3, 5, 9, 17, 31][o];
        h += amp * (0.5 + 0.5 * Math.sin(a * f + seed * (o + 1.7) + Math.sin(a * (f - 1) + seed)));
        norm += amp;
        amp *= 0.55;
      }
      return h / norm;
    };
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const top = height * (0.12 + 0.88 * Math.pow(wave(a), 1.6));
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      pos.set([x, -3, z, x, top, z], i * 6);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide, toneMapped: false }));
    m.frustumCulled = false;
    hills.add(m);
  };
  ridge(640, 62, 1.3, '#6f8a80');
  ridge(430, 30, 4.1, '#5f7d57');
  scene.add(hills);

  const focus = new THREE.Vector3();

  return {
    sun,
    sunDir,
    sky,
    ground,
    horizon,
    update(time, focusPoint, camera) {
      skyUniforms.uTime.value = time;
      sky.position.copy(camera.position);
      hills.position.set(camera.position.x, 0, camera.position.z);
      focus.set(focusPoint.x, 0, focusPoint.z);
      ground.position.set(Math.round(focus.x), 0, Math.round(focus.z));
      // Keep the shadow frustum centred on the horse, snapped to shadow texels
      // so the shadow edge does not shimmer while she moves.
      const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
      focus.x = Math.round(focus.x / texel) * texel;
      focus.z = Math.round(focus.z / texel) * texel;
      sun.target.position.set(focus.x, 0.9, focus.z);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 18);
    },
  };
}
