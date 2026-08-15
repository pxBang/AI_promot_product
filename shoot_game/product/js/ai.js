// ai.js — navigation grid (A* pathfinding) + enemy combat AI

import * as THREE from 'three';

// ---- A* navigation grid over the level floor ----
export class NavGrid {
  constructor(levelSize, colliders, cellSize = 2) {
    this.cellSize = cellSize;
    this.half = levelSize / 2;
    this.cols = Math.ceil(levelSize / cellSize);
    this.rows = Math.ceil(levelSize / cellSize);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this._build(colliders);
  }

  _build(colliders) {
    const margin = 0.9; // half body width
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.worldX(c), z = this.worldZ(r);
        for (const cb of colliders) {
          if (x > cb.min.x - margin && x < cb.max.x + margin &&
              z > cb.min.z - margin && z < cb.max.z + margin) {
            this.blocked[r * this.cols + c] = 1;
            break;
          }
        }
      }
    }
  }

  worldX(col) { return -this.half + col * this.cellSize + this.cellSize / 2; }
  worldZ(row) { return -this.half + row * this.cellSize + this.cellSize / 2; }
  colAt(x) { return Math.floor((x + this.half) / this.cellSize); }
  rowAt(z) { return Math.floor((z + this.half) / this.cellSize); }

  inBounds(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
  idx(c, r) { return r * this.cols + c; }
  isBlocked(c, r) {
    if (!this.inBounds(c, r)) return true;
    return this.blocked[r * this.cols + c] === 1;
  }
  isWalkableWorld(x, z) {
    if (Math.abs(x) > this.half || Math.abs(z) > this.half) return false;
    return !this.isBlocked(this.colAt(x), this.rowAt(z));
  }

  findPath(from, to) {
    const start = { c: this.colAt(from.x), r: this.rowAt(from.z) };
    const goal = { c: this.colAt(to.x), r: this.rowAt(to.z) };
    if (!this.inBounds(start.c, start.r) || !this.inBounds(goal.c, goal.r)) return null;
    if (this.isBlocked(start.c, start.r)) return null;

    const open = [];
    const gScore = new Map();
    const cameFrom = new Map();
    const key = (c, r) => r * this.cols + c;
    const h = (c, r) => Math.abs(c - goal.c) + Math.abs(r - goal.r);

    const sk = key(start.c, start.r);
    gScore.set(sk, 0);
    open.push({ c: start.c, r: start.r, f: h(start.c, start.r) });
    const closed = new Set();

    let iter = 0;
    while (open.length && iter++ < 4000) {
      // pop lowest f
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.c, cur.r);
      if (closed.has(ck)) continue;
      closed.add(ck);

      if (cur.c === goal.c && cur.r === goal.r) {
        // reconstruct
        const path = [];
        let node = ck;
        while (node != null) {
          const r = Math.floor(node / this.cols);
          const c = node - r * this.cols;
          path.push(new THREE.Vector3(this.worldX(c), 0, this.worldZ(r)));
          node = cameFrom.get(node);
        }
        path.reverse();
        return path;
      }

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = cur.c + dc, nr = cur.r + dr;
          if (this.isBlocked(nc, nr)) continue;
          // no corner cutting
          if (dc !== 0 && dr !== 0 && (this.isBlocked(cur.c + dc, cur.r) || this.isBlocked(cur.c, cur.r + dr))) continue;
          const nk = key(nc, nr);
          if (closed.has(nk)) continue;
          const step = (dc !== 0 && dr !== 0) ? 1.414 : 1;
          const tentative = (gScore.get(ck) || 0) + step;
          if (tentative < (gScore.get(nk) || Infinity)) {
            gScore.set(nk, tentative);
            cameFrom.set(nk, ck);
            open.push({ c: nc, r: nr, f: tentative + h(nc, nr) });
          }
        }
      }
    }
    return null;
  }
}

