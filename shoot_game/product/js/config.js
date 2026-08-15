// config.js — game constants, weapon & level definitions

export const TEAMS = { BLUE: 'blue', RED: 'red', NONE: 'none' };

// ---- Weapon definitions -------------------------------------------------
// Model presets are interpreted by the procedural model builder in weapons.js
export const WEAPONS = {
  knife: {
    id: 'knife', name: 'COMBAT KNIFE', slot: 0, kind: 'melee',
    damage: 60, range: 2.6, swingTime: 0.35,
    model: 'knife',
  },
  pistol: {
    id: 'pistol', name: 'M9 SIDEARM', slot: 0, kind: 'hitscan',
    damage: 34, headshotMult: 2.0, fireRate: 320, range: 80,
    magSize: 12, reserve: 60, reloadTime: 1.5, auto: false,
    spread: 0.006, spreadMove: 0.03, adsSpread: 0.002, adsFov: 55,
    recoil: 0.018, muzzleScale: 0.5, pellets: 1,
    model: 'pistol',
  },
  smg: {
    id: 'smg', name: 'VECTOR SMG', slot: 1, kind: 'hitscan',
    damage: 18, headshotMult: 2.0, fireRate: 900, range: 60,
    magSize: 32, reserve: 160, reloadTime: 1.8, auto: true,
    spread: 0.014, spreadMove: 0.035, adsSpread: 0.006, adsFov: 55,
    recoil: 0.010, muzzleScale: 0.6, pellets: 1,
    model: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'M4 CARBINE', slot: 1, kind: 'hitscan',
    damage: 30, headshotMult: 2.0, fireRate: 600, range: 120,
    magSize: 30, reserve: 120, reloadTime: 2.1, auto: true,
    spread: 0.008, spreadMove: 0.028, adsSpread: 0.003, adsFov: 50,
    recoil: 0.012, muzzleScale: 0.7, pellets: 1,
    model: 'rifle',
  },
  shotgun: {
    id: 'shotgun', name: 'M1014 SHOTGUN', slot: 1, kind: 'hitscan',
    damage: 11, headshotMult: 1.5, fireRate: 90, range: 30,
    magSize: 6, reserve: 30, reloadTime: 2.8, auto: false,
    spread: 0.045, spreadMove: 0.05, adsSpread: 0.035, adsFov: 55,
    recoil: 0.045, muzzleScale: 0.8, pellets: 8,
    model: 'shotgun',
  },
  sniper: {
    id: 'sniper', name: 'AWM SNIPER', slot: 2, kind: 'hitscan',
    damage: 115, headshotMult: 2.5, fireRate: 40, range: 300,
    magSize: 5, reserve: 20, reloadTime: 3.2, auto: false,
    spread: 0.001, spreadMove: 0.03, adsSpread: 0.0002, adsFov: 25,
    recoil: 0.06, muzzleScale: 0.9, pellets: 1,
    model: 'sniper',
  },
  rocket: {
    id: 'rocket', name: 'RPG LAUNCHER', slot: 3, kind: 'projectile',
    damage: 120, splashRadius: 6.5, headshotMult: 1.0, fireRate: 500, range: 300,
    magSize: 1, reserve: 6, reloadTime: 3.0, auto: false,
    spread: 0.002, spreadMove: 0.02, adsSpread: 0.001, adsFov: 55,
    recoil: 0.05, muzzleScale: 1.2, pellets: 1, projectileSpeed: 42, explode: true,
    model: 'rocket',
  },
  grenade: {
    id: 'grenade', name: 'FRAG GRENADE', slot: 4, kind: 'grenade',
    damage: 130, splashRadius: 8, count: 2,
  },
};

// Default loadout when spawning
export const DEFAULT_LOADOUT = [
  { id: 'rifle', ammo: null },   // ammo null => full default reserve
  { id: 'pistol', ammo: null },
  { id: 'knife', ammo: null },
];

