// weapons.js — procedural weapon models, viewmodel animation, firing logic

import * as THREE from 'three';

// ---- Materials (created per model so each weapon owns its own, safe to dispose) ----
function makeMats() {
  return {
    metal: new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.85, roughness: 0.35 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x1c1e21, metalness: 0.7, roughness: 0.5 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x191b1d, metalness: 0.2, roughness: 0.8 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x2a2018, metalness: 0.1, roughness: 0.9 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.6, roughness: 0.4 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 0.9, roughness: 0.2 }),
    blade: new THREE.MeshStandardMaterial({ color: 0xd6dde4, metalness: 0.95, roughness: 0.15 }),
    scope: new THREE.MeshStandardMaterial({ color: 0x101215, metalness: 0.5, roughness: 0.6 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0a2a3a, metalness: 0.1, roughness: 0.1, emissive: 0x0a3a4a, emissiveIntensity: 0.6 }),
    warhead: new THREE.MeshStandardMaterial({ color: 0x6a4a20, metalness: 0.4, roughness: 0.6 }),
  };
}

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = false;
  return m;
}
function cyl(rt, rb, h, mat, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  return m;
}

// ---- Procedural model builders (each returns a THREE.Group with userData.muzzle) ----
export function buildWeaponModel(id) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  g.add(muzzle);
  const MAT = makeMats();

  const P = (x, y, z, parent = g) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

  switch (id) {
    case 'knife': {
      const blade = box(0.035, 0.5, 0.09, MAT.blade); blade.position.set(0, 0.28, 0); g.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), MAT.blade);
      tip.position.set(0, 0.55, 0); tip.rotation.x = Math.PI / 2; g.add(tip);
      const handle = box(0.05, 0.22, 0.09, MAT.grip); handle.position.set(0, 0.02, 0); g.add(handle);
      const guard = box(0.15, 0.03, 0.05, MAT.steel); guard.position.set(0, 0.13, 0); g.add(guard);
      muzzle.position.set(0, 0.6, 0);
      break;
    }
    case 'pistol': {
      const slide = box(0.06, 0.08, 0.42, MAT.metal); slide.position.set(0, 0.04, -0.02); g.add(slide);
      const frame = box(0.06, 0.06, 0.26, MAT.polymer); frame.position.set(0, -0.02, 0.06); g.add(frame);
      const grip = box(0.06, 0.24, 0.09, MAT.grip); grip.position.set(0, -0.15, 0.1); grip.rotation.x = 0.25; g.add(grip);
      const barrel = cyl(0.016, 0.016, 0.1, MAT.darkMetal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.05, -0.25); g.add(barrel);
      const sight = box(0.012, 0.02, 0.02, MAT.steel); sight.position.set(0, 0.095, -0.14); g.add(sight);
      const rsight = box(0.012, 0.02, 0.02, MAT.steel); rsight.position.set(0, 0.095, 0.12); g.add(rsight);
      const tg = box(0.02, 0.05, 0.12, MAT.steel); tg.position.set(0, -0.03, 0.0); g.add(tg);
      muzzle.position.set(0, 0.05, -0.3);
      break;
    }
    case 'smg': {
      const body = box(0.07, 0.09, 0.4, MAT.polymer); body.position.set(0, 0.02, 0); g.add(body);
      const barrel = cyl(0.02, 0.02, 0.3, MAT.darkMetal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.05, -0.34); g.add(barrel);
      const mag = box(0.055, 0.26, 0.08, MAT.metal); mag.position.set(0, -0.17, 0.05); mag.rotation.x = 0.3; g.add(mag);
      const stock = box(0.06, 0.06, 0.24, MAT.polymer); stock.position.set(0, -0.01, 0.3); g.add(stock);
      const grip = box(0.055, 0.16, 0.07, MAT.grip); grip.position.set(0, -0.11, 0.12); g.add(grip);
      const fgrip = box(0.05, 0.1, 0.06, MAT.grip); fgrip.position.set(0, -0.08, -0.18); g.add(fgrip);
      const sight = box(0.015, 0.03, 0.04, MAT.steel); sight.position.set(0, 0.09, 0.02); g.add(sight);
      muzzle.position.set(0, 0.05, -0.5);
      break;
    }
    case 'rifle': {
      const receiver = box(0.07, 0.09, 0.3, MAT.metal); receiver.position.set(0, 0.02, 0.05); g.add(receiver);
      const barrel = cyl(0.018, 0.018, 0.4, MAT.darkMetal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.34); g.add(barrel);
      const handguard = box(0.065, 0.07, 0.26, MAT.accent); handguard.position.set(0, 0.02, -0.2); g.add(handguard);
      const mag = box(0.06, 0.22, 0.09, MAT.metal); mag.position.set(0, -0.13, 0.05); mag.rotation.x = 0.25; g.add(mag);
      const stock = box(0.06, 0.07, 0.26, MAT.polymer); stock.position.set(0, -0.01, 0.32); g.add(stock);
      const grip = box(0.055, 0.15, 0.07, MAT.grip); grip.position.set(0, -0.1, 0.16); g.add(grip);
      const front = box(0.02, 0.05, 0.03, MAT.steel); front.position.set(0, 0.09, -0.4); g.add(front);
      const rear = box(0.02, 0.04, 0.05, MAT.steel); rear.position.set(0, 0.1, 0.05); g.add(rear);
      const rail = box(0.05, 0.02, 0.4, MAT.darkMetal); rail.position.set(0, 0.08, 0); g.add(rail);
      muzzle.position.set(0, 0.03, -0.55);
      break;
    }
    case 'shotgun': {
      const receiver = box(0.07, 0.08, 0.36, MAT.metal); receiver.position.set(0, 0.02, 0.02); g.add(receiver);
      const barrel = cyl(0.026, 0.026, 0.5, MAT.darkMetal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.05, -0.4); g.add(barrel);
      const tube = cyl(0.024, 0.024, 0.4, MAT.steel); tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.0, -0.3); g.add(tube);
      const pump = box(0.06, 0.06, 0.14, MAT.grip); pump.position.set(0, -0.03, -0.24); g.add(pump);
      const stock = box(0.06, 0.08, 0.26, MAT.grip); stock.position.set(0, -0.02, 0.33); g.add(stock);
      const grip = box(0.055, 0.14, 0.07, MAT.grip); grip.position.set(0, -0.1, 0.14); g.add(grip);
      const bead = box(0.012, 0.012, 0.012, MAT.steel); bead.position.set(0, 0.075, -0.62); g.add(bead);
      muzzle.position.set(0, 0.05, -0.66);
      break;
    }
    case 'sniper': {
      const receiver = box(0.07, 0.1, 0.34, MAT.metal); receiver.position.set(0, 0.0, 0.02); g.add(receiver);
      const barrel = cyl(0.02, 0.02, 0.6, MAT.darkMetal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.5); g.add(barrel);
      const brake = cyl(0.032, 0.032, 0.12, MAT.steel); brake.rotation.x = Math.PI / 2; brake.position.set(0, 0.02, -0.82); g.add(brake);
      const scope = cyl(0.035, 0.035, 0.22, MAT.scope); scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.09, 0.0); g.add(scope);
      const lensF = cyl(0.033, 0.033, 0.02, MAT.lens); lensF.rotation.x = Math.PI / 2; lensF.position.set(0, 0.09, -0.12); g.add(lensF);
      const lensR = cyl(0.033, 0.033, 0.02, MAT.lens); lensR.rotation.x = Math.PI / 2; lensR.position.set(0, 0.09, 0.12); g.add(lensR);
      const mounts = box(0.04, 0.05, 0.1, MAT.steel); mounts.position.set(0, 0.04, 0.0); g.add(mounts);
      const stock = box(0.06, 0.1, 0.3, MAT.grip); stock.position.set(0, -0.02, 0.32); g.add(stock);
      const grip = box(0.055, 0.14, 0.08, MAT.grip); grip.position.set(0, -0.11, 0.12); g.add(grip);
      const mag = box(0.06, 0.12, 0.1, MAT.metal); mag.position.set(0, -0.12, -0.02); g.add(mag);
      const bolt = cyl(0.014, 0.014, 0.08, MAT.steel); bolt.rotation.z = Math.PI / 2; bolt.position.set(0.045, 0.0, 0.1); g.add(bolt);
      muzzle.position.set(0, 0.02, -0.88);
      break;
    }
    case 'rocket': {
      const tube = cyl(0.075, 0.075, 0.9, MAT.darkMetal); tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.0, -0.1); g.add(tube);
      const tubeInner = cyl(0.062, 0.062, 0.9, MAT.polymer); tubeInner.rotation.x = Math.PI / 2; tubeInner.position.set(0, 0.0, -0.1); g.add(tubeInner);
      const warhead = cyl(0.062, 0.02, 0.28, MAT.warhead); warhead.rotation.x = Math.PI / 2; warhead.position.set(0, 0.0, -0.6); g.add(warhead);
      const grip = box(0.06, 0.16, 0.09, MAT.grip); grip.position.set(0, -0.12, 0.12); g.add(grip);
      const grip2 = box(0.06, 0.14, 0.08, MAT.grip); grip2.position.set(0, -0.1, -0.02); g.add(grip2);
      const sight = box(0.02, 0.04, 0.06, MAT.steel); sight.position.set(0, 0.1, 0.12); g.add(sight);
      const back = cyl(0.075, 0.075, 0.08, MAT.steel); back.rotation.x = Math.PI / 2; back.position.set(0, 0.0, 0.38); g.add(back);
      muzzle.position.set(0, 0.0, -0.78);
      break;
    }
    default: {
      const b = box(0.07, 0.09, 0.5, MAT.metal); g.add(b);
      muzzle.position.set(0, 0.04, -0.3);
    }
  }
  g.userData.muzzle = muzzle;
  return g;
}

