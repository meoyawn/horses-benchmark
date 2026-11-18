// Assembles the horse: skinned body (SDF mesh + ears), skeleton, eyes and coat material.
import * as THREE from 'three';
import { buildBody } from './build.js';
import { landmarks, HEAD, WARP } from './anatomy.js';
import { buildEar } from './ears.js';
import { createCoatMaterial } from './coat.js';
import { v3 } from './sdf.js';

// Main direction the coat hair flows in, per bone (rest pose).
const FLOW = {
  root: [-1, -0.3, 0], body: [-1, -0.35, 0], chest: [-0.8, -0.6, 0], loin: [-1, -0.3, 0], pelvis: [-0.8, -0.6, 0],
  neck0: [-0.35, -1, 0], neck1: [-0.3, -1, 0], neck2: [-0.25, -1, 0], neck3: [-0.2, -1, 0],
  head: [0.574, -0.819, 0],
  tail0: [-0.6, -1, 0], tail1: [-0.3, -1, 0], tail2: [-0.2, -1, 0], tail3: [-0.1, -1, 0], tail4: [0, -1, 0],
};
for (const n of ['R', 'L']) {
  Object.assign(FLOW, {
    ['scap' + n]: [-0.3, -1, 0], ['humerus' + n]: [-0.2, -1, 0], ['radius' + n]: [0, -1, 0], ['cannonF' + n]: [0, -1, 0],
    ['pasternF' + n]: [0.5, -1, 0], ['hoofF' + n]: [0.6, -1, 0],
    ['femur' + n]: [-0.4, -1, 0], ['tibia' + n]: [-0.2, -1, 0], ['cannonH' + n]: [0, -1, 0],
    ['pasternH' + n]: [0.5, -1, 0], ['hoofH' + n]: [0.6, -1, 0], ['ear' + n]: [0, 1, 0],
  });
}

export class Horse {
  constructor({ h = 0.009, log = () => {} } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'horse';
    const res = buildBody({ h, log });
    this.build = res;
    this._head = HEAD;
    this.landmarks = landmarks();
    this._makeSkeleton(res.bones);
    this._makeMesh(res);
    this._makeEyes();
  }

