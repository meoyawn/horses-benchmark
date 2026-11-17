import * as THREE from 'three';
import { createHorse } from './horse.js';

// An original studio reflection field. Broad luminous panels give the coat and
// eyes something to reflect without an HDR photograph or a cubemap asset.
function makeEnvironment(renderer) {
  const width = 192, height = 96, data = new Float32Array(width * height * 4);
  const panels = [
    [new THREE.Vector3(-.56,.58,.60).normalize(), 13, [3.8,3.4,2.9]],
    [new THREE.Vector3(.45,.29,-.84).normalize(), 24, [4.5,4.0,3.4]],
    [new THREE.Vector3(.16,.82,.55).normalize(), 38, [1.9,2.0,2.1]],
  ];
  const dir = new THREE.Vector3();
  for (let y=0; y<height; y++) {
    const latitude = ((y+.5)/height-.5)*Math.PI;
    for (let x=0; x<width; x++) {
      const longitude = ((x+.5)/width-.5)*2*Math.PI;
      dir.set(Math.cos(latitude)*Math.cos(longitude), Math.sin(latitude), Math.cos(latitude)*Math.sin(longitude));
      const sky = THREE.MathUtils.smoothstep(dir.y,-.39,.69);
      const shade = [.19+.26*sky,.17+.29*sky,.142+.34*sky];
      for (const [direction,sharpness,color] of panels) {
        const strength = Math.exp((dir.dot(direction)-1)*sharpness);
        for (let c=0;c<3;c++) shade[c] += strength*color[c];
      }
      const i = 4*(y*width+x);
      data.set([...shade,1],i);
    }
  }
  const source = new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  const result = generator.fromEquirectangular(source);
  source.dispose(); generator.dispose();
  return result;
}

function contactTexture() {
  const size=96, data=new Uint8Array(size*size*4);
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const dx=(x+.5)/size*2-1, dy=(y+.5)/size*2-1;
    const r2=dx*dx+dy*dy;
    const i=4*(y*size+x);
    data[i]=data[i+1]=data[i+2]=255;
    data[i+3]=Math.round(255 * Math.max(0,Math.exp(-3.7*r2) - Math.exp(-3.7)));
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.magFilter=tex.minFilter=THREE.LinearFilter;
  tex.needsUpdate=true;
  return tex;
}

const startYaw=-.295, startPitch=.105;

