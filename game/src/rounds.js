// rounds.js — the match: buy phase, live round, the charge, the win conditions, the
// money both sides earn, and the next round. It owns S.phase and the score.

import { ROUND, ECONOMY, WEAPONS, W, GEAR, GRENADES, PLAYER } from "./config.js";
import { EV } from "./state.js";
import { makeWeapon, refillWeapon, startReload } from "./weapons.js";
import { respawnAgent } from "./player.js";
import { respawnBot, planRound } from "./bots.js";

export function createRounds(S, world, bus, rng, agents) {
  const bomb = {
    planted: false, x: 0, y: 0, z: 0, fuse: 0, site: null,
    carrier: null, defuseT: 0, defuser: null, carrierDead: false,
  };

  function teamAgents(team) {
    return agents.filter((a) => a.team === team);
  }

  function aliveOf(team) {
    return teamAgents(team).filter((a) => a.alive);
  }

  function spawnFor(a, team) {
    const list = world.spawns[team];
    const arr = Array.isArray(list) ? list : [list];
    const base = arr[a.id % arr.length];
    return { x: base.x + rng.range(-1.6, 1.6), z: base.z + rng.range(-1.6, 1.6), yaw: base.yaw };
  }

  function giveDefault(a) {
    if (!a.weapon) a.weapon = makeWeapon("tack");
  }

  function resetRound() {
    S.roundNum++;
    S.phase = "buy";
    S.phaseT = ROUND.buyPhase;
    S.roundT = ROUND.roundTime;
    S.plantProgress = 0;
    S.defuseProgress = 0;
    S.roundWinner = null;
    bomb.planted = false;
    bomb.carrier = null;
    bomb.defuseT = 0;
    bomb.defuser = null;
    bomb.site = null;

    for (const a of agents) {
      a.alive = true;
      a.health = PLAYER.health;
      a.crouched = false;
      a.flash = 0;
      a.eye = 1.62;
      giveDefault(a);
      refillWeapon(a.weapon);
      const sp = spawnFor(a, a.team);
      if (a.bot) respawnBot(a, sp);
      else respawnAgent(a, sp);
      a.killsThisRound = 0;
    }

    const carriers = aliveOf("rooks");
    if (carriers.length) bomb.carrier = rng.pick(carriers);
    for (const a of agents) if (a.bot) a.bot.hasBomb = false;
    if (bomb.carrier && bomb.carrier.bot) bomb.carrier.bot.hasBomb = true;

    planRound(agents.filter((a) => a.bot), rng, world, S.roundNum);
    if (bomb.carrier && bomb.carrier.bot) bomb.carrier.bot.role = "advance";
    bus.emit(EV.ROUND_START, { round: S.roundNum });
    bus.emit(EV.PHASE, S.phase);
  }

  function startMatch() {
    S.roundNum = 0;
    S.score.rooks = 0;
    S.score.wardens = 0;
    S.matchOver = false;
    for (const a of agents) {
      a.money = ECONOMY.start;
      a.kills = 0;
      a.deaths = 0;
      a.bot && (a.bot.hasBomb = false);
      a.nades = { shard: 0, veil: 0, whiteout: 0 };
      a.armor = 0;
      a.helmet = false;
      a.weapon = null;
    }
    S.started = true;
    resetRound();
  }

  function endRound(winner, reason) {
    if (S.phase === "end") return;
    S.phase = "end";
    S.phaseT = 4.5;
    S.roundWinner = winner;
    S.score[winner]++;
    for (const a of agents) {
      const win = a.team === winner;
      const bonus = win ? ECONOMY.win : ECONOMY.lossBase;
      a.money = Math.min(ECONOMY.max, a.money + bonus);
      a.nades = a.nades || { shard: 0, veil: 0, whiteout: 0 };
      // Losing side keeps armour; the winner's armour is repaired for the next buy.
      if (win && a.alive) a.health = PLAYER.health;
    }
    bus.emit(EV.ROUND_END, { winner, reason, score: { ...S.score } });
    if (bomb.planted) bomb.planted = false;
    if (S.score[winner] >= ROUND.winScore) {
      S.matchOver = true;
      bus.emit(EV.MATCH_END, { winner });
    }
  }

  function buy(a, id) {
    if (S.phase !== "buy" || !a.alive) return false;
    const item = W[id] || GEAR.find((g) => g.id === id);
    if (!item || item.price > a.money) return false;
    if (W[id]) {
      if (a.weapon && a.weapon.id === id) return false;
      a.money -= item.price;
      a.weapon = makeWeapon(id);
    } else if (item.kind === "armor") {
      if (a.armor >= 100 && (!item.helmet || a.helmet)) return false;
      a.money -= item.price;
      a.armor = 100;
      a.helmet = !!item.helmet;
    } else if (item.kind === "nade") {
      const have = a.nades[item.nade] || 0;
      if (have >= item.max) return false;
      a.money -= item.price;
      a.nades[item.nade] = have + 1;
    } else return false;
    bus.emit(EV.BUY, { agent: a, id });
    return true;
  }

  function onKill(killer, victim, weaponId) {
    if (victim === killer) return;
    if (killer && killer.team !== victim.team) {
      const reward = ECONOMY.kills[weaponId] ?? ECONOMY.kills.fallback;
      killer.money = Math.min(ECONOMY.max, killer.money + reward);
      killer.kills++;
    }
    victim.deaths++;
    victim.alive = false;
    if (bomb.carrier === victim) {
      bomb.carrierDead = true;
      bomb.carrier = null;
      bomb.x = victim.pos.x;
      bomb.y = victim.pos.y;
      bomb.z = victim.pos.z;
    }
  }

  function plantSite(a) {
    for (const key of Object.keys(world.sites)) {
      const s = world.sites[key];
      if (Math.hypot(a.pos.x - s.x, a.pos.z - s.z) <= s.r) return key;
    }
    return null;
  }

  function doPlant(a, dt) {
    if (bomb.planted || bomb.carrier !== a) return;
    const site = plantSite(a);
    if (!site) { S.plantProgress = Math.max(0, S.plantProgress - dt * 1.6); return; }
    if (a.speed > 1.2) { S.plantProgress = Math.max(0, S.plantProgress - dt); return; }
    S.plantProgress += dt;
    bus.emit(EV.PLANTING, S.plantProgress / ROUND.plantTime);
    if (S.plantProgress >= ROUND.plantTime) {
      bomb.planted = true;
      bomb.site = site;
      bomb.x = a.pos.x;
      bomb.y = a.pos.y + 0.1;
      bomb.z = a.pos.z;
      bomb.fuse = ROUND.fuse;
      bomb.carrier = null;
      S.plantProgress = 0;
      a.money = Math.min(ECONOMY.max, a.money + ECONOMY.plant);
      bus.emit(EV.PLANT, { site, by: a });
    }
  }

  function doDefuse(a, dt) {
    if (!bomb.planted) return;
    const d = Math.hypot(a.pos.x - bomb.x, a.pos.z - bomb.z);
    if (d > 1.7 || a.speed > 1.4) {
      if (bomb.defuser === a) bomb.defuser = null;
      S.defuseProgress = Math.max(0, S.defuseProgress - dt * 1.5);
      return;
    }
    if (bomb.defuser && bomb.defuser !== a) return;
    bomb.defuser = a;
    S.defuseProgress += dt;
    bus.emit(EV.DEFUSE, S.defuseProgress / ROUND.defuseTime);
    if (S.defuseProgress >= ROUND.defuseTime) {
      endRound("wardens", "defused");
      bus.emit(EV.BANNER, { main: "CHARGE DEFUSED", sub: "WARDENS HOLD THE WORKS" });
    }
  }

  return {
    bomb,
    startMatch,
    resetRound,
    buy,
    onKill,
    plantSite,
    update(dt, ctx) {
      if (S.phase === "idle") return;
      if (S.phase === "buy") {
        S.phaseT -= dt;
        if (S.phaseT <= 0) {
          S.phase = "live";
          S.phaseT = 0;
          bus.emit(EV.PHASE, S.phase);
          bus.emit(EV.BANNER, { main: "ROUND " + S.roundNum, sub: "GO" });
        }
        return;
      }
      if (S.phase === "end") {
        S.phaseT -= dt;
        if (S.phaseT <= 0) {
          if (S.matchOver) { S.phase = "over"; bus.emit(EV.BANNER, { main: "MATCH OVER", sub: "" }); return; }
          resetRound();
        }
        return;
      }
      if (S.phase !== "live") return;

      S.roundT -= dt;
      const player = S.player;
      const eKey = S.input.keys.has("KeyE");

      if (bomb.planted) {
        bomb.fuse -= dt;
        if (bomb.fuse <= 0) {
          endRound("rooks", "detonated");
          bus.emit(EV.BANNER, { main: "CHARGE DETONATED", sub: "ROOKS TAKE THE ROUND" });
          if (ctx.fx) ctx.fx.blast(bomb.x, bomb.y + 1, bomb.z, 8);
          if (ctx.audio) ctx.audio.play("boom", { pos: bomb, byPlayer: false });
          return;
        }
        if (Math.floor(bomb.fuse) !== Math.floor(bomb.fuse + dt) && ctx.audio) {
          ctx.audio.play("beep", { pos: bomb, byPlayer: false });
        }
      }

      if (player && player.alive && bomb.carrier === player && eKey) doPlant(player, dt);
      else if (player && bomb.carrier === player) S.plantProgress = Math.max(0, S.plantProgress - dt * 1.2);

      if (player && player.alive && bomb.planted && eKey && player.team === "wardens") doDefuse(player, dt);
      else if (bomb.defuser && bomb.defuser === player) { bomb.defuser = null; S.defuseProgress = Math.max(0, S.defuseProgress - dt * 1.2); }

      const rooks = aliveOf("rooks");
      const wardens = aliveOf("wardens");
      if (!bomb.planted) {
        if (!rooks.length && !wardens.length) endRound("wardens", "mutual elimination");
        else if (!rooks.length) endRound("wardens", "attackers down");
        else if (!wardens.length) endRound("rooks", "defenders down");
        else if (S.roundT <= 0) endRound("wardens", "time");
      } else if (!wardens.length) {
        endRound("rooks", "site cleared");
      }
    },
    bombPlanted() { return bomb.planted; },
    bombPos() { return bomb.planted ? { x: bomb.x, y: bomb.y, z: bomb.z } : null; },
    botPlant(b) { doPlant(b, 1 / 60); },
    botDefuse(b) { doDefuse(b, 1 / 60); },
    forcePlant(site) {
      bomb.planted = true;
      bomb.site = site;
      bomb.fuse = ROUND.fuse;
      const s = world.sites[site];
      bomb.x = s.x;
      bomb.z = s.z;
      bomb.y = 0.1;
      bomb.carrier = null;
    },
    refill(a) { if (a.weapon) refillWeapon(a.weapon); },
    reload(a) { if (a.weapon) startReload(a.weapon); },
    priceList: () => WEAPONS.concat(GEAR),
    nadeDefs: GRENADES,
    teamAgents,
    aliveOf,
  };
}
