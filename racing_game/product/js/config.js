// Global configuration and tuning constants.

export const COLORS = {
  player: 0x21d4fd,
  player2: 0xff9f1a,
  ai: [0xff3b5c, 0x8a5cff, 0x3bff7c, 0xff5cd8, 0xffd23f, 0x5cffd8, 0xff7a3b, 0x3b8aff],
};

export const WORLD = {
  gravity: -18.0,           // m/s^2 (slightly heavy for game feel)
  airDensity: 1.225,
};

// Surface grip multipliers
export const SURFACES = {
  asphalt: { grip: 1.0,   rolling: 0.012, drag: 1.0,  label: 'Tarmac' },
  curb:    { grip: 0.92,  rolling: 0.02,  drag: 1.0,  label: 'Curb' },
  grass:   { grip: 0.55,  rolling: 0.10,  drag: 2.2,  label: 'Grass' },
  dirt:    { grip: 0.72,  rolling: 0.06,  drag: 1.6,  label: 'Dirt' },
  sand:    { grip: 0.45,  rolling: 0.16,  drag: 2.8,  label: 'Sand' },
};

// Upgrade definitions: id -> {name, maxLevel, cost(per level), desc}
export const UPGRADES = {
  engine:   { name: 'Engine',   max: 5, cost: 2000, desc: '+torque & power' },
  tires:    { name: 'Tires',    max: 5, cost: 1500, desc: '+grip & handling' },
  aero:     { name: 'Aero',     max: 5, cost: 1800, desc: '+downforce' },
  brakes:   { name: 'Brakes',   max: 5, cost: 1200, desc: '+stopping power' },
  nitro:    { name: 'Nitro',    max: 3, cost: 2500, desc: '+boost' },
};

export const DEFAULT_SAVE = {
  credits: 5000,
  paint: { bodyHue: 210, accentHue: 30 },
  upgrades: { engine: 0, tires: 0, aero: 0, brakes: 0, nitro: 0 },
  bestLaps: {}, // trackId -> ms
};

// Difficulty presets: [skill, aggression, rubberBand, topSpeedFactor]
export const DIFFICULTY = [
  { skill: 0.55, aggression: 0.30, rubberBand: 0.22, topSpeed: 0.86, label: 'Rookie' },
  { skill: 0.75, aggression: 0.50, rubberBand: 0.12, topSpeed: 0.94, label: 'Amateur' },
  { skill: 0.92, aggression: 0.72, rubberBand: 0.04, topSpeed: 1.00, label: 'Pro' },
  { skill: 1.08, aggression: 0.92, rubberBand: 0.00, topSpeed: 1.06, label: 'Legend' },
];

export const RACE_MODES = {
  quick:       { label: 'Quick Race' },
  timetrial:   { label: 'Time Trial' },
  championship:{ label: 'Championship' },
  elimination: { label: 'Elimination' },
  splitscreen: { label: 'Split-Screen' },
};

export const KEY = {
  // P1
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  handbrake: 'Space', camera: 'KeyC', reset: 'KeyR', nitro: 'ShiftLeft',
  // P2
  up2: 'ArrowUp', down2: 'ArrowDown', left2: 'ArrowLeft', right2: 'ArrowRight',
  handbrake2: 'Slash', nitro2: 'Enter',
};
