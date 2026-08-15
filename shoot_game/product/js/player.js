// player.js — first-person controller, physics, health, weapon inventory

import * as THREE from 'three';
import { WEAPONS, DEFAULT_LOADOUT, SETTINGS } from './config.js';
import { Weapon } from './weapons.js';

const SENSITIVITY = 0.0022;

export class Player {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.audio = game.audio;
    this.particles = game.particles;
    this.camera = game.camera;
    this.scene = game.scene;

    this.name = 'You';
    this.team = 'blue';
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.4;

    this.health = SETTINGS.maxHealth;
    this.armor = 0;
    this.maxHealth = SETTINGS.maxHealth;
    this.maxArmor = SETTINGS.maxArmor;
    this.alive = true;

    this.grounded = true;
    this.crouching = false;
    this.sprinting = false;
    this.isMoving = false;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.footstepTimer = 0;
    this.grenadeCount = 0;

    this.weapons = [];
    this.currentIndex = 0;

    this._buildInventory();
  }

  _buildInventory() {
    const ctx = {
      scene: this.scene,
      camera: this.camera,
      particles: this.particles,
      audio: this.audio,
      raycastShot: (o, d, w) => this.game.raycastShot(o, d, w),
      spawnProjectile: (o, d, w) => this.game.spawnProjectile(o, d, w),
      player: this,
    };
    for (const item of DEFAULT_LOADOUT) {
      const def = WEAPONS[item.id];
      const w = new Weapon(def, ctx);
      w.giveAmmo();
      this.weapons.push(w);
    }
    this.grenadeCount = WEAPONS.grenade.count;
    this._activateWeapon(0);
  }

  get eyeY() { return this.crouching ? SETTINGS.crouchEyeHeight : SETTINGS.eyeHeight; }
  get eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeY, this.pos.z); }
  get currentWeapon() { return this.weapons[this.currentIndex]; }

  _activateWeapon(i) {
    this.currentIndex = i;
    this.weapons.forEach((w, idx) => w.setActive(idx === i));
  }

  addWeapon(id, giveAmmo) {
    const def = WEAPONS[id];
    const existing = this.weapons.find((w) => w.def.id === id);
    if (existing) {
      if (giveAmmo) { existing.giveAmmo(); }
      this._activateWeapon(this.weapons.indexOf(existing));
      return;
    }
    const ctx = {
      scene: this.scene, camera: this.camera, particles: this.particles, audio: this.audio,
      raycastShot: (o, d, w) => this.game.raycastShot(o, d, w),
      spawnProjectile: (o, d, w) => this.game.spawnProjectile(o, d, w),
      player: this,
    };
    const w = new Weapon(def, ctx);
    if (giveAmmo) w.giveAmmo();
    this.weapons.push(w);
    this._activateWeapon(this.weapons.length - 1);
  }

  refillAmmo() {
    for (const w of this.weapons) {
      if (w.def.magSize != null) w.reserve = w.def.reserve;
    }
    this.grenadeCount = WEAPONS.grenade.count;
  }

  spawn(pos, yaw) {
    this.pos.copy(pos);
    this.yaw = yaw || 0;
    this.pitch = 0;
    this.vy = 0;
    this.health = this.maxHealth;
    this.armor = 0;
    this.alive = true;
    this.grenadeCount = WEAPONS.grenade.count;
    for (const w of this.weapons) w.giveAmmo();
  }

  addRecoil(amount) {
    this.recoilPitch += amount * (0.7 + Math.random() * 0.6);
    this.recoilYaw += (Math.random() - 0.5) * amount * 0.6;
  }

  takeDamage(amount, attackerName, attackerTeam, fromPos) {
    if (!this.alive) return;
    // armor absorbs
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.6);
      this.armor -= absorbed;
      amount -= absorbed;
    }
    this.health -= amount;
    if (this.game.hud) {
      this.game.hud.showDamage(fromPos ? fromPos.clone() : null, this.pos, this.yaw);
    }
    this.audio.hurt();
    if (this.health <= 0) {
      this.health = 0;
      this.die(attackerName, attackerTeam);
    }
  }

  die(killerName, killerTeam) {
    if (!this.alive) return;
    this.alive = false;
    this.audio.death();
    this.game.onPlayerKilled(killerName, killerTeam);
  }

  update(dt, time) {
    if (!this.alive) return;

    // ---- look ----
    this.yaw -= this.input.mouseDX * SENSITIVITY;
    this.pitch -= this.input.mouseDY * SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    this.recoilPitch = Math.max(0, this.recoilPitch - dt * 0.25);
    this.recoilYaw *= Math.max(0, 1 - dt * 8);

    // ---- movement input ----
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (this.input.isDown('KeyW')) move.add(fwd);
    if (this.input.isDown('KeyS')) move.sub(fwd);
    if (this.input.isDown('KeyD')) move.add(right);
    if (this.input.isDown('KeyA')) move.sub(right);
    this.isMoving = move.lengthSq() > 0;
    if (this.isMoving) move.normalize();

    this.crouching = this.input.isDown('ControlLeft') || this.input.isDown('ControlRight') || this.input.isDown('KeyC');
    this.sprinting = this.input.isDown('ShiftLeft') && this.input.isDown('KeyW') && !this.crouching;

    let speed = SETTINGS.playerSpeed;
    if (this.sprinting) speed *= SETTINGS.sprintMult;
    if (this.crouching) speed *= SETTINGS.crouchMult;

    this.vel.set(move.x * speed, this.vel.y, move.z * speed);

    // ---- gravity / jump ----
    if (this.input.wasPressed('Space') && this.grounded) {
      this.vy = SETTINGS.jumpVelocity;
      this.grounded = false;
      this.audio.jump();
    }
    this.vy -= SETTINGS.gravity * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) {
      if (!this.grounded && this.vy < -4) this.audio.land();
      this.pos.y = 0;
      this.vy = 0;
      this.grounded = true;
    }

    // ---- horizontal move + collision ----
    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);

    // clamp to bounds
    const half = this.game.level.size / 2 - 1;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -half, half);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -half, half);

    // ---- footsteps ----
    if (this.isMoving && this.grounded) {
      this.footstepTimer -= dt * (this.sprinting ? 1.7 : 1);
      if (this.footstepTimer <= 0) {
        this.audio.footstep(this.game.level.def.env === 'urban' ? 'metal' : 'floor');
        this.footstepTimer = 1;
      }
    }

    // ---- weapons ----
    this._handleWeaponSwitch();
    const w = this.currentWeapon;

    // ADS
    w.ads = this.input.mouseDown.right && w.def.adsFov != null && w.enabled;
    const targetFov = (w.ads && w.enabled) ? w.def.adsFov : 75;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
    this.camera.updateProjectionMatrix();

    // reload
    if (this.input.wasPressed('KeyR')) w.startReload();

    // fire
    if (w.def.auto && this.input.mouseDown.left) w.fire();
    else if (!w.def.auto && this.input.mouseClicked.left) w.fire();

    // grenade
    if (this.input.wasPressed('KeyG')) this.throwGrenade();

    // update weapon anim
    w.update(dt, {
      mouseDX: this.input.mouseDX, mouseDY: this.input.mouseDY,
      moving: this.isMoving, grounded: this.grounded, speed: speed, time,
    });

    // ---- camera transform ----
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeY, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + this.recoilYaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch;
    this.camera.rotation.z = 0;
  }

  _moveAxis(axis, delta) {
    if (delta === 0) return;
    const test = this.pos.clone();
    test[axis] += delta;
    if (!this._blocked(test.x, test.z)) {
      this.pos[axis] += delta;
    }
  }

  _blocked(x, z) {
    const r = this.radius;
    const y0 = this.pos.y;
    const y1 = this.pos.y + this.eyeY;
    for (const c of this.game.level.colliders) {
      if (x + r > c.min.x && x - r < c.max.x &&
          z + r > c.min.z && z - r < c.max.z &&
          y1 > c.min.y && y0 < c.max.y) {
        return true;
      }
    }
    return false;
  }

  _handleWeaponSwitch() {
    const keyMap = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
    for (const [key, idx] of Object.entries(keyMap)) {
      if (this.input.wasPressed(key) && this.weapons[idx]) {
        this._activateWeapon(idx);
      }
    }
    // scroll wheel
    if (this.input.mouseWheel !== 0) {
      const dir = this.input.mouseWheel > 0 ? 1 : -1;
      let i = (this.currentIndex + dir + this.weapons.length) % this.weapons.length;
      this._activateWeapon(i);
      this.input.mouseWheel = 0;
    }
  }

  hideViewmodels() { this.weapons.forEach((w) => { w.model.visible = false; }); }
  showViewmodels() { this.weapons.forEach((w, i) => { w.model.visible = (i === this.currentIndex); }); }

  throwGrenade() {
    if (this.grenadeCount <= 0) { this.audio.empty(); return; }
    this.grenadeCount--;
    const origin = this.eyePos.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.game.spawnGrenade(origin, dir, this.team);
    this.audio.shot('rocket');
  }

  // called by pickups
  onEvent(type) {
    if (this.game.hud) this.game.hud.centerMessage(type);
    if (this.game.score) this.game.score.onPickup(type);
  }
}
