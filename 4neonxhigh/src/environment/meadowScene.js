/**
 * meadowScene.js — 100% Procedural Sunlit Meadow Environment, Atmospheric Sky Shader,
 * PMREM Image-Based Lighting, 14,000+ Wind-Swaying Scrolling 3D Grass Blades,
 * Rustic Paddock Rail Fence, Distant Hills, Contact Shadow & Hoof Dust Particles.
 */

import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const LIGHTING_PRESETS = {
  golden: {
    name: 'Golden Hour',
    sunDir: new THREE.Vector3(0.68, 0.28, 0.68).normalize(),
    sunColor: new THREE.Color('#ffcf91'),
    sunIntensity: 3.4,
    hemiSky: new THREE.Color('#9fbce6'),
    hemiGround: new THREE.Color('#4f442c'),
    hemiIntensity: 1.05,
    rimColor: new THREE.Color('#ffba6b'),
    rimIntensity: 1.35,
    skyZenith: new THREE.Color('#28548f'),
    skyHorizon: new THREE.Color('#f4be84'),
    skySunGlow: new THREE.Color('#fff1cc'),
    fogColor: new THREE.Color('#dfc09b'),
    fogDensity: 0.017,
    exposure: 1.08,
    meadowVisible: true,
    groundTint: new THREE.Color('#707e44'),
    grassBase: new THREE.Color('#35481f'),
    grassTip: new THREE.Color('#a49c48'),
  },
  daylight: {
    name: 'Bright Meadow',
    sunDir: new THREE.Vector3(0.45, 0.78, 0.43).normalize(),
    sunColor: new THREE.Color('#fff8ec'),
    sunIntensity: 3.1,
    hemiSky: new THREE.Color('#9ad0ff'),
    hemiGround: new THREE.Color('#4b5d34'),
    hemiIntensity: 1.15,
    rimColor: new THREE.Color('#d8ebff'),
    rimIntensity: 0.85,
    skyZenith: new THREE.Color('#2d72c4'),
    skyHorizon: new THREE.Color('#cbe2f7'),
    skySunGlow: new THREE.Color('#fffbe6'),
    fogColor: new THREE.Color('#c9dff2'),
    fogDensity: 0.013,
    exposure: 1.04,
    meadowVisible: true,
    groundTint: new THREE.Color('#617c3d'),
    grassBase: new THREE.Color('#2f4d1e'),
    grassTip: new THREE.Color('#80a642'),
  },
  dawn: {
    name: 'Misty Dawn',
    sunDir: new THREE.Vector3(-0.62, 0.22, -0.75).normalize(),
    sunColor: new THREE.Color('#ffb899'),
    sunIntensity: 2.5,
    hemiSky: new THREE.Color('#9aa8cf'),
    hemiGround: new THREE.Color('#44484d'),
    hemiIntensity: 1.05,
    rimColor: new THREE.Color('#ffcdb8'),
    rimIntensity: 1.5,
    skyZenith: new THREE.Color('#3c4b78'),
    skyHorizon: new THREE.Color('#eab4aa'),
    skySunGlow: new THREE.Color('#ffe0c8'),
    fogColor: new THREE.Color('#cbb6be'),
    fogDensity: 0.025,
    exposure: 1.06,
    meadowVisible: true,
    groundTint: new THREE.Color('#5a6d4b'),
    grassBase: new THREE.Color('#2e3f2d'),
    grassTip: new THREE.Color('#7f8d63'),
  },
  studio: {
    name: 'Studio Spotlight',
    sunDir: new THREE.Vector3(0.58, 0.62, 0.52).normalize(),
    sunColor: new THREE.Color('#fff3e4'),
    sunIntensity: 3.0,
    hemiSky: new THREE.Color('#b8c6db'),
    hemiGround: new THREE.Color('#2b2c32'),
    hemiIntensity: 0.95,
    rimColor: new THREE.Color('#cfe0ff'),
    rimIntensity: 1.85,
    skyZenith: new THREE.Color('#14171e'),
    skyHorizon: new THREE.Color('#2a2f3a'),
    skySunGlow: new THREE.Color('#495163'),
    fogColor: new THREE.Color('#1f232c'),
    fogDensity: 0.022,
    exposure: 1.12,
    meadowVisible: false,
    groundTint: new THREE.Color('#2b2f38'),
    grassBase: new THREE.Color('#2b2f38'),
    grassTip: new THREE.Color('#2b2f38'),
  },
};

