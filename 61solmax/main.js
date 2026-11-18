import * as THREE from "three";
import { setupCamera } from "./camera.js";
import { addDetails } from "./details.js";
import { createRig } from "./rig.js";
import { coatMaterial, createStudio } from "./studio.js";

const stage = document.querySelector("#scene");
const loading = document.querySelector("#loading");
const reset = document.querySelector("#reset");
const pause = document.querySelector("#pause");
const gaitButtons = [...document.querySelectorAll("[data-gait]")];
const viewButtons = [...document.querySelectorAll("[data-view]")];
const buttons = [reset, pause, ...gaitButtons, ...viewButtons];

for (const button of buttons) button.disabled = true;

try {
  mount();
} catch (error) {
  console.error(error);
  loading.textContent = "The 3D viewer needs WebGL 2 in this browser.";
}

function mount() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Interactive horse. Use arrow keys to orbit and plus or minus to zoom.");
  stage.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, .035, 42);
  const view = setupCamera(camera, canvas, clearViewSelection);
  const studio = createStudio(renderer, scene);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let rig = null;
  let gait = "stand";
  let paused = reduceMotion.matches;
  let lastTime = 0;

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  setPaused(paused);

  for (const button of gaitButtons) {
    button.addEventListener("click", function selectGait() {
      gait = button.dataset.gait;
      setSelected(gaitButtons, button);
      setPaused(false);
    });
  }
  for (const button of viewButtons) {
    button.addEventListener("click", function selectView() {
      view.select(button.dataset.view);
      setSelected(viewButtons, button);
    });
  }
  pause.addEventListener("click", function toggleMotion() {
    setPaused(!paused);
  });
  reset.addEventListener("click", function resetView() {
    view.select("angle");
    setSelected(viewButtons, viewButtons[0]);
  });

  canvas.addEventListener("webglcontextlost", function reportContextLoss(event) {
    event.preventDefault();
    loading.hidden = false;
    loading.textContent = "The graphics context was interrupted.";
  });
  canvas.addEventListener("webglcontextrestored", function restoreContext() {
    if (rig) loading.hidden = true;
  });

  const worker = new Worker(new URL("./mesh-worker.js", import.meta.url), { type: "module" });
  worker.addEventListener("error", function reportWorkerError(event) {
    console.error(event.message);
    loading.textContent = "The horse could not be generated. Reload to try again.";
    worker.terminate();
  }, { once: true });
  worker.addEventListener("message", function showHorse(event) {
    worker.terminate();
    try {
      rig = addDetails(createRig(event.data, coatMaterial()));
      rig.pose(0, "stand");
      scene.add(rig.model);
      studio.placeShadows(rig);
      renderer.render(scene, camera);
      for (const button of buttons) button.disabled = false;
      loading.hidden = true;
      requestAnimationFrame(frame);
    } catch (error) {
      console.error(error);
      loading.textContent = "The horse could not be rendered. Reload to try again.";
    }
  }, { once: true });

  function clearViewSelection() {
    setSelected(viewButtons, null);
  }

  function resize() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(document.defaultView.devicePixelRatio, 1.75));
    renderer.setSize(width, height, false);
    view.fit();
    if (!rig) view.update(1);
  }

  function setPaused(value) {
    paused = value;
    const label = paused ? "Resume motion" : "Pause motion";
    pause.dataset.paused = String(paused);
    pause.setAttribute("aria-label", label);
    pause.title = label;
  }

  function frame(now) {
    const dt = Math.min((now - (lastTime || now)) * .001, .05);
    lastTime = now;
    if (!paused) {
      rig.pose(dt, gait);
      studio.placeShadows(rig);
    }
    view.update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
}

function setSelected(group, active) {
  for (const button of group) button.setAttribute("aria-pressed", String(button === active));
}
