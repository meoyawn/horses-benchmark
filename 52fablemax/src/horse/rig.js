// Animation rig: forward kinematics for the spine, neck and tail, and
// purpose-built inverse kinematics for the legs.
//
// All bones are stored flat in model space (see skeleton.js): a bone's
// transform is "translate to its joint, then rotate", which makes the bind
// pose a pure translation and keeps the maths readable.
import * as THREE from 'three';
import { BONES, BONE_INDEX } from './skeleton.js';

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

// Hoof geometry in the hoof bone's frame (origin at the coffin joint).
export const HOOF = {
  fore: { toe: [0.086, -0.065], heel: [-0.056, -0.065] },
  hind: { toe: [0.08, -0.068], heel: [-0.052, -0.068] },
};

class Leg {
  /**
   * @param rig   owning rig
   * @param kind  'F' (fore) or 'H' (hind)
   * @param sfx   'R' or 'L'
   */
  constructor(rig, kind, sfx) {
    this.rig = rig;
    this.kind = kind;
    this.sfx = sfx;
    this.sign = sfx === 'R' ? 1 : -1;
    const names = kind === 'F'
      ? ['scapula', 'humerus', 'radius', 'cannonF', 'pasternF', 'hoofF']
      : ['femur', 'tibia', 'cannonH', 'pasternH', 'hoofH'];
    this.ids = names.map((n) => BONE_INDEX[n + sfx]);
    this.parent = BONE_INDEX[kind === 'F' ? 'chest' : 'pelvis'];
    const rest = this.ids.map((i) => rig.rest[i]);
    this.restJoints = rest;
    const n = rest.length;
    this.pasternId = this.ids[n - 2];
    this.hoofId = this.ids[n - 1];
    this.top = rest[0];
    this.fetlockRest = rest[n - 2];
    this.coffinRest = rest[n - 1];
    this.pasternVec = new THREE.Vector3().subVectors(this.coffinRest, this.fetlockRest);
    this.hoof = kind === 'F' ? HOOF.fore : HOOF.hind;

    // planar (side view) rest geometry of the chain down to the fetlock
    this.seg = [];
    for (let i = 0; i < n - 2; i++) {
      const dx = rest[i + 1].x - rest[i].x, dy = rest[i + 1].y - rest[i].y;
      this.seg.push({ len: Math.hypot(dx, dy), ang: Math.atan2(dy, dx), dz: rest[i + 1].z - rest[i].z });
    }
    const fx = this.fetlockRest.x - this.top.x, fy = this.fetlockRest.y - this.top.y;
    this.restFetlock2 = [fx, fy];
    this.restDz = this.fetlockRest.z - this.top.z;
    this.restGamma = Math.atan2(fx, -fy);

    if (kind === 'H') {
      const [a, b, c] = this.seg;
      this.turnStifle = wrap(b.ang - a.ang);
      this.turnHock = wrap(c.ang - b.ang);
      this.hockRatio = 1.0;
      // most extended configuration the reciprocal apparatus allows
      let best = 0, bestD = this._hindSpan(0, 0)[0];
      for (let q = 0; q > -0.9; q -= 0.01) {
        const d = this._hindSpan(q, 0)[0];
        if (d > bestD) { bestD = d; best = q; } else if (d < bestD - 1e-4) break;
      }
      this.flexMin = best;
      this.maxSpan = bestD;
    } else {
      this.turnKnee = wrap(this.seg[3].ang - this.seg[2].ang);
      this.scapulaGain = 0.36;
    }

    // inputs (model space)
    this.coffin = this.coffinRest.clone(); // where the hoof bone should be
    this.pitch = 0;        // hoof pitch, + = toe down / heel up
    this.yaw = 0;          // hoof yaw relative to the body
    this.pasternRot = 0;   // pastern rotation vs rest, + = fetlock sinks
    this.flex = 0;         // extra knee flexion (fore) or hock flexion (hind)
    this.scapula = 0;      // extra shoulder-blade swing (fore)
    // outputs
    this.reachGap = 0;     // > 0 when the target is out of reach
    this.flexion = 0;      // solved stifle/hock flexion (hind)
    this.fetlock = new THREE.Vector3();
  }