/** Procedural organic meadow ground turf + dirt texture */
function createMeadowGroundTexture(size = 512) {
  const rand = mulberry32(6041);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#5c6b3a';
  ctx.fillRect(0, 0, size, size);

  // Organic earth & moss patches
  for (let i = 0; i < 420; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 44;
    const isDirt = rand() < 0.25;
    const col = isDirt
      ? `rgba(${98 + Math.floor(rand() * 26)},${82 + Math.floor(rand() * 20)},${56 + Math.floor(rand() * 14)},0.20)`
      : `rgba(${68 + Math.floor(rand() * 42)},${88 + Math.floor(rand() * 42)},${38 + Math.floor(rand() * 24)},0.22)`;
    for (const ox of [-size, 0, size]) {
      if (x + ox < -r || x + ox > size + r) continue;
      for (const oy of [-size, 0, size]) {
        if (y + oy < -r || y + oy > size + r) continue;
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Fine blades & soil speckle
  for (let i = 0; i < 6500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 3 + rand() * 6;
    const ang = rand() * Math.PI * 2;
    const lum = 62 + Math.floor(rand() * 65);
    ctx.strokeStyle = `rgba(${lum},${Math.min(255, lum + 24)},${Math.max(0, lum - 26)},0.30)`;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Procedural organic soft cloud-like dust puff texture (zero hard disc edges!) */
function createFeatheredDustTexture(size = 128) {
  const rand = mulberry32(91827);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  // Layer 14 soft overlapping wispy sub-puffs for organic feathered dust cloud
  const cx = size * 0.5;
  const cy = size * 0.5;
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const dist = rand() * size * 0.16;
    const px = cx + Math.cos(a) * dist;
    const py = cy + Math.sin(a) * dist;
    const r = size * (0.20 + rand() * 0.16);
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0.0, 'rgba(232, 206, 172, 0.22)');
    g.addColorStop(0.45, 'rgba(220, 192, 155, 0.10)');
    g.addColorStop(1.0, 'rgba(210, 182, 145, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Procedural soft radial texture for subtle contact ground shadow */
function createSoftRadialTexture(size = 128, innerAlpha = 0.7) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, `rgba(255,255,255,${innerAlpha})`);
  g.addColorStop(0.35, `rgba(255,255,255,${(innerAlpha * 0.42).toFixed(2)})`);
  g.addColorStop(0.70, `rgba(255,255,255,${(innerAlpha * 0.12).toFixed(2)})`);
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Create the complete meadow environment + lighting rig + sky dome + PMREM IBL + scrolling grass + fence + dust!
 */
export function createMeadowEnvironment(scene, renderer) {
  const envGroup = new THREE.Group();
  scene.add(envGroup);

  const pmremGen = new THREE.PMREMGenerator(renderer);
  pmremGen.compileEquirectangularShader();

  // =========================================================================
  // 1. PROCEDURAL ATMOSPHERIC SKY DOME (with drifting sunlit clouds & sun halo)
  // =========================================================================
  const skyUniforms = {
    uZenith: { value: LIGHTING_PRESETS.golden.skyZenith.clone() },
    uHorizon: { value: LIGHTING_PRESETS.golden.skyHorizon.clone() },
    uSunGlow: { value: LIGHTING_PRESETS.golden.skySunGlow.clone() },
    uSunDir: { value: LIGHTING_PRESETS.golden.sunDir.clone() },
    uTime: { value: 0 },
    uClouds: { value: 1.0 },
  };

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunGlow;
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform float uClouds;
      varying vec3 vWorldDir;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
          mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float fbm2(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise2(p);
          p *= 2.05;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float elev = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(elev, 0.52));

        // Ground bounce fade below horizon
        if (dir.y < 0.0) {
          col = mix(uHorizon, uHorizon * 0.42, clamp(-dir.y * 4.0, 0.0, 1.0));
        }

        // Solar Mie glow & crisp sun disk
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        col += uSunGlow * pow(sunDot, 10.0) * 0.42 * uClouds;
        col += uSunGlow * pow(sunDot, 320.0) * 1.45 * uClouds;

        // Soft drifting procedural high-altitude clouds
        if (uClouds > 0.05 && dir.y > 0.02) {
          vec2 cloudUV = dir.xz / (dir.y + 0.18) * 0.85 + vec2(uTime * 0.006, uTime * 0.002);
          float c = fbm2(cloudUV);
          float cloudMask = smoothstep(0.46, 0.78, c) * smoothstep(0.02, 0.22, dir.y) * uClouds;
          vec3 cloudLit = mix(uHorizon * 0.95, uSunGlow * 1.08, 0.45 + 0.55 * pow(sunDot, 3.0));
          col = mix(col, cloudLit, cloudMask * 0.55);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(85, 32, 20), skyMat);
  envGroup.add(skyDome);

  // =========================================================================
  // 2. THREE-POINT NATURAL + RIM LIGHTING RIG WITH CRISP SOFT SHADOWS
  // =========================================================================
  const sunLight = new THREE.DirectionalLight(0xffcf91, 3.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1.0;
  sunLight.shadow.camera.far = 28.0;
  const d = 3.2;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.024;
  scene.add(sunLight);

  const hemiLight = new THREE.HemisphereLight(0x9fbce6, 0x4f442c, 1.05);
  scene.add(hemiLight);

  // Subtle equestrian rim light opposing sun so coat velvet & mane catch luminous highlights!
  const rimLight = new THREE.DirectionalLight(0xffba6b, 1.35);
  scene.add(rimLight);

  // =========================================================================
  // 3. SEAMLESS MEADOW GROUND + CONTACT AO SHADOW
  // =========================================================================
  const groundTex = createMeadowGroundTexture(512);
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    color: LIGHTING_PRESETS.golden.groundTint.clone(),
    roughness: 0.94,
    metalness: 0.0,
  });
  const groundMesh = new THREE.Mesh(new THREE.CircleGeometry(78, 64), groundMat);
  groundMesh.rotation.x = -Math.PI * 0.5;
  groundMesh.receiveShadow = true;
  envGroup.add(groundMesh);

  // Studio neutral seamless floor (shown only in Studio lighting mode)
  const studioFloorMat = new THREE.MeshStandardMaterial({
    color: 0x262a33,
    roughness: 0.82,
    metalness: 0.05,
  });
  const studioFloor = new THREE.Mesh(new THREE.CircleGeometry(78, 64), studioFloorMat);
  studioFloor.rotation.x = -Math.PI * 0.5;
  studioFloor.position.y = 0.001;
  studioFloor.receiveShadow = true;
  studioFloor.visible = false;
  envGroup.add(studioFloor);

  // Subtle soft contact AO shadow directly underneath horse's belly & hooves
  const aoTex = createSoftRadialTexture(128, 0.34);
  const aoMat = new THREE.MeshBasicMaterial({
    color: 0x0c0d09,
    alphaMap: aoTex,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const contactAO = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), aoMat);
  contactAO.rotation.x = -Math.PI * 0.5;
  contactAO.position.set(0, 0.004, -0.05);
  envGroup.add(contactAO);

  // =========================================================================
  // 4. 18,000+ INSTANCED WIND-SWAYING & SCROLLING 3D GRASS BLADES!
  // =========================================================================
  const meadowPropsGroup = new THREE.Group();
  envGroup.add(meadowPropsGroup);

  const grassCount = 18000;
  const fieldHalfX = 16.0;
  const fieldHalfZ = 18.0;

  // Tapered slightly curved single blade geometry (5 verts, 3 tris -> super fast!)
  const bladeGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array([
    -0.014, 0.00, 0.0,
     0.014, 0.00, 0.0,
    -0.010, 0.08, 0.008,
     0.010, 0.08, 0.008,
     0.000, 0.17, 0.026,
  ]);
  const bUv = new Float32Array([
    0, 0, 1, 0, 0, 0.5, 1, 0.5, 0.5, 1,
  ]);
  bladeGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bladeGeo.setAttribute('uv', new THREE.BufferAttribute(bUv, 2));
  bladeGeo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  bladeGeo.computeVertexNormals();

  const grassUniforms = {
    uTime: { value: 0 },
    uScrollZ: { value: 0 },
    uHalfZ: { value: fieldHalfZ },
    uGrassBase: { value: LIGHTING_PRESETS.golden.grassBase.clone() },
    uGrassTip: { value: LIGHTING_PRESETS.golden.grassTip.clone() },
  };

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  grassMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, grassUniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aGrassSeed; // (baseX, baseZ, scaleY, phase)
        uniform float uTime;
        uniform float uScrollZ;
        uniform float uHalfZ;
        varying float vBladeH;
        varying float vShade;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBladeH = uv.y;
        vShade = aGrassSeed.w;

        // Infinite treadmill wrap along Z synchronized with horse ground speed!
        float span = uHalfZ * 2.0;
        float wz = mod(aGrassSeed.y - uScrollZ + uHalfZ, span) - uHalfZ;
        float wx = aGrassSeed.x;

        // Slightly shorter & sparser directly along the narrow horse dirt track
        float trackFade = smoothstep(0.35, 1.35, abs(wx));
        float hScale = aGrassSeed.z * (0.45 + 0.55 * trackFade);

        // Rotate blade naturally around Y + apply organic meadow wind wave
        float ang = aGrassSeed.w * 6.2831;
        float ca = cos(ang);
        float sa = sin(ang);
        vec3 p = vec3(
          position.x * ca - position.z * sa,
          position.y * hScale,
          position.x * sa + position.z * ca
        );

        float windWave = sin(uTime * 2.1 + wx * 0.45 + wz * 0.38 + aGrassSeed.w * 4.0) * 0.045
                       + cos(uTime * 3.4 + wx * 0.9 - wz * 0.5) * 0.018;
        float bend = uv.y * uv.y;
        p.x += windWave * bend;
        p.z -= windWave * 0.55 * bend;

        transformed = vec3(wx + p.x, p.y, wz + p.z);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uGrassBase;
        uniform vec3 uGrassTip;
        varying float vBladeH;
        varying float vShade;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 gCol = mix(uGrassBase, uGrassTip, pow(vBladeH, 0.85));
        gCol *= 0.82 + 0.36 * fract(vShade * 7.31);
        diffuseColor.rgb *= gCol;`
      );
  };
  grassMat.customProgramCacheKey = () => 'equus-meadow-grass-v1';

  const rand = mulberry32(202611);
  const seedData = new Float32Array(grassCount * 4);
  for (let i = 0; i < grassCount; i++) {
    // Concentrate slightly denser near the camera/horse while filling out meadow
    const ux = (rand() * 2 - 1);
    const uz = (rand() * 2 - 1);
    const x = Math.sign(ux) * Math.pow(Math.abs(ux), 1.25) * fieldHalfX;
    const z = uz * fieldHalfZ;
    const scaleY = 0.65 + rand() * 1.15;
    const phase = rand();
    seedData[i * 4] = x;
    seedData[i * 4 + 1] = z;
    seedData[i * 4 + 2] = scaleY;
    seedData[i * 4 + 3] = phase;
  }
  bladeGeo.setAttribute('aGrassSeed', new THREE.InstancedBufferAttribute(seedData, 4));

  const grassInst = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
  grassInst.frustumCulled = false;
  grassInst.receiveShadow = true;
  // Identity instance matrices because position is driven cleanly by aGrassSeed in shader!
  const idMat = new THREE.Matrix4();
  for (let i = 0; i < grassCount; i++) {
    grassInst.setMatrixAt(i, idMat);
  }
  grassInst.instanceMatrix.needsUpdate = true;
  meadowPropsGroup.add(grassInst);

  // =========================================================================
  // 5. SCROLLING RUSTIC WOODEN PADDOCK RAIL FENCE (background depth & motion cue!)
  // =========================================================================
  const fenceGroup = new THREE.Group();
  meadowPropsGroup.add(fenceGroup);

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x5c4632,
    roughness: 0.92,
    metalness: 0.0,
  });
  const fenceSpacing = 3.2;
  const fenceSpanCount = 16; // spans from -25.6 to +25.6 along Z
  const fenceTotalLen = fenceSpacing * fenceSpanCount;
  const fenceX = -6.2; // sits cleanly behind the horse in default 3/4 hero view!

  const postGeo = new THREE.CylinderGeometry(0.068, 0.078, 1.38, 7);
  const railGeo = new THREE.BoxGeometry(0.05, 0.11, fenceSpacing + 0.04);

  const fenceSegments = [];
  for (let i = 0; i < fenceSpanCount; i++) {
    const seg = new THREE.Group();
    const baseZ = (i - fenceSpanCount / 2) * fenceSpacing;
    seg.userData.baseZ = baseZ;
    seg.position.set(fenceX, 0, baseZ);

    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.y = 0.67;
    post.rotation.y = rand() * Math.PI;
    post.castShadow = true;
    post.receiveShadow = true;
    seg.add(post);

    for (const ry of [0.58, 1.08]) {
      const rail = new THREE.Mesh(railGeo, woodMat);
      rail.position.set(0.04, ry, fenceSpacing * 0.5);
      rail.castShadow = true;
      rail.receiveShadow = true;
      seg.add(rail);
    }

    fenceGroup.add(seg);
    fenceSegments.push(seg);
  }

  // =========================================================================
  // 6. DISTANT ROLLING MEADOW HILLS WITH ATMOSPHERIC HAZE BLEND
  // =========================================================================
  const hillGeo = new THREE.CylinderGeometry(58, 62, 10, 96, 2, true);
  const hPos = hillGeo.attributes.position;
  for (let i = 0; i < hPos.count; i++) {
    const y = hPos.getY(i);
    const x = hPos.getX(i);
    const z = hPos.getZ(i);
    const a = Math.atan2(z, x);
    if (y > 1.0) {
      const ridge =
        2.6 +
        Math.sin(a * 3.0 + 0.6) * 2.1 +
        Math.cos(a * 7.0 - 1.1) * 1.1 +
        Math.sin(a * 17.0) * 0.45 +
        Math.cos(a * 31.0) * 0.22;
      hPos.setY(i, ridge);
    } else if (y > -1.0) {
      hPos.setY(i, 0.8);
    } else {
      hPos.setY(i, -1.5);
    }
  }
  hillGeo.computeVertexNormals();
  const hillMat = new THREE.MeshStandardMaterial({
    color: 0x4b5c3b,
    roughness: 1.0,
    side: THREE.BackSide,
  });
  const hills = new THREE.Mesh(hillGeo, hillMat);
  meadowPropsGroup.add(hills);

  // =========================================================================
  // 7. FEATHERED WISPY HOOF-IMPACT DUST PARTICLE SYSTEM
  // =========================================================================
  const maxDust = 72;
  const dustTex = createFeatheredDustTexture(128);
  const dustMatBase = new THREE.MeshBasicMaterial({
    map: dustTex,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const dustGeo = new THREE.PlaneGeometry(0.32, 0.32);
  const dustPool = [];
  for (let i = 0; i < maxDust; i++) {
    const m = new THREE.Mesh(dustGeo, dustMatBase.clone());
    m.visible = false;
    envGroup.add(m);
    dustPool.push({
      mesh: m,
      life: 0,
      maxLife: 0.8,
      vel: new THREE.Vector3(),
      scale0: 0.3,
      scale1: 1.35,
      rotZ: Math.random() * Math.PI * 2,
    });
  }
  let dustCursor = 0;

  function spawnHoofDust(pos, intensity, groundSpeed) {
    if (!meadowPropsGroup.visible) return;
    const count = Math.ceil(2 + intensity * 3);
    for (let k = 0; k < count; k++) {
      const p = dustPool[dustCursor];
      dustCursor = (dustCursor + 1) % maxDust;
      p.life = 0.001;
      p.maxLife = 0.48 + Math.random() * 0.38;
      p.scale0 = 0.30 + Math.random() * 0.22;
      p.scale1 = 1.15 + intensity * 0.95 + Math.random() * 0.45;
      p.rotZ = Math.random() * Math.PI * 2;
      p.mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.14,
        0.04 + Math.random() * 0.04,
        pos.z + (Math.random() - 0.5) * 0.14
      );
      p.vel.set(
        (Math.random() - 0.5) * 0.42,
        0.28 + intensity * 0.40 + Math.random() * 0.25,
        -groundSpeed * 0.42 - 0.30 - Math.random() * 0.45
      );
      p.mesh.visible = true;
    }
  }

  // =========================================================================
  // 8. LIGHTING PRESET SWITCHER + PROCEDURAL PMREM ENVIRONMENT MAP GENERATOR
  // =========================================================================
  let currentEnvRT = null;

  function rebuildPMREM(preset) {
    // Render our procedural sky dome inside a tiny temporary scene into a crisp IBL cubemap!
    const iblScene = new THREE.Scene();
    const iblSky = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16), skyMat);
    iblScene.add(iblSky);

    if (currentEnvRT) currentEnvRT.dispose();
    currentEnvRT = pmremGen.fromScene(iblScene, 0.04);
    scene.environment = currentEnvRT.texture;
    scene.environmentIntensity = preset.meadowVisible ? 0.72 : 0.92;
  }

  function applyLightingPreset(key) {
    const p = LIGHTING_PRESETS[key] || LIGHTING_PRESETS.golden;

    sunLight.color.copy(p.sunColor);
    sunLight.intensity = p.sunIntensity;
    sunLight.position.copy(p.sunDir).multiplyScalar(14);

    hemiLight.color.copy(p.hemiSky);
    hemiLight.groundColor.copy(p.hemiGround);
    hemiLight.intensity = p.hemiIntensity;

    rimLight.color.copy(p.rimColor);
    rimLight.intensity = p.rimIntensity;
    rimLight.position.set(-p.sunDir.x * 10, 4.5, -p.sunDir.z * 10);

    skyUniforms.uZenith.value.copy(p.skyZenith);
    skyUniforms.uHorizon.value.copy(p.skyHorizon);
    skyUniforms.uSunGlow.value.copy(p.skySunGlow);
    skyUniforms.uSunDir.value.copy(p.sunDir);
    skyUniforms.uClouds.value = p.meadowVisible ? 1.0 : 0.0;

    scene.fog = new THREE.FogExp2(p.fogColor.getHex(), p.fogDensity);
    renderer.toneMappingExposure = p.exposure;

    groundMesh.visible = p.meadowVisible;
    meadowPropsGroup.visible = p.meadowVisible;
    studioFloor.visible = !p.meadowVisible;

    groundMat.color.copy(p.groundTint);
    grassUniforms.uGrassBase.value.copy(p.grassBase);
    grassUniforms.uGrassTip.value.copy(p.grassTip);
    hillMat.color.copy(p.groundTint).multiplyScalar(0.75);

    rebuildPMREM(p);
  }

  // Initialize with warm Golden Hour!
  applyLightingPreset('golden');

  let scrollZ = 0;

  function update(dt, time, groundSpeed, camera) {
    skyUniforms.uTime.value = time;
    grassUniforms.uTime.value = time;

    // Advance infinite meadow treadmill seamlessly matched to exact horse hoof speed!
    scrollZ += groundSpeed * dt;
    grassUniforms.uScrollZ.value = scrollZ;

    // Ground texture UV matches world repeat (diameter 156m / 22 repeats = 7.09m per tile)
    groundTex.offset.y = -(scrollZ / 7.0909) % 1.0;

    // Wrap wooden paddock fence posts seamlessly!
    const halfFence = fenceTotalLen * 0.5;
    for (const seg of fenceSegments) {
      let z = ((seg.userData.baseZ - scrollZ + halfFence) % fenceTotalLen + fenceTotalLen) % fenceTotalLen - halfFence;
      seg.position.z = z;
    }

    // Update hoof dust particles
    for (const p of dustPool) {
      if (p.life <= 0) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.life = 0;
        p.mesh.visible = false;
        continue;
      }
      const u = p.life / p.maxLife;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 0.45 * dt;
      p.vel.multiplyScalar(Math.pow(0.28, dt));
      const sc = p.scale0 + (p.scale1 - p.scale0) * Math.sqrt(u);
      p.mesh.scale.set(sc, sc, 1);
      p.mesh.material.opacity = Math.sin(u * Math.PI) * (1.0 - u * 0.35) * 0.65;
      p.mesh.quaternion.copy(camera.quaternion);
      p.mesh.rotateZ(p.rotZ + u * 0.4);
    }
  }

  return {
    applyLightingPreset,
    spawnHoofDust,
    update,
  };
}
