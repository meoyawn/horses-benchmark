// Puffs of dust and torn grass kicked up by the hooves at speed: a small pool
// of soft, camera-facing sprites drawn with a procedural falloff.
import * as THREE from 'three';

const POOL = 160;

export function createDust() {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('uv', quad.getAttribute('uv'));
  const centre = new Float32Array(POOL * 3);
  const state = new Float32Array(POOL * 4); // size, opacity, spin, tone
  geometry.setAttribute('aCentre', new THREE.InstancedBufferAttribute(centre, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aState', new THREE.InstancedBufferAttribute(state, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount = POOL;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color('#9c8b6c') } }]),
    vertexShader: /* glsl */ `
      attribute vec3 aCentre;
      attribute vec4 aState;
      varying vec2 vUv;
      varying vec2 vFade;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv - 0.5;
        vFade = aState.yw;
        float c = cos(aState.z), s = sin(aState.z);
        vec2 corner = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aState.x;
        vec4 mvPosition = modelViewMatrix * vec4(aCentre, 1.0);
        mvPosition.xy += corner;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec2 vFade;
      #include <fog_pars_fragment>
      void main() {
        float r = length(vUv) * 2.0;
        float a = pow(max(0.0, 1.0 - r), 1.7) * vFade.x;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * (0.75 + 0.5 * vFade.y), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;

  const items = [];
  for (let i = 0; i < POOL; i++) items.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 0, spin: 0, tone: 0, grow: 0 });
  let next = 0;

  return {
    mesh,
    /** A hoof struck the ground at `pos` while travelling at `speed` along (dirX, dirZ). */
    kick(pos, speed, dirX, dirZ) {
      const strength = Math.min(1, Math.max(0, (speed - 2.2) / 7));
      if (strength <= 0) return;
      const count = 2 + Math.round(strength * 4);
      for (let i = 0; i < count; i++) {
        const p = items[next];
        const k = next * 3;
        next = (next + 1) % POOL;
        centre[k] = pos.x + (Math.random() - 0.5) * 0.12;
        centre[k + 1] = 0.04 + Math.random() * 0.05;
        centre[k + 2] = pos.z + (Math.random() - 0.5) * 0.12;
        // thrown back and up from the hoof
        const back = (0.4 + Math.random() * 0.9) * (0.5 + strength);
        p.vx = -dirX * back + (Math.random() - 0.5) * 0.7;
        p.vz = -dirZ * back + (Math.random() - 0.5) * 0.7;
        p.vy = 0.5 + Math.random() * 1.1 * (0.4 + strength);
        p.max = 0.55 + Math.random() * 0.7;
        p.life = p.max;
        p.size = 0.1 + Math.random() * 0.14;
        p.grow = 0.5 + Math.random() * 0.6 + strength * 0.5;
        p.spin = Math.random() * 6.28;
        p.tone = Math.random();
        p.alpha = 0.16 + 0.26 * strength;
      }
    },
    update(dt) {
      for (let i = 0; i < POOL; i++) {
        const p = items[i];
        const k = i * 3, s = i * 4;
        if (p.life <= 0) {
          state[s + 1] = 0;
          continue;
        }
        p.life -= dt;
        const t = 1 - Math.max(0, p.life) / p.max;
        centre[k] += p.vx * dt;
        centre[k + 1] += p.vy * dt;
        centre[k + 2] += p.vz * dt;
        p.vy -= 1.6 * dt;
        const drag = Math.exp(-dt * 2.5);
        p.vx *= drag; p.vz *= drag;
        if (centre[k + 1] < 0.03) { centre[k + 1] = 0.03; p.vy = 0; }
        state[s] = p.size + p.grow * t;
        state[s + 1] = p.alpha * Math.sin(Math.PI * Math.pow(t, 0.45)) * (1 - t);
        state[s + 2] = p.spin + t * 0.8;
        state[s + 3] = p.tone;
      }
      geometry.getAttribute('aCentre').needsUpdate = true;
      geometry.getAttribute('aState').needsUpdate = true;
    },
  };
}
