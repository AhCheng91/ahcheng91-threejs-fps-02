// state.js — the single mutable game state object and a tiny event bus. No logic.

import { GAME } from "./config.js";

export function makeBus() {
  const map = new Map();
  return {
    on(ev, fn) {
      if (!map.has(ev)) map.set(ev, []);
      map.get(ev).push(fn);
      return fn;
    },
    off(ev, fn) {
      const l = map.get(ev);
      if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
    },
    emit(ev, data) {
      const l = map.get(ev);
      if (l) for (const fn of l.slice()) fn(data);
    },
    clear() { map.clear(); },
  };
}

let _id = 0;
export function nextId() { return ++_id; }

// Single shared state. Modules mutate it; hud/audio/bots/rounds read it.
export const S = {
  title: GAME,
  mode: "play",          // "play" or shot mode name
  shot: null,            // { name, seed, t, cfg } when in a shot mode
  seed: 1,
  rng: null,
  t: 0,                  // accumulated simulation time (fixed step)
  started: false,
  timeScale: 1,

  roundNum: 0,
  phase: "idle",         // idle | buy | live | end
  phaseT: 0,
  roundT: 0,
  score: { rooks: 0, wardens: 0 },
  matchOver: false,
  roundWinner: null,

  player: null,          // player agent (also in agents)
  agents: [],            // player + bots, alive
  bodies: [],            // dead ragdoll bodies

  bombCarrier: null,
  smokes: [],            // live veils of smoke that block sight
  bomb: null,            // { pos, planted, fuse, fuseMax, site, carrier }
  plantProgress: 0,
  defuseProgress: 0,

  world: { boxes: [], sites: {}, spawns: {} },

  cam: null,
  input: {
    yaw: 0, pitch: 0,
    move: { x: 0, y: 0 },
    keys: new Set(),
    fire: false, ads: false, crouch: false, walk: false,
    locked: false,
  },

  bus: makeBus(),
  hud: null,
};

export const EV = {
  PHASE: "phase",
  ROUND_START: "round_start",
  ROUND_END: "round_end",
  MATCH_END: "match_end",
  PLANT: "plant",
  PLANTING: "planting",
  DEFUSE: "defuse",
  KILL: "kill",
  DAMAGE: "damage",
  HIT: "hit",
  HURT: "hurt",
  BANNER: "banner",
  KILLFEED: "killfeed",
  MONEY: "money",
  BUY: "buy",
  RELOAD: "reload",
  FIRE: "fire",
  SHOT: "shot",
  SOUND: "sound",
  NOISE: "noise",
  TICK: "tick",
  SCOREBOARD: "scoreboard",
  START: "start",
};
