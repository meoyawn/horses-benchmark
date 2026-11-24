import * as THREE from 'three';

/**
 * Procedural Sky, HDR-like PMREM Image-Based Lighting, Pasture Terrain,
 * Wind-Swaying Instanced Grass, Split-Rail Paddock Fence, and Studio Cyclorama.
 * 100% procedural — zero external textures or HDRI files.
 */

export const ENV_PRESETS = {
  goldenHour: {
    name: 'Golden Hour',
    isStudio: false,
    sunElevation: 17, // degrees
    sunAzimuth: 48,
    sunColor: 0xffd29a,
    sunIntensity: 3.4,
    hemiSky: 0x8bb8e8,
    hemiGround: 0x5c4b32,
    hemiIntensity: 0.95,
    rimColor: 0xffb36b,
    rimIntensity: 1.15,
    skyTop: new THREE.Color(0x28558c),
    skyHorizon: new THREE.Color(0xf2b57c),
    groundBounce: new THREE.Color(0x46522c),
    fogColor: new THREE.Color(0xdcb48c),
    fogDensity: 0.0065,
  },
  highNoon: {
    name: 'Sunlit Meadow',
    isStudio: false,
    sunElevation: 54,
    sunAzimuth: 35,
    sunColor: 0xfff6e8,
    sunIntensity: 3.6,
    hemiSky: 0x9ad0ff,
    hemiGround: 0x546338,
    hemiIntensity: 1.1,
    rimColor: 0xcce6ff,
    rimIntensity: 0.65,
    skyTop: new THREE.Color(0x2b6cb8),
    skyHorizon: new THREE.Color(0xbcdcf5),
    groundBounce: new THREE.Color(0x4f6333),
    fogColor: new THREE.Color(0xc4dff4),
    fogDensity: 0.0042,
  },
  studio: {
    name: 'Sculpt Studio',
    isStudio: true,
    sunElevation: 42,
    sunAzimuth: 42,
    sunColor: 0xfff7ee,
    sunIntensity: 3.1,
    hemiSky: 0xd0d6de,
    hemiGround: 0x2a2c32,
    hemiIntensity: 0.92,
    rimColor: 0xdde8f5,
    rimIntensity: 1.45, // Crisp neutral-silver edge rim light to accentuate musculature!
    skyTop: new THREE.Color(0x282b30),
    skyHorizon: new THREE.Color(0x42464d),
    groundBounce: new THREE.Color(0x1a1c20),
    fogColor: new THREE.Color(0x14171c),
    fogDensity: 0.014,
  },
};

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();
    this.currentEnvTarget = null;
    this.time = 0;

    this.meadowGroup = new THREE.Group();
    this.studioGroup = new THREE.Group();
    this.scene.add(this.meadowGroup);
    this.scene.add(this.studioGroup);

    this._setupLights();
    this._buildSkyDome();
    this._buildMeadowTerrain();
    this._buildInstancedGrass();
    this._buildPaddockFence();
    this._buildStudioCyclorama();

    this.applyPreset('goldenHour');
  }

  _setupLights() {
    // Primary Sun / Key Light with high-res tight PCFSoftShadowMap following the horse
    this.sunLight = new THREE.DirectionalLight(0xffd29a, 3.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1.0;
    this.sunLight.shadow.camera.far = 28.0;
    const d = 3.4;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.012;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Back/Rim Accent Light to illuminate mane & silhouette contours
    this.rimLight = new THREE.DirectionalLight(0xffb36b, 1.15);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    // Sky/Ground Hemisphere Fill
    this.hemiLight = new THREE.HemisphereLight(0x8bb8e8, 0x5c4b32, 0.95);
    this.scene.add(this.hemiLight);
  }

  _buildSkyDome() {
    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(0x28558c) },
      uHorizonColor: { value: new THREE.Color(0xf2b57c) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.3, -0.6).normalize() },
      uSunColor: { value: new THREE.Color(0xffe6bd) },
      uTime: { value: 0 },
    };

    const skyGeo = new THREE.SphereGeometry(180, 40, 24);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldDir;
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uTime;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
            mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x),
            f.y
          );
        }

        void main() {
          vec3 d = normalize(vWorldDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 sky = mix(uHorizonColor, uTopColor, pow(h, 0.52));

          // Mie atmospheric sun halo & crisp solar disc
          float sunDot = max(0.0, dot(d, normalize(uSunDir)));
          sky += uSunColor * pow(sunDot, 10.0) * 0.36;
          sky += uSunColor * pow(sunDot, 280.0) * 1.8;

          // Wispy high-altitude cirrus clouds
          if (d.y > 0.04) {
            vec2 uv = d.xz / (d.y + 0.18) * 1.6 + vec2(uTime * 0.006, 0.0);
            float c = noise2(uv) * 0.55 + noise2(uv * 2.3 + 4.1) * 0.30 + noise2(uv * 5.1) * 0.15;
            float cloudMask = smoothstep(0.56, 0.84, c) * smoothstep(0.04, 0.25, d.y);
            vec3 cloudCol = mix(vec3(0.96, 0.94, 0.92), uSunColor, 0.35);
            sky = mix(sky, cloudCol, cloudMask * 0.42);
          }

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });

    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.meadowGroup.add(this.skyDome);
  }

  _buildMeadowTerrain() {
    const geo = new THREE.PlaneGeometry(240, 240, 140, 140);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      // Perfectly flat paddock clearing for r <= 28m so horse hooves plant cleanly at y = 0.0!
      // Beyond r = 28m, rise into picturesque rolling pastoral hills
      if (r > 28.0) {
        const blend = THREE.MathUtils.smoothstep(r, 28.0, 62.0);
        const hill = (Math.sin(x * 0.045) * Math.cos(z * 0.042) * 5.5
                    + Math.sin(x * 0.09 + 1.3) * Math.sin(z * 0.08) * 2.4
                    + 2.6) * blend;
        pos.setY(i, hill);
      }
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
    });

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vGroundPos;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGroundPos = position;`);

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          varying vec3 vGroundPos;
          float gHash(vec2 p) {
            p = fract(p * vec2(234.34, 435.345));
            p += dot(p, p + 34.23);
            return fract(p.x * p.y);
          }
          float gNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(gHash(i), gHash(i + vec2(1,0)), f.x),
              mix(gHash(i + vec2(0,1)), gHash(i + vec2(1,1)), f.x),
              f.y
            );
          }
          `
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>
          {
            vec2 xz = vGroundPos.xz;
            float r = length(xz);
            float n1 = gNoise(xz * 0.35);
            float n2 = gNoise(xz * 2.4);
            float micro = gNoise(xz * 18.0);

            vec3 lushGrass = mix(vec3(0.18, 0.29, 0.10), vec3(0.29, 0.38, 0.14), n1);
            lushGrass = mix(lushGrass, vec3(0.22, 0.33, 0.11), n2 * 0.45);

            // Subtle worn sandy-loam equestrian ring & center study pad so hooves pop with crisp contrast!
            vec3 sandyLoam = mix(vec3(0.38, 0.31, 0.22), vec3(0.46, 0.38, 0.27), micro);
            float centerPad = 1.0 - smoothstep(1.6, 4.2, r + (n2 - 0.5) * 1.1);
            float trackRing = (1.0 - smoothstep(0.6, 2.2, abs(r - 13.5 + (n1 - 0.5) * 1.4)));
            float dirtMix = clamp(centerPad * 0.65 + trackRing * 0.55, 0.0, 0.72);

            vec3 col = mix(lushGrass, sandyLoam, dirtMix);
            col *= (0.90 + 0.18 * micro);
            diffuseColor.rgb *= col;
          }
          `
        );
    };

    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.terrainMesh.receiveShadow = true;
    this.meadowGroup.add(this.terrainMesh);
  }

  _buildInstancedGrass() {
    // Curved 4-segment tapered grass blade
    const segs = 4;
    const positions = [];
    const bladeV = [];
    const indices = [];

    for (let i = 0; i <= segs; i++) {
      const v = i / segs;
      const w = (1.0 - v * 0.88) * 0.016;
      const curveZ = v * v * 0.055;
      const y = v * 1.0; // Scaled per-instance!
      positions.push(-w, y, curveZ, w, y, curveZ);
      bladeV.push(v, v);
    }
    for (let i = 0; i < segs; i++) {
      const r0 = i * 2;
      const r1 = r0 + 2;
      indices.push(r0, r0 + 1, r1 + 1, r0, r1 + 1, r1);
    }

    const bladeGeo = new THREE.BufferGeometry();
    bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bladeGeo.setAttribute('aBladeV', new THREE.Float32BufferAttribute(bladeV, 1));
    bladeGeo.setIndex(indices);
    bladeGeo.computeVertexNormals();

    this.grassUniforms = {
      uTime: { value: 0 },
    };

    const grassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.68,
      side: THREE.DoubleSide,
    });

    grassMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.grassUniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>\nattribute float aBladeV;\nvarying float vBladeV;\nvarying float vHueVar;\nuniform float uTime;`
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `
          #include <begin_vertex>
          vBladeV = aBladeV;
          vec3 instPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          vHueVar = fract(sin(dot(instPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float breeze = sin(uTime * 2.1 + instPos.x * 0.45 + instPos.z * 0.35)
                       + 0.45 * cos(uTime * 3.7 + instPos.x * 0.9);
          transformed.x += breeze * 0.08 * aBladeV * aBladeV;
          transformed.z += breeze * 0.05 * aBladeV * aBladeV;
          `
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying float vBladeV;\nvarying float vHueVar;`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>
          {
            vec3 rootCol = vec3(0.13, 0.22, 0.07);
            vec3 tipCol = mix(vec3(0.32, 0.46, 0.15), vec3(0.48, 0.46, 0.19), vHueVar * 0.55);
            diffuseColor.rgb *= mix(rootCol, tipCol, smoothstep(0.0, 1.0, vBladeV));
          }
          `
        );
    };

    const count = 14000;
    const instMesh = new THREE.InstancedMesh(bladeGeo, grassMat, count);
    instMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    while (placed < count) {
      const radius = 2.4 + Math.pow(rand(), 0.72) * 26.0;
      const angle = rand() * Math.PI * 2.0;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Leave sandy-loam track around r=13.5 sparser so paddock track reads clearly
      if (Math.abs(radius - 13.5) < 1.1 && rand() < 0.72) continue;

      const h = (radius < 4.5 ? 0.06 + rand() * 0.08 : 0.12 + rand() * 0.18);
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, (rand() - 0.5) * 0.18);
      dummy.scale.set(0.9 + rand() * 0.5, h, 0.9 + rand() * 0.5);
      dummy.updateMatrix();
      instMesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    instMesh.instanceMatrix.needsUpdate = true;
    this.meadowGroup.add(instMesh);
  }

  _buildPaddockFence() {
    // Classic weathered wooden split-rail equestrian paddock fence at radius = 28.5m
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x6e553e,
      roughness: 0.88,
      metalness: 0.0,
    });

    const numPosts = 44;
    const fenceRadius = 28.5;
    const postGeo = new THREE.CylinderGeometry(0.075, 0.085, 1.38, 8);
    postGeo.translate(0, 0.69, 0);

    const segLen = (2.0 * Math.PI * fenceRadius) / numPosts;
    const railGeo = new THREE.BoxGeometry(segLen + 0.08, 0.085, 0.045);

    const postsMesh = new THREE.InstancedMesh(postGeo, woodMat, numPosts);
    const railsMesh = new THREE.InstancedMesh(railGeo, woodMat, numPosts * 3);
    postsMesh.castShadow = true;
    postsMesh.receiveShadow = true;
    railsMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    let railIdx = 0;
    for (let i = 0; i < numPosts; i++) {
      const a0 = (i / numPosts) * Math.PI * 2.0;
      const a1 = ((i + 1) / numPosts) * Math.PI * 2.0;
      const x0 = Math.cos(a0) * fenceRadius;
      const z0 = Math.sin(a0) * fenceRadius;
      const x1 = Math.cos(a1) * fenceRadius;
      const z1 = Math.sin(a1) * fenceRadius;

      dummy.position.set(x0, 0, z0);
      dummy.rotation.set(0, -a0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postsMesh.setMatrixAt(i, dummy.matrix);

      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const yaw = Math.atan2(x1 - x0, z1 - z0) + Math.PI * 0.5;

      for (const ry of [0.44, 0.82, 1.20]) {
        dummy.position.set(mx, ry, mz);
        dummy.rotation.set(0, yaw, 0);
        dummy.updateMatrix();
        railsMesh.setMatrixAt(railIdx++, dummy.matrix);
      }
    }

    this.meadowGroup.add(postsMesh);
    this.meadowGroup.add(railsMesh);
  }

  _buildStudioCyclorama() {
    const floorGeo = new THREE.CircleGeometry(45, 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1b1e24,
      roughness: 0.58,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    this.studioGroup.add(floor);

    // Subtle equestrian scale ring on studio floor
    const ringGeo = new THREE.RingGeometry(1.65, 1.675, 96);
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo.translate(0, 0.002, 0);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x454f60,
      transparent: true,
      opacity: 0.45,
    });
    this.studioGroup.add(new THREE.Mesh(ringGeo, ringMat));
  }

  _generateProceduralIBL(preset, sunDir) {
    // Render a procedural sky + sun + ground-bounce sphere into PMREM for rich PBR reflections!
    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(20, 32, 16);
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTop: { value: preset.skyTop },
        uHorizon: { value: preset.skyHorizon },
        uGround: { value: preset.groundBounce },
        uSunDir: { value: sunDir.clone() },
        uSunCol: { value: new THREE.Color(preset.sunColor).multiplyScalar(2.4) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uGround;
        uniform vec3 uSunDir;
        uniform vec3 uSunCol;
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = d.y >= 0.0
            ? mix(uHorizon, uTop, pow(d.y, 0.55))
            : mix(uHorizon * 0.75, uGround, pow(-d.y, 0.45));
          float s = max(0.0, dot(d, normalize(uSunDir)));
          col += uSunCol * pow(s, 64.0) * 2.5 + uSunCol * pow(s, 8.0) * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    envScene.add(new THREE.Mesh(envGeo, envMat));

    if (this.currentEnvTarget) {
      this.currentEnvTarget.dispose();
    }
    this.currentEnvTarget = this.pmremGenerator.fromScene(envScene, 0.02);
    this.scene.environment = this.currentEnvTarget.texture;
    envGeo.dispose();
    envMat.dispose();
  }

  applyPreset(presetKey) {
    const p = ENV_PRESETS[presetKey] || ENV_PRESETS.goldenHour;
    this.activePreset = p;

    this.meadowGroup.visible = !p.isStudio;
    this.studioGroup.visible = p.isStudio;

    this.scene.background = p.isStudio ? p.fogColor.clone() : null;
    this.scene.fog = new THREE.FogExp2(p.fogColor.getHex(), p.fogDensity);

    const elevRad = THREE.MathUtils.degToRad(p.sunElevation);
    const azimRad = THREE.MathUtils.degToRad(p.sunAzimuth);
    this.sunDir = new THREE.Vector3(
      Math.cos(elevRad) * Math.sin(azimRad),
      Math.sin(elevRad),
      Math.cos(elevRad) * Math.cos(azimRad)
    ).normalize();

    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;

    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;

    this.rimLight.color.setHex(p.rimColor);
    this.rimLight.intensity = p.rimIntensity;

    this.skyUniforms.uTopColor.value.copy(p.skyTop);
    this.skyUniforms.uHorizonColor.value.copy(p.skyHorizon);
    this.skyUniforms.uSunDir.value.copy(this.sunDir);
    this.skyUniforms.uSunColor.value.setHex(p.sunColor);

    this._generateProceduralIBL(p, this.sunDir);
  }

  update(dt, horsePosition) {
    this.time += dt;
    this.skyUniforms.uTime.value = this.time;
    this.grassUniforms.uTime.value = this.time;

    // Keep shadow-casting key light centered tightly around the horse so shadows stay razor-crisp!
    this.sunLight.target.position.set(horsePosition.x, 0.9, horsePosition.z);
    this.sunLight.position.set(
      horsePosition.x + this.sunDir.x * 12.0,
      horsePosition.y + this.sunDir.y * 12.0 + 1.0,
      horsePosition.z + this.sunDir.z * 12.0
    );

    this.rimLight.target.position.set(horsePosition.x, 1.2, horsePosition.z);
    this.rimLight.position.set(
      horsePosition.x - this.sunDir.x * 9.0,
      horsePosition.y + 3.2,
      horsePosition.z - this.sunDir.z * 9.0
    );
  }
}
