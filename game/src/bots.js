// bots.js — the other seven players. Each bot follows a route, holds a corner, sees
// through the same collision boxes the player does, hears gunfire, turns and fires in
// bursts with an aim error that shrinks the longer it has the target in view.

import { BOT, PHYS, W } from "./config.js";
import { hasLOS } from "./collision.js";
import { makeAgent, stepBody, wishVector, respawnAgent } from "./player.js";
import { tryFire, aimVector, clampPitch } from "./weapons.js";
import { EV } from "./state.js";

const ROLE = {
  HOLD: "hold",
  ADVANCE: "advance",
  ENGAGE: "engage",
  RELOAD: "reload",
  PLANT: "plant",
  DEFUSE: "defuse",
  DEAD: "dead",
};

export function makeBot(id, name, team, spawn, weaponId) {
  const b = makeAgent({ id, name, team, x: spawn.x, z: spawn.z, yaw: spawn.yaw });
  b.bot = {
    role: ROLE.HOLD,
    goal: { x: spawn.x, z: spawn.z },
    path: [],
    step: 0,
    target: null,
    seeT: 0,
    loseT: 0,
    reactT: 0,
    scanT: 0,
    scanDir: 1,
    holdT: 0,
    burst: 0,
    burstPause: 0,
    strafe: 0,
    strafeT: 0,
    aimErr: 0,
    lastHeard: null,
    heardT: 0,
    lane: "mid",
    wantsSite: "A",
    hasBomb: false,
    lookYaw: spawn.yaw || 0,
  };
  b.bot.weaponId = weaponId || "kestrel";
  return b;
}

export function botWeapon(b) {
  return b.bot.weaponId;
}

export function respawnBot(b, spawn) {
  respawnAgent(b, spawn);
  b.bot.role = ROLE.HOLD;
  b.bot.path.length = 0;
  b.bot.step = 0;
  b.bot.target = null;
  b.bot.seeT = 0;
  b.bot.reactT = 0;
  b.bot.burst = 0;
  b.bot.aimErr = 0;
  b.bot.lastHeard = null;
  b.bot.heardT = 0;
  b.bot.lookYaw = b.yaw;
}

// Route each bot for a new round: attackers pick a site, defenders split across both.
export function planRound(bots, rng, world, roundNum) {
  const siteKeys = Object.keys(world.sites);
  const attackSite = siteKeys[roundNum % siteKeys.length];
  let defenderIdx = 0;
  for (const b of bots) {
    if (!b.alive) continue;
    const st = b.bot;
    st.target = null;
    st.seeT = 0;
    st.reactT = 0;
    st.burst = 0;
    st.lastHeard = null;
    st.heardT = 0;
    if (b.team === "rooks") {
      st.wantsSite = rng.chance(0.72) ? attackSite : siteKeys[(roundNum + 1) % siteKeys.length];
      const site = world.sites[st.wantsSite];
      st.lane = st.wantsSite;
      const spread = rng.range(-1, 1);
      st.goal = { x: site.x + spread * 3.5, z: site.z + rng.range(-3, 3) };
      setPath(b, world, rng);
      st.role = ROLE.ADVANCE;
    } else {
      const holdKey = siteKeys[defenderIdx++ % siteKeys.length];
      const hold = world.sites[holdKey];
      st.wantsSite = hold.label;
      st.lane = hold.label;
      st.goal = { x: hold.x + rng.range(-5, 5), z: hold.z + rng.range(-5, 5) };
      setPath(b, world, rng);
      st.role = ROLE.HOLD;
      st.holdT = rng.range(0, 2);
      st.lookYaw = Math.atan2(-(st.goal.x - b.pos.x), -(st.goal.z - b.pos.z));
    }
  }
}

function setPath(b, world, rng) {
  const st = b.bot;
  const nav = world.nav;
  if (!nav) { st.path = [st.goal]; st.step = 0; return; }
  const pts = nav.path(b.pos, st.goal);
  st.path = nav.smooth(pts);
  st.step = st.path.length > 1 ? 1 : 0;
  if (st.path.length && rng.chance(0.35)) {
    const p = st.path[st.path.length - 1];
    st.path[st.path.length - 1] = { x: p.x + rng.range(-1.5, 1.5), y: 0, z: p.z + rng.range(-1.5, 1.5) };
  }
}

function eyeOf(a) {
  return { x: a.pos.x, y: a.pos.y + a.eye, z: a.pos.z };
}

