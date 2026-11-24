import * as THREE from 'three';

/**
 * Coat color & marking presets based on real equine genetics.
 */
export const COAT_PRESETS = {
  bay: {
    name: 'Blood Bay',
    coatBase: new THREE.Color(0x6e2610),
    coatHighlight: new THREE.Color(0x943818),
    coatUnderbelly: new THREE.Color(0x4f1a0a),
    pointsColor: new THREE.Color(0x0f0d0c), // Black points on lower legs & ear tips
    pointsStrength: 0.95,
    dappleStrength: 0.07, // Sleek groomed mahogany satin coat!
    maneColor: new THREE.Color(0x0c0a09),
    maneTipColor: new THREE.Color(0x181310),
    blazeStrength: 0.85, // Forehead star + narrow stripe
    sockFL: 0.0,
    sockFR: 0.18, // Low white pastern coronet
    sockHL: 0.34, // Classic white hind socks
    sockHR: 0.31,
    hoofDark: 0.85,
    sheenColor: new THREE.Color(0xd88855),
    eelStripe: 0.15,
  },
  dappleGrey: {
    name: 'Dapple Grey',
    coatBase: new THREE.Color(0x8d9298),
    coatHighlight: new THREE.Color(0xcfd4da),
    coatUnderbelly: new THREE.Color(0x6e737a),
    pointsColor: new THREE.Color(0x3a3e44),
    pointsStrength: 0.55,
    dappleStrength: 0.78, // Signature Andalusian/Warmblood silver dapples!
    maneColor: new THREE.Color(0xd8dce0),
    maneTipColor: new THREE.Color(0xf2f4f7),
    blazeStrength: 0.45,
    sockFL: 0.22,
    sockFR: 0.22,
    sockHL: 0.28,
    sockHR: 0.28,
    hoofDark: 0.65,
    sheenColor: new THREE.Color(0xffffff),
    eelStripe: 0.10,
  },
  friesianBlack: {
    name: 'Friesian Black',
    coatBase: new THREE.Color(0x121316),
    coatHighlight: new THREE.Color(0x242830),
    coatUnderbelly: new THREE.Color(0x0d0e10),
    pointsColor: new THREE.Color(0x090a0c),
    pointsStrength: 1.0,
    dappleStrength: 0.14,
    maneColor: new THREE.Color(0x0d0e11),
    maneTipColor: new THREE.Color(0x1c1b1a),
    blazeStrength: 0.0, // Pure solid black
    sockFL: 0.0,
    sockFR: 0.0,
    sockHL: 0.0,
    sockHR: 0.0,
    hoofDark: 1.0,
    sheenColor: new THREE.Color(0x7c90b0), // Cool blue-raven silk sheen
    eelStripe: 0.0,
  },
  chestnut: {
    name: 'Fiery Chestnut',
    coatBase: new THREE.Color(0x8c3b16),
    coatHighlight: new THREE.Color(0xc25b24),
    coatUnderbelly: new THREE.Color(0x743012),
    pointsColor: new THREE.Color(0x782e10),
    pointsStrength: 0.25,
    dappleStrength: 0.26,
    maneColor: new THREE.Color(0xa84f20),
    maneTipColor: new THREE.Color(0xd98a4e), // Flaxen-copper tips
    blazeStrength: 1.0, // Bold white blaze
    sockFL: 0.36,
    sockFR: 0.25,
    sockHL: 0.42,
    sockHR: 0.40,
    hoofDark: 0.25,
    sheenColor: new THREE.Color(0xffb478),
    eelStripe: 0.12,
  },
  palomino: {
    name: 'Golden Palomino',
    coatBase: new THREE.Color(0xb8843e),
    coatHighlight: new THREE.Color(0xdca95c),
    coatUnderbelly: new THREE.Color(0x9e6e30),
    pointsColor: new THREE.Color(0x8c622b),
    pointsStrength: 0.20,
    dappleStrength: 0.35,
    maneColor: new THREE.Color(0xebe3cf),
    maneTipColor: new THREE.Color(0xfaf6eb),
    blazeStrength: 0.90,
    sockFL: 0.26,
    sockFR: 0.26,
    sockHL: 0.35,
    sockHR: 0.35,
    hoofDark: 0.30,
    sheenColor: new THREE.Color(0xffe7a8),
    eelStripe: 0.08,
  },
  buckskin: {
    name: 'Wild Buckskin',
    coatBase: new THREE.Color(0xa87c42),
    coatHighlight: new THREE.Color(0xc99c5e),
    coatUnderbelly: new THREE.Color(0x825d2e),
    pointsColor: new THREE.Color(0x14110f),
    pointsStrength: 0.95,
    dappleStrength: 0.30,
    maneColor: new THREE.Color(0x13100e),
    maneTipColor: new THREE.Color(0x261e18),
    blazeStrength: 0.35,
    sockFL: 0.0,
    sockFR: 0.0,
    sockHL: 0.19,
    sockHR: 0.0,
    hoofDark: 0.92,
    sheenColor: new THREE.Color(0xf2cf94),
    eelStripe: 0.85, // Strong primitive dorsal eel stripe!
  },
};

