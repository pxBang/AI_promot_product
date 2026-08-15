// audio.js — procedural sound effects via Web Audio API (no external assets)

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.enabled = true;
    this._ambient = null;
  }

  // Must be called from a user gesture
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    // white-noise buffer (1s)
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  _noise(duration, gain, filterType, filterFreq, filterQ) {
    if (!this.ctx || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.value = filterFreq || 1000;
    if (filterQ) f.Q.value = filterQ;
    const g = this.ctx.createGain();
    const t = this.now();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + duration + 0.05);
  }

  _tone(type, freq, freqEnd, duration, gain, gainEnd) {
    if (!this.ctx || !this.enabled) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.now();
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(gainEnd || 0.0001, t + duration);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + duration + 0.02);
  }

  // ---- Weapon sounds ----
  shot(weaponId) {
    const t = this.now();
    switch (weaponId) {
      case 'shotgun':
        this._noise(0.35, 1.0, 'lowpass', 2400);
        this._noise(0.2, 0.7, 'highpass', 900);
        this._tone('sine', 160, 60, 0.22, 0.9);
        break;
      case 'sniper':
        this._noise(0.55, 1.0, 'lowpass', 1500);
        this._tone('sine', 220, 50, 0.4, 0.9);
        this._noise(0.5, 0.4, 'bandpass', 600, 0.8);
        break;
      case 'smg':
        this._noise(0.14, 0.55, 'lowpass', 3200);
        this._tone('square', 500, 180, 0.08, 0.2);
        break;
      case 'pistol':
        this._noise(0.22, 0.8, 'lowpass', 2600);
        this._tone('sine', 200, 70, 0.15, 0.7);
        break;
      case 'rocket':
        this._noise(0.8, 0.9, 'lowpass', 900);
        this._tone('sawtooth', 140, 40, 0.7, 0.5);
        break;
      case 'rifle':
      default:
        this._noise(0.18, 0.7, 'lowpass', 2800);
        this._tone('square', 420, 160, 0.09, 0.25);
        break;
    }
  }

  reload(weaponId) {
    const t = this.now();
    // two-part click
    this._noise(0.04, 0.4, 'highpass', 3000);
    setTimeout(() => this._noise(0.04, 0.4, 'highpass', 3000), 320);
    setTimeout(() => this._noise(0.06, 0.45, 'highpass', 2500), 650);
  }

  melee() {
    this._noise(0.08, 0.5, 'highpass', 2500);
    this._tone('sine', 500, 200, 0.07, 0.2);
  }

  empty() { this._noise(0.04, 0.4, 'highpass', 4000); }

  // ---- Movement ----
  footstep(surface) {
    const f = surface === 'metal' ? 1600 : 700;
    this._noise(0.08, 0.25, 'lowpass', f);
  }
  jump() { this._tone('sine', 300, 500, 0.12, 0.2); }
  land() { this._noise(0.12, 0.45, 'lowpass', 500); }

  // ---- Feedback ----
  hitmarker() { this._tone('square', 1200, 1200, 0.05, 0.25); }
  headshot() { this._tone('square', 1500, 1500, 0.06, 0.3); this._tone('square', 2200, 2200, 0.06, 0.2); }
  hurt() { this._tone('sine', 300, 150, 0.2, 0.4); this._noise(0.1, 0.2, 'lowpass', 1200); }
  death() { this._tone('sine', 300, 60, 0.6, 0.5); }
  kill() { this._tone('square', 600, 900, 0.12, 0.25); }

  explosion() {
    this._noise(1.2, 1.0, 'lowpass', 600);
    this._tone('sine', 120, 30, 1.0, 0.9);
    this._noise(0.6, 0.5, 'highpass', 2000);
  }

  pickup() { this._tone('sine', 600, 900, 0.12, 0.3); this._tone('sine', 900, 1200, 0.12, 0.2); }
  weaponPickup() { this._tone('square', 400, 800, 0.1, 0.25); this._tone('square', 800, 1600, 0.12, 0.2); }
  capture() { this._tone('sine', 500, 1000, 0.3, 0.3); }
  respawn() { this._tone('sine', 400, 800, 0.4, 0.3); }

  // ---- Ambient loop ----
  startAmbient(levelEnv) {
    if (!this.ctx || this._ambient) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = levelEnv === 'desert' ? 300 : 220;
    const g = this.ctx.createGain();
    g.gain.value = 0.04;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this._ambient = { src, g };
  }

  stopAmbient() {
    if (this._ambient) { try { this._ambient.src.stop(); } catch (e) {} this._ambient = null; }
  }
}

export const audio = new AudioManager();
