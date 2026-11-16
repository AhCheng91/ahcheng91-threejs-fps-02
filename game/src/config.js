// config.js — every tuning constant: physics, weapons, economy, palette, map hooks.

export const GAME = "KESSLER WORKS";
export const TITLE = "KESSLER WORKS";
export const FPS = 60;
export const DT = 1 / FPS;

export const PAL = {
  fog: 0x0a1218,
  sky: 0x0a1218,
  ground: 0x22312f,
  concrete: 0x2a3a38,
  concreteDark: 0x1c2a28,
  steel: 0x3a4a4a,
  steelDark: 0x232f30,
  catwalk: 0x2f3f3d,
  amber: 0xffb042,
  lamp: 0xffc46b,
  hazard: 0xff7a1a,
  accent: 0xff7a1a,
  teal: 0x7fd4c9,
  rooks: 0x7fd4c9,
  wardens: 0xff9a3d,
  enemy: 0x2a3636,
  enemyLight: 0xff7a1a,
  ally: 0x2e3d3a,
  allyLight: 0x7fd4c9,
  water: 0x14323a,
  wet: 0x122024,
};

export const PHYS = {
  walk: 4.6,
  shift: 2.4,
  crouch: 1.9,
  accel: 46,
  groundFric: 9,
  airAccel: 8,
  jump: 4.6,
  gravity: 13.5,
  maxFall: 18,
  stepUp: 0.35,
  eyeStand: 1.62,
  eyeCrouch: 1.05,
  crouchLerp: 0.22,
  bobAmp: 0.045,
  bobFreq: 9.5,
  landDip: 0.14,
  sway: 0.0016,
};

export const PLAYER = {
  radius: 0.35,
  stand: 1.72,
  crouch: 1.15,
  health: 100,
  armorMax: 100,
};

// Weapon table. spread: [base, stand, move, crouch, ads] in radians (half-cone).
// recoil: {up, side} per shot; range: [start, end, minMul] falloff; headshot: damage multiplier.
export const WEAPONS = [
  {
    id: "tack", name: "M9 \"Tack\"", slot: 1, price: 0,
    dmg: 26, rpm: 480, semi: true, pellets: 1,
    mag: 12, reserve: 48, reload: 1.6, autoReload: true,
    spread: [0.012, 0.012, 0.045, 0.009, 0.006],
    recoil: { up: 0.9, side: 0.55, recovery: 6 },
    range: [30, 80, 0.55], headshot: 4, tracer: 0.5, auto: false,
  },
  {
    id: "needle", name: "VX-4 \"Needle\"", slot: 2, price: 1250,
    dmg: 21, rpm: 720, semi: false, pellets: 1,
    mag: 30, reserve: 120, reload: 2.1, autoReload: true,
    spread: [0.016, 0.016, 0.085, 0.012, 0.008],
    recoil: { up: 0.6, side: 0.8, recovery: 7 },
    range: [24, 70, 0.5], headshot: 4, tracer: 0.45, auto: true,
  },
  {
    id: "kestrel", name: "AR-9 \"Kestrel\"", slot: 3, price: 2700,
    dmg: 33, rpm: 540, semi: false, pellets: 1,
    mag: 30, reserve: 90, reload: 2.5, autoReload: true,
    spread: [0.008, 0.008, 0.055, 0.006, 0.004],
    recoil: { up: 1.25, side: 0.5, recovery: 5 },
    range: [40, 100, 0.6], headshot: 4, tracer: 0.55, auto: true,
  },
  {
    id: "bellows", name: "R-12 \"Bellows\"", slot: 4, price: 1800,
    dmg: 12, rpm: 55, semi: true, pellets: 8,
    mag: 6, reserve: 30, reload: 3.4, autoReload: true,
    spread: [0.05, 0.05, 0.11, 0.035, 0.028],
    recoil: { up: 2.6, side: 0.8, recovery: 3 },
    range: [12, 34, 0.45], headshot: 3, tracer: 0.4, auto: false,
  },
];

export const W = {};
for (const w of WEAPONS) W[w.id] = w;

// Armour / equipment buyables (slots continue past weapons in the buy menu).
export const GEAR = [
  { id: "vest", name: "Ceramic Vest", price: 600, kind: "armor", armor: 100 },
  { id: "helmet", name: "Vest + Helmet", price: 1000, kind: "armor", armor: 100, helmet: true },
  { id: "shard", name: "Shard Frag", price: 300, kind: "nade", nade: "shard", max: 2 },
  { id: "veil", name: "Veil Smoke", price: 300, kind: "nade", nade: "veil", max: 2 },
  { id: "whiteout", name: "Whiteout Flash", price: 200, kind: "nade", nade: "whiteout", max: 2 },
];

export const GRENADES = {
  shard: { name: "Shard", fuse: 1.6, radius: 6.5, maxDmg: 95, loud: 1.0, price: 300 },
  veil: { name: "Veil", radius: 4.5, life: 14, loud: 0.6, price: 300 },
  whiteout: { name: "Whiteout", radius: 10, duration: 2.2, loud: 0.8, price: 200 },
};

export const ECONOMY = {
  start: 800,
  win: 3250,
  lossBase: 1400,
  lossStreakBonus: 500,
  lossCap: 3400,
  plant: 300,
  max: 16000,
  kills: { kestrel: 300, tack: 300, bellows: 300, needle: 600, shard: 300, fallback: 300 },
};

export const ROUND = {
  buyPhase: 18,
  roundTime: 100,
  fuse: 40,
  plantTime: 3.2,
  defuseTime: 5,
  winScore: 7,
  freezeMove: true,
};

export const BOT = {
  fov: 1.745,        // 100deg vision cone
  sight: 34,
  reactMin: 0.5, reactMax: 1.0,
  aimTrack: 0.8,
  burstMin: 3, burstMax: 6,
  separation: 1.2,
  crouchRange: 26,
  peekAmp: 0.5,
  noiseGun: 34, noiseStep: 10, noisePlant: 20,
  advanceSpeed: 3.4, holdPeek: 0.6,
};

export const MAP = {
  size: 64,
  spawns: {
    rooks: [{ x: 56, z: 56, yaw: Math.PI * 0.75 }],
    wardens: [
      { x: 9, z: 12, yaw: Math.PI * 1.5 },
      { x: 52, z: 10, yaw: Math.PI },
    ],
  },
  sites: {
    A: { x: 50, z: 12, r: 5.5 },
    B: { x: 12, z: 50, r: 5.5 },
  },
};

export const SHOT = {
  cover: { seed: 1, time: 4, round: 1 },
  buy: { seed: 1, time: 4, round: 1, buyOpen: true },
  fight: { seed: 1, time: 4, round: 2 },
  objective: { seed: 1, time: 4, round: 4 },
  map: { seed: 1, time: 1, round: 1 },
};