  /** Distance from hip to fetlock, and its direction angle, for a hind flexion q. */
  _hindSpan(q, extraHock) {
    const [a, b, c] = this.seg;
    const t1 = this.turnStifle - q;
    const t2 = t1 + this.turnHock + this.hockRatio * q + extraHock;
    const x = a.len + b.len * Math.cos(t1) + c.len * Math.cos(t2);
    const y = b.len * Math.sin(t1) + c.len * Math.sin(t2);
    return [Math.hypot(x, y), Math.atan2(y, x)];
  }

  /** Fetlock position (model space) implied by the hoof inputs. */
  _fetlockFromHoof(out) {
    _q1.setFromAxisAngle(AXIS_Y, this.yaw);
    _q2.setFromAxisAngle(AXIS_Z, this.pasternRot - 0.8 * this.pitch);
    _q1.multiply(_q2);
    out.copy(this.pasternVec).applyQuaternion(_q1);
    return out.subVectors(this.coffin, out);
  }

  /**
   * Places a planted hoof: the toe tip stays at `toe` (model space) and the
   * heel lifts just enough for the leg to reach, never less than `minPitch`.
   */
  plant(toe, minPitch, maxPitch = 1.35) {
    const reach = (pitch) => {
      this._setCoffinFromToe(toe, pitch);
      return this._gap();
    };
    let pitch = minPitch;
    const gap0 = reach(pitch);
    if (gap0 > 0) {
      // peeling the heel off only helps a leg that trails behind its top joint;
      // a leg reaching forward keeps its hoof flat
      const trailing = this._planarTarget(this._fetlockFromHoof(_v1))[0] < 0;
      if (trailing) {
        if (reach(maxPitch) > 0) {
          pitch = maxPitch;
        } else {
          let lo = minPitch, hi = maxPitch;
          for (let i = 0; i < 14; i++) {
            const mid = (lo + hi) / 2;
            if (reach(mid) > 0) lo = mid; else hi = mid;
          }
          pitch = hi;
        }
      }
      this._setCoffinFromToe(toe, pitch);
    }
    return pitch;
  }

  _setCoffinFromToe(toe, pitch) {
    this.pitch = pitch;
    const tx = -this.hoof.toe[0], ty = -this.hoof.toe[1];
    const c = Math.cos(-pitch), s = Math.sin(-pitch);
    const lx = tx * c - ty * s, ly = tx * s + ty * c;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    this.coffin.set(toe.x + lx * cy, toe.y + ly, toe.z - lx * sy);
  }

  /** How far (m) the current hoof inputs are beyond the leg's reach. */
  _gap() {
    const t = this._planarTarget(this._fetlockFromHoof(_v1));
    if (this.kind === 'H') return Math.hypot(t[0], t[1]) - this.maxSpan * 0.9985;
    const [ps, sh, ra, ca] = this.seg;
    const gamma = Math.atan2(t[0], -t[1]);
    const th = clamp(this.scapulaGain * (gamma - this.restGamma), -0.3, 0.3) + this.scapula;
    const sx = ps.len * Math.cos(ps.ang + th), sy = ps.len * Math.sin(ps.ang + th);
    const turn = this.turnKnee - this.flex;
    const l2 = Math.sqrt(ra.len * ra.len + ca.len * ca.len + 2 * ra.len * ca.len * Math.cos(turn));
    return Math.hypot(t[0] - sx, t[1] - sy) - (sh.len + l2) * 0.9985;
  }

  /** Expresses a model-space fetlock target in the leg's rest plane. */
  _planarTarget(fetlock) {
    const rig = this.rig;
    // into the parent's rest frame
    _q3.copy(rig.quat[this.parent]).invert();
    _v2.subVectors(fetlock, rig.pos[this.parent]).applyQuaternion(_q3).add(rig.rest[this.parent]);
    const dx = _v2.x - this.top.x, dy = _v2.y - this.top.y, dz = _v2.z - this.top.z;
    // swing the leg sideways about the top joint so the target lies in its plane
    const rho = Math.hypot(dy, dz);
    const z0 = clamp(this.restDz, -rho * 0.99, rho * 0.99);
    const yPlane = -Math.sqrt(rho * rho - z0 * z0);
    this._abduct = Math.atan2(dz, dy) - Math.atan2(z0, yPlane);
    return [dx, yPlane];
  }

