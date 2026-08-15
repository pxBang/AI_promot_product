import * as THREE from './three.module.js';
import { rand } from './utils.js';

// Soft radial sprite texture for particles.
function makeSpriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */`
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (220.0 / max(0.1, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
uniform sampler2D uMap;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, tex.a * vAlpha);
}`;

class ParticlePool {
  constructor(scene, capacity, blending, sprite) {
    this.capacity = capacity;
    this.blending = blending;
    this.n = 0;
    this.p = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.c = new Float32Array(capacity * 3);
    this.alpha0 = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: sprite } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, a0, drag = 1.5, grav = 0) {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size0[i] = size0; this.size1[i] = size1;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b;
    this.alpha0[i] = a0;
    this.drag[i] = drag; this.gravity[i] = grav;
  }

  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const d = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] *= d; this.v[i * 3 + 2] *= d;
      this.v[i * 3 + 1] += this.gravity[i] * dt;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;

      if (w !== i) {
        const j = w;
        this.p[j * 3] = this.p[i * 3]; this.p[j * 3 + 1] = this.p[i * 3 + 1]; this.p[j * 3 + 2] = this.p[i * 3 + 2];
        this.v[j * 3] = this.v[i * 3]; this.v[j * 3 + 1] = this.v[i * 3 + 1]; this.v[j * 3 + 2] = this.v[i * 3 + 2];
        this.life[j] = this.life[i]; this.maxLife[j] = this.maxLife[i];
        this.size0[j] = this.size0[i]; this.size1[j] = this.size1[i];
        this.c[j * 3] = this.c[i * 3]; this.c[j * 3 + 1] = this.c[i * 3 + 1]; this.c[j * 3 + 2] = this.c[i * 3 + 2];
        this.alpha0[j] = this.alpha0[i];
        this.drag[j] = this.drag[i]; this.gravity[j] = this.gravity[i];
      }
      w++;
    }
    this.n = w;

    for (let i = 0; i < this.n; i++) {
      const t = 1 - this.life[i] / this.maxLife[i];
      this.sizeAttr.array[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.alphaAttr.array[i] = this.alpha0[i] * (1 - t);
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.n);
  }

  dispose(scene) {
    scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

export class ParticleSystem {
  constructor(scene) {
    this.sprite = makeSpriteTexture();
    this.smoke = new ParticlePool(scene, 1600, THREE.NormalBlending, this.sprite);
    this.glow = new ParticlePool(scene, 900, THREE.AdditiveBlending, this.sprite);
  }

  update(dt) {
    this.smoke.update(dt);
    this.glow.update(dt);
  }

  smokePuff(pos, vel = null, intensity = 1) {
    const r = rand(0.45, 0.6), g = rand(0.45, 0.6), b = rand(0.48, 0.62);
    this.smoke.spawn(
      pos.x + rand(-0.2, 0.2), pos.y + rand(-0.1, 0.1), pos.z + rand(-0.2, 0.2),
      (vel ? vel.x * 0.1 : 0) + rand(-1, 1), rand(0.5, 1.6), (vel ? vel.z * 0.1 : 0) + rand(-1, 1),
      rand(0.6, 1.4), 0.6, 2.6, r, g, b, 0.5 * intensity, 2.5, 0.6
    );
  }

  exhaustPuff(pos, vel, nitro = false) {
    if (nitro) {
      this.glow.spawn(pos.x, pos.y, pos.z, vel.x * 0.2 + rand(-0.5, 0.5), rand(0.4, 1.2), vel.z * 0.2 + rand(-0.5, 0.5),
        rand(0.2, 0.5), 0.4, 1.4, 0.2, 0.7, 1.0, 0.8, 2, 0.3);
    } else {
      this.smoke.spawn(pos.x, pos.y, pos.z, vel.x * 0.15 + rand(-0.4, 0.4), rand(0.3, 0.9), vel.z * 0.15 + rand(-0.4, 0.4),
        rand(0.25, 0.6), 0.25, 0.9, 0.3, 0.32, 0.35, 0.35, 2.5, 0.2);
    }
  }

  sparks(pos, count = 8) {
    for (let i = 0; i < count; i++) {
      this.glow.spawn(pos.x, pos.y, pos.z, rand(-4, 4), rand(1, 6), rand(-4, 4),
        rand(0.2, 0.5), 0.2, 0.5, 1.0, rand(0.6, 0.9), rand(0.1, 0.4), 0.9, 1.5, -6);
    }
  }

  dust(pos, color = [0.6, 0.5, 0.35]) {
    this.smoke.spawn(pos.x + rand(-0.4, 0.4), pos.y, pos.z + rand(-0.4, 0.4),
      rand(-0.8, 0.8), rand(0.4, 1.2), rand(-0.8, 0.8),
      rand(0.5, 1.1), 0.5, 2.2, color[0], color[1], color[2], 0.45, 2, 0.4);
  }

  boostTrail(pos, vel) {
    this.glow.spawn(pos.x, pos.y, pos.z, -vel.x * 0.3 + rand(-0.6, 0.6), rand(0, 0.6), -vel.z * 0.3 + rand(-0.6, 0.6),
      rand(0.25, 0.5), 0.4, 1.2, 0.1, 0.6, 1.0, 0.8, 2.5, 0);
  }

  dispose(scene) {
    this.smoke.dispose(scene);
    this.glow.dispose(scene);
  }
}
