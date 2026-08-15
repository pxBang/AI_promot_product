import * as THREE from './three.module.js';
import { clamp, lerp, damp, rand } from './utils.js';
import { COLORS, DIFFICULTY, SURFACES } from './config.js';
import { getTrack } from './track.js';
import { Vehicle, makeCarSpec } from './physics.js';
import { Car } from './car.js';
import { AIController } from './ai.js';
import { ParticleSystem } from './particles.js';
import { Environment } from './weather.js';
import { Replay } from './replay.js';

const CAM_MODES = ['Chase', 'Hood', 'Orbit', 'Cinematic', 'TV'];

export class Game {
  constructor({ renderer, hud, audio, input, ui, save }) {
    this.renderer = renderer;
    this.hud = hud;
    this.audio = audio;
    this.input = input;
    this.ui = ui;
    this.save = save;

    this.scene = new THREE.Scene();
    this.environment = new Environment(this.scene, renderer);
    this.particles = new ParticleSystem(this.scene);
    this.replay = new Replay();

    this.cameras = [];
    this.camStates = [];
    this.camMode = 0;

    this.racers = [];
    this.order = [];
    this.track = null;
    this.raceTime = 0;
    this.state = 'countdown';
    this.stateTimer = 0;
    this.finished = false;
    this.elimTimer = 0;
    this.elimInterval = 12;
    this.resultsSent = false;

    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
  }

  // ------------------------------------------------------------------
  start(opts) {
    const {
      mode = 'quick', trackId, laps = 3, difficulty = 1, aiCount = 5,
      weather = 'clear', timeMode = 'day', players = 1,
    } = opts;

    this.mode = mode;
    this.laps = laps;
    this.difficulty = difficulty;
    this.playersCount = players;
    this.timeMode = timeMode;

    this.track = getTrack(trackId);
    this.track.build(this.scene);
    this.environment.setTime(timeMode);
    this.environment.setWeather(weather);

    // Build racers.
    this.racers = [];
    const spec = makeCarSpec(this.save.upgrades);
    const totalRacers = players + (mode === 'timetrial' ? 0 : aiCount);

    const addRacer = (isPlayer, playerIndex, color, name, difficultyIndex, aiSeed) => {
      const vehicle = new Vehicle(spec);
      const car = new Car({
        bodyHue: isPlayer ? (playerIndex === 0 ? this.save.paint.bodyHue : 30) : (difficultyIndex * 60 + aiSeed * 47) % 360,
        accentHue: isPlayer ? this.save.paint.accentHue : (difficultyIndex * 80 + 120) % 360,
      });
      car.group.castShadow = true;
      car.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(car.group);
      if (isPlayer) car.attachHeadlights();

      const controller = isPlayer
        ? { type: 'player', index: playerIndex }
        : { type: 'ai', ai: new AIController(difficultyIndex, aiSeed) };

      this.racers.push({
        vehicle, car, controller,
        isPlayer, playerIndex,
        name: isPlayer ? (playerIndex === 0 ? 'Player 1' : 'Player 2') : `AI ${name}`,
        color: color,
        lap: 0, gate: 0,
        lapStartTime: 0, lapTimeMs: 0, bestLapMs: null, lapTimes: [],
        finishTime: null, eliminated: false, finished: false,
        offTrackTime: 0, nitroFlash: 0,
      });
    };

    // Human players first (grid front), then AI (shuffled).
    for (let i = 0; i < players; i++) {
      addRacer(true, i, i === 0 ? COLORS.player : COLORS.player2, null, difficulty, i);
    }
    const aiNames = ['Blaze', 'Viper', 'Raptor', 'Nova', 'Phantom', 'Talon', 'Striker'];
    const aiOrder = Array.from({ length: aiCount }, (_, i) => i).sort(() => Math.random() - 0.5);
    for (let i = 0; i < aiCount; i++) {
      const aiSeed = aiOrder[i];
      addRacer(false, null, COLORS.ai[i % COLORS.ai.length], aiNames[i % aiNames.length], difficulty, aiSeed);
    }

    // Position on grid.
    this.racers.forEach((r, i) => {
      const slot = this.track.gridSlot(i, totalRacers);
      r.vehicle.reset(slot.pos, slot.heading);
      r.car.update(r.vehicle);
    });
    this._rankCars();

    // Ghost for time trial (in-session best lap).
    this.ghostCar = null;
    this.ghostFrames = [];
    this.currentLapFrames = [];
    this.ghostIndex = 0;
    if (mode === 'timetrial') {
      this.ghostCar = new Car({ bodyHue: 190, accentHue: 190, ghost: true });
      this.scene.add(this.ghostCar.group);
    }

    this._setupCameras();
    this.hud.setupPlayers(players);
    this.hud.show();

    this.state = 'countdown';
    this.stateTimer = 3.6;
    this.raceTime = 0;
    this.finished = false;
    this.resultsSent = false;
    this.elimTimer = this.elimInterval;
    this.replay.start(this.racers.length);

    // Minimap bounds (outline cached to avoid per-frame regeneration).
    const outline = this.track.outline;
    this._outline = outline;
    this.minimapBounds = outline.reduce((acc, [x, z]) => ({
      minx: Math.min(acc.minx, x), maxx: Math.max(acc.maxx, x),
      minz: Math.min(acc.minz, z), maxz: Math.max(acc.maxz, z),
    }), { minx: Infinity, minz: Infinity, maxx: -Infinity, maxz: -Infinity });

    this.audio.init();
  }