/**
 * Shared GLSL 3D procedural simplex/value noise & cellular dapple functions.
 */
const GLSL_NOISE = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i + vec3(0,0,0));
    float n100 = hash31(i + vec3(1,0,0));
    float n010 = hash31(i + vec3(0,1,0));
    float n110 = hash31(i + vec3(1,1,0));
    float n001 = hash31(i + vec3(0,0,1));
    float n101 = hash31(i + vec3(1,0,1));
    float n011 = hash31(i + vec3(0,1,1));
    float n111 = hash31(i + vec3(1,1,1));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);

    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);

    return mix(nxy0, nxy1, f.z);
  }

  float fbm3D(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3D(p);
      p = p * 2.03 + vec3(13.1, 7.7, 5.3);
      a *= 0.5;
    }
    return v;
  }

  // Organic Voronoi ring pattern for realistic equine coat dapples
  float dapplePattern(vec3 p) {
    vec3 g = floor(p);
    vec3 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int z = -1; z <= 1; z++) {
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec3 o = vec3(float(x), float(y), float(z));
          vec3 cell = g + o;
          vec3 r = o - f + vec3(
            hash31(cell),
            hash31(cell + 31.7),
            hash31(cell + 73.1)
          ) * 0.85;
          float d = dot(r, r);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
    }
    float centerLight = 1.0 - smoothstep(0.04, 0.38, d1);
    float ringDark = 1.0 - smoothstep(0.0, 0.18, d2 - d1);
    return clamp(centerLight * 0.65 - ringDark * 0.35, -0.5, 0.7);
  }
