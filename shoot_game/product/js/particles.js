// particles.js — pooled particle effects: muzzle flash, tracers, impacts, explosions, blood, smoke

import * as THREE from 'three';

function makeSoftTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.tex = makeSoftTexture();

    this.additive = [];   // sparks, flashes, fire
    this.normal = [];     // smoke, scorch
    this.debris = [];     // tumbling boxes
    this.tracers = [];    // stretched boxes along shot dir
    this.flashLights = [];

    this._initPools();
  }

  _initPools() {
    for (let i = 0; i < 220; i++) this._newSprite('additive');
    for (let i = 0; i < 90; i++) this._newSprite('normal');
    for (let i = 0; i < 60; i++) this._newDebris();
    for (let i = 0; i < 30; i++) this._newTracer();
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffc880, 0, 24, 1.6);
      l.visible = false;
      this.scene.add(l);
      this.flashLights.push({ light: l, life: 0 });
    }
  }

  _newSprite(pool) {
    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: pool === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    this.scene.add(s);
    const arr = pool === 'additive' ? this.additive : this.normal;
    arr.push({ s, mat, active: false, life: 0, maxLife: 1, vel: new THREE.Vector3(), gravity: 0, drag: 0, size0: 0, size1: 0, c0: new THREE.Color(), c1: new THREE.Color() });
  }

  _newDebris() {
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    this.scene.add(m);
    this.debris.push({ m, active: false, life: 0, maxLife: 1, vel: new THREE.Vector3(), angVel: new THREE.Vector3(), gravity: 0 });
  }

  _newTracer() {
    const geo = new THREE.BoxGeometry(0.03, 1, 0.03);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    this.scene.add(m);
    this.tracers.push({ m, mat, active: false, life: 0, maxLife: 0.1 });
  }

  // ---- emitters ----
  _spawn(pool, opts) {
    const arr = pool === 'additive' ? this.additive : this.normal;
    const p = arr.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.s.visible = true;
    p.mat.opacity = 1;
    p.maxLife = opts.life || 1;
    p.life = p.maxLife;
    p.s.position.copy(opts.pos);
    p.vel.copy(opts.vel || new THREE.Vector3());
    p.gravity = opts.gravity || 0;
    p.drag = opts.drag || 0;
    p.size0 = opts.size0 || 0.3;
    p.size1 = opts.size1 != null ? opts.size1 : 0;
    p.c0.set(opts.color0 || 0xffffff);
    p.c1.set(opts.color1 != null ? opts.color1 : opts.color0 || 0xffffff);
    p.mat.color.copy(p.c0);
    p.mat.blending = pool === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending;
    const sc = p.size0;
    p.s.scale.set(sc, sc, 1);
  }

  muzzleFlash(pos, dir, scale = 1) {
    // star sprite at muzzle
    this._spawn('additive', {
      pos: pos.clone(), vel: dir.clone().multiplyScalar(0.5),
      life: 0.06, size0: 0.9 * scale, size1: 0.25 * scale,
      color0: 0xfff2c0, color1: 0xff7a1a,
    });
    // point light
    const fl = this.flashLights.find((x) => x.life <= 0);
    if (fl) {
      fl.life = 0.05;
      fl.light.visible = true;
      fl.light.position.copy(pos);
      fl.light.intensity = 20 * scale;
    }
  }

  tracer(from, to) {
    const t = this.tracers.find((x) => !x.active);
    if (!t) return;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.5) return;
    t.active = true;
    t.life = t.maxLife = 0.09;
    t.m.visible = true;
    t.mat.opacity = 0.9;
    t.m.position.copy(from).addScaledVector(dir, 0.5);
    t.m.scale.set(1, len, 1);
    t.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }

  impact(pos, normal, surface = 'wall') {
    const n = normal || new THREE.Vector3(0, 1, 0);
    const colors = surface === 'metal' ? [0xffe08a, 0xffaa40, 0xffffff] : [0xddccaa, 0xffb060, 0xffffff];
    for (let i = 0; i < 8; i++) {
      const rnd = new THREE.Vector3().randomDirection().add(n.clone().multiplyScalar(1.2)).normalize().multiplyScalar(2 + Math.random() * 5);
      this._spawn('additive', {
        pos: pos.clone().add(n.clone().multiplyScalar(0.05)),
        vel: rnd, life: 0.2 + Math.random() * 0.25,
        size0: 0.1 + Math.random() * 0.1, size1: 0,
        color0: colors[i % 3], color1: 0xff4010, gravity: 9, drag: 2,
      });
    }
    // smoke puff
    this._spawn('normal', {
      pos: pos.clone().add(n.clone().multiplyScalar(0.1)),
      vel: n.clone().multiplyScalar(0.4), life: 0.5,
      size0: 0.18, size1: 0.5, color0: 0x777777, color1: 0x333333,
    });
  }

  blood(pos, dir) {
    const c = new THREE.Color(0xcc1a1a);
    for (let i = 0; i < 10; i++) {
      const rnd = new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 4);
      if (dir) rnd.add(dir.clone().multiplyScalar(1.5));
      this._spawn('normal', {
        pos: pos.clone(), vel: rnd, life: 0.35 + Math.random() * 0.4,
        size0: 0.1 + Math.random() * 0.1, size1: 0, color0: 0xcc1a1a, color1: 0x550000, gravity: 12, drag: 1,
      });
    }
  }

  explosion(pos, radius = 4) {
    // fireball core
    for (let i = 0; i < 16; i++) {
      const rnd = new THREE.Vector3().randomDirection().multiplyScalar(radius * (0.3 + Math.random() * 0.8));
      this._spawn('additive', {
        pos: pos.clone(), vel: rnd, life: 0.5 + Math.random() * 0.5,
        size0: 0.8 + Math.random() * 0.8, size1: 0.1,
        color0: 0xfff2a0, color1: 0xff4010, gravity: 2, drag: 1,
      });
    }
    // smoke column
    for (let i = 0; i < 12; i++) {
      const rnd = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random(), Math.random() - 0.5).multiplyScalar(1.5);
      this._spawn('normal', {
        pos: pos.clone().add(new THREE.Vector3((Math.random()-0.5)*2, 0, (Math.random()-0.5)*2)),
        vel: rnd, life: 1.2 + Math.random() * 1.0,
        size0: 0.8, size1: 2.2, color0: 0x444444, color1: 0x111111, gravity: -1, drag: 1.5,
      });
    }
    // debris
    for (let i = 0; i < 14; i++) {
      const d = this.debris.find((x) => !x.active);
      if (!d) break;
      d.active = true; d.m.visible = true;
      d.life = d.maxLife = 0.8 + Math.random() * 0.8;
      d.m.position.copy(pos);
      d.vel.set((Math.random()-0.5)*10, 3 + Math.random()*9, (Math.random()-0.5)*10);
      d.angVel.set((Math.random()-0.5)*20, (Math.random()-0.5)*20, (Math.random()-0.5)*20);
      d.gravity = 14;
      const gray = 0.2 + Math.random() * 0.4;
      d.m.material.color.setRGB(gray, gray * 0.9, gray * 0.7);
    }
    // flash light
    const fl = this.flashLights.find((x) => x.life <= 0);
    if (fl) {
      fl.life = 0.15;
      fl.light.visible = true;
      fl.light.position.copy(pos);
      fl.light.intensity = 40;
      fl.light.distance = radius * 5;
    }
  }

  smoke(pos) {
    this._spawn('normal', {
      pos: pos.clone(), vel: new THREE.Vector3(0, 0.5, 0), life: 1.5,
      size0: 0.3, size1: 1.2, color0: 0x555555, color1: 0x222222,
    });
  }

  // ---- update ----
  update(dt) {
    // sprites
    const upd = (arr) => {
      for (const p of arr) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; p.s.visible = false; continue; }
        const t = 1 - p.life / p.maxLife; // 0..1
        p.vel.y -= p.gravity * dt;
        if (p.drag > 0) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        p.s.position.addScaledVector(p.vel, dt);
        const sc = p.size0 + (p.size1 - p.size0) * t;
        p.s.scale.set(sc, sc, 1);
        p.mat.color.copy(p.c0).lerp(p.c1, t);
        p.mat.opacity = Math.min(1, (1 - t) * (p.life < 0.15 ? p.life / 0.15 : 1));
      }
    };
    upd(this.additive);
    upd(this.normal);

    for (const d of this.debris) {
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) { d.active = false; d.m.visible = false; continue; }
      d.vel.y -= d.gravity * dt;
      d.m.position.addScaledVector(d.vel, dt);
      d.m.rotation.x += d.angVel.x * dt;
      d.m.rotation.y += d.angVel.y * dt;
      d.m.rotation.z += d.angVel.z * dt;
      if (d.m.position.y < 0.05) { d.m.position.y = 0.05; d.vel.y = Math.abs(d.vel.y) * 0.4; d.vel.x *= 0.7; d.vel.z *= 0.7; }
    }

    for (const t of this.tracers) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) { t.active = false; t.m.visible = false; continue; }
      t.mat.opacity = t.life / t.maxLife * 0.9;
    }

    for (const fl of this.flashLights) {
      if (fl.life <= 0) continue;
      fl.life -= dt;
      if (fl.life <= 0) { fl.light.visible = false; fl.light.intensity = 0; }
    }
  }

  dispose() {
    const all = [...this.additive, ...this.normal];
    for (const p of all) { p.s.material.dispose(); }
    this.debris.forEach((d) => { d.m.geometry.dispose(); d.m.material.dispose(); });
    this.tracers.forEach((t) => { t.m.geometry.dispose(); t.mat.dispose(); });
    this.flashLights.forEach((f) => this.scene.remove(f.light));
  }
}
