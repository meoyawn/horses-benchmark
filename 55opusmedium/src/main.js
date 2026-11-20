import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Horse, COATS, GAIT_ORDER } from './horse.js';
import { makeSky, makeGround, makeGrass, HORIZON, SUN_DIR } from './world.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON, 25, 140);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 900);
camera.position.set(2.6, 1.7, 4.6);

const sky = makeSky(600);
scene.add(sky);
// image-based lighting baked from our own sky
{
  const envScene = new THREE.Scene();
  envScene.add(makeSky(50));
  const gnd = new THREE.Mesh(new THREE.CircleGeometry(49, 32), new THREE.MeshBasicMaterial({ color: 0x3d4a25 }));
  gnd.rotation.x = -Math.PI / 2; gnd.position.y = -1;
  envScene.add(gnd);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;
}
const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x4a5a2a, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

scene.add(makeGround());
const grass = makeGrass();
scene.add(grass);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0.1, 1.1, 0);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.update();

// ------------------------------------------------------------------ build horse (after first paint)
const loading = document.getElementById('loading');
let horse = null;
setTimeout(init, 50);

function init() {
  horse = new Horse();
  scene.add(horse.group);
  window.horse = horse; // handy for debugging in devtools
  loading.classList.add('hidden');
  buildUI();
  document.getElementById('stats').textContent =
    `${horse.vertexCount.toLocaleString()} verts · ${horse.triCount.toLocaleString()} tris · sculpted in ${horse.buildTimeMs.toFixed(0)} ms`;
}

// ------------------------------------------------------------------ UI
const keys = {};
function buildUI() {
  const gaitBox = document.getElementById('gaits');
  for (const g of GAIT_ORDER) {
    const b = document.createElement('button');
    b.textContent = g[0].toUpperCase() + g.slice(1);
    b.dataset.gait = g;
    b.onclick = () => { horse.setGait(g); syncUI(); };
    gaitBox.appendChild(b);
  }
  const coatBox = document.getElementById('coats');
  for (const [k, c] of Object.entries(COATS)) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.title = c.label;
    b.setAttribute('aria-label', c.label);
    b.style.background = `linear-gradient(135deg, #${new THREE.Color(c.coat).getHexString()} 55%, #${new THREE.Color(c.hair).getHexString()} 55%)`;
    b.dataset.coat = k;
    b.onclick = () => { horse.setCoat(k); syncUI(); };
    coatBox.appendChild(b);
  }
  document.getElementById('rear').onclick = () => { horse.startRear(); syncUI(); };
  document.getElementById('graze').onclick = () => { horse.grazeOn = !horse.grazeOn; if (horse.grazeOn) horse.setGait('stand'); syncUI(); };
  document.getElementById('follow').onchange = (e) => { followPointer = e.target.checked; };
  syncUI();
}
function syncUI() {
  document.querySelectorAll('[data-gait]').forEach(b => b.classList.toggle('on', b.dataset.gait === horse.gait));
  document.querySelectorAll('[data-coat]').forEach(b => b.classList.toggle('on', b.dataset.coat === horse.coat));
  document.getElementById('graze').classList.toggle('on', horse.grazeOn);
}
addEventListener('keydown', (e) => {
  if (!horse || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === 'w' || k === 'arrowup') { horse.gaitStep(1); horse.grazeOn = false; syncUI(); }
  if (k === 's' || k === 'arrowdown') { horse.gaitStep(-1); syncUI(); }
  if (k === 'r') { horse.startRear(); syncUI(); }
  if (k === 'g') { horse.grazeOn = !horse.grazeOn; if (horse.grazeOn) horse.setGait('stand'); syncUI(); }
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// pointer: head follows it; click the horse to pet it
let followPointer = true;
const pointer = new THREE.Vector2(), ray = new THREE.Raycaster();
let pointerActive = false, downAt = null;
canvas.addEventListener('pointermove', (e) => {
  pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pointerActive = true;
});
canvas.addEventListener('pointerleave', () => { pointerActive = false; });
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!horse || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  ray.setFromCamera(pointer, camera);
  const hit = ray.intersectObject(horse.body, false)[0];
  if (hit) {
    horse.pet();
    const tip = document.getElementById('toast');
    tip.textContent = ['*soft nicker*', '*snorts happily*', '*leans into the scratch*'][Math.random() * 3 | 0];
    tip.classList.add('show');
    clearTimeout(tip._t); tip._t = setTimeout(() => tip.classList.remove('show'), 1600);
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const prev = new THREE.Vector3();
const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
const headW = new THREE.Vector3();
let fps = 60;

function tick(dt) {
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (horse) {
    const H = horse.group;
    prev.copy(H.position);
    // steering
    const steerIn = (keys.a || keys.arrowleft ? 1 : 0) - (keys.d || keys.arrowright ? 1 : 0);
    horse.steer += (steerIn - horse.steer) * (1 - Math.exp(-dt * 4));
    // pointer look target in horse space
    let lookTarget = null;
    if (followPointer && pointerActive) {
      ray.setFromCamera(pointer, camera);
      horse.bones.head.getWorldPosition(headW);
      lookTarget = ray.ray.at(camera.position.distanceTo(headW), tmp.set(0, 0, 0)).clone();
      H.worldToLocal(lookTarget);
    }
    horse.lookTarget = lookTarget;
    const camLocal = H.worldToLocal(camera.position.clone());
    horse.update(dt, { cameraLocal: camLocal });
    // locomotion
    H.rotation.y += horse.steer * dt * (0.25 + horse.speed * 0.22) * Math.min(1, horse.speed * 2);
    fwd.set(1, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, H.rotation.y);
    H.position.addScaledVector(fwd, horse.speed * dt);
    // camera follows
    tmp.subVectors(H.position, prev);
    camera.position.add(tmp);
    controls.target.add(tmp);
    // shadows + grass follow the horse
    sun.position.copy(H.position).addScaledVector(SUN_DIR, 12);
    sun.target.position.copy(H.position);
    const gu = grass.userData.uniforms;
    gu.uCenter.value.set(H.position.x, H.position.z);
    gu.uTime.value += dt;
    ['LF', 'RF', 'LH', 'RH'].forEach((id, i) => {
      const b = horse.bones[(id[1] === 'F' ? 'fhoof' : 'hhoof') + id[0]];
      b.getWorldPosition(tmp);
      gu.uHooves.value[i].set(tmp.x, tmp.z, tmp.y < 0.12 ? 1 : 0);
    });
    document.getElementById('hud').textContent = `${horse.gait} · ${(horse.speed * 3.6).toFixed(1)} km/h`;
  }
  controls.update();
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(() => tick(Math.min(clock.getDelta(), 0.05)));
// manual stepping (useful when the tab is in the background)
window.__debug = { scene, camera, controls, renderer, tick, getFps: () => fps };