// Nearest enemy this bot can actually see, or null.
function findTarget(b, agents, boxes) {
  const eye = eyeOf(b);
  let best = null;
  let bestD = Infinity;
  for (const a of agents) {
    if (!a.alive || a.team === b.team) continue;
    const dx = a.pos.x - b.pos.x;
    const dz = a.pos.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > BOT.sight || d >= bestD) continue;
    const ang = Math.abs(angleTo(b.yaw, dx, dz));
    if (ang > BOT.fov / 2) continue;
    if (!hasLOS(eye.x, eye.y, eye.z, a.pos.x, a.pos.y + a.eye, a.pos.z, boxes)) continue;
    best = a;
    bestD = d;
  }
  return best;
}

export function angleTo(yaw, dx, dz) {
  const want = Math.atan2(-dx, -dz);
  let diff = want - yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function turnToward(b, tx, ty, tz, dt, rate) {
  const dx = tx - b.pos.x;
  const dz = tz - b.pos.z;
  const dy = ty - (b.pos.y + b.eye);
  const diff = angleTo(b.yaw, dx, dz);
  const maxTurn = rate * dt;
  b.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
  const wantPitch = clampPitch(Math.atan2(dy, Math.hypot(dx, dz)));
  b.pitch += (wantPitch - b.pitch) * Math.min(1, dt * 9);
}

function walkTo(b, tx, tz, dt, world, speedMul) {
  const dx = tx - b.pos.x;
  const dz = tz - b.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.35) return true;
  const maxAhead = Math.min(BOT.advanceSpeed, PHYS.walk * (speedMul || 1));
  // Slow down on the last step so a bot does not overshoot a corner.
  const speed = d < 1.4 ? Math.max(1.2, maxAhead * d / 1.4) : maxAhead;
  stepBody(b, dt, dx / d, dz / d, speed, world.boxes);
  return false;
}

export function updateBot(b, dt, ctx) {
  const st = b.bot;
  if (!b.alive) { st.role = ROLE.DEAD; return; }
  const { world, agents, rng, bus } = ctx;
  const boxes = world.boxes;

  if (st.heardT > 0) st.heardT -= dt;
  if (b.weapon) {
    if (b.weapon.mag === 0 || (b.weapon.mag < b.weapon.def.mag * 0.15 && st.target === null)) {
      if (!b.weapon.reloading) {
        b.weapon.reloading = true;
        b.weapon.reloadT = b.weapon.def.reload;
        if (ctx.audio) ctx.audio.play("reload", { pos: b.pos, byPlayer: false });
      }
    }
  }

  const target = findTarget(b, agents, boxes);
  if (target) {
    if (st.target !== target) {
      st.target = target;
      st.reactT = rng.range(BOT.reactMin, BOT.reactMax) + (st.role === ROLE.HOLD ? 0.1 : 0);
      st.seeT = 0;
      st.aimErr = 0.16;
    }
    st.seeT += dt;
    st.loseT = 0;
  } else if (st.target) {
    st.loseT += dt;
    if (st.loseT > 1.1) {
      st.target = null;
      st.aimErr = 0.3;
    }
  }

  if (st.target) {
    st.role = ROLE.ENGAGE;
    engage(b, dt, ctx, st.target);
  } else if (b.team === "rooks" && ctx.rounds && ctx.rounds.bombPlanted() && b.bot.hasBomb === false) {
    defendPlanted(b, dt, ctx);
  } else if (b.team === "wardens" && ctx.rounds && ctx.rounds.bombPlanted()) {
    defendPlanted(b, dt, ctx);
  } else if (st.role === ROLE.PLANT && ctx.rounds) {
    plantStep(b, dt, ctx);
  } else if (st.role === ROLE.DEFUSE && ctx.rounds) {
    defuseStep(b, dt, ctx);
  } else {
    roam(b, dt, ctx);
  }

  st.aimErr = Math.max(0.02, st.aimErr - dt * 0.12);
  if (b.grounded === false && b.pos.y < -4) respawnAtNearest(b, world, ctx);
  if (bus && st.heardT < 0.01 && st.lastHeard) st.lastHeard = null;
}

