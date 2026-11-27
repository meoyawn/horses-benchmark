// Tail physics: a chain of point masses that hangs from the dock, lags behind
// the body, streams back with speed and can swish. The tail bones (and the hair
// skinned to them) are then aimed along the chain.
import * as THREE from 'three';

const GRAVITY = -9.81, AIR_DRAG = 1.6;
const AZ = new THREE.Vector3(0, 0, 1), AY = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
const qPelvis = new THREE.Quaternion(), qCarry = new THREE.Quaternion(), qSwish = new THREE.Quaternion();
const qParent = new THREE.Quaternion(), qArc = new THREE.Quaternion(), qInv = new THREE.Quaternion();
const mInv = new THREE.Matrix4();

export class TailSim {
  constructor(horse) {
    const names = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6', 'tail7'];
    this.pelvis = horse.bones.pelvis;
    this.bones = names.map((n) => horse.bones[n]);
    const J = names.map((n) => horse.rest[n].clone());
    const tip = horse.hair.tailJoints[names.length];
    J.push(new THREE.Vector3(tip[0], tip[1], 0));
    this.local = J.map((p) => p.clone().sub(horse.rest.pelvis)); // rest joints in the pelvis frame
    this.len = J.slice(1).map((p, i) => p.distanceTo(J[i]));
    this.dir = J.slice(1).map((p, i) => p.clone().sub(J[i]).normalize());
    this.pos = J.map((p) => p.clone());
    this.prev = J.map((p) => p.clone());
    this.target = J.map((p) => p.clone());
    this.base = new THREE.Vector3();
    // How strongly each joint is held to the carried shape (1/s): the dock is
    // muscular, the long hair below it swings freely.
    this.stiff = [0, 160, 70, 16, 4, 1.4, 0.7, 0.4];
    this.ready = false;
  }

  _lengths() {
    const P = this.pos;
    for (let i = 1; i < P.length; i++) {
      v.copy(P[i]).sub(P[i - 1]);
      P[i].copy(P[i - 1]).addScaledVector(v, this.len[i - 1] / (v.length() || 1e-6));
    }
  }

  /** lift: how high the dock is carried (rad); swish: sideways swing (rad). Needs fresh world matrices. */
  update(dt, lift, swish) {
    const P = this.pos, Q = this.prev, T = this.target, n = P.length;
    const pm = this.pelvis.matrixWorld;
    this.pelvis.getWorldQuaternion(qPelvis);
    qCarry.setFromAxisAngle(AZ, -lift).premultiply(qSwish.setFromAxisAngle(AY, swish));
    for (let i = 0; i < n; i++) {
      v.copy(this.local[i]).sub(this.local[0]).applyQuaternion(qCarry).add(this.local[0]);
      T[i].copy(v).applyMatrix4(pm);
    }
    if (!this.ready || dt > 0.2) {
      for (let i = 0; i < n; i++) Q[i].copy(P[i].copy(T[i]));
      this.base.copy(T[0]);
      this.ready = true;
    }
    const steps = Math.max(1, Math.min(8, Math.ceil(dt / 0.006))), h = dt / steps;
    const keep = Math.exp(-AIR_DRAG * h);
    mInv.copy(pm).invert();
    for (let s = 1; s <= steps; s++) {
      P[0].lerpVectors(this.base, T[0], s / steps);
      for (let i = 1; i < n; i++) {
        v.copy(P[i]).sub(Q[i]).multiplyScalar(keep);
        Q[i].copy(P[i]);
        P[i].add(v);
        P[i].y += GRAVITY * h * h;
        P[i].lerp(T[i], 1 - Math.exp(-this.stiff[i] * h));
      }
      this._lengths();
      // Keep the hair behind the hindquarters and above the ground.
      for (let i = 2; i < n; i++) {
        v.copy(P[i]).applyMatrix4(mInv);
        const limit = -0.5 + Math.max(0, -0.06 - v.y) * 0.28;
        if (v.x > limit && Math.abs(v.z) < 0.34) {
          v.x = limit;
          P[i].copy(v).applyMatrix4(pm);
        }
        if (P[i].y < 0.04) P[i].y = 0.04;
      }
      this._lengths();
    }
    this.base.copy(T[0]);

    // Aim every bone along its chain segment, with as little twist as possible.
    qParent.copy(qPelvis);
    for (let i = 0; i < this.bones.length; i++) {
      a.copy(this.dir[i]).applyQuaternion(qParent);
      b.copy(P[i + 1]).sub(P[i]).normalize();
      qArc.setFromUnitVectors(a, b);
      qInv.copy(qParent).invert();
      qParent.premultiply(qArc);
      this.bones[i].quaternion.copy(qInv).multiply(qParent);
    }
  }
}
