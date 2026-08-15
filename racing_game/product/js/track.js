import * as THREE from './three.module.js';
import { makeNoise, clamp, lerp } from './utils.js';
import { SURFACES } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Track definitions. Control points are [x, z] in world meters; the loop is
// closed automatically. Width in meters. Optional bankFactor scales corner
// banking. Off-road base surface colour theme.
// ---------------------------------------------------------------------------
export const TRACK_DEFS = [
  {
    id: 'sunset-gp',
    name: 'Sunset Grand Prix',
    width: 13,
    bank: 0.05,
    offroad: 'grass',
    seed: 11,
    theme: { sky: 0xff7b3b, ground: 0x2f6b2f, road: 0x2a2d33, curb: 0xff4444 },
    points: [
      [0, 0], [60, 10], [130, -20], [150, -90], [110, -150],
      [30, -160], [-30, -110], [-70, -130], [-130, -90], [-150, -30],
      [-120, 20], [-60, 30], [-30, 10],
    ],
    obstacles: [
      { type: 'cone', u: 0.12, lat: 9.5 },
      { type: 'cone', u: 0.14, lat: 9.5 },
      { type: 'cone', u: 0.16, lat: 9.5 },
      { type: 'boost', u: 0.42, lat: 0 },
      { type: 'ramp', u: 0.60, lat: 0 },
      { type: 'rock', u: 0.78, lat: 12 },
      { type: 'rock', u: 0.80, lat: -13 },
      { type: 'cone', u: 0.88, lat: -8.5 },
      { type: 'cone', u: 0.90, lat: -8.5 },
      { type: 'boost', u: 0.96, lat: 0 },
    ],
  },
  {
    id: 'alpine-pass',
    name: 'Alpine Pass',
    width: 12,
    bank: 0.09,
    offroad: 'grass',
    seed: 27,
    theme: { sky: 0x9fd8ff, ground: 0x3c6b3c, road: 0x33363c, curb: 0xfff1d6 },
    points: [
      [0, 0], [70, 30], [120, 10], [170, -60], [140, -130], [80, -160],
      [30, -120], [60, -80], [20, -40], [-40, -60], [-90, -40], [-130, -90],
      [-170, -60], [-160, 10], [-110, 40], [-50, 30],
    ],
    obstacles: [
      { type: 'rock', u: 0.08, lat: 10 }, { type: 'rock', u: 0.09, lat: -11 },
      { type: 'cone', u: 0.28, lat: 8 }, { type: 'cone', u: 0.30, lat: 8 },
      { type: 'cone', u: 0.32, lat: 8 },
      { type: 'boost', u: 0.45, lat: 0 },
      { type: 'ramp', u: 0.66, lat: 0 },
      { type: 'cone', u: 0.82, lat: -8 }, { type: 'cone', u: 0.84, lat: -8 },
      { type: 'boost', u: 0.95, lat: 0 },
    ],
  },
  {
    id: 'coastal-sprint',
    name: 'Coastal Sprint',
    width: 14,
    bank: 0.14,
    offroad: 'grass',
    seed: 43,
    theme: { sky: 0x5cd8ff, ground: 0x3f8a63, road: 0x2b2e34, curb: 0xffc23b },
    points: [
      [0, 0], [120, 40], [220, 10], [260, -80], [210, -160], [120, -180],
      [40, -140], [80, -80], [30, -30], [-60, -50], [-120, -30], [-170, -80],
      [-200, -20], [-150, 40], [-70, 50],
    ],
    obstacles: [
      { type: 'boost', u: 0.18, lat: 0 },
      { type: 'cone', u: 0.34, lat: -10 }, { type: 'cone', u: 0.36, lat: -10 },
      { type: 'ramp', u: 0.52, lat: 0 },
      { type: 'rock', u: 0.72, lat: 12 }, { type: 'rock', u: 0.74, lat: -13 },
      { type: 'boost', u: 0.88, lat: 0 },
    ],
  },
  {
    id: 'desert-rally',
    name: 'Desert Rally',
    width: 16,
    bank: 0.06,
    offroad: 'sand',
    seed: 59,
    theme: { sky: 0xffb35c, ground: 0xc9a25c, road: 0x4a3f33, curb: 0xff7b3b },
    points: [
      [0, 0], [90, 60], [180, 30], [220, -50], [170, -120], [80, -140],
      [20, -80], [60, -30], [20, 20], [-60, 40], [-130, 10], [-180, -60],
      [-140, -120], [-70, -100], [-40, -30],
    ],
    obstacles: [
      { type: 'rock', u: 0.10, lat: 11 }, { type: 'rock', u: 0.12, lat: -12 },
      { type: 'boost', u: 0.24, lat: 0 },
      { type: 'ramp', u: 0.38, lat: 0 },
      { type: 'ramp', u: 0.40, lat: 0 },
      { type: 'cone', u: 0.62, lat: 9 }, { type: 'cone', u: 0.64, lat: 9 },
      { type: 'rock', u: 0.80, lat: -12 },
      { type: 'boost', u: 0.92, lat: 0 },
    ],
  },
];

