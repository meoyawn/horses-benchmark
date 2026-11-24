import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Horse } from './horse/Horse.js';
import { Environment } from './world/Environment.js';
import { HoofEffects } from './world/HoofEffects.js';

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
renderer.toneMappingExposure = 1.06;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.08,
  350
);
camera.position.set(-3.55, 1.60, 3.05); // 3/4 Hero view framed cleanly alongside HUD panel!

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.85;
controls.maxDistance = 16.0;
controls.maxPolarAngle = Math.PI * 0.492; // Keep camera slightly above ground plane
controls.target.set(0.28, 1.15, 0.48);
controls.update();

// =========================================================================
// 2. WORLD, HORSE & HOOF EFFECTS INITIALIZATION
// =========================================================================
const environment = new Environment(renderer, scene);
const hoofEffects = new HoofEffects(scene);

const horse = new Horse('bay');
scene.add(horse.group);

// Optional live 48-bone SkeletonHelper for technical inspection
const skeletonHelper = new THREE.SkeletonHelper(horse.bones[0]);
skeletonHelper.visible = false;
scene.add(skeletonHelper);

let movementMode = 'inPlace'; // 'inPlace' | 'circle' | 'roam'
let timeScale = 1.0;

horse.animator.onHoofStrike = (_limb, worldPos, intensity) => {
  const isStudio = environment.activePreset && environment.activePreset.isStudio;
  if (!isStudio) {
    hoofEffects.emitHoofStrike(
      worldPos,
      horse.group.rotation.y,
      intensity,
      movementMode !== 'inPlace'
    );
  }
};

// =========================================================================
// 3. CAMERA PRESETS & ORBIT TRACKING
// =========================================================================
const CAMERA_PRESETS = {
  hero: { offset: new THREE.Vector3(-3.55, 1.60, 3.05), target: new THREE.Vector3(0.28, 1.15, 0.48) },
  profile: { offset: new THREE.Vector3(-4.25, 1.30, 0.25), target: new THREE.Vector3(0.0, 1.12, 0.25) },
  portrait: { offset: new THREE.Vector3(-1.28, 1.84, 1.72), target: new THREE.Vector3(0.08, 1.72, 1.12) },
  low: { offset: new THREE.Vector3(-2.95, 0.58, 2.75), target: new THREE.Vector3(0.22, 1.15, 0.42) },
};

let camTransition = null;

function applyCameraPreset(key, instant = false) {
  const p = CAMERA_PRESETS[key];
  if (!p) return;

  // Transform preset offset & target by current horse world transform!
  const rotY = horse.group.rotation.y;
  const desiredPos = p.offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(horse.group.position);
  const desiredTarget = p.target.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(horse.group.position);

  if (instant) {
    camTransition = null;
    camera.position.copy(desiredPos);
    controls.target.copy(desiredTarget);
    controls.update();
    return;
  }

  camTransition = {
    startPos: camera.position.clone(),
    endPos: desiredPos,
    startTarget: controls.target.clone(),
    endTarget: desiredTarget,
    t: 0,
    duration: 0.62,
  };
}

// =========================================================================
// 4. CURSOR INTERACTION (Gaze Tracking + Click-to-Pet Raycasting)
// =========================================================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const gazeWorldPt = new THREE.Vector3();
let pointerActive = false;
let pointerDownPos = new THREE.Vector2();

window.addEventListener('pointermove', (e) => {
  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerActive = true;
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownPos.set(e.clientX, e.clientY);
});

renderer.domElement.addEventListener('pointerup', (e) => {
  // Distinguish clean click from orbit drag
  if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 6) return;
  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects([horse.bodyMesh, horse.earsMesh], false);
  if (hits.length > 0) {
    horse.triggerAction('pet');
  }
});

// =========================================================================
// 5. UI & KEYBOARD WIRING
// =========================================================================
function setActiveButton(containerId, attrName, value) {
  const group = document.getElementById(containerId);
  if (!group) return;
  for (const btn of group.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset[attrName] === value);
  }
}

document.getElementById('gait-buttons').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-gait]');
  if (!btn) return;
  const gait = btn.dataset.gait;
  horse.setGait(gait);
  setActiveButton('gait-buttons', 'gait', gait);
});

document.getElementById('coat-buttons').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-coat]');
  if (!btn) return;
  const coat = btn.dataset.coat;
  horse.setCoat(coat);
  setActiveButton('coat-buttons', 'coat', coat);
});

document.getElementById('camera-buttons').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-cam]');
  if (!btn) return;
  const cam = btn.dataset.cam;
  applyCameraPreset(cam);
  setActiveButton('camera-buttons', 'cam', cam);
});

document.getElementById('env-buttons').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-env]');
  if (!btn) return;
  const env = btn.dataset.env;
  environment.applyPreset(env);
  hoofEffects.puffMesh.visible = env !== 'studio';
  hoofEffects.printMesh.visible = env !== 'studio';
  setActiveButton('env-buttons', 'env', env);
});

function setMovementMode(mode) {
  movementMode = mode;
  setActiveButton('mode-buttons', 'mode', mode);
  if (mode === 'inPlace') {
    horse.animator.locomotionMode = 'inPlace';
    horse.resetPosition();
    applyCameraPreset('hero', true);
  } else if (mode === 'circle') {
    horse.animator.locomotionMode = 'roam';
    if (horse.animator.currentGait === 'idle') {
      horse.setGait('canter');
      setActiveButton('gait-buttons', 'gait', 'canter');
    }
    horse.group.position.set(-13.5, 0, 0);
    horse.group.rotation.y = 0;
    horse.animator.heading = 0;
    applyCameraPreset('hero', true);
  } else if (mode === 'roam') {
    horse.animator.locomotionMode = 'roam';
  }
}

