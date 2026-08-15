import * as THREE from './three.module.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { AudioManager } from './audio.js';
import { Car } from './car.js';
import { TRACK_DEFS } from './track.js';
import { DEFAULT_SAVE, UPGRADES } from './config.js';
import { loadSave, persistSave, fmtTime, hslToHex, clamp } from './utils.js';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x0a0d16);

const input = new Input();
const audio = new AudioManager();
const hud = new HUD(document.getElementById('hud'));
let save = loadSave(DEFAULT_SAVE);

const menuEl = document.getElementById('menu');
const garageEl = document.getElementById('garage');
const resultsEl = document.getElementById('results');
const replayBar = document.getElementById('replay-bar');
const toastEl = document.getElementById('toast');
const countdownEl = document.getElementById('countdown');

let game = null;
let lastOpts = null;
let lastMeta = null;
let championship = null;

const ui = {
  showToast(text, ms = 1500) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(ui._t);
    ui._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
  },
  setCountdown(text) {
    countdownEl.textContent = text;
    countdownEl.classList.remove('hidden');
  },
  clearCountdown() { countdownEl.classList.add('hidden'); },
  onFinish(results, meta) { handleFinish(results, meta); },
};

// ---------------------------------------------------------------------------
// Menu setup
// ---------------------------------------------------------------------------
const trackSel = document.getElementById('sel-track');
TRACK_DEFS.forEach((t) => {
  const o = document.createElement('option');
  o.value = t.id; o.textContent = t.name;
  trackSel.appendChild(o);
});

function readOptions() {
  return {
    trackId: trackSel.value,
    laps: parseInt(document.getElementById('sel-laps').value, 10),
    difficulty: parseInt(document.getElementById('sel-difficulty').value, 10),
    aiCount: parseInt(document.getElementById('sel-ai').value, 10),
    weather: document.getElementById('sel-weather').value,
    timeMode: document.getElementById('sel-time').value,
  };
}

function hideAll() {
  menuEl.classList.add('hidden');
  garageEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  replayBar.classList.add('hidden');
  hud.hide();
}

function showMenu() {
  hideAll();
  menuEl.classList.remove('hidden');
}

function startGame(opts) {
  hideAll();
  if (game) { game.dispose(); game = null; }
  lastOpts = opts;
  game = new Game({ renderer, hud, audio, input, ui, save });
  game.start(opts);
}

// ---------------------------------------------------------------------------
// Results & championship
// ---------------------------------------------------------------------------
function handleFinish(results, meta) {
  lastMeta = meta;
  if (game) { game.state = 'finished'; }

  // Award credits.
  if (meta.mode !== 'timetrial') {
    results.forEach((r, i) => { if (r.isPlayer) save.credits += [1500, 900, 600, 400, 250, 150, 100, 50][i] || 0; });
    persistSave(save);
  } else if (results[0] && results[0].bestLapMs) {
    // Persist best lap per track.
    if (!save.bestLaps[meta.trackId] || results[0].bestLapMs < save.bestLaps[meta.trackId]) {
      save.bestLaps[meta.trackId] = results[0].bestLapMs;
      persistSave(save);
    }
  }

  if (meta.mode === 'championship') {
    championship = championship || { standings: {}, rounds: [] };
    const points = [10, 8, 6, 5, 4, 3, 2, 1];
    results.forEach((r, i) => {
      const key = r.name;
      championship.standings[key] = championship.standings[key] || { name: r.name, color: r.color, points: 0 };
      if (!r.eliminated) championship.standings[key].points += points[i] || 0;
    });
    championship.rounds.push(results);

    if (championship.rounds.length >= TRACK_DEFS.length) {
      showResults(results, meta, true);
    } else {
      const next = TRACK_DEFS[championship.rounds.length];
      ui.showToast(`Round ${championship.rounds.length + 1}: ${next.name}`, 1800);
      setTimeout(() => startGame({ ...lastOpts, mode: 'championship', trackId: next.id, laps: 2 }), 1800);
    }
    return;
  }
  showResults(results, meta, false);
}

