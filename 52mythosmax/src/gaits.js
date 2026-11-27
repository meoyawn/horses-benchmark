// Gait table. Leg order everywhere: left hind, left fore, right hind, right fore.
export const GAIT_NAMES = ['Standing', 'Walk', 'Trot', 'Canter', 'Gallop'];

// speed   m/s                          duty    share of the stride a hoof is on the ground
// stance  distance the body travels over a planted hoof (m)
// off     when each hoof lands, as a fraction of the stride (right lead for canter and gallop)
// liftF/H hoof lift in swing (m)       knee    knee fold in swing (rad)
// flex    hoof and fetlock curl in swing (rad)      sink  fetlock sink under load (rad)
// bob     body bounce (m): + rises over the supporting leg, - sinks into it
// nod2/1  head nod twice / once per stride (rad)    neck  neck carriage (rad, - is lower)
// narrow  how much nearer the midline the hooves land (m)
// tail    tail carriage (rad)          tuck    flexing of the back (rad)      pin   ears laid back (0..1)
// drop    how much lower the body is carried (m)
const GAITS = [
  { speed: 0, duty: 0.64, stance: 0, off: [0, 0.25, 0.5, 0.75], liftF: 0.07, liftH: 0.055, knee: 0.6, flex: 0.45, sink: 0.05, bob: 0, nod2: 0, nod1: 0, neck: 0, narrow: 0, tail: 0, tuck: 0, pin: 0, drop: 0 },
  { speed: 1.5, duty: 0.62, stance: 1.08, off: [0, 0.25, 0.5, 0.75], liftF: 0.09, liftH: 0.07, knee: 0.8, flex: 0.6, sink: 0.1, bob: 0.02, nod2: 0.07, nod1: 0, neck: -0.14, narrow: 0.03, tail: 0.05, tuck: 0, pin: 0, drop: 0 },
  { speed: 3.5, duty: 0.42, stance: 1.06, off: [0, 0.5, 0.5, 0], liftF: 0.16, liftH: 0.13, knee: 1.25, flex: 0.95, sink: 0.24, bob: -0.05, nod2: 0.012, nod1: 0, neck: 0.03, narrow: 0.05, tail: 0.2, tuck: 0, pin: 0.1, drop: 0.022 },
  { speed: 6.3, duty: 0.31, stance: 1.11, off: [0, 0.3, 0.3, 0.6], liftF: 0.2, liftH: 0.17, knee: 1.4, flex: 1.05, sink: 0.3, bob: -0.085, nod2: 0, nod1: 0.1, neck: -0.06, narrow: 0.05, tail: 0.33, tuck: 0.12, pin: 0.25, drop: 0.04 },
  { speed: 11.5, duty: 0.22, stance: 1.11, off: [0, 0.42, 0.12, 0.56], liftF: 0.3, liftH: 0.25, knee: 1.65, flex: 1.25, sink: 0.4, bob: -0.075, nod2: 0, nod1: 0.085, neck: -0.3, narrow: 0.06, tail: 0.5, tuck: 0.2, pin: 0.6, drop: 0.05 },
];
const KEYS = Object.keys(GAITS[0]).filter((k) => k !== 'off');

/**
 * Blends neighbouring gaits. g: 0 = standing ... 4 = gallop, fractions are in
 * between. lead: +1 right, -1 left (mirrors the footfall pattern).
 */
export function mixGait(g, lead, out) {
  const i = Math.min(GAITS.length - 2, Math.floor(g)), t = g - i, a = GAITS[i], b = GAITS[i + 1];
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  for (let n = 0; n < 4; n++) {
    const m = lead > 0 ? n : (n + 2) % 4;
    const d = b.off[m] - a.off[m];
    out.off[n] = a.off[m] + (d - Math.round(d)) * t; // the short way round the cycle
  }
  // Stride time follows from "distance covered while a hoof is down".
  out.period = out.speed > 1e-3 ? out.stance / (out.speed * out.duty) : GAITS[1].stance / (GAITS[1].speed * out.duty);
  return out;
}