`;

/**
 * Creates all custom PBR shader materials for the horse and returns an updater for live coat switching.
 */
export function createHorseMaterials(initialPresetKey = 'bay') {
  const preset = COAT_PRESETS[initialPresetKey] || COAT_PRESETS.bay;

  // Shared reactive uniforms updated live when switching coats
  const coatUniforms = {
    uCoatBase: { value: preset.coatBase.clone() },
    uCoatHighlight: { value: preset.coatHighlight.clone() },
    uCoatUnderbelly: { value: preset.coatUnderbelly.clone() },
    uPointsColor: { value: preset.pointsColor.clone() },
    uPointsStrength: { value: preset.pointsStrength },
    uDappleStrength: { value: preset.dappleStrength },
    uBlazeStrength: { value: preset.blazeStrength },
    uSockFL: { value: preset.sockFL },
    uSockFR: { value: preset.sockFR },
    uSockHL: { value: preset.sockHL },
    uSockHR: { value: preset.sockHR },
    uSheenColor: { value: preset.sheenColor.clone() },
    uEelStripe: { value: preset.eelStripe },
    uHoofDark: { value: preset.hoofDark },
    uManeColor: { value: preset.maneColor.clone() },
    uManeTipColor: { value: preset.maneTipColor.clone() },
    uTime: { value: 0.0 },
    uWindStrength: { value: 0.35 },
  };

  // =========================================================================
  // 1. BODY COAT MATERIAL (Velvety short fur grain, dapples, points, blaze, socks, dark velvety muzzle)
  // =========================================================================
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.52,
    metalness: 0.0,
    sheen: 0.75,
    sheenRoughness: 0.38,
    sheenColor: preset.sheenColor.clone(),
    clearcoat: 0.14, // Healthy groomed coat gloss!
    clearcoatRoughness: 0.42,
  });

  bodyMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, coatUniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute vec3 aRestPos;
        varying vec3 vRestPos;
        varying vec3 vWorldNormalCustom;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vRestPos = aRestPos;
        `
      )
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vWorldNormalCustom = normalize(mat3(modelMatrix) * objectNormal);
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vRestPos;
        varying vec3 vWorldNormalCustom;

        uniform vec3 uCoatBase;
        uniform vec3 uCoatHighlight;
        uniform vec3 uCoatUnderbelly;
        uniform vec3 uPointsColor;
        uniform float uPointsStrength;
        uniform float uDappleStrength;
        uniform float uBlazeStrength;
        uniform float uSockFL;
        uniform float uSockFR;
        uniform float uSockHL;
        uniform float uSockHR;
        uniform float uEelStripe;
        ${GLSL_NOISE}
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          vec3 rp = vRestPos;

          // Directional short-hair coat grain stretched along equine hair flow (down & back)
          vec3 flowCoord = vec3(rp.x * 115.0, rp.y * 78.0 + rp.z * 38.0, rp.z * 48.0);
          float furGrain = fbm3D(flowCoord);
          float fineHair = noise3D(flowCoord * 2.8);

          // Base coat color blended smoothly between warm topline and deeper underbelly/flank
          float topline = smoothstep(0.88, 1.56, rp.y);
          vec3 coat = mix(uCoatUnderbelly, uCoatBase, topline);
          coat = mix(coat, uCoatHighlight, smoothstep(0.38, 0.82, furGrain) * 0.16);

          // Organic dapple rings concentrated on barrel, shoulders & hindquarters (fading off head & upper neck)
          float dappleZone = smoothstep(0.82, 1.08, rp.y)
                           * (1.0 - smoothstep(0.42, 0.72, rp.z))
                           * (1.0 - smoothstep(1.56, 1.72, rp.y));
          float dap = dapplePattern(rp * 13.5 + vec3(0.0, fbm3D(rp * 4.0) * 0.6, 0.0));
          coat = mix(coat, uCoatHighlight * 1.14, clamp(dap, 0.0, 1.0) * uDappleStrength * dappleZone);
          coat = mix(coat, uCoatUnderbelly * 0.76, clamp(-dap, 0.0, 1.0) * uDappleStrength * dappleZone);

          // Dorsal eel stripe along spine crest
          float spineMask = (1.0 - smoothstep(0.008, 0.038, abs(rp.x)))
                          * smoothstep(1.36, 1.44, rp.y)
                          * smoothstep(-0.88, -0.72, rp.z)
                          * (1.0 - smoothstep(0.38, 0.52, rp.z));
          coat = mix(coat, uPointsColor, spineMask * uEelStripe);

          // Dark points on lower legs (up past knees/hocks)
          float legPointMask = (1.0 - smoothstep(0.46, 0.72, rp.y)) * uPointsStrength;
          coat = mix(coat, uPointsColor, legPointMask);

          // Crisp White Leg Socks / Stockings with irregular hair-edge border
          float borderNoise = (fbm3D(rp * 28.0) - 0.5) * 0.045;
          float sockH = 0.0;
          if (rp.z > 0.0) {
            sockH = (rp.x >= 0.0) ? uSockFL : uSockFR;
          } else {
            sockH = (rp.x >= 0.0) ? uSockHL : uSockHR;
          }
          if (sockH > 0.01) {
            float sockMask = 1.0 - smoothstep(sockH - 0.018, sockH + 0.018, rp.y + borderNoise);
            vec3 whiteHair = vec3(0.91, 0.89, 0.86) * (0.90 + 0.14 * furGrain);
            coat = mix(coat, whiteHair, sockMask);
          }

          // White Facial Star / Blaze along forehead & nasal bridge
          if (uBlazeStrength > 0.05 && rp.z > 0.94 && rp.y > 1.50) {
            // Forehead star centered around (0, 1.83, 1.03) + optional narrow stripe down nasal bridge
            float starDist = length(vec2(rp.x * 1.15, (rp.y - 1.825) * 0.95));
            float starMask = 1.0 - smoothstep(0.022, 0.042, starDist + borderNoise * 0.35);
            float stripeWidth = mix(0.0, 0.022, smoothstep(0.55, 1.0, uBlazeStrength));
            float bridgeMask = (1.0 - smoothstep(stripeWidth * 0.6, stripeWidth + 0.008, abs(rp.x + borderNoise * 0.2)))
                             * smoothstep(1.53, 1.60, rp.y) * (1.0 - smoothstep(1.83, 1.89, rp.y))
                             * smoothstep(1.01, 1.05, rp.z);
            float blaze = max(starMask * clamp(uBlazeStrength * 1.3, 0.0, 1.0), bridgeMask);
            // Only on front-facing dorsal plane of face
            blaze *= smoothstep(0.98, 1.03, rp.z + (1.85 - rp.y) * 0.32);
            coat = mix(coat, vec3(0.93, 0.91, 0.89), clamp(blaze, 0.0, 1.0));
          }

          // Velvety dark charcoal-taupe skin on muzzle, lips & around nostrils + inside nostril warmth!
          float muzzleDist = length(rp - vec3(0.0, 1.48, 1.25));
          float muzzleSkin = 1.0 - smoothstep(0.055, 0.145, muzzleDist);
          vec3 velvetSkin = vec3(0.11, 0.095, 0.092) * (0.88 + 0.22 * noise3D(rp * 140.0));
          // Subtle warm pink-crimson deep inside nostril cavities
          float nostrilDepth = (1.0 - smoothstep(0.012, 0.028, length(vec2(abs(rp.x) - 0.048, rp.y - 1.502))))
                             * smoothstep(1.225, 1.245, rp.z);
          velvetSkin = mix(velvetSkin, vec3(0.24, 0.085, 0.075), nostrilDepth * 0.65);
          coat = mix(coat, velvetSkin, muzzleSkin * 0.92);

          // Soft dark skin around eyelids
          float eyeRimDist = length(vec3(abs(rp.x) - 0.090, rp.y - 1.825, rp.z - 1.025));
          float eyeRim = 1.0 - smoothstep(0.024, 0.046, eyeRimDist);
          coat = mix(coat, vec3(0.08, 0.07, 0.07), eyeRim * 0.82);

          // Micro-fur strand modulation
          coat *= (0.93 + 0.14 * fineHair);

          diffuseColor.rgb *= coat;
        }
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        {
          vec3 rp = vRestPos;
          float muzzleMask = 1.0 - smoothstep(0.055, 0.14, length(rp - vec3(0.0, 1.48, 1.25)));
          float furVar = noise3D(vec3(rp.x * 95.0, rp.y * 65.0 + rp.z * 30.0, rp.z * 40.0));
          // Sleeker satin sheen on muscular shoulders/croup/neck; softer velvet on muzzle
          roughnessFactor = mix(0.44 + 0.14 * furVar, 0.68, muzzleMask);
        }
        `
      );
  };

  // =========================================================================
  // 2. EAR MATERIAL (Coat outer shell + dark tips + soft inner ear skin/fluff)
  // =========================================================================
  const earMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.56,
    sheen: 0.7,
    sheenRoughness: 0.45,
    sheenColor: preset.sheenColor.clone(),
    side: THREE.DoubleSide,
  });

  earMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, coatUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec2 aEarUV;\nvarying vec2 vEarUV;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvEarUV = aEarUV;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec2 vEarUV;\nuniform vec3 uCoatBase;\nuniform vec3 uPointsColor;\nuniform float uPointsStrength;`
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          // vEarUV.x = 0 (outer coat) .. 1 (inner cup), vEarUV.y = 0 (base) .. 1 (tip)
          vec3 outerCol = mix(uCoatBase, uPointsColor, smoothstep(0.45, 0.92, vEarUV.y) * max(uPointsStrength, 0.45));
          vec3 innerCol = mix(vec3(0.22, 0.16, 0.15), vec3(0.48, 0.38, 0.35), 1.0 - vEarUV.y * 0.5);
          diffuseColor.rgb *= mix(outerCol, innerCol, smoothstep(0.4, 0.65, vEarUV.x));
        }
        `
      );
  };

  // =========================================================================
  // 3. KERATIN HOOF MATERIAL (Realistic growth rings, periople gloss, dark vs pale striped horn)
  // =========================================================================
  const hoofMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0.0,
    clearcoat: 0.48,
    clearcoatRoughness: 0.26,
  });

  hoofMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, coatUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute vec3 aHoofParam;\nvarying vec3 vHoofParam;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvHoofParam = aHoofParam;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vHoofParam;
        uniform float uHoofDark;
        uniform float uSockFL;
        uniform float uSockFR;
        uniform float uSockHL;
        uniform float uSockHR;
        ${GLSL_NOISE}
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          // vHoofParam: x = angle around hoof [-pi, pi], y = vertical [0=sole, 1=coronet], z = limbId (0=FL,1=FR,2=HL,3=HR)
          float limbId = vHoofParam.z;
          float sock = (limbId < 0.5) ? uSockFL : (limbId < 1.5) ? uSockFR : (limbId < 2.5) ? uSockHL : uSockHR;
          // Real equine genetics: white markings at coronet produce pale/amber striped keratin horn!
          float isPaleHorn = smoothstep(0.05, 0.22, sock);
          float darkFactor = mix(uHoofDark, 0.18, isPaleHorn);

          float tubules = noise3D(vec3(vHoofParam.x * 26.0, vHoofParam.y * 3.0, limbId * 5.0));
          float growthRings = sin(vHoofParam.y * 42.0 + tubules * 1.5) * 0.5 + 0.5;

          vec3 darkHorn = vec3(0.085, 0.078, 0.072) * (0.82 + 0.32 * tubules);
          vec3 paleHorn = mix(vec3(0.58, 0.50, 0.37), vec3(0.32, 0.27, 0.20), tubules * 0.55);

          vec3 col = mix(paleHorn, darkHorn, darkFactor);
          col *= (0.93 + 0.10 * growthRings);
          // Subtle dust/earth wear near ground sole & darker coronet periople rim
          col = mix(col * 0.82, col, smoothstep(0.0, 0.22, vHoofParam.y));
          col = mix(col, col * 0.72, smoothstep(0.86, 1.0, vHoofParam.y));
          diffuseColor.rgb *= col;
        }
        `
      );
  };

  // =========================================================================
  // 4. ANISOTROPIC HORSEHAIR MATERIAL (Mane, Forelock, Tail & Fetlock Tufts)
  // =========================================================================
  const hairMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.46,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  hairMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, coatUniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute vec3 aHairParam; // x = across ribbon [-1..1], y = root->tip [0..1], z = strandSeed
        varying vec3 vHairParam;
        varying vec3 vHairTangent;
        uniform float uTime;
        uniform float uWindStrength;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vHairParam = aHairParam;
        // Subtle per-lock high-frequency wind flutter increasing quadratically toward hair tips
        float tipFlex = aHairParam.y * aHairParam.y;
        float wave = sin(uTime * 4.2 + aHairParam.z * 19.7 + aHairParam.y * 5.0)
                   + 0.45 * cos(uTime * 7.8 + aHairParam.z * 31.3);
        transformed.x += wave * 0.016 * tipFlex * uWindStrength;
        transformed.z -= abs(wave) * 0.010 * tipFlex * uWindStrength;
        vHairTangent = normalize(objectNormal.yzx + vec3(0.0, -1.0, 0.0));
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vHairParam;
        varying vec3 vHairTangent;
        uniform vec3 uManeColor;
        uniform vec3 uManeTipColor;
        ${GLSL_NOISE}
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          float u = vHairParam.x; // -1..1 across lock
          float v = vHairParam.y; // 0..1 root to tip
          float seed = vHairParam.z;

          // Multi-fiber strand striation along ribbon
          float strand = sin(u * 28.0 + seed * 40.0) * 0.5 + 0.5;
          float fineStrand = noise3D(vec3(u * 35.0, v * 8.0, seed * 17.0));

          // Feathered tip & edge cutout (discard splayed outer fibers near tip for crisp wispy silhouette!)
          float edgeDist = abs(u);
          float tipTaper = 1.0 - v * 0.65;
          float wisp = fineStrand * 0.38 + strand * 0.22;
          if (v > 0.72 && edgeDist > tipTaper + (wisp - 0.30) * 0.55) {
            discard;
          }

          // Root occlusion + root-to-tip melanin sun-bleaching gradient + strand variation
          vec3 hairCol = mix(uManeColor, uManeTipColor, smoothstep(0.35, 0.98, v));
          float rootAO = mix(0.55, 1.0, smoothstep(0.0, 0.22, v));
          hairCol *= rootAO * (0.82 + 0.34 * fineStrand + 0.14 * strand);

          diffuseColor.rgb *= hairCol;
        }
        `
      )
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `
        #include <lights_fragment_end>
        {
          // Kajiya-Kay inspired anisotropic silk hair sheen ribbon (preserves rich dark raven/bay tones!)
          vec3 viewDir = normalize(vViewPosition);
          vec3 T = normalize(vec3(0.15, -0.92, -0.35) + normal * 0.25);
          float TdotV = dot(T, viewDir);
          float sinTV = sqrt(max(0.0, 1.0 - TdotV * TdotV));
          float anisoBand = pow(sinTV, 24.0) * (0.30 + 0.70 * vHairParam.y);
          reflectedLight.indirectSpecular += (uManeTipColor * 1.6 + vec3(0.022)) * anisoBand * 0.35;
        }
        `
      );
  };

  // =========================================================================
  // 5. EQUINE EYE MATERIAL (Horizontal rectangular pupil + corpora nigra + wet glossy cornea!)
  // =========================================================================
  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.04, // Wet tear film!
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    ior: 1.40,
    reflectivity: 0.95,
  });

  eyeMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vEyeLocal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvEyeLocal = position;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vEyeLocal;
        ${GLSL_NOISE}
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          // Local sphere oriented so +Z faces directly out of the orbital socket:
          // Real calm horses show dark espresso-amber iris across almost the entire exposed globe (zero startled white ring!)
          vec3 n = normalize(vEyeLocal);
          float r = length(n.xy);
          float irisRadius = 0.88;

          // Pigmented dark conjunctiva/limbal margin at extreme edge
          vec3 sclera = vec3(0.16, 0.12, 0.10) * smoothstep(0.05, 0.55, n.z);

          // Soulful deep mahogany-amber equine iris with subtle radial stroma fibers
          float angle = atan(n.y, n.x);
          float radial = noise3D(vec3(cos(angle) * 16.0, sin(angle) * 16.0, r * 6.0));
          vec3 irisInner = vec3(0.19, 0.088, 0.028);
          vec3 irisOuter = vec3(0.055, 0.025, 0.010);
          vec3 iris = mix(irisInner, irisOuter, smoothstep(0.28, irisRadius, r));
          iris *= (0.82 + 0.38 * radial);
          iris *= (1.0 - 0.60 * smoothstep(irisRadius - 0.12, irisRadius, r));

          // Large, distinct horizontal oblong equine pupil + upper corpora nigra
          vec2 pCoord = vec2(n.x / 0.46, (n.y + 0.02) / 0.21);
          float pupilDist = length(max(abs(pCoord) - vec2(0.45, 0.22), 0.0));
          float pupilMask = 1.0 - smoothstep(0.18, 0.34, pupilDist);
          // Corpora nigra bumpy fringe along top border of pupil
          float cnBump = noise3D(vec3(n.x * 45.0, n.y * 45.0, 2.0));
          float cnMask = 1.0 - smoothstep(0.05, 0.12, length(vec2(n.x * 0.65, n.y - 0.08)) - cnBump * 0.025);
          pupilMask = max(pupilMask, cnMask * 0.95);

          vec3 eyeCol = mix(sclera, iris, 1.0 - smoothstep(irisRadius - 0.04, irisRadius + 0.04, r));
          eyeCol = mix(eyeCol, vec3(0.008, 0.008, 0.012), pupilMask);

          diffuseColor.rgb = eyeCol;
        }
        `
      );
  };

  function applyPreset(presetKey) {
    const p = COAT_PRESETS[presetKey];
    if (!p) return;
    coatUniforms.uCoatBase.value.copy(p.coatBase);
    coatUniforms.uCoatHighlight.value.copy(p.coatHighlight);
    coatUniforms.uCoatUnderbelly.value.copy(p.coatUnderbelly);
    coatUniforms.uPointsColor.value.copy(p.pointsColor);
    coatUniforms.uPointsStrength.value = p.pointsStrength;
    coatUniforms.uDappleStrength.value = p.dappleStrength;
    coatUniforms.uBlazeStrength.value = p.blazeStrength;
    coatUniforms.uSockFL.value = p.sockFL;
    coatUniforms.uSockFR.value = p.sockFR;
    coatUniforms.uSockHL.value = p.sockHL;
    coatUniforms.uSockHR.value = p.sockHR;
    coatUniforms.uSheenColor.value.copy(p.sheenColor);
    coatUniforms.uEelStripe.value = p.eelStripe;
    coatUniforms.uHoofDark.value = p.hoofDark;
    coatUniforms.uManeColor.value.copy(p.maneColor);
    coatUniforms.uManeTipColor.value.copy(p.maneTipColor);

    bodyMaterial.sheenColor.copy(p.sheenColor);
    earMaterial.sheenColor.copy(p.sheenColor);
  }

  return {
    bodyMaterial,
    earMaterial,
    hoofMaterial,
    hairMaterial,
    eyeMaterial,
    uniforms: coatUniforms,
    applyPreset,
  };
}
