import { clamp, lerp } from './utils.js';
import { DIFFICULTY } from './config.js';

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// A simple racing AI: follows the racing line, modulates speed by corner
// curvature, avoids collisions, and rubber-bands to the difficulty preset.
export class AIController {
  constructor(difficultyIndex = 1, seed = 0) {
    this.diff = DIFFICULTY[clamp(difficultyIndex, 0, DIFFICULTY.length - 1)];
    this.seed = seed;
    this.speed = 0;
    this.lookahead = 12;          // metres, grows with speed
    this.overtakeTimer = 0;
    this.wander = (Math.sin(seed * 12.9898) * 43758.5453) % 1;
  }

  update(vehicle, dt, ctx) {
    const { track, others, raceDistance } = ctx;
    const skill = this.diff.skill;
    const i = track.nearestIndex(vehicle.pos.x, vehicle.pos.z);
    const N = track.samples.length;

    // Lookahead grows with speed.
    const look = this.lookahead + vehicle.speed * 0.55;
    const lookIdx = (i + Math.round(look / this._avgSeg(track))) % N;
    const target = track.samples[lookIdx].pos;

    // Desired heading toward lookahead point (with slight inside-line offset).
    const s = track.samples[i];
    const desired = Math.atan2(target.x - vehicle.pos.x, target.z - vehicle.pos.z);
    const headingErr = wrapAngle(desired - vehicle.heading);

    // Curvature of the road ahead → target corner speed.
    const curvature = this._curvatureAhead(track, i, 14);
    const latAccel = 6.5 * skill * skill;   // m/s^2 of lateral grip the AI will use
    const cornerSpeed = Math.sqrt(latAccel / Math.max(curvature, 1e-4));
    let targetSpeed = Math.min(this.diff.topSpeed * 58, cornerSpeed);

    // Rubber-banding relative to player leader.
    if (ctx.playerDistance != null) {
      const lead = ctx.playerDistance;   // + means AI ahead of player
      let band = 1;
      if (lead > 40) band = 1 - this.diff.rubberBand * 2;   // slow down if far ahead
      else if (lead < -40) band = 1 + this.diff.rubberBand * 1.4; // push if far behind
      targetSpeed *= clamp(band, 0.7, 1.25);
    }

    // Collision avoidance against nearby cars.
    let avoidSteer = 0, slowForCar = 0;
    for (const o of others) {
      const dx = o.pos.x - vehicle.pos.x, dz = o.pos.z - vehicle.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 7 && dist > 0.01) {
        const ahead = (o.pos.z - vehicle.pos.z) * Math.cos(vehicle.heading) + (o.pos.x - vehicle.pos.x) * Math.sin(vehicle.heading) > 0;
        const right = (dx * Math.cos(vehicle.heading) - dz * Math.sin(vehicle.heading));
        avoidSteer += (right > 0 ? -1 : 1) * (1 - dist / 7) * 0.6;
        if (ahead && dist < 5) slowForCar = Math.max(slowForCar, (1 - dist / 5));
      }
    }
    if (slowForCar > 0) targetSpeed *= (1 - slowForCar * 0.5);

    // Overtake behavior: aggressive AI tries the inside line when close behind.
    let lineOffset = 0;
    if (this.diff.aggression > 0.6 && slowForCar > 0.2) {
      this.overtakeTimer += dt;
      lineOffset = (this.overtakeTimer % 3 < 1.5 ? 1 : -1) * 2.2;
      avoidSteer += -lineOffset * 0.1;
    }

    // Steering with slight imperfection at lower skill.
    const noise = (1 - skill) * 0.5;
    const steerRaw = headingErr * 1.6 + avoidSteer;
    const steer = clamp(steerRaw, -1, 1) * (1 - noise) + (Math.sin(vehicle.pos.x * 0.05 + this.wander * 7) * noise * 0.3);

    // Throttle / brake.
    let throttle = 0, brake = 0;
    const spd = vehicle.speed;
    if (spd < targetSpeed * 0.94) throttle = clamp(1.2 - spd / Math.max(targetSpeed, 1), 0.25, 1);
    else if (spd > targetSpeed * 1.06) brake = clamp((spd - targetSpeed * 1.06) / (targetSpeed * 0.25 + 1), 0.1, 1);
    else throttle = 0.25;

    // Unstick recovery: only after being genuinely stuck (throttling but not
    // moving) for a sustained period, back up briefly.
    if (throttle > 0.3 && spd < 0.8) this.stuckTimer = (this.stuckTimer || 0) + dt;
    else this.stuckTimer = Math.max(0, (this.stuckTimer || 0) - dt * 2);
    if (this.stuckTimer > 3) {
      throttle = 0; brake = 1;
      if (this.stuckTimer > 4) this.stuckTimer = 0;
    }

    // Nitro on open straights.
    const nitro = curvature < 0.002 && throttle > 0.6 && spd > this.diff.topSpeed * 25 && vehicle.nitro > 0.3;

    this.speed = vehicle.speed;
    return { throttle, brake, steer, handbrake: false, nitro };
  }

  _avgSeg(track) {
    return track.totalLength / track.samples.length;
  }

  _curvatureAhead(track, i, window) {
    const N = track.samples.length;
    const a = track.samples[i];
    const b = track.samples[(i + window) % N];
    const fwdA = a.fwd, fwdB = b.fwd;
    const dot = clamp(fwdA.x * fwdB.x + fwdA.z * fwdB.z, -1, 1);
    const angle = Math.acos(dot);
    const arc = window * this._avgSeg(track);
    return angle / Math.max(arc, 1);
  }
}
