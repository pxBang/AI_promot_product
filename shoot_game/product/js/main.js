// main.js — game orchestrator: renderer, match flow, combat resolution, AI, objectives

import * as THREE from 'three';
import { Input } from './input.js';
import { audio } from './audio.js';
import { ParticleSystem } from './particles.js';
import { buildLevel } from './levels.js';
import { NavGrid, Enemy, BOT_WEAPONS } from './ai.js';
import { Pickup } from './pickups.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { ScoreTracker } from './score.js';
import { ReplayManager } from './replay.js';
import { SETTINGS, BOT_NAMES_BLUE, BOT_NAMES_RED, LEVELS, WEAPONS, SCORE } from './config.js';

export class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('game') });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d12);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 600);
    this.camera.position.set(0, 1.6, 4);

    this.clock = new THREE.Clock();
    this.time = 0;

    this.input = new Input(this.renderer.domElement);
    this.input.attach();
    this.audio = audio;
    this.particles = new ParticleSystem(this.scene);
    this.hud = new HUD();
    this.replay = new ReplayManager(this.camera);

    this.worldGroup = null;
    this.level = null;
    this.navgrid = null;
    this.player = null;
    this.enemies = [];
    this.pickups = [];
    this.projectiles = [];
    this.shootableParts = [];
    this.enemyRespawnTimers = [];
    this.objectives = [];
    this.score = null;

    this.state = 'menu'; // menu | playing | dead | paused | end
    this.mode = 'tdm';
    this.levelIndex = 0;
    this.timeLeft = SETTINGS.matchTime;
    this.respawnTimer = 0;
    this.deadEnemyDelay = 3;

    this._bindUI();
    this._bindInput();
    this._loop = this._loop.bind(this);
    this._loop();
  }

  // ================= UI =================
  _bindUI() {
    const modes = document.querySelectorAll('#mode-select button');
    modes.forEach((b) => b.addEventListener('click', () => {
      modes.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      this.mode = b.dataset.mode;
    }));
    const levels = document.querySelectorAll('#level-select button');
    levels.forEach((b) => b.addEventListener('click', () => {
      levels.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      this.levelIndex = parseInt(b.dataset.level, 10);
    }));

    document.getElementById('start-btn').addEventListener('click', () => this.startMatch());
    document.getElementById('resume-btn').addEventListener('click', () => this.resume());
    document.getElementById('quit-btn').addEventListener('click', () => this.quitToMenu());
    document.getElementById('end-quit-btn').addEventListener('click', () => this.quitToMenu());
    document.getElementById('play-again-btn').addEventListener('click', () => this.startMatch());

    window.addEventListener('resize', () => this._onResize());
  }

  _bindInput() {
    this.input.onLockChange((locked) => {
      if (!locked && (this.state === 'playing' || this.state === 'dead')) {
        this.pause();
      }
    });
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ================= Match setup =================
  startMatch() {
    audio.ensure();
    this._clearScene();

    // menus
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    this.hud.hideRespawn();

    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.level = buildLevel(this.worldGroup, this.levelIndex);
    this.navgrid = new NavGrid(this.level.size, this.level.colliders);
    this.level.navgrid = this.navgrid;
    this.hud.setLevel(this.level);

    this.player = new Player(this);
    this.enemies = [];
    this.pickups = [];
    this.projectiles = [];
    this.shootableParts = [];
    this.enemyRespawnTimers = [];
    this.objectives = [];

    this.score = new ScoreTracker();
    this.score.mode = this.mode;
    this.score.setPlayer(this.player.team);

    this._spawnEnemies();
    this._spawnPickups();
    if (this.mode === 'dom') this._createObjectiveMarkers();

    this.timeLeft = SETTINGS.matchTime;
    this.respawnTimer = 0;
    this.state = 'playing';

    // spawn player
    const spawn = this.level.spawns[0].clone();
    spawn.x -= 1; spawn.z -= 1;
    this.player.spawn(spawn, Math.atan2(0 - spawn.x, 0 - spawn.z));

    this.hud.show();
    this.hud.showObjectiveBanner(`${this.mode.toUpperCase()} — ${LEVELS[this.levelIndex].name}`);
    audio.startAmbient(this.level.def.env);
    this.input.lock();
  }

  _spawnEnemies() {
    const blueCount = this.mode === 'ffa' ? 0 : 3;
    const redCount = this.mode === 'ffa' ? 6 : 4;
    let bi = 0, ri = 0;
    const mk = (team, name, spawn, weapon) => {
      const e = new Enemy(this._enemyCtx(), { name, team, spawn, weapon });
      e.spawn = spawn.clone();
      this.enemies.push(e);
      this.shootableParts.push(...e.getParts());
      this.score.setBotTeam(name, team);
    };
    for (let i = 0; i < blueCount; i++) {
      mk('blue', BOT_NAMES_BLUE[bi++ % BOT_NAMES_BLUE.length], this.level.spawns[i % this.level.spawns.length], this._randomBotWeapon());
    }
    for (let i = 0; i < redCount; i++) {
      mk('red', BOT_NAMES_RED[ri++ % BOT_NAMES_RED.length], this.level.spawns[(i + 1) % this.level.spawns.length], this._randomBotWeapon());
    }
  }

  _randomBotWeapon() {
    const r = Math.random();
    if (r < 0.45) return BOT_WEAPONS[0];
    if (r < 0.75) return BOT_WEAPONS[1];
    if (r < 0.9) return BOT_WEAPONS[2];
    return BOT_WEAPONS[3];
  }

  _enemyCtx() {
    return {
      scene: this.worldGroup,
      particles: this.particles,
      audio,
      player: this.player,
      enemies: this.enemies,
      navgrid: this.navgrid,
      colliders: this.level.colliders,
      raycastLOS: (a, b) => this.raycastLOS(a, b),
      enemyShot: (o, d, e) => this.enemyShot(o, d, e),
      onKilled: (enemy, attacker, headshot) => this.onKilled(enemy, attacker, headshot),
    };
  }

  _spawnPickups() {
    const types = ['health', 'armor', 'ammo', 'weapon'];
    const weaponChoices = ['smg', 'shotgun', 'sniper', 'rocket'];
    const positions = [
      [18, 18], [-18, 18], [18, -18], [-18, -18],
      [0, 24], [24, 0], [0, -24], [-24, 0],
      [10, -12], [-12, 10],
    ];
    positions.forEach((p, i) => {
      let type = types[i % 4];
      let weaponId = null;
      if (type === 'weapon') weaponId = weaponChoices[Math.floor(Math.random() * weaponChoices.length)];
      const pos = new THREE.Vector3(p[0], 0, p[1]);
      if (Math.abs(pos.x) > this.level.size / 2 - 2 || Math.abs(pos.z) > this.level.size / 2 - 2) return;
      this.pickups.push(new Pickup(this.worldGroup, { type, weaponId, position: pos }));
    });
  }

  _createObjectiveMarkers() {
    for (const pos of this.level.objectives) {
      const group = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 3.2, 0.2, 32),
        new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.35, depthWrite: false })
      );
      ring.position.y = 0.1;
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 8, 12),
        new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.4, depthWrite: false })
      );
      beacon.position.y = 4;
      group.add(ring, beacon);
      group.position.set(pos.x, 0, pos.z);
      this.worldGroup.add(group);
      this.objectives.push({ pos, owner: null, progress: 0, holdTimer: 0, group, ring, beacon });
    }
  }

  // ================= Combat =================
  raycastLOS(a, b) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const dist = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(a, dir, 0, dist);
    const hits = ray.intersectObjects(this.level.shootables, false);
    return hits.length === 0;
  }

  raycastShot(origin, dir, weaponDef) {
    const res = this._resolveShot(origin, dir, {
      damage: weaponDef.damage,
      headshotMult: weaponDef.headshotMult || 2,
      range: weaponDef.range || 100,
      shooterTeam: this.player.team,
      shooterName: this.player.name,
      shooterIsPlayer: true,
      weaponId: weaponDef.id,
      ignoreEnemy: null,
    });
    this.score.recordShot(res.hit);
    if (res.hit) {
      this.hud.showHitMarker(res.headshot);
      if (!res.victimIsPlayer) this.score.recordDamage(this.player.name, res.damage);
    }
    return res;
  }

  enemyShot(origin, dir, enemy) {
    const cfg = enemy.weaponCfg;
    const res = this._resolveShot(origin, dir, {
      damage: cfg.damage,
      headshotMult: 2,
      range: cfg.range,
      shooterTeam: enemy.team,
      shooterName: enemy.name,
      shooterIsPlayer: false,
      weaponId: cfg.id,
      ignoreEnemy: enemy,
    });
    // visual tracer + muzzle flash
    const end = res.point || origin.clone().addScaledVector(dir, cfg.range);
    this.particles.tracer(origin, end);
    this.particles.muzzleFlash(origin.clone().addScaledVector(dir, 0.4), dir, 0.35);
    return res;
  }

  _raySphere(origin, dir, center, radius) {
    const oc = new THREE.Vector3().subVectors(center, origin);
    const tca = oc.dot(dir);
    if (tca < 0) return null;
    const d2 = oc.lengthSq() - tca * tca;
    const r2 = radius * radius;
    if (d2 > r2) return null;
    const thc = Math.sqrt(r2 - d2);
    return tca - thc;
  }

  _resolveShot(origin, dir, opts) {
    const ray = new THREE.Raycaster(origin, dir, 0, opts.range);
    const all = this.level.shootables.concat(this.shootableParts);
    const hits = ray.intersectObjects(all, false);

    let wall = null;
    let enemyHit = null;
    for (const h of hits) {
      const o = h.object;
      if (o.userData.enemy) {
        const e = o.userData.enemy;
        if (!e.alive || e === opts.ignoreEnemy) continue;
        if (opts.shooterIsPlayer && e.team === this.player.team) continue; // no friendly fire
        if (!enemyHit || h.distance < enemyHit.distance) {
          enemyHit = { distance: h.distance, point: h.point, normal: h.face ? h.face.normal : null, enemy: e, part: o.userData.part };
        }
      } else if (o.userData.isWall || o.userData.isFloor) {
        if (!wall || h.distance < wall.distance) wall = h;
      }
    }

    // player hit (only for enemy shooters)
    let playerHit = null;
    if (!opts.shooterIsPlayer && this.player.alive) {
      const p = this.player;
      const headC = new THREE.Vector3(p.pos.x, p.eyeY + 0.2, p.pos.z);
      const bodyC = new THREE.Vector3(p.pos.x, p.eyeY - 0.3, p.pos.z);
      const th = this._raySphere(origin, dir, headC, 0.22);
      const tb = this._raySphere(origin, dir, bodyC, 0.5);
      let t, headshot = false;
      if (th != null && th >= 0 && (tb == null || th <= tb)) { t = th; headshot = true; }
      else if (tb != null && tb >= 0) { t = tb; headshot = false; }
      if (t != null) {
        playerHit = { distance: t, point: origin.clone().addScaledVector(dir, t), headshot };
      }
    }

    // choose nearest
    const candidates = [];
    if (wall) candidates.push({ kind: 'wall', d: wall.distance, data: wall });
    if (enemyHit) candidates.push({ kind: 'enemy', d: enemyHit.distance, data: enemyHit });
    if (playerHit) candidates.push({ kind: 'player', d: playerHit.distance, data: playerHit });
    if (candidates.length === 0) return { hit: false, point: origin.clone().addScaledVector(dir, opts.range), headshot: false };

    candidates.sort((a, b) => a.d - b.d);
    const nearest = candidates[0];

    if (nearest.kind === 'wall') {
      const n = nearest.data.face ? nearest.data.face.normal.clone() : new THREE.Vector3(0, 1, 0);
      this.particles.impact(nearest.data.point, n, this.level.def.env === 'urban' ? 'metal' : 'wall');
      return { hit: true, point: nearest.data.point, normal: n, headshot: false, victimName: null, victimTeam: null, victimIsPlayer: false, damage: 0 };
    }

    if (nearest.kind === 'enemy') {
      const e = nearest.data.enemy;
      const headshot = nearest.data.part === 'head';
      const dmg = opts.damage * (headshot ? opts.headshotMult : 1);
      const attacker = { team: opts.shooterTeam, name: opts.shooterName, isPlayer: opts.shooterIsPlayer, weaponId: opts.weaponId };
      e.takeDamage(dmg, attacker, headshot);
      this.particles.blood(nearest.data.point, dir);
      return { hit: true, point: nearest.data.point, normal: nearest.data.normal, headshot, victimName: e.name, victimTeam: e.team, victimIsPlayer: false, damage: dmg };
    }

    // player
    const dmg = opts.damage * (nearest.data.headshot ? opts.headshotMult : 1);
    const p = this.player;
    p.takeDamage(dmg, opts.shooterName, opts.shooterTeam, origin);
    this.particles.blood(nearest.data.point, dir);
    return { hit: true, point: nearest.data.point, normal: null, headshot: nearest.data.headshot, victimName: p.name, victimTeam: p.team, victimIsPlayer: true, damage: dmg };
  }

  // ---- Projectiles / explosions ----
  spawnProjectile(origin, dir, weaponDef) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.55, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a3d33, metalness: 0.5, roughness: 0.5 })
    );
    body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x7a4a20, roughness: 0.6 })
    );
    tip.rotation.x = -Math.PI / 2; tip.position.z = 0.35;
    group.add(body, tip);
    group.position.copy(origin);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    this.worldGroup.add(group);

    this.projectiles.push({
      type: 'rocket', mesh: group,
      pos: origin.clone(), vel: dir.clone().multiplyScalar(weaponDef.projectileSpeed || 42),
      gravity: 3, team: this.player.team, ownerName: this.player.name, ownerIsPlayer: true,
      weaponId: weaponDef.id, damage: weaponDef.damage, radius: weaponDef.splashRadius,
      fuse: Infinity, armed: 0.18, trail: 0,
    });
  }

  spawnGrenade(origin, dir, team) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.6 })
    );
    mesh.position.copy(origin);
    this.worldGroup.add(mesh);
    const vel = dir.clone().multiplyScalar(17);
    vel.y += 4;
    this.projectiles.push({
      type: 'grenade', mesh,
      pos: origin.clone(), vel, gravity: 22, team,
      ownerName: this.player.name, ownerIsPlayer: true,
      weaponId: 'grenade', damage: WEAPONS.grenade.damage, radius: WEAPONS.grenade.splashRadius,
      fuse: 2.2, armed: 0, trail: 0, bounces: 0,
    });
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.armed > 0) pr.armed -= dt;

      if (pr.type === 'rocket') {
        pr.vel.y -= pr.gravity * dt;
        pr.pos.addScaledVector(pr.vel, dt);
        pr.mesh.position.copy(pr.pos);
        const dir = pr.vel.clone().normalize();
        pr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        pr.trail -= dt;
        if (pr.trail <= 0) { pr.trail = 0.02; this.particles.smoke(pr.pos.clone()); }
        // collisions
        if (this._inCollider(pr.pos) || this._nearAny(pr.pos, 1.0) || pr.pos.y < 0) {
          this._explode(pr, i);
          continue;
        }
      } else {
        // grenade
        pr.vel.y -= pr.gravity * dt;
        const step = pr.vel.clone().multiplyScalar(dt);
        pr.pos.add(step);
        pr.mesh.position.copy(pr.pos);
        pr.mesh.rotation.x += dt * 6;
        pr.mesh.rotation.z += dt * 4;
        if (pr.pos.y < 0.13) {
          pr.pos.y = 0.13;
          if (pr.vel.y < -1) { pr.vel.y = -pr.vel.y * 0.45; pr.vel.x *= 0.7; pr.vel.z *= 0.7; }
          else pr.vel.y = 0;
        }
        if (this._inCollider(pr.pos)) {
          // bounce off wall (simple: reverse horizontal)
          pr.vel.x *= -0.4; pr.vel.z *= -0.4; pr.vel.y *= 0.6;
        }
        pr.fuse -= dt;
        if (pr.fuse <= 0) {
          this._explode(pr, i);
          continue;
        }
      }
    }
  }

  _inCollider(pos) {
    for (const c of this.level.colliders) {
      if (pos.x > c.min.x && pos.x < c.max.x &&
          pos.y > c.min.y && pos.y < c.max.y &&
          pos.z > c.min.z && pos.z < c.max.z) return true;
    }
    return false;
  }

  _nearAny(pos, radius) {
    for (const e of this.enemies) {
      if (e.alive && e.pos.distanceTo(pos) < radius) return true;
    }
    if (this.player.alive && this.player.eyePos.distanceTo(pos) < radius + 0.5) return true;
    return false;
  }

  _explode(pr, index) {
    this.particles.explosion(pr.pos, pr.radius);
    audio.explosion();
    const attacker = { team: pr.team, name: pr.ownerName, isPlayer: pr.ownerIsPlayer, weaponId: pr.weaponId };
    // damage enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.getEyePos().distanceTo(pr.pos);
      if (d < pr.radius) {
        const fall = 1 - d / pr.radius;
        e.takeDamage(pr.damage * fall, attacker, false);
      }
    }
    // damage player
    if (this.player.alive) {
      const d = this.player.eyePos.distanceTo(pr.pos);
      if (d < pr.radius) {
        const fall = 1 - d / pr.radius;
        this.player.takeDamage(pr.damage * fall, pr.ownerName, pr.team, pr.pos);
      }
    }
    this.worldGroup.remove(pr.mesh);
    pr.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.projectiles.splice(index, 1);
  }

  // ---- Kill / death handling ----
  onKilled(enemy, attacker, headshot) {
    const killerName = attacker ? attacker.name : null;
    const killerTeam = attacker ? attacker.team : null;
    const weaponId = attacker ? attacker.weaponId : null;
    const killerIsPlayer = attacker && attacker.isPlayer;

    this.score.recordKill(killerName, enemy.name, headshot, weaponId, killerTeam);
    if (killerIsPlayer) {
      audio.kill();
      this.score.addHighlight(`${enemy.name} eliminated${headshot ? ' — HEADSHOT' : ''}`, 'KILL');
    }

    // drop pickup sometimes
    if (Math.random() < 0.3) {
      const t = Math.random() < 0.5 ? 'health' : 'ammo';
      this.pickups.push(new Pickup(this.worldGroup, { type: t, position: enemy.pos.clone() }));
    }

    // schedule respawn
    this.enemyRespawnTimers.push({ enemy, timer: this.deadEnemyDelay });
  }

  onPlayerKilled(killerName, killerTeam) {
    const victim = this.player;
    const weaponId = null;
    this.score.recordKill(killerName, victim.name, false, weaponId, killerTeam);
    this.score.addHighlight(`You were eliminated by ${killerName || 'the environment'}`, 'DEATH');

    // find killer enemy for kill cam
    let killer = null;
    if (killerName) {
      killer = this.enemies.find((e) => e.name === killerName) || null;
    }
    const kw = killer ? killer.weaponCfg.name : '';
    this.replay.start(killer, kw);
    this.hud.showRespawn(killerName, kw);
    this.player.hideViewmodels();

    this.state = 'dead';
    this.respawnTimer = SETTINGS.respawnTime;
  }

  _respawnPlayer() {
    const spawn = this.level.spawns[Math.floor(Math.random() * this.level.spawns.length)].clone();
    spawn.x += (Math.random() - 0.5) * 4;
    spawn.z += (Math.random() - 0.5) * 4;
    const yaw = Math.atan2(-spawn.x, -spawn.z);
    this.player.spawn(spawn, yaw);
    this.player.showViewmodels();
    this.hud.hideRespawn();
    this.replay.stop();
    audio.respawn();
    this.state = 'playing';
  }

  // ---- Objectives (domination) ----
  _updateObjectives(dt) {
    if (this.mode !== 'dom') return;
    const RADIUS = 4;
    for (const obj of this.objectives) {
      let blue = 0, red = 0, redName = '';
      if (this.player.alive) {
        const d = Math.hypot(this.player.pos.x - obj.pos.x, this.player.pos.z - obj.pos.z);
        if (d < RADIUS) blue++;
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.pos.x - obj.pos.x, e.pos.z - obj.pos.z);
        if (d < RADIUS) { if (e.team === 'red') { red++; redName = e.name; } else blue++; }
      }

      if (blue > 0 && red === 0) {
        if (obj.owner !== 'blue') {
          obj.progress += dt * 40;
          if (obj.progress >= 100) {
            obj.progress = 100; obj.owner = 'blue';
            this.score.recordCapture('blue', this.player.name);
            this.hud.showObjectiveBanner('OBJECTIVE CAPTURED');
            audio.capture();
          }
        } else {
          obj.holdTimer += dt;
          if (obj.holdTimer >= 1) { obj.holdTimer = 0; this.score.recordCaptureTick('blue'); }
        }
      } else if (red > 0 && blue === 0) {
        if (obj.owner !== 'red') {
          obj.progress += dt * 40;
          if (obj.progress >= 100) {
            obj.progress = 100; obj.owner = 'red';
            this.score.recordCapture('red', redName);
          }
        } else {
          obj.holdTimer += dt;
          if (obj.holdTimer >= 1) { obj.holdTimer = 0; this.score.recordCaptureTick('red'); }
        }
      }
      // color
      const c = obj.owner === 'blue' ? 0x39a0ff : obj.owner === 'red' ? 0xff4a3a : 0x888888;
      obj.ring.material.color.setHex(c);
      obj.beacon.material.color.setHex(c);
      const progressY = obj.owner ? 0.8 : 0.2 + (obj.progress / 100) * 3.0;
      obj.beacon.scale.y = Math.max(0.1, progressY / 4);
    }
  }

  // ================= Update =================
  _updateMatch(dt) {
    this.time += dt;
    if (this.state === 'playing' || this.state === 'dead') {
      this.timeLeft -= dt;
      // enemies
      for (const e of this.enemies) {
        if (e.alive) e.update(dt, this.time);
      }
      // respawn timers
      for (let i = this.enemyRespawnTimers.length - 1; i >= 0; i--) {
        const t = this.enemyRespawnTimers[i];
        t.timer -= dt;
        if (t.timer <= 0) {
          if (this.state !== 'end') t.enemy.respawn();
          this.enemyRespawnTimers.splice(i, 1);
        }
      }
      // projectiles
      this._updateProjectiles(dt);
      // objectives
      this._updateObjectives(dt);
      // pickups
      for (const pk of this.pickups) pk.update(dt, this.time);
      if (this.player.alive) {
        for (const pk of this.pickups) pk.tryPickup(this.player, audio);
      }
    }

    if (this.state === 'playing') {
      this.player.update(dt, this.time);
      this._checkWin(dt);
    } else if (this.state === 'dead') {
      this.respawnTimer -= dt;
      this.replay.update(dt);
      this.hud.updateRespawnCount(this.respawnTimer);
      if (this.respawnTimer <= 0) this._respawnPlayer();
    }

    this.particles.update(dt);
  }

  _checkWin(dt) {
    if (this.timeLeft <= 0) {
      const bs = this.score.teamScore.blue, rs = this.score.teamScore.red;
      if (this.mode === 'ffa') this._endMatch(this.score.getPlayerStats().kills >= SETTINGS.scoreLimitFFA);
      else this._endMatch(bs >= rs);
      return;
    }
    const limit = this.mode === 'tdm' ? SETTINGS.scoreLimitTDM : this.mode === 'dom' ? SETTINGS.scoreLimitDom : SETTINGS.scoreLimitFFA;
    if (this.mode === 'ffa') {
      if (this.score.getPlayerStats().kills >= SETTINGS.scoreLimitFFA) this._endMatch(true);
    } else {
      if (this.score.teamScore.blue >= limit) this._endMatch(true);
      else if (this.score.teamScore.red >= limit) this._endMatch(false);
    }
  }

  _endMatch(win) {
    this.state = 'end';
    this.input.unlock();
    audio.stopAmbient();
    this.hud.hide();
    this.hud.hideRespawn();
    this.hud.hideScoreboard();

    const title = document.getElementById('end-title');
    title.textContent = this.mode === 'ffa'
      ? (win ? 'MISSION COMPLETE' : 'K.I.A.')
      : (win ? 'VICTORY' : 'DEFEAT');
    title.style.color = win ? '#3dff6a' : '#ff5b3d';

    const s = this.score.getPlayerStats();
    const acc = this.score.accuracy;
    const statsEl = document.getElementById('end-stats');
    statsEl.innerHTML = `
      <div class="stat"><span>Kills</span><span>${s.kills}</span></div>
      <div class="stat"><span>Deaths</span><span>${s.deaths}</span></div>
      <div class="stat"><span>Assists</span><span>${s.assists}</span></div>
      <div class="stat"><span>Headshots</span><span>${s.headshots}</span></div>
      <div class="stat"><span>Accuracy</span><span>${acc.toFixed(1)}%</span></div>
      <div class="stat"><span>Damage Dealt</span><span>${s.damage}</span></div>
      <div class="stat"><span>Best Streak</span><span>${s.bestStreak}</span></div>
      <div class="stat"><span>Multikills</span><span>${s.multikills}</span></div>
      <div class="stat"><span>Score</span><span>${Math.floor(s.score)}</span></div>
      <div class="stat"><span>Team Score</span><span>${Math.floor(this.score.teamScore.blue)} - ${Math.floor(this.score.teamScore.red)}</span></div>
    `;

    const hl = document.getElementById('end-highlights');
    hl.innerHTML = '<h4 style="letter-spacing:2px;color:#9fb0c0;margin:8px 0">MATCH HIGHLIGHTS</h4>';
    if (this.score.highlights.length === 0) hl.innerHTML += '<div>No highlights recorded.</div>';
    for (const h of this.score.highlights) {
      hl.innerHTML += `<div><span class="hl-badge">${h.badge}</span>${h.text}</div>`;
    }

    document.getElementById('end-screen').classList.remove('hidden');
  }

  // ================= State transitions =================
  pause() {
    if (this.state !== 'playing' && this.state !== 'dead') return;
    this.state = 'paused';
    document.getElementById('pause-menu').classList.remove('hidden');
    this.hud.hideScoreboard();
  }

  resume() {
    this.state = 'playing';
    document.getElementById('pause-menu').classList.add('hidden');
    audio.ensure();
    this.input.lock();
  }

  quitToMenu() {
    this._clearScene();
    this.state = 'menu';
    audio.stopAmbient();
    this.hud.hide();
    this.hud.hideRespawn();
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    document.getElementById('scoreboard').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
  }

  _clearScene() {
    // remove weapon models from camera
    if (this.player) {
      for (const w of this.player.weapons) {
        this.camera.remove(w.model);
        w.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      }
    }
    this.player = null;
    this.enemies = [];
    this.pickups = [];
    this.projectiles = [];
    this.shootableParts = [];
    this.enemyRespawnTimers = [];
    this.objectives = [];
    this.level = null;
    this.navgrid = null;
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      this.worldGroup = null;
    }
    // reset background
    this.scene.background = new THREE.Color(0x0a0d12);
    this.scene.fog = null;
  }

  // ================= Loop =================
  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());

    // scoreboard toggle
    if (this.state === 'playing' && this.input.isDown('Tab')) {
      this.hud.showScoreboard(this.score.getScoreboard(), 'You');
    } else {
      this.hud.hideScoreboard();
    }

    if (this.state === 'playing' || this.state === 'dead') {
      this._updateMatch(dt);
      this.hud.update(this.player, this.score, this.timeLeft,
        { enemies: this.enemies }, this.level.objectives);
    } else if (this.state === 'paused') {
      // still animate particles so pause isn't jarring
      this.particles.update(dt);
    }

    this.hud.updateEffects(dt);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
}

// bootstrap
new Game();
