import * as THREE from './three.module.js';
import { clamp, lerp, rand } from './utils.js';

// Smooth colour interpolation between keyframes of the day.
const DAY_STOPS = [
  { t: 0.00, color: new THREE.Color(0x04060d), sun: 0x8899bb, light: 0.06 }, // midnight
  { t: 0.22, color: new THREE.Color(0x0a1220), sun: 0x667799, light: 0.12 }, // pre-dawn
  { t: 0.30, color: new THREE.Color(0xff8a4a), sun: 0xffc27a, light: 0.55 }, // sunrise
  { t: 0.45, color: new THREE.Color(0x8fd3ff), sun: 0xffffff, light: 1.0 },  // midday
  { t: 0.62, color: new THREE.Color(0x7fc4ff), sun: 0xfff2d0, light: 0.85 }, // afternoon
  { t: 0.72, color: new THREE.Color(0xff6a3d), sun: 0xff9a5c, light: 0.5 },  // sunset
  { t: 0.82, color: new THREE.Color(0x141a30), sun: 0x8899cc, light: 0.18 }, // dusk
  { t: 1.00, color: new THREE.Color(0x04060d), sun: 0x8899bb, light: 0.06 }, // midnight
];

const WEATHERS = {
  clear: { grip: 1.0, label: '☀ Clear', fog: 0.0006, rain: 0, snow: 0, lightMul: 1.0 },
  rain:  { grip: 0.82, label: '🌧 Rain', fog: 0.0035, rain: 1, snow: 0, lightMul: 0.6 },
  snow:  { grip: 0.68, label: '❄ Snow', fog: 0.004, rain: 0, snow: 1, lightMul: 0.7 },
  fog:   { grip: 0.95, label: '🌫 Fog', fog: 0.012, rain: 0, snow: 0, lightMul: 0.7 },
};

