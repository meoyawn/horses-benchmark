// Trunk, neck, head, ears, eyelids and breathing. Legs and tail are handled elsewhere.
import * as THREE from 'three';

const TRUNK = ['pelvis', 'spine1', 'spine2', 'chest', 'neck1', 'neck2', 'neck3', 'head'];
const SPAN = 1.08; // hip joints -> shoulder blades, along the back
const REAR_PITCH = 1.08; // how far the trunk tips up in a full rear (rad)
const rand = (a, b) => a + Math.random() * (b - a);

/** Orientation of a bone in horse space (bones have no rest rotation, so this is just the chain product). */
export function horseQuat(bone, root, out) {
  out.identity();
  for (let b = bone; b && b !== root; b = b.parent) out.premultiply(b.quaternion);
  return out;
}

export function newSignals() {
  return {
    heaveH: 0, heaveF: 0, // vertical offset of hindquarters / forehand
    lean: 0, bend: 0, sway: 0, hipRoll: 0, tuck: 0,
    neck: 0, nod: 0, headNod: 0, lookYaw: 0, lookPitch: 0,
    graze: 0, rear: 0, pin: 0, alert: 0, exert: 0,
  };
}

export class Body {
  constructor(horse) {
    this.horse = horse;
    for (const n of TRUNK) horse.bones[n].rotation.order = 'YXZ';
    this.pitch = 0;
    this.effort = 0;
    this.breath = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.blinkIn = 2;
    this.blink = -1;
    this.ears = [{ wait: 3, t: -1, to: 0 }, { wait: 5, t: -1, to: 0 }];
  }

  pose(dt, s) {
    const B = this.horse.bones, R = this.horse.rest;
    const rear = s.rear;
    const slope = (s.heaveF - s.heaveH) / SPAN;
    const trunk = Math.atan(slope);
    this.pitch = trunk + REAR_PITCH * rear;

    // ---- Trunk -----------------------------------------------------------
    B.pelvis.position.set(
      R.pelvis.x - 0.22 * rear,
      // (leaning into a turn also sinks the body a little, so the outer legs can still reach)
      R.pelvis.y * Math.cos(s.lean) - 0.13 * Math.abs(Math.sin(s.lean)) + s.heaveH + slope * 0.14 - 0.18 * rear,
      R.pelvis.y * Math.sin(s.lean) + s.sway
    );
    B.pelvis.rotation.set(s.lean + s.hipRoll, -0.3 * s.bend, this.pitch + s.tuck);
    B.spine1.rotation.set(-s.hipRoll, 0.43 * s.bend, -0.6 * s.tuck);
    B.spine2.rotation.set(0, 0.43 * s.bend, -0.4 * s.tuck);
    B.chest.rotation.set(0, 0.44 * s.bend, 0);

    // Breathing: the ribcage widens. Harder and faster after exertion.
    this.effort += (s.exert - this.effort) * (1 - Math.exp(-dt * (s.exert > this.effort ? 0.5 : 0.1)));
    this.breath += dt * (0.24 + 1.3 * this.effort) * Math.PI * 2;
    const br = (0.012 + 0.02 * this.effort) * (0.5 + 0.5 * Math.sin(this.breath));
    B.spine2.scale.set(1, 1 + br * 0.5, 1 + br);
    B.chest.scale.set(1, 1 / (1 + br * 0.5), 1 / (1 + br));

    // ---- Neck and head -----------------------------------------------------
    const k = 1 - Math.exp(-dt * 5);
    this.lookYaw += (s.lookYaw - this.lookYaw) * k;
    this.lookPitch += (s.lookPitch - this.lookPitch) * k;
    const gz = s.graze, free = 1 - gz;
    // Total up/down swing of the neck. It partly cancels the trunk's pitching so the head stays steady.
    const down = (s.neck + s.nod - 0.55 * trunk + this.lookPitch) * free - 0.5 * rear;
    const yaw = this.lookYaw * free + 0.5 * s.bend;
    B.neck1.rotation.set(0, 0.24 * yaw, 0.42 * down - 1.66 * gz);
    B.neck2.rotation.set(0, 0.24 * yaw, 0.33 * down - 0.52 * gz);
    B.neck3.rotation.set(0, 0.22 * yaw, 0.25 * down - 0.17 * gz);
    B.head.rotation.set(0, 0.3 * yaw, -0.45 * down + 1.78 * gz + s.headNod);

    // ---- Ears: pinned back when working hard, pricked when alert, flicking now and then ----
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, e = this.ears[i], bone = B[i ? 'earR' : 'earL'];
      e.wait -= dt;
      if (e.wait < 0) {
        e.wait = rand(2.5, 7);
        e.t = 0;
        e.to = rand(-0.4, 0.9);
      }
      let flick = 0;
      if (e.t >= 0) {
        e.t += dt / 0.55;
        if (e.t >= 1) e.t = -1;
        else flick = Math.sin(Math.PI * e.t) * (1 - s.pin);
      }
      bone.rotation.set(
        side * (0.3 * s.pin + 0.08 * flick),
        -side * (0.75 * s.pin + e.to * flick) + 0.35 * this.lookYaw * free,
        0.8 * s.pin - 0.16 * s.alert + 0.12 * flick
      );
    }

    // ---- Blinking ------------------------------------------------------------
    this.blinkIn -= dt;
    if (this.blinkIn < 0) {
      this.blinkIn = rand(2.5, 6.5);
      this.blink = 0;
    }
    let lid = 0.1 * gz;
    if (this.blink >= 0) {
      this.blink += dt / 0.22;
      if (this.blink >= 1) this.blink = -1;
      else lid = Math.max(lid, Math.sin(Math.PI * this.blink));
    }
    this.horse.parts.setBlink(lid);
  }
}
