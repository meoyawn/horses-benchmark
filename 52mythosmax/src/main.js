import * as THREE from 'three';
import { buildHorse } from './horse.js';
import { buildEnvironment } from './environment.js';
import { OrbitCamera } from './controls.js';
import { Locomotion, GAIT_NAMES } from './gait.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2500);
const env = buildEnvironment(scene, renderer);
const horse = buildHorse();
scene.add(horse.root);
const loco = new Locomotion(horse);
const orbit = new OrbitCamera(camera, canvas);

const skeletonHelper = new THREE.SkeletonHelper(horse.bones.pelvis);
skeletonHelper.visible = false;
skeletonHelper.material.depthTest = false;
skeletonHelper.renderOrder = 5;
scene.add(skeletonHelper);

// Destination marker
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.32, 0.4, 48),
  new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0, depthWrite: false })
);
marker.rotation.x = -Math.PI / 2;
marker.position.y = 0.03;
scene.add(marker);

// ---- UI ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const gaitButtons = [...document.querySelectorAll('#gaits button')];
gaitButtons.forEach((b) => b.addEventListener('click', () => loco.setGait(Number(b.dataset.gait))));
$('rear').addEventListener('click', () => loco.rear());
$('graze').addEventListener('click', () => loco.toggleGraze());
$('coat').addEventListener('change', (e) => horse.setCoat(e.target.value));
$('markings').addEventListener('click', (e) => {
  horse.setCoat(horse.coatName, !horse.markings);
  e.currentTarget.classList.toggle('on', horse.markings);
});
let timeScale = 1;
$('slow').addEventListener('click', (e) => {
  timeScale = timeScale === 1 ? 0.2 : 1;
  e.currentTarget.classList.toggle('on', timeScale !== 1);
});
$('bones').addEventListener('click', (e) => {
  skeletonHelper.visible = !skeletonHelper.visible;
  e.currentTarget.classList.toggle('on', skeletonHelper.visible);
});

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (k === 'arrowup' || k === 'w') loco.setGait(Math.min(4, loco.gaitIndex + 1));
  else if (k === 'arrowdown' || k === 's') loco.setGait(Math.max(0, loco.gaitIndex - 1));
  else if (k === ' ') loco.rear();
  else keys.add(k);
  if (k.startsWith('arrow') || k === ' ') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// Pointer: the horse watches the cursor; clicks pet it or send it somewhere.
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const setRay = (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
};
const lookPoint = new THREE.Vector3();
orbit.onMove = (e) => {
  setRay(e);
  const d = camera.position.distanceTo(horse.bones.head.getWorldPosition(lookPoint));
  ray.ray.at(d * 0.8, lookPoint);
  loco.lookAt(lookPoint);
};
orbit.onClick = (e) => {
  setRay(e);
  if (ray.intersectObject(horse.mesh, false).length) {
    loco.pet();
    return;
  }
  const p = ray.ray.intersectPlane(groundPlane, new THREE.Vector3());
  if (p && p.distanceTo(camera.position) < 300) {
    loco.goTo(p);
    marker.position.set(p.x, 0.03, p.z);
    marker.material.opacity = 0.9;
  }
};

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- Loop -------------------------------------------------------------------
// Debug aids: ?static shows the untouched sculpt; debug.step() advances the animation by
// hand and debug.draw() renders one frame (useful when the tab is in the background).
const debug = {
  paused: params.has('static'),
  step(dt = 1 / 60, n = 1) {
    for (let i = 0; i < n; i++) loco.update(dt);
  },
  hold: false, // true: the camera stops following the horse
  draw(snapCamera = true) {
    this.hold = true;
    if (snapCamera) orbit.snap(loco.focus);
    draw(0, 0);
  },
};
let last = performance.now();
let time = 0, first = true;
function draw(rawDt, dt) {
  orbit.update(rawDt, debug.hold ? null : loco.focus);
  env.update(loco.position, time);
  horse.hair.uniforms.uTime.value = time;

  marker.material.opacity = loco.hasDestination ? Math.max(0.35, marker.material.opacity - dt * 0.6) : Math.max(0, marker.material.opacity - dt * 2);
  gaitButtons.forEach((b, i) => b.classList.toggle('on', i === loco.gaitIndex));
  $('graze').classList.toggle('on', loco.grazing);
  $('status').textContent = `${GAIT_NAMES[loco.currentGait]} · ${(loco.speed * 3.6).toFixed(1)} km/h`;

  renderer.render(scene, camera);
}
function frame(now) {
  const rawDt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
  last = now;
  const dt = rawDt * timeScale;
  time += dt;
  loco.steer = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
  if (!debug.paused) loco.update(dt);
  draw(rawDt, dt);
  if (first) {
    first = false;
    $('loading').classList.add('done');
  }
  requestAnimationFrame(frame);
}
window.__horse = { horse, loco, scene, camera, renderer, orbit, debug, THREE };
requestAnimationFrame(frame);
