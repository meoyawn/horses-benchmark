// Rigid parts that ride on single bones: hooves, eyes with lids, ears.
import * as THREE from 'three';
import { EYE } from './anatomy.js';

const lerp = (a, b, t) => a + (b - a) * t;

/** Hoof in the hoof-bone frame: coffin joint at the origin, ground at y = -0.075. */
function hoofGeometry() {
  const SEG = 32, RINGS = 6, G = -0.075;
  const pos = [], col = [], idx = [];
  const ring = (t, grow = 1) => {
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const bx = (c >= 0 ? 0.085 : 0.045) * c, bz = 0.062 * sn;
      const tx = -0.0255 + 0.051 * c, tz = 0.05 * sn, ty = lerp(-0.03, 0.01, (c + 1) / 2);
      pos.push(lerp(bx, tx, t) * grow, lerp(G, ty, t), lerp(bz, tz, t) * grow);
      const streak = 0.82 + 0.3 * Math.abs(Math.sin(s * 12.9898) * 43758.5 % 1);
      const g = streak * (0.9 + 0.25 * t) * (t < 0.12 ? 1.25 : 1);
      col.push(g, g, g);
    }
  };
  for (let r = 0; r < RINGS; r++) ring(r / (RINGS - 1));
  ring(1.0, 1.05); // coronet band
  const rows = RINGS + 1;
  for (let r = 0; r < rows - 1; r++) for (let s = 0; s < SEG; s++) {
    const a = r * SEG + s, b = r * SEG + ((s + 1) % SEG), c = a + SEG, d = b + SEG;
    idx.push(a, c, b, b, c, d);
  }
  // Sole (own vertices so the ground edge stays crisp) and a hidden top cap.
  const sole0 = pos.length / 3;
  for (let s = 0; s < SEG; s++) {
    pos.push(pos[s * 3], G, pos[s * 3 + 2]);
    col.push(0.7, 0.7, 0.7);
  }
  const soleC = pos.length / 3;
  pos.push(0.015, G + 0.008, 0); col.push(0.5, 0.5, 0.5);
  const topC = pos.length / 3;
  pos.push(-0.0255, 0.0, 0); col.push(1, 1, 1);
  const top0 = (rows - 1) * SEG;
  for (let s = 0; s < SEG; s++) {
    const n = (s + 1) % SEG;
    idx.push(soleC, sole0 + s, sole0 + n, topC, top0 + n, top0 + s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A rolled, pointed ear: local +Y is its length, the opening faces +X. */
function earGeometry() {
  const L = 0.19, NV = 18, NA = 14;
  const pos = [], shade = [], idx = [];
  for (let r = 0; r <= NV; r++) {
    const v = lerp(-0.12, 1, r / NV), vc = Math.max(0, v);
    const w = 0.07 * Math.sqrt(vc + 0.25) * Math.pow(Math.max(0, 1 - vc), 0.6);
    const A = lerp(2.95, 1.75, Math.min(1, vc * 1.4));
    for (let s = 0; s <= NA; s++) {
      const a = lerp(-A, A, s / NA);
      pos.push((-Math.cos(a) * w + w * 0.25) * 0.78 + 0.03 * vc * vc, v * L, Math.sin(a) * w);
      shade.push(Math.max(Math.abs(s / NA - 0.5) * 2, vc) ** 3); // darker rim and tip
    }
  }
  for (let r = 0; r < NV; r++) for (let s = 0; s < NA; s++) {
    const a = r * (NA + 1) + s, b = a + 1, c = a + NA + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function eyeGeometry(side) {
  const g = new THREE.SphereGeometry(EYE.r, 28, 20);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const iris = new THREE.Color('#2c170b'), pupil = new THREE.Color('#030303'), white = new THREE.Color('#120c09');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const out = (p.getZ(i) / EYE.r) * side, y = p.getY(i) / EYE.r, x = p.getX(i) / EYE.r;
    c.copy(white);
    if (out > 0.45) c.copy(iris);
    if (out > 0.62 && Math.abs(y) < 0.3 && Math.abs(x) < 0.55) c.copy(pupil); // horizontal pupil
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function buildParts(horse) {
  const { bones, rest } = horse;
  const parts = { hooves: [], lids: [], ears: [] };

  // Hooves
  const hoofGeo = hoofGeometry();
  const hoofMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const paleHoofMat = hoofMat.clone();
  for (const name of ['hoofFL', 'hoofFR', 'hoofHL', 'hoofHR']) {
    const mesh = new THREE.Mesh(hoofGeo, hoofMat);
    mesh.castShadow = mesh.receiveShadow = true;
    bones[name].add(mesh);
    parts.hooves.push(mesh);
  }

  // Eyes and upper lids
  const eyeMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.22 });
  const lidMat = new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: 0.25 });
  const lidGeo = new THREE.SphereGeometry(EYE.r * 1.07, 20, 10, 0, Math.PI * 2, 0, 1.1);
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(EYE.x, EYE.y, EYE.z * side).sub(rest.head);
    pivot.rotation.z = -0.35; // align with the slope of the face
    bones.head.add(pivot);
    pivot.add(new THREE.Mesh(eyeGeometry(side), eyeMat));
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.userData.side = side;
    pivot.add(lid);
    parts.lids.push(lid);
    const lower = new THREE.Mesh(lidGeo, lidMat);
    lower.rotation.x = Math.PI - side * 0.3; // fixed lower lid: gives the eye its almond shape
    pivot.add(lower);
  }
  /** 0 = open, 1 = shut */
  parts.setBlink = (t) => {
    for (const lid of parts.lids) lid.rotation.x = lid.userData.side * lerp(-0.3, 1.05, t);
  };
  parts.setBlink(0);

  // Ears
  const earGeo = earGeometry();
  const earOuter = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.FrontSide });
  const earInner = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.BackSide });
  const D = Math.PI / 180;
  for (const [name, side] of [['earL', -1], ['earR', 1]]) {
    const holder = new THREE.Group();
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -16 * D);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), side * 14 * D);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -side * 35 * D);
    holder.quaternion.copy(qz).multiply(qx).multiply(qy);
    for (const mat of [earOuter, earInner]) {
      const m = new THREE.Mesh(earGeo, mat);
      m.castShadow = mat === earOuter;
      holder.add(m);
    }
    bones[name].add(holder);
    parts.ears.push(bones[name]);
  }

  parts.setCoat = (coat, markings) => {
    hoofMat.color.set(coat.hoof);
    paleHoofMat.color.set('#b9a58c');
    parts.hooves[2].material = markings ? paleHoofMat : hoofMat; // under the white sock
    lidMat.color.copy(coat._skin);
    earInner.color.copy(coat._skin).lerp(coat._body, 0.25);
    const sh = earGeo.attributes.shade, col = earGeo.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < sh.count; i++) {
      c.copy(coat._body).multiplyScalar(0.9).lerp(coat._dark, sh.getX(i) * (0.35 + 0.65 * coat.points));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  };
  return parts;
}
