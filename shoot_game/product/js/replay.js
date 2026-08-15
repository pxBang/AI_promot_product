// replay.js — kill cam replay + match highlight recording

import * as THREE from 'three';

export class ReplayManager {
  constructor(camera) {
    this.camera = camera;
    this.active = false;
    this.timer = 0;
    this.duration = 0;
    this.samples = null;   // history slice from killer
    this.killerName = '';
    this.killerWeapon = '';
    this._savedCamera = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: 75 };
  }

  // record a continuous history of the player (for self-kill fallback / highlights)
  static makeRecorder() {
    return { history: [] };
  }
  static record(recorder, time, pos, yaw, pitch, firing) {
    recorder.history.push({ t: time, x: pos.x, z: pos.z, yaw, pitch, firing });
    if (recorder.history.length > 360) recorder.history.shift();
  }

  start(killer, killerWeapon) {
    const history = killer ? killer.history : null;
    this.killerName = killer ? killer.name : 'Unknown';
    this.killerWeapon = killerWeapon || '';
    if (history && history.length > 20) {
      // take the last ~2.5 seconds
      const lastT = history[history.length - 1].t;
      this.samples = history.filter((s) => lastT - s.t <= 2.5);
      this.duration = Math.min(2.5, (this.samples[this.samples.length - 1].t - this.samples[0].t));
    } else {
      this.samples = null;
      this.duration = 0;
    }
    this.active = true;
    this.timer = 0;
    this._savedCamera.pos.copy(this.camera.position);
    this._savedCamera.yaw = this.camera.rotation.y;
    this._savedCamera.pitch = this.camera.rotation.x;
    this._savedCamera.fov = this.camera.fov;
  }

  update(dt) {
    if (!this.active) return false;
    this.timer += dt;
    if (this.samples && this.samples.length >= 2 && this.timer <= this.duration) {
      const t = this.samples[0].t + this.timer;
      // find surrounding samples
      let i = 0;
      while (i < this.samples.length - 2 && this.samples[i + 1].t < t) i++;
      const a = this.samples[i];
      const b = this.samples[i + 1];
      const span = (b.t - a.t) || 1;
      const f = THREE.MathUtils.clamp((t - a.t) / span, 0, 1);
      const x = THREE.MathUtils.lerp(a.x, b.x, f);
      const z = THREE.MathUtils.lerp(a.z, b.z, f);
      const yaw = THREE.MathUtils.lerp(a.yaw, b.yaw, f);
      const pitch = THREE.MathUtils.lerp(a.pitch, b.pitch, f);
      this.camera.position.set(x, 1.55, z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = yaw;
      this.camera.rotation.x = pitch;
      this.camera.rotation.z = 0;
      this.camera.fov = 70;
      this.camera.updateProjectionMatrix();
    }
    if (this.timer >= this.duration + 0.5 || !this.samples) {
      this.stop();
      return false;
    }
    return true;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.camera.position.copy(this._savedCamera.pos);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this._savedCamera.yaw;
    this.camera.rotation.x = this._savedCamera.pitch;
    this.camera.rotation.z = 0;
    this.camera.fov = this._savedCamera.fov;
    this.camera.updateProjectionMatrix();
  }
}