function showResults(results, meta, finalChamp) {
  hideAll();
  resultsEl.classList.remove('hidden');
  const title = document.getElementById('results-title');
  const list = document.getElementById('results-list');
  const champBox = document.getElementById('championship-standings');

  if (meta.mode === 'championship') title.textContent = finalChamp ? 'CHAMPIONSHIP FINAL' : `ROUND ${championship.rounds.length} RESULTS`;
  else if (meta.mode === 'timetrial') title.textContent = 'TIME TRIAL';
  else if (meta.mode === 'elimination') title.textContent = 'ELIMINATION';
  else title.textContent = 'RACE RESULTS';

  list.innerHTML = '';
  results.forEach((r, i) => {
    const li = document.createElement('li');
    const time = meta.mode === 'timetrial'
      ? (r.bestLapMs ? fmtTime(r.bestLapMs) : '--')
      : r.eliminated ? 'ELIMINATED' : (r.finishTime ? fmtTime(r.finishTime * 1000) : 'DNF');
    const badge = `#${r.color.toString(16).padStart(6, '0')}`;
    li.innerHTML = `<span class="rname"><span class="badge" style="background:${badge}"></span> ${i + 1}. ${r.name}</span><span>${time}</span>`;
    list.appendChild(li);
  });

  champBox.classList.add('hidden');
  if (meta.mode === 'championship' && finalChamp) {
    champBox.classList.remove('hidden');
    const sorted = Object.values(championship.standings).sort((a, b) => b.points - a.points);
    champBox.innerHTML = '<h3>Championship Standings</h3><table><tr><th>Driver</th><th>Points</th></tr>' +
      sorted.map((s) => `<tr><td>${s.name}</td><td>${s.points}</td></tr>`).join('') + '</table>';
  }
}

// ---------------------------------------------------------------------------
// Replay playback
// ---------------------------------------------------------------------------
function startReplay() {
  if (!game || !lastMeta || !lastMeta.replay || lastMeta.replay.frameCount === 0) {
    ui.showToast('No replay data available', 1200);
    return;
  }
  resultsEl.classList.add('hidden');
  replayBar.classList.remove('hidden');
  game.startReplay();
  document.querySelector('#replay-bar [data-action="replay-play"]').textContent = '⏸';
  updateReplayCamLabel();
}

function updateReplayCamLabel() {
  document.querySelector('#replay-bar [data-action="replay-cam"]').textContent = `Cam: ${game.cameraModeLabel}`;
}

