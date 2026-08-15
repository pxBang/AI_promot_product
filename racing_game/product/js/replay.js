import * as THREE from './three.module.js';
import { clamp } from './utils.js';

// Replay recorder/player. Frames are flat Float32Arrays with a fixed stride
// per car: px,py,pz, qx,qy,qz,qw, spin0..spin3, steer  (12 floats).
const STRIDE = 12;

export class Replay {
  constructor() {
    this.frames = [];        // { t, data }
    this.carCount = 0;
    this.recordRate = 1 / 30;
    this.acc = 0;
    this.duration = 0;
    this.recording = false;
    this.maxFrames = 30000;
  }

  start(carCount) {
    this.frames = [];
    this.carCount = carCount;
    this.acc = 0;
    this.duration = 0;
    this.recording = true;
  }

  addFrame(t, vehicles) {
    if (!this.recording || this.frames.length >= this.maxFrames) return;
    this.acc += t;
    if (this.acc < this.recordRate) return;
    this.acc = 0;
    const data = new Float32Array(this.carCount * STRIDE);
    for (let i = 0; i < this.carCount && i < vehicles.length; i++) {
      const v = vehicles[i];
      const o = i * STRIDE;
      data[o] = v.pos.x; data[o + 1] = v.pos.y; data[o + 2] = v.pos.z;
      data[o + 3] = v.quat.x; data[o + 4] = v.quat.y; data[o + 5] = v.quat.z; data[o + 6] = v.quat.w;
      for (let w = 0; w < 4; w++) data[o + 7 + w] = v.wheels[w].spin;
      data[o + 11] = v.steerAngle;
    }
    this.duration += t;
    this.frames.push({ t: this.duration, data });
  }

  stop() { this.recording = false; }

  clear() { this.frames = []; this.duration = 0; this.recording = false; }

  get frameCount() { return this.frames.length; }

  // Sample (with linear interpolation) the state of all cars at time t.
  sample(t, out) {
    const n = this.frames.length;
    if (n === 0) return false;
    if (t <= this.frames[0].t) { this._copyFrame(0, out); return true; }
    if (t >= this.frames[n - 1].t) { this._copyFrame(n - 1, out); return true; }
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = this.frames[lo], b = this.frames[hi];
    const f = clamp((t - a.t) / Math.max(1e-5, b.t - a.t), 0, 1);
    const A = a.data, B = b.data;
    for (let i = 0; i < out.length; i++) {
      const o = i * STRIDE;
      out[i].pos.set(
        A[o] + (B[o] - A[o]) * f,
        A[o + 1] + (B[o + 1] - A[o + 1]) * f,
        A[o + 2] + (B[o + 2] - A[o + 2]) * f
      );
      out[i].quat.set(A[o + 3], A[o + 4], A[o + 5], A[o + 6]).slerp(
        new THREE.Quaternion(B[o + 3], B[o + 4], B[o + 5], B[o + 6]), f
      );
      for (let w = 0; w < 4; w++) out[i].spins[w] = A[o + 7 + w] + (B[o + 7 + w] - A[o + 7 + w]) * f;
      out[i].steer = A[o + 11] + (B[o + 11] - A[o + 11]) * f;
    }
    return true;
  }

  _copyFrame(idx, out) {
    const data = this.frames[idx].data;
    for (let i = 0; i < out.length; i++) {
      const o = i * STRIDE;
      out[i].pos.set(data[o], data[o + 1], data[o + 2]);
      out[i].quat.set(data[o + 3], data[o + 4], data[o + 5], data[o + 6]);
      for (let w = 0; w < 4; w++) out[i].spins[w] = data[o + 7 + w];
      out[i].steer = data[o + 11];
    }
  }

  // Pre-allocate playback buffers for `carCount` cars.
  makeBuffers(carCount) {
    return Array.from({ length: carCount }, () => ({
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      spins: [0, 0, 0, 0],
      steer: 0,
    }));
  }
}
