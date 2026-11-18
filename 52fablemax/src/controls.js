// Orbit camera rig written from scratch: drag to orbit, wheel / pinch to zoom,
// with inertia and a smoothed, movable look-at target (used to follow the horse).
import { Vector3 } from 'three';

const TAP_MAX_MOVE = 6;      // px
const TAP_MAX_TIME = 400;    // ms

export class OrbitRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;

    this.target = new Vector3(0, 1.1, 0);       // smoothed look-at point
    this.targetGoal = new Vector3(0, 1.1, 0);   // where the look-at point wants to be
    this.followSharpness = 6;

    // Spherical coordinates around the target (azimuth around +Y, polar from +Y).
    this.azimuth = 0.6;
    this.polar = 1.32;
    this.radius = 5.2;
    this.goalAzimuth = this.azimuth;
    this.goalPolar = this.polar;
    this.goalRadius = this.radius;

    this.minPolar = 0.18;
    this.maxPolar = 1.545;
    this.minRadius = 1.1;
    this.maxRadius = 26;
    this.rotateSpeed = 0.0052;
    this.sharpness = 12;
    this.minCameraHeight = 0.12;

    this.onTap = null;        // (clientX, clientY) => void
    this.onHover = null;      // (clientX, clientY) => void
    this.enabled = true;
    this.lastInputTime = -1e9;

    this._pointers = new Map();
    this._pinchDist = 0;
    this._downAt = { x: 0, y: 0, t: 0, moved: 0 };

    dom.addEventListener('pointerdown', (e) => this._down(e));
    dom.addEventListener('pointermove', (e) => this._move(e));
    dom.addEventListener('pointerup', (e) => this._up(e));
    dom.addEventListener('pointercancel', (e) => this._up(e, true));
    dom.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _down(e) {
    if (!this.enabled) return;
    this.dom.setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size === 1) {
      this._downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    } else if (this._pointers.size === 2) {
      this._pinchDist = this._pointerSpread();
      this._downAt.moved = 1e9; // a second finger cancels the tap
    }
    this.dom.classList.add('dragging');
  }

  _move(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) {
      this.onHover?.(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    this._downAt.moved += Math.abs(dx) + Math.abs(dy);

    if (this._pointers.size === 1) {
      if (this._downAt.moved > TAP_MAX_MOVE) {
        this.goalAzimuth -= dx * this.rotateSpeed;
        this.goalPolar = clamp(this.goalPolar - dy * this.rotateSpeed, this.minPolar, this.maxPolar);
        this.lastInputTime = performance.now();
      }
    } else if (this._pointers.size === 2) {
      const d = this._pointerSpread();
      if (this._pinchDist > 0 && d > 0) {
        this.goalRadius = clamp(this.goalRadius * (this._pinchDist / d), this.minRadius, this.maxRadius);
      }
      this._pinchDist = d;
      this.lastInputTime = performance.now();
    }
  }

  _up(e, cancelled = false) {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.delete(e.pointerId);
    this.dom.releasePointerCapture?.(e.pointerId);
    if (this._pointers.size === 0) {
      this.dom.classList.remove('dragging');
      const quick = performance.now() - this._downAt.t < TAP_MAX_TIME;
      if (!cancelled && quick && this._downAt.moved <= TAP_MAX_MOVE) {
        this.onTap?.(e.clientX, e.clientY);
      }
    }
  }

  _wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 32 : 1;
    const zoom = Math.exp(clamp(e.deltaY * unit, -240, 240) * 0.0014);
    this.goalRadius = clamp(this.goalRadius * zoom, this.minRadius, this.maxRadius);
    this.lastInputTime = performance.now();
  }

  _pointerSpread() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  /** Jump straight to a view without easing. */
  snap(azimuth, polar, radius, target) {
    this.azimuth = this.goalAzimuth = azimuth;
    this.polar = this.goalPolar = polar;
    this.radius = this.goalRadius = radius;
    if (target) {
      this.target.copy(target);
      this.targetGoal.copy(target);
    }
    this.update(0);
  }

  update(dt) {
    const k = dt > 0 ? 1 - Math.exp(-this.sharpness * dt) : 1;
    this.azimuth += (this.goalAzimuth - this.azimuth) * k;
    this.polar += (this.goalPolar - this.polar) * k;
    this.radius += (this.goalRadius - this.radius) * k;

    const kf = dt > 0 ? 1 - Math.exp(-this.followSharpness * dt) : 1;
    this.target.lerp(this.targetGoal, kf);

    const sp = Math.sin(this.polar);
    const cam = this.camera;
    cam.position.set(
      this.target.x + this.radius * sp * Math.sin(this.azimuth),
      this.target.y + this.radius * Math.cos(this.polar),
      this.target.z + this.radius * sp * Math.cos(this.azimuth),
    );
    if (cam.position.y < this.minCameraHeight) cam.position.y = this.minCameraHeight;
    cam.lookAt(this.target);
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