export function openStudio(canvas, onCameraInput, onFootfall) {
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setClearColor(0,0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.98;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.needsUpdate=true;
  const scene=new THREE.Scene();
  const environment=makeEnvironment(renderer);
  scene.environment=environment.texture;
  scene.environmentIntensity=.59;
  const key=new THREE.DirectionalLight(0xffedda,2.18);
  key.position.set(-2.5,6,2.4);
  key.target.position.set(-.05,.7,0);
  key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-2.25,right:2.25,top:2.25,bottom:-2.25,near:1,far:13});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias=-.00021; key.shadow.normalBias=.006; key.shadow.radius=13; key.shadow.blurSamples=12;
  const rim=new THREE.DirectionalLight(0xffe5c6,1.87);
  rim.position.set(2.1,3.4,-3.6);
  const fill=new THREE.HemisphereLight(0xecf2ff,0xbc9a81,.69);
  scene.add(key,key.target,rim,fill);
  const horse=createHorse();
  scene.add(horse.group);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:0x423e2d,opacity:.135}));
  floor.rotation.x=-Math.PI/2; floor.position.y=.009; floor.receiveShadow=true;
  floor.material.depthWrite=false; floor.renderOrder=-2;
  scene.add(floor);
  const texture=contactTexture(), plane=new THREE.PlaneGeometry(1,1);
  function contact(x,z,width,depth,opacity) {
    const material=new THREE.MeshBasicMaterial({map:texture,color:0x413826,transparent:true,opacity,depthWrite:false,toneMapped:false});
    const mesh=new THREE.Mesh(plane,material);
    mesh.rotation.x=-Math.PI/2; mesh.position.set(x,.011,z); mesh.scale.set(width,depth,1);
    mesh.renderOrder=-1; scene.add(mesh);
    return mesh;
  }
  contact(.03,0,2.73,1.14,.25);
  contact(.12,-.13,2.13,.73,.12);
  const hoofShadows=horse.hoofBones.map(()=>contact(0,0,.25,.19,.43));
  const hoofPosition=new THREE.Vector3();
  const camera=new THREE.PerspectiveCamera(29,1,.05,80);
  const center=new THREE.Vector3(-.255,1.075,0), target=center.clone(), desiredTarget=center.clone();
  const horizontal=new THREE.Vector3(), vertical=new THREE.Vector3(), raycaster=new THREE.Raycaster();
  let yaw=startYaw,pitch=startPitch,zoom=1, desiredYaw=yaw,desiredPitch=pitch,desiredZoom=zoom;
  let distance=5.2, auto=false, mode='idle', rate=1, playing=true, time=0;
  let previous=performance.now(), dirty=true;
  let lastFootfall=-1;
  function resize() {
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    const visibleHeight=Math.max(2.64,3.38/camera.aspect);
    distance=visibleHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    camera.updateProjectionMatrix();
    dirty=true;
  }
  const observer=new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  const pointers=new Map();
  let pinchSpan=0, midpoint=new THREE.Vector2();
  function span() {
    const [a,b]=[...pointers.values()];
    return Math.hypot(a.x-b.x,a.y-b.y);
  }
  function manual() {
    if (auto) { auto=false; onCameraInput?.(); }
  }
  function orbit(dx,dy) {
    manual(); desiredYaw-=dx; desiredPitch=THREE.MathUtils.clamp(desiredPitch+dy,.042,1.04);
  }
  function magnify(factor) {
    desiredZoom=THREE.MathUtils.clamp(desiredZoom*factor,.64,3.5);
  }
  function pan(dx,dy) {
    manual();
    const amount=2*distance/zoom*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/canvas.clientHeight;
    camera.updateMatrixWorld();
    horizontal.setFromMatrixColumn(camera.matrixWorld,0);
    vertical.setFromMatrixColumn(camera.matrixWorld,1);
    desiredTarget.addScaledVector(horizontal,-dx*amount).addScaledVector(vertical,dy*amount);
    desiredTarget.x=THREE.MathUtils.clamp(desiredTarget.x,-1.68,1.12);
    desiredTarget.y=THREE.MathUtils.clamp(desiredTarget.y,0,2.16);
    desiredTarget.z=THREE.MathUtils.clamp(desiredTarget.z,-.60,.60);
  }
  function pinchCenter() {
    const [a,b]=[...pointers.values()];
    return new THREE.Vector2((a.x+b.x)/2,(a.y+b.y)/2);
  }
  canvas.addEventListener('pointerdown',e=>{
    if (e.pointerType==='mouse' && e.button!==0 && e.button!==2) return;
    manual(); canvas.focus({preventScroll:true});
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,pan:e.button===2 || e.shiftKey});
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size===2) { pinchSpan=span();midpoint=pinchCenter(); }
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove',e=>{
    const p=pointers.get(e.pointerId); if(!p) return;
    const dx=e.clientX-p.x, dy=e.clientY-p.y;
    p.x=e.clientX;p.y=e.clientY;
    if (pointers.size===1) {
      if(p.pan || e.shiftKey) pan(dx,dy); else orbit(dx*.0080,dy*.0060);
    }
    if (pointers.size===2) {
      const next=span(); if(pinchSpan>1) magnify(next/pinchSpan);
      pinchSpan=next;
      const mid=pinchCenter(); pan(mid.x-midpoint.x,mid.y-midpoint.y);midpoint=mid;
    }
  });
  function release(e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) canvas.classList.remove('dragging');
  }
  canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('contextmenu', e=>e.preventDefault());
  canvas.addEventListener('dblclick',e=>{
    const bounds=canvas.getBoundingClientRect();
    const pointer=new THREE.Vector2((e.clientX-bounds.left)/bounds.width*2-1,1-(e.clientY-bounds.top)/bounds.height*2);
    raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObject(horse.group.getObjectByName('Continuous coat'),false)[0];
    if(hit) {manual(); desiredTarget.copy(hit.point);desiredZoom=Math.max(desiredZoom,2.25);}
  });
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const unit=e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1;
    magnify(Math.exp(-THREE.MathUtils.clamp(e.deltaY*unit,-250,250)*.0018));
  },{passive:false});
  canvas.addEventListener('keydown',e=>{
    const step={'ArrowLeft':[-.18,0],'ArrowRight':[.18,0],'ArrowUp':[0,.09],'ArrowDown':[0,-.09]}[e.key];
    if(step){e.preventDefault();orbit(...step);}
  });
  function render(now) {
    const dt=Math.min(.07,Math.max(0,(now-previous)/1000)); previous=now;
    if(document.hidden) return;
    if(auto && pointers.size===0) desiredYaw+=dt*.17;
    if(!playing && !dirty && Math.abs(yaw-desiredYaw)+Math.abs(pitch-desiredPitch)+Math.abs(zoom-desiredZoom)<.00008
      && target.distanceToSquared(desiredTarget)<1e-8) return;
    dirty=false;
    const blend=1-Math.exp(-12*dt);
    yaw+=(desiredYaw-yaw)*blend; pitch+=(desiredPitch-pitch)*blend; zoom+=(desiredZoom-zoom)*blend;
    target.lerp(desiredTarget,blend);
    const d=distance/zoom;
    camera.position.set(target.x+d*Math.cos(pitch)*Math.sin(yaw),target.y+d*Math.sin(pitch),target.z+d*Math.cos(pitch)*Math.cos(yaw));
    camera.lookAt(target);
    if(playing) {
      const dTime=dt*rate; time+=dTime; horse.update(time,dTime,mode);
      renderer.shadowMap.needsUpdate=true;
    }
    horse.group.updateMatrixWorld();
    let footfall=0;
    horse.hoofBones.forEach((bone,index)=>{
      bone.getWorldPosition(hoofPosition);
      const lift=Math.max(0,hoofPosition.y-.086), shadow=hoofShadows[index];
      if(lift<.026) footfall |= 1 << index;
      shadow.position.set(hoofPosition.x-.008,.0115,hoofPosition.z);
      shadow.material.opacity=.45*Math.exp(-lift*13);
      shadow.scale.set(.25+lift*.5,.19+lift*.4,1);
    });
    if(footfall!==lastFootfall) { onFootfall?.(footfall); lastFootfall=footfall; }
    renderer.render(scene,camera);
  }
  horse.update(0,0,'idle');
  render(previous);
  renderer.setAnimationLoop(render);
  function resetCamera() {
    desiredYaw=yaw + Math.atan2(Math.sin(startYaw-yaw),Math.cos(startYaw-yaw));
    desiredPitch=startPitch; desiredZoom=1;
    desiredTarget.copy(center);
  }
  return {
    setCoat:v=>{horse.setCoat(v);dirty=true;}, setMotion:v=>{mode=v;}, setSpeed:v=>{rate=v;},
    setPlaying:v=>{playing=v;dirty=true;}, setAuto:v=>{auto=v;}, magnify, resetCamera,
  };
}