const VIEWMODEL_PRESETS = {
  knife:    { pos: [0.28, -0.26, -0.42], scale: 0.9 },
  pistol:   { pos: [0.22, -0.22, -0.4], scale: 1.0 },
  smg:      { pos: [0.2, -0.24, -0.44], scale: 0.95 },
  rifle:    { pos: [0.2, -0.24, -0.46], scale: 0.95 },
  shotgun:  { pos: [0.2, -0.24, -0.48], scale: 0.95 },
  sniper:   { pos: [0.18, -0.24, -0.5], scale: 0.9 },
  rocket:   { pos: [0.18, -0.26, -0.5], scale: 0.85 },
};

export class Weapon {
  constructor(def, context) {
    this.def = def;
    this.ctx = context; // { scene, camera, particles, audio, raycastShot, spawnProjectile, player }
    this.name = def.name;

    this.ammoInMag = def.magSize || 0;
    this.reserve = def.reserve || 0;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadDur = def.reloadTime || 1.5;
    this.ads = false;
    this.kick = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobPhase = 0;
    this.meleeSwing = 0;

    // build viewmodel
    const preset = VIEWMODEL_PRESETS[def.model] || VIEWMODEL_PRESETS.rifle;
    this.model = buildWeaponModel(def.model);
    this.model.scale.setScalar(preset.scale);
    this.basePos = new THREE.Vector3(...preset.pos);
    this.adsPos = new THREE.Vector3(0, -0.155, -0.28);
    this.model.position.copy(this.basePos);
    this.muzzleObj = this.model.userData.muzzle;
    this.camera = context.camera;
    this.camera.add(this.model);
    this.model.visible = false;
    this.enabled = false;
  }

