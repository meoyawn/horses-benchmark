/**
 * animations.js — Biomechanically accurate procedural equine gait & behavior controller.
 *
 * Joint rotation convention (horse facing +Z, +Y up, +X left):
 *   rx < 0 : swing leg FORWARD (+Z), lift neck/head UP, pitch torso UP (rear), flex HOCK forward
 *   rx > 0 : push leg BACKWARD (-Z), lower neck/head DOWN (graze), flex front KNEE backward, lift TAIL up
 *   ry > 0 : turn head/neck/tail toward horse's LEFT (+X)
 */

import * as THREE from 'three';

const TWO_PI = Math.PI * 2;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Evaluate a single limb's biomechanical angles over normalized stride phase p in [0, 1).
 * Phase 0.0 = hoof touchdown (frontmost contact), sweeps through stance (0 .. duty),
 * then lifts off into swing (duty .. 1.0) with authentic knee/hock & fetlock folding!
 */
function sampleForelegStride(p, cfg) {
  const phase = ((p % 1) + 1) % 1;
  const duty = cfg.duty; // fraction of stride on ground (walk ~0.62, trot ~0.44, gallop ~0.28)

  let shoulderX = 0;
  let forearmX = 0;
  let kneeX = 0;
  let fetlockX = 0;
  let hoofX = 0;
  let onGround = false;

  if (phase < duty) {
    // STANCE PHASE: Hoof planted on ground, limb sweeps cleanly backward beneath chest
    onGround = true;
    const s = phase / duty; // 0 (touchdown) -> 1 (liftoff)
    // Smooth cosine-eased sweep from protraction (-ampFront) to retraction (+ampBack)
    const sweep = lerp(-cfg.protract, cfg.retract, s);
    shoulderX = sweep * 0.78;
    forearmX = sweep * 0.22 - Math.sin(s * Math.PI) * 0.04;
    // Slight knee lock during weight bearing, beginning breakover just before liftoff
    kneeX = smoothstep(0.76, 1.0, s) * cfg.kneeLift * 0.35;
    // Authentic elastic suspensory drop at mid-stance! (fetlock extends slightly under weight)
    fetlockX = -Math.sin(s * Math.PI) * cfg.fetlockDrop + smoothstep(0.80, 1.0, s) * 0.35;
    hoofX = -(shoulderX + forearmX + kneeX + fetlockX) * 0.85; // keeps hoof sole flat on ground!
  } else {
    // SWING PHASE: Lift off, fold knee & fetlock backward, protract forward, extend to touchdown
    const u = (phase - duty) / (1 - duty); // 0 (liftoff) -> 1 (touchdown)
    const swingCurve = 0.5 - 0.5 * Math.cos(u * Math.PI);
    const sweep = lerp(cfg.retract, -cfg.protract, swingCurve);

    // Shoulder lifts forward aggressively during mid-swing
    const liftArc = Math.sin(u * Math.PI);
    shoulderX = sweep * 0.82 - liftArc * cfg.shoulderLift;
    forearmX = sweep * 0.18 + liftArc * cfg.elbowFlex;
    // Crisp backward flexion of front knee (peaking slightly before mid-swing, extending cleanly before landing!)
    const kneeProfile = Math.sin(Math.pow(u, 0.72) * Math.PI);
    kneeX = kneeProfile * cfg.kneeLift;
    // Fetlock folds gracefully backward during lift, opens softly prior to touchdown
    const fetProfile = Math.sin(Math.pow(u, 0.65) * Math.PI);
    fetlockX = fetProfile * cfg.fetlockFold;
    hoofX = fetProfile * 0.18;
  }

  return { shoulderX, forearmX, kneeX, fetlockX, hoofX, onGround };
}

