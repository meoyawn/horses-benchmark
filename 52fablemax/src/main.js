import * as THREE from 'three';
import { OrbitRig } from './controls.js';
import { createEnvironment } from './environment.js';
import { Horse } from './horse/horse.js';
import { Hair } from './horse/hair.js';
import { BONE_INDEX } from './horse/skeleton.js';
import { createGrass } from './grass.js';
import { createDust } from './dust.js';
import { createAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const quality = Number(params.get('q')) || 1;
if (params.has('bare')) document.body.classList.add('bare');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.08, 2000);
const rig = new OrbitRig(camera, canvas);
const env = createEnvironment(renderer, scene);
const grass = createGrass();
scene.add(grass.mesh);
const dust = createDust();
scene.add(dust.mesh);
const audio = createAudio();

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const loadingEl = document.getElementById('loading');
const fillEl = document.getElementById('loading-fill');
const stepEl = document.getElementById('loading-step');
const statsEl = document.getElementById('stats');
const nextFrame = () => new Promise((r) => setTimeout(r, 0));
async function progress(fraction, label) {
  fillEl.style.width = `${Math.round(fraction * 100)}%`;
  if (label) stepEl.textContent = label;
  await nextFrame();
}

const app = { renderer, scene, camera, rig, env, ready: false, error: null, paused: false, frozen: false };
window.__app = app;

let horse = null;
let hair = null;
let loco = null;

// ------------------------------------------------------------ interaction ---

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const tmp = new THREE.Vector3();

// A handful of spheres riding on the bones stand in for the body when picking.
const PICK = [
  ['chest', [0.25, 1.2, 0], 0.42],
  ['pelvis', [-0.5, 1.22, 0], 0.4],
  ['chest', [0.6, 1.3, 0], 0.3],
  ['neck2', [0.82, 1.56, 0], 0.2],
  ['neck4', [1.02, 1.76, 0], 0.16],
  ['head', [1.3, 1.68, 0], 0.17],
  ['head', [1.45, 1.5, 0], 0.11],
];
function pickHorse(ray) {
  if (!horse) return null;
  let best = null;
  for (const [bone, rest, radius] of PICK) {
    tmp.set(rest[0], rest[1], rest[2]);
    horse.rig.carry(bone, tmp, hit).applyMatrix4(horse.root.matrixWorld);
    const t = ray.direction.dot(tmp.subVectors(hit, ray.origin));
    if (t < 0) continue;
    const d2 = tmp.copy(ray.direction).multiplyScalar(t).add(ray.origin).distanceToSquared(hit);
    if (d2 < radius * radius && (best === null || t < best)) best = t;
  }
  return best;
}

function rayFromScreen(x, y) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray;
}

// where she is being sent
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.2, 0.25, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0, depthWrite: false, fog: false }),
);
marker.position.y = 0.03;
marker.renderOrder = 5;
scene.add(marker);

const interest = { point: new THREE.Vector3(), until: 0, strength: 0, petUntil: 0 };

rig.onTap = (x, y) => {
  if (!loco) return;
  const ray = rayFromScreen(x, y);
  if (pickHorse(ray) !== null) {
    // a pat: she turns to look at whoever touched her
    interest.petUntil = clock.now + 4.5;
    audio.snort();
    return;
  }
  if (ray.intersectPlane(groundPlane, hit) && hit.distanceTo(camera.position) < 400) {
    loco.goTo(hit);
    marker.position.set(hit.x, 0.03, hit.z);
    marker.material.opacity = 0.9;
    marker.scale.setScalar(1);
    setActiveGait(null);
  }
};

rig.onHover = (x, y) => {
  if (!loco) return;
  const ray = rayFromScreen(x, y);
  const over = pickHorse(ray) !== null;
  canvas.classList.toggle('over-horse', over);
  // she watches the pointer: the spot on the ground under it, lifted to eye level
  if (ray.intersectPlane(groundPlane, hit)) {
    const head = horse.rig.pos[BONE_INDEX.head];
    tmp.copy(head).applyMatrix4(horse.root.matrixWorld);
    // closest point on the ray to her head
    const t = ray.direction.dot(tmp.sub(ray.origin));
    interest.point.copy(ray.direction).multiplyScalar(Math.max(1, t)).add(ray.origin);
    if (interest.point.y < 0.2) interest.point.y = 0.2;
    interest.until = clock.now + 2.5;
  }
};

