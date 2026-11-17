import * as THREE from 'three';
import { anatomy } from './anatomy.js';
import { ease, surfaceGeometry } from './sculpt.js';
import { createLimbs } from './limbs.js';
import { createFace } from './face.js';
import { createGroom } from './groom.js';
import { createCoat } from './coat.js';

export function createHorse() {
  const group = new THREE.Group();
  group.name = 'Thoroughbred';
  const body = new THREE.Bone(), neck = new THREE.Bone(), head = new THREE.Bone();
  body.name = 'Trunk'; neck.name = 'Base of neck'; head.name = 'Poll';
  neck.position.set(-.52,1.36,0);
  head.position.set(-.62,.48,0);
  group.add(body); body.add(neck); neck.add(head);
  const bones = [body,neck,head], limbs = createLimbs(body,bones);
  const {distance,skin} = anatomy(limbs);
  const geometry = surfaceGeometry(distance, skin, [-1.74,.031,-.382], [1.01,2.075,.382], .0105);
  const verts=geometry.attributes.position, normals=geometry.attributes.normal;
  const breathing=new Float32Array(verts.count*3);
  for (let i=0;i<verts.count;i++) {
    const x=verts.getX(i), y=verts.getY(i);
    const ribs=ease(-.49,-.15,x)*(1-ease(.19,.50,x))*ease(.77,.92,y)*(1-ease(1.29,1.54,y));
    breathing[3*i+1]=ribs*Math.min(0,normals.getY(i))*.006;
    breathing[3*i+2]=ribs*normals.getZ(i)*.013;
  }
  geometry.morphTargetsRelative=true;
  geometry.morphAttributes.position=[new THREE.BufferAttribute(breathing,3)];
  const coat = createCoat();
  const hide = new THREE.SkinnedMesh(geometry,coat.material);
  hide.name = 'Continuous coat';
  hide.castShadow = hide.receiveShadow = true;
  hide.frustumCulled = false;
  group.add(hide);
  group.updateMatrixWorld(true);
  hide.bind(new THREE.Skeleton(bones));
  const face = createFace(head);
  const hair = createGroom({body,neck,head,distance});
  function poseTrunk(time,phase,walk,trot) {
    const cycle = phase * 2*Math.PI;
    const breath = Math.sin(time*1.46);
    hide.morphTargetInfluences[0]=.5+.5*breath;
    body.position.y = breath*.0013 + .007*walk*Math.sin(2*cycle) - .019*trot*Math.cos(2*cycle);
    body.rotation.z = .0014*breath + .009*walk*Math.sin(cycle+.4) + .006*trot*Math.sin(2*cycle+.25);
    neck.rotation.z = -.044 - .009*breath + .007*Math.sin(time*.52) + .048*walk*Math.sin(2*cycle-.6) + .031*trot*Math.cos(2*cycle);
    neck.rotation.y = .042 + .017*Math.sin(time*.48) + .007*walk*Math.sin(cycle);
    head.rotation.z = .025 + .009*Math.sin(time*.88+.5) - .052*walk*Math.sin(2*cycle-.79) - .032*trot*Math.cos(2*cycle-.31);
    head.rotation.y = .168 - .104*(walk+trot) + .034*Math.sin(time*.44+.7) + .011*Math.sin(time*1.1);
  }
  function update(time, dt, mode) {
    limbs.update(time,dt,mode,1,poseTrunk);
    face.update(time);
    hair.update(time,mode);
  }
  function setCoat(id) {
    coat.setCoat(id); hair.setCoat(id); face.setCoat(id);
  }
  return {group,update,setCoat,hoofBones:limbs.hoofBones};
}