function sampleHindlegStride(p, cfg) {
  const phase = ((p % 1) + 1) % 1;
  const duty = cfg.duty;

  let hipX = 0;
  let stifleX = 0;
  let hockX = 0;
  let fetlockX = 0;
  let hoofX = 0;
  let onGround = false;

  if (phase < duty) {
    // STANCE PHASE: Powerful hindquarter propulsion pushing earth backward!
    onGround = true;
    const s = phase / duty;
    const sweep = lerp(-cfg.protract, cfg.retract, s);
    hipX = sweep * 0.62;
    stifleX = sweep * 0.24 + Math.sin(s * Math.PI) * 0.08;
    // Hock compresses slightly at mid-stance, then extends forcefully (+rx) at push-off!
    hockX = -Math.sin(s * Math.PI) * 0.16 + smoothstep(0.55, 1.0, s) * cfg.hockExtend;
    fetlockX = -Math.sin(s * Math.PI) * cfg.fetlockDrop + smoothstep(0.82, 1.0, s) * 0.30;
    hoofX = -(hipX + stifleX + hockX + fetlockX) * 0.82;
  } else {
    // SWING PHASE: Bring thigh forward, flex stifle (+rx) & snap hock FORWARD (-rx)!
    const u = (phase - duty) / (1 - duty);
    const swingCurve = 0.5 - 0.5 * Math.cos(u * Math.PI);
    const sweep = lerp(cfg.retract, -cfg.protract, swingCurve);

    const arc = Math.sin(Math.pow(u, 0.80) * Math.PI);
    hipX = sweep * 0.68 - arc * cfg.hipLift;
    stifleX = sweep * 0.22 + arc * cfg.stifleFlex;
    // Iconic equine hock flexion bends FORWARD (-rx)!
    hockX = -arc * cfg.hockFlex;
    fetlockX = Math.sin(Math.pow(u, 0.68) * Math.PI) * cfg.fetlockFold;
    hoofX = arc * 0.16;
  }

  return { hipX, stifleX, hockX, fetlockX, hoofX, onGround };
}

/**
 * Biomechanical parameters for each gait!
 */
export const GAIT_PROFILES = {
  idle: {
    freq: 0.0,
    groundSpeed: 0.0,
    bobAmp: 0.0,
    pitchAmp: 0.0,
    tailLift: 0.14,
  },
  walk: {
    freq: 0.86,
    groundSpeed: 1.65,
    phases: { HL: 0.00, FL: 0.25, HR: 0.50, FR: 0.75 },
    fore: { duty: 0.63, protract: 0.31, retract: 0.29, shoulderLift: 0.10, elbowFlex: 0.10, kneeLift: 0.62, fetlockDrop: 0.14, fetlockFold: 0.45 },
    hind: { duty: 0.63, protract: 0.29, retract: 0.30, hipLift: 0.10, stifleFlex: 0.26, hockFlex: 0.52, hockExtend: 0.20, fetlockDrop: 0.13, fetlockFold: 0.42 },
    bobAmp: 0.022,
    bobFreqMul: 2,
    pitchAmp: 0.020,
    neckNod: 0.095,
    neckCarriage: 0.04,
    tailLift: 0.26,
    hipRoll: 0.055,
  },
  trot: {
    freq: 1.50,
    groundSpeed: 3.95,
    phases: { HL: 0.00, FR: 0.00, HR: 0.50, FL: 0.50 },
    fore: { duty: 0.45, protract: 0.46, retract: 0.42, shoulderLift: 0.20, elbowFlex: 0.18, kneeLift: 1.12, fetlockDrop: 0.26, fetlockFold: 0.62 },
    hind: { duty: 0.45, protract: 0.42, retract: 0.45, hipLift: 0.20, stifleFlex: 0.42, hockFlex: 0.82, hockExtend: 0.32, fetlockDrop: 0.24, fetlockFold: 0.58 },
    bobAmp: 0.068,
    bobFreqMul: 2,
    pitchAmp: 0.032,
    neckNod: 0.045,
    neckCarriage: -0.14, // Proud elevated dressage trot frame!
    tailLift: 0.52,
    hipRoll: 0.045,
  },
  canter: {
    freq: 1.84,
    groundSpeed: 6.60,
    phases: { HL: 0.00, HR: 0.24, FL: 0.24, FR: 0.50 },
    fore: { duty: 0.36, protract: 0.62, retract: 0.52, shoulderLift: 0.28, elbowFlex: 0.24, kneeLift: 1.38, fetlockDrop: 0.34, fetlockFold: 0.72 },
    hind: { duty: 0.36, protract: 0.58, retract: 0.58, hipLift: 0.28, stifleFlex: 0.55, hockFlex: 1.02, hockExtend: 0.42, fetlockDrop: 0.32, fetlockFold: 0.68 },
    bobAmp: 0.105,
    bobFreqMul: 1,
    pitchAmp: 0.125,
    neckNod: 0.16,
    neckCarriage: -0.06,
    tailLift: 0.68,
    hipRoll: 0.05,
  },
  gallop: {
    freq: 2.22,
    groundSpeed: 10.6,
    phases: { HL: 0.00, HR: 0.17, FL: 0.44, FR: 0.61 },
    fore: { duty: 0.28, protract: 0.82, retract: 0.64, shoulderLift: 0.34, elbowFlex: 0.16, kneeLift: 1.48, fetlockDrop: 0.38, fetlockFold: 0.76 },
    hind: { duty: 0.28, protract: 0.72, retract: 0.70, hipLift: 0.32, stifleFlex: 0.62, hockFlex: 1.15, hockExtend: 0.50, fetlockDrop: 0.36, fetlockFold: 0.72 },
    bobAmp: 0.125,
    bobFreqMul: 1,
    pitchAmp: 0.165,
    neckNod: 0.20,
    neckCarriage: 0.18,
    tailLift: 0.86,
    hipRoll: 0.04,
  },
};

