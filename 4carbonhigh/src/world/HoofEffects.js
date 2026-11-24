import * as THREE from 'three';

/**
 * Lightweight instanced dust/turf particle puffs & fading crescent hoofprints
 * emitted whenever a hoof strikes the meadow ground.
 */
export class HoofEffects {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;

    // 1. Soft Volumetric Dust Puff Billboard Pool (feathered radial alpha, never looks like solid spheres!)
    this.maxParticles = 140;
    this.particles = [];

    const puffGeo = new THREE.PlaneGeometry(0.18, 0.18);
    const puffMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // Cylindrical/spherical billboard facing camera while respecting instance position & scale
          vec4 mvCenter = viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float scaleX = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
          float scaleY = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
          mvCenter.xy += position.xy * vec2(scaleX, scaleY);
          gl_Position = projectionMatrix * mvCenter;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r2 = dot(p, p);
          if (r2 > 1.0) discard;
          float soft = pow(1.0 - r2, 2.2);
          gl_FragColor = vec4(vec3(0.78, 0.70, 0.58), soft * 0.26);
        }
      `,
    });
    this.puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, this.maxParticles);
    this.puffMesh.frustumCulled = false;
    this.scene.add(this.puffMesh);

    this._dummy = new THREE.Object3D();
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        life: 1,
        size: 1,
      });
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.puffMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.nextParticle = 0;

    // 2. Crescent Hoofprint Decals on Ground (for Roam / Circle modes)
    this.maxPrints = 64;
    this.prints = [];
    const printGeo = new THREE.RingGeometry(0.036, 0.058, 16, 1, -Math.PI * 0.25, Math.PI * 1.5);
    printGeo.rotateX(-Math.PI / 2);
    printGeo.rotateY(Math.PI * 0.5);
    const printMat = new THREE.MeshBasicMaterial({
      color: 0x261d14,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.printMesh = new THREE.InstancedMesh(printGeo, printMat, this.maxPrints);
    this.printMesh.frustumCulled = false;
    this.scene.add(this.printMesh);

    for (let i = 0; i < this.maxPrints; i++) {
      this.prints.push({ active: false, pos: new THREE.Vector3(), yaw: 0, age: 0 });
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.printMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.nextPrint = 0;
  }

  emitHoofStrike(worldPos, headingYaw, intensity, leavePrint = false) {
    if (!this.enabled) return;

    const numPuffs = Math.floor(2 + intensity * 5);
    for (let k = 0; k < numPuffs; k++) {
      const p = this.particles[this.nextParticle];
      this.nextParticle = (this.nextParticle + 1) % this.maxParticles;

      const ang = Math.random() * Math.PI * 2;
      const spd = (0.25 + Math.random() * 0.65) * intensity;
      p.active = true;
      p.pos.set(
        worldPos.x + Math.cos(ang) * 0.04,
        0.025 + Math.random() * 0.02,
        worldPos.z + Math.sin(ang) * 0.04
      );
      p.vel.set(
        Math.cos(ang) * spd - Math.sin(headingYaw) * intensity * 0.5,
        0.28 + Math.random() * 0.45 * intensity,
        Math.sin(ang) * spd - Math.cos(headingYaw) * intensity * 0.5
      );
      p.age = 0;
      p.life = 0.45 + Math.random() * 0.45;
      p.size = 0.55 + intensity * 0.95;
    }

    if (leavePrint) {
      const pr = this.prints[this.nextPrint];
      this.nextPrint = (this.nextPrint + 1) % this.maxPrints;
      pr.active = true;
      pr.pos.set(worldPos.x, 0.004, worldPos.z);
      pr.yaw = headingYaw;
      pr.age = 0;
    }
  }

  update(dt) {
    let dirtyPuffs = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirtyPuffs = true;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        this._dummy.scale.set(0, 0, 0);
      } else {
        const u = p.age / p.life;
        p.pos.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(1.0 - dt * 2.8);
        p.vel.y -= 0.45 * dt;
        const s = p.size * Math.sin(Math.pow(u, 0.6) * Math.PI) * (1.0 + u * 1.4);
        this._dummy.position.copy(p.pos);
        this._dummy.rotation.set(0, 0, 0);
        this._dummy.scale.set(s, s * 0.72, s);
      }
      this._dummy.updateMatrix();
      this.puffMesh.setMatrixAt(i, this._dummy.matrix);
    }
    if (dirtyPuffs) this.puffMesh.instanceMatrix.needsUpdate = true;

    let dirtyPrints = false;
    for (let i = 0; i < this.maxPrints; i++) {
      const pr = this.prints[i];
      if (!pr.active) continue;
      dirtyPrints = true;
      pr.age += dt;
      if (pr.age > 14.0) {
        pr.active = false;
        this._dummy.scale.set(0, 0, 0);
      } else {
        const fade = 1.0 - THREE.MathUtils.smoothstep(pr.age, 9.0, 14.0);
        this._dummy.position.copy(pr.pos);
        this._dummy.rotation.set(0, pr.yaw, 0);
        this._dummy.scale.setScalar(fade);
      }
      this._dummy.updateMatrix();
      this.printMesh.setMatrixAt(i, this._dummy.matrix);
    }
    if (dirtyPrints) this.printMesh.instanceMatrix.needsUpdate = true;
  }
}
