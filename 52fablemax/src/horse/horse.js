// The horse: skinned body, rig, hooves, eyes and ears (hair is added by hair.js).
import * as THREE from 'three';
import { buildBodyGeometry } from './build.js';
import { Rig } from './rig.js';
import { BONE_INDEX, HEAD_ANGLE, J, headPoint } from './skeleton.js';
import { createEarGeometry, createEyeGeometry, createHoofGeometry, createLidGeometry } from './parts.js';
import { createCoatMaterial, createEarMaterial, createEyeMaterial, createHoofMaterial, createLidMaterial } from './coat.js';
import { Locomotion } from './locomotion.js';

const FACE = new THREE.Vector3(Math.cos(HEAD_ANGLE), -Math.sin(HEAD_ANGLE), 0); // along the nose
const BROW = new THREE.Vector3(Math.sin(HEAD_ANGLE), Math.cos(HEAD_ANGLE), 0);  // out of the forehead

const LID_OPEN = -0.36;
const LID_SHUT = 0.78;

export class Horse {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'horse';
    this.rig = new Rig();
    this.stats = null;
    this.blink = 0;          // 0 open .. 1 shut
    this.ears = { R: null, L: null };
    this.earPose = { R: { tilt: 0, swivel: 0, splay: 0 }, L: { tilt: 0, swivel: 0, splay: 0 } };
    this.breath = 0;         // rib expansion, 0..1
    // head carriage offsets added on top of the gait (radians)
    this.look = { yaw: 0, pitch: 0, headYaw: 0, headPitch: 0, tilt: 0 };
    this.lookTarget = null;  // world point she is interested in, or null
    this.attention = 0;      // 0..1 how much she turns to look at it
    this.tailSwish = 0;
    this.grazing = false;    // head down in the grass
    this.graze = 0;          // eased 0..1
    this.effort = 0;         // recent exertion, drives breathing
    this.locomotion = new Locomotion(this);
    this._life = { time: 0, blinkAt: 2, blinkT: -1, flickAt: 3, flick: null, swishAt: 4, swishT: -1, breathPhase: 0, yaw: 0, pitch: 0 };
  }

  async build(quality, onProgress) {
    const body = await buildBodyGeometry(quality, onProgress);
    this.stats = body.stats;
    this.sculpt = body.groups;

    for (const bone of this.rig.bones) this.root.add(bone);
    const mesh = new THREE.SkinnedMesh(body.geometry, createCoatMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.root.add(mesh);
    mesh.bind(this.rig.skeleton, new THREE.Matrix4());
    this.body = mesh;

    this._addHooves();
    this._addEyes();
    this._addEars();
    this.pose();
    return this;
  }

  bone(name) {
    return this.rig.bones[BONE_INDEX[name]];
  }

  _addHooves() {
    const dark = createHoofMaterial(false);
    const light = createHoofMaterial(true);
    const fore = createHoofGeometry('fore');
    const hind = createHoofGeometry('hind');
    this.hooves = {};
    for (const [bone, geometry, material] of [
      ['hoofFR', fore, dark], ['hoofFL', fore, dark], ['hoofHR', hind, dark], ['hoofHL', hind, light],
    ]) {
      const hoof = new THREE.Mesh(geometry, material);
      hoof.castShadow = true;
      hoof.receiveShadow = true;
      this.bone(bone).add(hoof);
      this.hooves[bone] = hoof;
    }
  }

  _addEyes() {
    const eyeGeometry = createEyeGeometry();
    const lidGeometry = createLidGeometry();
    const eyeMaterial = createEyeMaterial();
    const lidMaterial = createLidMaterial();
    const head = this.bone('head');
    const headRest = new THREE.Vector3(...J.poll);
    this.lids = [];
    this.eyes = [];
    for (const sign of [1, -1]) {
      const centre = new THREE.Vector3(...headPoint(0.222, 0.016, 0.0865 * sign));
      // gaze: mostly sideways, a little forward and up
      const z = new THREE.Vector3(0, 0, sign).multiplyScalar(0.93).addScaledVector(FACE, 0.26).addScaledVector(BROW, 0.16).normalize();
      // long axis of the eye opening
      const ang = -HEAD_ANGLE + 12 * Math.PI / 180;
      const x = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0).multiplyScalar(sign);
      const y = new THREE.Vector3().crossVectors(z, x).normalize();
      x.crossVectors(y, z).normalize();
      const pivot = new THREE.Group();
      pivot.position.copy(centre).sub(headRest);
      pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      head.add(pivot);
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      pivot.add(eye);
      const lid = new THREE.Mesh(lidGeometry, lidMaterial);
      lid.rotation.x = LID_OPEN;
      pivot.add(lid);
      this.eyes.push(pivot);
      this.lids.push(lid);
    }
  }

  _addEars() {
    const geometry = createEarGeometry();
    const material = createEarMaterial();
    const head = this.bone('head');
    const headRest = new THREE.Vector3(...J.poll);
    for (const [key, sign] of [['R', 1], ['L', -1]]) {
      const base = new THREE.Vector3(...headPoint(0.0, 0.07, 0.062 * sign));
      // pricked: up out of the poll, leaning a little forward and outwards
      const y = new THREE.Vector3().addScaledVector(BROW, 0.9).addScaledVector(FACE, -0.5);
      y.z = 0.2 * sign;
      y.normalize();
      const open = new THREE.Vector3(0.74, -0.2, 0.62 * sign);
      const z = new THREE.Vector3().crossVectors(open, y).normalize();
      const x = new THREE.Vector3().crossVectors(y, z).normalize();
      const pivot = new THREE.Group();
      pivot.position.copy(base).sub(headRest);
      const rest = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      pivot.quaternion.copy(rest);
      head.add(pivot);
      const ear = new THREE.Mesh(geometry, material);
      ear.castShadow = true;
      if (sign < 0) ear.scale.z = -1; // mirror the shell for the left ear
      pivot.add(ear);
      this.ears[key] = { pivot, rest, sign };
    }
  }

  _poseExtras() {
    const lidAngle = LID_OPEN + (LID_SHUT - LID_OPEN) * this.blink;
    for (const lid of this.lids) lid.rotation.x = lidAngle;
    for (const key of ['R', 'L']) {
      const ear = this.ears[key];
      const p = this.earPose[key];
      // tilt: pin back (about the head's lateral axis); splay: fall outwards;
      // swivel: turn the opening about the ear's own axis
      _qa.setFromAxisAngle(_axisZ, p.tilt);
      _qb.setFromAxisAngle(_axisX, p.splay * ear.sign);
      _qc.setFromAxisAngle(_axisY, p.swivel * ear.sign);
      ear.pivot.quaternion.copy(_qa).multiply(_qb).multiply(ear.rest).multiply(_qc);
    }
    // breathing: the rib cage widens a touch
    const chest = this.bone('chest');
    chest.scale.set(1, 1 + 0.006 * this.breath, 1 + 0.022 * this.breath);
  }

  /** Solves the rig from its current inputs and pushes the pose to the bones. */
  pose() {
    this.rig.solveChain();
    this.rig.solveLegs();
    this.rig.apply();
    this._poseExtras();
  }

  update(dt) {
    this._behave(dt);
    this.locomotion.update(dt);
    this.rig.apply();
    this._poseExtras();
  }

  /** The small involuntary things: blinking, ears, tail, breath, glances. */
  _behave(dt) {
    const L = this._life;
    const loco = this.locomotion;
    L.time += dt;
    const t = L.time;

    // blink
    if (L.blinkT < 0 && t > L.blinkAt) L.blinkT = 0;
    if (L.blinkT >= 0) {
      L.blinkT += dt / 0.24;
      this.blink = Math.sin(Math.PI * Math.min(1, L.blinkT)) ** 0.7;
      if (L.blinkT >= 1) {
        L.blinkT = -1;
        this.blink = 0;
        L.blinkAt = t + 2.2 + Math.random() * 4.5;
      }
    }

    // breathing follows how hard she has been working
    this.effort += (Math.min(1, loco.speed / 9) - this.effort) * (1 - Math.exp(-dt * (loco.speed > 2 ? 0.5 : 0.12)));
    L.breathPhase += dt * (0.24 + 1.1 * this.effort) * Math.PI * 2;
    this.breath = (0.5 + 0.5 * Math.sin(L.breathPhase)) * (0.45 + 0.55 * this.effort);

    // grazing ends as soon as she is asked to move
    if (loco.wantSpeed > 0 || loco.goal || loco.rear.active) this.grazing = false;
    this.graze += ((this.grazing ? 1 : 0) - this.graze) * (1 - Math.exp(-dt * (this.grazing ? 1.6 : 3.5)));

    // turn the head towards whatever has her attention
    let yaw = 0, pitch = 0;
    const calm = 1 - Math.min(1, loco.speed / 4);
    const w = this.attention * calm * (loco.rear.active ? 0 : 1) * (1 - this.graze);
    if (this.lookTarget && w > 0.01) {
      const head = this.rig.pos[BONE_INDEX.head];
      loco.toModel(this.lookTarget, _look);
      const dx = _look.x - head.x, dy = this.lookTarget.y - (head.y - 0.1), dz = _look.z - head.z;
      yaw = Math.max(-1.25, Math.min(1.25, Math.atan2(-dz, dx))) * w;
      pitch = Math.max(-0.5, Math.min(0.3, Math.atan2(dy, Math.hypot(dx, dz)) * 0.6)) * w;
    }
    // idle wandering of the gaze
    yaw += 0.07 * Math.sin(t * 0.31) * Math.sin(t * 0.17 + 1) * calm;
    pitch += 0.03 * Math.sin(t * 0.23 + 2) * calm;
    const k = 1 - Math.exp(-dt * 3.2);
    L.yaw += (yaw - L.yaw) * k;
    L.pitch += (pitch - L.pitch) * k;
    this.look.yaw = L.yaw * 0.85;
    this.look.headYaw = L.yaw * 0.28;
    this.look.pitch = L.pitch;
    this.look.headPitch = -L.pitch * 0.25;
    this.look.tilt = L.yaw * 0.08;

    // ears: pricked when attentive, laid back at speed, with stray flicks
    if (!L.flick && t > L.flickAt) {
      L.flick = { ear: Math.random() < 0.5 ? 'R' : 'L', t: 0, len: 0.35 + Math.random() * 0.6, swivel: (Math.random() - 0.3) * 1.6, tilt: Math.random() * 0.5 };
    }
    const back = loco.p.ears * loco.move;
    for (const key of ['R', 'L']) {
      const pose = this.earPose[key];
      let tilt = 0.12 + 0.9 * back - 0.14 * w;
      let swivel = 0.2 * (1 - w) + 1.1 * back;
      let splay = 0.1 * (1 - w) + 0.2 * back;
      if (L.flick && L.flick.ear === key) {
        const f = Math.sin(Math.PI * Math.min(1, L.flick.t / L.flick.len));
        swivel += L.flick.swivel * f;
        tilt += L.flick.tilt * f;
      }
      const ke = 1 - Math.exp(-dt * 14);
      pose.tilt += (tilt - pose.tilt) * ke;
      pose.swivel += (swivel - pose.swivel) * ke;
      pose.splay += (splay - pose.splay) * ke;
    }
    if (L.flick) {
      L.flick.t += dt;
      if (L.flick.t >= L.flick.len) {
        L.flick = null;
        L.flickAt = t + 0.8 + Math.random() * 4;
      }
    }

    // tail: a lazy sway, now and then a proper swish
    if (L.swishT < 0 && t > L.swishAt) { L.swishT = 0; L.swishDir = Math.random() < 0.5 ? 1 : -1; }
    let swish = 0.05 * Math.sin(t * 1.3);
    if (L.swishT >= 0) {
      L.swishT += dt / 1.1;
      swish += L.swishDir * 0.55 * Math.sin(L.swishT * Math.PI * 3) * (1 - L.swishT) * calm;
      if (L.swishT >= 1) { L.swishT = -1; L.swishAt = t + 2.5 + Math.random() * 6; }
    }
    this.tailSwish = swish;
  }
}

const _look = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);
