import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const params = new URLSearchParams(location.search);
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const log = (m) => { console.log('[horse]', m); loadingText.textContent = m; };
const tick = () => new Promise((r) => setTimeout(r, 16));

async function startDebug() {
  const { buildBody } = await import('./build.js');
  const { startDebugView } = await import('./debugview.js');
  const { landmarks } = await import('./anatomy.js');
  const res = buildBody({ h: parseFloat(params.get('h') || '0.0085'), log });
  window.__build = res;
  loading.classList.add('done');
  const num = (k) => (params.has(k) ? parseFloat(params.get(k)) : undefined);
  startDebugView(document.getElementById('app'), res, {
    color: params.get('color') || 'ao', wire: params.has('wire'), view: params.get('view'),
    cx: num('cx'), cy: num('cy'), cz: num('cz'), span: num('span'), landmarks: landmarks(),
  });
}

async function startApp() {
  const { Horse } = await import('./horse.js');
  const { Environment } = await import('./environment.js');
  const { applyCoat, COATS } = await import('./coat.js');
  const { Locomotion, GAIT_ORDER } = await import('./locomotion.js');
  const { buildHair } = await import('./hair.js');
  const { WARP } = await import('./anatomy.js');
  const { HorseAudio } = await import('./audio.js');

  // ------------------------------------------------------------ renderer / scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.05, 900);
  camera.position.set(3.3, 1.7, 4.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.25, 1.0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.7;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  log('Lighting the meadow…');
  await tick();
  const env = new Environment(renderer, scene);
  log('Sculpting the horse…');
  await tick();
  const t0 = performance.now();
  const horse = new Horse({ h: parseFloat(params.get('h') || '0.0085'), log });
  scene.add(horse.group);
  log('Growing mane and tail…');
  await tick();
  const hair = buildHair(horse, WARP);
  for (const h of hair) scene.add(h.mesh);
  const buildMs = performance.now() - t0;
  const loco = new Locomotion(horse);
  const audio = new HorseAudio();

  // ------------------------------------------------------------ appearance
  const look = { coat: params.get('coat') || 'bay', face: 3, socks: 'one', seed: 0.37 };
  const SOCKS = { none: [0, 0, 0, 0], one: [0, 0.22, 0, 0.12], hind: [0, 0, 0.2, 0.2], four: [0.4, 0.4, 0.45, 0.45] };
  const setHairColors = (preset) => {
    const c = COATS[preset] || COATS.bay;
    for (const h of hair) {
      const base = h.name === 'tail' ? c.tail : c.mane;
      const tip = new THREE.Color(base).offsetHSL(0, -0.03, 0.025);
      h.setColor(base, tip);
    }
  };
  const applyLook = () => {
    applyCoat(horse.material, look.coat, look.face, SOCKS[look.socks], look.seed);
    setHairColors(look.coat);
    const c = COATS[look.coat] || COATS.bay;
    horse.setLidColor(new THREE.Color(c.skin).lerp(new THREE.Color(c.base), look.face === 4 ? 0.6 : 0.25));
  };
  applyLook();

  const updatePixel = () => {
    const px = (2 * Math.tan((camera.fov * Math.PI) / 360)) / (innerHeight * renderer.getPixelRatio());
    for (const h of hair) h.uniforms.uPixel.value = px;
  };
  updatePixel();

  const state = { timeScale: 1, paused: false, follow: true, cinematic: false };
  const skeleton = new THREE.SkeletonHelper(horse.mesh);
  skeleton.visible = false;
  scene.add(skeleton);

  // ------------------------------------------------------------ UI
  const $ = (id) => document.getElementById(id);
  const gaitBtns = [...document.querySelectorAll('#gaits button')];
  const setGait = (g) => {
    loco.setGait(g);
    gaitBtns.forEach((b) => b.classList.toggle('on', b.dataset.gait === g));
  };
  gaitBtns.forEach((b) => b.addEventListener('click', () => setGait(b.dataset.gait)));

  const coatsEl = $('coats');
  for (const [key, c] of Object.entries(COATS)) {
    const b = document.createElement('button');
    b.className = 'swatch' + (key === look.coat ? ' on' : '');
    b.title = c.label;
    const i = document.createElement('i');
    i.style.background = `radial-gradient(circle at 35% 30%, ${c.belly}, ${c.base} 55%, ${c.mane} 100%)`;
    if (c.pinto) i.style.background = `radial-gradient(circle at 30% 30%, #efe9e0 35%, ${c.base} 36%)`;
    if (c.appy) i.style.background = `radial-gradient(circle at 70% 60%, ${c.base} 12%, transparent 13%), radial-gradient(circle at 35% 40%, ${c.base} 10%, #ebe4d8 11%)`;
    if (c.dapple === 1) i.style.background = `radial-gradient(circle at 35% 35%, #d7d5d1 20%, ${c.base} 22%, ${c.dappleDark} 70%)`;
    b.append(i, document.createTextNode(c.short));
    b.addEventListener('click', () => {
      look.coat = key;
      look.seed = Math.random();
      coatsEl.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      applyLook();
    });
    coatsEl.appendChild(b);
  }
  $('face').addEventListener('change', (e) => { look.face = +e.target.value; applyLook(); });
  $('socks').addEventListener('change', (e) => { look.socks = e.target.value; applyLook(); });
  $('roam').addEventListener('change', (e) => {
    loco.autopilot = e.target.checked;
    if (e.target.checked && loco.targetGait === 'stand') setGait('walk');
  });
  $('slowmo').addEventListener('input', (e) => {
    state.timeScale = +e.target.value;
    $('slowmo-v').textContent = state.timeScale.toFixed(2).replace(/0$/, '') + '×';
  });
  let todTimer = 0;
  $('tod').addEventListener('input', (e) => {
    clearTimeout(todTimer);
    const v = +e.target.value;
    todTimer = setTimeout(() => env.setTimeOfDay(v), 30);
  });
  $('follow').addEventListener('change', (e) => { state.follow = e.target.checked; });
  $('cine').addEventListener('change', (e) => { state.cinematic = e.target.checked; });
  $('sound').addEventListener('change', (e) => audio.enable(e.target.checked));
  $('skeleton').addEventListener('change', (e) => {
    const on = e.target.checked;
    skeleton.visible = on;
    horse.material.transparent = on;
    horse.material.opacity = on ? 0.35 : 1;
    horse.material.depthWrite = !on;
    horse.material.needsUpdate = true;
  });
  $('wire').addEventListener('change', (e) => { horse.material.wireframe = e.target.checked; });
  $('hairOn').addEventListener('change', (e) => hair.forEach((h) => (h.mesh.visible = e.target.checked)));
  document.querySelectorAll('#acts button').forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'toss') { loco.toss(); audio.snort(); return; }
    setGait('stand');
    const start = () => (loco.speed < 0.05 && loco.gaitName === 'stand' ? loco.startBehaviour(act) : setTimeout(start, 100));
    start();
  }));
  const frameView = () => {
    const panel = $('panel');
    const open = !panel.classList.contains('collapsed') && innerWidth >= 720;
    const shift = open ? Math.min(panel.offsetWidth + 14, innerWidth * 0.4) * 0.5 : 0;
    if (shift > 0) camera.setViewOffset(innerWidth, innerHeight, shift, 0, innerWidth, innerHeight);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  $('panel-toggle').addEventListener('click', () => { $('panel').classList.toggle('collapsed'); frameView(); });
  if (innerWidth < 720) $('panel').classList.add('collapsed');
  frameView();

  // keyboard
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    keys.add(e.code);
    const map = { Digit1: 'stand', Digit2: 'walk', Digit3: 'trot', Digit4: 'canter', Digit5: 'gallop' };
    if (map[e.code]) setGait(map[e.code]);
    const gi = GAIT_ORDER.indexOf(loco.targetGait);
    if (e.code === 'KeyW' || e.code === 'ArrowUp') setGait(GAIT_ORDER[Math.min(GAIT_ORDER.length - 1, gi + 1)]);
    if (e.code === 'KeyS' || e.code === 'ArrowDown') setGait(GAIT_ORDER[Math.max(0, gi - 1)]);
    if (e.code === 'Space') { loco.toss(); audio.snort(); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));

  // pointer: the horse watches the cursor; clicking it makes it toss its head
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointerInside = false;
  let downAt = null;
  const pointerTarget = new THREE.Vector3();
  const canvas = renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    pointerInside = true;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // a vertical plane in front of the horse's head, facing the camera
    const head = horse.bone.head.getWorldPosition(new THREE.Vector3());
    const n = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, head.clone().addScaledVector(n, 0.8));
    ray.ray.intersectPlane(plane, pointerTarget);
    canvas.classList.toggle('over-horse', hitHorse(ray.ray));
  });
  canvas.addEventListener('pointerleave', () => { pointerInside = false; });
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; state.cinematic = false; $('cine').checked = false; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (hitHorse(ray.ray)) { loco.toss(); audio.snort(); }
  });

  // cheap hit test against capsules along the skeleton
  const segs = [
    ['pelvis', 'chest', 0.33], ['chest', 'neck1', 0.25], ['neck1', 'head', 0.16], ['tail0', 'tail4', 0.09],
    ['humerusR', 'cannonFR', 0.09], ['cannonFR', 'hoofFR', 0.06], ['humerusL', 'cannonFL', 0.09], ['cannonFL', 'hoofFL', 0.06],
    ['femurR', 'cannonHR', 0.11], ['cannonHR', 'hoofHR', 0.06], ['femurL', 'cannonHL', 0.11], ['cannonHL', 'hoofHL', 0.06],
  ];
  const hA = new THREE.Vector3(), hB = new THREE.Vector3(), pR = new THREE.Vector3(), pS = new THREE.Vector3();
  const muzzle = new THREE.Vector3(0.45, -0.28, 0);
  function hitHorse(r) {
    for (const [a, b, rad] of segs) {
      horse.bone[a].getWorldPosition(hA);
      horse.bone[b].getWorldPosition(hB);
      if (r.distanceSqToSegment(hA, hB, pR, pS) < rad * rad) return true;
    }
    horse.bone.head.getWorldPosition(hA);
    hB.copy(muzzle).applyMatrix4(horse.bone.head.matrixWorld);
    return r.distanceSqToSegment(hA, hB, pR, pS) < 0.12 * 0.12;
  }

  // ------------------------------------------------------------ debug helpers
  window.__app = { THREE, renderer, scene, camera, controls, env, horse, loco, state, hair, look, applyLook, setGait };
  window.__filmstrip = (gait, n = 8, cols = 4, warm = 4, view = 'side') => {
    state.paused = true;
    loco.setGait(gait);
    const stepAll = (dt) => { loco.update(dt, {}); horse.bones[0].updateMatrixWorld(true); for (const h of hair) h.step(dt); };
    for (let i = 0; i < warm * 60; i++) stepAll(1 / 60);
    const f = loco.freq() || 1;
    const dtf = 1 / f / n;
    const W = renderer.domElement.width, H = renderer.domElement.height;
    const rows = Math.ceil(n / cols);
    const cw = Math.floor(W / cols), ch = Math.floor((cw * H) / W);
    const cv = document.createElement('canvas');
    cv.width = cols * cw; cv.height = rows * ch;
    const ctx = cv.getContext('2d');
    const body = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      for (let s = 0; s < 8; s++) stepAll(dtf / 8);
      horse.bone.body.getWorldPosition(body);
      const h = loco.heading;
      const right = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
      const fwd = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
      const tgt = body.clone().setY(0.95).addScaledVector(fwd, 0.15);
      if (view === 'side') camera.position.copy(tgt).addScaledVector(right, 5.2).setY(1.05);
      else if (view === 'front') camera.position.copy(tgt).addScaledVector(fwd, 5.5).setY(1.1);
      else if (view === 'back') camera.position.copy(tgt).addScaledVector(fwd, -5.5).setY(1.2);
      else camera.position.copy(tgt).addScaledVector(right, 3.6).addScaledVector(fwd, 3.2).setY(1.6);
      camera.lookAt(tgt);
      env.update(1 / 60, body.clone().setY(0), null);
      renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, (k % cols) * cw, Math.floor(k / cols) * ch, cw, ch);
      ctx.fillStyle = '#fff'; ctx.font = '22px sans-serif';
      ctx.fillText(gait + ' ' + (k / n).toFixed(2), (k % cols) * cw + 8, Math.floor(k / cols) * ch + 26);
    }
    let img = document.getElementById('filmstrip');
    if (!img) { img = document.createElement('img'); img.id = 'filmstrip'; img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#222;z-index:50'; document.body.appendChild(img); }
    img.src = cv.toDataURL('image/jpeg', 0.85);
    img.style.display = 'block';
    return 'ok';
  };
  window.__hideFilm = () => { const i = document.getElementById('filmstrip'); if (i) i.style.display = 'none'; state.paused = false; };

  loading.classList.add('done');
  setTimeout(() => loading.remove(), 800);

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  const focus = new THREE.Vector3();
  const prevFocus = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const hoofU = [0, 1, 2, 3].map(() => new THREE.Vector4());
  const tmp = new THREE.Vector3();
  const cineTgt = new THREE.Vector3();
  const cineWant = new THREE.Vector3();
  let first = true;
  let fpsAcc = 0, fpsN = 0, fps = 60, cineAng = 0, statT = 0;
  function frame() {
    requestAnimationFrame(frame);
    const rawDt = Math.min(clock.getDelta(), 1 / 20);
    fpsAcc += rawDt; fpsN++;
    if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    const dt = state.paused ? 0 : rawDt * state.timeScale;
    let turn = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1;
    // where the horse looks: the cursor, otherwise the camera
    if (!loco.behaviour || loco.behaviour.name !== 'look') {
      camLook.copy(pointerInside ? pointerTarget : camera.position);
      if (!pointerInside) camLook.y = Math.min(camLook.y, 2.2);
      loco.lookTarget.lerp(camLook, 1 - Math.exp(-4 * rawDt));
    }
    if (dt > 0) {
      loco.update(dt, { turn });
      horse.updateFace(dt, { sleepy: loco.behaviour?.name === 'rest' ? 1 : loco.behaviour?.name === 'graze' ? 0.4 : 0 });
      horse.bones[0].updateMatrixWorld(true);
      const sub = dt > 1 / 70 ? 2 : 1;
      for (let i = 0; i < sub; i++) for (const h of hair) h.step(dt / sub);
      // footfalls
      for (const ev of loco.events) {
        if (ev.type !== 'land') continue;
        tmp.copy(ev.pos).project(camera);
        audio.hoof(0.35 + Math.min(1, ev.speed / 8), tmp.x * 0.8, camera.position.distanceTo(ev.pos));
      }
    }
    horse.bone.body.getWorldPosition(focus);
    if (first) { prevFocus.copy(focus); first = false; }
    if (state.follow) {
      const d = tmp.subVectors(focus, prevFocus);
      d.y = 0;
      camera.position.add(d);
      controls.target.add(d);
    }
    prevFocus.copy(focus);
    if (state.cinematic) {
      cineAng += rawDt * 0.12;
      const r = 6.2 + 1.5 * Math.sin(cineAng * 0.7);
      cineTgt.copy(focus).setY(1.05);
      controls.target.lerp(cineTgt, 1 - Math.exp(-2 * rawDt));
      cineWant.set(Math.cos(cineAng) * r, 1.0 + 0.6 * Math.sin(cineAng * 0.5), Math.sin(cineAng) * r).add(cineTgt);
      camera.position.lerp(cineWant, 1 - Math.exp(-1.5 * rawDt));
    }
    loco.legs.forEach((l, i) => hoofU[i].set(l.toe.x, l.toe.y, l.toe.z, l.state === 'planted' ? 1 : 0));
    env.update(dt, tmp.copy(focus).setY(0), hoofU);
    controls.update();
    renderer.render(scene, camera);
    statT += rawDt;
    if (statT > 0.25) {
      statT = 0;
      $('speed').textContent = `${loco.speed.toFixed(1)} m/s · ${loco.gaitName}`;
      const info = renderer.info.render;
      $('stats').textContent = `${fps.toFixed(0)} fps · ${(info.triangles / 1e6).toFixed(2)}M tris · body ${horse.build.stats.verts.toLocaleString()} verts · built in ${(buildMs / 1000).toFixed(1)} s`;
    }
  }
  frame();
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    renderer.setSize(innerWidth, innerHeight);
    frameView();
    updatePixel();
  });
}

setTimeout(() => {
  (params.get('debug') === 'sculpt' ? startDebug() : startApp()).catch((e) => {
    console.error(e);
    loadingText.textContent = 'Error: ' + e.message;
  });
}, 30);