function roam(b, dt, ctx) {
  const st = b.bot;
  const { world, rng } = ctx;
  if (b.team === "rooks" && st.hasBomb && ctx.rounds) {
    const site = world.sites[st.wantsSite];
    if (site && Math.hypot(b.pos.x - site.x, b.pos.z - site.z) < site.r) {
      st.role = ROLE.PLANT;
      return;
    }
  }
  const wp = st.path[st.step];
  if (wp) {
    turnToward(b, b.pos.x + Math.sin(b.yaw) * -0, b.pos.y + b.eye, b.pos.z + Math.cos(b.yaw) * -0, dt, 3.2);
    turnTowardLook(b, wp.x, wp.z, dt);
    if (walkTo(b, wp.x, wp.z, dt, world, b.crouched ? 0.6 : 1)) {
      st.step++;
      if (st.step >= st.path.length) {
        st.path.length = 0;
        st.step = 0;
        st.role = b.team === "rooks" ? ROLE.HOLD : ROLE.HOLD;
        st.holdT = rng.range(2, 5);
      }
    }
  } else {
    st.role = ROLE.HOLD;
    st.holdT -= dt;
    stepBody(b, dt, 0, 0, 0, world.boxes);
    // Hold a corner: sweep the view across the lane, then settle back.
    st.scanT += dt * 0.9;
    if (st.scanT > 2.4) { st.scanT = 0; st.scanDir *= -1; }
    const base = st.lookYaw;
    const sway = Math.sin(st.scanT * 1.2) * 0.5;
    const want = base + sway * st.scanDir;
    const diff = angleTo(b.yaw, -Math.sin(want), -Math.cos(want));
    b.yaw += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
    b.pitch += (0 - b.pitch) * Math.min(1, dt * 4);
    if (st.holdT <= 0) {
      // Shift to another corner of the site after a while, so bots never freeze.
      const site = world.sites[st.wantsSite];
      if (site) {
        st.goal = { x: site.x + (Math.random() - 0.5) * site.r * 1.4, z: site.z + (Math.random() - 0.5) * site.r * 1.4 };
        setPath(b, world, ctx.rng);
        st.role = ROLE.ADVANCE;
        st.holdT = 6;
      }
    }
  }
}

function turnTowardLook(b, x, z, dt) {
  const diff = angleTo(b.yaw, x - b.pos.x, z - b.pos.z);
  const lim = 3.4 * dt;
  b.yaw += Math.max(-lim, Math.min(lim, diff));
  b.pitch += (0 - b.pitch) * Math.min(1, dt * 3);
}

function engage(b, dt, ctx, target) {
  const st = b.bot;
  const { world, rng } = ctx;
  const dist = Math.hypot(target.pos.x - b.pos.x, target.pos.z - b.pos.z);
  const eye = eyeOf(b);
  turnToward(b, target.pos.x, target.pos.y + target.eye * 0.82, target.pos.z, dt, 4.4);

  // Stand still to shoot, or creep sideways so a duel is not two statues.
  st.strafeT -= dt;
  if (st.strafeT <= 0) {
    st.strafeT = rng.range(0.5, 1.4);
    st.strafe = rng.chance(0.5) ? 0 : rng.sign();
    b.crouched = dist > BOT.crouchRange && rng.chance(0.35);
  }
  const dx = target.pos.x - b.pos.x;
  const dz = target.pos.z - b.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  if (st.strafe !== 0) {
    const sx = (-dz / d) * st.strafe;
    const sz = (dx / d) * st.strafe;
    stepBody(b, dt, sx, sz, PHYS.walk * 0.62, world.boxes);
  } else {
    stepBody(b, dt, 0, 0, 0, world.boxes);
  }
  b.eye += ((b.crouched ? PHYS.eyeCrouch : PHYS.eyeStand) - b.eye) * Math.min(1, dt * 8);

  if (st.reactT > 0) { st.reactT -= dt; return; }
  if (!b.weapon || b.weapon.reloading) return;

  // Aim error falls as the bot keeps the target; movement and distance add to it.
  const moving = b.speed > 0.6;
  const errBase = st.aimErr + (moving ? 0.05 : 0) + Math.min(0.1, dist * 0.0026);
  const w = b.weapon;
  const aim = aimVector(b.yaw, b.pitch);
  const canShoot = Math.abs(angleTo(b.yaw, target.pos.x - b.pos.x, target.pos.z - b.pos.z)) < 0.12;
  if (!canShoot) return;
  if (w.cool > 0) return;

  if (st.burst > 0) {
    st.burst--;
  } else {
    if (st.burstPause > 0) { st.burstPause -= dt; return; }
    st.burst = rng.int(BOT.burstMin, BOT.burstMax);
    st.burstPause = rng.range(0.12, 0.4);
  }

  // A wide error at long range is applied by nudging the shot's own aim.
  const spreadYaw = rng.gaussC(0, errBase * 0.55, 2);
  const spreadPitch = rng.gaussC(0, errBase * 0.4, 2);
  const saveYaw = b.yaw;
  const savePitch = b.pitch;
  b.yaw += spreadYaw;
  b.pitch = clampPitch(b.pitch + spreadPitch);
  tryFire(b, w, world, ctx.agents, rng, ctx);
  b.yaw = saveYaw;
  b.pitch = savePitch;
  void aim;
}

