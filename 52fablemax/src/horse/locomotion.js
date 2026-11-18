// Procedural locomotion.
//
// The horse is driven like a real one: a stride clock decides when each hoof
// leaves the ground, hooves that are down stay exactly where they landed (in
// world space), hooves in the air fly to where the body will need them, and
// the trunk rides on the legs that are loaded. Walk, trot, canter and gallop
// differ only in their numbers, so the gaits blend into one another.
import * as THREE from 'three';

const LEG_KEYS = ['HL', 'FL', 'HR', 'FR'];
const G = 9.81;

// Touch-down phase of each hoof within a stride, duty factor (fraction of the
// stride a hoof is down), cadence and the shape of the movement.
export const GAITS = {
  walk: {
    speed: 1.55, freq: 0.9, duty: 0.64, phase: { HL: 0, FL: 0.25, HR: 0.5, FR: 0.75 },
    liftF: 0.085, liftH: 0.06, knee: 0.8, hock: 0.2, curl: 0.5, sink: 0.07,
    bounce: 0.012, spring: 0, crouch: 0.02, neckBase: -0.07, nod1: 0, nod2: 0.045,
    tuck: 0.12, sway: 0.075, tail: 0.04, biasF: -0.03, biasH: -0.02, track: 1.0, ears: 0,
  },
  trot: {
    speed: 3.5, freq: 1.36, duty: 0.43, phase: { HL: 0, FL: 0.5, HR: 0.5, FR: 0 },
    liftF: 0.17, liftH: 0.12, knee: 1.2, hock: 0.45, curl: 0.9, sink: 0.2,
    bounce: 0.034, spring: 1, crouch: 0.035, neckBase: 0.04, nod1: 0, nod2: 0.012,
    tuck: 0.12, sway: 0.045, tail: 0.3, biasF: -0.02, biasH: -0.02, track: 0.85, ears: 0,
  },
  canter: {
    speed: 5.8, freq: 1.72, duty: 0.35, phase: { HL: 0, FL: 0.35, HR: 0.29, FR: 0.62 },
    liftF: 0.22, liftH: 0.16, knee: 1.35, hock: 0.55, curl: 1.2, sink: 0.3,
    bounce: 0.05, spring: 1, crouch: 0.05, neckBase: -0.05, nod1: 0.085, nod2: 0,
    tuck: 0.5, sway: 0.02, tail: 0.45, biasF: 0, biasH: 0.0, track: 0.7, ears: 0.1,
  },
  gallop: {
    speed: 10.5, freq: 2.25, duty: 0.26, phase: { HL: 0, FL: 0.37, HR: 0.11, FR: 0.47 },
    liftF: 0.26, liftH: 0.2, knee: 1.5, hock: 0.7, curl: 1.5, sink: 0.38,
    bounce: 0.05, spring: 1, crouch: 0.07, neckBase: -0.22, nod1: 0.07, nod2: 0,
    tuck: 1.0, sway: 0.0, tail: 0.5, biasF: 0, biasH: 0.02, track: 0.6, ears: 0.45,
  },
};
const GAIT_ORDER = ['walk', 'trot', 'canter', 'gallop'];
const SHIFT_UP = [2.5, 4.7, 8.2];     // speeds at which the gait changes up
const SHIFT_DOWN = [2.1, 4.1, 7.4];
const SCALARS = ['freq', 'duty', 'liftF', 'liftH', 'knee', 'hock', 'curl', 'sink', 'bounce', 'spring', 'crouch',
  'neckBase', 'nod1', 'nod2', 'tuck', 'sway', 'tail', 'biasF', 'biasH', 'track', 'ears'];

