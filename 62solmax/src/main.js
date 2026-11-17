import {
  ACESFilmicToneMapping, MathUtils, PCFShadowMap, PerspectiveCamera, Scene, Spherical, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHorse } from './horse.js';
import { dressScene } from './landscape.js';
import './style.css';

const views = {
  horse: {
    target: [0.075, 1.19, 0], direction: [0.46, 0.142, -1], distance: 5.83, width: 3.55, nearest: 2.05,
    note: 'Follow the topline from the withers, across the back, to the rounded croup above the tail.',
  },
  head: {
    target: [1.278, 1.988, -0.018], direction: [0.76, 0.12, -1], distance: 1.78, width: 0.96, nearest: 0.75,
    note: 'A white blaze runs down the bridge of the nose. Watch the ears swivel independently.',
  },
  legs: {
    target: [-0.061, 0.565, 0], direction: [0.035, 0.082, -1], distance: 3.88, width: 2.60, nearest: 1.60,
    note: 'Compare the straight forelegs with the angled hocks of the hind legs. One hind leg has a white sock.',
  },
};

const symbols = {
  horse: 'M4.5 16.4C6 15.3 6.7 13.8 6.8 12.2L7.1 8.1L11.5 5.2L12.3 2.8L13.6 5.6L15.1 6.6L17.4 12.1L16 13.6L12.9 12.2C11.5 13.3 11 14.9 11 16.4M12.8 8.6L13.2 8.7',
  head: 'M5 17C6.8 15.8 6.9 14.5 6.8 12.2L7.1 8.2L11.4 5.4L12.3 2.8L13.6 5.6L15 6.7L17.2 12.1L15.8 13.3L12.5 12C11.3 13.2 11 14.8 11.1 17M12.9 8.4L13.2 8.5',
  frame: 'M7.5 4H4V7.5M12.5 4H16V7.5M4 12.5V16H7.5M16 12.5V16H12.5M8 10H12M10 8V12',
  hoof: 'M7.7 3.5L7.9 8.8L6.5 11.8L5.1 15.1Q5 16.2 6.2 16.2H13.9Q14.8 16.2 14.5 15.1L13.6 12.2L11.8 9.7L11.3 3.5M6.5 12H13.5M5.3 14.2H14.2',
  reset: 'M4.5 8.4A6 6 0 1 1 5.5 14M4.5 4.8V8.6H8.3',
  orbit: 'M5.2 7.5C2.5 8.3 1.7 9.7 3.6 11C5.3 12.3 10.6 12.9 14.2 11.9C17.4 10.9 18 9.2 15.9 8.2M7.5 9.5V6.8A2.5 2.5 0 0 1 12.5 6.8V9.4M7.6 13.4L8.7 14.7L10.4 13.6',
};

function drawSymbols() {
  for (const canvas of document.querySelectorAll('[data-symbol]')) {
    const context = canvas.getContext('2d');
    const brand = canvas.classList.contains('brand-mark');
    context.scale(canvas.width / 20, canvas.height / 20);
    if (brand) context.translate(-0.3, 0.3);
    context.strokeStyle = brand ? '#f4ebd6' : '#56654e';
    context.lineWidth = brand ? 1.23 : 1.21;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke(new Path2D(symbols[canvas.dataset.symbol]));
  }
}

const canvas = document.querySelector('#scene');
const viewer = document.querySelector('.viewer');
const stage = document.querySelector('#stage');
const loading = document.querySelector('#loading');
const pauseButton = document.querySelector('#pause');
const speedSlider = document.querySelector('#speed');
const speedReadout = document.querySelector('#rate');
const help = document.querySelector('#controls');
const viewButtons = [...document.querySelectorAll('[data-view]')];
const gaitButtons = [...document.querySelectorAll('[data-gait]')];
const reset = document.querySelector('#reset');
const zoomIn = document.querySelector('#zoom-in');
const zoomOut = document.querySelector('#zoom-out');
const viewNote = document.querySelector('#view-note');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

drawSymbols();
viewNote.textContent = views.horse.note;
document.querySelector('#show-help').addEventListener('click', function openHelp() { help.showModal(); });

function showUnavailable(error) {
  console.error(error);
  loading.hidden = false;
  loading.textContent = 'The 3D view could not start. Try opening this page in a browser with WebGL 2 enabled.';
  viewer.setAttribute('aria-busy', 'false');
  canvas.tabIndex = -1;
  for (const control of [...viewButtons, ...gaitButtons, pauseButton, speedSlider, reset, zoomIn, zoomOut]) control.disabled = true;
}