  _makeSkeleton(defs) {
    const bones = [];
    const byName = {};
    for (const d of defs) {
      const b = new THREE.Bone();
      b.name = d.name;
      const parent = d.parent ? byName[d.parent] : null;
      const pp = parent ? parent.userData.rest : [0, 0, 0];
      b.position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2]);
      b.userData.rest = d.pos.slice();
      if (parent) parent.add(b);
      bones.push(b);
      byName[d.name] = b;
    }
    // ear bones (children of the head) at the ear bases
    for (const e of this.landmarks.ears) {
      const b = new THREE.Bone();
      b.name = 'ear' + e.side;
      const hp = byName.head.userData.rest;
      b.position.set(e.base[0] - hp[0], e.base[1] - hp[1], e.base[2] - hp[2]);
      b.userData.rest = e.base.slice();
      byName.head.add(b);
      bones.push(b);
      byName[b.name] = b;
    }
    this.bones = bones;
    this.bone = byName;
    this.boneIndex = Object.fromEntries(bones.map((b, i) => [b.name, i]));
    for (const b of bones) {
      b.userData.restPos = b.position.clone();
      b.userData.restQuat = b.quaternion.clone();
    }
  }

  _makeMesh(res) {
    // --- merge body + ears into one skinned geometry
    const parts = [{
      positions: res.positions, normals: res.normals, indices: res.indices,
      skinIndex: res.skinIndex, skinWeight: res.skinWeight, tags: res.tags, ao: res.ao,
    }];
    for (const e of this.landmarks.ears) {
      const ear = buildEar(e, HEAD.S);
      const n = ear.positions.length / 3;
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      const bi = this.boneIndex['ear' + e.side];
      for (let i = 0; i < n; i++) { si[4 * i] = bi; sw[4 * i] = 1; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(ear.positions, 3));
      g.setIndex(ear.indices);
      g.computeVertexNormals();
      parts.push({
        positions: ear.positions, normals: g.attributes.normal.array, indices: ear.indices,
        skinIndex: si, skinWeight: sw, tags: ear.tags, ao: ear.ao,
      });
    }
    let nv = 0, ni = 0;
    for (const p of parts) { nv += p.positions.length / 3; ni += p.indices.length; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
    const T = new Float32Array(nv * 4), AO = new Float32Array(nv), TG = new Float32Array(nv * 4);
    const I = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const p of parts) {
      const n = p.positions.length / 3;
      P.set(p.positions, vo * 3); N.set(p.normals, vo * 3);
      SI.set(p.skinIndex, vo * 4); SW.set(p.skinWeight, vo * 4);
      AO.set(p.ao, vo); TG.set(p.tags, vo * 4);
      for (let i = 0; i < p.indices.length; i++) I[io + i] = p.indices[i] + vo;
      vo += n; io += p.indices.length;
    }
    // hair-flow tangents (for anisotropic coat highlights)
    const flowByIndex = this.bones.map((b) => v3.norm(FLOW[b.name] || [-1, -0.3, 0]));
    for (let v = 0; v < nv; v++) {
      let fx = 0, fy = 0, fz = 0;
      for (let j = 0; j < 4; j++) {
        const w = SW[4 * v + j];
        if (w <= 0) continue;
        const f = flowByIndex[SI[4 * v + j]];
        fx += f[0] * w; fy += f[1] * w; fz += f[2] * w;
      }
      // hooves: growth lines run down the wall
      const hoof = TG[4 * v];
      fx = fx * (1 - hoof); fy = fy * (1 - hoof) - hoof; fz = fz * (1 - hoof);
      const nx = N[3 * v], ny = N[3 * v + 1], nz = N[3 * v + 2];
      const d = fx * nx + fy * ny + fz * nz;
      fx -= d * nx; fy -= d * ny; fz -= d * nz;
      let l = Math.hypot(fx, fy, fz);
      if (l < 1e-4) { // flow parallel to the normal: pick any tangent
        fx = -ny; fy = nx; fz = 0; l = Math.hypot(fx, fy) || 1;
      }
      T[4 * v] = fx / l; T[4 * v + 1] = fy / l; T[4 * v + 2] = fz / l; T[4 * v + 3] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('tangent', new THREE.BufferAttribute(T, 4));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    g.setAttribute('aAO', new THREE.BufferAttribute(AO, 1));
    g.setAttribute('aTag', new THREE.BufferAttribute(TG, 4));
    g.setIndex(new THREE.BufferAttribute(I, 1));
    g.computeBoundingSphere();
    this.geometry = g;

    this.material = createCoatMaterial({ head: HEAD, warp: WARP, hooves: this.landmarks.hooves });
    const mesh = new THREE.SkinnedMesh(g, this.material);
    mesh.name = 'horseBody';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.add(this.bones[0]);
    this.skeleton = new THREE.Skeleton(this.bones);
    mesh.bind(this.skeleton);
    this.mesh = mesh;
    this.group.add(mesh);
  }

  _makeEyes() {
    this.eyes = [];
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0x1b0f08, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.06, ior: 1.376,
      envMapIntensity: 0.45, specularIntensity: 0.3,
    });
    eyeMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEyeLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeLocal = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEyeLocal;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 d = normalize(vEyeLocal);
            // local +Z looks out of the eye, +Y is up
            float ang = acos(clamp(d.z, -1.0, 1.0));
            vec2 q = d.xy / max(1e-3, length(d.xy)) * ang;
            float pupil = length(q / vec2(0.36, 0.16));
            float iris = smoothstep(0.75, 0.55, ang);
            vec3 irisCol = mix(vec3(0.03, 0.016, 0.008), vec3(0.075, 0.04, 0.018), 0.5 + 0.5 * sin(atan(q.y, q.x) * 23.0) * 0.6);
            irisCol *= 0.7 + 0.3 * smoothstep(0.2, 0.7, ang);
            vec3 col = mix(vec3(0.05, 0.035, 0.03), irisCol, iris);
            col = mix(vec3(0.004), col, smoothstep(0.92, 1.08, pupil));
            // corpora nigra: dark lumps over the pupil
            float cn = smoothstep(0.09, 0.04, length((q - vec2(0.0, 0.15)) / vec2(2.2, 1.0)));
            col = mix(col, vec3(0.02, 0.012, 0.008), cn);
            diffuseColor.rgb = col;
          }`);
    };
    for (const e of this.landmarks.eyes) {
      const geo = new THREE.SphereGeometry(e.r, 40, 24);
      const m = new THREE.Mesh(geo, eyeMat);
      m.name = 'eye' + e.side;
      m.castShadow = false;
      const head = this.bone.head;
      const hp = head.userData.rest;
      m.position.set(e.c[0] - hp[0], e.c[1] - hp[1], e.c[2] - hp[2]);
      // orient local +Z along the look direction, +Y roughly up
      const z = new THREE.Vector3(...e.look).normalize();
      const x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), z).normalize();
      const y = new THREE.Vector3().crossVectors(z, x);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      m.userData.restQuat = m.quaternion.clone();
      head.add(m);
      this.eyes.push(m);
      // upper eyelid: a thin spherical cap that rolls down over the eyeball to blink
      const lidGeo = new THREE.SphereGeometry(e.r + 0.0026, 28, 14, Math.PI / 2 - 1.35, 2.7, 0, (98 * Math.PI) / 180);
      const lid = new THREE.Mesh(lidGeo, this.lidMaterial || (this.lidMaterial = new THREE.MeshStandardMaterial({ color: 0x2a201c, roughness: 0.62 })));
      lid.position.copy(m.position);
      lid.quaternion.copy(m.quaternion);
      lid.userData.baseQuat = m.quaternion.clone();
      lid.castShadow = false;
      head.add(lid);
      (this.lids || (this.lids = [])).push(lid);
    }
    this.blink = { t: 0, next: 2 + Math.random() * 3, dur: 0.2, amount: 0, sleepy: 0 };
    this.eyeLook = new THREE.Vector2();
    this.eyeTarget = new THREE.Vector2();
    this.saccadeT = 1;
  }

  // blinking and little eye movements
  updateFace(dt, { sleepy = 0 } = {}) {
    const b = this.blink;
    b.next -= dt;
    if (b.next <= 0 && b.t <= 0) { b.t = b.dur = 0.16 + Math.random() * 0.1; b.next = 1.5 + Math.random() * 5.5; if (Math.random() < 0.15) b.next = 0.25; }
    let close = 0;
    if (b.t > 0) {
      b.t -= dt;
      const ph = 1 - Math.max(0, b.t) / b.dur; // 0..1
      close = ph < 0.35 ? ph / 0.35 : 1 - (ph - 0.35) / 0.65;
    }
    b.sleepy += (sleepy - b.sleepy) * Math.min(1, dt * 1.5);
    const amount = Math.max(close, b.sleepy * 0.55);
    // open: edge tucked under the brow; closed: edge at the lower lid
    const ang = -0.95 + amount * 1.3;
    for (const lid of this.lids) {
      lid.quaternion.copy(lid.userData.baseQuat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang));
    }
    // saccades
    this.saccadeT -= dt;
    if (this.saccadeT <= 0) {
      this.saccadeT = 0.6 + Math.random() * 2.5;
      this.eyeTarget.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.12);
    }
    this.eyeLook.lerp(this.eyeTarget, Math.min(1, dt * 18));
    for (const eye of this.eyes) {
      eye.quaternion.copy(eye.userData.restQuat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.eyeLook.y, this.eyeLook.x, 0)));
    }
  }

  setLidColor(c) { this.lidMaterial?.color.set(c); }

  resetPose() {
    for (const b of this.bones) {
      b.position.copy(b.userData.restPos);
      b.quaternion.copy(b.userData.restQuat);
    }
  }
}
