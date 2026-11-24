/**
 * main.js — Equus Interactive 3D Procedural Horse Application
 * Built completely from scratch in Three.js with zero third-party models or textures.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { buildHorseBody, buildEquineEyes } from './geometry/horseMesh.js';
import {
  buildManeAndForelockGeometry,
  buildTailGeometry,
  buildFetlockTuftsGeometry,
  createHairMaterial,
} from './geometry/horseHair.js';
import { buildLeatherHalter } from './geometry/horseHalter.js';
import {
  COAT_PRESETS,
  createCoatDetailTextures,
  createEquineEyeTexture,
  createHairStrandTextures,
  createLeatherTextures,
  createHorseCoatMaterial,
  applyCoatPreset,
} from './textures/coatTextures.js';
import {
  createEquineSkeleton,
  computeSkinWeights,
  attachWorldObjectToBone,
} from './rig/skeleton.js';
import { EquineAnimator } from './rig/animations.js';
import { createMeadowEnvironment } from './environment/meadowScene.js';
import { HoofAudioEngine } from './audio/hoofAudio.js';

// =========================================================================
// 1. RENDERER, SCENE & CAMERA SETUP
// =========================================================================
const container = document.getElementById('canvas-container');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.08,
  160
);
camera.position.set(3.40, 1.65, 2.88);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0.0, 1.18, 0.10);
controls.minDistance = 0.72;
controls.maxDistance = 12.0;
controls.maxPolarAngle = Math.PI * 0.492; // Never clip underground!
controls.update();

// =========================================================================
// 2. PROCEDURAL ENVIRONMENT & LIGHTING
// =========================================================================
const meadow = createMeadowEnvironment(scene, renderer);
const audio = new HoofAudioEngine();

// =========================================================================
// 3. PROCEDURAL HORSE GEOMETRY, RIG, TEXTURES, HAIR, EYES & HALTER
// =========================================================================
const horseGroup = new THREE.Group();
horseGroup.name = 'EquusHorse';
scene.add(horseGroup);

// Build watertight Catmull-Clark subdivided equine body mesh (2 levels -> ~13.8k quads / ~27.7k tris)
const { geometry: bodyGeo, landmarks, topologyReport } = buildHorseBody(2);

// Create 39-bone anatomical skeleton
const rig = createEquineSkeleton();
computeSkinWeights(bodyGeo, rig.restSegments, 'body');

// Procedural PBR textures
const coatDetailTex = createCoatDetailTextures(512);
const eyeTex = createEquineEyeTexture(512);
const hairTex = createHairStrandTextures(512);
const leatherTex = createLeatherTextures(256);

// Horse body SkinnedMesh
const initialPreset = COAT_PRESETS.bay;
const coatMaterial = createHorseCoatMaterial(coatDetailTex, 'bay');
const bodyMesh = new THREE.SkinnedMesh(bodyGeo, coatMaterial);
bodyMesh.name = 'HorseBody';
bodyMesh.castShadow = true;
bodyMesh.receiveShadow = true;
bodyMesh.frustumCulled = false;
bodyMesh.add(rig.rootBone);
bodyMesh.bind(rig.skeleton);
horseGroup.add(bodyMesh);

// Skinned Mane & Forelock
const maneGeo = buildManeAndForelockGeometry(landmarks);
computeSkinWeights(maneGeo, rig.restSegments, 'mane');
const maneMat = createHairMaterial(hairTex, initialPreset.maneColor, initialPreset.maneTipColor, 0.95);
const maneMesh = new THREE.SkinnedMesh(maneGeo, maneMat);
maneMesh.name = 'HorseMane';
maneMesh.castShadow = true;
maneMesh.receiveShadow = true;
maneMesh.frustumCulled = false;
maneMesh.bind(rig.skeleton);
horseGroup.add(maneMesh);

// Skinned Flowing Tail
const tailGeo = buildTailGeometry(landmarks);
computeSkinWeights(tailGeo, rig.restSegments, 'tail');
const tailMat = createHairMaterial(hairTex, initialPreset.tailColor, initialPreset.tailTipColor, 1.35);
const tailMesh = new THREE.SkinnedMesh(tailGeo, tailMat);
tailMesh.name = 'HorseTail';
tailMesh.castShadow = true;
tailMesh.receiveShadow = true;
tailMesh.frustumCulled = false;
tailMesh.bind(rig.skeleton);
horseGroup.add(tailMesh);

// Skinned Fetlock Tufts
const fetlockGeo = buildFetlockTuftsGeometry(landmarks);
computeSkinWeights(fetlockGeo, rig.restSegments, 'fetlock');
const fetlockMat = createHairMaterial(hairTex, initialPreset.pointColor, initialPreset.maneTipColor, 0.35);
const fetlockMesh = new THREE.SkinnedMesh(fetlockGeo, fetlockMat);
fetlockMesh.name = 'HorseFetlocks';
fetlockMesh.castShadow = true;
fetlockMesh.frustumCulled = false;
fetlockMesh.bind(rig.skeleton);
horseGroup.add(fetlockMesh);

const hairMaterials = { mane: maneMat, tail: tailMat, fetlock: fetlockMat };

// Multi-layer realistic equine eyes mounted cleanly to the head bone!
const { group: eyesGroup, lids: eyeLids, lidMat: eyeLidMat } = buildEquineEyes(landmarks, eyeTex);
attachWorldObjectToBone(eyesGroup, rig.boneMap.head);

// Optional handcrafted leather halter + brass hardware projected flush onto head mesh!
const halterGroup = buildLeatherHalter(leatherTex, bodyGeo);
attachWorldObjectToBone(halterGroup, rig.boneMap.head);

// Optional Skeleton visualization helper
const skeletonHelper = new THREE.SkeletonHelper(bodyMesh);
skeletonHelper.visible = false;
scene.add(skeletonHelper);

// Biomechanical equine animator
const animator = new EquineAnimator(rig, eyeLids, landmarks);

// =========================================================================
// 4. SMOOTH CAMERA PRESETS (generous framing so head, tail & hooves NEVER clip!)
// =========================================================================
const CAMERA_PRESETS = {
  hero:  { pos: new THREE.Vector3(3.40, 1.65, 2.88), target: new THREE.Vector3(0.0, 1.18, 0.10) },
  side:  { pos: new THREE.Vector3(4.85, 1.48, 0.12), target: new THREE.Vector3(0.0, 1.24, 0.06) },
  head:  { pos: new THREE.Vector3(0.95, 1.92, 1.96), target: new THREE.Vector3(0.0, 1.80, 1.14) },
  front: { pos: new THREE.Vector3(0.32, 1.48, 3.85), target: new THREE.Vector3(0.0, 1.16, 0.25) },
  rear:  { pos: new THREE.Vector3(-2.95, 1.56, -2.75), target: new THREE.Vector3(0.0, 1.14, -0.10) },
};

let camAnim = null;

function setCameraPreset(key, instant = false) {
  const p = CAMERA_PRESETS[key];
  if (!p) return;
  if (instant) {
    camera.position.copy(p.pos);
    controls.target.copy(p.target);
    controls.update();
    camAnim = null;
  } else {
    camAnim = {
      startPos: camera.position.clone(),
      endPos: p.pos.clone(),
      startTarget: controls.target.clone(),
      endTarget: p.target.clone(),
      t: 0,
      dur: 0.72,
    };
  }
  document.querySelectorAll('#camera-buttons .pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cam === key);
  });
}

// Cancel camera transition immediately if the user drags the orbit controls
controls.addEventListener('start', () => {
  camAnim = null;
});

// =========================================================================
// 5. POINTER INTERACTION (LOOK AT CURSOR + CLICK HORSE TO INTERACT!)
// =========================================================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let pointerDownPos = { x: 0, y: 0 };

window.addEventListener('pointermove', (e) => {
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = -(e.clientY / window.innerHeight) * 2 + 1;
  animator.setCursorNDC(x, y);
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointerup', (e) => {
  const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (dist > 6) return; // Was an orbit drag, not a click

  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);

  // Use bounding sphere quick-test + mesh raycast on body
  const hits = raycaster.intersectObject(bodyMesh, false);
  if (hits.length > 0) {
    const side = hits[0].point.x >= 0 ? 1 : -1;
    animator.triggerPoke(side);
    audio.playSnort();
  }
});

// =========================================================================
// 6. UI BINDINGS & KEYBOARD SHORTCUTS
// =========================================================================
const hudToggle = document.getElementById('hud-toggle');
const hudPanel = document.getElementById('hud-panel');
hudToggle.addEventListener('click', () => {
  const hidden = hudPanel.classList.toggle('hidden');
  hudToggle.classList.toggle('collapsed', hidden);
});

// Gait buttons
const gaitBtns = document.querySelectorAll('#gait-buttons .pill');
function selectGait(gaitKey) {
  animator.setGait(gaitKey);
  gaitBtns.forEach((b) => b.classList.toggle('active', b.dataset.gait === gaitKey));
  const grazeBtn = document.querySelector('#action-buttons [data-action="graze"]');
  if (grazeBtn && gaitKey !== 'idle') grazeBtn.classList.remove('active');
}
gaitBtns.forEach((btn) => {
  btn.addEventListener('click', () => selectGait(btn.dataset.gait));
});

// Play/Pause
const btnPlayPause = document.getElementById('btn-play-pause');
btnPlayPause.addEventListener('click', () => {
  animator.paused = !animator.paused;
  btnPlayPause.textContent = animator.paused ? 'Play' : 'Pause';
});

// Speed slider
const speedSlider = document.getElementById('speed-slider');
const speedVal = document.getElementById('speed-val');
speedSlider.addEventListener('input', () => {
  const v = parseFloat(speedSlider.value);
  animator.speedMultiplier = v;
  speedVal.textContent = `${v.toFixed(2)}×`;
});

// Interactive actions (Rear, Shake, Graze)
document.querySelectorAll('#action-buttons .pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    const act = btn.dataset.action;
    const active = animator.triggerAction(act);
    if (act === 'graze') {
      btn.classList.toggle('active', active);
      if (active) {
        gaitBtns.forEach((b) => b.classList.toggle('active', b.dataset.gait === 'idle'));
      }
    } else if (act === 'shake') {
      audio.playSnort();
    }
  });
});

// Coat presets
const coatBtns = document.querySelectorAll('#coat-swatches .swatch');
function selectCoat(coatKey) {
  applyCoatPreset(coatMaterial, hairMaterials, eyeLidMat, coatKey);
  coatBtns.forEach((b) => b.classList.toggle('active', b.dataset.coat === coatKey));
}
coatBtns.forEach((btn) => {
  btn.addEventListener('click', () => selectCoat(btn.dataset.coat));
});

// Lighting presets
const lightBtns = document.querySelectorAll('#lighting-buttons .pill');
function selectLighting(lightKey) {
  meadow.applyLightingPreset(lightKey);
  lightBtns.forEach((b) => b.classList.toggle('active', b.dataset.light === lightKey));
}
lightBtns.forEach((btn) => {
  btn.addEventListener('click', () => selectLighting(btn.dataset.light));
});

// Camera presets
document.querySelectorAll('#camera-buttons .pill').forEach((btn) => {
  btn.addEventListener('click', () => setCameraPreset(btn.dataset.cam, false));
});

// Toggles
document.getElementById('toggle-halter').addEventListener('change', (e) => {
  halterGroup.visible = e.target.checked;
});
document.getElementById('toggle-cursor').addEventListener('change', (e) => {
  animator.trackCursor = e.target.checked;
});
document.getElementById('toggle-sound').addEventListener('change', (e) => {
  audio.setEnabled(e.target.checked);
});
document.getElementById('toggle-skeleton').addEventListener('change', (e) => {
  skeletonHelper.visible = e.target.checked;
});
document.getElementById('toggle-wireframe').addEventListener('change', (e) => {
  coatMaterial.wireframe = e.target.checked;
});

// Keyboard shortcuts: 1-5 gaits, Space pause, R rear, G graze
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === '1') selectGait('idle');
  else if (e.key === '2') selectGait('walk');
  else if (e.key === '3') selectGait('trot');
  else if (e.key === '4') selectGait('canter');
  else if (e.key === '5') selectGait('gallop');
  else if (e.key === ' ') {
    e.preventDefault();
    btnPlayPause.click();
  } else if (e.key.toLowerCase() === 'r') {
    animator.triggerAction('rear');
  } else if (e.key.toLowerCase() === 'g') {
    document.querySelector('#action-buttons [data-action="graze"]')?.click();
  }
});

// Handle viewport resize cleanly
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =========================================================================
// 7. MAIN ANIMATION LOOP
// =========================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // Smooth camera preset easing
  if (camAnim) {
    camAnim.t += dt / camAnim.dur;
    const s = Math.min(1, camAnim.t);
    const ease = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
    camera.position.lerpVectors(camAnim.startPos, camAnim.endPos, ease);
    controls.target.lerpVectors(camAnim.startTarget, camAnim.endTarget, ease);
    if (s >= 1) camAnim = null;
  }

  controls.update();

  // Advance biomechanical horse animation
  const animState = animator.update(dt);

  // Update flowing hair shader uniforms
  const normSpeed = Math.min(1.6, animState.groundSpeed / 7.5);
  for (const m of [maneMat, tailMat, fetlockMat]) {
    const u = m.userData.hairUniforms;
    if (!u) continue;
    u.uTime.value = animator.time;
    u.uSpeed.value = normSpeed;
    u.uBounce.value = animState.hairBounce;
  }

  // Trigger hoof dust particles & optional procedural Web Audio hoofbeats!
  for (const imp of animState.hoofImpacts) {
    meadow.spawnHoofDust(imp.pos, imp.intensity, animState.groundSpeed);
    audio.playHoofBeat(imp.leg, imp.intensity);
  }

  // Advance infinite meadow, sky clouds, wind grass & dust
  meadow.update(dt, animator.time, animState.groundSpeed, camera);

  renderer.render(scene, camera);
}

animate();

// Expose clean inspection handle for interactive testing & debugging
window.__horseApp = {
  topologyReport,
  setGait: selectGait,
  setCoat: selectCoat,
  setLighting: selectLighting,
  setCamera: (key) => setCameraPreset(key, true),
  triggerAction: (a) => animator.triggerAction(a),
  setHalter: (v) => {
    halterGroup.visible = v;
    const cb = document.getElementById('toggle-halter');
    if (cb) cb.checked = v;
  },
  setSkeleton: (v) => {
    skeletonHelper.visible = v;
    const cb = document.getElementById('toggle-skeleton');
    if (cb) cb.checked = v;
  },
  setWireframe: (v) => {
    coatMaterial.wireframe = v;
    const cb = document.getElementById('toggle-wireframe');
    if (cb) cb.checked = v;
  },
  setHudVisible: (v) => {
    hudPanel.classList.toggle('hidden', !v);
    hudToggle.classList.toggle('collapsed', !v);
  },
};