class WeatherField {
  constructor(scene, type) {
    this.type = type; // 'rain' | 'snow'
    this.count = type === 'rain' ? 900 : 600;
    const size = 300, height = 90;
    this.size = size; this.height = height;
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count);
    const isSnow = type === 'snow';
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = rand(-size / 2, size / 2);
      this.pos[i * 3 + 1] = rand(0, height);
      this.pos[i * 3 + 2] = rand(-size / 2, size / 2);
      this.vel[i] = isSnow ? rand(3, 7) : rand(28, 44);
    }
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    const mat = new THREE.PointsMaterial({
      color: isSnow ? 0xffffff : 0xaac8ff,
      size: isSnow ? 0.7 : 0.22,
      transparent: true,
      opacity: isSnow ? 0.85 : 0.5,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  update(dt, cx, cz) {
    const half = this.size / 2;
    const dx = rand(-2, 2) * dt; // small wind
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3 + 1] -= this.vel[i] * dt;
      this.pos[i * 3] += dx;
      if (this.pos[i * 3 + 1] < 0) {
        this.pos[i * 3 + 1] = this.height;
        this.pos[i * 3] = cx + rand(-half, half);
        this.pos[i * 3 + 2] = cz + rand(-half, half);
      }
    }
    this.attr.needsUpdate = true;
    // Keep field centered on camera.
    this.points.position.x = cx;
    this.points.position.z = cz;
  }

  setVisible(v) { this.points.visible = v; }
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.timeMode = 'day';
    this.weatherMode = 'clear';
    this.timeOfDay = 0.5;      // 0..1
    this.cycleSpeed = 1 / 180; // full day in ~3 minutes
    this.dynTimer = 0;
    this.fog = new THREE.Fog(0x8fd3ff, 120, 900);
    scene.fog = this.fog;
    scene.background = new THREE.Color(0x8fd3ff);

    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3f2a, 0.9);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140;
    sc.near = 1; sc.far = 500;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sun.target.position.set(0, 0, 0);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.rain = new WeatherField(scene, 'rain');
    this.snow = new WeatherField(scene, 'snow');

    this.sunDir = new THREE.Vector3(0.3, 0.8, -0.5).normalize();
  }

  setTime(mode) {
    this.timeMode = mode;
    if (mode === 'day') this.timeOfDay = 0.45;
    else if (mode === 'dusk') this.timeOfDay = 0.72;
    else if (mode === 'night') this.timeOfDay = 0.0;
    else this.timeOfDay = 0.45;
  }

  setWeather(mode) {
    this.weatherMode = mode;
  }

  get gripMultiplier() {
    const w = this._weather();
    if (this.timeMode === 'night' || this.timeOfDay < 0.26 || this.timeOfDay > 0.82) {
      return w.grip * 0.97; // slightly less grip at night
    }
    return w.grip;
  }

  get lightLevel() {
    return this._sample(this.timeOfDay).light * (this._weather().lightMul);
  }

  _weather() {
    if (this.weatherMode === 'dynamic') {
      return WEATHERS[['clear', 'rain', 'fog', 'clear'][Math.floor(this.dynTimer / 20) % 4]];
    }
    return WEATHERS[this.weatherMode] || WEATHERS.clear;
  }

  _sample(t) {
    let a = DAY_STOPS[0], b = DAY_STOPS[DAY_STOPS.length - 1];
    for (let i = 0; i < DAY_STOPS.length - 1; i++) {
      if (t >= DAY_STOPS[i].t && t <= DAY_STOPS[i + 1].t) { a = DAY_STOPS[i]; b = DAY_STOPS[i + 1]; break; }
    }
    const span = Math.max(1e-5, b.t - a.t);
    const f = clamp((t - a.t) / span, 0, 1);
    return {
      color: a.color.clone().lerp(b.color, f),
      sun: a.sun, light: lerp(a.light, b.light, f),
    };
  }

  setFocus(x, z) {
    this.sun.target.position.set(x, 0, z);
  }

  update(dt, camPos) {
    if (this.timeMode === 'cycle') {
      this.timeOfDay = (this.timeOfDay + this.cycleSpeed * dt) % 1;
    }
    if (this.weatherMode === 'dynamic') this.dynTimer += dt;

    const s = this._sample(this.timeOfDay);
    const w = this._weather();
    const light = s.light * w.lightMul;

    // Sun direction from time of day (orbit).
    const ang = this.timeOfDay * Math.PI * 2;
    const elev = Math.sin(this.timeOfDay * Math.PI * 2 - Math.PI / 2) * 0.85; // -1..1
    this.sunDir.set(Math.cos(ang) * 0.4, elev, Math.sin(ang) * 0.6).normalize();

    const dist = 220;
    this.sun.position.set(camPos.x + this.sunDir.x * dist, camPos.y + this.sunDir.y * dist, camPos.z + this.sunDir.z * dist);
    this.sun.target.position.set(camPos.x, 0, camPos.z);
    this.sun.intensity = 2.4 * Math.max(0, light);
    this.sun.color.set(s.sun);
    this.hemi.intensity = 0.25 + 0.75 * light;
    this.hemi.color.set(s.color).lerp(new THREE.Color(0xffffff), 0.3);

    // Sky / fog.
    const sky = s.color.clone().lerp(new THREE.Color(0x05070d), 1 - light);
    this.scene.background = sky;
    this.fog.color.copy(sky);
    const fogBase = 900 * (0.4 + light * 0.6);
    this.fog.near = fogBase * 0.25;
    this.fog.far = fogBase / (1 + (w.fog / 0.0006 - 1) * 4);
    this.fog.far = clamp(this.fog.far, 60, 900);

    // Weather fields.
    this.rain.setVisible(w.rain > 0);
    this.snow.setVisible(w.snow > 0);
    if (w.rain) this.rain.update(dt, camPos.x, camPos.z);
    if (w.snow) this.snow.update(dt, camPos.x, camPos.z);

    return { light, weather: w };
  }

  get weatherLabel() {
    if (this.weatherMode === 'dynamic') return WEATHERS[['clear', 'rain', 'fog', 'clear'][Math.floor(this.dynTimer / 20) % 4]].label;
    return (WEATHERS[this.weatherMode] || WEATHERS.clear).label;
  }

  get isNight() { return this.lightLevel < 0.4; }
}