const gaitButtons = [...document.querySelectorAll('#gaits button')];
function setActiveGait(name) {
  for (const b of gaitButtons) b.classList.toggle('active', b.dataset.gait === name);
}
function chooseGait(name) {
  if (!loco) return;
  loco.setGait(name);
  marker.material.opacity = 0;
  setActiveGait(name);
}
for (const b of gaitButtons) b.addEventListener('click', () => chooseGait(b.dataset.gait));
// keep keyboard shortcuts (Space!) from re-triggering whichever button was clicked last
document.getElementById('controls').addEventListener('click', (e) => e.target.closest('button')?.blur());
document.getElementById('btn-rear').addEventListener('click', () => doRear());
document.getElementById('btn-graze').addEventListener('click', () => toggleGraze());
const soundButton = document.getElementById('btn-sound');
soundButton.addEventListener('click', () => {
  audio.setEnabled(!audio.enabled);
  soundButton.setAttribute('aria-pressed', String(audio.enabled));
  soundButton.textContent = audio.enabled ? 'Sound on' : 'Sound off';
});

function doRear() {
  if (!loco) return;
  if (loco.speed > 0.6) {
    chooseGait('stand');
    return;
  }
  horse.grazing = false;
  if (loco.startRear()) setActiveGait('stand');
}
function toggleGraze() {
  if (!loco) return;
  const on = !horse.grazing;
  chooseGait('stand');
  horse.grazing = on;
  grazeButton.classList.toggle('active', on);
}

const GAIT_KEYS = { Digit1: 'stand', Digit2: 'walk', Digit3: 'trot', Digit4: 'canter', Digit5: 'gallop' };
const LADDER = ['stand', 'walk', 'trot', 'canter', 'gallop'];
const held = new Set();
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (GAIT_KEYS[e.code]) chooseGait(GAIT_KEYS[e.code]);
  else if (e.code === 'Space') { e.preventDefault(); doRear(); }
  else if (e.code === 'KeyG') toggleGraze();
  else if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'KeyS' || e.code === 'ArrowDown') {
    if (e.repeat || !loco) return;
    const current = gaitButtons.find((b) => b.classList.contains('active'))?.dataset.gait || 'stand';
    const step = e.code === 'KeyW' || e.code === 'ArrowUp' ? 1 : -1;
    chooseGait(LADDER[Math.max(0, Math.min(4, LADDER.indexOf(current) + step))]);
  } else held.add(e.code);
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

// ------------------------------------------------------------- inspection ---

// Canonical views: azimuth is measured from her right side towards her nose.
const VIEWS = {
  side: [0, 1.5, 5.6],
  left: [Math.PI, 1.5, 5.6],
  front: [Math.PI / 2, 1.5, 5.2],
  rear: [-Math.PI / 2, 1.5, 5.2],
  top: [0, 0.2, 6],
  quarter: [0.75, 1.36, 5.4],
  rearQuarter: [-0.8, 1.36, 5.4],
};
app.view = (name, radius, target) => {
  const v = VIEWS[name];
  if (!v) return Object.keys(VIEWS);
  const t = new THREE.Vector3(...(target || [0.15, 1.02, 0]));
  if (horse) t.applyMatrix4(horse.root.matrixWorld);
  rig.snap(v[0] + (loco ? loco.heading : 0), v[1], radius || v[2], t);
  return name;
};

