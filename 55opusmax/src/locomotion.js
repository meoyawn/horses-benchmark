// Procedural locomotion: gait scheduling, planted hooves, swing trajectories and analytic leg IK,
// plus body dynamics, head/neck look-at, tail, ears, breathing and idle behaviours.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const mj = (t) => { t = clamp(t, 0, 1); return t * t * t * (10 + t * (-15 + 6 * t)); };
const wrap01 = (x) => x - Math.floor(x);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const deg = Math.PI / 180;

// Gait table. Phase offsets are the touchdown times of each hoof within the stride.
export const GAITS = {
  stand: { speed: 0 },
  walk: {
    speed: 1.6, freq: (v) => 0.66 + 0.2 * v, duty: 0.62, off: { HL: 0, FL: 0.25, HR: 0.5, FR: 0.75 },
    lift: [0.12, 0.1], knee: 1.1, hock: 0.25, hoofFlex: 0.95, load: 0.12, reachF: 0.05, reachH: 0.02,
  },
  trot: {
    speed: 4.0, freq: (v) => 1.24 + 0.06 * v, duty: 0.42, off: { HL: 0, FR: 0, HR: 0.5, FL: 0.5 },
    lift: [0.27, 0.2], knee: 1.7, hock: 0.45, hoofFlex: 1.45, load: 0.24, reachF: 0.05, reachH: 0.04,
  },
  canter: {
    speed: 6.8, freq: (v) => 1.6 + 0.04 * v, duty: 0.37, off: { HL: 0, HR: 0.29, FL: 0.29, FR: 0.55 },
    lift: [0.3, 0.24], knee: 1.8, hock: 0.5, hoofFlex: 1.55, load: 0.26, reachF: 0.06, reachH: 0.06,
  },
  gallop: {
    speed: 12.5, freq: (v) => 1.98 + 0.028 * v, duty: 0.22, off: { HL: 0, HR: 0.11, FL: 0.37, FR: 0.49 },
    lift: [0.34, 0.28], knee: 1.9, hock: 0.6, hoofFlex: 1.65, load: 0.3, reachF: 0.1, reachH: 0.1,
  },
};
export const GAIT_ORDER = ['stand', 'walk', 'trot', 'canter', 'gallop'];
const LEG_IDS = ['FR', 'FL', 'HR', 'HL'];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

function qz(a, out = new THREE.Quaternion()) { return out.setFromAxisAngle(Z, a); }

class Leg {
  constructor(horse, id) {
    this.id = id;
    this.front = id[0] === 'F';
    const n = id[1];
    this.side = n === 'R' ? 1 : -1;
    const B = horse.bone;
    this.parent = this.front ? B['scap' + n] : B.pelvis;
    this.bones = this.front
      ? [B['humerus' + n], B['radius' + n], B['cannonF' + n], B['pasternF' + n], B['hoofF' + n]]
      : [B['femur' + n], B['tibia' + n], B['cannonH' + n], B['pasternH' + n], B['hoofH' + n]];
    const P = this.parent.userData.rest;
    const lm = horse.landmarks.hooves[id];
    const loc = (p) => [p[0] - P[0], p[1] - P[1], p[2] - P[2]];
    const J = this.bones.map((b) => loc(b.userData.rest));
    this.J = J;
    this.T = loc(lm.toe);
    this.G = loc(lm.ground);
    this.L = []; this.a = [];
    const seg = (A, Bp) => { const dx = Bp[0] - A[0], dy = Bp[1] - A[1]; this.L.push(Math.hypot(dx, dy)); this.a.push(Math.atan2(dy, dx)); };
    for (let i = 0; i < 4; i++) seg(J[i], J[i + 1]);
    // coffin joint -> toe (hoof "segment")
    this.toeVec = [this.T[0] - J[4][0], this.T[1] - J[4][1]];
    this.groundVec = [this.G[0] - this.T[0], this.G[1] - this.T[1]];
    this.restLen = Math.hypot(this.T[0] - J[0][0], this.T[1] - J[0][1]);
    // home: rest toe position in the root (ground) frame
    this.home = new THREE.Vector3(lm.toe[0], 0, lm.toe[2]);
    // scapula pivot geometry (front)
    if (this.front) {
      const C = B.chest.userData.rest;
      const S = this.parent.userData.rest;
      this.scapPivot = [S[0] - C[0], S[1] - C[1]];
      this.scapRestAng = Math.atan2(lm.toe[1] - S[1], lm.toe[0] - S[0]);
    }
    // state
    this.toe = new THREE.Vector3(); // current toe target (world)
    this.plant = new THREE.Vector3();
    this.liftPos = new THREE.Vector3();
    this.land = new THREE.Vector3();
    this.state = 'planted';
    this.swingStart = 0; // leg phase at lift-off (gait mode)
    this.s = 0; // swing progress
    this.stanceT = 0; // stance progress
    this.hoofAng = 0; // world pitch of hoof (0 = flat, negative = heel up / toe down)
    this.step = null; // idle step {t, dur, from, to, h}
    this.load = 0;
    this.prevPhase = 0;
    this.reachError = 0;
    this.override = null; // behaviour override (pawing, resting)
  }
}

