// pickups.js — health / armor / ammo / weapon pickups + inventory management

import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { buildWeaponModel } from './weapons.js';

function pedestal() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.4, roughness: 0.6 }));
  g.add(base);
  return g;
}

const TYPE_STYLE = {
  health: { color: 0x35e05a, emissive: 0x1a8a35, model: 'health' },
  armor: { color: 0x39d0ff, emissive: 0x1a7ab8, model: 'armor' },
  ammo: { color: 0xffc93a, emissive: 0xb08a1a, model: 'ammo' },
};

export class Pickup {
  constructor(scene, opts) {
    this.scene = scene;
    this.type = opts.type;         // health | armor | ammo | weapon
    this.weaponId = opts.weaponId || null;
    this.pos = opts.position.clone();
    this.respawnTime = opts.respawnTime != null ? opts.respawnTime : 20;
    this._respawnTimer = 0;
    this.active = true;

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.add(pedestal());

    if (this.type === 'weapon' && this.weaponId) {
      const wm = buildWeaponModel(this.weaponId);
      wm.scale.setScalar(1.3);
      wm.position.y = 0.45;
      wm.rotation.x = -0.5;
      this.group.add(wm);
      this._item = wm;
      this._glow = new THREE.PointLight(0xffffff, 6, 8, 1.6);
      this._glow.position.y = 0.8;
      this.group.add(this._glow);
    } else {
      const style = TYPE_STYLE[this.type];
      const geo = this.type === 'health'
        ? new THREE.BoxGeometry(0.4, 0.5, 0.4)
        : this.type === 'armor'
          ? new THREE.BoxGeometry(0.5, 0.45, 0.35)
          : new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const mat = new THREE.MeshStandardMaterial({ color: style.color, emissive: style.emissive, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.4 });
      const item = new THREE.Mesh(geo, mat);
      item.position.y = 0.5;
      this.group.add(item);
      this._item = item;
    }
    scene.add(this.group);
  }

  getPosition() { return this.pos; }

  update(dt, time) {
    if (!this.active) {
      this._respawnTimer -= dt;
      if (this._respawnTimer <= 0) this._respawn();
      return;
    }
    const bob = Math.sin(time * 2) * 0.12;
    const child = this._item;
    if (child) child.position.y = (this.type === 'weapon' ? 0.45 : 0.5) + bob;
    this.group.rotation.y += dt * 1.2;
  }

  tryPickup(player, audio) {
    if (!this.active) return false;
    const d = player.pos.distanceTo(this.pos);
    if (d > 1.8) return false;

    switch (this.type) {
      case 'health':
        if (player.health >= player.maxHealth) return false;
        player.health = Math.min(player.maxHealth, player.health + 50);
        audio.pickup();
        player.onEvent('health');
        break;
      case 'armor':
        if (player.armor >= player.maxArmor) return false;
        player.armor = Math.min(player.maxArmor, player.armor + 50);
        audio.pickup();
        player.onEvent('armor');
        break;
      case 'ammo':
        player.refillAmmo();
        audio.pickup();
        player.onEvent('ammo');
        break;
      case 'weapon':
        player.addWeapon(this.weaponId, true);
        audio.weaponPickup();
        player.onEvent('weapon:' + this.weaponId);
        break;
    }
    this.active = false;
    this.group.visible = false;
    this._respawnTimer = this.respawnTime;
    return true;
  }

  _respawn() {
    this.active = true;
    this.group.visible = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}
