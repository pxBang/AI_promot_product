import { fmtTime, fmtClock } from './utils.js';

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export class HUD {
  constructor(root) {
    this.root = root;
    this.players = [];
    this.minimaps = [];
    this.raceInfoEl = null;
    this.tickerEl = null;
    this._build();
  }

  _build() {
    this.root.innerHTML = '';
    this.raceInfoEl = document.createElement('div');
    this.raceInfoEl.className = 'race-info hidden';
    this.raceInfoEl.innerHTML = `
      <span class="mode"></span>
      <span class="laps">Lap 1/1</span>
      <span class="clock">00:00.0</span>
      <span class="weather-ico">☀</span>`;
    this.root.appendChild(this.raceInfoEl);

    this.tickerEl = document.createElement('div');
    this.tickerEl.id = 'ticker';
    this.root.appendChild(this.tickerEl);
  }

  setupPlayers(count) {
    // Remove old player HUDs.
    for (const p of this.players) p.el.remove();
    this.players = [];
    this.minimaps.forEach((m) => m.canvas.remove());
    this.minimaps = [];

    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = `hud-player p${i}`;
      el.innerHTML = `
        <div class="hud-speed"><span class="val">0</span> <span class="unit">km/h</span></div>
        <div class="speed-bar-wrap"><div class="speed-bar"></div></div>
        <div class="hud-sub"><span class="pos">1st</span> · <span class="lap">Lap 1/1</span></div>
        <div class="hud-time">Lap --:--.---</div>
        <div class="hud-best">Best --:--.---</div>
        <div class="hud-controls">${i === 0
          ? 'W 油门 · S 刹车 · A/D 转向 · 空格 手刹 · Shift 氮气 · C 视角 · R 复位'
          : '↑ 油门 · ↓ 刹车 · ←/→ 转向 · / 手刹 · Enter 氮气'}</div>
        <div class="hud-message"></div>`;
      this.root.appendChild(el);

      const mm = document.createElement('canvas');
      // Single player: minimap top-right (balances the left-side speed HUD).
      // Split screen: p0 left, p1 right (one per viewport).
      mm.className = `minimap p${i}${count === 1 && i === 0 ? ' right' : ''}`;
      mm.width = 190; mm.height = 190;
      this.root.appendChild(mm);

      this.players.push({
        el,
        speed: el.querySelector('.val'),
        bar: el.querySelector('.speed-bar'),
        pos: el.querySelector('.pos'),
        lap: el.querySelector('.lap'),
        time: el.querySelector('.hud-time'),
        best: el.querySelector('.hud-best'),
        msg: el.querySelector('.hud-message'),
      });
      this.minimaps.push({ canvas: mm, ctx: mm.getContext('2d'), outline: null, bounds: null });
    }
    this.raceInfoEl.classList.toggle('hidden', count > 1);
  }

  setRaceInfo({ mode, lap, totalLaps, clockMs, weather }) {
    if (!this.raceInfoEl) return;
    this.raceInfoEl.querySelector('.mode').textContent = mode || '';
    this.raceInfoEl.querySelector('.laps').textContent = `Lap ${lap}/${totalLaps}`;
    this.raceInfoEl.querySelector('.clock').textContent = fmtClock(clockMs);
    this.raceInfoEl.querySelector('.weather-ico').textContent = weather || '☀';
  }

  setTicker(items) {
    if (!this.tickerEl) return;
    this.tickerEl.innerHTML = '';
    for (const it of items) {
      const s = document.createElement('span');
      s.className = 'tick' + (it.me ? ' me' : '') + (it.eliminated ? ' elim' : '');
      s.style.color = it.color ? '#' + it.color.toString(16).padStart(6, '0') : '#fff';
      s.textContent = it.label;
      this.tickerEl.appendChild(s);
    }
  }

  updatePlayer(i, d) {
    const p = this.players[i];
    if (!p) return;
    p.speed.textContent = Math.round(d.speedKmh || 0);
    p.bar.style.width = Math.min(100, ((d.speedKmh || 0) / 260) * 100) + '%';
    p.pos.textContent = ordinal(d.posIndex + 1);
    p.lap.textContent = `Lap ${d.lap}/${d.totalLaps}`;
    p.time.textContent = `Lap ${fmtTime(d.lapTimeMs)}`;
    p.best.textContent = d.bestLapMs ? `Best ${fmtTime(d.bestLapMs)}` : 'Best --:--.---';
    p.msg.textContent = d.message || '';
  }

  // minimap: { outline:[[x,z]], cars:[{x,z,color}], bounds:{minx,minz,maxx,maxz} }
  updateMinimap(i, data) {
    const m = this.minimaps[i];
    if (!m || !data) return;
    const ctx = m.ctx, W = m.canvas.width, H = m.canvas.height;
    const pad = 14;
    if (!m.outline || m.outline !== data.outline) {
      m.outline = data.outline;
      m.bounds = data.bounds;
      ctx.clearRect(0, 0, W, H);
      const { minx, minz, maxx, maxz } = data.bounds;
      const spanX = Math.max(1e-3, maxx - minx), spanZ = Math.max(1e-3, maxz - minz);
      const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanZ);
      const ox = (W - spanX * scale) / 2, oz = (H - spanZ * scale) / 2;
      m.scale = scale; m.ox = ox; m.oz = oz;
      const px = (x) => ox + (x - minx) * scale;
      const pz = (z) => oz + (z - minz) * scale;

      ctx.strokeStyle = 'rgba(150,180,255,0.85)';
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      data.outline.forEach(([x, z], idx) => {
        if (idx === 0) ctx.moveTo(px(x), pz(z)); else ctx.lineTo(px(x), pz(z));
      });
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20,26,40,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Start marker.
      const s0 = data.outline[0];
      ctx.fillStyle = '#fff';
      ctx.fillRect(px(s0[0]) - 3, pz(s0[1]) - 3, 6, 6);
    }

    // Redraw cars on a cached background.
    if (!m.bg) {
      m.bg = document.createElement('canvas');
      m.bg.width = W; m.bg.height = H;
      m.bg.getContext('2d').drawImage(m.canvas, 0, 0);
    }
    ctx.drawImage(m.bg, 0, 0);
    const px = (x) => m.ox + (x - m.bounds.minx) * m.scale;
    const pz = (z) => m.oz + (z - m.bounds.minz) * m.scale;
    for (const c of data.cars) {
      ctx.beginPath();
      ctx.arc(px(c.x), pz(c.z), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#' + (c.color || 0xffffff).toString(16).padStart(6, '0');
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
  reset() { this.raceInfoEl.classList.add('hidden'); if (this.tickerEl) this.tickerEl.innerHTML = ''; }
}
