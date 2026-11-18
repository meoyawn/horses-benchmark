// Synthesised sound: every hoofbeat is built on the fly from a pitched thump
// and a burst of filtered noise, over a quiet bed of wind in the grass. Nothing
// is sampled or loaded.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let enabled = false;

  function start() {
    if (ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0;
    const squash = ctx.createDynamicsCompressor();
    squash.threshold.value = -16;
    squash.ratio.value = 5;
    master.connect(squash).connect(ctx.destination);

    // two seconds of white noise, reused by everything
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }

    // wind: slowly breathing band of noise
    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const windBand = ctx.createBiquadFilter();
    windBand.type = 'bandpass';
    windBand.frequency.value = 420;
    windBand.Q.value = 0.35;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.045;
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.11;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.025;
    swell.connect(swellDepth).connect(windGain.gain);
    wind.connect(windBand).connect(windGain).connect(master);
    wind.start();
    swell.start();
  }

  return {
    get enabled() { return enabled; },
    /** Must be called from a user gesture the first time. */
    setEnabled(on) {
      enabled = on;
      if (on) {
        start();
        if (ctx && ctx.state === 'suspended') ctx.resume();
      }
      if (master) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.08);
    },
    /** One hoof meeting turf. `speed` in m/s shapes loudness and weight. */
    hoofbeat(speed, fore) {
      if (!enabled || !ctx) return;
      const t = ctx.currentTime;
      const power = Math.min(1, 0.28 + speed / 11);
      const detune = 0.9 + Math.random() * 0.22;

      // the thud: a quick downward sweep
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f0 = (fore ? 118 : 96) * detune;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + 0.09);
      const thud = ctx.createGain();
      thud.gain.setValueAtTime(0.0001, t);
      thud.gain.exponentialRampToValueAtTime(0.5 * power, t + 0.006);
      thud.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(thud).connect(master);
      osc.start(t);
      osc.stop(t + 0.2);

      // the turf: a short, dull crunch
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700 + 900 * power * detune;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 140;
      const crunch = ctx.createGain();
      crunch.gain.setValueAtTime(0.0001, t);
      crunch.gain.exponentialRampToValueAtTime(0.22 * power, t + 0.004);
      crunch.gain.exponentialRampToValueAtTime(0.0001, t + 0.07 + 0.05 * power);
      src.connect(hp).connect(lp).connect(crunch).connect(master);
      src.start(t, Math.random() * 1.5, 0.2);
    },
    /** A soft blow through the nostrils. */
    snort() {
      if (!enabled || !ctx) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(900, t);
      band.frequency.exponentialRampToValueAtTime(420, t + 0.5);
      band.Q.value = 0.9;
      const flutter = ctx.createOscillator();
      flutter.frequency.value = 26;
      const flutterDepth = ctx.createGain();
      flutterDepth.gain.value = 0.09;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      flutter.connect(flutterDepth).connect(g.gain);
      src.connect(band).connect(g).connect(master);
      src.start(t, Math.random(), 0.7);
      flutter.start(t);
      flutter.stop(t + 0.7);
    },
  };
}