  _setupCameras() {
    this.cameras = [];
    this.camStates = [];
    for (let i = 0; i < this.playersCount; i++) {
      const cam = new THREE.PerspectiveCamera(68, 1, 0.1, 3000);
      cam.position.set(0, 5, -10);
      this.scene.add(cam);
      this.cameras.push(cam);
      this.camStates.push({ pos: new THREE.Vector3(0, 4, -10), look: new THREE.Vector3(0, 1, 0) });
    }
    this.camMode = 0;
  }

  // ------------------------------------------------------------------
  update(dt) {
    dt = Math.min(dt, 0.05);
    this._updateRaceState(dt);

    if (this.state === 'racing' || this.state === 'finished') {
      this._stepPhysics(dt);
      this._carCollisions(dt);
      this._checkObstacles(dt);
      this._updateRace(dt);
      this._emitParticles(dt);
      this.replay.addFrame(dt, this.racers.map((r) => r.vehicle));
    }

    this._updateCameras(dt);
    this._updateHUD();
    this._updateAudio(dt);
    this.environment.update(dt, this._focusPoint());
    this.particles.update(dt);

    // Headlights at night.
    for (const r of this.racers) {
      const on = this.environment.isNight;
      r.car.setLights(on || r.nitroFlash > 0, r.controller.type === 'player' ? this._isBraking(r) : false);
    }
  }

  _updateRaceState(dt) {
    if (this.state === 'countdown') {
      this.stateTimer -= dt;
      const n = Math.ceil(this.stateTimer - 0.6);
      if (n >= 1) this.ui.setCountdown(String(n));
      else if (n === 0) this.ui.setCountdown('GO!');
      if (this.stateTimer <= 0) {
        this.state = 'racing';
        this.ui.clearCountdown();
        this.ui.showToast('GO!', 900);
        this.racers.forEach((r) => { r.lapStartTime = this.raceTime; });
      }
      return;
    }
    if (this.state === 'racing') {
      this.raceTime += dt;
      if (this.mode === 'elimination') {
        this.elimTimer -= dt;
        if (this.elimTimer <= 0) {
          this.elimTimer = this.elimInterval;
          this._eliminateLast();
        }
      }
      if (this._allFinished() && !this.finished) {
        this.finished = true;
        this.state = 'finished';
        this.replay.stop();
        this._sendResults();
      }
    }
  }

