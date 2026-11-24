import * as THREE from 'three';
import { SDFBuilder } from './SDFMesher.js';
import { skinBodyGeometry } from './HorseAnatomy.js';

/**
 * Builds the seamless, muscular equine body mesh from scratch using symmetric 3D SDF
 * anatomical primitives (muscles, bones, tendons, facial planes, nostrils) + Surface Nets
 * + Taubin smoothing, then binds it to the 48-bone skeleton.
 */
export function buildHorseBodyGeometry(boneIndexMap, joints) {
  const boundsMin = new THREE.Vector3(-0.36, 0.04, -1.02);
  const boundsMax = new THREE.Vector3(0.36, 2.06, 1.35);
  const sdf = new SDFBuilder(boundsMin, boundsMax, 0.012);

  // =========================================================================
  // 1. TORSO: Ribcage Barrel, Withers, Brisket, Loin & Croup
  // =========================================================================
  // Fore-chest & deep heartgirth
  sdf.addLimbSegment(0, 1.15, 0.45, 0, 1.16, 0.16, 0.195, 0.325, 0.255, 0.355, 0.085, false);
  // Mid-barrel (spring of ribs)
  sdf.addLimbSegment(0, 1.16, 0.16, 0, 1.21, -0.18, 0.262, 0.350, 0.248, 0.310, 0.090, false);
  // Loin & rear abdomen tuck
  sdf.addLimbSegment(0, 1.21, -0.18, 0, 1.30, -0.52, 0.242, 0.300, 0.210, 0.245, 0.085, false);

  // Withers ridge (thoracic spinous processes peaking around y = 1.60m)
  sdf.addLimbSegment(0, 1.48, 0.49, 0, 1.525, 0.35, 0.068, 0.075, 0.078, 0.082, 0.065, false);
  sdf.addLimbSegment(0, 1.525, 0.35, 0, 1.435, 0.08, 0.078, 0.082, 0.095, 0.065, 0.070, false);

  // Strong thoracolumbar topline bridge (prevents swayback)
  sdf.addLimbSegment(0, 1.41, 0.08, 0, 1.43, -0.38, 0.125, 0.075, 0.135, 0.085, 0.075, false);

  // Paired Pectorals (front chest muscles with natural sternal cleavage)
  sdf.addEllipsoid(0, 1.13, 0.52, 0.165, 0.21, 0.14, 0.085, false);
  sdf.addLimbSegment(0.086, 1.07, 0.57, 0.080, 0.90, 0.43, 0.088, 0.108, 0.080, 0.090, 0.055, true);

  // Paired Croup & Gluteal Haunches (apple-rounded hindquarters peaking ~1.58m)
  sdf.addLimbSegment(0.082, 1.45, -0.44, 0.092, 1.41, -0.73, 0.115, 0.132, 0.108, 0.128, 0.065, true);
  // Powerful buttock sweep (biceps femoris / semitendinosus)
  sdf.addLimbSegment(0.122, 1.32, -0.74, 0.132, 1.08, -0.78, 0.112, 0.138, 0.092, 0.115, 0.065, true);
  // Point of hip (Tuber coxae subtle prominence)
  sdf.addEllipsoid(0.215, 1.39, -0.37, 0.036, 0.052, 0.062, 0.050, true);

  // Tail dock root
  sdf.addLimbSegment(0, 1.45, -0.82, 0, 1.36, -0.96, 0.050, 0.052, 0.034, 0.035, 0.042, false);

  // =========================================================================
  // 2. NECK: Windpipe Column, Proud Arched Crest & Jugular Groove
  // =========================================================================
  // Lower/mid neck column (brachiocephalicus + trachea)
  sdf.addLimbSegment(0, 1.19, 0.50, 0, 1.50, 0.69, 0.150, 0.170, 0.112, 0.132, 0.080, false);
  sdf.addLimbSegment(0, 1.50, 0.69, 0, 1.77, 0.855, 0.112, 0.132, 0.078, 0.100, 0.062, false);

  // Upper neck crest (splenius arch from withers to poll)
  sdf.addLimbSegment(0, 1.53, 0.42, 0, 1.75, 0.63, 0.092, 0.118, 0.078, 0.108, 0.068, false);
  sdf.addLimbSegment(0, 1.75, 0.63, 0, 1.93, 0.865, 0.078, 0.108, 0.060, 0.082, 0.052, false);

  // =========================================================================
  // 3. HEAD: Cranium, Jowls, Brow, Facial Crest, Muzzle, Nostrils & Jaw
  // =========================================================================
  // Cranium & flat forehead
  sdf.addLimbSegment(0, 1.91, 0.915, 0, 1.77, 1.045, 0.078, 0.078, 0.082, 0.076, 0.038, false);
  // Ear root pedestals on poll
  sdf.addEllipsoid(0.058, 1.955, 0.905, 0.026, 0.030, 0.026, 0.022, true);

  // Masseter cheek plates (signature circular equine jowls)
  sdf.addEllipsoid(0.048, 1.725, 0.980, 0.052, 0.102, 0.098, 0.038, true);

  // Supraorbital brow arches
  sdf.addEllipsoid(0.078, 1.832, 1.022, 0.032, 0.034, 0.042, 0.024, true);

  // Facial crest (zygomatic ridge below eyes tapering forward)
  sdf.addLimbSegment(0.078, 1.772, 1.028, 0.054, 1.630, 1.132, 0.023, 0.025, 0.016, 0.018, 0.026, true);

  // Nasal bridge & upper muzzle
  sdf.addLimbSegment(0, 1.77, 1.045, 0, 1.565, 1.195, 0.070, 0.068, 0.050, 0.052, 0.032, false);
  // Squared velvety upper lip / muzzle pad
  sdf.addLimbSegment(0, 1.565, 1.195, 0, 1.470, 1.265, 0.052, 0.050, 0.054, 0.044, 0.028, false);

  // Mandible & rounded chin
  sdf.addLimbSegment(0, 1.69, 1.015, 0, 1.440, 1.240, 0.054, 0.050, 0.042, 0.034, 0.026, false);
  sdf.addEllipsoid(0, 1.425, 1.232, 0.038, 0.030, 0.034, 0.020, false);

  // Raised nostril wings (ala nasi)
  sdf.addEllipsoid(0.046, 1.506, 1.235, 0.021, 0.027, 0.027, 0.016, true, 0.30, 0.25, 0);

  // Carve orbital eye sockets so multi-layer eyeballs & eyelids sit flush
  sdf.subEllipsoid(0.094, 1.825, 1.025, 0.023, 0.026, 0.028, 0.010, true);

  // Carve comma-shaped nostril cavities
  sdf.subEllipsoid(0.049, 1.503, 1.246, 0.015, 0.021, 0.021, 0.008, true, 0.35, 0.35, 0);

  // Carve subtle mouth line cleft
  sdf.subLimbSegment(0, 1.445, 1.278, 0.048, 1.482, 1.202, 0.008, 0.007, 0.007, 0.006, 0.007, true);

  // =========================================================================
  // 4. FORELIMBS (Mirrored across X = 0)
  // =========================================================================
  // Scapula & shoulder muscles (smoothly blended into fore-chest)
  sdf.addLimbSegment(0.135, 1.46, 0.39, 0.175, 1.12, 0.59, 0.078, 0.125, 0.092, 0.115, 0.088, true);
  // Humerus & brachialis
  sdf.addLimbSegment(0.175, 1.12, 0.59, 0.160, 0.88, 0.45, 0.090, 0.112, 0.072, 0.092, 0.068, true);
  // Triceps mass & olecranon (point of elbow)
  sdf.addLimbSegment(0.155, 1.23, 0.44, 0.160, 0.90, 0.41, 0.074, 0.102, 0.052, 0.072, 0.058, true);

  // Forearm (Radius + extensor/flexor bellies tapering to dry knee)
  sdf.addLimbSegment(0.162, 0.88, 0.45, 0.150, 0.49, 0.46, 0.066, 0.086, 0.038, 0.044, 0.034, true);

  // Knee (Carpus) + Pisiform bone behind knee
  sdf.addEllipsoid(0.150, 0.48, 0.464, 0.041, 0.046, 0.044, 0.020, true);
  sdf.addEllipsoid(0.148, 0.49, 0.422, 0.020, 0.026, 0.022, 0.016, true);

  // Fore Cannon bone + deep digital flexor tendon groove profile
  sdf.addLimbSegment(0.150, 0.47, 0.468, 0.150, 0.21, 0.468, 0.029, 0.030, 0.028, 0.029, 0.016, true);
  sdf.addLimbSegment(0.150, 0.46, 0.436, 0.150, 0.21, 0.438, 0.018, 0.021, 0.019, 0.021, 0.015, true);

  // Fore Fetlock joint
  sdf.addEllipsoid(0.150, 0.205, 0.458, 0.037, 0.041, 0.043, 0.018, true);

  // Fore Pastern flaring slightly into coronet band at y = 0.082
  sdf.addLimbSegment(0.150, 0.205, 0.460, 0.150, 0.082, 0.538, 0.031, 0.033, 0.040, 0.042, 0.018, true);

  // =========================================================================
  // 5. HINDLIMBS (Mirrored across X = 0)
  // =========================================================================
  // Thigh (Femur / quadriceps / tensor fasciae latae)
  sdf.addLimbSegment(0.160, 1.32, -0.58, 0.186, 0.92, -0.42, 0.125, 0.165, 0.085, 0.115, 0.078, true);
  // Central biceps femoris belly bridging thigh, hamstring & gaskin seamlessly (zero gap!)
  sdf.addLimbSegment(0.162, 1.14, -0.57, 0.165, 0.78, -0.57, 0.092, 0.135, 0.068, 0.105, 0.072, true);
  // Hamstring mass bridging buttock to gaskin
  sdf.addLimbSegment(0.145, 1.18, -0.78, 0.162, 0.78, -0.64, 0.095, 0.128, 0.064, 0.088, 0.068, true);
  // Stifle fold (skin crease from rear abdomen to stifle)
  sdf.addLimbSegment(0.168, 1.06, -0.30, 0.186, 0.93, -0.41, 0.052, 0.072, 0.048, 0.058, 0.062, true);

  // Gaskin (Tibia + gastrocnemius) & Achilles tendon chord to Point of Hock
  sdf.addLimbSegment(0.192, 0.92, -0.42, 0.150, 0.53, -0.725, 0.076, 0.096, 0.038, 0.046, 0.036, true);
  sdf.addLimbSegment(0.164, 0.78, -0.62, 0.150, 0.555, -0.778, 0.023, 0.027, 0.023, 0.028, 0.020, true);

  // Hock joint + prominent Point of Hock (calcaneus)
  sdf.addEllipsoid(0.150, 0.52, -0.730, 0.040, 0.048, 0.046, 0.020, true);
  sdf.addEllipsoid(0.150, 0.555, -0.780, 0.025, 0.033, 0.030, 0.018, true);

  // Hind Cannon + flexor tendon
  sdf.addLimbSegment(0.150, 0.51, -0.718, 0.150, 0.21, -0.712, 0.030, 0.032, 0.029, 0.031, 0.016, true);
  sdf.addLimbSegment(0.150, 0.51, -0.750, 0.150, 0.21, -0.742, 0.019, 0.022, 0.019, 0.021, 0.015, true);

  // Hind Fetlock & Pastern
  sdf.addEllipsoid(0.150, 0.205, -0.722, 0.038, 0.042, 0.044, 0.018, true);
  sdf.addLimbSegment(0.150, 0.205, -0.720, 0.150, 0.082, -0.642, 0.031, 0.033, 0.040, 0.042, 0.018, true);

  // Extract manifold mesh with 3 passes of Taubin non-shrinking smoothing
  const geometry = sdf.extractGeometry(3);

  // Compute 4-bone skinning weights across all vertices
  skinBodyGeometry(geometry, boneIndexMap, joints);

  return geometry;
}
