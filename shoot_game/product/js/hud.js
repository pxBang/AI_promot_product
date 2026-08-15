// hud.js — DOM HUD: health/ammo, inventory, kill feed, scoreboard, minimap, messages

import { WEAPONS } from './config.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      armorFill: document.getElementById('armor-fill'),
      armorText: document.getElementById('armor-text'),
      weaponName: document.getElementById('weapon-name'),
      ammoCount: document.getElementById('ammo-count'),
      hitmarker: document.getElementById('hitmarker'),
      damageOverlay: document.getElementById('damage-overlay'),
      lowHealth: document.getElementById('low-health-vignette'),
      centerMessage: document.getElementById('center-message'),
      objectiveBanner: document.getElementById('objective-banner'),
      killFeed: document.getElementById('kill-feed'),
      inventory: document.getElementById('inventory'),
      blueScore: document.getElementById('ts-blue-score'),
      redScore: document.getElementById('ts-red-score'),
      timer: document.getElementById('ts-timer'),
      minimap: document.getElementById('minimap-canvas'),
      respawnPanel: document.getElementById('respawn-panel'),
      respawnKiller: document.getElementById('respawn-killer'),
      respawnCount: document.getElementById('respawn-count'),
      killcamView: document.getElementById('killcam-view'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.level = null;
    this._damageTimer = 0;
    this._msgTimer = 0;
    this._bannerTimer = 0;
    this._hitTimer = 0;
  }

  setLevel(level) { this.level = level; }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  showHitMarker(headshot) {
    const hm = this.el.hitmarker;
    hm.textContent = headshot ? '✕✕' : '✕';
    hm.style.color = headshot ? '#ff2a2a' : '#ff5b3d';
    hm.classList.remove('hidden');
    // restart animation
    hm.style.animation = 'none';
    void hm.offsetWidth;
    hm.style.animation = '';
    this._hitTimer = 0.25;
  }

  showDamage(fromPos, playerPos, yaw) {
    this._damageTimer = 1;
  }

  centerMessage(type) {
    let text = '';
    if (type === 'health') text = '+50 HEALTH';
    else if (type === 'armor') text = '+50 ARMOR';
    else if (type === 'ammo') text = 'AMMO RESTOCKED';
    else if (type.startsWith('weapon:')) {
      const id = type.split(':')[1];
      text = `PICKED UP ${WEAPONS[id] ? WEAPONS[id].name : id}`;
    }
    if (!text) return;
    this.el.centerMessage.textContent = text;
    this.el.centerMessage.classList.add('show');
    this._msgTimer = 1.6;
  }

  showObjectiveBanner(text) {
    this.el.objectiveBanner.textContent = text;
    this.el.objectiveBanner.classList.add('show');
    this._bannerTimer = 3;
  }

  addKillFeed(entry) {
    if (!entry) return;
    const div = document.createElement('div');
    div.className = 'kf-entry';
    const kName = entry.killer || 'Environment';
    const vName = entry.victim;
    const kColor = entry.killerTeam === 'blue' ? 'kf-blue' : entry.killerTeam === 'red' ? 'kf-red' : 'kf-dim';
    const vColor = 'kf-dim';
    const weapon = entry.weapon ? ` [${entry.weapon.toUpperCase()}]` : '';
    div.innerHTML = `<span class="${kColor}">${kName}</span><span class="kf-dim"> ${entry.headshot ? '💀' : '>'} </span><span class="${vColor}">${vName}</span>${weapon}`;
    this.el.killFeed.appendChild(div);
    while (this.el.killFeed.children.length > 6) this.el.killFeed.removeChild(this.el.killFeed.firstChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
  }

  showRespawn(killerName, killerWeapon) {
    this.el.respawnPanel.classList.remove('hidden');
    this.el.respawnKiller.textContent = killerName ? `Killed by ${killerName}${killerWeapon ? ' — ' + killerWeapon : ''}` : 'Eliminated';
    this.el.killcamView.textContent = killerName ? 'KILL CAM ▶' : '';
  }

  updateRespawnCount(n) { this.el.respawnCount.textContent = Math.max(0, Math.ceil(n)); }

  hideRespawn() { this.el.respawnPanel.classList.add('hidden'); }

  update(player, score, timeLeft, entities, objectives) {
    // health / armor
    const hp = Math.max(0, Math.ceil(player.health));
    this.el.healthFill.style.width = (hp / player.maxHealth * 100) + '%';
    this.el.healthText.textContent = hp;
    this.el.healthFill.style.background = hp > 50 ? 'linear-gradient(90deg,#3dff6a,#2bc74f)'
      : hp > 25 ? 'linear-gradient(90deg,#ffd23a,#e0a000)' : 'linear-gradient(90deg,#ff4a3a,#c82818)';

    const ar = Math.max(0, Math.ceil(player.armor));
    this.el.armorFill.style.width = (ar / player.maxArmor * 100) + '%';
    this.el.armorText.textContent = ar;

    // weapon
    const w = player.currentWeapon;
    this.el.weaponName.textContent = w ? w.name : '';
    if (w && w.def.kind === 'melee') {
      this.el.ammoCount.textContent = 'MELEE';
      this.el.ammoCount.style.color = '#fff';
    } else if (w && w.def.magSize != null) {
      const reloading = w.reloading ? ' — RELOADING' : '';
      this.el.ammoCount.textContent = `${w.ammoInMag} / ${w.reserve}${reloading}`;
      this.el.ammoCount.style.color = w.ammoInMag === 0 ? '#ff5b3d' : '#fff';
    } else if (w) {
      this.el.ammoCount.textContent = player.grenadeCount > 0 ? `${player.grenadeCount} GRENADES` : '—';
    }

    // inventory
    const slots = this.el.inventory.querySelectorAll('.inv-slot');
    player.weapons.forEach((wp, i) => {
      const slot = slots[i];
      if (!slot) return;
      slot.querySelector('.inv-name').textContent = wp.name.split(' ')[0];
      slot.classList.toggle('active', i === player.currentIndex);
    });
    const gSlot = slots[4];
    if (gSlot) {
      gSlot.querySelector('.inv-name').textContent = `${player.grenadeCount} GRENADES`;
      gSlot.classList.toggle('active', false);
    }

    // scores / timer
    this.el.blueScore.textContent = Math.floor(score.teamScore.blue);
    this.el.redScore.textContent = Math.floor(score.teamScore.red);
    const m = Math.floor(timeLeft / 60);
    const s = Math.floor(timeLeft % 60);
    this.el.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;

    // kill feed
    while (score.killFeed.length) {
      this.addKillFeed(score.killFeed.shift());
    }

    // minimap
    this._drawMinimap(player, entities, objectives);

    // low health vignette
    const lp = hp / player.maxHealth;
    this.el.lowHealth.style.opacity = lp < 0.3 ? (0.3 - lp) * 2.5 : 0;
  }

  _drawMinimap(player, entities, objectives) {
    const ctx = this.mm;
    const S = 160;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(8,10,14,0.75)';
    ctx.fillRect(0, 0, S, S);

    if (!this.level) return;
    const scale = (S - 16) / this.level.size;
    const ox = S / 2, oz = S / 2;
    const tx = (x) => ox + x * scale;
    const tz = (z) => oz + z * scale;

    // walls
    ctx.fillStyle = 'rgba(120,130,145,0.55)';
    for (const c of this.level.colliders) {
      const w = (c.max.x - c.min.x) * scale;
      const h = (c.max.z - c.min.z) * scale;
      if (w > 30 || h > 30) continue; // skip perimeter
      ctx.fillRect(tx(c.min.x), tz(c.min.z), w, h);
    }

    // objectives
    if (objectives) {
      for (const o of objectives) {
        ctx.fillStyle = '#ffc93a';
        ctx.beginPath();
        ctx.arc(tx(o.x), tz(o.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // enemies
    for (const e of entities.enemies) {
      if (!e.alive) continue;
      ctx.fillStyle = e.team === 'blue' ? '#5bc9ff' : '#ff5b5b';
      ctx.beginPath();
      ctx.arc(tx(e.pos.x), tz(e.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // player arrow
    ctx.save();
    ctx.translate(tx(player.pos.x), tz(player.pos.z));
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -5); ctx.lineTo(3, 4); ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  updateEffects(dt) {
    if (this._damageTimer > 0) {
      this._damageTimer -= dt;
      this.el.damageOverlay.style.opacity = Math.max(0, this._damageTimer * 0.8);
    }
    if (this._hitTimer > 0) {
      this._hitTimer -= dt;
      if (this._hitTimer <= 0) this.el.hitmarker.classList.add('hidden');
    }
    if (this._msgTimer > 0) {
      this._msgTimer -= dt;
      if (this._msgTimer <= 0) this.el.centerMessage.classList.remove('show');
    }
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.el.objectiveBanner.classList.remove('show');
    }
  }

  showScoreboard(list, playerName) {
    const sb = document.getElementById('scoreboard');
    sb.classList.remove('hidden');
    const tbody = sb.querySelector('tbody');
    tbody.innerHTML = '';
    for (const s of list) {
      const tr = document.createElement('tr');
      if (s.name === playerName) tr.className = 'me';
      const teamTag = s.team === 'blue' ? '🔵' : s.team === 'red' ? '🔴' : '⚪';
      tr.innerHTML = `<td>${teamTag} ${s.name}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${s.assists}</td><td>${Math.floor(s.score)}</td>`;
      tbody.appendChild(tr);
    }
  }
  hideScoreboard() { document.getElementById('scoreboard').classList.add('hidden'); }
}
