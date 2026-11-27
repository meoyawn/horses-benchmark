// Locomotion: gait timing, foot planting and the overall motion of the horse.
// Hooves are planted at fixed points in the world while they carry weight, so
// they never slide; the body travels over them and the legs follow by IK.
import * as THREE from 'three';
import { Leg, TOE, HEEL, HOOF_H, rot2 } from './legs.js';
import { LEG_Z } from './anatomy.js';
import { Body, horseQuat, newSignals } from './body.js';
import { TailSim } from './tail.js';
import { GAIT_NAMES, mixGait } from './gaits.js';

export { GAIT_NAMES };

const ORDER = [['L', false], ['L', true], ['R', false], ['R', true]];
const TURN_RADIUS = [0.8, 1.8, 3.2, 7, 15]; // tightest circle per gait (m)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapTurn = (x) => x - Math.round(x);
const wrapPi = (x) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
const rand = (a, b) => a + Math.random() * (b - a);
const V = new THREE.Vector3(), W = new THREE.Vector3(), base = new THREE.Vector3();
const q = new THREE.Quaternion(), rootInv = new THREE.Matrix4();

export class Locomotion {
  constructor(horse) {
    this.horse = horse;
    this.position = new THREE.Vector3();
    this.focus = new THREE.Vector3(0, 1.12, 0); // what the camera should watch
    this.heading = 0; // forward is (cos, 0, -sin)
    this.cs = 1;
    this.sn = 0;
    this.speed = 0;
    this.yawRate = 0;
    this.steer = 0; // -1 left .. +1 right, from the keyboard
    this.g = 0; // continuous gait: 0 standing .. 4 gallop
    this.gaitIndex = 0; // the gait we are heading for
    this.phase = 0;
    this.lead = 1;
    this.leadWait = 0;
    this.p = mixGait(0, 1, { off: [0, 0, 0, 0] });
    this.destination = null;
    this.pivot = false;
    this.grazing = false;
    this.grazeAmt = 0;
    this.rearT = -1;
    this.petT = -1;
    this.swishT = -1;
    this.swishIn = 5;
    this.time = 0;
    this.look = new THREE.Vector3(3, 1.6, 2);
    this.lookAge = 99;
    this.flow = new THREE.Vector3();
    this.sig = newSignals();
    this.body = new Body(horse);
    this.tail = new TailSim(horse);
    this.legs = ORDER.map(([side, front], index) => {
      const leg = new Leg(horse, side, front);
      const phase = this.p.off[index], stance = phase < this.p.duty;
      return Object.assign(leg, {
        index, phase, stance, skip: !stance, sp: 0, sw: 0, step: 0, over: 0,
        plant: new THREE.Vector3(leg.restHoof.x + TOE[0], 0, leg.restHoof.z), // toe on the ground (world)
        c: new THREE.Vector3(leg.restHoof.x, HOOF_H, leg.restHoof.z), // coffin joint (world)
        from: new THREE.Vector3(), pitch: 0, pas: 0, knee: 0, fromPitch: 0, fromPas: 0, fromYaw: 0, plantHeading: 0,
      });
    });
  }

  get currentGait() { return clamp(Math.round(this.g), 0, 4); }
  get hasDestination() { return !!this.destination; }

  setGait(i) {
    this.gaitIndex = i;
    this.destination = null;
    this.pivot = false;
    if (i > 0) this.grazing = false;
  }
  goTo(point) {
    this.destination = point.clone().setY(0);
    this.grazing = false;
  }
  rear() {
    if (this.rearT >= 0 || this.g > 1.3) return;
    this.rearT = 0;
    this.setGait(0);
    this.grazing = false;
  }
  toggleGraze() {
    this.grazing = !this.grazing;
    if (this.grazing) this.setGait(0);
  }
  pet() { if (this.petT < 0) this.petT = 0; }
  lookAt(point) {
    this.look.copy(point);
    this.lookAge = 0;
  }

  _toLocal(w, out) {
    const dx = w.x - this.position.x, dz = w.z - this.position.z;
    return out.set(dx * this.cs - dz * this.sn, w.y, dx * this.sn + dz * this.cs);
  }

