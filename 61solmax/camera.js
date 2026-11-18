import * as THREE from "three";
import { clamp, mix } from "./sculpt.js";

const presets = {
  angle: { point: [.082, 1.104, 0], azimuth: .54, elevation: .130, height: 2.83, width: 3.46 },
  profile: { point: [.08, 1.105, 0], azimuth: .0, elevation: .067, height: 2.80, width: 3.52 },
  head: { point: [1.150, 1.884, .006], azimuth: .72, elevation: .125, height: .99, width: 1.02 }
};

export function setupCamera(camera, canvas, onOrbit) {
  const focus = new THREE.Vector3();
  const target = new THREE.Vector3();
  const pointers = new Map();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let mode = "angle";
  let defaultDistance = 0;
  let zoomScale = 1;
  let azimuth = 0;
  let elevation = 0;
  let distance = 0;
  let desiredAzimuth = 0;
  let desiredElevation = 0;

  function fit() {
    const view = presets[mode];
    const halfFov = camera.fov * Math.PI / 360;
    defaultDistance = Math.max(view.height, view.width / camera.aspect) * .5 / Math.tan(halfFov);
  }

  function select(view, immediate = false) {
    const pose = presets[view];
    mode = view;
    zoomScale = 1;
    target.set(...pose.point);
    desiredAzimuth = pose.azimuth + Math.PI * 2 * Math.round((azimuth - pose.azimuth) / (Math.PI * 2));
    desiredElevation = pose.elevation;
    fit();
    if (immediate || reducedMotion.matches) update(1);
  }

  function update(dt) {
    const step = dt >= 1 ? 1 : 1 - Math.exp(-dt * 11);
    focus.lerp(target, step);
    distance = mix(distance, defaultDistance * zoomScale, step);
    azimuth = mix(azimuth, desiredAzimuth, step);
    elevation = mix(elevation, desiredElevation, step);
    const width = Math.cos(elevation) * distance;
    camera.position.set(focus.x + Math.sin(azimuth) * width,
      focus.y + Math.sin(elevation) * distance,
      focus.z + Math.cos(azimuth) * width);
    camera.lookAt(focus);
  }

  function orbit(dx, dy) {
    desiredAzimuth -= dx * .008;
    desiredElevation = clamp(desiredElevation + dy * .007, .018, 1.42);
    onOrbit();
  }

  function zoom(factor) {
    const minDistance = mode === "head" ? .55 : 1.35;
    zoomScale = clamp(zoomScale * factor, minDistance / defaultDistance, 2.3);
    onOrbit();
  }

  function pointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function pointerMove(event) {
    const before = pointers.get(event.pointerId);
    if (!before) return;
    const after = { x: event.clientX, y: event.clientY };
    if (pointers.size === 1) orbit(after.x - before.x, after.y - before.y);
    if (pointers.size === 2) {
      const otherId = [...pointers.keys()].find(id => id !== event.pointerId);
      const other = pointers.get(otherId);
      const oldGap = Math.hypot(before.x - other.x, before.y - other.y);
      const newGap = Math.hypot(after.x - other.x, after.y - other.y);
      if (oldGap > 4 && newGap > 4) zoom(oldGap / newGap);
    }
    pointers.set(event.pointerId, after);
  }

  function clearPointer(event) {
    pointers.delete(event.pointerId);
  }

  function wheel(event) {
    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 15 : event.deltaMode === 2 ? 220 : 1;
    zoom(Math.exp(clamp(event.deltaY * multiplier, -260, 260) * .0018));
  }

  function keys(event) {
    const actions = {
      ArrowLeft: () => orbit(-24, 0),
      ArrowRight: () => orbit(24, 0),
      ArrowUp: () => orbit(0, 19),
      ArrowDown: () => orbit(0, -19),
      "+": () => zoom(.86),
      "=": () => zoom(.86),
      "-": () => zoom(1.17)
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", clearPointer);
  canvas.addEventListener("lostpointercapture", clearPointer);
  canvas.addEventListener("pointercancel", clearPointer);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", keys);

  select("angle", true);
  return { fit, select, update };
}