  solve() {
    const rig = this.rig;
    const n = this.ids.length;
    const fet = this._fetlockFromHoof(this.fetlock);
    const t = this._planarTarget(fet);
    const abduct = wrap(this._abduct);
    const angles = this._angles || (this._angles = new Float64Array(4));
    let ex, ey; // achieved fetlock in the plane

    if (this.kind === 'F') {
      const [ps, sh, ra, ca] = this.seg;
      const gamma = Math.atan2(t[0], -t[1]);
      const th = clamp(this.scapulaGain * (gamma - this.restGamma), -0.3, 0.3) + this.scapula;
      const sx = ps.len * Math.cos(ps.ang + th), sy = ps.len * Math.sin(ps.ang + th);
      const turn = this.turnKnee - this.flex;
      const l2 = Math.sqrt(ra.len * ra.len + ca.len * ca.len + 2 * ra.len * ca.len * Math.cos(turn));
      const delta = Math.atan2(ca.len * Math.sin(turn), ra.len + ca.len * Math.cos(turn));
      let dx = t[0] - sx, dy = t[1] - sy;
      const want = Math.hypot(dx, dy);
      const d = clamp(want, Math.abs(sh.len - l2) + 1e-4, sh.len + l2 - 1e-4);
      this.reachGap = want - d;
      const dir = Math.atan2(dy, dx);
      const a = Math.acos(clamp((sh.len * sh.len + d * d - l2 * l2) / (2 * sh.len * d), -1, 1));
      const angH = dir - a;
      const ex0 = sx + sh.len * Math.cos(angH), ey0 = sy + sh.len * Math.sin(angH);
      ex = sx + d * Math.cos(dir);
      ey = sy + d * Math.sin(dir);
      const angR = Math.atan2(ey - ey0, ex - ex0) - delta;
      angles[0] = th;
      angles[1] = wrap(angH - sh.ang);
      angles[2] = wrap(angR - ra.ang);
      angles[3] = wrap(angR + turn - ca.ang);
    } else {
      const [a, b, c] = this.seg;
      const want = Math.hypot(t[0], t[1]);
      const dMax = this._hindSpan(this.flexMin, this.flex)[0];
      let q;
      if (want >= dMax) {
        q = this.flexMin;
      } else {
        let lo = this.flexMin, hi = 2.2;
        for (let i = 0; i < 22; i++) {
          const mid = (lo + hi) / 2;
          if (this._hindSpan(mid, this.flex)[0] > want) lo = mid; else hi = mid;
        }
        q = (lo + hi) / 2;
      }
      const [span, skew] = this._hindSpan(q, this.flex);
      this.reachGap = Math.max(0, want - span);
      this.flexion = q;
      const dir = Math.atan2(t[1], t[0]);
      const angA = dir - skew;
      const angB = angA + this.turnStifle - q;
      const angC = angB + this.turnHock + this.hockRatio * q + this.flex;
      ex = span * Math.cos(dir);
      ey = span * Math.sin(dir);
      angles[0] = wrap(angA - a.ang);
      angles[1] = wrap(angB - b.ang);
      angles[2] = wrap(angC - c.ang);
    }

    // write the upper chain: parent rotation * sideways swing * planar angle
    const qPar = rig.quat[this.parent];
    const pPar = rig.pos[this.parent];
    const restPar = rig.rest[this.parent];
    _q1.setFromAxisAngle(AXIS_X, abduct);
    let jx = 0, jy = 0, jz = 0;
    const count = this.seg.length;
    for (let i = 0; i < count; i++) {
      const id = this.ids[i];
      _q2.setFromAxisAngle(AXIS_Z, angles[i]);
      rig.quat[id].copy(qPar).multiply(_q1).multiply(_q2);
      _v1.set(jx, jy, jz).applyQuaternion(_q1).add(this.top).sub(restPar).applyQuaternion(qPar).add(pPar);
      rig.pos[id].copy(_v1);
      const s = this.seg[i];
      const ang = s.ang + angles[i];
      jx += s.len * Math.cos(ang);
      jy += s.len * Math.sin(ang);
      jz += s.dz;
    }
    // achieved fetlock, pastern and hoof
    _v1.set(jx, jy, jz).applyQuaternion(_q1).add(this.top).sub(restPar).applyQuaternion(qPar).add(pPar);
    this.fetlock.copy(_v1);
    _q1.setFromAxisAngle(AXIS_Y, this.yaw);
    _q2.setFromAxisAngle(AXIS_Z, this.pasternRot - 0.8 * this.pitch);
    rig.quat[this.pasternId].copy(_q1).multiply(_q2);
    rig.pos[this.pasternId].copy(this.fetlock);
    _v2.copy(this.pasternVec).applyQuaternion(rig.quat[this.pasternId]).add(this.fetlock);
    rig.pos[this.hoofId].copy(_v2);
    _q2.setFromAxisAngle(AXIS_Z, -this.pitch);
    rig.quat[this.hoofId].copy(_q1).multiply(_q2);
  }
}