document.getElementById('mode-buttons').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  setMovementMode(btn.dataset.mode);
});

document.querySelectorAll('.action-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    horse.triggerAction(action);
    if (action === 'graze') {
      setActiveButton('gait-buttons', 'gait', 'idle');
    }
  });
});

const speedSlider = document.getElementById('speed-slider');
const speedReadout = document.getElementById('speed-readout');
speedSlider.addEventListener('input', () => {
  timeScale = parseFloat(speedSlider.value);
  speedReadout.textContent = `${timeScale.toFixed(2)}×`;
});

document.getElementById('gaze-toggle').addEventListener('change', (e) => {
  horse.animator.lookAtEnabled = e.target.checked;
});

document.getElementById('skeleton-toggle').addEventListener('change', (e) => {
  skeletonHelper.visible = e.target.checked;
});

const hudPanel = document.getElementById('hud-panel');
const toggleHudBtn = document.getElementById('toggle-hud-btn');
function toggleHUD() {
  const hidden = hudPanel.classList.toggle('hidden');
  toggleHudBtn.textContent = hidden ? 'Show UI' : 'Hide UI';
}
toggleHudBtn.addEventListener('click', toggleHUD);

// Keyboard Driving & Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.repeat && e.code === 'Space') return;
  const k = horse.animator.keys;
  switch (e.code) {
    case 'KeyW':
    case 'ArrowUp':
      k.forward = true;
      if (movementMode !== 'roam') setMovementMode('roam');
      break;
    case 'KeyS':
    case 'ArrowDown':
      k.backward = true;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      k.left = true;
      if (movementMode !== 'roam') setMovementMode('roam');
      break;
    case 'KeyD':
    case 'ArrowRight':
      k.right = true;
      if (movementMode !== 'roam') setMovementMode('roam');
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      k.sprint = true;
      break;
    case 'Space':
      e.preventDefault();
      horse.triggerAction('rear');
      break;
    case 'KeyH':
      toggleHUD();
      break;
    case 'Digit1':
      horse.setGait('idle');
      setActiveButton('gait-buttons', 'gait', 'idle');
      break;
    case 'Digit2':
      horse.setGait('walk');
      setActiveButton('gait-buttons', 'gait', 'walk');
      break;
    case 'Digit3':
      horse.setGait('trot');
      setActiveButton('gait-buttons', 'gait', 'trot');
      break;
    case 'Digit4':
      horse.setGait('canter');
      setActiveButton('gait-buttons', 'gait', 'canter');
      break;
    case 'Digit5':
      horse.setGait('gallop');
      setActiveButton('gait-buttons', 'gait', 'gallop');
      break;
  }
});

window.addEventListener('keyup', (e) => {
  const k = horse.animator.keys;
  switch (e.code) {
    case 'KeyW':
    case 'ArrowUp':
      k.forward = false;
      break;
    case 'KeyS':
    case 'ArrowDown':
      k.backward = false;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      k.left = false;
      break;
    case 'KeyD':
    case 'ArrowRight':
      k.right = false;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      k.sprint = false;
      break;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =========================================================================
// 6. MAIN ANIMATION LOOP
// =========================================================================
const clock = new THREE.Clock();
const prevHorsePos = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);

function animate() {
  requestAnimationFrame(animate);

  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = rawDt * timeScale;

  // Project cursor onto plane in front of camera for subtle equine gaze tracking
  if (pointerActive && horse.animator.lookAtEnabled) {
    raycaster.setFromCamera(pointerNDC, camera);
    raycaster.ray.at(3.2, gazeWorldPt);
    horse.animator.setLookTargetWorld(gazeWorldPt);
  } else {
    horse.animator.setLookTargetWorld(null);
  }

  prevHorsePos.copy(horse.group.position);
  const prevHorseYaw = horse.group.rotation.y;

  // Autonomous paddock circle steering if in 'circle' mode
  if (movementMode === 'circle') {
    const speed = Math.max(1.5, horse.animator.currentSpeed);
    const radius = 13.5;
    const omega = speed / radius;
    horse.animator.turnRate = omega * 1.4;
    horse.animator.heading += omega * dt;
    setActiveButton('gait-buttons', 'gait', horse.animator.currentGait);
  } else if (movementMode === 'roam') {
    setActiveButton('gait-buttons', 'gait', horse.animator.currentGait);
  }

  horse.update(dt);

  // Translate & gently co-rotate camera along with horse displacement/heading in roam/circle mode
  const deltaMove = horse.group.position.clone().sub(prevHorsePos);
  const deltaYaw = horse.group.rotation.y - prevHorseYaw;
  if (deltaMove.lengthSq() > 1e-8) {
    camera.position.add(deltaMove);
    controls.target.add(deltaMove);
  }
  if (Math.abs(deltaYaw) > 1e-6 && movementMode !== 'inPlace') {
    camera.position.sub(horse.group.position).applyAxisAngle(upAxis, deltaYaw).add(horse.group.position);
    controls.target.sub(horse.group.position).applyAxisAngle(upAxis, deltaYaw).add(horse.group.position);
  }

  // Smooth camera preset transitions
  if (camTransition) {
    camTransition.t += rawDt / camTransition.duration;
    if (camTransition.t >= 1.0) {
      camera.position.copy(camTransition.endPos);
      controls.target.copy(camTransition.endTarget);
      camTransition = null;
    } else {
      const s = THREE.MathUtils.smoothstep(camTransition.t, 0, 1);
      camera.position.lerpVectors(camTransition.startPos, camTransition.endPos, s);
      controls.target.lerpVectors(camTransition.startTarget, camTransition.endTarget, s);
    }
  }

  controls.update();
  environment.update(dt, horse.group.position);
  hoofEffects.update(dt);

  renderer.render(scene, camera);
}

animate();