export class Locomotion {
  constructor(horse) {
    this.horse = horse;
    this.B = horse.bone;
    this.legs = LEG_IDS.map((id) => new Leg(horse, id));
    this.leg = Object.fromEntries(this.legs.map((l) => [l.id, l]));
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.turn = 0; // rad/s
    this.turnInput = 0;
    this.gaitName = 'stand';
    this.targetGait = 'stand';
    this.speedScale = 1;
    this.phase = 0;
    this.time = 0;
    this.exertion = 0;
    this.bodyDrop = 0;
    this.params = { duty: 0.62, off: { ...GAITS.walk.off }, lift: [0.12, 0.1], knee: 1.1, hock: 0.25, hoofFlex: 0.95, load: 0.12, reachF: 0.05, reachH: 0.02 };
    this.gaitW = { walk: 0, trot: 0, canter: 0, gallop: 0 }; // blended weights for body motion styles
    this.lookTarget = new THREE.Vector3(3, 1.6, 2);
    this.lookWeight = 1;
    this.head = { yaw: 0, pitch: 0, roll: 0 };
    this.neckGraze = 0;
    this.tail = { lift: 0, swish: 0, swishV: 0, side: 0, bones: [0, 0, 0, 0, 0].map(() => ({ p: 0, y: 0, vp: 0, vy: 0 })) };
    this.ears = { R: { swivel: 0, tilt: 0, ts: 0, tt: 0 }, L: { swivel: 0, tilt: 0, ts: 0, tt: 0 } };
    this.breath = 0;
    this.behaviour = null;
    this.behaviourTimer = 2.5;
    this.events = []; // footfall events for audio / dust
    this.autopilot = false;
    this.wanderTarget = new THREE.Vector3(20, 0, 10);
    this.headToss = 0;
    this.shake = 0;
    this.restSide = 0;
    this.restAmt = 0;
    this._rootInv = new THREE.Quaternion();
    for (const l of this.legs) {
      l.toe.set(l.home.x, 0, l.home.z);
      l.plant.copy(l.toe);
    }
    // rest geometry for the neck look-at
    const n0 = this.B.neck0.userData.rest, hd = this.B.head.userData.rest;
    this.neckBase = new THREE.Vector3(...n0);
    this.headRest = new THREE.Vector3(...hd);
    this.restHeadDir = new THREE.Vector3(1.0, -0.05, 0).normalize();
  }

  setGait(name) {
    if (!GAITS[name]) return;
    this.targetGait = name;
  }

  // ------------------------------------------------------------------ main update
  update(dt, input = {}) {
    this.time += dt;
    this.events.length = 0;
    const tg = GAITS[this.targetGait];
    let targetSpeed = (tg.speed || 0) * this.speedScale;
    // steering
    const steer = input.turn ?? 0;
    this.turnInput = damp(this.turnInput, steer, 6, dt);
    if (this.autopilot && this.targetGait !== 'stand') this._autopilot(dt);
    else if (!input.turn) this._homing();
    const maxTurn = this.speed < 0.3 ? 0.9 : clamp(2.2 / (0.6 + this.speed * 0.45), 0.25, 1.3);
    this.turn = damp(this.turn, clamp(this.turnInput, -1, 1) * maxTurn, 5, dt);
    // speed with acceleration limits
    const acc = targetSpeed > this.speed ? 2.6 + this.speed * 0.25 : 4.0;
    this.speed = Math.abs(targetSpeed - this.speed) < acc * dt ? targetSpeed : this.speed + Math.sign(targetSpeed - this.speed) * acc * dt;
    if (this.speed < 0.02 && targetSpeed === 0) this.speed = 0;
    // choose the active gait from the current speed (so transitions follow the actual speed)
    let g = 'stand';
    if (this.speed > 0.05 || targetSpeed > 0) {
      if (this.targetGait === 'stand') g = this.speed > 2.3 ? 'trot' : 'walk';
      else {
        const order = ['walk', 'trot', 'canter', 'gallop'];
        const ti = order.indexOf(this.targetGait);
        g = 'walk';
        if (this.speed > 2.4 && ti >= 1) g = 'trot';
        if (this.speed > 5.2 && ti >= 2) g = 'canter';
        if (this.speed > 9.0 && ti >= 3) g = 'gallop';
        if (ti >= 1 && targetSpeed < this.speed && this.speed > 2.4) g = order[Math.min(ti, order.indexOf(g))] || g;
      }
    }
    this.gaitName = g;
    this.exertion = damp(this.exertion, clamp((this.speed - 1.5) / 10, 0, 1), this.speed > 2 ? 0.25 : 0.06, dt);

    // heading & position
    this.heading += this.turn * dt;
    const fwd = _v.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
    this.pos.addScaledVector(fwd, this.speed * dt);

    this._blendParams(dt);
    this._advancePhase(dt);
    this._behaviours(dt, input);
    this._applyBody(dt);
    this._legs(dt);
    this._applyHeadNeck(dt);
    this._applyTail(dt);
    this._applyEars(dt);
    // breathing
    const rate = 0.2 + 0.85 * this.exertion + 0.25 * clamp(this.speed / 6, 0, 1);
    this.breath += dt * TAU * rate;
    this.horse.material.userData.uniforms.uBreath.value = Math.sin(this.breath) * (0.6 + 1.2 * this.exertion);
  }