export class Rig {
  constructor() {
    this.count = BONES.length;
    this.rest = BONES.map((b) => new THREE.Vector3(...b.pos));
    this.pos = BONES.map((b) => new THREE.Vector3(...b.pos));
    this.quat = BONES.map(() => new THREE.Quaternion());
    this.local = BONES.map(() => new THREE.Quaternion());
    this.bones = BONES.map((b) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      bone.position.set(...b.pos);
      return bone;
    });
    this.skeleton = new THREE.Skeleton(
      this.bones,
      BONES.map((b) => new THREE.Matrix4().makeTranslation(-b.pos[0], -b.pos[1], -b.pos[2])),
    );
    // whole-body transform applied about a pivot near the centre of mass
    this.bodyPivot = new THREE.Vector3(0.0, 1.15, 0);
    this.bodyOffset = new THREE.Vector3();
    this.bodyQuat = new THREE.Quaternion();
    this.chain = ['chest', 'loin', 'pelvis', 'neck1', 'neck2', 'neck3', 'neck4', 'head', 'tail1', 'tail2', 'tail3', 'tail4']
      .map((n) => BONE_INDEX[n]);
    this.legs = {
      FR: new Leg(this, 'F', 'R'),
      FL: new Leg(this, 'F', 'L'),
      HR: new Leg(this, 'H', 'R'),
      HL: new Leg(this, 'H', 'L'),
    };
    this.legList = [this.legs.HL, this.legs.FL, this.legs.HR, this.legs.FR];
  }

  /** Sets a chain bone's rotation relative to its parent from Euler angles (radians). */
  setLocal(name, rx, ry, rz) {
    const q = this.local[BONE_INDEX[name]];
    _q1.setFromAxisAngle(AXIS_Y, ry);
    _q2.setFromAxisAngle(AXIS_Z, rz);
    _q3.setFromAxisAngle(AXIS_X, rx);
    q.copy(_q1).multiply(_q2).multiply(_q3);
  }

  /** Forward kinematics for spine, neck, head and tail. */
  solveChain() {
    for (const id of this.chain) {
      const parent = BONES[id].parentIndex;
      if (parent < 0) {
        this.quat[id].copy(this.bodyQuat).multiply(this.local[id]);
        _v1.subVectors(this.rest[id], this.bodyPivot).applyQuaternion(this.bodyQuat);
        this.pos[id].copy(this.bodyPivot).add(this.bodyOffset).add(_v1);
      } else {
        this.quat[id].copy(this.quat[parent]).multiply(this.local[id]);
        _v1.subVectors(this.rest[id], this.rest[parent]).applyQuaternion(this.quat[parent]);
        this.pos[id].copy(this.pos[parent]).add(_v1);
      }
    }
  }

  solveLegs() {
    for (const leg of this.legList) leg.solve();
  }

  /** Copies the solved pose to the THREE bones. */
  apply() {
    for (let i = 0; i < this.count; i++) {
      this.bones[i].position.copy(this.pos[i]);
      this.bones[i].quaternion.copy(this.quat[i]);
    }
  }

  /** Model-space position of a point given in the rest pose, carried by a bone. */
  carry(boneName, restPoint, out) {
    const id = BONE_INDEX[boneName];
    return out.copy(restPoint).sub(this.rest[id]).applyQuaternion(this.quat[id]).add(this.pos[id]);
  }
}
