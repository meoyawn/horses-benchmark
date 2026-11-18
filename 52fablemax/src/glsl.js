// Shared GLSL helpers (written for this project): integer lattice hashing,
// value noise and fractal sums. Requires GLSL ES 3.00 (WebGL2).

export const NOISE_GLSL = /* glsl */ `
uint hfMix(uint x) {
  x ^= x >> 16; x *= 0x9E3779B1u;
  x ^= x >> 13; x *= 0xC4CEB9FDu;
  x ^= x >> 16;
  return x;
}
float hfUnit(uint h) { return float(h >> 8) * (1.0 / 16777216.0); }
uint hfCell(ivec3 c) {
  return hfMix(uint(c.x) * 0x8DA6B343u ^ hfMix(uint(c.y) * 0xD8163841u ^ hfMix(uint(c.z) * 0xCB1AB31Fu + 0x1B873593u)));
}
float hash31(ivec3 c) { return hfUnit(hfCell(c)); }
vec3 hash33(ivec3 c) {
  uint h = hfCell(c);
  return vec3(hfUnit(h), hfUnit(hfMix(h + 0x68E31DA4u)), hfUnit(hfMix(h + 0xB5297A4Du)));
}

// Trilinear value noise with quintic fade, range [0, 1].
float vnoise(vec3 p) {
  vec3 fl = floor(p);
  ivec3 i = ivec3(fl);
  vec3 f = p - fl;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = hash31(i);
  float n100 = hash31(i + ivec3(1, 0, 0));
  float n010 = hash31(i + ivec3(0, 1, 0));
  float n110 = hash31(i + ivec3(1, 1, 0));
  float n001 = hash31(i + ivec3(0, 0, 1));
  float n101 = hash31(i + ivec3(1, 0, 1));
  float n011 = hash31(i + ivec3(0, 1, 1));
  float n111 = hash31(i + ivec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z);
}
float vnoise(vec2 p) { return vnoise(vec3(p, 0.37)); }

// Fractal sum, range roughly [0, 1].
float fbm(vec3 p, int octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int o = 0; o < octaves; o++) {
    sum += amp * vnoise(p);
    norm += amp;
    p = p * 2.03 + vec3(17.3, 9.1, 4.7);
    amp *= 0.5;
  }
  return sum / norm;
}
float fbm(vec2 p, int octaves) { return fbm(vec3(p, 0.37), octaves); }
`;
