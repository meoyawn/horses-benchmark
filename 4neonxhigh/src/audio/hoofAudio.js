/**
 * hoofAudio.js — Lightweight 100% Procedural Web Audio API foley synthesizer
 * for realistic turf hoofbeats and friendly soft horse snorts (zero external audio files!).
 */

export class HoofAudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.noiseBuffer = null;
  }

  setEnabled(flag) {
    this.enabled = !!flag;
    if (this.enabled) {
      this._ensureContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }
  }

  _ensureContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();

    // Generate short white noise buffer for earth/turf thuds & breath snorts
    const sampleRate = this.ctx.sampleRate;
    const len = Math.floor(sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
  }

  playHoofBeat(leg, intensity = 0.6) {
    if (!this.enabled || !this.ctx || !this.noiseBuffer) return;
    if (this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const legPitchOffset = leg === 'FL' ? 1.05 : leg === 'FR' ? 0.98 : leg === 'HL' ? 0.90 : 0.94;
    const vol = Math.min(0.45, 0.12 + intensity * 0.30);

    // 1. Low earthy turf thump (short pitch-dropping sine)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(118 * legPitchOffset, now);
    osc.frequency.exponentialRampToValueAtTime(42 * legPitchOffset, now + 0.085);

    oscGain.gain.setValueAtTime(vol * 0.85, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
    osc.connect(oscGain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);

    // 2. Turf/grass impact crunch (bandpass filtered noise burst)
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((420 + intensity * 380) * legPitchOffset, now);
    filter.Q.setValueAtTime(1.4, now);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(vol * 0.65, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    noise.connect(filter).connect(nGain).connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.08);
  }

  playSnort() {
    if (!this.enabled || !this.ctx || !this.noiseBuffer) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Gentle fluttering equine nostril blow
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.36);
    filter.Q.setValueAtTime(2.6, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    // Subtle flutter LFO on amplitude
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 26;
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain).connect(gain.gain);

    noise.connect(filter).connect(gain).connect(this.ctx.destination);
    noise.start(now);
    lfo.start(now);
    noise.stop(now + 0.40);
    lfo.stop(now + 0.40);
  }
}