function start() {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.04, 160);
  dressScene(scene);
  const model = createHorse();
  scene.add(model.horse);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.13;
  orbit.enablePan = false;
  orbit.rotateSpeed = 0.66;
  orbit.zoomSpeed = 0.83;
  orbit.minPolarAngle = 0.17;
  orbit.maxPolarAngle = Math.PI * 0.50;
  orbit.maxDistance = 14;

  const destination = { position: new Vector3(), target: new Vector3() };
  const deltaDirection = new Vector3();
  const angles = new Spherical();
  let movingCamera = false;
  let redraw = true;
  let view = 'horse';
  let speed = 1;
  let paused = reducedMotion.matches;
  let previous = 0;

  function frameCamera(animate) {
    const preset = views[view];
    const visibleWidth = 2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const distance = Math.max(preset.distance, preset.width / visibleWidth);
    destination.target.fromArray(preset.target);
    destination.position.fromArray(preset.direction).setLength(distance).add(destination.target);
    movingCamera = animate && !reducedMotion.matches;
    orbit.minDistance = preset.nearest;
    if (!movingCamera) {
      camera.position.copy(destination.position);
      orbit.target.copy(destination.target);
      orbit.update();
    }
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = stage;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    frameCamera(false);
    redraw = true;
  }

  function selectView(next) {
    view = next;
    viewNote.textContent = views[view].note;
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(view === button.dataset.view));
    frameCamera(true);
  }

  function zoomBy(scale) {
    movingCamera = false;
    const offset = deltaDirection.copy(camera.position).sub(orbit.target);
    offset.setLength(MathUtils.clamp(offset.length() * scale, orbit.minDistance, orbit.maxDistance));
    camera.position.copy(orbit.target).add(offset);
    orbit.update();
  }

  function orbitBy(horizontal, vertical) {
    movingCamera = false;
    angles.setFromVector3(deltaDirection.copy(camera.position).sub(orbit.target));
    angles.theta += horizontal;
    angles.phi = MathUtils.clamp(angles.phi + vertical, orbit.minPolarAngle, orbit.maxPolarAngle);
    camera.position.copy(orbit.target).add(deltaDirection.setFromSpherical(angles));
    orbit.update();
  }

  function setPaused(next) {
    paused = next;
    const label = paused ? 'Play movement' : 'Pause movement';
    pauseButton.dataset.paused = String(paused);
    pauseButton.setAttribute('aria-label', label);
    pauseButton.title = label;
  }

  function readSpeed() {
    speed = Number(speedSlider.value);
    speedReadout.value = speed + '×';
    speedSlider.setAttribute('aria-valuetext', speed + ' times speed');
  }

  orbit.addEventListener('start', function takeCamera() { movingCamera = false; });
  orbit.addEventListener('change', function cameraChanged() { redraw = true; });
  for (const button of viewButtons) {
    button.addEventListener('click', function chooseView() { selectView(button.dataset.view); });
  }
  for (const button of gaitButtons) {
    button.addEventListener('click', function chooseGait() {
      model.selectGait(button.dataset.gait);
      for (const option of gaitButtons) option.setAttribute('aria-pressed', String(option === button));
      setPaused(false);
    });
  }
  reset.addEventListener('click', function resetView() { selectView('horse'); });
  zoomIn.addEventListener('click', function closer() { zoomBy(0.82); });
  zoomOut.addEventListener('click', function farther() { zoomBy(1 / 0.82); });
  pauseButton.addEventListener('click', function toggle() { setPaused(!paused); });
  speedSlider.addEventListener('input', readSpeed);
  reducedMotion.addEventListener('change', function matchPause(event) { setPaused(event.matches); });
  canvas.addEventListener('keydown', function handleKeys(event) {
    const amount = 0.14;
    switch (event.key) {
      case 'ArrowLeft': orbitBy(-amount, 0); break;
      case 'ArrowRight': orbitBy(amount, 0); break;
      case 'ArrowUp': orbitBy(0, -amount); break;
      case 'ArrowDown': orbitBy(0, amount); break;
      case '+':
      case '=': zoomBy(0.82); break;
      case '-': zoomBy(1 / 0.82); break;
      case 'Home': selectView('horse'); break;
      case ' ': setPaused(!paused); break;
      default: return;
    }
    event.preventDefault();
  });

  function render(now) {
    const dt = previous ? Math.min((now - previous) / 1000, 0.048) : 0;
    previous = now;
    if (!paused) model.advance(dt, speed);
    if (movingCamera) {
      const mix = 1 - Math.exp(-dt * 10.8);
      camera.position.lerp(destination.position, mix);
      orbit.target.lerp(destination.target, mix);
      if (camera.position.distanceToSquared(destination.position) < 0.000001) {
        camera.position.copy(destination.position);
        orbit.target.copy(destination.target);
        movingCamera = false;
      }
    }
    orbit.update();
    if (paused && !redraw && !movingCamera) return;
    renderer.shadowMap.needsUpdate = !paused || renderer.shadowMap.needsUpdate;
    renderer.render(scene, camera);
    redraw = false;
  }

  setPaused(paused);
  resize();
  renderer.shadowMap.needsUpdate = true;
  new ResizeObserver(resize).observe(stage);
  render(performance.now());
  loading.hidden = true;
  viewer.setAttribute('aria-busy', 'false');
  renderer.setAnimationLoop(render);
}

requestAnimationFrame(function afterFirstPaint() {
  try {
    start();
  } catch (error) {
    showUnavailable(error);
  }
});