  /** Where a hoof should land (toe, world) if it comes down `t` seconds from now. */
  _landing(leg, p, t, out) {
    const mid = this.heading + this.yawRate * t * 0.5, psi = this.heading + this.yawRate * t;
    const sf = Math.min(1, this.speed / 1.2);
    const nx = leg.restHoof.x + TOE[0] + (leg.front ? -0.08 : 0.03) * sf, nz = leg.sign * (LEG_Z - p.narrow * sf);
    // Land half a stance ahead of the neutral spot, along the path the ground takes under a turning body.
    const half = 0.5 * p.duty * p.period * this.yawRate;
    const x = nx + 0.5 * p.stance + half * nz, z = nz - half * nx;
    const bx = this.position.x + Math.cos(mid) * this.speed * t, bz = this.position.z - Math.sin(mid) * this.speed * t;
    const c = Math.cos(psi), s = Math.sin(psi);
    return out.set(bx + x * c + z * s, 0, bz - x * s + z * c);
  }

  _liftoff(leg, p) {
    leg.from.copy(leg.c);
    leg.fromPitch = leg.pitch;
    leg.fromPas = leg.pas;
    leg.fromYaw = leg.yaw;
    this._landing(leg, p, (1 - p.duty) * p.period, V);
    const d = Math.hypot(V.x - leg.plant.x, V.z - leg.plant.z);
    leg.skip = d < 0.03 && Math.abs(leg.yaw) < 0.12; // already where it should be: no need to step
    leg.step = smooth(0.03, 0.35, d);
  }

  _touchdown(leg, p) {
    if (leg.skip) leg.skip = false;
    else {
      this._landing(leg, p, 0, leg.plant);
      leg.plantHeading = this.heading;
    }
  }

  /** Hoof path through the air: where the coffin joint is, and how the hoof is curled. */
  _swing(leg, p) {
    const s = leg.sw, e = s * s * (3 - 2 * s), k = leg.step;
    this._landing(leg, p, (1 - s) * (1 - p.duty) * p.period, V);
    const curl = Math.sin(Math.PI * Math.pow(s, 0.7)); // flexion peaks early in the swing
    leg.pitch = leg.fromPitch * (1 - e) - p.flex * (leg.front ? 1 : 0.8) * k * curl;
    leg.pas = leg.fromPas * (1 - e) - 0.5 * p.flex * k * curl;
    leg.knee = leg.front ? p.knee * k * Math.sin(Math.PI * Math.pow(s, 0.75)) ** 1.6 : 0;
    leg.yaw = leg.fromYaw * (1 - e);
    const lift = (leg.front ? p.liftF : p.liftH) * k * Math.sin(Math.PI * Math.pow(s, 0.85));
    const lowest = Math.min(rot2(TOE, leg.pitch)[1], rot2(HEEL, leg.pitch)[1]);
    const y = Math.max(HOOF_H + (leg.from.y - HOOF_H) * (1 - e) + lift, -lowest); // toe and heel stay above ground
    // Ease between the two ground points, but let the hoof be carried along with the body at
    // speed — otherwise it would trail far behind after lift-off and overshoot before landing.
    const air = (1 - p.duty) * p.period * this.speed;
    const carry = (1 - Math.min(1, (0.8 * p.stance) / (air + 1e-6))) * air * (s - e);
    leg.c.set(
      lerp(leg.from.x, V.x - TOE[0] * this.cs, e) + carry * this.cs,
      y,
      lerp(leg.from.z, V.z + TOE[0] * this.sn, e) - carry * this.sn
    );
  }