export class EquineAnimator {
  constructor(rig, eyeLids, landmarks) {
    this.rig = rig;
    this.bones = rig.boneMap;
    this.eyeLids = eyeLids || [];
    this.landmarks = landmarks;

    this.gait = 'idle';
    this.prevGait = 'idle';
    this.gaitBlend = 1.0;

    this.speedMultiplier = 1.0;
    this.paused = false;
    this.trackCursor = true;

    this.time = 0;
    this.stridePhase = 0;
    this.groundSpeed = 0;
    this.hairBounce = 0;

    // Cursor look-at normalized target (-1..1)
    this.cursorTarget = { x: 0, y: 0 };
    this.smoothLook = { x: 0, y: 0 };

    // Natural eye blink timer
    this.blinkTimer = 2.4;
    this.blinkProgress = 0;

    // Special interactive actions: null | 'rear' | 'shake' | 'graze'
    this.action = null;
    this.actionTime = 0;
    this.grazeWeight = 0;
    this.grazeActive = false;

    // Interactive poke reaction (ear flick + friendly turn)
    this.pokeTimer = 0;
    this.pokeSide = 1;

    // Track previous hoof ground contact to trigger audio + dust impacts!
    this.prevContact = { FL: true, FR: true, HL: true, HR: true };

    // Pose target buffers for ultra-smooth bone interpolation
    this.currentRot = {};
    this.targetRot = {};
    for (const name of Object.keys(this.bones)) {
      this.currentRot[name] = new THREE.Vector3(0, 0, 0);
      this.targetRot[name] = new THREE.Vector3(0, 0, 0);
    }
    this.currentPelvisPos = this.bones.pelvis.userData.restPosition.clone();
    this.targetPelvisPos = this.bones.pelvis.userData.restPosition.clone();
  }

  setGait(newGait) {
    if (!GAIT_PROFILES[newGait] || newGait === this.gait) return;
    if (newGait !== 'idle') this.grazeActive = false;
    this.prevGait = this.gait;
    this.gait = newGait;
    this.gaitBlend = 0.0;
  }

  triggerAction(actionName) {
    if (actionName === 'graze') {
      this.grazeActive = !this.grazeActive;
      if (this.grazeActive) {
        this.gait = 'idle';
        this.action = null;
      }
      return this.grazeActive;
    }
    if (actionName === 'rear') {
      this.grazeActive = false;
      this.action = 'rear';
      this.actionTime = 0;
      return true;
    }
    if (actionName === 'shake') {
      this.action = 'shake';
      this.actionTime = 0;
      return true;
    }
    return false;
  }

