// levels.js — build themed levels (geometry, colliders, lighting, decoration)

import * as THREE from 'three';
import { LEVELS } from './config.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildLevel(scene, levelIndex) {
  const def = LEVELS[levelIndex];
  const rand = mulberry32(1000 + def.id * 777);
  const size = def.size;
  const half = size / 2;

  // clear existing lighting helpers are created fresh per scene; scene is reset by caller

  // --- sky / fog ---
  scene.background = new THREE.Color(def.skyColor);
  scene.fog = new THREE.Fog(def.fogColor, size * 0.25, size * 1.8);

  // --- lights ---
  const hemi = new THREE.HemisphereLight(def.skyColor, def.floorColor, 0.7);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(def.ambient, 0.7);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(def.sun, def.sunIntensity);
  sun.position.set(size * 0.5, size * 0.7, size * 0.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -size * 0.75;
  sun.shadow.camera.right = size * 0.75;
  sun.shadow.camera.top = size * 0.75;
  sun.shadow.camera.bottom = -size * 0.75;
  sun.shadow.camera.far = size * 3;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const colliders = [];
  const shootables = [];

  const mats = {
    wall: new THREE.MeshStandardMaterial({ color: def.wallColor, metalness: 0.15, roughness: 0.85 }),
    crate: new THREE.MeshStandardMaterial({ color: def.accentColor, metalness: 0.2, roughness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.3, roughness: 0.8 }),
    rock: new THREE.MeshStandardMaterial({ color: def.wallColor, metalness: 0.05, roughness: 0.95, flatShading: true }),
  };

  function addBox(x, y, z, sx, sy, sz, mat, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isWall = true;
    scene.add(mesh);
    const c = {
      min: new THREE.Vector3(x - sx / 2, y - sy / 2, z - sz / 2),
      max: new THREE.Vector3(x + sx / 2, y + sy / 2, z + sz / 2),
      mesh,
    };
    colliders.push(c);
    if (opts.shootable !== false) shootables.push(mesh);
    return mesh;
  }

  // --- floor ---
  const floorMat = new THREE.MeshStandardMaterial({ color: def.floorColor, metalness: 0.1, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(size, 0.4, size), floorMat);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  floor.userData.isFloor = true;
  scene.add(floor);
  shootables.push(floor);

  const grid = new THREE.GridHelper(size, size / 2, def.wallColor, def.wallColor);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  scene.add(grid);

  // --- perimeter walls ---
  const T = 0.8;
  addBox(0, 2.5, -half - 0.4, size + 2, 5, T, mats.wall);
  addBox(0, 2.5, half + 0.4, size + 2, 5, T, mats.wall);
  addBox(-half - 0.4, 2.5, 0, T, 5, size + 2, mats.wall);
  addBox(half + 0.4, 2.5, 0, T, 5, size + 2, mats.wall);

  // --- interior structures ---
  const spawns = def.spawns.map((s) => new THREE.Vector3(s[0], 0, s[2]));
  const objectives = def.objectives.map((o) => new THREE.Vector3(o[0], 0, o[1]));

  function nearProtected(x, z, rad) {
    for (const s of spawns) if (Math.hypot(x - s.x, z - s.z) < rad) return true;
    for (const o of objectives) if (Math.hypot(x - o.x, z - o.z) < 6) return true;
    return false;
  }

  // central feature
  addBox(0, 1.5, 0, 8, 3, 8, mats.dark);
  addBox(0, 3.6, 0, 3, 1.2, 3, mats.crate);

  // long walls creating lanes
  const lanes = [
    [-half * 0.35, half * 0.1], [half * 0.35, -half * 0.1],
    [-half * 0.1, -half * 0.35], [half * 0.1, half * 0.35],
  ];
  for (let i = 0; i < lanes.length; i++) {
    const [x, z] = lanes[i];
    const vertical = i >= 2;
    if (vertical) addBox(x, 1.6, z, 0.6, 3.2, 12, mats.wall);
    else addBox(x, 1.6, z, 12, 3.2, 0.6, mats.wall);
  }

  // scattered cover crates
  const crateCount = Math.floor(size * 0.55);
  for (let i = 0; i < crateCount; i++) {
    const x = (rand() - 0.5) * (size - 8);
    const z = (rand() - 0.5) * (size - 8);
    if (nearProtected(x, z, 5)) continue;
    const w = 1.2 + rand() * 2.2;
    const h = 1 + rand() * 1.6;
    const d = 1.2 + rand() * 2.2;
    const mat = rand() < 0.7 ? mats.crate : mats.dark;
    addBox(x, h / 2, z, w, h, d, mat);
    // accent stripe on some
    if (rand() < 0.3) {
      addBox(x, h + 0.1, z, w + 0.05, 0.12, d + 0.05, mats.dark);
    }
  }

  // columns
  const colCount = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < colCount; i++) {
    const ang = (i / colCount) * Math.PI * 2 + rand();
    const rad = half * 0.7;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (nearProtected(x, z, 4)) continue;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 5, 10), mats.wall);
    col.position.set(x, 2.5, z);
    col.castShadow = true;
    col.userData.isWall = true;
    scene.add(col);
    colliders.push({
      min: new THREE.Vector3(x - 0.9, 0, z - 0.9),
      max: new THREE.Vector3(x + 0.9, 5, z + 0.9),
      mesh: col,
    });
    shootables.push(col);
  }

  // --- theme decorations (non-collider) ---
  const decorations = [];
  if (def.env === 'desert') {
    for (let i = 0; i < 26; i++) {
      const x = (rand() - 0.5) * (size - 6);
      const z = (rand() - 0.5) * (size - 6);
      if (nearProtected(x, z, 4)) continue;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + rand() * 1.6, 0), mats.rock);
      rock.position.set(x, 0.4, z);
      rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      rock.castShadow = true;
      scene.add(rock);
      decorations.push(rock);
    }
  } else if (def.env === 'arctic') {
    for (let i = 0; i < 26; i++) {
      const x = (rand() - 0.5) * (size - 6);
      const z = (rand() - 0.5) * (size - 6);
      if (nearProtected(x, z, 4)) continue;
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rand() * 0.9, 1.5 + rand() * 2.5, 6), mats.crate);
      crystal.position.set(x, 0.9, z);
      crystal.rotation.y = rand() * 3;
      crystal.castShadow = true;
      scene.add(crystal);
      decorations.push(crystal);
    }
  } else if (def.env === 'urban') {
    for (let i = 0; i < 18; i++) {
      const x = (rand() - 0.5) * (size - 6);
      const z = (rand() - 0.5) * (size - 6);
      if (nearProtected(x, z, 4)) continue;
      const unit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), mats.dark);
      unit.position.set(x, 0.6, z);
      unit.castShadow = true;
      scene.add(unit);
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 12), mats.wall);
      fan.rotation.x = Math.PI / 2;
      fan.position.set(x, 1.25, z);
      scene.add(fan);
      decorations.push(unit, fan);
    }
    // rooftop edge glow strips
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x4fa0ff, emissive: 0x2a70cc, emissiveIntensity: 0.8 });
    for (let i = 0; i < 8; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.3), stripMat);
      const t = i / 8 * Math.PI * 2;
      strip.position.set(Math.cos(t) * (half - 1), 0.15, Math.sin(t) * (half - 1));
      strip.rotation.y = -t;
      scene.add(strip);
      decorations.push(strip);
    }
  } else {
    // warehouse: shelves + hanging lights
    for (let i = 0; i < 12; i++) {
      const x = (rand() - 0.5) * (size - 10);
      const z = (rand() - 0.5) * (size - 10);
      if (nearProtected(x, z, 4)) continue;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 1), mats.dark);
      shelf.position.set(x, 1.1, z);
      shelf.castShadow = true;
      scene.add(shelf);
      decorations.push(shelf);
    }
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.5 });
    for (let i = 0; i < 6; i++) {
      const x = (rand() - 0.5) * size * 0.7;
      const z = (rand() - 0.5) * size * 0.7;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), lightMat);
      lamp.position.set(x, 4.5, z);
      scene.add(lamp);
      const pl = new THREE.PointLight(0xffe9a0, 12, 14, 1.6);
      pl.position.set(x, 4.4, z);
      scene.add(pl);
      decorations.push(lamp, pl);
    }
  }

  return {
    def,
    size,
    colliders,
    shootables,
    decorations,
    spawns,
    objectives,
    navgrid: null, // set by caller
  };
}
