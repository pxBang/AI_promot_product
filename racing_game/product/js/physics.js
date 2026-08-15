import * as THREE from './three.module.js';
import { clamp, lerp } from './utils.js';
import { WORLD, SURFACES } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Build a car spec from upgrade levels (0..max).
export function makeCarSpec(upgrades = { engine: 0, tires: 0, aero: 0, brakes: 0, nitro: 0 }) {
  const e = upgrades.engine || 0, t = upgrades.tires || 0;
  const a = upgrades.aero || 0, b = upgrades.brakes || 0, n = upgrades.nitro || 0;
  return {
    mass: 1180,
    // inertia (kg·m²)
    inertia: { x: 420, y: 1650, z: 1750 },
    wheelBase: 2.5,
    trackWidth: 1.62,
    wheelRadius: 0.34,
    restLength: 0.42,
    maxTravel: 0.24,
    stiffness: 42000,
    damping: 3000,
    // engine / drivetrain
    maxTorque: 430 * (1 + e * 0.12),
    redline: 8200,
    idle: 950,
    gearRatios: [3.55, 2.53, 1.94, 1.56, 1.28, 1.05],
    finalDrive: 3.9,
    // brakes
    brakeForce: 3200 * (1 + b * 0.14),
    handbrakeForce: 5200,
    reverseForce: 2400,
    // aero
    cd: 0.32,
    cl: 0.5 * (1 + a * 0.35),
    frontalArea: 2.2,
    // tires / grip
    tireGrip: 0.92 + t * 0.10,
    lateralStiffness: 13,
    steerMax: 0.52,
    steerSpeed: 3.2,
    // nitro
    nitroForce: 5200 * (1 + n * 0.35),
    nitroDuration: 2.6,
  };
}

export class Vehicle {
  constructor(spec = makeCarSpec()) {
    this.spec = spec;
    this.pos = new THREE.Vector3(0, 2, 0);
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();   // local-space angular velocity
    this.steerAngle = 0;
    this.gear = 1;
    this.rpm = spec.idle;
    this.speed = 0;
    this.nitro = 1.0;                    // 0..1
    this.nitroActive = false;
    this.grounded = false;
    this.offRoad = false;
    this.surface = 'asphalt';
    this.collided = 0;                   // recent obstacle hit timer

    const s = spec;
    const hb = s.wheelBase / 2, ht = s.trackWidth / 2;
    this.wheels = [
      { name: 'FL', local: new THREE.Vector3(-ht, 0, hb), steer: true, drive: false },
      { name: 'FR', local: new THREE.Vector3(ht, 0, hb), steer: true, drive: false },
      { name: 'RL', local: new THREE.Vector3(-ht, 0, -hb), steer: false, drive: true },
      { name: 'RR', local: new THREE.Vector3(ht, 0, -hb), steer: false, drive: true },
    ].map((w) => ({
      ...w,
      compression: 0,
      prevCompression: 0,
      spin: 0,               // wheel visual spin angle
      worldPos: new THREE.Vector3(),
      worldQuat: new THREE.Quaternion(),
      grounded: false,
      lateralSlip: 0,
      longitudinalSlip: 0,
      load: 0,
      smoke: 0,
    }));
    this.invMass = 1 / s.mass;
    this.invInertia = new THREE.Vector3(1 / s.inertia.x, 1 / s.inertia.y, 1 / s.inertia.z);
  }

  reset(pos, heading) {
    this.pos.copy(pos);
    this.quat.setFromAxisAngle(UP, heading);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.steerAngle = 0;
    this.gear = 1;
    this.rpm = this.spec.idle;
    this.nitro = 1.0;
    this.nitroActive = false;
    for (const w of this.wheels) { w.compression = 0; w.prevCompression = 0; w.spin = 0; }
  }

  // Apply a steering impulse (e.g. from collision).
  applyImpulse(impulse, at) {
    this.vel.addScaledVector(impulse, this.invMass);
    const r = _v1.subVectors(at || this.pos, this.pos);
    const torque = _v2.crossVectors(r, impulse);
    const localTorque = _v3.copy(torque).applyQuaternion(_q.copy(this.quat).invert());
    this.angVel.x += localTorque.x * this.invInertia.x;
    this.angVel.y += localTorque.y * this.invInertia.y;
    this.angVel.z += localTorque.z * this.invInertia.z;
  }