  _stepPhysics(dt) {
    const surface = (x, z) => this.track.sampleSurface(x, z);
    for (const r of this.racers) {
      if (r.eliminated) continue;
      let input;
      if (r.controller.type === 'player') {
        input = this.input.getVehicleInput(r.controller.index);
      } else {
        input = r.controller.ai.update(r.vehicle, dt, {
          track: this.track,
          others: this.racers.filter((o) => o !== r && !o.eliminated).map((o) => ({ pos: o.vehicle.pos, speed: o.vehicle.speed })),
          playerDistance: this._playerDistance(r),
        });
      }
      r.vehicle.step(dt, input, surface);
      r.car.update(r.vehicle);

      // Off-track auto-recovery.
      const surf = surface(r.vehicle.pos.x, r.vehicle.pos.z);
      if (!surf.inRoad && Math.abs(surf.lateral) > 50) {
        r.offTrackTime += dt;
        if (r.offTrackTime > 3) { this._resetToTrack(r); r.offTrackTime = 0; }
      } else r.offTrackTime = 0;

      // Manual reset for player.
      if (r.isPlayer && this.input.resetPressed()) this._resetToTrack(r);
    }
  }

  _playerDistance(r) {
    // Distance (in metres, positive = AI ahead) between an AI and the leading player.
    const player = this.racers.find((o) => o.isPlayer && o.playerIndex === 0) || this.racers[0];
    const aiDist = this._progress(r);
    const pDist = this._progress(player);
    return aiDist - pDist;
  }

  _resetToTrack(r) {
    const idx = this.track.nearestIndex(r.vehicle.pos.x, r.vehicle.pos.z);
    const s = this.track.samples[idx];
    const pos = s.pos.clone();
    pos.y = this.track.sampleSurface(pos.x, pos.z).y + 0.85;
    r.vehicle.reset(pos, Math.atan2(s.fwd.x, s.fwd.z));
    r.car.update(r.vehicle);
  }