function exitReplay() {
  if (game) game.endReplay();
  replayBar.classList.add('hidden');
  resultsEl.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Garage
// ---------------------------------------------------------------------------
let garageRenderer = null, garageScene = null, garageCam = null, garageCar = null;
let garageRaf = null;

function openGarage() {
  hideAll();
  garageEl.classList.remove('hidden');
  if (!garageRenderer) initGarage();
  updateGarageUI();
  if (!garageRaf) {
    const loop = () => {
      if (garageCar) garageCar.group.rotation.y += 0.008;
      garageRenderer.render(garageScene, garageCam);
      garageRaf = requestAnimationFrame(loop);
    };
    garageRaf = requestAnimationFrame(loop);
  }
}

function initGarage() {
  const gcanvas = document.getElementById('garage-canvas');
  garageRenderer = new THREE.WebGLRenderer({ canvas: gcanvas, antialias: true });
  garageRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  garageRenderer.toneMapping = THREE.ACESFilmicToneMapping;

  garageScene = new THREE.Scene();
  garageScene.background = new THREE.Color(0x101522);
  garageCam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  garageCam.position.set(5.5, 2.4, 7.5);
  garageCam.lookAt(0, 0.7, 0);

  garageScene.add(new THREE.HemisphereLight(0xbfd9ff, 0x222228, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(5, 8, 4);
  garageScene.add(key);
  const rim = new THREE.DirectionalLight(0x21d4fd, 1.2);
  rim.position.set(-4, 2, -3);
  garageScene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshStandardMaterial({ color: 0x0c1019, roughness: 0.6, metalness: 0.3 })
  );
  floor.rotation.x = -Math.PI / 2;
  garageScene.add(floor);
  const grid = new THREE.GridHelper(18, 18, 0x223055, 0x131a2b);
  grid.position.y = 0.01;
  garageScene.add(grid);

  garageCar = new Car({ bodyHue: save.paint.bodyHue, accentHue: save.paint.accentHue });
  garageCar.group.position.y = 0.64; // rest wheels on the showroom floor
  garageScene.add(garageCar.group);

  resizeGarage();
}

function resizeGarage() {
  const wrap = document.getElementById('garage-canvas-wrap');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  garageRenderer.setSize(w, h, false);
  garageCam.aspect = w / h;
  garageCam.updateProjectionMatrix();
}

function updateGarageUI() {
  // Swatches.
  const swatchWrap = document.getElementById('paint-swatches');
  if (!swatchWrap.dataset.built) {
    swatchWrap.dataset.built = '1';
    [0, 30, 120, 180, 210, 260, 300, 340].forEach((h) => {
      const s = document.createElement('div');
      s.className = 'swatch';
      s.style.background = `#${hslToHex(h).toString(16).padStart(6, '0')}`;
      s.onclick = () => { save.paint.bodyHue = h; applyGaragePaint(); persistSave(save); };
      swatchWrap.appendChild(s);
    });
  }
  document.getElementById('paint-hue').value = save.paint.bodyHue;
  document.getElementById('accent-hue').value = save.paint.accentHue;

  // Upgrades.
  const upWrap = document.getElementById('upgrades');
  upWrap.innerHTML = `<div style="flex-basis:100%;font-weight:800;color:#ffd23f">Credits: $${save.credits.toLocaleString()}</div>`;
  for (const [id, u] of Object.entries(UPGRADES)) {
    const lvl = save.upgrades[id] || 0;
    const btn = document.createElement('div');
    btn.className = 'upgrade';
    btn.innerHTML = `<div>${u.name} <span class="lvl">Lv.${lvl}</span></div><div class="cost">${lvl >= u.max ? 'MAX' : `$${u.cost.toLocaleString()}`}</div><div style="font-size:11px;opacity:.6">${u.desc}</div>`;
    btn.onclick = () => buyUpgrade(id);
    upWrap.appendChild(btn);
  }
}

function applyGaragePaint() {
  if (garageCar) garageCar.setPaint(save.paint.bodyHue, save.paint.accentHue);
}

function buyUpgrade(id) {
  const u = UPGRADES[id];
  const lvl = save.upgrades[id] || 0;
  if (lvl >= u.max) return;
  if (save.credits < u.cost) { ui.showToast('Not enough credits!', 1200); return; }
  save.credits -= u.cost;
  save.upgrades[id] = lvl + 1;
  persistSave(save);
  updateGarageUI();
}

// Hue sliders.
document.getElementById('paint-hue').addEventListener('input', (e) => {
  save.paint.bodyHue = +e.target.value; applyGaragePaint(); persistSave(save);
});
document.getElementById('accent-hue').addEventListener('input', (e) => {
  save.paint.accentHue = +e.target.value; applyGaragePaint(); persistSave(save);
});

// ---------------------------------------------------------------------------
// Action handling (delegated)
// ---------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  switch (action) {
    case 'quick':
      audio.init();
      startGame({ ...readOptions(), mode: 'quick', players: 1 });
      break;
    case 'time-trial':
      audio.init();
      startGame({ ...readOptions(), mode: 'timetrial', aiCount: 0, players: 1 });
      break;
    case 'championship':
      audio.init();
      championship = null;
      startGame({ ...readOptions(), mode: 'championship', trackId: TRACK_DEFS[0].id, laps: 2 });
      break;
    case 'elimination':
      audio.init();
      startGame({ ...readOptions(), mode: 'elimination', players: 1 });
      break;
    case 'splitscreen':
      audio.init();
      startGame({ ...readOptions(), mode: 'splitscreen', players: 2 });
      break;
    case 'garage':
      openGarage();
      break;
    case 'back':
      if (garageRaf) { cancelAnimationFrame(garageRaf); garageRaf = null; }
      showMenu();
      break;
    case 'restart':
      if (lastOpts) startGame(lastOpts);
      break;
    case 'replay':
      startReplay();
      break;
    case 'menu':
      if (game) { game.dispose(); game = null; }
      showMenu();
      break;
    case 'replay-play': {
      const playing = game && game.replayPlaying;
      if (game) game.setReplayPlaying(!playing);
      btn.textContent = playing ? '▶' : '⏸';
      break;
    }
    case 'replay-cam':
      if (game) { game.cycleCamera(); updateReplayCamLabel(); }
      break;
    case 'replay-exit':
      exitReplay();
      break;
  }
});

document.getElementById('replay-scrub').addEventListener('input', (e) => {
  if (game && game.replaying) game.seekReplay(+e.target.value / 1000);
});

// Escape returns to menu.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (game && game.replaying) { exitReplay(); return; }
    if (game) { game.dispose(); game = null; }
    if (!menuEl.classList.contains('hidden') || !garageEl.classList.contains('hidden')) return;
    showMenu();
  }
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (game) {
    if (game.replaying) {
      game.updateReplay(dt);
      const scrub = document.getElementById('replay-scrub');
      scrub.value = Math.round((game.replayTime / Math.max(1, game.replay.duration)) * 1000);
    } else {
      game.update(dt);
      if (input.cameraPressed()) game.cycleCamera();
    }
    game.render();
  } else {
    renderer.clear();
  }

  input.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (game) game.resize(window.innerWidth, window.innerHeight);
  if (garageRenderer) resizeGarage();
});

// Initial state.
hud.hide();
showMenu();
