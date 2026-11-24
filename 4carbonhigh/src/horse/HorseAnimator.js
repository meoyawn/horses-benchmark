import * as THREE from 'three';

/**
 * Biomechanical Equine Gait, Action, Hair Physics & Roam Controller.
 *
 * Gaits with authentic footfall phase offsets (0 = footstrike):
 *  - idle:   Living breath, weight shift, blinking, independent ear swivels, tail swish
 *  - walk:   4-beat lateral-diagonal sequence (HL 0.00 -> FL 0.25 -> HR 0.50 -> FR 0.75)
 *  - trot:   2-beat diagonal pairs (FL+HR 0.00, FR+HL 0.50) with crisp suspension
 *  - canter: 3-beat right-lead sequence (HL 0.00 -> HR+FL 0.26 -> FR 0.55 + suspension)
 *  - gallop: 4-beat transverse gallop (HL 0.00 -> HR 0.14 -> FL 0.44 -> FR 0.58 + gathered suspension)
 *
 * Special interactive actions (smoothly blended over current state):
 *  - rear:   Dramatic levade/pesade rear onto hind legs with pawing forelegs
 *  - graze:  Stretches neck down smoothly to nibble meadow grass
 *  - whinny: Proud head toss, jaw opening, flared nostrils, brisk tail swish
 */

export const GAIT_CONFIGS = {
  idle: {
    name: 'Idle',
    strideFreq: 0.0,
    speed: 0.0,
    duty: 1.0,
    phases: { HL: 0, FL: 0, HR: 0, FR: 0 },
    foreSwing: 0.0,
    hindSwing: 0.0,
    kneeFold: 0.0,
    hockFold: 0.0,
    fetlockLoad: 0.04,
    suspension: 0.0,
    neckPitchBase: 0.0,
    neckBob: 0.0,
    spinePitchAmp: 0.0,
    tailLift: 0.10,
  },
  walk: {
    name: 'Walk',
    strideFreq: 0.88,
    speed: 1.55,
    duty: 0.64,
    phases: { HL: 0.0, FL: 0.25, HR: 0.50, FR: 0.75 },
    foreSwing: 0.30,
    hindSwing: 0.28,
    kneeFold: 0.48,
    hockFold: 0.52,
    fetlockLoad: 0.15,
    suspension: 0.0,
    neckPitchBase: 0.08,
    neckBob: 0.075, // Classic 2-per-stride walk head nod
    spinePitchAmp: 0.018,
    tailLift: 0.22,
  },
  trot: {
    name: 'Trot',
    strideFreq: 1.48,
    speed: 3.6,
    duty: 0.44,
    phases: { FL: 0.0, HR: 0.0, FR: 0.50, HL: 0.50 },
    foreSwing: 0.42,
    hindSwing: 0.38,
    kneeFold: 0.82,
    hockFold: 0.78,
    fetlockLoad: 0.24,
    suspension: 0.038,
    neckPitchBase: -0.05, // Proud collected carriage
    neckBob: 0.030,
    spinePitchAmp: 0.022,
    tailLift: 0.38,
  },
  canter: {
    name: 'Canter',
    strideFreq: 1.78,
    speed: 6.2,
    duty: 0.37,
    phases: { HL: 0.0, HR: 0.25, FL: 0.27, FR: 0.54 },
    foreSwing: 0.50,
    hindSwing: 0.46,
    kneeFold: 0.95,
    hockFold: 0.88,
    fetlockLoad: 0.28,
    suspension: 0.058,
    neckPitchBase: 0.06,
    neckBob: 0.095, // 1-per-stride rocking-horse scoop
    spinePitchAmp: 0.065,
    tailLift: 0.48,
  },
  gallop: {
    name: 'Gallop',
    strideFreq: 2.22,
    speed: 10.5,
    duty: 0.30,
    phases: { HL: 0.0, HR: 0.13, FL: 0.44, FR: 0.57 },
    foreSwing: 0.62,
    hindSwing: 0.58,
    kneeFold: 1.12,
    hockFold: 1.05,
    fetlockLoad: 0.34,
    suspension: 0.075,
    neckPitchBase: 0.20, // Extended forward racing stretch
    neckBob: 0.125,
    spinePitchAmp: 0.105,
    tailLift: 0.62,
  },
};

