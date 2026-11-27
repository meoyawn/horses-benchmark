// Minimal orbit camera: drag to rotate, wheel / pinch to zoom, follows a target.
import * as THREE from 'three';

export class OrbitCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.target = new THREE.Vector3(0, 1.1, 0);
    this.azimuth = 1.05; // around Y, 0 = looking from +X
    this.polar = 1.38; // from straight up
    this.distance = 5.6;
    this.goal = { azimuth: this.azimuth, polar: this.polar, distance: this.distance };
    this.onClick = null; // (event) => void, fired when the pointer did not drag
    this.onMove = null;
    const pointers = new Map();
    let moved = 0, pinch = 0;

    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    dom.addEventListener('pointermove', (e) => {
      if (this.onMove) this.onMove(e);
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        this.goal.azimuth -= dx * 0.0055;
        this.goal.polar = Math.min(1.54, Math.max(0.25, this.goal.polar - dy * 0.0045));
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.zoom(pinch / d);
        pinch = d;
        moved += 10;
      }
    });
    const up = (e) => {
      if (pointers.has(e.pointerId) && pointers.size === 1 && moved < 6 && this.onClick) this.onClick(e);
      pointers.delete(e.pointerId);
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
  }

  zoom(factor) {
    this.goal.distance = Math.min(40, Math.max(1.2, this.goal.distance * factor));
  }

  /** Jump straight to the goal view (no easing). */
  snap(follow) {
    this.azimuth = this.goal.azimuth;
    this.polar = this.goal.polar;
    this.distance = this.goal.distance;
    if (follow) this.target.copy(follow);
  }

  update(dt, follow) {
    const k = 1 - Math.exp(-dt * 9);
    this.azimuth += (this.goal.azimuth - this.azimuth) * k;
    this.polar += (this.goal.polar - this.polar) * k;
    this.distance += (this.goal.distance - this.distance) * k;
    if (follow) this.target.lerp(follow, 1 - Math.exp(-dt * 6));
    const s = Math.sin(this.polar) * this.distance;
    this.camera.position.set(
      this.target.x + s * Math.cos(this.azimuth),
      Math.max(0.12, this.target.y + Math.cos(this.polar) * this.distance),
      this.target.z + s * Math.sin(this.azimuth)
    );
    this.camera.lookAt(this.target);
  }
}