  setActive(active) {
    this.enabled = active;
    this.model.visible = active;
    if (!active) { this.ads = false; }
  }

  giveAmmo() {
    if (this.def.magSize != null) this.ammoInMag = this.def.magSize;
    if (this.def.reserve != null) this.reserve = this.def.reserve;
  }

  canFire() { return this.cooldown <= 0 && !this.reloading && this.enabled; }

  startReload() {
    if (this.reloading) return;
    if (this.def.magSize == null) return;
    if (this.ammoInMag >= this.def.magSize) return;
    if (this.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = this.reloadDur;
    this.ctx.audio.reload(this.def.id);
  }

  _finishReload() {
    const need = this.def.magSize - this.ammoInMag;
    const take = Math.min(need, this.reserve);
    this.ammoInMag += take;
    this.reserve -= take;
    this.reloading = false;
  }

  fire() {
    const d = this.def;
    if (d.kind === 'melee') return this._swing();
    if (!this.canFire()) return;
    if (d.magSize != null && this.ammoInMag <= 0) {
      this.ctx.audio.empty();
      this.startReload();
      return;
    }
    if (d.magSize != null) this.ammoInMag--;
    this.cooldown = 1 / (d.fireRate / 60); // fireRate is RPM
    this.kick = Math.min(1, this.kick + 0.75);
    this.ctx.audio.shot(d.id);

    // muzzle world pos + dir
    const muzzleWorld = new THREE.Vector3();
    this.muzzleObj.getWorldPosition(muzzleWorld);
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    // compute spread
    let spread = d.spread || 0.008;
    const moving = this.ctx.player ? this.ctx.player.isMoving : false;
    if (moving) spread += d.spreadMove || 0;
    if (this.ads) spread = d.adsSpread != null ? d.adsSpread : spread * 0.3;

    this.ctx.particles.muzzleFlash(muzzleWorld, camDir, d.muzzleScale || 0.6);

    const pellets = d.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const dir = this._spreadDir(camDir, spread);
      if (d.kind === 'projectile') {
        this.ctx.spawnProjectile(muzzleWorld.clone(), dir, d);
      } else {
        const res = this.ctx.raycastShot(muzzleWorld, dir, d);
        const end = res && res.point ? res.point : muzzleWorld.clone().addScaledVector(dir, d.range || 100);
        this.ctx.particles.tracer(muzzleWorld, end);
        if (res && res.hit) {
          if (res.headshot) this.ctx.audio.headshot();
          else this.ctx.audio.hitmarker();
        }
      }
    }

    // camera recoil shake
    if (this.ctx.player) this.ctx.player.addRecoil(d.recoil || 0.01);
  }