// `__app.sheet = [[view, radius, [tx, ty, tz]], ...]` renders several fixed
// views (relative to the horse) side by side in one frame.
app.sheet = null;
const sheetCamera = new THREE.PerspectiveCamera(24, 1, 0.05, 2000);
const sheetTarget = new THREE.Vector3();
function aimSheetCamera(view, aspect) {
  const [name, radius, target] = view;
  const [az0, polar] = Array.isArray(name) ? name : VIEWS[name];
  const az = az0 + (loco ? loco.heading : 0);
  sheetTarget.set(...(target || [0.15, 1.02, 0]));
  if (horse) sheetTarget.applyMatrix4(horse.root.matrixWorld);
  const sp = Math.sin(polar);
  sheetCamera.position.set(
    sheetTarget.x + radius * sp * Math.sin(az), sheetTarget.y + radius * Math.cos(polar), sheetTarget.z + radius * sp * Math.cos(az));
  sheetCamera.aspect = aspect;
  sheetCamera.updateProjectionMatrix();
  sheetCamera.lookAt(sheetTarget);
}
function renderTiles(count, each) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const size = renderer.getSize(new THREE.Vector2());
  const w = size.x / cols, h = size.y / rows;
  renderer.setScissorTest(true);
  for (let i = 0; i < count; i++) {
    const x = (i % cols) * w, y = size.y - (Math.floor(i / cols) + 1) * h;
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    each(i, w / h, h * renderer.getPixelRatio());
  }
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, size.x, size.y);
}

/**
 * Film strip: advances the simulation and renders `count` frames, `interval`
 * seconds apart, as tiles. Leaves the picture frozen until `__app.frozen = false`.
 */
app.strip = (count = 8, interval = 0.1, view = ['side', 7]) => {
  app.frozen = true;
  renderTiles(count, (i, aspect, heightPx) => {
    let left = i === 0 ? 0 : interval;
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 120);
      simulate(h, sheetCamera, heightPx);
      left -= h;
    }
    aimSheetCamera(view, aspect);
    if (hair) hair.setCamera(sheetCamera, heightPx);
    env.update(elapsed, horse.root.position, sheetCamera);
    renderer.render(scene, sheetCamera);
  });
  return loco.currentGait();
};

/**
 * Runs the simulation without drawing and measures how well planted hooves
 * hold their ground: the worst distance between where a hoof was put down and
 * where the leg actually holds it, and the worst shortfall in reach.
 */
app.probe = (seconds = 4) => {
  const q = new THREE.Quaternion(), toe = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);
  const out = {};
  for (const key of Object.keys(loco.feet)) out[key] = { slip: 0, gap: 0, heel: 0, air: 0 };
  let steps = 0;
  for (let t = 0; t < seconds; t += 1 / 120) {
    simulate(1 / 120, camera, renderer.domElement.height);
    steps++;
    for (const [key, f] of Object.entries(loco.feet)) {
      const leg = f.leg, o = out[key];
      o.gap = Math.max(o.gap, leg.reachGap);
      if (!f.down) { o.air++; continue; }
      q.setFromAxisAngle(yAxis, leg.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, -leg.pitch));
      toe.set(leg.hoof.toe[0], leg.hoof.toe[1], 0).applyQuaternion(q).add(horse.rig.pos[leg.hoofId]);
      toe.applyMatrix4(horse.root.matrixWorld);
      o.slip = Math.max(o.slip, toe.distanceTo(f.plant));
      o.heel = Math.max(o.heel, leg.pitch);
    }
  }
  for (const o of Object.values(out)) {
    o.slip = +o.slip.toFixed(3); o.gap = +o.gap.toFixed(3); o.heel = +o.heel.toFixed(2); o.air = +(o.air / steps).toFixed(2);
  }
  return out;
};

// ------------------------------------------------------------------- loop ---

const clock = { now: 0 };
let elapsed = 0;
const follow = new THREE.Vector3();
const hooves = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
const grazeButton = document.getElementById('btn-graze');

