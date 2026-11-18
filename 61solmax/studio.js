import * as THREE from "three";
import { clamp, legs } from "./sculpt.js";
import { footIndex } from "./rig.js";

export function coatMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: .53,
    sheen: .10,
    sheenColor: new THREE.Color(0xcb844f),
    sheenRoughness: .85,
    clearcoat: .13,
    clearcoatRoughness: .48,
    specularIntensity: .50
  });

  material.onBeforeCompile = function addPelage(shader) {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 coatPoint;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ncoatPoint = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 coatPoint;

float coatHash(vec3 p) {
  return fract(sin(dot(p, vec3(47.81, 83.32, 19.73))) * 18371.278);
}

float coatNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 t = fract(p);
  t = t * t * (3.0 - 2.0 * t);
  vec2 low = vec2(mix(coatHash(cell), coatHash(cell + vec3(1,0,0)), t.x),
    mix(coatHash(cell + vec3(0,1,0)), coatHash(cell + vec3(1,1,0)), t.x));
  vec2 high = vec2(mix(coatHash(cell + vec3(0,0,1)), coatHash(cell + vec3(1,0,1)), t.x),
    mix(coatHash(cell + vec3(0,1,1)), coatHash(cell + vec3(1,1,1)), t.x));
  return mix(mix(low.x, low.y, t.y), mix(high.x, high.y, t.y), t.z);
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
vec3 p = coatPoint;
vec3 fiber = vec3(p.x * 141.0, (p.y - .38 * p.x + .09 * cos(p.x * 5.0)) * 460.0, p.z * 370.0);
float hairNoise = coatNoise(fiber);
float detailFade = 1.0 - smoothstep(.65, 2.15, length(fwidth(fiber)));
float hair = mix(.5, hairNoise, detailFade);
float mottling = coatNoise(p * 73.0);
diffuseColor.rgb *= .91 + .105 * mottling + .082 * hair;`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor *= .92 + .12 * mottling;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
vec3 dx = dFdx(-vViewPosition);
vec3 dy = dFdy(-vViewPosition);
vec3 gradX = cross(dy, normal);
vec3 gradY = cross(normal, dx);
float orientation = dot(dx, gradX);
vec3 coatGradient = .00018 * (dFdx(hair) * gradX + dFdy(hair) * gradY);
normal = normalize(abs(orientation) * normal - sign(orientation) * coatGradient);`);
  };
  return material;
}

export function createStudio(renderer, scene) {
  const light = new THREE.DirectionalLight(0xffe7d4, 2.50);
  light.position.set(1.6, 4.5, 3.05);
  light.target.position.set(.0, .9, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.left = -2.35;
  light.shadow.camera.right = 2.35;
  light.shadow.camera.top = 2.22;
  light.shadow.camera.bottom = -2.08;
  light.shadow.camera.near = .6;
  light.shadow.camera.far = 9.8;
  light.shadow.bias = -.00016;
  light.shadow.normalBias = .009;
  light.shadow.radius = 3;
  scene.add(light, light.target, new THREE.HemisphereLight(0xe1eafa, 0x6b5d50, .84));

  const edge = new THREE.DirectionalLight(0xffe7cf, 1.63);
  edge.position.set(-2.6, 3.3, -3.5);
  scene.add(edge);
  const fill = new THREE.DirectionalLight(0xc9dcf0, .60);
  fill.position.set(3.5, 2.1, -2.5);
  scene.add(fill);

  const generator = new THREE.PMREMGenerator(renderer);
  const environment = makeEnvironment();
  scene.environment = generator.fromEquirectangular(environment).texture;
  scene.environmentIntensity = .48;
  environment.dispose();
  generator.dispose();

  const ground = makeGround();
  scene.add(ground);
  const shadowMat = new THREE.ShadowMaterial({ color: 0x060a08, opacity: .09, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -.006;
  shadow.receiveShadow = true;
  shadow.renderOrder = 2;
  scene.add(shadow);

  const softTexture = shadowTexture();
  const core = softShadow(softTexture, 3.80, 1.55, .47, -.008);
  core.position.x = -.22;
  scene.add(core);
  const feet = legs.map(() => softShadow(softTexture, .43, .30, .56, -.002));
  scene.add(...feet);

  function placeShadows(rig) {
    for (const [index, patch] of feet.entries()) {
      const bone = rig.bones[footIndex(index)];
      const [ankle, hoof] = legs[index].joints.slice(3);
      const point = new THREE.Vector3(hoof[0] - ankle[0], hoof[1] - ankle[1], hoof[2] - ankle[2])
        .applyQuaternion(bone.quaternion).add(bone.position);
      patch.position.x = point.x + .011;
      patch.position.z = point.z;
      const lift = Math.max(0, point.y - hoof[1]);
      patch.material.opacity = .56 * Math.exp(-lift * 10);
      patch.scale.setScalar(1 + lift * 2);
    }
  }

  return { placeShadows };
}

function makeEnvironment() {
  const width = 192;
  const height = 96;
  const values = new Float32Array(width * height * 4);
  const key = new THREE.Vector3(.53, .68, .55).normalize();
  const rim = new THREE.Vector3(-.59, .61, -.53).normalize();
  const fill = new THREE.Vector3(.79, .32, -.37).normalize();

  for (let j = 0; j < height; j++) {
    const latitude = Math.PI * (j + .5) / height;
    const vertical = -Math.cos(latitude);
    const radius = Math.sin(latitude);
    for (let i = 0; i < width; i++) {
      const azimuth = Math.PI * 2 * (i + .5) / width;
      const x = Math.cos(azimuth) * radius;
      const z = Math.sin(azimuth) * radius;
      const a = clamp(key.x * x + key.y * vertical + key.z * z, 0, 1) ** 31 * 4.0;
      const b = clamp(rim.x * x + rim.y * vertical + rim.z * z, 0, 1) ** 49 * 6.6;
      const c = clamp(fill.x * x + fill.y * vertical + fill.z * z, 0, 1) ** 14 * 1.08;
      const ambient = .085 + .11 * clamp(vertical + .40, 0, 1);
      const p = 4 * (j * width + i);
      values[p] = ambient + a + b + .78 * c;
      values[p + 1] = ambient + .83 * a + .76 * b + .90 * c;
      values[p + 2] = ambient * 1.07 + .65 * a + .52 * b + c;
      values[p + 3] = 1;
    }
  }

  const texture = new THREE.DataTexture(values, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function makeGround() {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `
      varying vec2 groundUV;
      void main() {
        groundUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 groundUV;
      void main() {
        vec2 p = 2.0 * groundUV - 1.0;
        float r = length(p);
        float grain = fract(sin(dot(floor(groundUV * vec2(2472.0, 1810.0)), vec2(13.82, 79.92))) * 43124.81);
        vec3 base = vec3(.119, .143, .124) + (grain - .5) * .013;
        gl_FragColor = vec4(base, .53 * (1.0 - smoothstep(.12, .97, r)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(7.65, 6.2), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -.012;
  return plane;
}

function shadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const brush = canvas.getContext("2d");
  const gradient = brush.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(5, 8, 6, 1)");
  gradient.addColorStop(.35, "rgba(5, 8, 6, .78)");
  gradient.addColorStop(.64, "rgba(5, 8, 6, .24)");
  gradient.addColorStop(1, "rgba(5, 8, 6, 0)");
  brush.fillStyle = gradient;
  brush.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function softShadow(texture, x, z, opacity, y) {
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity, depthWrite: false
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(x, z), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = y;
  plane.renderOrder = 3;
  return plane;
}