export class HorseAnimator {
  constructor(horseGroup, boneMap, joints, materialUniforms) {
    this.horseGroup = horseGroup;
    this.bones = boneMap;
    this.joints = joints;
    this.uniforms = materialUniforms;

    this.currentGait = 'trot';
    this.locomotionMode = 'inPlace'; // 'inPlace' (turntable/treadmill) or 'roam' (WASD / circle meadow)
    this.time = 0;
    this.stridePhase = 0;

    // Smoothed gait blend weights across all 5 gaits
    this.weights = { idle: 0, walk: 0, trot: 1, canter: 0, gallop: 0 };

    // Special action states
    this.activeAction = null; // 'rear' | 'graze' | 'whinny' | 'pet'
    this.actionTimer = 0;
    this.actionDuration = 0;

    // Blinking & autonomous micro-life
    this.blinkTimer = 2.4;
    this.blinkProgress = -1;
    this.earAlertBoost = 0;

    // Cursor / camera gaze target in horse local space
    this.lookAtEnabled = true;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.smoothYaw = 0;
    this.smoothPitch = 0;

    // Roam / WASD driving state
    this.heading = 0;
    this.turnRate = 0;
    this.currentSpeed = 0;
    this.keys = { forward: false, backward: false, left: false, right: false, sprint: false };

    // Spring-chain state for 8 Tail bones & 5 Mane bones
    this.tailAnglesX = new Float32Array(8);
    this.tailVelX = new Float32Array(8);
    this.tailAnglesZ = new Float32Array(8);
    this.tailVelZ = new Float32Array(8);

    this.maneSwingZ = new Float32Array(6);
    this.maneVelZ = new Float32Array(6);

    // Track previous stance states to emit hoofstrike events for dust & hoofprints!
    this.prevStance = { FL: true, FR: true, HL: true, HR: true };
    this.onHoofStrike = null; // callback(limbKey, worldPos, intensity)

    // Reusable scratch vectors
    this._vHoof = new THREE.Vector3();
    this._soleLocalOffsets = {
      FL: new THREE.Vector3(0, -0.085, 0.045),
      FR: new THREE.Vector3(0, -0.085, 0.045),
      HL: new THREE.Vector3(0, -0.085, 0.040),
      HR: new THREE.Vector3(0, -0.085, 0.040),
    };
  }

  setGait(gaitKey) {
    if (GAIT_CONFIGS[gaitKey]) {
      this.currentGait = gaitKey;
      if (this.activeAction === 'graze' && gaitKey !== 'idle') {
        this.activeAction = null;
      }
    }
  }

  triggerAction(actionName) {
    this.activeAction = actionName;
    this.actionTimer = 0;
    if (actionName === 'rear') {
      this.actionDuration = 2.55;
    } else if (actionName === 'graze') {
      this.currentGait = 'idle';
      this.actionDuration = 4.6;
    } else if (actionName === 'whinny') {
      this.actionDuration = 2.1;
    } else if (actionName === 'pet') {
      this.actionDuration = 1.6;
      this.earAlertBoost = 1.0;
    }
  }

  setLookTargetWorld(worldPoint) {
    if (!worldPoint || !this.lookAtEnabled) {
      this.targetYaw = 0;
      this.targetPitch = 0;
      return;
    }
    const local = this._vHoof.copy(worldPoint);
    this.horseGroup.worldToLocal(local);
    // Vector from neck/head region (0, 1.80, 0.90) to target
    const dx = local.x;
    const dy = local.y - 1.80;
    const dz = local.z - 0.90;
    if (dz > -0.4) {
      const distXZ = Math.max(0.5, Math.hypot(dx, Math.max(0.35, dz)));
      this.targetYaw = THREE.MathUtils.clamp(Math.atan2(dx, Math.max(0.4, dz)), -0.55, 0.55);
      this.targetPitch = THREE.MathUtils.clamp(-Math.atan2(dy, distXZ), -0.35, 0.35);
    } else {
      this.targetYaw = 0;
      this.targetPitch = 0;
    }
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;

    // 1. Handle WASD Free-Roam input if active
    this._updateRoamControls(dt);

    // 2. Smoothly blend gait weights toward currentGait (suppress locomotion during Rear)
    const rearFactor = this._getRearEnvelope();
    const grazeFactor = this._getGrazeEnvelope();

    const effectiveGait = rearFactor > 0.15 ? 'idle' : this.currentGait;
    const blendRate = 1.0 - Math.exp(-dt * 5.2);
    let weightSum = 0;
    for (const k of Object.keys(this.weights)) {
      const target = k === effectiveGait ? 1.0 : 0.0;
      this.weights[k] += (target - this.weights[k]) * blendRate;
      if (this.weights[k] < 0.001) this.weights[k] = 0;
      weightSum += this.weights[k];
    }
    if (weightSum > 0) {
      for (const k of Object.keys(this.weights)) this.weights[k] /= weightSum;
    }

    // Blended gait parameters
    let strideFreq = 0, targetSpeed = 0, duty = 0, foreSwing = 0, hindSwing = 0;
    let kneeFold = 0, hockFold = 0, fetlockLoad = 0, suspension = 0;
    let neckPitchBase = 0, neckBob = 0, spinePitchAmp = 0, tailLift = 0;

    for (const [k, w] of Object.entries(this.weights)) {
      if (w <= 0) continue;
      const g = GAIT_CONFIGS[k];
      strideFreq += g.strideFreq * w;
      targetSpeed += g.speed * w;
      duty += g.duty * w;
      foreSwing += g.foreSwing * w;
      hindSwing += g.hindSwing * w;
      kneeFold += g.kneeFold * w;
      hockFold += g.hockFold * w;
      fetlockLoad += g.fetlockLoad * w;
      suspension += g.suspension * w;
      neckPitchBase += g.neckPitchBase * w;
      neckBob += g.neckBob * w;
      spinePitchAmp += g.spinePitchAmp * w;
      tailLift += g.tailLift * w;
    }

    this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed * (1.0 - rearFactor), 1.0 - Math.exp(-dt * 6.0));
    this.stridePhase = (this.stridePhase + strideFreq * dt) % 1.0;