  triggerPoke(side = 1) {
    this.pokeTimer = 1.1;
    this.pokeSide = side >= 0 ? 1 : -1;
  }

  setCursorNDC(x, y) {
    this.cursorTarget.x = clamp(x, -1, 1);
    this.cursorTarget.y = clamp(y, -1, 1);
  }

  /**
   * Advance equine animation by dt seconds.
   * Returns { groundSpeed, hoofImpacts, hairBounce } for meadow treadmill, particles & audio.
   */
  update(rawDt) {
    const dt = Math.min(rawDt, 0.05);
    if (this.paused) {
      return { groundSpeed: 0, hoofImpacts: [], hairBounce: 0 };
    }

    const effDt = dt * this.speedMultiplier;
    this.time += dt;
    this.gaitBlend = Math.min(1.0, this.gaitBlend + dt * 3.2);

    const profile = GAIT_PROFILES[this.gait];
    const hoofImpacts = [];

    // Advance stride cycle phase
    if (profile.freq > 0 && this.action !== 'rear') {
      this.stridePhase = (this.stridePhase + effDt * profile.freq) % 1.0;
    }

    // Reset target rotations & pelvis position
    for (const name of Object.keys(this.targetRot)) {
      this.targetRot[name].set(0, 0, 0);
    }
    const restPelvis = this.bones.pelvis.userData.restPosition;
    this.targetPelvisPos.copy(restPelvis);

    // Subtle living ribcage breathing (always active, faster during gallop!)
    const breathFreq = this.gait === 'gallop' ? 1.8 : this.gait === 'canter' ? 1.2 : 0.28;
    const breath = Math.sin(this.time * TWO_PI * breathFreq);
    this.bones.chest.scale.set(1.0 + breath * 0.016, 1.0 + breath * 0.010, 1.0);
    this.bones.spine1.scale.set(1.0 + breath * 0.012, 1.0 + breath * 0.008, 1.0);

    // Smooth graze weight
    const targetGraze = this.grazeActive && this.gait === 'idle' && this.action !== 'rear' ? 1.0 : 0.0;
    this.grazeWeight = lerp(this.grazeWeight, targetGraze, Math.min(1, dt * 2.8));

    // =========================================================================
    // 1. BASE GAIT OR IDLE POSE
    // =========================================================================
    let targetGroundSpeed = profile.groundSpeed * this.speedMultiplier;
    let bounce = 0;

    if (this.gait === 'idle') {
      targetGroundSpeed = 0;
      // Gentle living weight shift & relaxed hind-hoof cock!
      const sway = Math.sin(this.time * 0.55) * 0.018;
      this.targetPelvisPos.x += sway;
      this.targetPelvisPos.y += breath * 0.004;
      this.targetRot.pelvis.z = -sway * 0.65;

      // Subtle relaxed right-hind hoof resting cock (alternating gently over time)
      const restCock = smoothstep(0.15, 0.85, Math.sin(this.time * 0.22) * 0.5 + 0.5) * (1.0 - this.grazeWeight * 0.6);
      this.targetRot.hipR.x = -0.10 * restCock;
      this.targetRot.stifleR.x = 0.20 * restCock;
      this.targetRot.hockR.x = -0.18 * restCock;
      this.targetRot.hindFetR.x = 0.34 * restCock;
      this.targetRot.hindHoofR.x = -0.20 * restCock;

      // Natural alert head & neck breathing sway
      const headFloat = Math.sin(this.time * 0.9) * 0.025;
      this.targetRot.neck1.x = headFloat * 0.6 + breath * 0.012;
      this.targetRot.neck2.x = headFloat * 0.5;
      this.targetRot.head.x = -headFloat * 0.4 + Math.cos(this.time * 0.62) * 0.025;

      // Occasional soft tail swish against meadow flies!
      const swishBurst = Math.pow(Math.max(0, Math.sin(this.time * 0.42)), 5);
      const swishWave = Math.sin(this.time * 5.8) * swishBurst;
      this.targetRot.tail1.x = profile.tailLift + swishBurst * 0.22;
      this.targetRot.tail1.y = swishWave * 0.36;
      this.targetRot.tail2.y = Math.sin(this.time * 5.8 - 0.6) * swishBurst * 0.42;
      this.targetRot.tail3.y = Math.sin(this.time * 5.8 - 1.2) * swishBurst * 0.48;
      this.targetRot.tail4.y = Math.sin(this.time * 5.8 - 1.8) * swishBurst * 0.42;
      this.targetRot.tail2.x = 0.06;
      this.targetRot.tail3.x = 0.04;

      // Grazing posture blend: neck gracefully arches down into the grass!
      if (this.grazeWeight > 0.005) {
        const g = this.grazeWeight;
        const nibble = Math.sin(this.time * 4.2) * 0.035;
        const browseYaw = Math.sin(this.time * 0.75) * 0.14;
        // Slight front leg spread forward/back (classic grazing stance!)
        this.targetRot.shoulderL.x += -0.18 * g;
        this.targetRot.forearmL.x += 0.06 * g;
        this.targetRot.hoofL.x += 0.12 * g;
        this.targetRot.shoulderR.x += 0.12 * g;
        this.targetRot.hoofR.x += -0.10 * g;

        this.targetPelvisPos.y -= 0.025 * g;
        this.targetRot.spine1.x += 0.05 * g;
        this.targetRot.chest.x += 0.08 * g;
        this.targetRot.neck1.x += 0.56 * g;
        this.targetRot.neck2.x += 0.44 * g;
        this.targetRot.neck3.x += 0.28 * g;
        this.targetRot.head.x += (-0.18 + nibble) * g;
        this.targetRot.neck1.y += browseYaw * 0.55 * g;
        this.targetRot.head.y += browseYaw * 0.45 * g;
      }
    } else {
      // MOVING GAITS: WALK, TROT, CANTER, GALLOP
      const ph = profile.phases;
      const fl = sampleForelegStride(this.stridePhase + ph.FL, profile.fore);
      const fr = sampleForelegStride(this.stridePhase + ph.FR, profile.fore);
      const hl = sampleHindlegStride(this.stridePhase + ph.HL, profile.hind);
      const hr = sampleHindlegStride(this.stridePhase + ph.HR, profile.hind);

      // Apply forelegs
      this.targetRot.shoulderL.x = fl.shoulderX;
      this.targetRot.forearmL.x = fl.forearmX;
      this.targetRot.kneeL.x = fl.kneeX;
      this.targetRot.fetlockL.x = fl.fetlockX;
      this.targetRot.hoofL.x = fl.hoofX;

      this.targetRot.shoulderR.x = fr.shoulderX;
      this.targetRot.forearmR.x = fr.forearmX;
      this.targetRot.kneeR.x = fr.kneeX;
      this.targetRot.fetlockR.x = fr.fetlockX;
      this.targetRot.hoofR.x = fr.hoofX;

      // Apply hindlegs
      this.targetRot.hipL.x = hl.hipX;
      this.targetRot.stifleL.x = hl.stifleX;
      this.targetRot.hockL.x = hl.hockX;
      this.targetRot.hindFetL.x = hl.fetlockX;
      this.targetRot.hindHoofL.x = hl.hoofX;

      this.targetRot.hipR.x = hr.hipX;
      this.targetRot.stifleR.x = hr.stifleX;
      this.targetRot.hockR.x = hr.hockX;
      this.targetRot.hindFetR.x = hr.fetlockX;
      this.targetRot.hindHoofR.x = hr.hoofX;

      // Detect fresh hoof touchdowns for dust particles & Web Audio hoofbeats!
      const contacts = { FL: fl.onGround, FR: fr.onGround, HL: hl.onGround, HR: hr.onGround };
      for (const leg of ['FL', 'FR', 'HL', 'HR']) {
        if (contacts[leg] && !this.prevContact[leg]) {
          const intensity =
            this.gait === 'gallop' ? 1.0 : this.gait === 'canter' ? 0.78 : this.gait === 'trot' ? 0.56 : 0.30;
          hoofImpacts.push({ leg, pos: this.landmarks.hooves[leg], intensity });
        }
        this.prevContact[leg] = contacts[leg];
      }

      // Vertical bounce & spine wave
      const wAngle = this.stridePhase * TWO_PI;
      const bobWave = Math.sin(wAngle * profile.bobFreqMul - 0.65);
      bounce = bobWave * profile.bobAmp;
      this.targetPelvisPos.y += bounce;
      // Forward surge micro-oscillation during canter/gallop
      if (this.gait === 'canter' || this.gait === 'gallop') {
        this.targetPelvisPos.z += Math.cos(wAngle) * 0.045;
      }

      const pitchWave = Math.sin(wAngle - 0.3);
      const spineFlex = Math.sin(wAngle + 0.55);
      this.targetRot.pelvis.x = pitchWave * profile.pitchAmp;
      this.targetRot.spine1.x = spineFlex * profile.pitchAmp * 0.75;
      this.targetRot.chest.x = -pitchWave * profile.pitchAmp * 0.45;

      // Lateral hip roll & shoulder counter-sway
      const roll = Math.sin(wAngle) * profile.hipRoll;
      this.targetRot.pelvis.z = roll;
      this.targetRot.spine1.z = -roll * 0.6;
      this.targetRot.chest.z = -roll * 0.4;
      this.targetRot.spine1.y = Math.cos(wAngle) * profile.hipRoll * 0.6;

      // Rhythmic equine head & neck stabilization / nod
      const nodFreq = this.gait === 'walk' || this.gait === 'trot' ? 2 : 1;
      const nod = Math.sin(wAngle * nodFreq + 0.35) * profile.neckNod;
      this.targetRot.neck1.x = profile.neckCarriage * 0.55 + nod * 0.55;
      this.targetRot.neck2.x = profile.neckCarriage * 0.35 + nod * 0.35;
      this.targetRot.neck3.x = profile.neckCarriage * 0.15 + nod * 0.18;
      // Head counter-stabilizes gaze slightly like a real horse!
      this.targetRot.head.x = -profile.neckCarriage * 0.35 - nod * 0.48;

      // Flowing lifted tail trailing dynamically with speed & stride wave!
      const tWave = Math.sin(wAngle * 2 - 0.8);
      this.targetRot.tail1.x = profile.tailLift + tWave * 0.08;
      this.targetRot.tail2.x = 0.14 + Math.sin(wAngle * 2 - 1.4) * 0.12;
      this.targetRot.tail3.x = 0.12 + Math.sin(wAngle * 2 - 2.0) * 0.14;
      this.targetRot.tail4.x = 0.08 + Math.sin(wAngle * 2 - 2.6) * 0.12;
      this.targetRot.tail1.y = Math.sin(wAngle) * 0.09;
      this.targetRot.tail2.y = Math.sin(wAngle - 0.6) * 0.14;
    }

    // =========================================================================
    // 2. INTERACTIVE SPECIAL ACTIONS (REAR UP / HEAD SHAKE)
    // =========================================================================
    if (this.action === 'rear') {
      this.actionTime += dt;
      const dur = 2.85;
      const u = this.actionTime / dur;
      if (u >= 1.0) {
        this.action = null;
        // Landing impact on both forehooves!
        hoofImpacts.push({ leg: 'FL', pos: this.landmarks.hooves.FL, intensity: 0.95 });
        hoofImpacts.push({ leg: 'FR', pos: this.landmarks.hooves.FR, intensity: 0.95 });
      } else {
        targetGroundSpeed = 0;
        // Smooth rise -> proud dramatic hang at apex -> athletic landing!
        const rise = smoothstep(0.0, 0.34, u);
        const fall = 1.0 - smoothstep(0.66, 1.0, u);
        const rearEnv = rise * fall;
        // Gather crouch just before launch
        const crouch = Math.sin(clamp(u / 0.18, 0, 1) * Math.PI) * 0.25;

        // Shift pelvis back over hind hooves & lower slightly so both hind hooves stay firmly planted!
        this.targetPelvisPos.y = restPelvis.y - crouch * 0.12 - rearEnv * 0.145;
        this.targetPelvisPos.z = restPelvis.z - rearEnv * 0.12;

        // Dramatic torso elevation (~44 deg!)
        const rearPitch = -0.78 * rearEnv;
        this.targetRot.pelvis.x = rearPitch;
        this.targetRot.spine1.x = -0.09 * rearEnv;
        this.targetRot.chest.x = -0.05 * rearEnv;

        // Both hindlegs counter-rotate symmetrically so BOTH hind hooves stay squarely flat on y = 0!
        const hipCounter = -rearPitch * 0.82 - 0.18 * rearEnv - crouch * 0.26;
        const stifleBend = 0.28 * rearEnv + crouch * 0.40;
        const hockBend = -0.34 * rearEnv - crouch * 0.36;
        const fetBend = -0.10 * rearEnv;
        const hoofFlat = -(rearPitch + hipCounter + stifleBend + hockBend + fetBend);

        this.targetRot.hipL.x = hipCounter;
        this.targetRot.stifleL.x = stifleBend;
        this.targetRot.hockL.x = hockBend;
        this.targetRot.hindFetL.x = fetBend;
        this.targetRot.hindHoofL.x = hoofFlat;

        this.targetRot.hipR.x = hipCounter + 0.03 * rearEnv;
        this.targetRot.stifleR.x = stifleBend;
        this.targetRot.hockR.x = hockBend;
        this.targetRot.hindFetR.x = fetBend;
        this.targetRot.hindHoofR.x = hoofFlat - 0.03 * rearEnv;

        // Forelegs fold dramatically & paw the air asymmetrically!
        const paw = Math.sin(u * Math.PI * 5.0) * rearEnv;
        this.targetRot.shoulderL.x = (-0.75 + paw * 0.28) * rearEnv;
        this.targetRot.forearmL.x = (0.35 - paw * 0.15) * rearEnv;
        this.targetRot.kneeL.x = (1.62 - paw * 0.25) * rearEnv;
        this.targetRot.fetlockL.x = 0.75 * rearEnv;

        this.targetRot.shoulderR.x = (-0.62 - paw * 0.28) * rearEnv;
        this.targetRot.forearmR.x = (0.30 + paw * 0.15) * rearEnv;
        this.targetRot.kneeR.x = (1.48 + paw * 0.25) * rearEnv;
        this.targetRot.fetlockR.x = 0.68 * rearEnv;

        // Arched noble neck tuck & flared expressive tail
        this.targetRot.neck1.x = 0.24 * rearEnv;
        this.targetRot.neck2.x = 0.26 * rearEnv;
        this.targetRot.head.x = 0.35 * rearEnv;
        this.targetRot.tail1.x = 0.55 * rearEnv;
        this.targetRot.tail2.x = 0.22 * rearEnv;
        bounce = rearEnv * 0.14;
      }
    } else if (this.action === 'shake') {
      this.actionTime += dt;
      const dur = 1.55;
      const u = this.actionTime / dur;
      if (u >= 1.0) {
        this.action = null;
      } else {
        const env = Math.sin(u * Math.PI);
        const w = Math.sin(u * Math.PI * 6.5) * env;
        const w2 = Math.cos(u * Math.PI * 6.5) * env;
        this.targetRot.neck1.y += w * 0.22;
        this.targetRot.neck2.y += w * 0.28;
        this.targetRot.head.y += w * 0.36;
        this.targetRot.head.z += w2 * 0.28;
        this.targetRot.neck1.x += -0.14 * env;
        this.targetRot.head.x += 0.16 * env + Math.sin(u * Math.PI * 4) * 0.12 * env;
        bounce += Math.abs(w) * 0.08;
      }
    }

    // =========================================================================
    // 3. CURSOR LOOK-AT, INDEPENDENT EAR SWIVELING & NATURAL EYE BLINKING
    // =========================================================================
    const lookActive = this.trackCursor && this.action !== 'rear' && this.grazeWeight < 0.5;
    const goalX = lookActive ? this.cursorTarget.x : 0;
    const goalY = lookActive ? this.cursorTarget.y : 0;
    this.smoothLook.x = lerp(this.smoothLook.x, goalX, Math.min(1, dt * 4.5));
    this.smoothLook.y = lerp(this.smoothLook.y, goalY, Math.min(1, dt * 4.5));

    // Gentle friendly poke response when user clicks directly on the horse!
    let pokeYaw = 0;
    let pokeEar = 0;
    if (this.pokeTimer > 0) {
      this.pokeTimer = Math.max(0, this.pokeTimer - dt);
      const env = Math.sin((this.pokeTimer / 1.1) * Math.PI);
      pokeYaw = this.pokeSide * 0.32 * env;
      pokeEar = 0.45 * env;
    }

    const totalYaw = -this.smoothLook.x * 0.46 + pokeYaw;
    const totalPitch = -this.smoothLook.y * 0.22;

    this.targetRot.neck1.y += totalYaw * 0.28;
    this.targetRot.neck2.y += totalYaw * 0.30;
    this.targetRot.neck3.y += totalYaw * 0.20;
    this.targetRot.head.y += totalYaw * 0.36;
    this.targetRot.head.x += totalPitch * 0.55;
    this.targetRot.neck2.x += totalPitch * 0.25;

    // Independent expressive equine ear swiveling (horses constantly scan sounds!)
    const earScanL = Math.sin(this.time * 0.95) * 0.18 + Math.sin(this.time * 2.3) * 0.08;
    const earScanR = Math.sin(this.time * 0.78 + 1.9) * 0.18 + Math.cos(this.time * 1.9) * 0.08;
    const speedPin = this.gait === 'gallop' ? 0.35 : this.action === 'rear' ? 0.28 : 0.0;

    this.targetRot.earL.y = earScanL + totalYaw * 0.35;
    this.targetRot.earL.x = -speedPin - pokeEar * 0.4 + Math.sin(this.time * 1.4) * 0.08;
    this.targetRot.earL.z = -0.06 - pokeEar * 0.25;

    this.targetRot.earR.y = earScanR + totalYaw * 0.35;
    this.targetRot.earR.x = -speedPin - pokeEar * 0.4 + Math.cos(this.time * 1.1) * 0.08;
    this.targetRot.earR.z = 0.06 + pokeEar * 0.25;

    // Natural eye blinking every 3-5.5 seconds
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkProgress += dt * 7.5;
      if (this.blinkProgress >= Math.PI) {
        this.blinkProgress = 0;
        this.blinkTimer = 2.8 + Math.random() * 3.4;
      }
    }
    const blinkAmt = this.blinkProgress > 0 ? Math.sin(this.blinkProgress) : 0;
    for (const lid of this.eyeLids) {
      lid.mesh.rotation.x = lerp(lid.openRot, lid.closedRot, blinkAmt);
    }

    // =========================================================================
    // 4. SMOOTHLY APPLY POSE TO BONES (prevents snappy jumps between gaits!)
    // =========================================================================
    const smoothRate = Math.min(1, dt * 11.5);
    this.currentPelvisPos.lerp(this.targetPelvisPos, smoothRate);
    this.bones.pelvis.position.copy(this.currentPelvisPos);

    for (const name of Object.keys(this.bones)) {
      const c = this.currentRot[name];
      const t = this.targetRot[name];
      c.lerp(t, smoothRate);
      const b = this.bones[name];
      b.rotation.set(c.x, c.y, c.z, 'XYZ');
    }

    this.groundSpeed = lerp(this.groundSpeed, targetGroundSpeed, Math.min(1, dt * 5.0));
    this.hairBounce = lerp(this.hairBounce, bounce * 10.0, Math.min(1, dt * 9.0));

    return {
      groundSpeed: this.groundSpeed,
      hoofImpacts,
      hairBounce: this.hairBounce,
    };
  }
}