export const WEAPON_SLOTS = [
  { slot: 0, label: 'SIDEARM / MELEE' },
  { slot: 1, label: 'PRIMARY' },
  { slot: 2, label: 'SPECIAL' },
  { slot: 3, label: 'HEAVY' },
];

// ---- Game settings ------------------------------------------------------
export const SETTINGS = {
  gravity: 24,
  playerSpeed: 7.0,
  sprintMult: 1.45,
  crouchMult: 0.55,
  jumpVelocity: 8.2,
  playerHeight: 1.7,
  eyeHeight: 1.6,
  crouchEyeHeight: 1.05,
  maxHealth: 100,
  maxArmor: 100,
  respawnTime: 3.0,
  matchTime: 300, // seconds
  scoreLimitTDM: 50,
  scoreLimitDom: 120,
  scoreLimitFFA: 30,
};

// ---- Levels -------------------------------------------------------------
export const LEVELS = [
  {
    id: 0, name: 'WAREHOUSE', env: 'warehouse',
    size: 90,
    floorColor: 0x3a3f46, wallColor: 0x6d7278, accentColor: 0xd8a23a,
    skyColor: 0x10151c, fogColor: 0x0c1016, fogDensity: 0.012,
    ambient: 0x8a94a6, sun: 0xfff3d0, sunIntensity: 1.1,
    spawns: [[-34, 0, -34], [34, 0, 34], [-34, 0, 34], [34, 0, -34]],
    objectives: [[0, 0], [30, -30], [-30, 30]],
  },
  {
    id: 1, name: 'DESERT OUTPOST', env: 'desert',
    size: 110,
    floorColor: 0xc2a878, wallColor: 0x9c8257, accentColor: 0xb06a3a,
    skyColor: 0xe8c79a, fogColor: 0xd8b887, fogDensity: 0.007,
    ambient: 0xe8d4b0, sun: 0xffe8c0, sunIntensity: 1.5,
    spawns: [[-42, 0, -42], [42, 0, 42], [-42, 0, 42], [42, 0, -42]],
    objectives: [[0, 0], [38, 38], [-38, -38]],
  },
  {
    id: 2, name: 'ARCTIC BASE', env: 'arctic',
    size: 95,
    floorColor: 0xdce8ee, wallColor: 0xbfd4de, accentColor: 0x3aa0d8,
    skyColor: 0x9fc4d8, fogColor: 0xbcd7e2, fogDensity: 0.01,
    ambient: 0xcfe3ec, sun: 0xeaf7ff, sunIntensity: 1.2,
    spawns: [[-36, 0, -36], [36, 0, 36], [-36, 0, 36], [36, 0, -36]],
    objectives: [[0, 0], [26, -26], [-26, 26]],
  },
  {
    id: 3, name: 'URBAN ROOFTOPS', env: 'urban',
    size: 100,
    floorColor: 0x4a4d52, wallColor: 0x5d6068, accentColor: 0x4fa0ff,
    skyColor: 0x1b2030, fogColor: 0x141a28, fogDensity: 0.009,
    ambient: 0x7c8aa8, sun: 0xd8e8ff, sunIntensity: 1.0,
    spawns: [[-38, 0, -38], [38, 0, 38], [-38, 0, 38], [38, 0, -38]],
    objectives: [[0, 0], [32, 32], [-32, -32]],
  },
];

// Scoring values
export const SCORE = {
  kill: 100, headshot: 50, assist: 40, capture: 150, captureTick: 10,
  streakBonus: 25, objectiveKill: 25, firstBlood: 50,
};

// Bot names for scoreboard flavour
export const BOT_NAMES_BLUE = ['Raptor', 'Viper', 'Ghost', 'Talon', 'Frost'];
export const BOT_NAMES_RED = ['Cobra', 'Widow', 'Reaper', 'Havoc', 'Blitz'];
