import * as THREE from 'three';
import { createHorseSkeleton } from './HorseAnatomy.js';
import { buildHorseBodyGeometry } from './HorseBodyBuilder.js';
import {
  buildHoovesGeometry,
  buildEarsGeometry,
  buildEyesAndLids,
  buildHorseHairGeometry,
} from './HorseDetails.js';
import { createHorseMaterials } from './HorseMaterials.js';
import { HorseAnimator } from './HorseAnimator.js';

/**
 * Top-level procedural 3D Horse entity combining skeleton, sculpted SDF musculature,
 * keratin hooves, cupped ears, wet multi-layer eyes, dynamic mane/tail, and gait animator.
 */
export class Horse {
  constructor(initialCoat = 'bay') {
    this.group = new THREE.Group();
    this.group.name = 'ProceduralHorse';

    // 1. Create 48-bone anatomical skeleton
    const { skeleton, bones, boneMap, boneIndexMap, joints } = createHorseSkeleton();
    this.skeleton = skeleton;
    this.bones = bones;
    this.boneMap = boneMap;
    this.joints = joints;

    // Add root bone to group
    this.group.add(bones[0]);

    // 2. Create custom PBR & anisotropic shaders
    this.materials = createHorseMaterials(initialCoat);
    this.currentCoat = initialCoat;

    // 3. Build seamless sculpted equine body SkinnedMesh
    const bodyGeo = buildHorseBodyGeometry(boneIndexMap, joints);
    this.bodyMesh = new THREE.SkinnedMesh(bodyGeo, this.materials.bodyMaterial);
    this.bodyMesh.name = 'HorseBody';
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.bodyMesh.frustumCulled = false;
    this.bodyMesh.bind(skeleton);
    this.group.add(this.bodyMesh);

    // 4. Build crisp keratin Hooves SkinnedMesh
    const hoovesGeo = buildHoovesGeometry(boneIndexMap, joints);
    this.hoovesMesh = new THREE.SkinnedMesh(hoovesGeo, this.materials.hoofMaterial);
    this.hoovesMesh.name = 'HorseHooves';
    this.hoovesMesh.castShadow = true;
    this.hoovesMesh.receiveShadow = true;
    this.hoovesMesh.frustumCulled = false;
    this.hoovesMesh.bind(skeleton);
    this.group.add(this.hoovesMesh);

    // 5. Build cupped mobile Ears SkinnedMesh
    const earsGeo = buildEarsGeometry(boneIndexMap, joints);
    this.earsMesh = new THREE.SkinnedMesh(earsGeo, this.materials.earMaterial);
    this.earsMesh.name = 'HorseEars';
    this.earsMesh.castShadow = true;
    this.earsMesh.receiveShadow = true;
    this.earsMesh.frustumCulled = false;
    this.earsMesh.bind(skeleton);
    this.group.add(this.earsMesh);

    // 6. Build multi-layer Eyes & blinking Eyelids
    buildEyesAndLids(
      boneMap,
      boneIndexMap,
      joints,
      this.materials.eyeMaterial,
      this.materials.bodyMaterial
    );

    // 7. Build flowing Mane, Forelock, Tail & Fetlock Tufts SkinnedMesh
    const hairGeo = buildHorseHairGeometry(boneIndexMap, joints);
    this.hairMesh = new THREE.SkinnedMesh(hairGeo, this.materials.hairMaterial);
    this.hairMesh.name = 'HorseHair';
    this.hairMesh.castShadow = true;
    this.hairMesh.receiveShadow = true;
    this.hairMesh.frustumCulled = false;
    this.hairMesh.bind(skeleton);
    this.group.add(this.hairMesh);

    // 8. Initialize Biomechanical Gait & Physics Animator
    this.animator = new HorseAnimator(
      this.group,
      boneMap,
      joints,
      this.materials.uniforms
    );
  }

  setCoat(presetKey) {
    this.currentCoat = presetKey;
    this.materials.applyPreset(presetKey);
  }

  setGait(gaitKey) {
    this.animator.setGait(gaitKey);
  }

  triggerAction(actionName) {
    this.animator.triggerAction(actionName);
  }

  resetPosition() {
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.animator.heading = 0;
  }

  update(dt) {
    this.animator.update(dt);
  }
}
