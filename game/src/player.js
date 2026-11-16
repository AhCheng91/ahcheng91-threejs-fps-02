// player.js — one agent body: movement, crouch, jump, mouse look, and the damage
// every agent (player or bot) takes. The same functions run for both sides.

import { PHYS, PLAYER } from "./config.js";
import { moveAgent } from "./collision.js";

export function makeAgent(def) {
  return {
    id: def.id,
    name: def.name,
    team: def.team,
    isPlayer: !!def.isPlayer,
    pos: { x: def.x, y: 0, z: def.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: def.yaw || 0,
    pitch: 0,
    radius: PLAYER.radius,
    height: PLAYER.stand,
    crouched: false,
    eye: PHYS.eyeStand,
    grounded: true,
    health: PLAYER.health,
    armor: 0,
    helmet: false,
    alive: true,
    kills: 0,
    deaths: 0,
    money: 0,
    weapon: null,
    nades: { shard: 0, veil: 0, whiteout: 0 },
    bob: 0,
    flash: 0,
    speed: 0,
    lastDamage: 0,
    bot: null,
  };
}

export function createPlayer(def) {
  const p = makeAgent(def);
  return p;
}

// How fast an agent may move right now, from stance and the walk key.
export function moveSpeed(a, input) {
  if (a.crouched) return PHYS.crouch;
  if (input && input.walk) return PHYS.shift;
  return PHYS.walk;
}

// Ground acceleration with friction, then collision, then gravity. Returns true when
// the agent is on the ground at the end of the step.
export function stepBody(a, dt, wishX, wishZ, speed, boxes) {
  const accel = a.grounded ? PHYS.accel : PHYS.airAccel;
  const tx = wishX * speed, tz = wishZ * speed;
  const lerp = Math.min(1, accel * dt / Math.max(0.001, speed));
  a.vel.x += (tx - a.vel.x) * lerp;
  a.vel.z += (tz - a.vel.z) * lerp;
  if (!wishX && !wishZ && a.grounded) {
    const f = Math.max(0, 1 - PHYS.groundFric * dt);
    a.vel.x *= f;
    a.vel.z *= f;
    if (Math.abs(a.vel.x) < 0.02) a.vel.x = 0;
    if (Math.abs(a.vel.z) < 0.02) a.vel.z = 0;
  }
  a.vel.y -= PHYS.gravity * dt;
  if (a.vel.y < -PHYS.maxFall) a.vel.y = -PHYS.maxFall;
  a.grounded = moveAgent(a.pos, a.vel, dt, a.radius, a.height, boxes, PHYS.stepUp);
  a.speed = Math.hypot(a.vel.x, a.vel.z);
  return a.grounded;
}

// The player's own step: mouse look is already in S.input, this applies stance,
// jump and view bob on top of the shared body step.
export function updatePlayer(p, dt, input, boxes, frozen) {
  if (!p.alive) { p.vel.x = 0; p.vel.z = 0; return; }
  if (frozen) {
    // Freeze time: you may look around, not walk.
    p.yaw = input.yaw;
    p.pitch = input.pitch;
    p.speed = 0;
    stepBody(p, dt, 0, 0, 0, boxes);
    return;
  }
  const wish = wishVector(input.yaw, input.move.x, input.move.y);
  const speed = moveSpeed(p, input);
  if (p.crouched && input.keys.has("Space")) p.crouched = false;
  p.eye += (desiredEye(p) - p.eye) * Math.min(1, PHYS.crouchLerp * dt * 60);
  stepBody(p, dt, wish.x, wish.z, speed, boxes);
  if (input.keys.has("Space") && p.grounded) {
    p.vel.y = PHYS.jump;
    p.grounded = false;
  }
  p.yaw = input.yaw;
  p.pitch = input.pitch;
  p.bob += p.grounded ? p.speed * dt * PHYS.bobFreq : 0;
}

export function wishVector(yaw, mx, my) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  // forward is -Z at yaw 0, right is +X, so the two axes mix with opposite signs.
  return { x: mx * cos - my * sin, z: -mx * sin - my * cos };
}

export function desiredEye(a) {
  return a.crouched ? PHYS.eyeCrouch : PHYS.eyeStand;
}

// Camera eye height including the walk bob, so the view moves with the step.
export function eyeHeight(a) {
  const bob = a.grounded ? Math.sin(a.bob) * PHYS.bobAmp * Math.min(1, a.speed / PHYS.walk) : 0;
  return a.eye + bob;
}

// Apply damage from a shot. part is "head", "body" or "legs"; the caller has already
// multiplied the base damage. Armour soaks a share until it runs out.
export function damageAgent(a, amount, part) {
  if (!a.alive) return 0;
  let dmg = amount;
  if (part === "legs") dmg *= 0.75;
  if (a.armor > 0 && part !== "legs") {
    const soaked = Math.min(a.armor, dmg * 0.5);
    a.armor -= soaked;
    dmg -= soaked * 0.75;
    if (part === "head" && a.helmet) dmg *= 0.8;
    if (a.armor < 1) a.armor = 0;
  }
  a.health -= dmg;
  a.lastDamage = 0;
  if (a.health <= 0) {
    a.health = 0;
    a.alive = false;
    return dmg;
  }
  return dmg;
}

// Put an agent back on its feet at a spawn point with a full magazine.
export function respawnAgent(a, spawn) {
  a.pos.x = spawn.x;
  a.pos.y = 0;
  a.pos.z = spawn.z;
  a.vel.x = 0;
  a.vel.y = 0;
  a.vel.z = 0;
  a.yaw = spawn.yaw || 0;
  a.pitch = 0;
  a.health = PLAYER.health;
  a.alive = true;
  a.crouched = false;
  a.eye = PHYS.eyeStand;
  a.grounded = true;
  a.flash = 0;
}
