import {
  BackSide, BufferAttribute, BufferGeometry, CanvasTexture, Color, DirectionalLight, DoubleSide, FogExp2, HemisphereLight,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, ShaderMaterial, SphereGeometry, SRGBColorSpace,
} from 'three';
import { lerp, seededRandom, smoothstep } from './surface.js';

const tau = Math.PI * 2;
const horizon = new Color('#d5ccb5');

const noise = /* glsl */ `
float hash2(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float terrainNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.-2.*f);
  return mix(mix(hash2(i), hash2(i+vec2(1.,0.)), f.x), mix(hash2(i+vec2(0.,1.)), hash2(i+vec2(1.)), f.x), f.y);
}
`;

function sky() {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      horizon: { value: horizon },
      zenith: { value: new Color('#9eafa9') },
      cloud: { value: new Color('#eee3ca') },
    },
    vertexShader: /* glsl */ `
      varying vec3 skyPoint;
      void main() {
        skyPoint = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: noise + /* glsl */ `
      varying vec3 skyPoint;
      uniform vec3 horizon;
      uniform vec3 zenith;
      uniform vec3 cloud;
      void main() {
        vec3 d = normalize(skyPoint);
        float altitude = max(0., d.y);
        vec3 color = mix(horizon, zenith, smoothstep(-.04, .53, d.y));
        vec2 p = d.xz / (.28 + altitude) * vec2(2.3, 3.7);
        float haze = terrainNoise(p*.52)*.61 + terrainNoise(p*1.2)*.27 + terrainNoise(p*2.4)*.12;
        float cloudBand = smoothstep(.018, .14, altitude)*(1.-smoothstep(.30,.65,altitude));
        color = mix(color, cloud, cloudBand * smoothstep(.36,.83,haze)*.68);
        float sunshine = pow(max(0., dot(d, normalize(vec3(1.8, .62, -1.0)))), 6.);
        color = mix(color, cloud, .28*sunshine);
        gl_FragColor = vec4(color, 1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = new Mesh(new SphereGeometry(115, 36, 18), material);
  dome.renderOrder = -10;
  return dome;
}

function soilHeight(x, z) {
  const clearance = smoothstep(1.98, 5.1, Math.hypot(x * 0.76, z));
  return clearance * (0.12 * Math.sin(0.71 * x + 0.52 * z) + 0.087 * Math.cos(1.07 * z - 0.51 * x)
    + 0.036 * Math.sin(1.92 * x + 1.33 * z));
}

function ground() {
  const material = new MeshStandardMaterial({ color: '#b2a289', roughness: 0.94 });
  material.onBeforeCompile = function shadeGround(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSoil;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSoil = position.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSoil;\n' + noise)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + /* glsl */ `
        vec2 p = vSoil;
        float footprint = max(length(dFdx(p)), length(dFdy(p)));
        float grit = (terrainNoise(p*111.)-.5) * (1.-smoothstep(.006,.05,footprint));
        float coarse = (terrainNoise(p*28.)-.5) * (1.-smoothstep(.03,.14,footprint));
        float patches = .7*terrainNoise(p*.74) + .3*terrainNoise(p*3.);
        float center = 1.-smoothstep(.8,3.8,length(p));
        float verge = (1.-center)*smoothstep(.43,.72,patches);
        diffuseColor.rgb *= .86 + .25*patches + .22*grit + .16*coarse;
        diffuseColor.rgb = mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.68,.74,.53),verge*.45);
      `);
  };
  const geometry = new PlaneGeometry(182, 182, 182, 182);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    positions.setZ(i, soilHeight(positions.getX(i), -positions.getY(i)));
  }
  geometry.computeVertexNormals();
  const floor = new Mesh(geometry, material);
  floor.rotation.x = -Math.PI * 0.5;
  floor.receiveShadow = true;
  return floor;
}

function hillRing(radius, height, tint, phase) {
  const sides = 192;
  const layers = [[-8, 0], [-6.6, 0.09], [-5.1, 0.24], [-3.6, 0.42], [-2.0, 0.69], [-0.6, 0.95], [0, 1], [2.5, 0.91], [5, 0.64], [8, 0.26], [10, 0]];
  const vertices = [];
  const colors = [];
  const faces = [];
  const shade = new Color();
  const base = new Color(tint);
  const dryValley = new Color('#bab198');
  for (const [dr, rise] of layers) {
    for (let i = 0; i < sides; i++) {
      const a = i / sides * tau;
      const ridge = 0.49 + 0.17 * Math.cos(a * 3 + phase) + 0.13 * Math.sin(a * 5 - phase)
        + 0.094 * Math.sin(a * 8 + phase * 2) + 0.028 * Math.cos(a * 13) + 0.016 * Math.sin(a * 23 + phase);
      const r = radius + dr + 1.3 * Math.sin(a * 5 + phase) + 1.6 * Math.sin(a * 2 - phase);
      const x = r * Math.cos(a);
      const z = r * Math.sin(a);
      vertices.push(x, rise * ridge * height - 0.18 + soilHeight(x, z), z);
      shade.copy(dryValley).lerp(base, smoothstep(0.00, 0.61, rise)).multiplyScalar(
        0.98 + rise * 0.05 + 0.095 * Math.cos(a * 6 + phase - dr * 0.30) + 0.045 * Math.sin(a * 27 + dr * 0.44),
      );
      colors.push(shade.r, shade.g, shade.b);
    }
  }
  for (let j = 0; j < layers.length - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * sides + i;
      const b = j * sides + (i + 1) % sides;
      faces.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(faces);
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false }));
}

function meadow() {
  const vertices = [];
  const colors = [];
  const faces = [];
  const random = seededRandom(82563);
  const straw = new Color('#aca080');
  const green = new Color('#777b52');
  const leaf = new Color();
  for (let i = 0; i < 2080; i++) {
    const radius = 2.08 + random() ** 1.08 * 18.3;
    const a = random() * tau;
    const cx = Math.cos(a) * radius;
    const cz = Math.sin(a) * radius;
    const fieldPattern = Math.sin(cx * 1.68 + cz * 2.52) * Math.cos(cz * 1.61 - cx * 0.32);
    if (random() > 0.66 + fieldPattern * 0.37 || Math.hypot(cx * 0.73, cz * 1.24) < 1.79) continue;
    const cluster = 4 + Math.floor(random() * 8);
    const growth = (0.031 + random() ** 1.5 * 0.19) * lerp(0.67, 1.10, smoothstep(1.9, 5, radius));
    for (let j = 0; j < cluster; j++) {
      const direction = random() * tau;
      const cs = Math.cos(direction);
      const sn = Math.sin(direction);
      const w = 0.0025 + random() * 0.007;
      const x = cx + (random() - 0.5) * 0.19;
      const z = cz + (random() - 0.5) * 0.19;
      const height = growth * lerp(0.45, 1.30, random());
      const slope = height * lerp(0.23, 0.90, random());
      const y = soilHeight(x, z) - 0.009;
      const start = vertices.length / 3;
      vertices.push(
        x + cs * w, y, z - sn * w, x - cs * w, y, z + sn * w,
        x + cs * w * 0.53 + sn * slope * 0.35, y + height * 0.58, z - sn * w * 0.53 + cs * slope * 0.35,
        x - cs * w * 0.53 + sn * slope * 0.35, y + height * 0.58, z + sn * w * 0.53 + cs * slope * 0.35,
        x + sn * slope, y + height, z + cs * slope,
      );
      leaf.copy(green).lerp(straw, random() ** 0.83).multiplyScalar(0.91 + random() * 0.17);
      for (const lightness of [0.70, 0.74, 0.96, 1.04, 1.24]) {
        colors.push(leaf.r * lightness, leaf.g * lightness, leaf.b * lightness);
      }
      faces.push(start, start + 1, start + 2, start + 1, start + 3, start + 2, start + 2, start + 3, start + 4);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(faces);
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false }));
}

function ambientShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const fade = context.createRadialGradient(64, 64, 4, 64, 64, 64);
  fade.addColorStop(0, 'rgba(36,25,15,.32)');
  fade.addColorStop(0.48, 'rgba(36,25,15,.14)');
  fade.addColorStop(1, 'rgba(36,25,15,0)');
  context.fillStyle = fade;
  context.fillRect(0, 0, 128, 128);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({
    map, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  const shadow = new Mesh(new PlaneGeometry(3.45, 1.82), material);
  shadow.rotation.x = -Math.PI * 0.5;
  shadow.position.set(-0.11, 0.004, 0.025);
  return shadow;
}

export function dressScene(scene) {
  scene.fog = new FogExp2(horizon, 0.030);
  scene.add(sky(), ground(), meadow(), ambientShadow());
  scene.add(
    hillRing(25, 4.6, '#878b6e', 0.38),
    hillRing(38, 9.2, '#92998a', 2.23),
    hillRing(59, 17.2, '#a4a698', 3.78),
  );

  const fill = new HemisphereLight('#f9f3df', '#a88265', 1.34);
  const sun = new DirectionalLight('#fff0d1', 2.70);
  sun.position.set(2.75, 4.85, -3.45);
  sun.target.position.set(0.04, 0.85, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -3.1;
  sun.shadow.camera.right = 3.1;
  sun.shadow.camera.top = 3.1;
  sun.shadow.camera.bottom = -3.1;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 12;
  sun.shadow.normalBias = 0.015;
  sun.shadow.bias = -0.00014;
  sun.shadow.radius = 3.8;

  const rim = new DirectionalLight('#e2ebf5', 1.02);
  rim.position.set(-3.1, 3.1, 4.6);
  scene.add(fill, sun, sun.target, rim);
}