    // Reset all bone rotations and rest positions
    for (const bone of Object.values(this.bones)) {
      bone.rotation.set(0, 0, 0);
      bone.scale.set(1, 1, 1);
      bone.position.copy(bone.userData.restPos);
    }

    const B = this.bones;
    const t = this.time;
    const tau = Math.PI * 2.0;
    const moveAmount = 1.0 - this.weights.idle;

    // 3. Living Idle Respiration, Micro-Sway & Blinking
    const breathFreq = 0.32 + moveAmount * 1.15;
    const breath = Math.sin(t * tau * breathFreq);
    const bellyExpand = 0.018 + moveAmount * 0.026;
    B.Belly.scale.set(1.0 + breath * bellyExpand, 1.0 + breath * bellyExpand * 0.7, 1.0);
    B.Thorax.scale.x = 1.0 + breath * bellyExpand * 0.35;

    // Nostril flare / upper muzzle vitality with effort & whinny
    const whinnyEnv = this._getWhinnyEnvelope();
    const flare = 0.02 * (0.5 + 0.5 * breath) + moveAmount * 0.065 + whinnyEnv * 0.10;
    B.MuzzleUpper.scale.set(1.0 + flare, 1.0 + flare * 0.35, 1.0);

    // Blinking controller
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkProgress < 0) {
      this.blinkProgress = 0;
      this.blinkTimer = 2.6 + ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) % 1 * 3.4;
    }
    let lidClose = 0;
    if (this.blinkProgress >= 0) {
      this.blinkProgress += dt / 0.19;
      if (this.blinkProgress >= 1.0) {
        this.blinkProgress = -1;
      } else {
        lidClose = Math.sin(this.blinkProgress * Math.PI);
      }
    }
    B.EyelidL.rotation.x = lidClose * 0.95;
    B.EyelidR.rotation.x = lidClose * 0.95;

    // Independent Equine Ear Swivels (alert forward, sound-tracking, pinned back at full gallop!)
    this.earAlertBoost = Math.max(0, this.earAlertBoost - dt * 0.8);
    const gallopPin = this.weights.gallop * 0.52;
    const earWaveL = Math.sin(t * 1.35) * 0.14 + Math.sin(t * 3.7) * 0.05;
    const earWaveR = Math.sin(t * 1.15 + 1.4) * 0.14 + Math.cos(t * 3.1) * 0.05;
    B.EarL.rotation.x = -0.15 - this.earAlertBoost * 0.22 + gallopPin + earWaveL * (1.0 - gallopPin * 0.7);
    B.EarR.rotation.x = -0.15 - this.earAlertBoost * 0.22 + gallopPin + earWaveR * (1.0 - gallopPin * 0.7);
    B.EarL.rotation.y = 0.12 + earWaveL * 0.35 - gallopPin * 0.25;
    B.EarR.rotation.y = -0.12 - earWaveR * 0.35 + gallopPin * 0.25;

    // 4. Spine, Pelvis, Neck & Gaze Kinematics
    const pRad = this.stridePhase * tau;
    const isSymmetricGait = this.weights.walk + this.weights.trot;
    const isAsymmetricGait = this.weights.canter + this.weights.gallop;

    // Bounce frequency: 2x per stride for Walk/Trot, 1x per stride for Canter/Gallop
    const bounce2x = Math.sin(pRad * 2.0 - 0.5);
    const bounce1x = Math.sin(pRad - 0.7);
    const verticalBounce = (bounce2x * isSymmetricGait + bounce1x * isAsymmetricGait) * suspension;

    B.Pelvis.position.y += verticalBounce;
    // Subtle idle weight shift
    B.Pelvis.position.x += Math.sin(t * 0.65) * 0.012 * this.weights.idle;
    B.Pelvis.rotation.z = Math.sin(pRad) * 0.032 * moveAmount + Math.sin(t * 0.65) * 0.015 * this.weights.idle;

    // Rocking-horse pitch & spine flexion-extension
    const spineRock = Math.sin(pRad - 0.3) * spinePitchAmp;
    B.Pelvis.rotation.x = spineRock * 0.65;
    B.Lumbar.rotation.x = -spineRock * 0.45;
    B.Thorax.rotation.x = -spineRock * 0.35;

    // Lateral spine & neck bend into turns (essential realism when turning!)
    const lateralBend = THREE.MathUtils.clamp(this.turnRate * 0.22, -0.28, 0.28);
    B.Lumbar.rotation.y = lateralBend * 0.30;
    B.Thorax.rotation.y = lateralBend * 0.35;
    B.Chest.rotation.y = lateralBend * 0.35;

    // Gaze smoothing
    const gazeAtten = (1.0 - rearFactor) * (1.0 - grazeFactor) * (1.0 - this.weights.gallop * 0.65);
    this.smoothYaw += (this.targetYaw * gazeAtten - this.smoothYaw) * (1.0 - Math.exp(-dt * 4.5));
    this.smoothPitch += (this.targetPitch * gazeAtten - this.smoothPitch) * (1.0 - Math.exp(-dt * 4.5));

    // Neck rhythmic nod (2x per stride at walk/trot, 1x scoop at canter/gallop)
    const nodWave = Math.sin(pRad * 2.0 + 0.8) * isSymmetricGait + Math.sin(pRad + 1.1) * isAsymmetricGait;
    const neckPitch = neckPitchBase + nodWave * neckBob + Math.sin(t * 0.9) * 0.022 * this.weights.idle;

    B.Neck1.rotation.x = neckPitch * 0.45 + this.smoothPitch * 0.25;
    B.Neck2.rotation.x = neckPitch * 0.35 + this.smoothPitch * 0.25;
    B.Neck3.rotation.x = neckPitch * 0.20 + this.smoothPitch * 0.20;
    // Keep head Counter-balanced near vertical ("on the bit" / natural horizon balance)
    B.Head.rotation.x = -neckPitch * 0.42 + this.smoothPitch * 0.35;

    const totalNeckYaw = lateralBend * 0.85 + this.smoothYaw;
    B.Neck1.rotation.y = totalNeckYaw * 0.28;
    B.Neck2.rotation.y = totalNeckYaw * 0.32;
    B.Neck3.rotation.y = totalNeckYaw * 0.22;
    B.Head.rotation.y = totalNeckYaw * 0.38;
    B.Head.rotation.z = -totalNeckYaw * 0.12;

    // 5. Evaluate All 4 Limbs with Phase-Blended Biomechanics!
    if (moveAmount > 0.002) {
      for (const limb of ['FL', 'FR', 'HL', 'HR']) {
        const limbPhase = this._computeBlendedLimbPhase(limb);
        const isFore = limb.startsWith('F');
        if (isFore) {
          this._poseForelimb(limb, limbPhase, duty, foreSwing, kneeFold, fetlockLoad, moveAmount);
        } else {
          this._poseHindlimb(limb, limbPhase, duty, hindSwing, hockFold, fetlockLoad, moveAmount);
        }
      }
    } else {
      // Subtle idle fetlock load & resting shift
      for (const limb of ['FL', 'FR', 'HL', 'HR']) {
        B[`${limb}_Fetlock`].rotation.x = -0.03;
        B[`${limb}_Hoof`].rotation.x = 0.03;
      }
    }

    // 6. Layer Interactive Special Actions (Graze, Whinny, Pet, Rear!)
    this._applySpecialActions(dt, rearFactor, grazeFactor, whinnyEnv);

    // 7. Advance World Position if in 'roam' mode
    if (this.locomotionMode === 'roam' && this.currentSpeed > 0.01) {
      this.horseGroup.rotation.y = this.heading;
      this.horseGroup.position.x += Math.sin(this.heading) * this.currentSpeed * dt;
      this.horseGroup.position.z += Math.cos(this.heading) * this.currentSpeed * dt;

      // Soft boundary steering inside meadow arena (radius ~ 26m)
      const distFromOrigin = Math.hypot(this.horseGroup.position.x, this.horseGroup.position.z);
      if (distFromOrigin > 26.0) {
        const scale = 26.0 / distFromOrigin;
        this.horseGroup.position.x *= scale;
        this.horseGroup.position.z *= scale;
      }
    }

    // 8. Exact Ground-Contact & Aerial Suspension Solver
    B.Root.position.y = 0;
    B.Root.updateMatrixWorld(true);

    let minSoleLocalY = Infinity;
    const soleLocalYs = {};
    for (const limb of ['FL', 'FR', 'HL', 'HR']) {
      const hoofBone = B[`${limb}_Hoof`];
      this._vHoof.copy(this._soleLocalOffsets[limb]);
      hoofBone.localToWorld(this._vHoof);
      this.horseGroup.worldToLocal(this._vHoof);
      soleLocalYs[limb] = this._vHoof.y;
      if (this._vHoof.y < minSoleLocalY) {
        minSoleLocalY = this._vHoof.y;
      }
    }

    // In grounded gaits (idle, walk, graze, rear) or whenever any hoof dips below 0, plant lowest hoof at y = 0!
    // In aerial suspension of trot/canter/gallop when verticalBounce > 0, allow genuine flight clearance!
    const allowFlight = (this.weights.trot + this.weights.canter + this.weights.gallop) > 0.35 && rearFactor < 0.05;
    if (!allowFlight || minSoleLocalY < 0.0) {
      B.Root.position.y = -minSoleLocalY;
    } else {
      // Cap max aerial clearance for crisp realism
      const desiredClearance = Math.min(minSoleLocalY, 0.065);
      B.Root.position.y = desiredClearance - minSoleLocalY;
    }
    B.Root.updateMatrixWorld(true);

    // 9. Detect Hoofstrikes for Dust Puffs & Hoofprints
    if (this.onHoofStrike && (moveAmount > 0.15 || rearFactor > 0.1)) {
      for (const limb of ['FL', 'FR', 'HL', 'HR']) {
        const hoofBone = B[`${limb}_Hoof`];
        this._vHoof.copy(this._soleLocalOffsets[limb]);
        hoofBone.localToWorld(this._vHoof);
        const onGround = this._vHoof.y < 0.028;
        if (onGround && !this.prevStance[limb]) {
          const intensity = THREE.MathUtils.clamp(this.currentSpeed / 10.0 + rearFactor * 0.6, 0.2, 1.0);
          this.onHoofStrike(limb, this._vHoof.clone(), intensity);
        }
        this.prevStance[limb] = onGround;
      }
    }

    // 10. Simulate Dynamic Tail & Mane Spring Chains
    this._updateHairPhysics(dt, tailLift, moveAmount, rearFactor, whinnyEnv);
  }

  _computeBlendedLimbPhase(limb) {
    // Circular vector average of phase offsets so transitions between diagonal/lateral gaits never snap!
    let sumSin = 0, sumCos = 0;
    const tau = Math.PI * 2.0;
    for (const [k, w] of Object.entries(this.weights)) {
      if (w <= 0 || k === 'idle') continue;
      const offset = GAIT_CONFIGS[k].phases[limb];
      const ang = (this.stridePhase + offset) * tau;
      sumSin += Math.sin(ang) * w;
      sumCos += Math.cos(ang) * w;
    }
    if (sumSin === 0 && sumCos === 0) return 0;
    let p = Math.atan2(sumSin, sumCos) / tau;
    if (p < 0) p += 1.0;
    return p;
  }

  /**
   * Poses Forelimb (Scapula -> Shoulder -> Elbow -> Knee -> Fetlock -> Hoof).
   * Remember: -rotation.x swings forward (+Z), +rotation.x swings/folds backward (-Z)!
   * Equine knee (carpus) ONLY flexes backward (+rotation.x >= 0)!
   */
  _poseForelimb(limb, p, duty, swingAmp, kneeFoldAmp, fetlockLoad, blend) {
    const B = this.bones;
    let scapRot = 0, shldRot = 0, elbRot = 0, kneeRot = 0, fetRot = 0, hoofRot = 0;

    if (p < duty) {
      // STANCE PHASE: sweeps from forward touchdown (u=0) to rear breakover (u=1)
      const u = p / duty;
      const sweep = THREE.MathUtils.lerp(-swingAmp, swingAmp * 0.95, u);

      scapRot = sweep * 0.48;
      shldRot = sweep * 0.22;
      elbRot = sweep * 0.30;
      kneeRot = 0.0; // Locked straight column during weight-bearing stance!

      // Suspensory apparatus spring-drop at mid-stance + heel-lift breakover at u > 0.80
      const loadCurve = Math.sin(u * Math.PI);
      const breakover = u > 0.78 ? Math.pow((u - 0.78) / 0.22, 1.6) * 0.45 : 0.0;
      fetRot = -fetlockLoad * loadCurve + breakover * 0.65;

      // Compensate hoof angle so sole remains parallel to ground until breakover!
      const limbTotalRot = scapRot + shldRot + elbRot + kneeRot + fetRot;
      hoofRot = -limbTotalRot * 0.88 + breakover * 0.85;
    } else {
      // SWING PHASE: rear liftoff (w=0) -> high folded knee mid-swing -> extended reach forward (w=1)
      const w = (p - duty) / (1.0 - duty);
      const swingCos = Math.cos(w * Math.PI); // +1 at liftoff (back) -> -1 at touchdown (front)
      const sweep = swingCos * swingAmp;

      // Lift humerus/elbow smoothly during swing
      const liftBell = Math.sin(w * Math.PI);
      scapRot = sweep * 0.50 - liftBell * 0.10;
      shldRot = sweep * 0.20 - liftBell * 0.22;
      elbRot = sweep * 0.30 - liftBell * 0.26;

      // Knee (carpus) folds strongly BACKWARD (+x) in early-mid swing, then snaps straight for reach!
      const foldEnvelope = Math.pow(Math.sin(Math.pow(w, 0.82) * Math.PI), 1.15);
      kneeRot = kneeFoldAmp * foldEnvelope;

      // Fetlock & Hoof flex backward during swing, extending forward right before touchdown
      const pasternCurl = Math.sin(Math.pow(w, 0.78) * Math.PI);
      fetRot = pasternCurl * 0.52 - (1.0 - pasternCurl) * 0.05;
      hoofRot = pasternCurl * 0.32;
    }

    B[`${limb}_Scapula`].rotation.x = scapRot * blend;
    B[`${limb}_Shoulder`].rotation.x = shldRot * blend;
    B[`${limb}_Elbow`].rotation.x = elbRot * blend;
    B[`${limb}_Knee`].rotation.x = kneeRot * blend;
    B[`${limb}_Fetlock`].rotation.x = fetRot * blend;
    B[`${limb}_Hoof`].rotation.x = hoofRot * blend;
  }

  /**
   * Poses Hindlimb (Hip -> Stifle -> Hock -> Fetlock -> Hoof).
   * Osteology: Stifle flexes (+x), Hock flexes anteriorly (-x), Fetlock curls (+x) in swing!
   */
  _poseHindlimb(limb, p, duty, swingAmp, hockFoldAmp, fetlockLoad, blend) {
    const B = this.bones;
    let hipRot = 0, stifleRot = 0, hockRot = 0, fetRot = 0, hoofRot = 0;

    if (p < duty) {
      // STANCE PHASE: deep forward engagement under body (u=0) -> powerful rear propulsion (u=1)
      const u = p / duty;
      const sweep = THREE.MathUtils.lerp(-swingAmp, swingAmp * 1.05, u);

      hipRot = sweep * 0.55;
      // Slight athletic engagement bend at mid-stance, extending powerfully at pushoff
      const engage = Math.sin(u * Math.PI) * 0.08;
      stifleRot = sweep * 0.28 + engage;
      hockRot = sweep * 0.17 - engage * 1.4;

      const loadCurve = Math.sin(u * Math.PI);
      const breakover = u > 0.78 ? Math.pow((u - 0.78) / 0.22, 1.6) * 0.50 : 0.0;
      fetRot = -fetlockLoad * loadCurve + breakover * 0.65;

      const limbTotalRot = B.Pelvis.rotation.x + hipRot + stifleRot + hockRot + fetRot;
      hoofRot = -limbTotalRot * 0.88 + breakover * 0.85;
    } else {
      // SWING PHASE: pushoff (w=0) -> folded hock & stifle -> deep forward reach (w=1)
      const w = (p - duty) / (1.0 - duty);
      const swingCos = Math.cos(w * Math.PI);
      const sweep = swingCos * swingAmp;

      const foldBell = Math.pow(Math.sin(Math.pow(w, 0.85) * Math.PI), 1.15);
      hipRot = sweep * 0.62 - foldBell * 0.16;
      stifleRot = sweep * 0.22 + foldBell * hockFoldAmp * 0.68;
      hockRot = sweep * 0.16 - foldBell * hockFoldAmp * 1.05;

      fetRot = foldBell * 0.58;
      hoofRot = foldBell * 0.30;
    }

    B[`${limb}_Hip`].rotation.x = hipRot * blend;
    B[`${limb}_Stifle`].rotation.x = stifleRot * blend;
    B[`${limb}_Hock`].rotation.x = hockRot * blend;
    B[`${limb}_Fetlock`].rotation.x = fetRot * blend;
    B[`${limb}_Hoof`].rotation.x = hoofRot * blend;
  }

  _getRearEnvelope() {
    if (this.activeAction !== 'rear') return 0;
    const u = Math.min(1.0, this.actionTimer / this.actionDuration);
    // Smooth S-curve rise (0..0.32), dramatic poised hold (0.32..0.72), controlled descent (0.72..1.0)
    if (u < 0.30) return THREE.MathUtils.smoothstep(u, 0.0, 0.30);
    if (u < 0.70) return 1.0;
    return 1.0 - THREE.MathUtils.smoothstep(u, 0.70, 1.0);
  }

  _getGrazeEnvelope() {
    if (this.activeAction !== 'graze') return 0;
    const u = Math.min(1.0, this.actionTimer / this.actionDuration);
    if (u < 0.22) return THREE.MathUtils.smoothstep(u, 0.0, 0.22);
    if (u < 0.80) return 1.0;
    return 1.0 - THREE.MathUtils.smoothstep(u, 0.80, 1.0);
  }

  _getWhinnyEnvelope() {
    if (this.activeAction !== 'whinny') return 0;
    const u = Math.min(1.0, this.actionTimer / this.actionDuration);
    return Math.sin(u * Math.PI);
  }

  _applySpecialActions(dt, rearEnv, grazeEnv, whinnyEnv) {
    if (!this.activeAction) return;
    this.actionTimer += dt;
    const B = this.bones;
    const t = this.time;

    // 1. DRAMATIC REAR UP (Levade / Pesade onto hind legs with pawing forelegs!)
    if (rearEnv > 0.001) {
      // Pitch Pelvis upward around hind quarters (-rotation.x lifts chest & forehand high into the air!)
      const rearPitch = -0.82 * rearEnv; // ~47 degrees dramatic rear!
      B.Pelvis.rotation.x += rearPitch;
      B.Pelvis.position.y -= 0.16 * rearEnv; // Crouch hindquarters into athletic haunch engagement
      B.Lumbar.rotation.x += -0.08 * rearEnv;

      // Hind legs bend deeply at hip/stifle/hock to balance under center of mass while keeping soles flat!
      for (const limb of ['HL', 'HR']) {
        B[`${limb}_Hip`].rotation.x = 0.56 * rearEnv;
        B[`${limb}_Stifle`].rotation.x = 0.42 * rearEnv;
        B[`${limb}_Hock`].rotation.x = -0.22 * rearEnv;
        B[`${limb}_Fetlock`].rotation.x = -0.10 * rearEnv;
        // Keep hind hooves planted flat despite Pelvis rearPitch!
        const total = B.Pelvis.rotation.x + B[`${limb}_Hip`].rotation.x + B[`${limb}_Stifle`].rotation.x + B[`${limb}_Hock`].rotation.x + B[`${limb}_Fetlock`].rotation.x;
        B[`${limb}_Hoof`].rotation.x = -total;
      }

      // Proud arched crest & tucked head, open jaw whinnying!
      B.Neck1.rotation.x += 0.28 * rearEnv;
      B.Neck2.rotation.x += 0.26 * rearEnv;
      B.Neck3.rotation.x += 0.20 * rearEnv;
      B.Head.rotation.x += 0.22 * rearEnv;
      B.Jaw.rotation.x = 0.24 * rearEnv * (0.6 + 0.4 * Math.sin(t * 9.0));

      // Alternating pawing forelegs in the air!
      const pawL = Math.sin(t * 7.5);
      const pawR = Math.sin(t * 7.5 + Math.PI * 0.85);
      for (const [limb, paw] of [['FL', pawL], ['FR', pawR]]) {
        B[`${limb}_Scapula`].rotation.x = (-0.28 + paw * 0.18) * rearEnv;
        B[`${limb}_Shoulder`].rotation.x = (-0.22 + paw * 0.12) * rearEnv;
        B[`${limb}_Elbow`].rotation.x = -0.35 * rearEnv;
        B[`${limb}_Knee`].rotation.x = (1.05 - paw * 0.35) * rearEnv;
        B[`${limb}_Fetlock`].rotation.x = (0.55 - paw * 0.20) * rearEnv;
        B[`${limb}_Hoof`].rotation.x = 0.25 * rearEnv;
      }
    }

    // 2. GRAZE MEADOW GRASS (Smooth deep neck stretch down to grass with subtle nibbling!)
    if (grazeEnv > 0.001) {
      const nibble = Math.sin(t * 8.5) * 0.035 * (this.actionTimer > 0.9 ? 1.0 : 0.0);
      B.Neck1.rotation.x += 0.62 * grazeEnv;
      B.Neck2.rotation.x += 0.48 * grazeEnv + nibble;
      B.Neck3.rotation.x += 0.32 * grazeEnv;
      B.Head.rotation.x += -0.36 * grazeEnv - nibble * 1.4;
      B.Jaw.rotation.x += Math.max(0, Math.sin(t * 11.0)) * 0.14 * grazeEnv;
      // Slight foreleg spread/stance balance when grazing
      B.FL_Scapula.rotation.x -= 0.08 * grazeEnv;
      B.FR_Scapula.rotation.x += 0.07 * grazeEnv;
    }

    // 3. WHINNY / HEAD TOSS
    if (whinnyEnv > 0.001) {
      const shake = Math.sin(t * 14.0) * 0.08 * whinnyEnv;
      B.Neck1.rotation.x -= 0.18 * whinnyEnv;
      B.Neck2.rotation.x -= 0.16 * whinnyEnv;
      B.Head.rotation.x -= 0.22 * whinnyEnv;
      B.Head.rotation.z += shake;
      B.Jaw.rotation.x = 0.28 * whinnyEnv * (0.7 + 0.3 * Math.sin(t * 16.0));
    }

    // 4. PET / AFFECTIONATE NOD
    if (this.activeAction === 'pet') {
      const petEnv = Math.sin(Math.min(1.0, this.actionTimer / this.actionDuration) * Math.PI);
      const nod = Math.sin(this.actionTimer * 7.5) * 0.14 * petEnv;
      B.Neck3.rotation.x += nod * 0.5;
      B.Head.rotation.x += nod;
      B.Head.rotation.z += 0.08 * petEnv;
    }

    if (this.actionTimer >= this.actionDuration) {
      this.activeAction = null;
    }
  }

  _updateHairPhysics(dt, tailLift, moveAmount, rearEnv, whinnyEnv) {
    const B = this.bones;
    const t = this.time;

    // Update shader wind uniform for fine strand flutter
    const apparentWind = 0.30 + (this.currentSpeed / 10.5) * 1.15 + rearEnv * 0.45;
    if (this.uniforms && this.uniforms.uTime) {
      this.uniforms.uTime.value = t;
      this.uniforms.uWindStrength.value = apparentWind;
    }

    // 1. 8-Bone Tail Chain Physics (streaming BACKWARD in wind/speed, bouncing with pelvis, swishing flies!)
    // Right-hand rule around +X on downward tail bones: +rotation.x lifts/streams tail BACKWARD (-Z)!
    const speedStream = Math.min(0.62, this.currentSpeed * 0.052);
    const bounceDrive = Math.cos(this.stridePhase * Math.PI * (this.weights.canter + this.weights.gallop > 0.5 ? 2 : 4)) * 0.12 * moveAmount;
    const flySwish = (Math.sin(t * 1.7) * Math.pow(Math.max(0, Math.sin(t * 0.45)), 3.0) * 0.32)
                   + whinnyEnv * Math.sin(t * 8.0) * 0.32;

    // Counteract Pelvis rearPitch (-0.82 * rearEnv) so during Rear Up the tail hangs & streams behind hocks!
    B.Tail0.rotation.x = tailLift * 0.55 + speedStream * 0.38 + rearEnv * 0.72;
    B.Tail0.rotation.z = flySwish * 0.25 - this.turnRate * 0.12;

    for (let i = 1; i < 8; i++) {
      const targetX = speedStream * 0.085 + bounceDrive * (0.04 + i * 0.012) * Math.sin(t * 6.0 - i * 0.55);
      // Clamp >= -0.02 so tail NEVER swings forward between hind legs!
      const springK = 26.0 - i * 1.8;
      const damp = 5.5;
      const accX = (targetX - this.tailAnglesX[i]) * springK - this.tailVelX[i] * damp;
      this.tailVelX[i] += accX * dt;
      this.tailAnglesX[i] = THREE.MathUtils.clamp(this.tailAnglesX[i] + this.tailVelX[i] * dt, -0.02, 0.22);

      const targetZ = Math.sin(t * 3.2 - i * 0.48) * (0.02 + moveAmount * 0.04)
                    + flySwish * 0.12
                    - this.turnRate * 0.06;
      const accZ = (targetZ - this.tailAnglesZ[i]) * (springK * 0.8) - this.tailVelZ[i] * damp;
      this.tailVelZ[i] += accZ * dt;
      this.tailAnglesZ[i] = THREE.MathUtils.clamp(this.tailAnglesZ[i] + this.tailVelZ[i] * dt, -0.25, 0.25);

      const bone = B[`Tail${i}`];
      bone.rotation.x = this.tailAnglesX[i];
      bone.rotation.z = this.tailAnglesZ[i];
    }

    // 2. Mane & Forelock Spring Bones (toss upward & outward with stride bounce, wind & turns!)
    const neckBounce = Math.sin(this.stridePhase * Math.PI * (this.weights.canter + this.weights.gallop > 0.5 ? 2 : 4) - 0.6);
    for (let m = 0; m < 5; m++) {
      const targetSwing = (0.05 + moveAmount * 0.22) * (0.5 + 0.5 * neckBounce)
                        + Math.sin(t * 3.8 - m * 0.5) * 0.05 * apparentWind
                        + rearEnv * 0.28;
      const acc = (targetSwing - this.maneSwingZ[m]) * 28.0 - this.maneVelZ[m] * 5.8;
      this.maneVelZ[m] += acc * dt;
      this.maneSwingZ[m] += this.maneVelZ[m] * dt;

      const mb = B[`Mane${m}`];
      // Positive rotation.z swings right-draping (-X) locks outward & upward away from neck!
      mb.rotation.z = -this.maneSwingZ[m];
      mb.rotation.x = (moveAmount * 0.14 + Math.sin(t * 4.5 - m * 0.4) * 0.04) * apparentWind;
    }

    B.Forelock.rotation.x = -0.06 - Math.max(0, neckBounce) * 0.18 * moveAmount - rearEnv * 0.22;
    B.Forelock.rotation.z = Math.sin(t * 3.4) * 0.08 * apparentWind - this.turnRate * 0.08;
  }

  _updateRoamControls(dt) {
    const anyDriveKey = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
    if (anyDriveKey && this.locomotionMode !== 'roam') {
      this.locomotionMode = 'roam';
    }

    if (this.locomotionMode === 'roam') {
      if (this.keys.forward) {
        this.currentGait = this.keys.sprint ? 'gallop' : (this.currentGait === 'idle' || this.currentGait === 'walk' ? 'canter' : this.currentGait);
      } else if (this.keys.backward) {
        this.currentGait = 'idle';
      }

      let desiredTurn = 0;
      if (this.keys.left) desiredTurn += 1.35;
      if (this.keys.right) desiredTurn -= 1.35;
      this.turnRate = THREE.MathUtils.lerp(this.turnRate, desiredTurn, 1.0 - Math.exp(-dt * 6.0));
      this.heading += this.turnRate * dt * (0.35 + 0.65 * Math.min(1.0, this.currentSpeed / 3.0));
    } else {
      this.turnRate = THREE.MathUtils.lerp(this.turnRate, 0.0, 1.0 - Math.exp(-dt * 6.0));
    }
  }
}
