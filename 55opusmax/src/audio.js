// Tiny procedural sound: hoof falls on turf and a snort. Everything is synthesised (no samples).
export class HorseAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  enable(on) {
    this.enabled = on;
    if (on && !this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const len = this.ctx.sampleRate * 0.6;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6 + (Math.random() * 2 - 1) * 0.15; }
      this.noise = buf;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx) (on ? this.ctx.resume() : this.ctx.suspend()).catch(() => {});
  }

  hoof(intensity = 1, pan = 0, dist = 5) {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const att = Math.min(1, 6 / (dist + 1));
    const amp = Math.min(1, intensity) * att;
    if (amp < 0.02) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 160 + Math.random() * 120 + intensity * 60;
    bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    // low thump of the hoof hitting the ground
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95 + Math.random() * 20, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.7 * amp, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(bp).connect(g).connect(p);
    o.connect(og).connect(p);
    p.connect(this.master);
    src.start(t, Math.random() * 0.3, 0.2);
    o.start(t); o.stop(t + 0.16);
  }

  snort() {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const hp = c.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(900, t);
    hp.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    hp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.linearRampToValueAtTime(0.35, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    // flutter of the nostrils
    const lfo = c.createOscillator();
    lfo.frequency.value = 32;
    const lg = c.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg).connect(g.gain);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t, 0, 0.6);
    lfo.start(t); lfo.stop(t + 0.6);
  }
}
