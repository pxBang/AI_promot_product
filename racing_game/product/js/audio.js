import { clamp } from './utils.js';

// Lightweight Web Audio engine: synthesized engine + skid + SFX.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._engineGain = null;
    this._skidGain = null;
    this._skidFilter = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();

      // Engine: two detuned oscillators through a lowpass.
      const master = this.ctx.createGain();
      master.gain.value = 0.0;
      master.connect(this.ctx.destination);

      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 900;
      filt.Q.value = 1.2;
      filt.connect(master);

      this._engineGain = this.ctx.createGain();
      this._engineGain.gain.value = 0.0;
      this._engineGain.connect(filt);

      this._osc1 = this.ctx.createOscillator();
      this._osc1.type = 'sawtooth';
      this._osc2 = this.ctx.createOscillator();
      this._osc2.type = 'square';
      this._osc2.detune.value = 8;
      this._osc1.connect(this._engineGain);
      this._osc2.connect(this._engineGain);
      this._osc1.start();
      this._osc2.start();

      // Skid noise.
      const noiseBuf = this._makeNoise(1.0);
      this._skidSrc = this.ctx.createBufferSource();
      this._skidSrc.buffer = noiseBuf;
      this._skidSrc.loop = true;
      this._skidFilter = this.ctx.createBiquadFilter();
      this._skidFilter.type = 'bandpass';
      this._skidFilter.frequency.value = 700;
      this._skidFilter.Q.value = 0.7;
      this._skidGain = this.ctx.createGain();
      this._skidGain.gain.value = 0.0;
      this._skidSrc.connect(this._skidFilter).connect(this._skidGain).connect(this.ctx.destination);
      this._skidSrc.start();

      this._master = master;
    } catch (e) { this.ctx = null; }
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  setEngine(rpm, throttle, active) {
    if (!this.ctx || !this._osc1) return;
    const target = active ? 0.16 : 0.0;
    const freq = 40 + (rpm / 8200) * 340;
    this._osc1.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.03);
    this._osc2.frequency.setTargetAtTime(freq * 0.5, this.ctx.currentTime, 0.03);
    this._engineGain.gain.setTargetAtTime(target * (0.4 + throttle * 0.6), this.ctx.currentTime, 0.05);
    this._master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  setSkid(amount) {
    if (!this.ctx || !this._skidGain) return;
    this._skidGain.gain.setTargetAtTime(clamp(amount, 0, 1) * 0.25, this.ctx.currentTime, 0.05);
  }

  beep(freq = 440, dur = 0.15, vol = 0.2) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = freq;
    o.type = 'square';
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  thud() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.2);
    g.gain.setValueAtTime(0.4, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + 0.3);
  }

  whoosh() {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._makeNoise(0.4);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, this.ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(2400, this.ctx.currentTime + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start();
  }

  setMuted(m) { this.muted = m; }
}
