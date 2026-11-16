// shots.js — the four staged scenes the screenshots are taken from. Each one puts the
// camera somewhere worth looking at and the bots somewhere worth fighting, all from a
// fixed seed, so the same build always renders the same frame.

import { S as STATE, EV } from "./state.js";
import { makeWeapon } from "./weapons.js";

function face(a, x, z) {
  a.yaw = Math.atan2(-(x - a.pos.x), -(z - a.pos.z));
  if (a.isPlayer) {
    STATE.input.yaw = a.yaw;
    STATE.input.pitch = a.pitch;
  }
}

function place(a, x, y, z, yaw) {
  a.pos.x = x;
  a.pos.y = y;
  a.pos.z = z;
  a.vel.x = 0;
  a.vel.y = 0;
  a.vel.z = 0;
  a.yaw = yaw;
  a.pitch = 0;
  a.alive = true;
  a.health = 100;
  if (!a.weapon) a.weapon = makeWeapon(a.isPlayer ? "kestrel" : "kestrel");
}

function aim(a, x, y, z) {
  const dx = x - a.pos.x, dz = z - a.pos.z, dy = y - (a.pos.y + a.eye);
  a.yaw = Math.atan2(-dx, -dz);
  a.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  if (a.isPlayer) {
    STATE.input.yaw = a.yaw;
    STATE.input.pitch = a.pitch;
  }
}

export function setupShot(name, seed, api) {
  const { S, world, agents, rounds, hud, buyMenu } = api;
  const player = S.player;
  const allies = agents.filter((a) => a.team === "rooks" && !a.isPlayer);
  const enemies = agents.filter((a) => a.team === "wardens");

  S.bus.emit(EV.PHASE, "live");
  rounds.startMatch();
  S.phase = "live";
  S.roundT = name === "objective" ? 52 : 96;
  S.roundNum = name === "fight" ? 4 : name === "objective" ? 6 : 1;
  S.score.rooks = name === "fight" ? 3 : 2;
  S.score.wardens = name === "fight" ? 2 : 1;
  player.money = name === "buy" ? 3450 : 1400;
  player.weapon = makeWeapon(name === "buy" ? "tack" : name === "fight" ? "kestrel" : "kestrel");
  player.armor = name === "buy" ? 0 : 100;
  player.helmet = name !== "buy";
  player.nades.shard = 1;
  player.nades.veil = 1;
  for (const a of agents) if (!a.isPlayer) a.money = 2200;

  if (name === "map") {
    place(player, 0, 58, 46, Math.PI);
    aim(player, 0, 0, 0);
    for (const a of agents) if (!a.isPlayer) place(a, 0, 0, 30, 0);
    S.phase = "buy";
    return;
  }
  if (name === "cover") {
    place(player, 26.5, 0, -9, 0);
    aim(player, 27, 1.0, -27);
    player.pitch = -0.01;
    STATE.input.pitch = -0.01;
    place(allies[0], 22.5, 0, -13, 0);
    aim(allies[0], 26, 1.2, -26);
    place(allies[1], 30.5, 0, -14.5, 0);
    aim(allies[1], 28, 1.2, -26);
    place(allies[2], 24, 0, -4, 0);
    place(enemies[0], 25, 0, -24, 0);
    aim(enemies[0], 26.5, 1.3, -9);
    place(enemies[1], 29.5, 0, -25, 0);
    aim(enemies[1], 27, 1.3, -10);
    place(enemies[2], 23, 0, -27.5, 0);
    aim(enemies[2], 26, 1.3, -11);
    place(enemies[3], 30, 0, -20, 0);
    for (const e of enemies) e.bot.role = "hold";
  } else if (name === "buy") {
    place(player, 0, 0, 24, 0);
    aim(player, 0, 1.6, 10);
    for (let i = 0; i < allies.length; i++) place(allies[i], -3 + i * 3, 0, 20 + (i % 2) * 2, 0);
    for (let i = 0; i < enemies.length; i++) place(enemies[i], -6 + i * 4, 0, -20, 0);
    S.phase = "buy";
    S.phaseT = 14;
    buyMenu.setOpen(true);
  } else if (name === "fight") {
    place(player, 25, 0, -17, 0);
    aim(player, 13, 1.3, -17);
    STATE.input.fire = true;
    place(allies[0], 21, 0, -12, 0);
    aim(allies[0], 12, 1.3, -16);
    place(allies[1], 20, 0, -22, 0);
    aim(allies[1], 11, 1.3, -20);
    place(allies[2], 26, 0, -9, 0);
    place(enemies[0], 12, 0, -16, 0);
    aim(enemies[0], 24, 1.3, -17);
    place(enemies[1], 9, 0, -12, 0);
    aim(enemies[1], 22, 1.3, -16);
    place(enemies[2], 14, 0, -21, 0);
    aim(enemies[2], 25, 1.3, -18);
    place(enemies[3], 8, 0, -20, 0);
    aim(enemies[3], 24, 1.3, -17);
    for (const a of agents) if (a.bot) { a.bot.reactT = 0; a.bot.seeT = 0.6; }
    hud.banner("ROUND 5", "SITE A \u00B7 ROOKS PUSH", 3);
  } else {
    // objective: the charge is down at site A and the wardens are coming to it.
    rounds.forcePlant("A");
    rounds.bomb.fuse = 34;
    place(player, 19.5, 0, -20, 0);
    aim(player, 27, 0.6, -27);
    player.crouched = true;
    STATE.input.crouch = true;
    player.eye = 1.62;
    place(allies[0], 23, 0, -23, 0);
    aim(allies[0], 27, 1.0, -27);
    place(allies[1], 16.5, 0, -24, 0);
    aim(allies[1], 26, 1.0, -26.5);
    place(allies[2], 21, 0, -16.5, 0);
    place(enemies[0], 26.4, 0, -26.2, 0);
    aim(enemies[0], 27, 0.4, -27);
    place(enemies[1], 30, 0, -23, 0);
    aim(enemies[1], 20, 1.3, -20);
    place(enemies[2], 24, 0, -29.5, 0);
    place(enemies[3], 30.5, 0, -28, 0);
    hud.banner("CHARGE ARMED", "SITE A \u00B7 34S", 4);
  }

  S.phase = name === "buy" ? "buy" : "live";
  STATE.seed = seed;
  for (const a of agents) {
    a.speed = 0;
    a.bob = 0;
  }
}
