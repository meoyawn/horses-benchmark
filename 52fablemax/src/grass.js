// A patch of real grass blades that travels with the horse. Tufts are laid out
// once on a square tile and wrapped around the focus point in the vertex
// shader, so the meadow appears endless; blades shrink away towards the edge
// of the patch, sway in the breeze and are pressed flat under the hooves.
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

const TILE = 26;          // metres across
const TUFTS = 34000;
const BLADES = 4;

function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tuftGeometry(rand) {
  // each blade: a tapered strip with a bend, 5 vertices; all sizes are in
  // units of blade height
  const pos = [];
  const tip = [];   // 0 at the root .. 1 at the tip
  const idx = [];
  for (let b = 0; b < BLADES; b++) {
    const yaw = rand() * Math.PI * 2;
    const lean = 0.18 + rand() * 0.5;
    const height = 0.6 + rand() * 0.4;
    const width = 0.06 + rand() * 0.05;
    const ox = (rand() - 0.5) * 0.5, oz = (rand() - 0.5) * 0.5;
    const cx = Math.cos(yaw), sz = Math.sin(yaw);
    const base = pos.length / 3;
    const levels = [[0, 0, 1], [0.5, 0.35, 0.75], [1, 1, 0]];
    for (const [h, bend, w] of levels) {
      const y = height * h;
      const out = lean * bend * height;   // blade curls outwards
      for (const side of w > 0 ? [-1, 1] : [0]) {
        pos.push(ox + cx * out - sz * side * width * w, y, oz + sz * out + cx * side * width * w);
        tip.push(h);
      }
    }
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  // three switches to flat shading when a mesh has no normals; the shader
  // supplies its own, so any values will do here
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0), 3));
  g.setIndex(idx);
  return g;
}

export function createGrass() {
  const rand = makeRandom(11);
  const base = tuftGeometry(rand);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('aTip', base.getAttribute('aTip'));
  geometry.setAttribute('normal', base.getAttribute('normal'));
  const spots = new Float32Array(TUFTS * 4);
  for (let i = 0; i < TUFTS; i++) {
    spots[i * 4] = rand() * TILE;
    spots[i * 4 + 1] = rand() * TILE;
    spots[i * 4 + 2] = rand();          // turn and size
    spots[i * 4 + 3] = rand();          // tint and sway phase
  }
  geometry.setAttribute('aSpot', new THREE.InstancedBufferAttribute(spots, 4));
  geometry.instanceCount = TUFTS;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const uniforms = {
    uFocus: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uHooves: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        attribute vec4 aSpot;
        attribute float aTip;
        uniform vec3 uFocus;
        uniform float uTime;
        uniform vec4 uHooves[4];
        varying vec3 vGrass;
        ${NOISE_GLSL}
        const float TILE = ${TILE.toFixed(1)};
        vec3 grassPos;
        void grassBlade() {
          // wrap the tuft into the square around the focus point
          vec2 cell = mod(aSpot.xy - uFocus.xz + TILE * 0.5, TILE) - TILE * 0.5;
          vec2 world = cell + uFocus.xz;
          float dist = length(cell);
          float keep = 1.0 - smoothstep(TILE * 0.30, TILE * 0.48, dist);
          float turn = aSpot.z * 6.2832;
          float size = (0.07 + 0.11 * fract(aSpot.z * 17.0)) * keep;
          // taller in the lush patches of the meadow
          float lush = fbm(world * 0.19 + 11.0, 3);
          size *= 0.7 + 0.7 * lush;
          vec2 r = vec2(cos(turn), sin(turn));
          vec3 p = vec3(position.x * r.x - position.z * r.y, position.y, position.x * r.y + position.z * r.x);
          p *= size;
          // breeze: travelling waves, stronger at the tip
          float wave = sin(uTime * 1.6 + world.x * 0.7 + world.y * 0.45 + aSpot.w * 3.0) + 0.5 * sin(uTime * 2.7 + world.x * 1.9);
          float sway = aTip * aTip * size * (0.22 + 0.16 * wave);
          p.x += sway * 0.75;
          p.z += sway * 0.4;
          // flattened where a hoof stands
          for (int i = 0; i < 4; i++) {
            vec2 away = world - uHooves[i].xy;
            float d = length(away);
            float press = (1.0 - smoothstep(0.05, 0.15, d)) * uHooves[i].z;
            p.y *= 1.0 - 0.85 * press;
            p.xz += normalize(away + 1e-4) * press * aTip * 0.06;
          }
          grassPos = vec3(world.x + p.x, p.y, world.y + p.z);
          // colour follows the same large patches as the ground beneath
          float big = fbm(world * 0.021 + 3.0, 3);
          float dryness = smoothstep(0.40, 0.74, big * 0.62 + lush * 0.38);
          vec3 green = mix(vec3(0.085, 0.20, 0.03), vec3(0.27, 0.29, 0.085), dryness * 0.8);
          green *= 0.75 + 0.5 * aSpot.w;
          vGrass = mix(green * 0.45, green * 1.35, aTip);
        }
      `)
      .replace('#include <beginnormal_vertex>', 'grassBlade();\nvec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', 'vec3 transformed = grassPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrass;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vGrass;')
      // blades are lit as part of the lawn: same normal on both faces
      .replace('#include <normal_fragment_begin>', /* glsl */ `
        float faceDirection = 1.0;
        vec3 normal = normalize(vNormal);
        vec3 nonPerturbedNormal = normal;
      `);
  };
  material.customProgramCacheKey = () => 'meadow-grass';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  return {
    mesh,
    /** hooves: array of four {x, z, weight} in world space */
    update(time, focus, hooves) {
      uniforms.uTime.value = time;
      uniforms.uFocus.value.set(focus.x, 0, focus.z);
      if (hooves) {
        for (let i = 0; i < 4; i++) uniforms.uHooves.value[i].set(hooves[i].x, hooves[i].z, hooves[i].w, 0);
      }
    },
  };
}