  _homing() {
    // gently keep the horse inside the meadow when nobody steers
    if (this.speed < 0.5) return;
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > 70) {
      const want = Math.atan2(this.pos.z, -this.pos.x); // heading towards origin
      this.turnInput = clamp(wrapPi(want - this.heading) * 1.2, -1, 1);
    }
  }

  _autopilot(dt) {
    const d = _v2.set(this.wanderTarget.x - this.pos.x, 0, this.wanderTarget.z - this.pos.z);
    if (d.length() < 6) {
      const a = Math.random() * TAU, r = 10 + Math.random() * 45;
      this.wanderTarget.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    const want = Math.atan2(-d.z, d.x);
    this.turnInput = clamp(wrapPi(want - this.heading) * 1.5, -1, 1);
  }

  _blendParams(dt) {
    const g = GAITS[this.gaitName];
    const p = this.params;
    if (this.gaitName === 'stand') {
      for (const k in this.gaitW) this.gaitW[k] = damp(this.gaitW[k], 0, 4, dt);
      return;
    }
    const k = 5;
    p.duty = damp(p.duty, g.duty, k, dt);
    for (const id of LEG_IDS) {
      const d = wrapPi((g.off[id] - p.off[id]) * TAU) / TAU;
      p.off[id] = wrap01(p.off[id] + d * (1 - Math.exp(-k * dt)));
    }
    for (const key of ['knee', 'hock', 'hoofFlex', 'load', 'reachF', 'reachH']) p[key] = damp(p[key], g[key], k, dt);
    p.lift[0] = damp(p.lift[0], g.lift[0], k, dt);
    p.lift[1] = damp(p.lift[1], g.lift[1], k, dt);
    for (const key in this.gaitW) this.gaitW[key] = damp(this.gaitW[key], key === this.gaitName ? 1 : 0, 4, dt);
  }

  freq() {
    const g = GAITS[this.gaitName];
    if (!g.freq) return 0;
    return g.freq(Math.max(this.speed, 0.6));
  }

  _advancePhase(dt) {
    const moving = this.gaitName !== 'stand';
    if (moving) this.phase = wrap01(this.phase + this.freq() * dt);
  }

  // ------------------------------------------------------------------ legs
  _legs(dt) {
    const root = this.B.root;
    const moving = this.gaitName !== 'stand';
    const p = this.params;
    const f = this.freq();
    const cosH = Math.cos(this.heading), sinH = Math.sin(this.heading);
    const toWorld = (local, out) => out.set(this.pos.x + local.x * cosH + local.z * sinH, local.y, this.pos.z - local.x * sinH + local.z * cosH);

    let anySwing = false;
    for (const leg of this.legs) {
      const lp = wrap01(this.phase + p.off[leg.id]);
      if (moving) {
        // ---- gait-driven state machine
        const D = p.duty;
        if (leg.state === 'planted') {
          const inSwing = lp >= D;
          const crossed = leg.prevPhase < D && lp >= D;
          // lift early when the leg runs out of reach (fast gaits): stance ends at the limit of the sweep
          const overReach = leg.reachError > 0.025 && leg.stanceT > 0.55 && !inSwing;
          if (crossed || overReach || (inSwing && leg.justStarted && lp < 0.985)) {
            leg.state = 'swing';
            leg.swingStart = lp;
            leg.liftPos.copy(leg.toe); leg.liftPos.y = 0;
            leg.liftAng = leg.hoofAng;
            this.events.push({ type: 'lift', leg: leg.id });
          }
          leg.stanceT = lp < D ? lp / D : 1;
        } else if (leg.state === 'swing') {
          const wrapped = lp < leg.prevPhase - 0.5;
          if (wrapped) {
            leg.state = 'planted';
            leg.plant.copy(leg.toe); leg.plant.y = 0;
            leg.stanceT = 0;
            this.events.push({ type: 'land', leg: leg.id, pos: leg.plant.clone(), speed: this.speed });
          }
        }
        leg.justStarted = false;
      } else {
        // ---- standing: finish swings, then square up with discrete steps
        if (leg.state === 'swing') {
          leg.state = 'stepping';
          leg.step = { t: leg.s * 0.4, dur: 0.4, from: leg.liftPos.clone(), h: 0.07, ang: leg.liftAng || 0 };
        }
        leg.justStarted = true;
        leg.stanceT = 0.5;
      }
      leg.prevPhase = lp;
      if (leg.state !== 'planted') anySwing = true;
    }

    // idle stepping when standing (and to follow turning on the spot)
    if (!moving) {
      if (this._stepCooldown > 0) this._stepCooldown -= dt;
      let worst = null, worstErr = 0;
      for (const leg of this.legs) {
        if (leg.state !== 'planted' || leg.override) continue;
        const home = toWorld(leg.home, _v2);
        const err = Math.hypot(home.x - leg.plant.x, home.z - leg.plant.z);
        if (err > worstErr) { worstErr = err; worst = leg; }
      }
      const thresh = this.turnInput !== 0 ? 0.06 : 0.11;
      if (worst && worstErr > thresh && !anySwing && !(this._stepCooldown > 0)) {
        worst.state = 'stepping';
        worst.step = { t: 0, dur: 0.42, from: worst.plant.clone(), h: 0.06 + Math.min(0.05, worstErr * 0.2), ang: 0 };
        this._stepCooldown = 0.12;
        this.events.push({ type: 'lift', leg: worst.id });
      }
    }

    // ---- hoof targets
    for (const leg of this.legs) {
      const isF = leg.front ? 0 : 1;
      leg.load = 0;
      if (leg.state === 'swing') {
        const lp = wrap01(this.phase + p.off[leg.id]);
        let s = (lp - leg.swingStart) / Math.max(1e-3, 1 - leg.swingStart);
        if (lp < leg.swingStart - 0.5) s = 1;
        s = clamp(s, 0, 1);
        leg.s = s;
        // predicted landing spot
        const tRemain = (1 - lp) / Math.max(f, 0.1);
        const hPred = this.heading + this.turn * tRemain;
        const hMid = this.heading + this.turn * tRemain * 0.5;
        const px = this.pos.x + Math.cos(hMid) * this.speed * tRemain;
        const pz = this.pos.z - Math.sin(hMid) * this.speed * tRemain;
        const half = (this.speed * p.duty) / Math.max(f, 0.1) * 0.5;
        const ahead = half + (leg.front ? p.reachF : p.reachH);
        const lx = leg.home.x + ahead, lz = leg.home.z * (1 - 0.12 * this.gaitW.gallop);
        const ch = Math.cos(hPred), sh = Math.sin(hPred);
        leg.land.set(px + lx * ch + lz * sh, 0, pz - lx * sh + lz * ch);
        const m = mj(s);
        leg.toe.lerpVectors(leg.liftPos, leg.land, m);
        const lift = p.lift[isF] * (0.6 + 0.4 * clamp(this.speed / GAITS[this.gaitName].speed, 0, 1.3));
        const prof = leg.front ? Math.sin(Math.PI * Math.pow(s, 0.78)) : Math.sin(Math.PI * Math.pow(s, 0.95));
        leg.toe.y = lift * Math.pow(Math.max(0, prof), 1.15);
        // hoof pitch: flicks toe-down after lift-off, extends to land flat (slightly heel first)
        const flex = p.hoofFlex * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, s / 0.86))), 0.85);
        leg.hoofAng = lerp(leg.liftAng || 0, 0, smooth(s * 3)) - flex * (1 - smooth((s - 0.55) / 0.45) * 0.0) + 0.05 * smooth((s - 0.82) / 0.18);
        leg.hoofAng = Math.min(leg.hoofAng, 0.06);
      } else if (leg.state === 'stepping') {
        const st = leg.step;
        st.t += dt;
        const s = clamp(st.t / st.dur, 0, 1);
        leg.s = s;
        const target = toWorld(leg.home, _v2);
        leg.toe.lerpVectors(st.from, target, mj(s));
        leg.toe.y = st.h * Math.sin(Math.PI * s);
        leg.hoofAng = -0.6 * Math.sin(Math.PI * s) + (st.ang || 0) * (1 - s);
        if (s >= 1) {
          leg.state = 'planted';
          leg.step = null;
          leg.plant.copy(leg.toe); leg.plant.y = 0;
          leg.hoofAng = 0;
          this.events.push({ type: 'land', leg: leg.id, pos: leg.plant.clone(), speed: 0.5 });
        }
      } else {
        // planted: toe fixed, breakover near the end of stance
        leg.toe.copy(leg.plant);
        const st = moving ? leg.stanceT : 0;
        leg.hoofAng = moving ? -p.hoofFlex * 0.42 * Math.pow(smooth((st - 0.72) / 0.28), 1.6) : 0;
        leg.load = moving ? Math.sin(Math.PI * clamp(st, 0, 1)) : 0.4;
        leg.s = 0;
      }
      if (leg.override) leg.override(leg, dt);
    }

    // ---- IK (after the upper body transforms are final)
    root.updateMatrixWorld(true);
    let maxExcess = 0;
    for (const leg of this.legs) {
      const ex = this._solveLeg(leg);
      if (leg.state === 'planted') maxExcess = Math.max(maxExcess, ex);
    }
    this.bodyDrop = damp(this.bodyDrop, Math.min(0.045, maxExcess * 0.6), 6, dt);
  }

  _solveLeg(leg) {
    const p = this.params;
    const moving = this.gaitName !== 'stand';
    // scapula follows the leg (front) to add reach
    if (leg.front) {
      const chest = this.B.chest;
      chest.updateMatrixWorld(true);
      _m.copy(chest.matrixWorld).invert();
      const t = _v.copy(leg.toe).applyMatrix4(_m);
      const ang = Math.atan2(t.y - leg.scapPivot[1], t.x - leg.scapPivot[0]);
      let ps = clamp(wrapPi(ang - leg.scapRestAng) * 0.5, -0.32, 0.32);
      if (leg.state === 'swing') ps += 0.06 * Math.sin(Math.PI * leg.s);
      leg.parent.quaternion.setFromAxisAngle(Z, ps);
      leg.parent.updateMatrixWorld(true);
    }
    // target in parent-local space
    _m.copy(leg.parent.matrixWorld).invert();
    const T = _v.copy(leg.toe).applyMatrix4(_m);
    // ground pitch of the parent frame (relative to the root heading)
    leg.parent.getWorldQuaternion(_q);
    this.B.root.getWorldQuaternion(_q2).invert();
    const ax = _v2.set(1, 0, 0).applyQuaternion(_q).applyQuaternion(_q2);
    const parentPitch = Math.atan2(ax.y, ax.x);
    const th = leg.hoofAng - parentPitch; // hoof angle in parent frame
    // coffin joint from the toe
    const c = Math.cos(th), s = Math.sin(th);
    const Cx = T.x - (c * leg.toeVec[0] - s * leg.toeVec[1]);
    const Cy = T.y - (s * leg.toeVec[0] + c * leg.toeVec[1]);
    // pastern direction: follows the hoof, plus coffin flex in swing / fetlock sink under load
    const swingS = leg.state === 'swing' ? leg.s : leg.state === 'stepping' ? leg.s : 0;
    const coffin = -0.25 * Math.sin(Math.PI * swingS) * (moving ? 1 : 0.5);
    const sink = p.load * leg.load * (moving ? 1 : 0.3);
    const phiP = leg.a[3] + th + coffin + sink;
    const Fx = Cx - leg.L[3] * Math.cos(phiP);
    const Fy = Cy - leg.L[3] * Math.sin(phiP);
    // upper chain: from the top joint to the fetlock
    const Sx = leg.J[0][0], Sy = leg.J[0][1];
    const dx = Fx - Sx, dy = Fy - Sy;
    const Dt = Math.hypot(dx, dy);
    const L0 = leg.L[0], L1 = leg.L[1], L2 = leg.L[2];
    const a0 = leg.a[0], a1 = leg.a[1], a2 = leg.a[2];
    let bend; // knee (carpus) or hock extra flexion
    let excess = 0;
    let q, endAng;
    if (leg.front) {
      const sw = leg.state === 'swing' ? leg.s : leg.state === 'stepping' ? leg.s : -1;
      let kappa = 0;
      if (sw >= 0) kappa = (moving ? p.knee : 0.9) * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, sw / 0.8))), 1.1);
      else if (moving) kappa = p.knee * 0.25 * Math.pow(smooth((leg.stanceT - 0.8) / 0.2), 2);
      bend = kappa;
      const end = (e) => {
        const x = L0 * Math.cos(a0) + L1 * Math.cos(a1 + e) + L2 * Math.cos(a2 + e - kappa);
        const y = L0 * Math.sin(a0) + L1 * Math.sin(a1 + e) + L2 * Math.sin(a2 + e - kappa);
        return [x, y];
      };
      ({ q, endAng, excess } = solve1D(end, Dt, -0.3, 2.3));
      const th0 = Math.atan2(dy, dx) - endAng;
      const e = q;
      const absC = th0 + e - kappa; // cannon rotation relative to rest
      const absP = phiP - leg.a[3];
      this._setLeg(leg, th0, [e, -kappa, absP - absC, th - absP], T);
    } else {
      const sw = leg.state === 'swing' ? leg.s : leg.state === 'stepping' ? leg.s : -1;
      const cpl = 1.05; // reciprocal apparatus: hock follows the stifle
      let b = 0;
      if (sw >= 0) b = (moving ? p.hock : 0.3) * Math.max(0, Math.sin(Math.PI * Math.min(1, sw / 0.85)));
      bend = b;
      const end = (sf) => {
        const x = L0 * Math.cos(a0) + L1 * Math.cos(a1 - sf) + L2 * Math.cos(a2 - sf + cpl * sf + b);
        const y = L0 * Math.sin(a0) + L1 * Math.sin(a1 - sf) + L2 * Math.sin(a2 - sf + cpl * sf + b);
        return [x, y];
      };
      ({ q, endAng, excess } = solve1D(end, Dt, -0.2, 1.6));
      const th0 = Math.atan2(dy, dx) - endAng;
      const sf = q;
      const absC = th0 - sf + cpl * sf + b;
      const absP = phiP - leg.a[3];
      this._setLeg(leg, th0, [-sf, cpl * sf + b, absP - absC, th - absP], T);
    }
    leg.reachError = excess;
    return excess;
  }

  _setLeg(leg, th0, locals, Tlocal) {
    // abduction from the lateral offset of the target
    const zRest = leg.T[2];
    const dz = Tlocal.z - zRest;
    const abd = -Math.asin(clamp(dz / leg.restLen, -0.4, 0.4));
    const b0 = leg.bones[0];
    b0.quaternion.setFromAxisAngle(X, abd).multiply(qz(th0, _q));
    for (let i = 0; i < 4; i++) qz(locals[i], leg.bones[i + 1].quaternion);
  }

  // ------------------------------------------------------------------ body
  _applyBody(dt) {
    const B = this.B;
    const w = this.gaitW;
    const ph = this.phase;
    const sp = this.speed;
    // root
    B.root.position.set(this.pos.x, 0, this.pos.z);
    B.root.quaternion.setFromAxisAngle(Y, this.heading);
    // gait specific oscillations
    const amp = clamp(sp / 2, 0, 1);
    let bob = 0, pitch = 0, roll = 0, sway = 0, spine = 0;
    bob += w.walk * 0.012 * Math.cos(TAU * 2 * (ph - 0.07)) * amp;
    roll += w.walk * 1.6 * deg * Math.sin(TAU * (ph - 0.05));
    sway += w.walk * 0.01 * Math.sin(TAU * (ph - 0.1));
    bob += w.trot * -0.032 * Math.cos(TAU * 2 * (ph - 0.21));
    pitch += w.trot * 0.8 * deg * Math.sin(TAU * 2 * (ph - 0.21));
    roll += w.trot * 1.2 * deg * Math.sin(TAU * (ph - 0.21));
    bob += w.canter * 0.045 * Math.cos(TAU * (ph - 0.95));
    pitch += w.canter * 4.5 * deg * Math.cos(TAU * (ph - 0.12));
    roll += w.canter * 1.5 * deg * Math.sin(TAU * (ph - 0.3));
    bob += w.gallop * 0.055 * Math.cos(TAU * (ph - 0.85));
    pitch += w.gallop * 6 * deg * Math.cos(TAU * (ph - 0.18));
    spine += w.gallop * 5 * deg * Math.cos(TAU * (ph - 0.88));
    // idle: breathing sway, weight shift onto a resting hind leg
    const restRoll = this.restSide * this.restAmt * 2.2 * deg;
    // lean into turns
    roll += clamp(-this.turn * sp * 0.035, -0.22, 0.22);
    // gallop/canter: lower and stretch
    const crouch = 0.03 * w.gallop + 0.012 * w.canter + 0.008 * w.trot;
    const br = B.body.userData.restPos;
    const gz = this.neckGraze;
    B.body.position.set(br.x, br.y + bob - this.bodyDrop - crouch - 0.012 * this.restAmt - 0.03 * gz, br.z + sway);
    B.body.quaternion.setFromEuler(new THREE.Euler(roll + restRoll, this.turn * 0.04 * sp * 0.2, pitch - 0.02 * w.gallop - 0.05 * gz, 'ZXY'));
    // spine: gallop flexion, lateral bend into turns
    const bend = clamp(this.turn * 0.12, -0.12, 0.12);
    B.chest.quaternion.setFromEuler(new THREE.Euler(0, bend * 0.6, -spine * 0.3, 'XYZ'));
    B.loin.quaternion.setFromEuler(new THREE.Euler(0, -bend * 0.3, spine * 0.4, 'XYZ'));
    B.pelvis.quaternion.setFromEuler(new THREE.Euler(-restRoll * 1.2, -bend * 0.4, spine * 0.8 - 0.03 * this.restAmt, 'XYZ'));
  }

  // ------------------------------------------------------------------ head & neck
  _applyHeadNeck(dt) {
    const B = this.B;
    const w = this.gaitW;
    const ph = this.phase;
    // look-at, computed in the chest frame
    B.chest.updateMatrixWorld(true);
    _m.copy(B.chest.matrixWorld).invert();
    const t = _v.copy(this.lookTarget).applyMatrix4(_m);
    const base = _v2.set(this.headRest.x - this.B.chest.userData.rest[0], this.headRest.y - this.B.chest.userData.rest[1], 0);
    const dx = t.x - base.x, dy = t.y - base.y, dz = t.z - base.z;
    let yaw = Math.atan2(-dz, dx);
    let pitch = Math.atan2(dy, Math.hypot(dx, dz)) + 0.05;
    const lw = this.lookWeight * (1 - 0.8 * clamp(this.speed / 7, 0, 1));
    yaw = clamp(yaw, -1.15, 1.15) * lw;
    pitch = clamp(pitch, -0.5, 0.35) * lw;
    this.head.yaw = damp(this.head.yaw, yaw, 3, dt);
    this.head.pitch = damp(this.head.pitch, pitch, 3, dt);
    // gait-driven neck motion
    let nod = 0;
    nod += w.walk * 3.2 * deg * Math.cos(TAU * 2 * (ph - 0.07)) * clamp(this.speed / 1.5, 0, 1);
    nod += w.trot * 0.8 * deg * Math.cos(TAU * 2 * (ph - 0.25));
    nod += w.canter * 6 * deg * Math.cos(TAU * (ph - 0.62));
    nod += w.gallop * 8 * deg * Math.cos(TAU * (ph - 0.58));
    const stretch = 6 * deg * w.gallop + 3 * deg * w.canter; // neck extends forward at speed
    // grazing pose
    const graze = this.neckGraze;
    const toss = this.headToss;
    const shake = this.shake;
    const yw = this.head.yaw * (1 - graze * 0.8), pt = this.head.pitch * (1 - graze);
    const shakeYaw = shake * 0.25 * Math.sin(this.time * 26);
    const shakeRoll = shake * 0.35 * Math.sin(this.time * 26 + 1);
    const weights = [0.12, 0.17, 0.22, 0.24, 0.25];
    const names = ['neck0', 'neck1', 'neck2', 'neck3', 'head'];
    const grazeP = [-1.0, -0.5, -0.3, -0.2, 1.0];
    for (let i = 0; i < 5; i++) {
      const b = B[names[i]];
      const wi = weights[i];
      const pz = pt * wi * 1.1 + nod * (i < 3 ? 0.45 : 0.15) - stretch * (i < 2 ? 0.6 : -0.15) + graze * grazeP[i] + toss * (i < 2 ? 0.18 : 0.08) * (i === 4 ? -2.0 : 1);
      const py = yw * wi + shakeYaw * (i >= 3 ? 1 : 0.3);
      const px = -yw * wi * 0.25 + shakeRoll * (i === 4 ? 1 : 0.2);
      b.quaternion.setFromEuler(new THREE.Euler(px, py, pz, 'YZX'));
      // the neck lengthens a little as it reaches down to graze
      if (i > 0) b.position.copy(b.userData.restPos).multiplyScalar(1 + 0.09 * graze);
    }
  }

  // ------------------------------------------------------------------ tail
  _applyTail(dt) {
    const B = this.B;
    const w = this.gaitW;
    const tl = this.tail;
    const liftTarget = 0.12 * w.walk + 0.42 * w.trot + 0.55 * w.canter + 0.85 * w.gallop;
    tl.lift = damp(tl.lift, liftTarget, 2, dt);
    // swish spring
    tl.swishV += (-tl.swish * 30 - tl.swishV * 4.5) * dt;
    tl.swish += tl.swishV * dt;
    const names = ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'];
    const bob = (w.trot * Math.sin(TAU * 2 * this.phase) + (w.canter + w.gallop) * Math.sin(TAU * this.phase)) * 0.08;
    for (let i = 0; i < 5; i++) {
      const s = tl.bones[i];
      const lag = i * 0.6;
      const targetP = -tl.lift * (i === 0 ? 0.55 : 0.32) - bob * (0.3 + i * 0.15) + Math.sin(this.time * 1.3 + i) * 0.015;
      const targetY = tl.swish * (0.3 + i * 0.12) + Math.sin(this.time * 0.7 - lag) * 0.02;
      const k = 40 - i * 6;
      s.vp += ((targetP - s.p) * k - s.vp * 7) * dt;
      s.vy += ((targetY - s.y) * k - s.vy * 6) * dt;
      s.p += s.vp * dt; s.y += s.vy * dt;
      B[names[i]].quaternion.setFromEuler(new THREE.Euler(s.y, 0, s.p, 'XYZ'));
    }
  }

  swishTail(dir = Math.random() < 0.5 ? -1 : 1, strength = 1) {
    this.tail.swishV += dir * 9 * strength;
  }

  // ------------------------------------------------------------------ ears
  _applyEars(dt) {
    const E = this.ears;
    const fast = clamp((this.speed - 4) / 6, 0, 1);
    for (const side of ['R', 'L']) {
      const e = E[side];
      if (Math.random() < dt * 0.25) e.ts = (Math.random() - 0.5) * 1.6; // random flick
      if (Math.random() < dt * 0.15) e.tt = Math.random() * 0.4;
      const swivelT = e.ts * (1 - fast) + (side === 'R' ? 1 : -1) * this.head.yaw * 0.6;
      const tiltT = e.tt + fast * 0.55 + this.earPin * 1.1;
      e.swivel = damp(e.swivel, swivelT, 8, dt);
      e.tilt = damp(e.tilt, tiltT, 8, dt);
      e.ts = damp(e.ts, 0, 0.3, dt);
      e.tt = damp(e.tt, 0, 0.4, dt);
      const b = this.B['ear' + side];
      const lm = this.horse.landmarks.ears.find((x) => x.side === side);
      const axis = _v.set(...lm.axis);
      _q.setFromAxisAngle(axis, e.swivel * (side === 'R' ? -1 : 1));
      // tilt backwards (about the lateral axis) and slightly outwards when relaxed
      _q2.setFromEuler(new THREE.Euler((side === 'R' ? 1 : -1) * e.tilt * 0.35, 0, e.tilt, 'ZXY'));
      b.quaternion.copy(_q2).multiply(_q);
    }
  }

  get earPin() { return this._earPin || 0; }
  set earPin(v) { this._earPin = v; }

  // ------------------------------------------------------------------ behaviours
  _behaviours(dt, input) {
    const standing = this.gaitName === 'stand' && this.speed < 0.05;
    this.headToss = damp(this.headToss, 0, 3, dt);
    this.shake = damp(this.shake, 0, 2.5, dt);
    this._earPin = damp(this._earPin || 0, 0, 0.8, dt);
    if (!standing) {
      this.neckGraze = damp(this.neckGraze, 0, 3, dt);
      this.restAmt = damp(this.restAmt, 0, 4, dt);
      if (this.behaviour) this._endBehaviour();
      this.behaviourTimer = 3;
      if (Math.random() < dt * 0.12) this.swishTail();
      return;
    }
    const b = this.behaviour;
    if (b) {
      b.t += dt;
      b.update?.(dt);
      if (b.t > b.dur) this._endBehaviour();
    } else {
      this.behaviourTimer -= dt;
      if (this.behaviourTimer <= 0) this._startRandomBehaviour();
    }
    // graze / rest blending
    this.neckGraze = damp(this.neckGraze, this.behaviour?.name === 'graze' ? 1 : 0, 1.6, dt);
    this.restAmt = damp(this.restAmt, this.behaviour?.name === 'rest' ? 1 : 0, 1.5, dt);
    if (Math.random() < dt * 0.18) this.swishTail(undefined, 0.6 + Math.random() * 0.6);
  }

  _endBehaviour() {
    const b = this.behaviour;
    if (b?.leg) b.leg.override = null;
    this.behaviour = null;
    this.behaviourTimer = 2 + Math.random() * 4;
  }

  _startRandomBehaviour() {
    const r = Math.random();
    if (r < 0.3) this.startBehaviour('graze');
    else if (r < 0.52) this.startBehaviour('rest');
    else if (r < 0.66) this.startBehaviour('paw');
    else if (r < 0.8) this.startBehaviour('shake');
    else this.startBehaviour('look');
  }

  startBehaviour(name) {
    if (this.behaviour) this._endBehaviour();
    const b = { name, t: 0, dur: 4 };
    if (name === 'graze') {
      b.dur = 7 + Math.random() * 7;
      this.lookWeight = 0;
      b.update = () => { if (b.t > b.dur - 1.2) this.lookWeight = 1; };
    } else if (name === 'rest') {
      b.dur = 8 + Math.random() * 8;
      const leg = this.leg[Math.random() < 0.5 ? 'HR' : 'HL'];
      this.restSide = leg.side;
      b.leg = leg;
      leg.override = (lg, dt) => {
        // cock the hind hoof: rests on the toe, slightly forward
        const a = smooth(Math.min(b.t / 0.9, (b.dur - b.t) / 0.9));
        const home = _v2.set(lg.home.x + 0.07, 0, lg.home.z - lg.side * 0.03);
        const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
        const wx = this.pos.x + home.x * ch + home.z * sh, wz = this.pos.z - home.x * sh + home.z * ch;
        lg.toe.set(lerp(lg.plant.x, wx, a), 0.0, lerp(lg.plant.z, wz, a));
        lg.hoofAng = -0.85 * a;
        lg.load = 0;
      };
    } else if (name === 'paw') {
      b.dur = 2.6 + Math.random() * 1.5;
      const leg = this.leg[Math.random() < 0.5 ? 'FR' : 'FL'];
      b.leg = leg;
      this.lookWeight = 0.3;
      leg.override = (lg) => {
        const env = smooth(Math.min(b.t / 0.3, (b.dur - b.t) / 0.3));
        const cyc = (b.t * 1.4) % 1;
        const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
        const fwd = 0.1 + 0.18 * Math.sin(TAU * cyc);
        const up = Math.max(0, Math.sin(TAU * cyc + 0.6)) * 0.2;
        lg.toe.set(lg.plant.x + fwd * ch * env, up * env, lg.plant.z - fwd * sh * env);
        lg.hoofAng = -1.0 * env * (0.5 + 0.5 * Math.sin(TAU * cyc + 0.8));
        lg.load = 0;
        lg._pawS = env;
        if (cyc < 0.02 && env > 0.5) this.events.push({ type: 'land', leg: lg.id, pos: lg.toe.clone(), speed: 0.4 });
      };
      b.update = () => { if (b.t > b.dur - 0.4) this.lookWeight = 1; };
    } else if (name === 'shake') {
      b.dur = 1.2;
      this.shake = 1;
      this.swishTail();
    } else if (name === 'look') {
      b.dur = 3 + Math.random() * 3;
      const a = this.heading + (Math.random() - 0.5) * 2.4;
      const save = this.lookTarget.clone();
      this.lookTarget.set(this.pos.x + Math.cos(a) * 8, 1.2 + Math.random() * 1.2, this.pos.z - Math.sin(a) * 8);
      b.update = () => { if (b.t > b.dur - 0.1) this.lookTarget.copy(save); };
    }
    this.behaviour = b;
  }

  toss() {
    this.headToss = 1;
    this._earPin = 0.8;
    this.swishTail();
  }

  hoofWorld(leg, out) { return out.copy(leg.toe); }
}

// Find q in [lo, hi] with |end(q)| == D (end(q) is monotone-ish in q). Returns q, the angle of end(q), and the
// unreachable excess (when the target is too far).
function solve1D(end, D, lo, hi) {
  const len = (q) => { const e = end(q); return Math.hypot(e[0], e[1]); };
  let dLo = len(lo), dHi = len(hi);
  let excess = 0;
  let q;
  if (D >= dLo) { q = lo; excess = D - dLo; }
  else if (D <= dHi) q = hi;
  else {
    let a = lo, b = hi;
    for (let i = 0; i < 22; i++) {
      const m = 0.5 * (a + b);
      if (len(m) > D) a = m; else b = m;
    }
    q = 0.5 * (a + b);
  }
  const e = end(q);
  return { q, endAng: Math.atan2(e[1], e[0]), excess };
}
