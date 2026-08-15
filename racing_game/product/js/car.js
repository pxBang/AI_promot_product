import * as THREE from './three.module.js';
import { hslToHex } from './utils.js';

// Detailed procedural car model. The model origin sits at the physics
// center-of-mass (~0.63 m above the ground). Wheels hang below the origin.
export class Car {
  constructor({ bodyHue = 210, accentHue = 30, ghost = false } = {}) {
    this.group = new THREE.Group();
    this.bodyHue = bodyHue;
    this.accentHue = accentHue;
    this.ghost = ghost;
    this.wheelMeshes = [];      // spinner meshes (inner, rotate around axle)
    this.wheelHolders = [];     // positioned/oriented by physics
    this._bodyMat = null;
    this._accentMat = null;
    this._glassMat = null;
    this.headlightSpots = [];
    this._build();
    this.setPaint(bodyHue, accentHue);
  }

  _build() {
    const g = this.group;
    const bodyHex = hslToHex(this.bodyHue);
    const accentHex = hslToHex(this.accentHue);

    this._bodyMat = new THREE.MeshStandardMaterial({ color: bodyHex, metalness: 0.55, roughness: 0.32 });
    this._accentMat = new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.6, roughness: 0.4 });
    this._glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1620, metalness: 0.9, roughness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.8 });

    // Main chassis.
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.5, 4.3), this._bodyMat);
    chassis.position.y = 0.0;
    chassis.castShadow = true;
    g.add(chassis);

    // Lower nose wedge.
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.26, 1.0), this._bodyMat);
    nose.position.set(0, -0.15, 1.75);
    nose.rotation.x = 0.10;
    nose.castShadow = true;
    g.add(nose);

    // Hood.
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.16, 1.5), this._bodyMat);
    hood.position.set(0, 0.20, 0.9);
    hood.rotation.x = -0.06;
    g.add(hood);

    // Cabin / greenhouse.
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.0), this._glassMat);
    cabin.position.set(0, 0.45, -0.15);
    cabin.rotation.x = -0.03;
    cabin.castShadow = true;
    g.add(cabin);

    // Roof (body colour).
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.08, 1.5), this._bodyMat);
    roof.position.set(0, 0.74, -0.1);
    roof.castShadow = true;
    g.add(roof);

    // Rear deck + spoiler.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.0), this._bodyMat);
    deck.position.set(0, 0.08, -1.55);
    g.add(deck);

    const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.5), this._accentMat);
    spoilerWing.position.set(0, 0.42, -1.85);
    spoilerWing.rotation.x = -0.12;
    g.add(spoilerWing);
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.16), darkMat);
    p1.position.set(-0.6, 0.24, -1.85); g.add(p1);
    const p2 = p1.clone(); p2.position.x = 0.6; g.add(p2);

    // Side skirts (accent).
    for (const side of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 2.8), this._accentMat);
      skirt.position.set(side * 0.9, -0.18, -0.1);
      g.add(skirt);
    }

    // Front splitter + rear diffuser.
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.4), darkMat);
    splitter.position.set(0, -0.34, 2.2);
    g.add(splitter);
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.4), darkMat);
    diffuser.position.set(0, -0.32, -2.1);
    g.add(diffuser);

    // Headlights (emissive).
    this.headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c0, emissiveIntensity: 0.0 });
    for (const side of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.1), this.headlightMat);
      hl.position.set(side * 0.55, 0.02, 2.16);
      g.add(hl);
    }

    // Taillights.
    this.taillightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 0.35 });
    for (const side of [-1, 1]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.1), this.taillightMat);
      tl.position.set(side * 0.55, 0.08, -2.16);
      g.add(tl);
    }

    // Wheels (wheel centers sit ~0.30 below the origin at rest).
    const wheelRadius = 0.34, wheelWidth = 0.28;
    const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 20);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.55, wheelRadius * 0.55, wheelWidth + 0.02, 12);
    rimGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.95 });
    const rimMat = this._accentMat;
    const positions = [
      [-0.81, -0.3, 1.25], [0.81, -0.3, 1.25], [-0.81, -0.3, -1.25], [0.81, -0.3, -1.25],
    ];
    for (const p of positions) {
      const holder = new THREE.Group();
      holder.position.set(p[0], p[1], p[2]);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, rimMat);
      const spinner = new THREE.Group();
      spinner.add(tire, rim);
      holder.add(spinner);
      g.add(holder);
      this.wheelHolders.push(holder);
      this.wheelMeshes.push(spinner);
    }

    // Driver silhouette (subtle).
    const driver = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), darkMat);
    driver.position.set(-0.32, 0.5, 0.15);
    driver.scale.set(0.9, 1.1, 0.9);
    g.add(driver);

    if (this.ghost) this.setGhost(true);
  }

  setPaint(bodyHue, accentHue) {
    this.bodyHue = bodyHue;
    this.accentHue = accentHue;
    this._bodyMat.color.setHex(hslToHex(bodyHue));
    this._accentMat.color.setHex(hslToHex(accentHue));
  }

  setGhost(v) {
    this.ghost = v;
    this.group.traverse((o) => {
      if (o.isMesh) {
        if (!o.material._ghostCloned) {
          o.material = o.material.clone();
          o.material._ghostCloned = true;
        }
        o.material.transparent = true;
        o.material.opacity = v ? 0.35 : 1;
        o.material.depthWrite = !v;
      }
    });
  }

  setLights(headlights, brake) {
    this.headlightMat.emissiveIntensity = headlights ? 2.2 : 0.0;
    this.taillightMat.emissiveIntensity = brake ? 3.5 : 0.6;
  }

  // Sync visual transforms from a physics Vehicle.
  update(vehicle) {
    this.group.position.copy(vehicle.pos);
    this.group.quaternion.copy(vehicle.quat);
    for (let i = 0; i < this.wheelHolders.length; i++) {
      const w = vehicle.wheels[i];
      this.wheelHolders[i].position.copy(w.worldPos);
      this.wheelHolders[i].quaternion.copy(w.worldQuat);
      this.wheelMeshes[i].rotation.x = w.spin;
    }
  }

  attachHeadlights() {
    const spot = (side) => {
      const s = new THREE.SpotLight(0xfff3d0, 0, 60, 0.5, 0.6, 1.6);
      s.position.set(side * 0.6, 0.1, 2.1);
      s.target.position.set(side * 0.8, -0.4, 8);
      this.group.add(s);
      this.group.add(s.target);
      return s;
    };
    this.headlightSpots = [spot(-1), spot(1)];
    return this.headlightSpots;
  }
}