// ---- Bot weapon presets ----
export const BOT_WEAPONS = [
  { id: 'botRifle', name: 'AR-15', damage: 8, fireRate: 460, spread: 0.022, range: 90, pellets: 1, burst: [3, 6], reload: 1.7 },
  { id: 'botSmg', name: 'SMG', damage: 6, fireRate: 700, spread: 0.032, range: 50, pellets: 1, burst: [4, 9], reload: 1.4 },
  { id: 'botShotgun', name: 'SHOTGUN', damage: 7, fireRate: 70, spread: 0.05, range: 26, pellets: 6, burst: [1, 1], reload: 2.0 },
  { id: 'botSniper', name: 'SNIPER', damage: 55, fireRate: 45, spread: 0.002, range: 220, pellets: 1, burst: [1, 1], reload: 2.4 },
];

export class Enemy {
  constructor(ctx, opts) {
    this.ctx = ctx;
    this.name = opts.name || 'Soldier';
    this.team = opts.team;
    this.weaponCfg = opts.weapon;
    this.spawn = opts.spawn.clone();

    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.pos = opts.spawn.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.speed = 3.4 + Math.random() * 1.2;

    this.state = 'patrol';
    this.stateTimer = Math.random() * 2;
    this.path = null;
    this.pathIndex = 0;
    this.target = null; // { position, team, alive, isPlayer, ref }
    this.targetPoint = null;
    this.patrolPoint = null;
    this.fireCooldown = 0;
    this.burstRemaining = this._burstLen();
    this.reloadTimer = 0;
    this.aimError = 0;
    this.hitFlash = 0;
    this.history = [];
    this._firing = false;
    this._repathTimer = 0;
    this._stuckTimer = 0;

    this._buildMesh();
  }