const frac = (x) => x - Math.floor(x);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapHalf = (x) => x - Math.round(x);          // into [-0.5, 0.5]
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const _v = new THREE.Vector3();
const _toe = new THREE.Vector3();
const _qy = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _qx = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export class Locomotion {
  constructor(horse) {
    this.horse = horse;
    this.rig = horse.rig;
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.accel = 0;
    this.turnRate = 0;

    // intent
    this.wantSpeed = 0;        // m/s
    this.steer = 0;            // -1 (right) .. 1 (left), from the keyboard
    this.goal = null;          // world point to travel to
    this.travelGait = 'trot';

    this.gait = 'walk';
    this.p = { ...pick(GAITS.walk) };
    this.ph = { ...GAITS.walk.phase };
    this.clock = 0.1;
    this.running = false;      // is the stride clock advancing
    this.move = 0;             // 0 standing .. 1 moving, eased
    this.strideTime = 0;
    this.onFootfall = null;    // (legKey, worldPos, speed) => void

    this.rear = { active: false, t: 0, amount: 0 };
    this.pitchRate = 0;

    this.feet = {};
    for (const key of LEG_KEYS) {
      const leg = this.rig.legs[key];
      const toe = new THREE.Vector3(leg.coffinRest.x + leg.hoof.toe[0], 0, leg.coffinRest.z);
      this.feet[key] = {
        key, leg, fore: key[0] === 'F', side: key[1] === 'R' ? 1 : -1,
        restToe: toe.clone(),
        down: true,
        plant: toe.clone(),      // world position of the toe while down
        plantYaw: 0,
        swing: 0,                // 0..1 progress of the flight
        swingTime: 0.4,
        from: toe.clone(),       // world toe position at lift-off
        to: toe.clone(),
        liftPitch: 0,
        pitch: 0,
        overreach: false,
        stance: 0.5,             // 0..1 progress through the stance
        load: 0,
        downTime: 1,
        toe: toe.clone(),        // current toe, model space
      };
    }
    this.body = { y: 0, pitch: 0, roll: 0, yaw: 0, lean: 0 };
  }

  /** 'stand' | 'walk' | 'trot' | 'canter' | 'gallop' */
  setGait(name) {
    this.goal = null;
    this.wantSpeed = name === 'stand' ? 0 : GAITS[name].speed;
    if (name !== 'stand') this.travelGait = name;
  }

  /** Name of the gait she is in right now (or 'stand'). */
  currentGait() {
    return this.move < 0.08 && !this.running ? 'stand' : this.gait;
  }

  goTo(point) {
    this.goal = point.clone();
    this.goal.y = 0;
  }

  startRear() {
    if (this.rear.active || this.speed > 0.6) return false;
    this.goal = null;
    this.wantSpeed = 0;
    this.rear.active = true;
    this.rear.t = 0;
    return true;
  }

  toWorld(m, out) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return out.set(this.position.x + m.x * c + m.z * s, m.y, this.position.z - m.x * s + m.z * c);
  }

  toModel(w, out) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const dx = w.x - this.position.x, dz = w.z - this.position.z;
    return out.set(dx * c - dz * s, w.y, dx * s + dz * c);
  }

  // ------------------------------------------------------------- intent ---

  _drive(dt) {
    let want = this.wantSpeed;
    let turn = this.steer * this._maxTurn();
    if (this.goal) {
      const dx = this.goal.x - this.position.x, dz = this.goal.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      const bearing = Math.atan2(-dz, dx);
      const err = wrapPi(bearing - this.heading);
      if (dist < 0.55) {
        this.goal = null;
        want = this.wantSpeed = 0;
      } else {
        const cruise = GAITS[this.travelGait].speed;
        // slow for the approach and for sharp turns
        want = Math.min(cruise, 0.55 + dist * 0.85);
        want *= clamp(1.25 - Math.abs(err) * 0.55, 0.28, 1);
        this.wantSpeed = want;
        turn = clamp(err * 2.4, -1, 1) * this._maxTurn();
      }
    }
    if (this.rear.active) { want = 0; turn = 0; }

    const accel = want > this.speed ? 2.6 + this.speed * 0.25 : 3.4;
    const dv = clamp(want - this.speed, -accel * dt, accel * dt);
    this.speed = Math.max(0, this.speed + dv);
    this.accel += (dv / Math.max(dt, 1e-4) - this.accel) * (1 - Math.exp(-dt * 12));
    this.turnRate += (turn - this.turnRate) * (1 - Math.exp(-dt * 5));
    if (Math.abs(this.turnRate) < 1e-4) this.turnRate = 0;
  }

  _maxTurn() {
    // tight on the spot, wide at speed (keeps the lean believable)
    return Math.min(1.05, 4.2 / (1.2 + this.speed));
  }

  // -------------------------------------------------------------- gaits ---

  _blendGait(dt) {
    let i = GAIT_ORDER.indexOf(this.gait);
    while (i < 3 && this.speed > SHIFT_UP[i]) i++;
    while (i > 0 && this.speed < SHIFT_DOWN[i - 1]) i--;
    this.gait = GAIT_ORDER[i];
    const g = GAITS[this.gait];
    const k = 1 - Math.exp(-dt * 7);
    const pace = this.speed / g.speed;
    for (const key of SCALARS) {
      let target = g[key];
      if (key === 'freq') target *= clamp(0.62 + 0.38 * pace, 0.55, 1.25);
      if (key === 'duty') target = clamp(target + (1 - pace) * 0.14, 0.2, 0.8);
      if (key === 'liftF' || key === 'liftH' || key === 'knee' || key === 'curl') target *= clamp(0.55 + 0.45 * pace, 0.5, 1.15);
      this.p[key] += (target - this.p[key]) * k;
    }
    for (const key of LEG_KEYS) {
      this.ph[key] = frac(this.ph[key] + wrapHalf(g.phase[key] - this.ph[key]) * k);
    }
  }

  // --------------------------------------------------------------- feet ---

  _landingSpot(foot, timeLeft, out) {
    const p = this.p;
    const stanceTime = p.duty / p.freq;
    const h = this.heading + this.turnRate * timeLeft;
    const c = Math.cos(h), s = Math.sin(h);
    const bias = (foot.fore ? p.biasF : p.biasH) * this.move;
    const mx = foot.restToe.x + bias;
    const mz = foot.restToe.z * lerp(1, p.track, this.move);
    // where the body will be when the hoof comes down, allowing for the
    // speed she is gaining or losing
    const a = this.accel;
    const stopIn = a < -1e-3 ? this.speed / -a : Infinity;
    const t1 = Math.min(timeLeft, stopIn);
    const travel = this.speed * t1 + 0.5 * a * t1 * t1;
    const vLand = Math.max(0, this.speed + a * timeLeft);
    const px = this.position.x + Math.cos(this.heading) * travel;
    const pz = this.position.z - Math.sin(this.heading) * travel;
    // the hoof lands ahead of its neutral spot by half of what the body will
    // cover while it is down (forward motion plus turning)
    const lead = stanceTime * 0.5;
    const t2 = Math.min(lead, a < -1e-3 ? vLand / -a : Infinity);
    const ahead = Math.max(0, vLand * t2 + 0.5 * a * t2 * t2);
    const vx = ahead * c + this.turnRate * lead * (-mx * s + mz * c);
    const vz = -ahead * s - this.turnRate * lead * (mx * c + mz * s);
    out.set(px + mx * c + mz * s + vx, 0, pz - mx * s + mz * c + vz);
    return h;
  }

  _updateFeet(dt) {
    const p = this.p;
    const swingTime = (1 - p.duty) / p.freq;
    const square = !this.running;
    for (const key of LEG_KEYS) {
      const f = this.feet[key];
      const phi = frac(this.clock - this.ph[key]);
      const wantDown = phi < p.duty;
      if (f.down) {
        f.downTime += dt;
        f.stance = this.running ? (wantDown ? phi / p.duty : 1) : 0.5;
        const due = !wantDown && f.downTime > 0.07;
        if (this.running && (due || f.overreach) && !this.rear.active) {
          // lift off: on time, or early because the leg has run out of reach
          f.down = false;
          f.swing = 0;
          f.swingTime = due ? Math.max(swingTime * 0.5, (1 - phi) / p.freq) : swingTime;
          f.overreach = false;
          f.from.copy(f.plant);
          f.liftPitch = f.pitch;
        }
      } else {
        f.swing += dt / f.swingTime;
        if (f.swing >= 1) {
          // touch down
          f.down = true;
          f.downTime = 0;
          f.plantYaw = this._landingSpot(f, 0, f.plant);
          this._keepInReach(f);
          f.stance = 0;
          this.onFootfall?.(key, f.plant, this.speed);
        }
      }
      f.load = f.down && !square ? Math.sin(Math.PI * clamp(f.stance, 0, 1)) : 0;
    }
  }

  /** Shortens a step that would put the hoof down further than the leg can reach. */
  _keepInReach(f) {
    const leg = f.leg;
    const top = this.rig.carry(f.fore ? 'chest' : 'pelvis', leg.top, _v);
    const tx = top.x, tz = top.z;
    for (let i = 0; i < 5; i++) {
      this.toModel(f.plant, _toe);
      _toe.y = 0;
      leg.yaw = wrapPi(f.plantYaw - this.heading);
      leg.pasternRot = -0.05 * this.move;
      leg.flex = 0;
      leg._setCoffinFromToe(_toe, 0);
      const gap = leg._gap() + 0.008; // land comfortably inside the leg's reach
      if (gap <= 0) return;
      const dx = _toe.x - tx, dz = _toe.z - tz;
      const len = Math.hypot(dx, dz) || 1;
      const pull = gap * 1.6 + 0.01;
      _toe.x -= (dx / len) * pull;
      _toe.z -= (dz / len) * pull;
      this.toWorld(_toe, f.plant);
    }
  }

  /** True when every hoof is down and standing square under the body. */
  _isSquare() {
    for (const key of LEG_KEYS) {
      const f = this.feet[key];
      if (!f.down) return false;
      this.toModel(f.plant, _v);
      if (Math.hypot(_v.x - f.restToe.x, _v.z - f.restToe.z) > 0.045) return false;
      if (Math.abs(wrapPi(f.plantYaw - this.heading)) > 0.12) return false;
    }
    return true;
  }

  // --------------------------------------------------------------- update ---

  update(dt) {
    const rig = this.rig;
    this._drive(dt);
    this.heading += this.turnRate * dt;
    this.position.x += Math.cos(this.heading) * this.speed * dt;
    this.position.z -= Math.sin(this.heading) * this.speed * dt;

    const moving = this.speed > 0.03 || Math.abs(this.turnRate) > 0.04;
    if (moving) this.running = true;
    else if (this.running && this._isSquare()) this.running = false;
    this.move += ((moving ? 1 : 0) - this.move) * (1 - Math.exp(-dt * 6));

    this._blendGait(dt);
    const p = this.p;
    if (this.running) {
      this.clock = frac(this.clock + p.freq * dt);
      this.strideTime += dt;
    }
    this._updateFeet(dt);

    // ---- loads on each end of the trunk -----------------------------------
    const feet = this.feet;
    const fore = feet.FL.load + feet.FR.load;
    const hind = feet.HL.load + feet.HR.load;
    const mean = 4 * p.duty / Math.PI;
    const sign = lerp(1, -1, p.spring);         // vault over the leg at a walk, sink on it when running
    const amp = p.bounce * this.move;
    const yFore = sign * amp * (fore - mean);
    const yHind = sign * amp * (hind - mean);
    const left = feet.FL.load + feet.HL.load;
    const right = feet.FR.load + feet.HR.load;

    const rear = this._rear(dt);

    const b = this.body;
    const kb = 1 - Math.exp(-dt * 22);
    const targetY = (yFore + yHind) * 0.5 - p.crouch * this.move;
    const targetPitch = Math.atan2(yFore - yHind, 1.25) * 1.0;
    const targetRoll = 0.022 * (left - right) * this.move * (1 - p.spring * 0.5);
    b.y += (targetY - b.y) * kb;
    b.pitch += (targetPitch - b.pitch) * kb;
    b.roll += (targetRoll - b.roll) * kb;
    const lean = -Math.atan(this.speed * this.turnRate / G) * 0.75;
    b.lean += (lean - b.lean) * (1 - Math.exp(-dt * 5));

    // hips and shoulders swing with the legs
    const hlx = feet.HL.toe.x, hrx = feet.HR.toe.x, flx = feet.FL.toe.x, frx = feet.FR.toe.x;
    const pelvisYaw = -p.sway * (hlx - hrx) * this.move;
    const chestYaw = -p.sway * 0.55 * (flx - frx) * this.move;
    // the loins flex as the hind legs gather under the body
    const gather = ((hlx - feet.HL.restToe.x) + (hrx - feet.HR.restToe.x)) * 0.5;
    const tuck = clamp(p.tuck * gather * 0.42, -0.12, 0.32) * this.move;

    // ---- trunk ---------------------------------------------------------------
    const graze = this.horse.graze;
    const chew = graze * 0.035 * Math.sin(this.horse._life.time * 7.5);
    const pitch = b.pitch + rear.pitch - 0.05 * graze;
    _qy.setFromAxisAngle(Y, chestYaw);
    _qz.setFromAxisAngle(Z, pitch);
    _qx.setFromAxisAngle(X, b.roll + b.lean);
    rig.bodyQuat.copy(_qy).multiply(_qz).multiply(_qx);
    // rearing pivots about the hips rather than the middle of the body
    const cx = -0.55 - rig.bodyPivot.x, cy = 1.2 - rig.bodyPivot.y;
    const cr = Math.cos(rear.pitch), sr = Math.sin(rear.pitch);
    rig.bodyOffset.set(
      cx - (cx * cr - cy * sr),
      b.y + rear.drop - 0.03 * graze + cy - (cx * sr + cy * cr),
      0.012 * (right - left) * this.move * (1 - p.spring),
    );

    const turnBend = clamp(this.turnRate * 0.16, -0.22, 0.22);
    rig.setLocal('loin', 0, (pelvisYaw - chestYaw) * 0.45 - turnBend * 0.4, tuck * 0.4 + rear.loin);
    rig.setLocal('pelvis', 0, (pelvisYaw - chestYaw) * 0.55 - turnBend * 0.4, tuck * 0.6 + rear.loin);

    // ---- neck and head ------------------------------------------------------
    const c2 = Math.cos(4 * Math.PI * (this.clock - this.ph.FL - 0.06));
    const c1 = Math.cos(2 * Math.PI * (this.clock - 0.13));
    const nod = (-p.nod2 * c2 + p.nod1 * c1) * this.move;
    const base = p.neckBase * this.move + rear.neck;
    const neckYaw = -chestYaw * 0.7 + turnBend * 0.9;
    const look = this.horse.look;
    const ny = neckYaw + look.yaw, np = base + nod + look.pitch;
    // grazing folds the neck down from its base until the lips reach the grass
    rig.setLocal('neck1', 0, ny * 0.3, np * 0.34 - pitch * 0.35 - 1.25 * graze);
    rig.setLocal('neck2', 0, ny * 0.25, np * 0.3 - pitch * 0.2 - 0.5 * graze);
    rig.setLocal('neck3', 0, ny * 0.22, np * 0.22 - 0.25 * graze);
    rig.setLocal('neck4', 0, ny * 0.13, np * 0.14 - 0.1 * graze);
    rig.setLocal('head', look.tilt, ny * 0.1 + look.headYaw, -np * 0.55 - nod * 0.4 + look.headPitch + rear.head + 1.69 * graze + chew);

    // ---- tail ---------------------------------------------------------------
    const swish = this.horse.tailSwish;
    const lift = p.tail * this.move + rear.tail;
    rig.setLocal('tail1', 0, swish * 0.5 + this.turnRate * 0.06, -lift * 0.6);
    rig.setLocal('tail2', 0, swish * 0.5, -lift * 0.3);
    rig.setLocal('tail3', 0, swish * 0.4, -lift * 0.1);
    rig.setLocal('tail4', 0, swish * 0.3, lift * 0.1);

    rig.solveChain();

    // ---- legs ---------------------------------------------------------------
    for (const key of LEG_KEYS) {
      const f = feet[key];
      const leg = f.leg;
      if (rear.amount > 0.02 && f.fore) {
        this._pawing(f, rear);
        continue;
      }
      if (f.down) {
        this.toModel(f.plant, _toe);
        _toe.y = 0;
        leg.yaw = wrapPi(f.plantYaw - this.heading);
        const st = f.stance;
        // the fetlock sinks under load; the heel peels off before the toe
        leg.pasternRot = (p.sink * Math.sin(Math.PI * st) - 0.05 * (1 - smooth(0, 0.2, st))) * this.move;
        leg.flex = 0;
        leg.scapula = 0;
        const heel = 0.5 * Math.pow(smooth(0.74, 1, st), 1.4) * this.move;
        f.pitch = leg.plant(_toe, heel);
        // a leg that can no longer hold its hoof where it stands must pick it up
        // (a heel forced well past its normal peel means the limit is a stride away)
        f.overreach = f.downTime > 0.05 && (f.pitch > 0.8 || leg._gap() > 0.002)
          && Math.hypot(_toe.x - f.restToe.x, _toe.z - f.restToe.z) > 0.12;
        f.toe.copy(_toe);
      } else {
        const s = clamp(f.swing, 0, 1);
        const timeLeft = (1 - s) * f.swingTime;
        const yaw = this._landingSpot(f, timeLeft, f.to);
        // glide: slow away, quick through the middle, settle before landing
        const e = s * s * s * (s * (6 * s - 15) + 10);
        _v.lerpVectors(f.from, f.to, e);
        const liftH = (f.fore ? p.liftF : p.liftH) * lerp(0.6, 1, this.move);
        const arc = Math.pow(Math.sin(Math.PI * Math.pow(s, f.fore ? 0.9 : 0.8)), 1.1);
        _v.y = liftH * arc;
        this.toModel(_v, _toe);
        const curl = p.curl * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.62)), 1.6);
        const settle = -0.1 * Math.sin(Math.PI * smooth(0.7, 1, s));
        f.pitch = f.liftPitch * (1 - smooth(0, 0.8, s)) + curl + settle;
        leg.yaw = wrapPi(lerp(wrapPi(f.plantYaw - this.heading), wrapPi(yaw - this.heading), smooth(0, 0.5, s)));
        leg.pasternRot = -0.25 * Math.sin(Math.PI * s) - 0.05 * smooth(0.8, 1, s) * this.move;
        const fold = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.75)), 1.3);
        leg.flex = (f.fore ? p.knee : p.hock) * fold;
        leg.scapula = 0;
        leg._setCoffinFromToe(_toe, f.pitch);
        f.toe.copy(_toe);
      }
    }
    rig.solveLegs();

    const root = this.horse.root;
    root.position.copy(this.position);
    root.rotation.set(0, this.heading, 0);
  }

  // ---------------------------------------------------------------- rear ---

  _rear(dt) {
    const r = this.rear;
    const out = this._rearOut || (this._rearOut = { pitch: 0, drop: 0, loin: 0, neck: 0, head: 0, tail: 0, amount: 0, paw: 0 });
    if (!r.active) {
      out.pitch = out.drop = out.loin = out.neck = out.head = out.tail = out.amount = 0;
      return out;
    }
    r.t += dt;
    const T = 3.1;
    const t = r.t / T;
    // gather, rise, hold and paw, come down
    const up = smooth(0.06, 0.34, t) * (1 - smooth(0.66, 0.96, t));
    const crouch = Math.sin(Math.PI * smooth(0, 0.2, t)) * 0.5 + up * 0.5;
    out.amount = up;
    out.pitch = up * 0.98;
    out.drop = -0.07 * crouch;
    out.loin = up * 0.1;
    out.neck = -up * 0.35;
    out.head = up * 0.25;
    out.tail = up * 0.5;
    out.paw = r.t;
    if (t >= 1) {
      r.active = false;
      // the forefeet come back down where they belong
      for (const key of ['FL', 'FR']) {
        const f = this.feet[key];
        f.down = true;
        f.downTime = 0;
        _v.copy(f.restToe);
        this.toWorld(_v, f.plant);
        f.plantYaw = this.heading;
        this.onFootfall?.(key, f.plant, 3);
      }
    }
    return out;
  }

  /** Forelegs while rearing: folded under the chest and striking out. */
  _pawing(f, rear) {
    const rig = this.rig;
    const leg = f.leg;
    const a = rear.amount;
    const beat = Math.sin(rear.paw * 7.5 + (f.side > 0 ? 0 : 2.1));
    // target for the hoof, described in the chest's own frame
    _v.set(leg.coffinRest.x + 0.2 + 0.1 * beat, leg.coffinRest.y + 0.48 + 0.07 * beat, leg.coffinRest.z * 0.9);
    rig.carry('chest', _v, _toe);
    // blend from the planted rest position into the folded one
    _v.copy(leg.coffinRest);
    leg.coffin.lerpVectors(_v, _toe, smooth(0, 0.5, a));
    leg.pitch = 1.25 * smooth(0.05, 0.5, a) + 0.3 * beat * a;
    leg.yaw = 0;
    leg.pasternRot = -0.25 * a;
    leg.flex = 1.55 * smooth(0.05, 0.6, a) + 0.25 * beat * a;
    leg.scapula = 0;
    f.down = false;
    f.swing = 0.5;
    f.swingTime = 1e6;
    f.load = 0;
    f.pitch = leg.pitch;
  }
}

function pick(g) {
  const out = {};
  for (const key of SCALARS) out[key] = g[key];
  return out;
}
