// Leg rig. Each leg is solved analytically in its own vertical plane, which may
// lean sideways a little so the hoof can land nearer the midline.
//   hind: femur and cannon stay parallel-coupled, like the real "reciprocal
//         apparatus" that makes stifle and hock flex together -> a 2-bone solve.
//   fore: the shoulder blade swings with the limb, the knee flex is given, and
//         upper arm + forearm are a 2-bone solve.
import * as THREE from 'three';

export const TOE = [0.085, -0.075]; // toe tip in the hoof frame (origin = coffin joint)
export const HEEL = [-0.045, -0.075];
export const HOOF_H = 0.075; // height of the coffin joint when the hoof is flat

const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const qTilt = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), qAbs = new THREE.Quaternion(), qInv = new THREE.Quaternion();

export const rot2 = (v, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
};
const ang = (v) => Math.atan2(v[1], v[0]);
const len = (v) => Math.hypot(v[0], v[1]);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

export class Leg {
  constructor(horse, side, front) {
    const names = front
      ? ['scapula', 'humerus', 'radius', 'cannonF', 'pasternF', 'hoofF']
      : ['femur', 'tibia', 'cannonH', 'pasternH', 'hoofH'];
    this.front = front;
    this.sign = side === 'R' ? 1 : -1;
    this.bones = names.map((n) => horse.bones[n + side]);
    this.parent = this.bones[0].parent;
    const P = names.map((n) => horse.rest[n + side]);
    this.seg = P.slice(1).map((p, i) => [p.x - P[i].x, p.y - P[i].y]); // rest bone vectors
    this.restHoof = P[P.length - 1];
    this.angles = names.map(() => 0); // absolute in-plane rotation of every bone
    this.tilt = 0;
    this.heel = 0;
    this.yaw = 0; // hoof heading relative to the body (a planted hoof must not twist on the ground)
    const s = this.seg;
    this.pastern = s[s.length - 1];
    if (front) {
      this.restAim = Math.atan2(s[0][1] + s[1][1] + s[2][1] + s[3][1], s[0][0] + s[1][0] + s[2][0] + s[3][0]);
    } else {
      this.A = [s[0][0] + s[2][0], s[0][1] + s[2][1]]; // femur + cannon, rigid as a pair
      const lA = len(this.A), lt = len(s[1]), a0 = Math.abs(wrap(ang(s[1]) - ang(this.A)));
      const reach = (flex) => Math.sqrt(lA * lA + lt * lt + 2 * lA * lt * Math.cos(a0 + flex));
      this.maxReach = reach(-0.6);
      this.minReach = reach(1.35);
    }
  }

  /**
   * Planar solve; (cx, cy) is the coffin joint relative to the top joint.
   * Returns how far the target is beyond reach (<= 0 when it can be reached).
   */
  _plane(cx, cy, pasternRot, hoofPitch, knee, scap) {
    const a = this.angles, s = this.seg;
    const p = rot2(this.pastern, pasternRot);
    const fx = cx - p[0], fy = cy - p[1]; // fetlock
    let over;
    if (this.front) {
      // The shoulder blade is carried by the trunk (scap = trunk pitch) and swings with the limb.
      const rho = scap + clamp(0.4 * wrap(Math.atan2(fy, fx) - this.restAim - scap), -0.3, 0.3);
      const P = rot2(s[0], rho); // point of shoulder
      const lower = rot2(s[3], -knee); // forearm + folded cannon = elbow -> fetlock
      lower[0] += s[2][0];
      lower[1] += s[2][1];
      const l1 = len(s[1]), l2 = len(lower);
      const dx = fx - P[0], dy = fy - P[1], dist = Math.hypot(dx, dy);
      const max = (l1 + l2) * 0.992, d = clamp(dist, Math.abs(l1 - l2) + 0.02, max);
      over = dist - max;
      const dir = Math.atan2(dy, dx);
      const eDir = dir - Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)); // elbow points back
      const ex = l1 * Math.cos(eDir), ey = l1 * Math.sin(eDir);
      a[0] = rho;
      a[1] = eDir - ang(s[1]);
      a[2] = Math.atan2(d * Math.sin(dir) - ey, d * Math.cos(dir) - ex) - ang(lower);
      a[3] = a[2] - knee;
      a[4] = pasternRot;
      a[5] = hoofPitch;
    } else {
      const A = this.A, lA = len(A), lt = len(s[1]);
      const dist = Math.hypot(fx, fy), d = clamp(dist, this.minReach, this.maxReach);
      over = dist - this.maxReach;
      const dir = Math.atan2(fy, fx);
      const aDir = dir + Math.acos(clamp((lA * lA + d * d - lt * lt) / (2 * lA * d), -1, 1)); // stifle points forward
      const kx = lA * Math.cos(aDir), ky = lA * Math.sin(aDir);
      a[0] = aDir - ang(A);
      a[1] = Math.atan2(d * Math.sin(dir) - ky, d * Math.cos(dir) - kx) - ang(s[1]);
      a[2] = a[0];
      a[3] = pasternRot;
      a[4] = hoofPitch;
    }
    return over;
  }

  /** Turns the planar angles into bone rotations. parentQ: orientation of the parent bone in horse space. */
  _apply(parentQ) {
    const n = this.bones.length;
    qTilt.setFromAxisAngle(AX, this.tilt);
    qInv.copy(parentQ).invert();
    for (let i = 0; i < n; i++) {
      qAbs.setFromAxisAngle(AZ, this.angles[i]);
      if (i < n - 1) qAbs.premultiply(qTilt);
      else qAbs.premultiply(qYaw.setFromAxisAngle(AY, this.yaw)); // the hoof stays level sideways
      this.bones[i].quaternion.copy(qInv).multiply(qAbs);
      qInv.copy(qAbs).invert();
    }
  }

  /** Free placement (swing): c = coffin joint target in horse space, base = top joint. */
  solve(base, parentQ, c, pasternRot, hoofPitch, knee = 0, scap = 0) {
    const dy = Math.max(base.y - c.y, 1e-3), dz = c.z - base.z;
    this.tilt = -Math.atan2(dz, dy);
    const over = this._plane(c.x - base.x, -Math.hypot(dy, dz), pasternRot, hoofPitch, knee, scap);
    this._apply(parentQ);
    this.heel = hoofPitch;
    return over;
  }

  /**
   * Stance: the toe stays pinned at `toe` (horse space, on the ground). The heel
   * lifts only as far as needed for the leg to still reach — that is what makes
   * the hoof roll over its toe at the end of each step.
   */
  solveStance(base, parentQ, toe, pasternRot, scap = 0) {
    const tx = toe.x - base.x, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const at = (g) => {
      // The hoof stays level sideways, so the leg's plane runs through the coffin joint.
      const t = rot2(TOE, g);
      const dy = Math.max(base.y - (toe.y - t[1]), 1e-3), dz = toe.z + t[0] * sy - base.z;
      this.tilt = -Math.atan2(dz, dy);
      return this._plane(tx - t[0] * cy, -Math.hypot(dy, dz), pasternRot + 0.6 * g, g, 0, scap);
    };
    let g = 0, over = at(0);
    if (over > 0 && tx < 0.1) {
      let lo = -1.25, hi = 0;
      if (at(lo) <= 0) {
        for (let i = 0; i < 9; i++) {
          const mid = (lo + hi) / 2;
          if (at(mid) > 0) hi = mid;
          else lo = mid;
        }
      }
      g = lo;
      over = at(g);
    }
    this._apply(parentQ);
    this.heel = g;
    return over;
  }
}