function simulate(dt, cam, heightPx) {
  elapsed += dt;
  clock.now = elapsed;
  // steering
  loco.steer = (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0) - (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0);
  if (loco.steer !== 0 && loco.goal) { loco.goal = null; marker.material.opacity = 0; }

  // what she is paying attention to
  if (elapsed < interest.petUntil) {
    horse.lookTarget = camera.position;
    horse.attention = 1;
  } else if (elapsed < interest.until) {
    horse.lookTarget = interest.point;
    horse.attention = 0.75;
  } else {
    // now and then she checks on the viewer
    const glance = Math.sin(elapsed * 0.21) * Math.sin(elapsed * 0.13 + 2) > 0.35 ? 0.55 : 0;
    horse.lookTarget = camera.position;
    horse.attention += (glance - horse.attention) * Math.min(1, dt * 2);
  }
  if (loco.goal === null && marker.material.opacity > 0) marker.material.opacity = Math.max(0, marker.material.opacity - dt * 2);

  horse.update(dt);
  horse.root.updateMatrixWorld(true);
  hair.update(dt, cam, heightPx);
  dust.update(dt);

  // grass is pressed down where the hooves stand
  const fx = Math.cos(loco.heading), fz = -Math.sin(loco.heading);
  let i = 0;
  for (const f of Object.values(loco.feet)) {
    loco.toWorld(f.toe, tmp);
    hooves[i++].set(tmp.x - fx * 0.07, 0, tmp.z - fz * 0.07, 1 - Math.min(1, Math.max(0, f.toe.y / 0.12)));
  }
  grass.update(elapsed, loco.position, hooves);
}

let last = performance.now();
let fpsTime = 0, fpsFrames = 0, fps = 0, slowTicks = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!app.ready || app.frozen) return;
  if (!app.paused) simulate(dt, camera, renderer.domElement.height);

  // the camera rides along with her
  // (aim a little ahead by her speed so the easing does not leave her behind)
  const leadTime = 1 / rig.followSharpness;
  follow.set(
    loco.position.x + Math.cos(loco.heading) * loco.speed * leadTime,
    1.08,
    loco.position.z - Math.sin(loco.heading) * loco.speed * leadTime,
  );
  rig.targetGoal.copy(follow);
  rig.update(dt);

  if (app.sheet) {
    renderTiles(app.sheet.length, (i, aspect, heightPx) => {
      aimSheetCamera(app.sheet[i], aspect);
      hair.setCamera(sheetCamera, heightPx);
      env.update(elapsed, loco.position, sheetCamera);
      renderer.render(scene, sheetCamera);
    });
  } else {
    hair.setCamera(camera, renderer.domElement.height);
    env.update(elapsed, loco.position, camera);
    renderer.render(scene, camera);
  }

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = fpsFrames / fpsTime;
    fpsFrames = 0;
    fpsTime = 0;
    app.fps = fps;
    // on a struggling machine, trade sharpness for smoothness
    slowTicks = fps < 26 ? slowTicks + 1 : 0;
    if (slowTicks >= 6 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(1);
      resize();
      slowTicks = 0;
    }
    statsEl.textContent = `${loco.currentGait()} · ${loco.speed.toFixed(1)} m/s · ${Math.round(fps)} fps`;
    grazeButton.classList.toggle('active', horse.grazing);
    // show the gait she has been asked for; nothing while she is travelling to a click
    if (loco.goal) setActiveGait(null);
    else if (loco.wantSpeed === 0) setActiveGait('stand');
  }
}

async function init() {
  await progress(0.02, 'Laying out the skeleton');
  horse = new Horse();
  await horse.build(quality, (f, label) => progress(0.05 + f * 0.9, label));
  scene.add(horse.root);
  loco = horse.locomotion;
  loco.onFootfall = (key, pos, speed) => {
    dust.kick(pos, speed, Math.cos(loco.heading), -Math.sin(loco.heading));
    audio.hoofbeat(speed, key[0] === 'F');
  };
  app.horse = horse;
  app.loco = loco;
  app.stats = horse.stats;
  await progress(0.96, 'Combing mane and tail');
  horse.root.updateMatrixWorld(true);
  hair = new Hair(horse, scene);
  app.hair = hair;
  rig.snap(0.78, 1.38, 5.6, new THREE.Vector3(0, 1.08, 0));
  await progress(1, 'Ready');
  loadingEl.classList.add('done');
  app.ready = true;
}

init().catch((err) => {
  console.error(err);
  app.error = String(err && err.stack || err);
  stepEl.textContent = 'Something went wrong: ' + err.message;
});
requestAnimationFrame(frame);