  step(dt, input, surfaceSampler) {
    const s = this.spec;
    // Steering with speed sensitivity.
    const speedFactor = clamp(1 - this.speed / 55, 0.35, 1);
    const targetSteer = input.steer * s.steerMax * speedFactor;
    this.steerAngle = lerp(this.steerAngle, targetSteer, 1 - Math.exp(-s.steerSpeed * dt));

    // ---- Drivetrain / engine ----
    const rearSpeed = this._rearWheelSpeed();
    this._updateEngine(dt, input, rearSpeed);

    // ---- Per-wheel forces ----
    const force = new THREE.Vector3();
    const torque = new THREE.Vector3();
    let anyGrounded = false;
    let groundSurface = 'asphalt';

    const down = _v2.set(0, -1, 0).applyQuaternion(this.quat);

    for (const w of this.wheels) {
      // World attach point.
      const attach = _v3.copy(w.local).applyQuaternion(this.quat).add(this.pos);
      // Surface below the wheel.
      const surf = surfaceSampler(attach.x, attach.z);
      const groundY = surf.y;
      const wheelCenterY = attach.y - s.restLength;
      // Compression: how far the wheel has been pushed up into the body.
      let c = (groundY + s.wheelRadius) - wheelCenterY;
      c = clamp(c, -0.05, s.maxTravel);
      w.prevCompression = w.compression;
      w.compression = c;
      w.grounded = c > 0.005;
      if (w.grounded) anyGrounded = true;
      if (w.grounded) groundSurface = surf.surface;

      const contact = new THREE.Vector3(attach.x, groundY, attach.z);

      // Suspension force (spring + damper) along world up. Compression velocity
      // is derived from the body velocity at the attach point (smooth, avoids
      // first-frame discontinuities from finite differencing).
      const attachVel = new THREE.Vector3()
        .copy(this.vel)
        .add(new THREE.Vector3().crossVectors(this.angVelWorld(), new THREE.Vector3().subVectors(attach, this.pos)));
      const compressionVel = -attachVel.y;
      let suspForce = s.stiffness * c + s.damping * compressionVel;
      suspForce = clamp(suspForce, 0, s.mass * 90);
      w.load = suspForce;

      // Wheel orientation (for friction & visuals).
      const steer = w.steer ? this.steerAngle : 0;
      const wheelQuat = _q.copy(this.quat).multiply(
        new THREE.Quaternion().setFromAxisAngle(UP, steer)
      );
      w.worldQuat.copy(wheelQuat);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(wheelQuat);
      fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
      const right = new THREE.Vector3().crossVectors(UP, fwd).normalize();

      // Wheel contact point velocity.
      const cp = contact;
      const rel = _v1.subVectors(cp, this.pos);
      const contactVel = new THREE.Vector3()
        .copy(this.vel)
        .add(new THREE.Vector3().crossVectors(this.angVelWorld(), rel));
      const vLong = contactVel.dot(fwd);
      const vLat = contactVel.dot(right);

      // ---- Friction ----
      const surfCfg = SURFACES[surf.surface] || SURFACES.asphalt;
      const mu = surfCfg.grip * s.tireGrip * 1.55 * (w.grounded ? 1 : 0);
      const maxFriction = mu * w.load;

      // Lateral force (Pacejka-lite on slip angle).
      let slipAngle = Math.atan2(vLat, Math.max(Math.abs(vLong), 1.0));
      slipAngle = clamp(slipAngle, -0.6, 0.6);
      let latForce = -s.lateralStiffness * w.load * slipAngle;
      // Handbrake reduces lateral grip (drift).
      if (input.handbrake && w.drive) latForce *= 0.35;
      latForce = clamp(latForce, -maxFriction, maxFriction);
      w.lateralSlip = slipAngle;

      // Longitudinal force (drive / brake / reverse / rolling).
      let longForce = 0;
      if (w.drive) {
        const driveForce = this.engineForce * 0.5;  // split across two driven wheels
        longForce += driveForce * (this.reversing ? -1 : 1);
      }
      // Braking.
      const braking = input.brake * (input.handbrake && w.drive ? s.handbrakeForce : s.brakeForce);
      if (Math.abs(vLong) > 0.2) longForce -= Math.sign(vLong) * braking * 0.5;
      else if (input.brake > 0 && Math.abs(this.speed) < 2) longForce -= input.brake * s.reverseForce * 0.5;
      // Nitro boost.
      if (input.nitro && this.nitro > 0 && w.drive && this.reversing === false) {
        longForce += s.nitroForce * 0.5;
      }
      // Rolling resistance & surface drag.
      longForce -= Math.sign(vLong) * surfCfg.rolling * w.load * Math.min(1, Math.abs(vLong) / 4);

      // Friction circle: lateral already applied, limit longitudinal to remaining.
      const remaining = Math.sqrt(Math.max(0, maxFriction * maxFriction - latForce * latForce));
      longForce = clamp(longForce, -remaining, remaining);
      w.longitudinalSlip = vLong / Math.max(this.speed, 1);

      // Wheel spin for visuals.
      w.spin += (vLong / s.wheelRadius) * dt;

      // Tire smoke trigger.
      const slipping = Math.abs(slipAngle) > 0.12 || (Math.abs(w.longitudinalSlip) > 1.6 && this.speed > 12);
      w.smoke = slipping && w.grounded && this.speed > 8 ? 1 : 0;

      // Accumulate force at contact point.
      const wheelForce = new THREE.Vector3()
        .addScaledVector(UP, suspForce)
        .addScaledVector(fwd, longForce)
        .addScaledVector(right, latForce);
      force.add(wheelForce);
      torque.add(new THREE.Vector3().crossVectors(rel, wheelForce));

      // Wheel world position for rendering.
      w.worldPos.set(attach.x, w.grounded ? (groundY + s.wheelRadius) : (attach.y - s.restLength), attach.z);
    }

    // ---- Aerodynamics ----
    const horizVel = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    const v2 = horizVel.lengthSq();
    const v = Math.sqrt(v2);
    this.speed = this.vel.length();
    const rho = WORLD.airDensity;
    const dragMag = 0.5 * rho * s.cd * s.frontalArea * v2;
    if (v > 0.1) force.addScaledVector(horizVel.clone().normalize(), -dragMag);
    const downMag = 0.5 * rho * s.cl * s.frontalArea * v2;
    force.addScaledVector(UP, -downMag);

    // Gravity.
    force.addScaledVector(UP, WORLD.gravity * s.mass);

    // Angular damping for stability.
    this.angVel.multiplyScalar(1 - Math.min(1, dt * 1.2));

    // ---- Integrate ----
    this.vel.addScaledVector(force, this.invMass * dt);
    // Limit terminal velocity.
    const maxV = 120;
    if (this.vel.length() > maxV) this.vel.setLength(maxV);

    // Ground speed used by AI/HUD.
    this.speed = new THREE.Vector3(this.vel.x, 0, this.vel.z).length();

    // Angular acceleration in local space.
    const localTorque = new THREE.Vector3().copy(torque).applyQuaternion(_q.copy(this.quat).invert());
    this.angVel.x += localTorque.x * this.invInertia.x * dt;
    this.angVel.y += localTorque.y * this.invInertia.y * dt;
    this.angVel.z += localTorque.z * this.invInertia.z * dt;

    // Airborne stabilization (keep the car roughly level).
    if (!anyGrounded) {
      // Gentle pitch/roll leveling.
      const roll = this._roll(), pitch = this._pitch();
      this.angVel.x += -roll * 4 * dt;
      this.angVel.z += -pitch * 2 * dt;
    }

    // Orientation update (this.angVel is local-space; right-multiply applies a
    // local-frame rotation increment).
    const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      this.angVel.x * dt, this.angVel.y * dt, this.angVel.z * dt
    ));
    this.quat.multiply(dq);
    this.quat.normalize();

    // Position update.
    this.pos.addScaledVector(this.vel, dt);

    // Keep above terrain floor (safety net).
    const floor = surfaceSampler(this.pos.x, this.pos.z);
    if (this.pos.y < floor.y - 0.2) {
      this.pos.y = floor.y - 0.2;
      if (this.vel.y < 0) this.vel.y = 0;
    }

    this.grounded = anyGrounded;
    this.offRoad = !surfaceSampler(this.pos.x, this.pos.z).inRoad;
    this.surface = groundSurface;
    if (this.collided > 0) this.collided -= dt;
  }

  _rearWheelSpeed() {
    // Average longitudinal speed at rear wheels.
    let sum = 0;
    const down = _v2.set(0, 0, 1).applyQuaternion(this.quat);
    for (const w of this.wheels) {
      if (w.drive) {
        const rel = _v1.subVectors(w.worldPos, this.pos);
        const cv = new THREE.Vector3().copy(this.vel).add(new THREE.Vector3().crossVectors(this.angVelWorld(), rel));
        sum += cv.dot(down);
      }
    }
    return sum / 2;
  }

  _updateEngine(dt, input, rearSpeed) {
    const s = this.spec;
    // Nitro state.
    if (input.nitro && this.nitro > 0 && !this.reversing) {
      this.nitroActive = true;
      this.nitro = Math.max(0, this.nitro - dt / s.nitroDuration);
    } else {
      this.nitroActive = false;
      this.nitro = Math.min(1, this.nitro + dt / (s.nitroDuration * 3));
    }

    // Determine drive direction.
    this.reversing = rearSpeed < -1.0 && input.throttle > 0;
    if (input.brake > 0 && Math.abs(rearSpeed) < 1) this.reversing = true;
    if (input.throttle > 0 && rearSpeed > -0.3) this.reversing = false;

    const speed = Math.abs(rearSpeed);
    const effectiveGear = this.reversing ? -1 : this.gear;
    const ratio = this.reversing ? s.gearRatios[0] : s.gearRatios[this.gear - 1];
    const wheelAngVel = speed / s.wheelRadius;
    let rpm = (wheelAngVel * ratio * s.finalDrive * 60) / (2 * Math.PI);
    if (this.reversing) rpm = s.idle;
    rpm = clamp(rpm, s.idle, s.redline * 1.05);

    // Torque curve: peaks around 60% of redline.
    const nr = rpm / s.redline;
    const curve = 1 - Math.pow(Math.max(0, nr - 0.55) / 0.55, 1.6) * 0.7;
    const throttle = input.throttle;
    let torque = s.maxTorque * curve * throttle;
    // At idle with no throttle, keep engine alive (minimal).
    this.rpm = rpm;

    // Automatic gearbox.
    if (!this.reversing) {
      if (rpm > s.redline * 0.92 && this.gear < s.gearRatios.length) this.gear++;
      else if (rpm < s.redline * 0.45 && this.gear > 1) this.gear--;
    }

    // Engine force at the wheels.
    let engineForce = (torque * ratio * s.finalDrive) / s.wheelRadius;
    // Clamp so the engine doesn't produce absurd force at standstill.
    const maxForce = s.mass * 22;
    engineForce = clamp(engineForce, -maxForce, maxForce);
    this.engineForce = engineForce;
  }

  angVelWorld() {
    return new THREE.Vector3().copy(this.angVel).applyQuaternion(this.quat);
  }

  _roll() {
    const right = _v1.set(1, 0, 0).applyQuaternion(this.quat);
    return Math.asin(clamp(right.y, -1, 1));
  }
  _pitch() {
    const fwd = _v1.set(0, 0, 1).applyQuaternion(this.quat);
    return Math.asin(clamp(fwd.y, -1, 1));
  }

  get heading() {
    const fwd = _v1.set(0, 0, 1).applyQuaternion(this.quat);
    return Math.atan2(fwd.x, fwd.z);
  }

  get speedKmh() { return this.speed * 3.6; }
}
