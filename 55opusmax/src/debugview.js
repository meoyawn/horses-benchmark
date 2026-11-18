// Developer view: four synchronized views of the sculpt (side, front, top, 3/4).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function startDebugView(container, buildResult, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setScissorTest(true);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2d31);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(buildResult.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(buildResult.normals, 3));
  g.setIndex(new THREE.BufferAttribute(buildResult.indices, 1));
  const col = new Float32Array(buildResult.ao.length * 3);
  const mode = opts.color || 'ao';
  for (let i = 0; i < buildResult.ao.length; i++) {
    let r = buildResult.ao[i], gg = r, b = r;
    if (mode === 'tags') {
      const t = buildResult.tags;
      r = 0.6 + 0.4 * t[4 * i] - 0.3 * t[4 * i + 1];
      gg = 0.6 - 0.3 * t[4 * i] + 0.2 * t[4 * i + 2];
      b = 0.6 - 0.3 * t[4 * i + 1] + 0.4 * t[4 * i + 3] * 0.2;
      r *= buildResult.ao[i]; gg *= buildResult.ao[i]; b *= buildResult.ao[i];
    }
    if (mode === 'bones') {
      const si = buildResult.skinIndex, sw = buildResult.skinWeight;
      r = gg = b = 0;
      for (let j = 0; j < 4; j++) {
        const bi = si[4 * i + j], w = sw[4 * i + j];
        const h = (bi * 0.618034) % 1;
        const c = new THREE.Color().setHSL(h, 0.75, 0.55);
        r += c.r * w; gg += c.g * w; b += c.b * w;
      }
    }
    col[3 * i] = r; col[3 * i + 1] = gg; col[3 * i + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8cfc4, roughness: 0.75, vertexColors: true, wireframe: !!opts.wire });
  const mesh = new THREE.Mesh(g, mat);
  scene.add(mesh);
  if (opts.landmarks) {
    for (const e of opts.landmarks.eyes) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(e.r, 32, 16), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.15 }));
      eye.position.set(...e.c);
      scene.add(eye);
    }
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const grid = new THREE.GridHelper(4, 40, 0x555555, 0x3a3a3a);
  scene.add(grid);

  const center = new THREE.Vector3(opts.cx ?? 0.25, opts.cy ?? 1.05, opts.cz ?? 0);
  const mk = (pos, up = [0, 1, 0]) => {
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    c.position.copy(center).add(new THREE.Vector3(...pos));
    c.up.set(...up);
    c.lookAt(center);
    return c;
  };
  const sp = opts.span;
  let views = [
    { cam: mk([0, 0, -6]), span: sp ?? 2.9, label: 'left' },
    { cam: mk([6, 0, 0]), span: sp ?? 2.3, label: 'front' },
    { cam: mk([0, 6, 0], [1, 0, 0]), span: sp ?? 2.9, label: 'top' },
  ];
  const persp = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  persp.position.set(2.6, 1.9, 3.4);
  const controls = new OrbitControls(persp, renderer.domElement);
  controls.target.copy(center);
  controls.update();
  views.push({ cam: persp, persp: true });
  const single = {
    side: () => views[0], front: () => views[1], top: () => views[2], persp: () => views[3],
    back: () => ({ cam: mk([-6, 0, 0]), span: sp ?? 2.3 }),
    right: () => ({ cam: mk([0, 0, 6]), span: sp ?? 2.9 }),
    under: () => ({ cam: mk([0, -6, 0], [1, 0, 0]), span: sp ?? 2.9 }),
  };
  if (opts.view && single[opts.view]) views = [single[opts.view]()];

  function render() {
    const W = innerWidth, H = innerHeight;
    renderer.setSize(W, H);
    const quad = views.length > 1;
    const hw = quad ? W / 2 : W, hh = quad ? H / 2 : H;
    const rects = quad ? [[0, hh], [hw, hh], [0, 0], [hw, 0]] : [[0, 0]];
    views.forEach((v, i) => {
      const [x, y] = rects[i];
      renderer.setViewport(x, y, hw, hh);
      renderer.setScissor(x, y, hw, hh);
      const a = hw / hh;
      if (v.persp) { v.cam.aspect = a; v.cam.updateProjectionMatrix(); }
      else {
        const s = v.span / 2;
        v.cam.left = -s * a; v.cam.right = s * a; v.cam.top = s; v.cam.bottom = -s;
        v.cam.updateProjectionMatrix();
      }
      renderer.render(scene, v.cam);
    });
    requestAnimationFrame(render);
  }
  render();
  window.__debug = { scene, mesh, views, persp, controls, renderer };
}