  _buildMesh() {
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    const teamColor = this.team === 'blue' ? 0x2f6fd0 : 0xc9342f;
    const bodyMat = new THREE.MeshStandardMaterial({ color: teamColor, metalness: 0.2, roughness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22252a, metalness: 0.3, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a27a, roughness: 0.9 });
    const teamGlow = new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.25 });

    this.parts = [];
    const tag = (m, part) => { m.userData = { enemy: this, part }; this.parts.push(m); };

    // legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.24);
    const legL = new THREE.Mesh(legGeo, darkMat); legL.position.set(-0.14, 0.35, 0); this.group.add(legL); tag(legL, 'limb');
    const legR = new THREE.Mesh(legGeo, darkMat); legR.position.set(0.14, 0.35, 0); this.group.add(legR); tag(legR, 'limb');

    // torso
    this.torso = new THREE.Group(); this.torso.position.y = 0.9;
    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.3), bodyMat); this.torso.add(torsoMesh); tag(torsoMesh, 'body');
    // vest accent
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.34), teamGlow); vest.position.y = -0.02; this.torso.add(vest); tag(vest, 'body');
    this.group.add(this.torso);

    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skinMat);
    head.position.y = 1.62; this.group.add(head); tag(head, 'head');
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), bodyMat);
    helmet.position.y = 1.66; this.group.add(helmet);

    // arms + gun
    this.armGroup = new THREE.Group(); this.armGroup.position.set(0, 1.15, 0.18);
    const armGeo = new THREE.BoxGeometry(0.14, 0.42, 0.14);
    const armL = new THREE.Mesh(armGeo, bodyMat); armL.position.set(-0.28, -0.1, 0); this.armGroup.add(armL); tag(armL, 'limb');
    const armR = new THREE.Mesh(armGeo, bodyMat); armR.position.set(0.28, -0.1, 0); this.armGroup.add(armR); tag(armR, 'limb');
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.6), darkMat); gun.position.set(0, -0.05, 0.28); this.armGroup.add(gun);
    this.gunMesh = gun;
    this.torso.add(this.armGroup);

    this.ctx.scene.add(this.group);
  }

  getParts() { return this.parts; }
  getPosition() { return this.pos; }
  getEyePos() { return new THREE.Vector3(this.pos.x, 1.5, this.pos.z); }

  record(time) {
    this.history.push({ t: time, x: this.pos.x, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, firing: this._firing });
    if (this.history.length > 400) this.history.shift();
  }

  _findTarget() {
    const me = this.pos;
    const candidates = [];
    // player
    const p = this.ctx.player;
    if (p && p.alive && p.team !== this.team) {
      candidates.push({ pos: p.pos, team: p.team, alive: true, isPlayer: true, ref: p, eye: p.eyeY });
    }
    // enemies of other teams
    for (const e of this.ctx.enemies) {
      if (e === this || !e.alive || e.team === this.team) continue;
      candidates.push({ pos: e.pos, team: e.team, alive: true, isPlayer: false, ref: e });
    }
    let best = null, bestD = Infinity;
    for (const c of candidates) {
      const d = c.pos.distanceToSquared(me);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  _hasLOS(pos) {
    return this.ctx.raycastLOS(this.getEyePos(), pos);
  }

  _moveToward(point, dt) {
    const dir = new THREE.Vector3(point.x - this.pos.x, 0, point.z - this.pos.z);
    const dist = dir.length();
    if (dist < 0.3) return true;
    dir.normalize();
    const step = this.speed * dt;
    const next = this.pos.clone().addScaledVector(dir, Math.min(step, dist));
    // simple collision: keep inside nav walkable area
    if (this.ctx.navgrid.isWalkableWorld(next.x, next.z)) {
      this.pos.copy(next);
    } else {
      // try sliding on one axis
      const nx = new THREE.Vector3(next.x, 0, this.pos.z);
      if (this.ctx.navgrid.isWalkableWorld(nx.x, nx.z)) this.pos.copy(nx);
      else {
        const nz = new THREE.Vector3(this.pos.x, 0, next.z);
        if (this.ctx.navgrid.isWalkableWorld(nz.x, nz.z)) this.pos.copy(nz);
      }
    }
    // face movement direction
    const targetYaw = Math.atan2(dir.x, dir.z);
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 10);
    return dist < 0.3;
  }

  _fire(dt) {
    this.fireCooldown -= dt;
    if (this.reloadTimer > 0) { this.reloadTimer -= dt; this._firing = false; return; }
    if (this.fireCooldown > 0) return;

    const t = this.target;
    const eye = this.getEyePos();
    const targetEye = t.isPlayer ? new THREE.Vector3(t.pos.x, t.eyeY || 1.5, t.pos.z) : new THREE.Vector3(t.pos.x, 1.4, t.pos.z);
    const dir = targetEye.clone().sub(eye).normalize();

    // aim error increases with distance and player speed
    const dist = eye.distanceTo(targetEye);
    this.aimError = this.weaponCfg.spread + dist * 0.0006 + (t.isPlayer && this.ctx.player.isMoving ? 0.02 : 0);

    const pellets = this.weaponCfg.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * this.aimError * 2;
      d.y += (Math.random() - 0.5) * this.aimError * 2;
      d.z += (Math.random() - 0.5) * this.aimError * 2;
      d.normalize();
      this.ctx.enemyShot(eye, d, this);
    }

    this._firing = true;
    this.fireCooldown = 1 / (this.weaponCfg.fireRate / 60);
    this.burstRemaining--;
    if (this.burstRemaining <= 0) {
      this.reloadTimer = this.weaponCfg.reload;
      this.burstRemaining = this._burstLen();
    }
  }

  _burstLen() {
    const [a, b] = this.weaponCfg.burst;
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  update(dt, time) {
    if (!this.alive) return;
    this.record(time);
    this._firing = false;
    this.stateTimer -= dt;

    // muzzle flash / tracer handled inside _fire via enemyShot

    const t = this._findTarget();
    const hasTarget = t != null;
    const distToTarget = hasTarget ? this.pos.distanceTo(t.pos) : Infinity;
    // line-of-sight should be checked against eye/chest height, not the feet (which would graze the floor)
    const targetEye = hasTarget ? new THREE.Vector3(t.pos.x, t.isPlayer ? (t.eyeY || 1.5) : 1.4, t.pos.z) : null;
    const canSee = hasTarget && distToTarget < this.weaponCfg.range && this._hasLOS(targetEye);

    // state transitions
    if (hasTarget && canSee && distToTarget < 35) {
      this.state = 'attack';
    } else if (hasTarget && (canSee || distToTarget < 50)) {
      this.state = 'chase';
    } else if (hasTarget) {
      this.state = 'chase';
    } else {
      this.state = 'patrol';
    }

    switch (this.state) {
      case 'patrol': {
        if (!this.patrolPoint || this.stateTimer <= 0) {
          const angle = Math.random() * Math.PI * 2;
          const d = 8 + Math.random() * 16;
          this.patrolPoint = new THREE.Vector3(
            this.spawn.x + Math.cos(angle) * d, 0, this.spawn.z + Math.sin(angle) * d
          );
          this.stateTimer = 4 + Math.random() * 4;
        }
        this._followPath(this.patrolPoint, dt);
        break;
      }
      case 'chase': {
        this.target = t;
        this._followPath(t.pos, dt);
        // fire while chasing if in range & visible
        if (canSee && distToTarget < this.weaponCfg.range) this._fire(dt);
        break;
      }
      case 'attack': {
        this.target = t;
        this._faceTarget(t, dt);
        // strafe
        if (this.stateTimer <= 0) {
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
          this.stateTimer = 0.6 + Math.random() * 1.2;
        }
        const strafe = this.strafeDir || 1;
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(strafe);
        const next = this.pos.clone().addScaledVector(right, this.speed * 0.6 * dt);
        if (this.ctx.navgrid.isWalkableWorld(next.x, next.z) && distToTarget > 5) this.pos.copy(next);
        this._fire(dt);
        break;
      }
    }

    // separation from other enemies
    for (const e of this.ctx.enemies) {
      if (e === this || !e.alive) continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.2 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (1.1 - d) * 0.5;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
      }
    }

    // apply transform
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw;
    this.torso.rotation.x = THREE.MathUtils.clamp(-this.pitch * 0.5, -0.7, 0.7);
  }

  _faceTarget(t, dt) {
    const dir = new THREE.Vector3(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize();
    const targetYaw = Math.atan2(dir.x, dir.z);
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 8);
    if (t.isPlayer) this.pitch = Math.atan2((t.eyeY || 1.5) - 1.5, this.pos.distanceTo(t.pos));
  }

  _followPath(target, dt) {
    this._repathTimer -= dt;
    if (!this.path || this._repathTimer <= 0) {
      this._repathTimer = 0.4 + Math.random() * 0.3;
      this.path = this.ctx.navgrid.findPath(this.pos, target);
      this.pathIndex = 0;
      this._stuckTimer = 0;
    }
    if (!this.path || this.path.length === 0) return;
    // advance to nearest reachable waypoint
    while (this.pathIndex < this.path.length - 1 &&
           this.pos.distanceTo(this.path[this.pathIndex]) < 1.5) {
      this.pathIndex++;
    }
    const wp = this.path[this.pathIndex];
    const arrived = this._moveToward(wp, dt);
    if (arrived) this._stuckTimer += dt;
  }

  takeDamage(amount, attacker, headshot) {
    if (!this.alive) return;
    this.health -= amount;
    this.hitFlash = 1;
    const eye = this.getEyePos();
    const dir = new THREE.Vector3(Math.random() - 0.5, 0.2, Math.random() - 0.5).normalize();
    this.ctx.particles.blood(eye.clone(), dir);
    if (this.health <= 0) this.die(attacker, headshot);
  }

  die(attacker, headshot) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    // fall over
    this.group.rotation.x = -Math.PI / 2;
    this.group.rotation.z = (Math.random() - 0.5) * 0.6;
    this.group.position.y = -0.4;
    this.ctx.onKilled(this, attacker, headshot);
    // hide parts from raycast
    for (const p of this.parts) p.visible = false;
  }

  respawn() {
    this.alive = true;
    this.health = this.maxHealth;
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.yaw = Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.group.position.set(this.spawn.x, 0, this.spawn.z);
    this.group.rotation.set(0, this.yaw, 0);
    this.torso.rotation.x = 0;
    this.state = 'patrol';
    this.stateTimer = Math.random() * 2;
    this.path = null;
    this.target = null;
    this.patrolPoint = null;
    this.history = [];
    this._firing = false;
    for (const p of this.parts) p.visible = true;
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