  _checkObstacles(dt) {
    for (const r of this.racers) {
      if (r.eliminated) continue;
      const v = r.vehicle;
      for (const o of this.track.obstacles) {
        const dx = v.pos.x - o.x, dz = v.pos.z - o.z;
        const dist = Math.hypot(dx, dz);
        if (dist > o.radius + 1.5) continue;
        const dy = v.pos.y - o.y;
        if (Math.abs(dy) > 2.5) continue;

        if (o.type === 'boost') {
          if (v.collided > 0) continue;
          v.nitro = 1;
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.quat);
          v.vel.addScaledVector(fwd, 12);
          this.particles.boostTrail(v.pos.clone().addScaledVector(fwd, -2), fwd);
          this.audio.whoosh();
          r.nitroFlash = 0.4;
          v.collided = 0.8;
        } else if (o.type === 'ramp') {
          if (v.vel.y < 3 && v.collided <= 0) {
            v.vel.y += 13 + v.speed * 0.3;
            v.collided = 0.5;
            this.audio.whoosh();
          }
        } else {
          // Cone / rock: bump.
          if (v.collided <= 0) {
            const push = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(v.speed * 0.4 + 4);
            push.y = 1.5;
            v.applyImpulse(push, v.pos);
            v.collided = 0.4;
            this.particles.sparks(new THREE.Vector3(o.x, o.y + 1, o.z), 10);
            this.audio.thud();
            // Knock the cone over.
            if (o.type === 'cone' && !o.mesh.userData.knocked) {
              o.mesh.userData.knocked = true;
              o.mesh.rotation.z = Math.sign(dx) * 1.2;
              o.mesh.position.y -= 0.3;
            }
          }
        }
      }
      if (r.nitroFlash > 0) r.nitroFlash -= dt;
    }
  }

  _carCollisions(dt) {
    const n = this.racers.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.racers[i], b = this.racers[j];
        if (a.eliminated || b.eliminated) continue;
        const dx = b.vehicle.pos.x - a.vehicle.pos.x;
        const dz = b.vehicle.pos.z - a.vehicle.pos.z;
        const dy = b.vehicle.pos.y - a.vehicle.pos.y;
        const dist = Math.hypot(dx, dz);
        const minDist = 2.2;
        if (dist < minDist && dist > 0.001 && Math.abs(dy) < 1.5) {
          const nx = dx / dist, nz = dz / dist;
          const overlap = minDist - dist;
          a.vehicle.pos.x -= nx * overlap * 0.5;
          a.vehicle.pos.z -= nz * overlap * 0.5;
          b.vehicle.pos.x += nx * overlap * 0.5;
          b.vehicle.pos.z += nz * overlap * 0.5;
          // Relative velocity impulse.
          const rvx = b.vehicle.vel.x - a.vehicle.vel.x;
          const rvz = b.vehicle.vel.z - a.vehicle.vel.z;
          const imp = (rvx * nx + rvz * nz) * 0.5;
          a.vehicle.vel.x += nx * imp * 0.6;
          a.vehicle.vel.z += nz * imp * 0.6;
          b.vehicle.vel.x -= nx * imp * 0.6;
          b.vehicle.vel.z -= nz * imp * 0.6;
          if (Math.abs(imp) > 3) this.audio.thud();
        }
      }
    }
  }

  _updateRace(dt) {
    const checkpoints = this.track.checkpointIndices();
    const N = this.track.samples.length;
    const gates = [...checkpoints, 0]; // finish line is index 0

    // Record time-trial lap path (for the ghost).
    if (this.mode === 'timetrial' && this.state === 'racing') {
      const p = this.racers[0].vehicle;
      const q = p.quat;
      this.currentLapFrames.push({ x: p.pos.x, y: p.pos.y, z: p.pos.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w });
    }
    // Advance ghost along recorded best lap.
    if (this.ghostCar && this.ghostFrames.length) {
      const f = this.ghostFrames[Math.min(this.ghostIndex, this.ghostFrames.length - 1)];
      this.ghostCar.group.position.set(f.x, f.y, f.z);
      this.ghostCar.group.quaternion.set(f.qx, f.qy, f.qz, f.qw);
      this.ghostIndex++;
    }

    for (const r of this.racers) {
      if (r.eliminated || r.finished) continue;
      const idx = this.track.nearestIndex(r.vehicle.pos.x, r.vehicle.pos.z);
      const gateIdx = gates[r.gate % gates.length];
      const dist = Math.min(Math.abs(idx - gateIdx), N - Math.abs(idx - gateIdx));
      if (dist <= 5) {
        r.gate++;
        if (r.gate % gates.length === 0) {
          // Completed a lap.
          const lapTime = this.raceTime - r.lapStartTime;
          r.lapTimeMs = lapTime;
          r.lapTimes.push(lapTime);
          const isNewBest = !r.bestLapMs || lapTime < r.bestLapMs;
          if (isNewBest) r.bestLapMs = lapTime;
          r.lap++;
          r.lapStartTime = this.raceTime;
          // Ghost: promote the fastest lap so far to the ghost line.
          if (this.mode === 'timetrial' && r.isPlayer) {
            if (isNewBest) this.ghostFrames = this.currentLapFrames;
            this.currentLapFrames = [];
            this.ghostIndex = 0;
          }
          if (r.lap >= this.laps) {
            r.finished = true;
            r.finishTime = this.raceTime;
            if (r.isPlayer) this.ui.showToast('🏁 Finish!', 1600);
          } else if (r.isPlayer) {
            this.ui.showToast(r.lap === this.laps - 1 ? 'FINAL LAP' : `Lap ${r.lap}/${this.laps}`, 1200);
            if (this.mode === 'timetrial') {
              if (r.bestLapMs) this.ui.showToast(`Best ${(r.bestLapMs / 1000).toFixed(3)}s`, 1400);
            }
          }
        }
      }
    }
    this._rankCars();
  }

  _rankCars() {
    const checkpoints = this.track.checkpointIndices();
    const numGates = checkpoints.length + 1;
    const N = this.track.samples.length;
    for (const r of this.racers) {
      const idx = this.track.nearestIndex(r.vehicle.pos.x, r.vehicle.pos.z);
      r._progress = (r.lap * numGates + (r.gate % numGates)) * N + idx;
    }
    const finished = this.racers.filter((r) => r.finished).sort((a, b) => a.finishTime - b.finishTime);
    const running = this.racers.filter((r) => !r.finished).sort((a, b) => b._progress - a._progress);
    this.order = [...finished, ...running];
    this.order.forEach((r, i) => { r.position = i; });
  }

  _eliminateLast() {
    const active = this.order.filter((r) => !r.eliminated && !r.finished);
    if (active.length <= 1) { this.finished = true; this.state = 'finished'; this.replay.stop(); this._sendResults(); return; }
    const last = active[active.length - 1];
    last.eliminated = true;
    this.ui.showToast(`${last.name} eliminated!`, 1600);
    if (last.isPlayer) last.car.setGhost(true);
  }

  _allFinished() {
    if (this.mode === 'elimination') {
      return this.racers.filter((r) => !r.eliminated).length <= 1;
    }
    const leader = this.order[0];
    if (leader && leader.finished) {
      const wait = this.raceTime - leader.finishTime;
      if (wait > 25 || this.racers.every((r) => r.finished || r.eliminated)) return true;
    }
    return false;
  }

  _progress(r) { return r._progress || 0; }

  _isBraking(r) {
    const inp = r.controller.type === 'player' ? this.input.getVehicleInput(r.controller.index) : { brake: 0 };
    return inp.brake > 0.1;
  }

  _sendResults() {
    if (this.resultsSent) return;
    this.resultsSent = true;
    const results = this.order.map((r) => ({
      name: r.name, color: r.color, isPlayer: r.isPlayer, playerIndex: r.playerIndex,
      finishTime: r.finishTime, bestLapMs: r.bestLapMs, eliminated: r.eliminated, laps: r.lap,
    }));
    setTimeout(() => this.ui.onFinish(results, {
      mode: this.mode, trackId: this.track.def.id, replay: this.replay,
      racers: this.racers.map((r) => ({ name: r.name, color: r.color, isPlayer: r.isPlayer, car: r.car, vehicle: r.vehicle })),
    }), 800);
  }

  // ------------------------------------------------------------------
  _focusPoint() {
    const p = this.racers[0];
    return p ? new THREE.Vector3(p.vehicle.pos.x, p.vehicle.pos.y, p.vehicle.pos.z) : new THREE.Vector3();
  }

  _updateCameras(dt) {
    const p0 = this.racers[0];
    if (!p0) return;
    const focus = p0.vehicle;
    for (let i = 0; i < this.playersCount; i++) {
      const r = this.racers[i];
      const cam = this.cameras[i];
      const st = this.camStates[i];
      const mode = CAM_MODES[this.camMode];
      const car = r.vehicle;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.quat);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(car.quat);
      const up = new THREE.Vector3(0, 1, 0);
      const t = this.raceTime;
      let targetPos, targetLook;

      switch (mode) {
        case 'Hood':
          targetPos = car.pos.clone().addScaledVector(fwd, 1.0).addScaledVector(up, 1.0);
          targetLook = car.pos.clone().addScaledVector(fwd, 12);
          break;
        case 'Orbit':
          targetPos = car.pos.clone().add(new THREE.Vector3(Math.cos(t * 0.6) * 9, 2.6, Math.sin(t * 0.6) * 9));
          targetLook = car.pos.clone();
          break;
        case 'Cinematic':
          targetPos = car.pos.clone().add(new THREE.Vector3(Math.cos(t * 0.18) * 16, 4.5, Math.sin(t * 0.18) * 16));
          targetLook = car.pos.clone().addScaledVector(up, 0.5);
          break;
        case 'TV':
          targetPos = car.pos.clone().addScaledVector(right, 16).addScaledVector(up, 5).addScaledVector(fwd, 8);
          targetLook = car.pos.clone().addScaledVector(up, 0.8);
          break;
        case 'Chase':
        default: {
          // Camera sits behind and above the car, looking at the car body so
          // the car stays centred on screen (with a little look-ahead).
          const speedFactor = clamp(car.speed / 40, 0, 1);
          const dist = 7.5 + speedFactor * 2.5;
          const height = 2.5 + speedFactor * 0.8;
          targetPos = car.pos.clone().addScaledVector(fwd, -dist).addScaledVector(up, height);
          targetLook = car.pos.clone().addScaledVector(fwd, 0.8).addScaledVector(up, 0.6);
          break;
        }
      }

      const k = 1 - Math.exp(-dt * 6);
      st.pos.lerp(targetPos, k);
      st.look.lerp(targetLook, k);
      cam.position.copy(st.pos);
      cam.lookAt(st.look);
    }
  }

  _emitParticles(dt) {
    for (const r of this.racers) {
      if (r.eliminated) continue;
      const v = r.vehicle;
      for (const w of v.wheels) {
        if (w.smoke > 0) {
          this.particles.smokePuff(w.worldPos, v.vel, w.smoke);
        }
      }
      // Exhaust.
      if (Math.random() < 0.5) {
        const rear = new THREE.Vector3(0, 0.45, -2.2).applyQuaternion(v.quat).add(v.pos);
        this.particles.exhaustPuff(rear, v.vel, v.nitroActive);
      }
      // Off-road dust.
      if (v.offRoad && v.speed > 6) {
        for (const w of v.wheels) if (w.grounded && Math.random() < 0.4) this.particles.dust(w.worldPos);
      }
      // Nitro trail.
      if (v.nitroActive) {
        const rear = new THREE.Vector3(0, 0.3, -2.0).applyQuaternion(v.quat).add(v.pos);
        this.particles.boostTrail(rear, v.vel);
      }
    }
  }

  _updateAudio(dt) {
    const p = this.racers[0];
    if (!p) return;
    const v = p.vehicle;
    const active = this.state === 'racing' || this.state === 'countdown';
    this.audio.setEngine(v.rpm, this._throttleOf(p), active);
    const slip = p.vehicle.wheels.reduce((s, w) => s + (w.smoke > 0 ? 1 : 0), 0);
    this.audio.setSkid(slip / 4);
  }

  _throttleOf(r) {
    const inp = r.controller.type === 'player' ? this.input.getVehicleInput(r.controller.index) : { throttle: 0 };
    return inp.throttle || 0;
  }

  _updateHUD() {
    const checkpoints = this.track.checkpointIndices();
    const numGates = checkpoints.length + 1;
    const players = this.racers.filter((r) => r.isPlayer);

    for (let i = 0; i < this.playersCount; i++) {
      const r = this.racers[i];
      this.hud.updatePlayer(i, {
        speedKmh: r.vehicle.speedKmh,
        posIndex: r.position,
        lap: Math.min(r.lap + 1, this.laps + (this.mode === 'timetrial' ? 1 : 0)),
        totalLaps: this.laps,
        lapTimeMs: this.raceTime - r.lapStartTime,
        bestLapMs: r.bestLapMs,
        message: r.eliminated ? 'ELIMINATED' : (r.finished ? 'FINISHED' : ''),
      });
    }

    // Ticker.
    this.hud.setTicker(this.order.map((r) => ({
      label: r.isPlayer ? `YOU${r.playerIndex === 1 ? '2' : ''}` : r.name,
      color: r.color, me: r.isPlayer, eliminated: r.eliminated,
    })));

    // Race info (single player).
    if (this.playersCount === 1) {
      this.hud.setRaceInfo({
        mode: this.mode === 'timetrial' ? 'TIME TRIAL' : this.mode === 'elimination' ? 'ELIMINATION' : 'RACE',
        lap: Math.min(this.racers[0].lap + 1, this.laps),
        totalLaps: this.laps,
        clockMs: this.raceTime * 1000,
        weather: this.environment.weatherLabel,
      });
    }

    // Minimap.
    const cars = this.racers.map((r) => ({ x: r.vehicle.pos.x, z: r.vehicle.pos.z, color: r.color }));
    const minimapData = { outline: this._outline, bounds: this.minimapBounds, cars };
    for (let i = 0; i < this.playersCount; i++) this.hud.updateMinimap(i, minimapData);
  }

  cycleCamera() {
    this.camMode = (this.camMode + 1) % CAM_MODES.length;
    this.ui.showToast(`Camera: ${CAM_MODES[this.camMode]}`, 900);
    return CAM_MODES[this.camMode];
  }

  get cameraModeLabel() { return CAM_MODES[this.camMode]; }

  // ------------------------------------------------------------------
  // Replay playback.
  // ------------------------------------------------------------------
  startReplay() {
    this.replaying = true;
    this.replayPlaying = true;
    this.replayTime = 0;
    this.replayBuffers = this.replay.makeBuffers(this.racers.length);
  }

  setReplayPlaying(p) { this.replayPlaying = p; }

  seekReplay(frac) {
    this.replayTime = clamp(frac, 0, 1) * this.replay.duration;
  }

  endReplay() { this.replaying = false; this.replayPlaying = false; }

  updateReplay(dt) {
    if (this.replayPlaying) {
      this.replayTime = Math.min(this.replayTime + dt, this.replay.duration);
    }
    const ok = this.replay.sample(this.replayTime, this.replayBuffers);
    if (!ok) return;

    const up = new THREE.Vector3(0, 1, 0);
    const steerQ = new THREE.Quaternion();
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      const b = this.replayBuffers[i];
      r.car.group.position.copy(b.pos);
      r.car.group.quaternion.copy(b.quat);
      for (let w = 0; w < 4; w++) {
        const local = r.vehicle.wheels[w].local;
        r.car.wheelHolders[w].position.copy(local).applyQuaternion(b.quat).add(b.pos);
        const steer = w < 2 ? b.steer : 0;
        steerQ.setFromAxisAngle(up, steer);
        r.car.wheelHolders[w].quaternion.copy(b.quat).multiply(steerQ);
        r.car.wheelMeshes[w].rotation.x = b.spins[w];
      }
    }

    const saved = this.raceTime;
    this.raceTime = this.replayTime;
    this._updateCameras(dt);
    this.raceTime = saved;

    this.environment.update(dt, this._focusPoint());
    this.particles.update(dt);
  }

  resize(w, h) {
    this.renderer.setSize(w, h);
  }

  render() {
    const w = this.renderer.domElement.width, h = this.renderer.domElement.height;
    if (this.playersCount === 1) {
      this.cameras[0].aspect = w / h;
      this.cameras[0].updateProjectionMatrix();
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.setScissor(0, 0, w, h);
      this.renderer.setScissorTest(true);
      this.renderer.render(this.scene, this.cameras[0]);
      this.renderer.setScissorTest(false);
    } else {
      const half = Math.floor(w / 2);
      for (let i = 0; i < 2; i++) {
        const cam = this.cameras[i];
        cam.aspect = half / h;
        cam.updateProjectionMatrix();
        this.renderer.setViewport(i * half, 0, half, h);
        this.renderer.setScissor(i * half, 0, half, h);
        this.renderer.setScissorTest(true);
        this.renderer.render(this.scene, cam);
      }
      this.renderer.setScissorTest(false);
    }
  }

  dispose() {
    this.replay.stop();
    this.track && this.track.dispose(this.scene);
    for (const r of this.racers) {
      this.scene.remove(r.car.group);
      r.car.group.traverse((o) => { if (o.isMesh) { o.geometry && o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose()); else o.material && o.material.dispose(); } });
    }
    if (this.ghostCar) this.scene.remove(this.ghostCar.group);
    this.particles.dispose(this.scene);
    this.racers = [];
  }
}