// After the charge is planted, attackers hold the site and wardens come to it.
function defendPlanted(b, dt, ctx) {
  const st = b.bot;
  const bomb = ctx.rounds.bombPos();
  if (!bomb) { roam(b, dt, ctx); return; }
  if (b.team === "wardens") {
    const d = Math.hypot(b.pos.x - bomb.x, b.pos.z - bomb.z);
    if (d < 1.6) {
      st.role = ROLE.DEFUSE;
      stepBody(b, dt, 0, 0, 0, ctx.world.boxes);
      turnTowardLook(b, bomb.x, bomb.z, dt);
      return;
    }
    if (!st.path.length || st.holdT <= 0) {
      st.goal = { x: bomb.x, z: bomb.z };
      setPath(b, ctx.world, ctx.rng);
      st.holdT = 4;
    }
    const wp = st.path[st.step];
    if (wp) {
      turnTowardLook(b, wp.x, wp.z, dt);
      if (walkTo(b, wp.x, wp.z, dt, ctx.world, 1.15)) {
        st.step++;
        if (st.step >= st.path.length) { st.path.length = 0; st.step = 0; st.holdT = 0; }
      }
    } else stepBody(b, dt, 0, 0, 0, ctx.world.boxes);
  } else {
    const site = ctx.world.sites[st.wantsSite] || ctx.world.sites.A;
    const d = Math.hypot(b.pos.x - site.x, b.pos.z - site.z);
    if (d > site.r * 1.2) {
      turnTowardLook(b, site.x, site.z, dt);
      walkTo(b, site.x, site.z, dt, ctx.world, 0.9);
    } else {
      stepBody(b, dt, 0, 0, 0, ctx.world.boxes);
      b.yaw += dt * 0.5 * (st.scanDir || 1);
      if (Math.random() < dt * 0.2) st.scanDir *= -1;
    }
  }
}

function plantStep(b, dt, ctx) {
  const st = b.bot;
  stepBody(b, dt, 0, 0, 0, ctx.world.boxes);
  const site = ctx.world.sites[st.wantsSite];
  if (site) turnTowardLook(b, site.x, site.z, dt);
  ctx.rounds.botPlant(b);
}

function defuseStep(b, dt, ctx) {
  stepBody(b, dt, 0, 0, 0, ctx.world.boxes);
  const bomb = ctx.rounds.bombPos();
  if (bomb) turnTowardLook(b, bomb.x, bomb.z, dt);
  ctx.rounds.botDefuse(b);
}

function respawnAtNearest(b, world, ctx) {
  const spawnList = world.spawns[b.team];
  const s = Array.isArray(spawnList) ? spawnList[0] : spawnList;
  respawnAgent(b, { x: s.x + (ctx.rng.range(-1.5, 1.5)), z: s.z + (ctx.rng.range(-1.5, 1.5)), yaw: s.yaw });
}

// Hearing: gunfire nearby makes a bot turn and look, and walk toward the sound once.
export function hearNoise(b, ev, world) {
  if (!b.alive) return;
  const st = b.bot;
  const d = Math.hypot(ev.x - b.pos.x, ev.z - b.pos.z);
  if (d > ev.r || ev.team === b.team) return;
  st.lastHeard = { x: ev.x, z: ev.z };
  st.heardT = 3;
  if (!st.target && st.role !== ROLE.PLANT && st.role !== ROLE.DEFUSE) {
    st.lookYaw = Math.atan2(-(ev.x - b.pos.x), -(ev.z - b.pos.z));
    if (d < 16 && d > 3) {
      st.goal = { x: ev.x, z: ev.z };
    }
  }
}

export function onNoise(bots, ev, world) {
  for (const b of bots) hearNoise(b, ev, world);
  void EV;
  void W;
}