const CURB_W = 0.9;          // curb strip width
const ROAD_LIFT = 0.12;      // road sits slightly above terrain to avoid z-fight

export class Track {
  constructor(def) {
    this.def = def;
    this.samples = [];       // {pos:Vector3, fwd:Vector3, right:Vector3, u:number, bank:number}
    this.grid = new Map();   // spatial hash: cellKey -> [sampleIndex...]
    this.cell = 24;
    this.totalLength = 0;
    this.obstacles = [];
    this.meshes = [];
    this.noise = makeNoise(def.seed);
    this._buildSamples();
    this._buildSpatialHash();
  }

  // Terrain height (pure function of x,z) — shared by mesh and physics.
  terrainHeight(x, z) {
    const n = this.noise;
    const base = n(x, z, 1 / 140) * 9 + n(x, z, 1 / 420) * 22 + n(x, z, 1 / 60) * 2.5;
    // Distant mountains for drama.
    const m = n(x, z, 1 / 1400) * 60;
    return base + m * 0.4 - 6;
  }

  _buildSamples() {
    const pts = this.def.points.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    const N = 640;
    // First pass: horizontal positions + terrain height.
    const raw = [];
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const p = curve.getPointAt(u);
      p.y = this.terrainHeight(p.x, p.z);
      raw.push({ pos: p, u });
    }
    // Arc-length + tangents + curvature.
    let acc = 0;
    this.samples = [];
    for (let i = 0; i < N; i++) {
      const cur = raw[i];
      const next = raw[(i + 1) % N];
      const tangent = new THREE.Vector3().subVectors(next.pos, cur.pos);
      const segLen = tangent.length();
      tangent.normalize();
      const fwd = tangent.clone();
      fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0);
      fwd.normalize();
      const right = new THREE.Vector3().crossVectors(UP, fwd).normalize();
      // Curvature via angle between successive tangents; bank into the corner.
      const prevTang = i === 0 ? tangent.clone() : raw[i - 1]._t;
      const kappa = 1 - clamp(prevTang.dot(tangent), -1, 1);
      const turn = Math.sign(prevTang.x * tangent.z - prevTang.z * tangent.x);
      const bank = turn * clamp(kappa * this.def.bank * 90, 0, 0.24);
      raw[i]._t = tangent.clone();
      this.samples.push({
        pos: cur.pos.clone(),
        fwd, right,
        u: cur.u,
        bank,
        length: acc,
      });
      acc += segLen;
    }
    this.totalLength = acc;
  }

  _buildSpatialHash() {
    this.samples.forEach((smp, i) => {
      const cx = Math.floor(smp.pos.x / this.cell);
      const cz = Math.floor(smp.pos.z / this.cell);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key).push(i);
      }
    });
  }

  nearestIndex(x, z) {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    let best = -1, bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = this.grid.get(`${cx + dx},${cz + dz}`);
      if (!list) continue;
      for (const i of list) {
        const s = this.samples[i];
        const dx2 = s.pos.x - x, dz2 = s.pos.z - z;
        const d = dx2 * dx2 + dz2 * dz2;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    if (best < 0) {
      // Fallback: global scan (rare, e.g. car knocked far off track).
      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        const dx2 = s.pos.x - x, dz2 = s.pos.z - z;
        const d = dx2 * dx2 + dz2 * dz2;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  // Returns the surface at world (x,z): height, and surface type.
  sampleSurface(x, z) {
    const i = this.nearestIndex(x, z);
    const s = this.samples[i];
    const dx = x - s.pos.x, dz = z - s.pos.z;
    const lateral = dx * s.right.x + dz * s.right.z;
    const half = this.def.width / 2;
    const abs = Math.abs(lateral);
    if (abs < half - 0.4) {
      const y = s.pos.y + ROAD_LIFT + lateral * Math.tan(s.bank);
      return { y, surface: 'asphalt', inRoad: true, lateral, sample: s };
    }
    if (abs < half + CURB_W) {
      const y = s.pos.y + ROAD_LIFT + lateral * 0.05;
      return { y, surface: 'curb', inRoad: true, lateral, sample: s };
    }
    const y = this.terrainHeight(x, z);
    return { y, surface: this.def.offroad, inRoad: false, lateral, sample: s };
  }

  // Pose (position + heading) at a given arc-length distance (for AI / grid).
  poseAt(distance) {
    let idx = 0;
    // Binary-ish search over cumulative lengths.
    const L = this.samples.length;
    let lo = 0, hi = L - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.samples[mid].length < distance) lo = mid + 1; else hi = mid;
    }
    idx = clamp(lo, 0, L - 1);
    const s = this.samples[idx];
    const heading = Math.atan2(s.fwd.x, s.fwd.z);
    return { pos: s.pos.clone(), heading, sample: s, index: idx };
  }

  gridSlot(i, n) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const back = new THREE.Vector3().copy(this.samples[0].fwd).multiplyScalar(-(6 + row * 8));
    const side = new THREE.Vector3().copy(this.samples[0].right).multiplyScalar((col === 0 ? -1 : 1) * 5);
    const pos = this.samples[0].pos.clone().add(back).add(side);
    pos.y = this.terrainHeight(pos.x, pos.z) + ROAD_LIFT + 0.81;
    return { pos, heading: Math.atan2(this.samples[0].fwd.x, this.samples[0].fwd.z) };
  }

  // Checkpoint positions (arc param u). Cars must pass them in order. The
  // finish line (index 0) is appended separately by the race logic.
  checkpointIndices() {
    const n = 5;
    const out = [];
    for (let k = 1; k <= n; k++) out.push(Math.floor((k / (n + 1)) * this.samples.length) % this.samples.length);
    return out;
  }

  get outline() { return this.samples.map((s) => [s.pos.x, s.pos.z]); }

  // ---------------------------------------------------------------------
  // Build meshes into a scene.
  // ---------------------------------------------------------------------
  build(scene) {
    this._buildTerrain(scene);
    this._buildRoad(scene);
    this._buildBarriers(scene);
    this._buildDecor(scene);
    this._buildObstacles(scene);
    return this.meshes;
  }

  _ribbonGeometry(points, widthFn, colorFn, upOffset = 0) {
    const pos = [], col = [], idx = [];
    const N = points.length;
    for (let i = 0; i < N; i++) {
      const p = points[i];
      const w = widthFn(i);
      const L = p.pos.clone().addScaledVector(p.right, -w);
      const R = p.pos.clone().addScaledVector(p.right, w);
      L.y += upOffset; R.y += upOffset;
      pos.push(L.x, L.y, L.z, R.x, R.y, R.z);
      const c = colorFn(i);
      col.push(c[0], c[1], c[2], c[0], c[1], c[2]);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = ((i + 1) % N) * 2;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  _buildRoad(scene) {
    const half = this.def.width / 2;
    const cRoad = new THREE.Color(this.def.theme.road);
    const cCurbA = new THREE.Color(this.def.theme.curb);
    const cCurbB = new THREE.Color(0xffffff);

    // Asphalt ribbon.
    const asphalt = new THREE.Mesh(
      this._ribbonGeometry(this.samples, () => half, () => [cRoad.r, cRoad.g, cRoad.b], ROAD_LIFT),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
    scene.add(asphalt); this.meshes.push(asphalt);

    // Curbs (left & right).
    const curbGeoL = this._ribbonGeometry(this.samples,
      (i) => half + CURB_W - 0.02, (i) => (Math.floor(i / 6) % 2 === 0 ? [cCurbA.r, cCurbA.g, cCurbA.b] : [cCurbB.r, cCurbB.g, cCurbB.b]), ROAD_LIFT);
    // To keep the curb on one side we shift: reuse asphalt ribbon trick is complex; simpler: build full-width two-tone edge via vertex colors on a slightly wider strip is omitted.
    // Instead, draw curbs as two offset ribbons using modified points.
    const leftPts = this.samples.map((s) => ({ ...s, pos: s.pos.clone().addScaledVector(s.right, -(half + CURB_W / 2)) }));
    const rightPts = this.samples.map((s) => ({ ...s, pos: s.pos.clone().addScaledVector(s.right, (half + CURB_W / 2)) }));
    const mkCurb = (pts) => new THREE.Mesh(
      this._ribbonGeometry(pts, () => CURB_W / 2, (i) => (Math.floor(i / 6) % 2 === 0 ? [cCurbA.r, cCurbA.g, cCurbA.b] : [cCurbB.r, cCurbB.g, cCurbB.b]), ROAD_LIFT),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
    const cl = mkCurb(leftPts), cr = mkCurb(rightPts);
    scene.add(cl, cr); this.meshes.push(cl, cr);

    // Start / finish line.
    const startPts = [];
    for (let k = 0; k < 4; k++) {
      const s = this.samples[(k) % this.samples.length];
      startPts.push({ ...s, pos: s.pos.clone() });
    }
    const finish = new THREE.Mesh(
      this._ribbonGeometry(startPts, () => half, (i) => (Math.floor(i / 2) % 2 === 0 ? [1, 1, 1] : [0.05, 0.05, 0.05]), ROAD_LIFT + 0.02),
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
    scene.add(finish); this.meshes.push(finish);
  }

  _buildTerrain(scene) {
    const size = 1600, seg = 160;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const cGrass = new THREE.Color(this.def.theme.ground);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let y = this.terrainHeight(x, z);
      pos.setY(i, y);
      colors.push(cGrass.r * 0.7, cGrass.g * 0.7, cGrass.b * 0.7);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    terrain.receiveShadow = true;
    scene.add(terrain); this.meshes.push(terrain);
  }

  _buildBarriers(scene) {
    const half = this.def.width / 2 + CURB_W + 0.6;
    const mat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), mat, this.samples.length * 2);
    const m = new THREE.Matrix4();
    let n = 0;
    const step = 6;
    for (let i = 0; i < this.samples.length; i += step) {
      const s = this.samples[i];
      for (const side of [-1, 1]) {
        const p = s.pos.clone().addScaledVector(s.right, side * half);
        p.y += 0.4;
        m.makeTranslation(p.x, p.y, p.z);
        posts.setMatrixAt(n++, m);
      }
    }
    posts.count = n;
    posts.instanceMatrix.needsUpdate = true;
    posts.castShadow = true;
    scene.add(posts); this.meshes.push(posts);
  }

  _buildDecor(scene) {
    // Trees + rocks scattered off-road for scenery.
    const n = 220;
    const treeTrunk = new THREE.CylinderGeometry(0.3, 0.4, 2.4, 6);
    const treeTop = new THREE.ConeGeometry(2.2, 6, 7);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a35 });
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x777a80, flatShading: true });
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 360;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // Skip if too close to road.
      if (Math.abs(this.sampleSurface(x, z).lateral) < this.def.width / 2 + 12) continue;
      const y = this.terrainHeight(x, z);
      if (Math.random() < 0.7) {
        const trunk = new THREE.Mesh(treeTrunk, trunkMat);
        const top = new THREE.Mesh(treeTop, leafMat);
        trunk.position.set(x, y + 1.2, z);
        top.position.set(x, y + 4.2, z);
        const s = 0.7 + Math.random() * 1.4;
        trunk.scale.setScalar(s); top.scale.setScalar(s);
        scene.add(trunk, top); this.meshes.push(trunk, top);
      } else {
        const rock = new THREE.Mesh(rockGeo, rockMat);
        const s = 0.5 + Math.random() * 2.5;
        rock.scale.set(s, s * 0.6, s);
        rock.position.set(x, y + s * 0.3, z);
        rock.rotation.y = Math.random() * Math.PI;
        scene.add(rock); this.meshes.push(rock);
      }
    }
  }

  _buildObstacles(scene) {
    const coneGeo = new THREE.ConeGeometry(0.55, 1.1, 12);
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xff7b2b });
    const rampGeo = new THREE.BoxGeometry(8, 0.4, 8);
    const rampMat = new THREE.MeshLambertMaterial({ color: 0x21d4fd, emissive: 0x0a3a4a });
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x5a5f66, flatShading: true });
    const boostGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.2, 20);
    const boostMat = new THREE.MeshBasicMaterial({ color: 0x21d4fd });

    for (const o of this.def.obstacles || []) {
      const s = this.samples[Math.floor(o.u * this.samples.length) % this.samples.length];
      const pos = s.pos.clone().addScaledVector(s.right, o.lat || 0);
      pos.y = this.terrainHeight(pos.x, pos.z) + ROAD_LIFT + 0.1;
      const heading = Math.atan2(s.fwd.x, s.fwd.z);
      let mesh;
      switch (o.type) {
        case 'cone':
          mesh = new THREE.Mesh(coneGeo, coneMat);
          mesh.position.copy(pos); mesh.position.y += 0.5;
          break;
        case 'rock': {
          mesh = new THREE.Mesh(rockGeo, rockMat);
          const sc = 0.8 + Math.random() * 1.2;
          mesh.scale.set(sc, sc * 0.7, sc);
          mesh.position.copy(pos); mesh.position.y += 0.4;
          break;
        }
        case 'ramp':
          mesh = new THREE.Mesh(rampGeo, rampMat);
          mesh.position.copy(pos); mesh.position.y += 0.2;
          mesh.rotation.y = heading;
          break;
        case 'boost':
          mesh = new THREE.Mesh(boostGeo, boostMat);
          mesh.position.copy(pos); mesh.position.y += 0.1;
          break;
      }
      if (mesh) {
        mesh.userData.obstacle = { ...o, heading };
        scene.add(mesh); this.meshes.push(mesh);
        this.obstacles.push({ type: o.type, mesh, x: pos.x, z: pos.z, y: pos.y, radius: o.type === 'ramp' ? 4 : o.type === 'boost' ? 3 : 1.4 });
      }
    }
  }

  dispose(scene) {
    for (const m of this.meshes) { scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }
    this.meshes = [];
    this.obstacles = [];
  }
}

export function getTrack(id) {
  const def = TRACK_DEFS.find((d) => d.id === id) || TRACK_DEFS[0];
  return new Track(def);
}