  _swing() {
    if (this.cooldown > 0) return;
    this.cooldown = this.def.swingTime || 0.3;
    this.meleeSwing = 1;
    this.ctx.audio.melee();
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const origin = this.camera.position.clone();
    const res = this.ctx.raycastShot(origin, camDir, this.def);
    if (res && res.hit) this.ctx.audio.hitmarker();
  }

  _spreadDir(dir, spread) {
    const d = dir.clone();
    d.x += (Math.random() - 0.5) * spread * 2;
    d.y += (Math.random() - 0.5) * spread * 2;
    d.z += (Math.random() - 0.5) * spread * 2;
    return d.normalize();
  }

  update(dt, opts = {}) {
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this._finishReload();
    }

    // decay kick
    this.kick = Math.max(0, this.kick - dt * 5);
    if (this.meleeSwing > 0) this.meleeSwing = Math.max(0, this.meleeSwing - dt * 5);

    // smooth sway from mouse
    const targetSwayX = THREE.MathUtils.clamp(-opts.mouseDX * 0.0015, -0.05, 0.05);
    const targetSwayY = THREE.MathUtils.clamp(-opts.mouseDY * 0.0015, -0.05, 0.05);
    this.swayX += (targetSwayX - this.swayX) * Math.min(1, dt * 12);
    this.swayY += (targetSwayY - this.swayY) * Math.min(1, dt * 12);

    // walk bob
    if (opts.moving && opts.grounded) {
      this.bobPhase += dt * (opts.speed || 0) * 1.6;
    } else {
      this.bobPhase += dt * 2;
    }
    const bobAmt = opts.moving && opts.grounded ? 0.012 : 0.003;
    const bobX = Math.cos(this.bobPhase) * bobAmt;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * bobAmt;

    // assemble transform
    const targetPos = this.ads ? this.adsPos.clone() : this.basePos.clone();
    targetPos.x += this.swayX + bobX;
    targetPos.y += this.swayY - bobY;
    targetPos.z += this.kick * (this.def.kind === 'sniper' ? 0.12 : 0.08);

    this.model.position.lerp(targetPos, Math.min(1, dt * 18));

    // rotation: kick up, reload dip, ads level
    let rotX = this.kick * 0.25;
    let rotY = 0;
    if (this.reloading) {
      const p = 1 - this.reloadTimer / this.reloadDur;
      const dip = Math.sin(p * Math.PI);
      rotX += dip * 0.9;
      rotY = dip * 0.2;
    }
    if (this.ads) rotX *= 0.25;
    if (this.meleeSwing > 0) { rotX -= this.meleeSwing * 0.9; rotY += this.meleeSwing * 0.4; }
    this.model.rotation.set(rotX, rotY, this.swayX * 0.5);
  }
}
