// Mane, forelock and tail.
//
// A few dozen guide strands are simulated on the CPU as Verlet chains that
// collide with the sculpted body (the same implicit surface the skin came
// from). Thousands of render hairs are then interpolated between guides in the
// vertex shader, expanded into camera-facing ribbons and lit with a strand
// (tangent based) highlight model.
import * as THREE from 'three';
import { Group, cullProgram, evalProgram } from '../sculpt/sdf.js';
import { BONES, BONE_INDEX, J, headPoint, weigh } from './skeleton.js';

const NODE_COLUMNS = 16;
const GRAVITY = -9.81;

const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();

/** Deterministic pseudo-random stream (multiply-with-carry style mixer). */
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Guide {
  constructor(set, root, dir, length, bones) {
    this.set = set;
    this.root = root;          // rest position, model space
    this.dir = dir;            // rest growth direction
    this.length = length;
    this.bones = bones;        // [boneIndex, weight, ...]
    this.frame = bones[0];     // bone whose rest frame is used for collisions
    const n = set.nodes;
    this.segment = length / (n - 1);
    this.pos = new Float64Array(n * 3);
    this.prev = new Float64Array(n * 3);
    this.phase = Math.random() * 100;
    this.row = 0;
  }
}

export class Hair {
  /**
   * @param horse  the Horse (rig + sculpt)
   * @param scene  hair lives in world space, so it is added to the scene
   */
  constructor(horse, scene) {
    this.horse = horse;
    this.rig = horse.rig;
    this.sets = {};
    this.guides = [];
    this.time = 0;
    this.wind = new THREE.Vector3(0.9, 0, 0.5);
    this.windGust = 0;
    const rand = makeRandom(7);
    this.rand = rand;

    this._buildColliders(horse.sculpt);
    this._buildMane(horse.sculpt, rand);
    this._buildForelock(rand);
    this._buildTail(rand);

    let row = 0;
    for (const g of this.guides) g.row = row++;
    this.rows = row;
    this.data = new Float32Array(NODE_COLUMNS * this.rows * 4);
    this.texture = new THREE.DataTexture(this.data, NODE_COLUMNS, this.rows, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    this.mesh = this._buildMesh(rand);
    scene.add(this.mesh);
    this.reset();
  }

  // ------------------------------------------------------------ colliders ---

  _buildColliders(groups) {
    // Programs of nearby sculpt primitives, evaluated in a bone's rest frame.
    const pick = (names) => {
      const out = [];
      for (const g of groups) {
        const keep = g.prims.filter((p) => names.includes(g.name) || names.includes(p.name));
        if (!keep.length) continue;
        const copy = new Group(g.name, { op: g.op, k: g.k, mirror: g.mirror });
        copy.add(...keep);
        out.push(copy);
      }
      return out;
    };
    const neckGroups = pick(['trunk', 'neck', 'head', 'shoulderBlade']);
    const tailGroups = pick(['trunk', 'quarter', 'buttock', 'thigh', 'dock']);
    this.neckGroups = neckGroups;
    this.field = {
      neck: cullProgram(neckGroups, 0.85, 1.6, 0, 0.75, 0.1),
      head: cullProgram(neckGroups, 1.25, 1.75, 0, 0.4, 0.1),
      tail: cullProgram(tailGroups, -0.75, 1.1, 0, 0.6, 0.1),
    };
  }

  /** Walks a point down a direction until it meets the sculpted surface. */
  _dropToSurface(prog, p, dir, maxDist = 0.5) {
    let t = 0;
    for (let i = 0; i < 80; i++) {
      const d = evalProgram(prog, p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t);
      if (d < 0.0005) break;
      t += d * 0.8;
      if (t > maxDist) break;
    }
    return [p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t];
  }

  _neckBones(p) {
    const acc = new Float32Array(BONES.length);
    weigh(NECK_PROBE, p[0], p[1], p[2], false, 1, acc);
    const list = [];
    for (let i = 0; i < acc.length; i++) if (acc[i] > 0.02) list.push([i, acc[i]]);
    list.sort((a, b) => b[1] - a[1]);
    const top = list.slice(0, 3);
    const sum = top.reduce((s, e) => s + e[1], 0);
    return top.flatMap(([i, w]) => [i, w / sum]);
  }

  _addSet(name, nodes, opts) {
    const set = { name, nodes, guides: [], ...opts };
    this.sets[name] = set;
    return set;
  }

  _addGuide(set, root, dir, length, bones) {
    const l = Math.hypot(dir[0], dir[1], dir[2]);
    const g = new Guide(set, new THREE.Vector3(...root), new THREE.Vector3(dir[0] / l, dir[1] / l, dir[2] / l), length, bones);
    set.guides.push(g);
    this.guides.push(g);
    return g;
  }

  // ------------------------------------------------------------------ mane ---

  _buildMane() {
    const set = this._addSet('mane', 9, { field: 'neck', stiff: 2, stiffness: 0.5, drag: 3.2, friction: 0.5 });
    const COUNT = 30;
    for (let i = 0; i < COUNT; i++) {
      const u = i / (COUNT - 1);
      // crest from just behind the ears down to the withers
      const x = 1.115 + (0.5 - 1.115) * u;
      const top = this._dropToSurface(this.field.neck, [x, 2.2, 0.004], [0, -1, 0], 1.0);
      const root = [top[0], top[1] - 0.004, 0.006];
      const length = 0.2 + 0.14 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 0.04 * u;
      // grows up and over to the right-hand side
      const g = this._addGuide(set, root, [0.0, 0.5, 0.86], length, this._neckBones(root));
      // only the nearby part of the neck can touch this lock
      g.prog = cullProgram(this.neckGroups, root[0], root[1] - length * 0.45, 0.06, length * 0.7 + 0.06, 0.04);
    }
  }

  _buildForelock() {
    const set = this._addSet('forelock', 7, { field: 'head', stiff: 2, stiffness: 0.55, drag: 3.2, friction: 0.5 });
    const head = BONE_INDEX.head;
    const spots = [-0.03, -0.015, 0, 0.015, 0.03];
    for (const w of spots) {
      const start = headPoint(0.03 + 0.012 * Math.abs(w) / 0.03, 0.2, w);
      const down = [-Math.sin(0.908), -Math.cos(0.908), 0]; // towards the skull
      const root = this._dropToSurface(this.field.head, start, down, 0.4);
      // falls forward over the forehead
      const dir = [0.75, -0.25, w * 6];
      this._addGuide(set, root, dir, 0.17 + 0.03 * (1 - Math.abs(w) / 0.03), [head, 1]);
    }
  }

  // ------------------------------------------------------------------ tail ---

  _buildTail() {
    const set = this._addSet('tail', 15, { field: 'tail', stiff: 3, stiffness: 0.42, drag: 2.4, friction: 0.35 });
    const stations = [
      [J.dock, 'pelvis', 'tail1', 0.25],
      [J.tail2, 'tail1', 'tail2', 0.5],
      [J.tail3, 'tail2', 'tail3', 0.5],
      [J.tail4, 'tail3', 'tail4', 0.5],
      [J.tailEnd, 'tail4', 'tail4', 1],
    ];
    const radii = [0.046, 0.038, 0.03, 0.024, 0.012];
    const AROUND = 4;
    set.around = AROUND;
    set.stations = stations.length;
    for (let s = 0; s < stations.length; s++) {
      const [p, boneA, boneB, mix] = stations[s];
      const next = stations[Math.min(s + 1, stations.length - 1)][0];
      const prev = stations[Math.max(s - 1, 0)][0];
      // dock axis (pointing towards the tip) and its back-facing normal
      let ax = next[0] - prev[0], ay = next[1] - prev[1];
      const al = Math.hypot(ax, ay);
      ax /= al; ay /= al;
      const bx = -ay, by = ax; // rotate the axis by +90 degrees: points up and back
      const back = bx < 0 ? [bx, by] : [-bx, -by];
      for (let a = 0; a < AROUND; a++) {
        const ang = (-1 + (2 * a) / (AROUND - 1)) * 1.75; // around the back of the dock
        const nx = back[0] * Math.cos(ang), ny = back[1] * Math.cos(ang), nz = Math.sin(ang);
        const r = radii[s] * 0.8;
        const root = [p[0] + nx * r, p[1] + ny * r, nz * r];
        const dir = [ax * 0.75 + nx * 0.65, ay * 0.75 + ny * 0.65, nz * 0.65];
        const length = Math.max(0.35, (root[1] - 0.2) * (0.94 + 0.05 * a / AROUND));
        const bones = boneA === boneB
          ? [BONE_INDEX[boneA], 1]
          : [BONE_INDEX[boneB], mix, BONE_INDEX[boneA], 1 - mix];
        const g = this._addGuide(set, root, dir, length, bones);
        g.frame = BONE_INDEX.pelvis;
      }
    }
  }

  // --------------------------------------------------------- render hairs ---

  _buildMesh(rand) {
    const strands = [];
    const add = (rows, w0, w1, nodes, lenFactor, width, shade, spread) => {
      strands.push({ rows, w0, w1, nodes, lenFactor, width, shade, spread, angle: rand() * 6.283, jitter: rand() });
    };

    // mane: blend neighbouring guides along the crest, gathering into locks
    {
      const set = this.sets.mane;
      const G = set.guides.length;
      for (let i = 0; i < 2100; i++) {
        const u = rand() * (G - 1);
        const g0 = Math.min(Math.floor(u), G - 2);
        const f = u - g0;
        const lock = (Math.floor(f * 2.4) + 0.5) / 2.4;
        const f1 = f + (Math.min(1, lock) - f) * 0.7;
        const layer = rand();
        add([set.guides[g0].row, set.guides[g0 + 1].row, set.guides[g0].row],
          [1 - f, f, 0], [1 - f1, f1, 0], set.nodes,
          0.62 + 0.38 * Math.pow(rand(), 0.5), 0.8 + 0.5 * rand(), 0.45 + 0.55 * layer, 0.002 + 0.02 * layer);
      }
    }
    // forelock
    {
      const set = this.sets.forelock;
      const G = set.guides.length;
      for (let i = 0; i < 420; i++) {
        const u = rand() * (G - 1);
        const g0 = Math.min(Math.floor(u), G - 2);
        const f = u - g0;
        const layer = rand();
        add([set.guides[g0].row, set.guides[g0 + 1].row, set.guides[g0].row],
          [1 - f, f, 0], [1 - f, f, 0], set.nodes,
          0.55 + 0.45 * rand(), 0.8 + 0.5 * rand(), 0.5 + 0.5 * layer, 0.002 + 0.014 * layer);
      }
    }
    // tail: blend three guides from a cell of the (station, angle) lattice
    {
      const set = this.sets.tail;
      const A = set.around, S = set.stations;
      const at = (s, a) => set.guides[s * A + a].row;
      for (let i = 0; i < 2300; i++) {
        const s = Math.min(Math.floor(Math.pow(rand(), 0.8) * (S - 1)), S - 2);
        const a = Math.min(Math.floor(rand() * (A - 1)), A - 2);
        const upper = rand() < 0.5;
        const rows = upper ? [at(s, a), at(s + 1, a), at(s, a + 1)] : [at(s + 1, a + 1), at(s, a + 1), at(s + 1, a)];
        let b0 = rand(), b1 = rand();
        if (b0 + b1 > 1) { b0 = 1 - b0; b1 = 1 - b1; }
        const w = [1 - b0 - b1, b0, b1];
        const lead = w.indexOf(Math.max(...w));
        const tip = w.map((v, k) => v * 0.45 + (k === lead ? 0.55 : 0));
        const layer = rand();
        add(rows, w, tip, set.nodes, 0.55 + 0.45 * Math.pow(rand(), 0.6), 0.9 + 0.6 * rand(), 0.4 + 0.6 * layer, 0.004 + 0.038 * layer);
      }
    }

    const SEG = 14;
    const vertsPer = (SEG + 1) * 2;
    const count = strands.length;
    const position = new Float32Array(count * vertsPer * 3);
    const guides = new Float32Array(count * vertsPer * 3);
    const w0 = new Float32Array(count * vertsPer * 3);
    const w1 = new Float32Array(count * vertsPer * 3);
    const params = new Float32Array(count * vertsPer * 4);
    const extra = new Float32Array(count * vertsPer * 4);
    const index = new Uint32Array(count * SEG * 6);
    let v = 0, o = 0;
    for (const s of strands) {
      const base = v;
      for (let i = 0; i <= SEG; i++) {
        for (const sideSign of [-1, 1]) {
          position.set([i / SEG, sideSign, s.jitter], v * 3);
          guides.set(s.rows, v * 3);
          w0.set(s.w0, v * 3);
          w1.set(s.w1, v * 3);
          params.set([(s.nodes - 1) * s.lenFactor, s.nodes - 1, s.width, s.shade], v * 4);
          extra.set([s.angle, s.spread, s.jitter, s.lenFactor], v * 4);
          v++;
        }
      }
      for (let i = 0; i < SEG; i++) {
        const a = base + i * 2;
        index[o++] = a; index[o++] = a + 1; index[o++] = a + 3;
        index[o++] = a; index[o++] = a + 3; index[o++] = a + 2;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    // placeholder: without a normal attribute three would flat-shade the hair
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(count * vertsPer * 3), 3, true));
    geometry.setAttribute('aGuides', new THREE.BufferAttribute(guides, 3));
    geometry.setAttribute('aW0', new THREE.BufferAttribute(w0, 3));
    geometry.setAttribute('aW1', new THREE.BufferAttribute(w1, 3));
    geometry.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
    geometry.setAttribute('aExtra', new THREE.BufferAttribute(extra, 4));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.uniforms = {
      uGuides: { value: this.texture },
      uPixel: { value: 0.001 },
      uWidth: { value: 0.0042 },
    };
    const material = createHairMaterial(this.uniforms);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = createHairDepthMaterial(this.uniforms);
    this.strandCount = count;
    return mesh;
  }

  // ------------------------------------------------------------ simulation ---

  /** Model-space anchor (position and growth direction) of a guide. */
  _anchor(g, outPos, outDir) {
    const rig = this.rig;
    outPos.set(0, 0, 0);
    outDir.set(0, 0, 0);
    for (let i = 0; i < g.bones.length; i += 2) {
      const id = g.bones[i], w = g.bones[i + 1];
      _v.copy(g.root).sub(rig.rest[id]).applyQuaternion(rig.quat[id]).add(rig.pos[id]);
      outPos.addScaledVector(_v, w);
      _v.copy(g.dir).applyQuaternion(rig.quat[id]);
      outDir.addScaledVector(_v, w);
    }
    outDir.normalize();
  }

  /** Puts every strand in a relaxed hanging pose (used at start-up). */
  reset() {
    const root = this.horse.root;
    root.updateMatrixWorld(true);
    const pos = new THREE.Vector3(), dir = new THREE.Vector3();
    for (const g of this.guides) {
      this._anchor(g, pos, dir);
      pos.applyMatrix4(root.matrixWorld);
      dir.transformDirection(root.matrixWorld);
      const n = g.set.nodes;
      for (let i = 0; i < n; i++) {
        // start along the growth direction, bending over into a hang
        const t = i / (n - 1);
        const bend = Math.min(1, t * 2.2);
        _v.set(dir.x * (1 - bend), dir.y * (1 - bend) - bend, dir.z * (1 - bend) + 0.25 * bend * Math.sign(dir.z || 1)).normalize();
        if (i === 0) {
          g.pos.set([pos.x, pos.y, pos.z], 0);
        } else {
          g.pos[i * 3] = g.pos[i * 3 - 3] + _v.x * g.segment;
          g.pos[i * 3 + 1] = g.pos[i * 3 - 2] + _v.y * g.segment;
          g.pos[i * 3 + 2] = g.pos[i * 3 - 1] + _v.z * g.segment;
        }
      }
      g.prev.set(g.pos);
    }
    for (let i = 0; i < 160; i++) this._step(1 / 90, 0.2);
    this._upload();
  }

  update(dt, camera, viewportHeight) {
    const steps = dt > 1 / 50 ? 3 : 2;
    const h = Math.min(dt, 1 / 24) / steps;
    for (let i = 0; i < steps; i++) this._step(h, 1);
    this._upload();
    this.mesh.position.copy(this.horse.root.position);
    if (camera) this.setCamera(camera, viewportHeight);
  }

  /** Hairs are never drawn thinner than about a pixel for the given camera. */
  setCamera(camera, viewportHeight) {
    this.uniforms.uPixel.value = 2 * Math.tan((camera.fov * Math.PI) / 360) / viewportHeight;
  }

  _step(dt, windScale) {
    this.time += dt;
    const rig = this.rig;
    const root = this.horse.root;
    _m.copy(root.matrixWorld);
    _mi.copy(_m).invert();
    const pos = new THREE.Vector3(), dir = new THREE.Vector3();
    const t = this.time;
    // a breeze that swells and fades
    const gust = 0.55 + 0.45 * Math.sin(t * 0.37) * Math.sin(t * 0.83 + 1.3);
    const wx = this.wind.x * gust * windScale, wz = this.wind.z * gust * windScale;

    for (const g of this.guides) {
      const set = g.set;
      const n = set.nodes;
      const P = g.pos, Q = g.prev;
      this._anchor(g, pos, dir);
      pos.applyMatrix4(_m);
      dir.transformDirection(_m);
      P[0] = pos.x; P[1] = pos.y; P[2] = pos.z;
      Q[0] = pos.x; Q[1] = pos.y; Q[2] = pos.z;

      const drag = Math.min(0.9, set.drag * dt);
      const fb = g.frame;
      const prog = g.prog || this.field[set.field];
      const restB = rig.rest[fb], posB = rig.pos[fb];
      _q.copy(rig.quat[fb]);
      _qi.copy(_q).invert();
      const seg = g.segment;

      for (let i = 1; i < n; i++) {
        const k = i * 3;
        const s = i / (n - 1);
        // turbulence grows towards the free end
        const flutter = windScale * s * 0.9;
        const ax = drag * (wx + flutter * Math.sin(t * 2.1 + g.phase + s * 3.0)) / dt;
        const az = drag * (wz + flutter * Math.cos(t * 1.7 + g.phase * 1.3 + s * 2.0)) / dt;
        const vx = (P[k] - Q[k]) * (1 - drag);
        const vy = (P[k + 1] - Q[k + 1]) * (1 - drag);
        const vz = (P[k + 2] - Q[k + 2]) * (1 - drag);
        Q[k] = P[k]; Q[k + 1] = P[k + 1]; Q[k + 2] = P[k + 2];
        P[k] += vx + ax * dt * dt;
        P[k + 1] += vy + GRAVITY * dt * dt;
        P[k + 2] += vz + az * dt * dt;
      }

      // hair springs back towards the direction it grows in near the root
      for (let i = 1; i <= set.stiff; i++) {
        const k = i * 3;
        const blend = set.stiffness * (1 - (i - 1) / set.stiff);
        P[k] += (P[k - 3] + dir.x * seg - P[k]) * blend;
        P[k + 1] += (P[k - 2] + dir.y * seg - P[k + 1]) * blend;
        P[k + 2] += (P[k - 1] + dir.z * seg - P[k + 2]) * blend;
      }

      // keep every segment at its length: both ends give way equally, except
      // the root, which is held by the skin
      for (let iter = 0; iter < 6; iter++) {
        for (let i = 1; i < n; i++) {
          const k = i * 3;
          const dx = P[k] - P[k - 3], dy = P[k + 1] - P[k - 2], dz = P[k + 2] - P[k - 1];
          const len = Math.hypot(dx, dy, dz) || 1e-6;
          const f = (len - seg) / len;
          if (i === 1) {
            P[k] -= dx * f; P[k + 1] -= dy * f; P[k + 2] -= dz * f;
          } else {
            const h = f * 0.5;
            P[k - 3] += dx * h; P[k - 2] += dy * h; P[k - 1] += dz * h;
            P[k] -= dx * h; P[k + 1] -= dy * h; P[k + 2] -= dz * h;
          }
        }
      }

      // collide with the body, in the rest frame of the bone that carries it
      for (let i = 2; i < n; i++) {
        const k = i * 3;
        _v.set(P[k], P[k + 1], P[k + 2]).applyMatrix4(_mi).sub(posB);
        _v2.copy(_v).applyQuaternion(_qi).add(restB);
        const margin = i === 2 ? 0.006 : 0.012;
        const d = evalProgram(prog, _v2.x, _v2.y, _v2.z);
        if (d < margin) {
          const e = 0.002;
          const gx = evalProgram(prog, _v2.x + e, _v2.y, _v2.z) - d;
          const gy = evalProgram(prog, _v2.x, _v2.y + e, _v2.z) - d;
          const gz = evalProgram(prog, _v2.x, _v2.y, _v2.z + e) - d;
          const gl = Math.hypot(gx, gy, gz) || 1;
          const push = (margin - d) / gl;
          _v2.x += gx * push; _v2.y += gy * push; _v2.z += gz * push;
          _v2.sub(restB).applyQuaternion(_q).add(posB).applyMatrix4(_m);
          P[k] = _v2.x; P[k + 1] = _v2.y; P[k + 2] = _v2.z;
          // friction against the coat
          Q[k] += (P[k] - Q[k]) * set.friction;
          Q[k + 1] += (P[k + 1] - Q[k + 1]) * set.friction;
          Q[k + 2] += (P[k + 2] - Q[k + 2]) * set.friction;
        }
        if (P[k + 1] < 0.02) {
          P[k + 1] = 0.02;
          Q[k] += (P[k] - Q[k]) * 0.6;
          Q[k + 2] += (P[k + 2] - Q[k + 2]) * 0.6;
        }
      }

      // a little internal damping: each node sheds velocity relative to its parent
      for (let i = 2; i < n; i++) {
        const k = i * 3;
        const rel = 0.06;
        Q[k] += ((P[k] - Q[k]) - (P[k - 3] - Q[k - 3])) * rel;
        Q[k + 1] += ((P[k + 1] - Q[k + 1]) - (P[k - 2] - Q[k - 2])) * rel;
        Q[k + 2] += ((P[k + 2] - Q[k + 2]) - (P[k - 1] - Q[k - 1])) * rel;
      }
    }
  }

  _upload() {
    const data = this.data;
    const origin = this.horse.root.position;
    for (const g of this.guides) {
      const n = g.set.nodes;
      const base = g.row * NODE_COLUMNS * 4;
      for (let i = 0; i < NODE_COLUMNS; i++) {
        const k = Math.min(i, n - 1) * 3;
        data[base + i * 4] = g.pos[k] - origin.x;
        data[base + i * 4 + 1] = g.pos[k + 1] - origin.y;
        data[base + i * 4 + 2] = g.pos[k + 2] - origin.z;
        data[base + i * 4 + 3] = 1;
      }
    }
    this.texture.needsUpdate = true;
  }
}

const NECK_PROBE = { skin: { neck: true } };

// ---------------------------------------------------------------- shaders ---

const HAIR_VERTEX_PARS = /* glsl */ `
uniform sampler2D uGuides;
uniform float uPixel;
uniform float uWidth;
attribute vec3 aGuides;
attribute vec3 aW0;
attribute vec3 aW1;
attribute vec4 aParams;
attribute vec4 aExtra;
varying vec3 vHairTangent;
varying vec4 vHair;

void hairGuide(float row, float s, float nodeMax, out vec3 p, out vec3 tg) {
  float fi = min(floor(s), nodeMax - 1.0);
  float f = s - fi;
  int r = int(row + 0.5);
  int i1 = int(fi);
  int n = int(nodeMax + 0.5);
  vec3 p0 = texelFetch(uGuides, ivec2(max(i1 - 1, 0), r), 0).xyz;
  vec3 p1 = texelFetch(uGuides, ivec2(i1, r), 0).xyz;
  vec3 p2 = texelFetch(uGuides, ivec2(min(i1 + 1, n), r), 0).xyz;
  vec3 p3 = texelFetch(uGuides, ivec2(min(i1 + 2, n), r), 0).xyz;
  // Catmull-Rom segment between p1 and p2
  vec3 b = p2 - p0;
  vec3 c = 2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3;
  vec3 d = -p0 + 3.0 * p1 - 3.0 * p2 + p3;
  p = 0.5 * (2.0 * p1 + b * f + c * f * f + d * f * f * f);
  tg = 0.5 * (b + 2.0 * c * f + 3.0 * d * f * f);
}

void hairStrand(out vec3 P, out vec3 T, out vec3 N) {
  float t = position.x;
  float s = t * aParams.x;
  vec3 w = mix(aW0, aW1, pow(t, 1.3));
  w /= (w.x + w.y + w.z);
  vec3 p0, p1, p2, t0, t1, t2;
  hairGuide(aGuides.x, s, aParams.y, p0, t0);
  hairGuide(aGuides.y, s, aParams.y, p1, t1);
  hairGuide(aGuides.z, s, aParams.y, p2, t2);
  P = p0 * w.x + p1 * w.y + p2 * w.z;
  T = normalize(t0 * w.x + t1 * w.y + t2 * w.z + vec3(0.0, -1e-5, 0.0));
  // give the lock some body: each hair sits off the guide in its own direction
  vec3 ref = normalize(vec3(cos(aExtra.x), 0.4 * sin(aExtra.x * 1.7), sin(aExtra.x)));
  vec3 off = normalize(cross(T, ref) + 1e-4);
  P += off * aExtra.y * (0.3 + 0.7 * pow(t, 0.6));
  // a little waviness along each hair
  P += off * 0.0035 * sin(t * (9.0 + 7.0 * aExtra.z) + aExtra.x * 5.0) * t;

  vec3 worldP = (modelMatrix * vec4(P, 1.0)).xyz;
  vec3 toCam = cameraPosition - worldP;
  float dist = length(toCam);
  toCam /= max(dist, 1e-4);
  vec3 side = normalize(cross(T, toCam) + 1e-5);
  float taper = 1.0 - 0.8 * smoothstep(0.55, 1.0, t);
  float width = max(uWidth * aParams.z, uPixel * dist * 1.15) * taper;
  P += side * position.y * width * 0.5;
  N = normalize(off * 0.65 + toCam * 0.5);
}
`;

function createHairMaterial(uniforms) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.12,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HAIR_VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec3 hairP, hairT, hairN;
        hairStrand(hairP, hairT, hairN);
        vec3 objectNormal = hairN;
        vHairTangent = normalize((modelViewMatrix * vec4(hairT, 0.0)).xyz);
        vHair = vec4(position.x, position.y, aParams.w, position.z);
      `)
      .replace('#include <begin_vertex>', 'vec3 transformed = hairP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        varying vec3 vHairTangent;
        varying vec4 vHair;
      `)
      .replace('#include <lights_physical_pars_fragment>', /* glsl */ `#include <lights_physical_pars_fragment>
        float hairLobe(vec3 T, vec3 L, vec3 V, float power) {
          float tl = dot(T, L), tv = dot(T, V);
          float c = sqrt(max(0.0, 1.0 - tl * tl)) * sqrt(max(0.0, 1.0 - tv * tv)) - tl * tv;
          return pow(max(c, 0.0), power);
        }
        void RE_Direct_Hair(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          vec3 T = normalize(vHairTangent);
          vec3 L = directLight.direction;
          float tl = dot(T, L);
          float sinTL = sqrt(max(0.0, 1.0 - tl * tl));
          float wrap = saturate(dot(geometryNormal, L) * 0.5 + 0.5);
          // strands scatter light around their axis, so the terminator is soft
          reflectedLight.directDiffuse += directLight.color * material.diffuseColor * (sinTL * (0.3 + 0.7 * wrap)) * RECIPROCAL_PI * 1.3;
          float jitter = (vHair.w - 0.5) * 0.16;
          vec3 T1 = normalize(T + (0.06 + jitter) * geometryNormal);
          vec3 T2 = normalize(T - (0.16 - jitter) * geometryNormal);
          float lit = smoothstep(0.0, 0.55, wrap);
          vec3 glint = vec3(0.026, 0.025, 0.024) * hairLobe(T1, L, geometryViewDir, 60.0);
          vec3 glow = vec3(0.012, 0.007, 0.004) * hairLobe(T2, L, geometryViewDir, 12.0);
          reflectedLight.directSpecular += directLight.color * (glint + glow) * lit * vHair.z;
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Hair
      `)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        {
          float t = vHair.x;
          // near-black with brown, sun-bleached ends; inner hairs sit in shade
          vec3 rootCol = vec3(0.012, 0.010, 0.009);
          vec3 tipCol = vec3(0.020, 0.012, 0.008);
          vec3 hair = mix(rootCol, tipCol, smoothstep(0.35, 1.0, t) * (0.35 + 0.65 * vHair.w));
          float shade = vHair.z * (0.55 + 0.45 * smoothstep(0.0, 0.18, t));
          // soft edge darkening across the ribbon reads as a round fibre
          shade *= 1.0 - 0.3 * vHair.y * vHair.y;
          diffuseColor.rgb = hair * shade;
        }
      `);
  };
  material.customProgramCacheKey = () => 'horse-hair';
  return material;
}

function createHairDepthMaterial(uniforms) {
  const material = new THREE.MeshDepthMaterial();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HAIR_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', /* glsl */ `
        vec3 hairP, hairT, hairN;
        hairStrand(hairP, hairT, hairN);
        vec3 transformed = hairP;
      `);
  };
  material.customProgramCacheKey = () => 'horse-hair-depth';
  return material;
}