  update(dt) {
    if (!(dt > 0)) return;
    this.time += dt;
    const s = this.sig, root = this.horse.root, time = this.time;

    // ---- Intent: where to go and how fast ----------------------------------------
    let turn = -this.steer;
    if (this.destination) {
      const dx = this.destination.x - this.position.x, dz = this.destination.z - this.position.z;
      const dist = Math.hypot(dx, dz), err = wrapPi(Math.atan2(-dz, dx) - this.heading);
      // Too close to reach in an arc: stop and pivot on the spot first.
      this.pivot = dist < 3.5 && Math.abs(err) > (this.pivot ? 0.25 : 0.9);
      this.gaitIndex = this.pivot ? 0 : dist > 14 ? 3 : dist > 5 ? 2 : 1;
      turn = clamp(err * 2.5, -1, 1);
      if (dist < 0.9) {
        this.destination = null;
        this.pivot = false;
        this.gaitIndex = 0;
      }
    }
    if (this.rearT >= 0 || this.grazing) {
      this.gaitIndex = 0;
      turn = 0;
    }
    this.g += clamp(this.gaitIndex - this.g, -1.5 * dt, 1.0 * dt);
    const gi = Math.min(3, Math.floor(this.g));
    const radius = lerp(TURN_RADIUS[gi], TURN_RADIUS[gi + 1], this.g - gi);
    const maxTurn = Math.min(1.5, Math.max(this.speed, 0.65) / radius);
    this.yawRate += (turn * maxTurn - this.yawRate) * (1 - Math.exp(-dt * 4));

    // Canter and gallop lead with the inside foreleg: change lead when the turn reverses.
    this.leadWait -= dt;
    const lead = this.yawRate > 0.2 ? -1 : this.yawRate < -0.2 ? 1 : this.lead;
    if (lead !== this.lead && this.leadWait < 0) {
      this.lead = lead;
      this.phase = (this.phase + 0.5) % 1;
      this.leadWait = 1.5;
    }
    const p = mixGait(this.g, this.lead, this.p);

    // ---- Travel ---------------------------------------------------------------------
    this.speed = p.speed;
    this.heading += this.yawRate * dt;
    const cs = (this.cs = Math.cos(this.heading)), sn = (this.sn = Math.sin(this.heading));
    this.position.x += cs * this.speed * dt;
    this.position.z -= sn * this.speed * dt;
    root.position.copy(this.position);
    root.rotation.y = this.heading;
    const sf = Math.min(1, this.speed / 1.2);

    // ---- Leg cycles: each leg is an oscillator that locks onto the gait's rhythm ----
    const rate = dt / p.period;
    this.phase = (this.phase + rate) % 1;
    let sH = 0, sF = 0, tuck = 0, hip = 0;
    for (const leg of this.legs) {
      const err = wrapTurn(this.phase + p.off[leg.index] - leg.phase);
      leg.phase = (leg.phase + rate * clamp(1 + 4 * err, 0.35, 2.2)) % 1;
      const down = leg.phase < p.duty;
      if (down && !leg.stance) this._touchdown(leg, p);
      else if (!down && leg.stance) this._liftoff(leg, p);
      leg.stance = down;
      if (down) leg.sp = leg.phase / p.duty;
      else leg.sw = (leg.phase - p.duty) / (1 - p.duty);
      const w = down ? Math.sin(Math.PI * leg.sp) ** 2 : 0; // how much weight it carries
      if (leg.front) sF += w;
      else {
        sH += w;
        hip -= leg.sign * w;
        tuck += 0.5 * Math.cos(2 * Math.PI * (leg.phase + 0.04));
      }
    }

    // ---- Actions ----------------------------------------------------------------------
    let rear = 0;
    if (this.rearT >= 0) {
      if (this.g < 0.25) this.rearT += dt; // come to a halt first
      rear = smooth(0, 0.9, this.rearT) * (1 - smooth(1.9, 2.8, this.rearT));
      if (this.rearT > 2.9) this.rearT = -1;
    }
    let pet = 0;
    if (this.petT >= 0) {
      this.petT += dt / 1.6;
      if (this.petT >= 1) this.petT = -1;
      else pet = Math.sin(Math.PI * this.petT);
      if (this.petT > 0.15 && this.swishT < 0 && this.petT < 0.2) this.swishT = 0;
    }
    this.grazeAmt = clamp(this.grazeAmt + (this.grazing && this.g < 0.3 ? 0.7 : -1.1) * dt, 0, 1);
    const graze = smooth(0, 1, this.grazeAmt);

    // ---- Body signals -------------------------------------------------------------------
    s.heaveH = (p.bob * (sH - p.duty) - p.drop) * sf;
    s.heaveF = (p.bob * (sF - p.duty) - p.drop) * sf;
    s.tuck = p.tuck * tuck;
    s.hipRoll = 0.035 * hip * sf * (1 - 0.6 * smooth(1, 3, this.g));
    s.lean = clamp((-this.speed * this.yawRate * 0.75) / 9.81, -0.26, 0.26);
    s.bend = clamp(this.yawRate * 0.3, -0.35, 0.35);
    s.sway = 0.008 * Math.sin(time * 0.5) * (1 - sf);
    const leadFore = this.legs[this.lead > 0 ? 3 : 1].phase;
    s.nod = (-p.nod2 * Math.cos(4 * Math.PI * (this.legs[1].phase - 0.1)) - p.nod1 * Math.cos(2 * Math.PI * (leadFore - 0.5 * p.duty))) * sf;
    s.neck = p.neck + 0.03 * Math.sin(time * 0.37) * (1 - sf);
    s.headNod = -0.2 * pet * Math.sin(this.petT * Math.PI * 4) + graze * 0.035 * Math.sin(time * 9) * Math.max(0, Math.sin(time * 1.3));
    s.graze = graze;
    s.rear = rear;
    s.pin = clamp(p.pin + 0.7 * rear - 0.5 * pet, 0, 1);
    s.alert = clamp(pet + (this.lookAge < 2 ? 0.6 : 0), 0, 1);
    s.exert = this.g / 4;
    this.lookAge += dt;
    const attend = (1 - smooth(0.6, 2.2, this.g)) * (1 - smooth(6, 9, this.lookAge)) * (1 - rear);
    this._toLocal(this.look, V);
    s.lookYaw = clamp(Math.atan2(-V.z, V.x - 0.6), -1.1, 1.1) * attend * 0.8;
    s.lookPitch = clamp(Math.atan2(V.y - 1.8, Math.hypot(V.x - 0.6, V.z)), -0.35, 0.3) * attend * 0.6;

    this.body.pose(dt, s);
    root.updateMatrixWorld(true);
    rootInv.copy(root.matrixWorld).invert();

    // ---- Legs ------------------------------------------------------------------------------
    const trunkPitch = this.body.pitch;
    for (const leg of this.legs) {
      base.copy(leg.bones[0].position).applyMatrix4(leg.parent.matrixWorld).applyMatrix4(rootInv);
      horseQuat(leg.parent, root, q);
      const scap = leg.front ? trunkPitch : 0;
      const air = leg.front ? smooth(0.08, 0.5, rear) : 0; // forelegs leave the ground in a rear
      const planted = leg.stance || leg.skip;
      if (planted && air === 0) {
        this._toLocal(leg.plant, V);
        leg.yaw = wrapPi(leg.plantHeading - this.heading);
        const load = leg.skip ? 0 : Math.sin(Math.PI * leg.sp) * sf;
        const sink = p.sink * (leg.front ? 1 : 0.8) * load;
        leg.over = leg.solveStance(base, q, V, sink, scap);
        leg.pitch = leg.heel;
        leg.pas = sink + 0.6 * leg.heel;
        leg.knee = 0;
        const t = rot2(TOE, leg.heel);
        leg.c.set(leg.plant.x - t[0] * Math.cos(leg.plantHeading), -t[1], leg.plant.z + t[0] * Math.sin(leg.plantHeading));
        if (leg.stance && (leg.heel < -0.95 || leg.over > 0.02) && V.x < base.x) leg.phase = p.duty; // out of reach: pick it up
        continue;
      }
      if (planted) {
        leg.c.set(leg.plant.x - TOE[0] * Math.cos(leg.plantHeading), HOOF_H, leg.plant.z + TOE[0] * Math.sin(leg.plantHeading));
        leg.pitch = leg.pas = leg.knee = 0;
        leg.yaw = wrapPi(leg.plantHeading - this.heading);
      } else this._swing(leg, p);
      this._toLocal(leg.c, V);
      let pitch = leg.pitch, pas = leg.pas, knee = leg.knee;
      if (air > 0) {
        // Folded under the chest, pawing a little.
        const paw = Math.sin(time * 6 + (leg.sign > 0 ? 0 : 2.3));
        const o = rot2([0.12 + 0.09 * paw, -1.1 + 0.05 * Math.cos(time * 6 + leg.sign)], trunkPitch);
        V.lerp(W.set(base.x + o[0], base.y + o[1], base.z), air);
        pitch = lerp(pitch, -0.9, air);
        pas = lerp(pas, -0.5, air);
        knee = lerp(knee, 1.9 + 0.3 * paw, air);
      }
      leg.over = leg.solve(base, q, V, pas, pitch, knee, scap);
    }

    // ---- Tail and mane ---------------------------------------------------------------------
    this.swishIn -= dt;
    if (this.swishIn < 0 && this.g < 1.5) {
      this.swishIn = rand(4, 10);
      this.swishT = 0;
    }
    let swish = 0;
    if (this.swishT >= 0) {
      this.swishT += dt / 1.1;
      if (this.swishT >= 1) this.swishT = -1;
      else swish = 0.6 * Math.sin(this.swishT * Math.PI * 4) * Math.sin(Math.PI * this.swishT);
    }
    this.tail.update(dt, p.tail + 0.45 * rear + 0.2 * pet, swish);

    const run = Math.pow(Math.min(1, this.speed / 11.5), 0.8);
    const bounce = Math.sin(2 * Math.PI * this.phase * (this.g > 2.5 ? 1 : 2));
    V.set(-0.15 * run, 0.085 * run + 0.025 * run * bounce, -0.25 * s.lean);
    this.flow.lerp(V, 1 - Math.exp(-dt * 6));
    const u = this.horse.hair.uniforms;
    u.uFlow.value.copy(this.flow);
    u.uWind.value = 1 + 2.5 * run;

    this.focus.set(this.position.x, 1.12 + 0.55 * rear - 0.2 * graze, this.position.z);
  }
}
