// weapons.js — the ballistics of one shot. Cooldown, magazine, reload, spread from
// stance and speed, recoil that climbs and settles, pellets, range falloff and the
// head multiplier. The hit is a ray against the same world boxes the movement uses.

import { W, PHYS } from "./config.js";
import { castRay } from "./collision.js";
import { EV } from "./state.js";

export function makeWeapon(id) {
  const def = W[id];
  return {
    id,
    def,
    mag: def.mag,
    reserve: def.reserve,
    cool: 0,
    reloading: false,
    reloadT: 0,
    ads: false,
    recoilUp: 0,
    recoilSide: 0,
    bloom: 0,
    shots: 0,
  };
}

export function refillWeapon(w) {
  w.mag = w.def.mag;
  w.reserve = w.def.reserve;
  w.cool = 0;
  w.reloading = false;
  w.reloadT = 0;
  w.recoilUp = 0;
  w.recoilSide = 0;
  w.bloom = 0;
}

export function startReload(w) {
  if (w.reloading || w.mag >= w.def.mag || w.reserve <= 0) return false;
  w.reloading = true;
  w.reloadT = w.def.reload;
  return true;
}

export function tickWeapon(w, dt) {
  if (w.cool > 0) w.cool -= dt;
  if (w.reloading) {
    w.reloadT -= dt;
    if (w.reloadT <= 0) {
      const need = w.def.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take;
      w.reserve -= take;
      w.reloading = false;
      w.reloadT = 0;
    }
  }
  const rec = w.recoilUp * Math.min(1, w.def.recoil.recovery * dt);
  const recS = w.recoilSide * Math.min(1, w.def.recoil.recovery * dt);
  w.recoilUp -= rec;
  w.recoilSide -= recS;
  w.bloom *= Math.max(0, 1 - 6 * dt);
}

// Half-cone spread in radians for the shot about to be fired.
export function spreadOf(w, a) {
  const s = w.def.spread;
  let v = s[0];
  if (a.crouched) v += s[3] - s[0];
  if (w.ads) v += s[4] - s[0];
  const move = Math.min(1, a.speed / PHYS.walk);
  v += (s[2] - s[0]) * move;
  v += w.bloom;
  return v;
}

export function aimVector(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

// Muzzle in world space: a little right of the eye, a little low, just past the barrel.
export function muzzlePos(a) {
  const d = aimVector(a.yaw, a.pitch);
  const right = { x: Math.cos(a.yaw), z: -Math.sin(a.yaw) };
  return {
    x: a.pos.x + right.x * 0.16 + d.x * 0.42,
    y: a.pos.y + a.eye - 0.1 + d.y * 0.42,
    z: a.pos.z + right.z * 0.16 + d.z * 0.42,
  };
}

function rotate(d, yawOff, pitchOff) {
  const yaw = Math.atan2(-d.x, -d.z) + yawOff;
  const pitch = Math.asin(Math.max(-1, Math.min(1, d.y))) + pitchOff;
  return aimVector(yaw, pitch);
}

// Fire once. Returns { fired, hit } and reports through ctx (fx, audio, bus, onKill).
export function tryFire(shooter, w, world, agents, rng, ctx) {
  if (w.reloading || w.cool > 0) return { fired: false };
  if (w.mag <= 0) {
    if (startReload(w) && ctx.audio) ctx.audio.play("empty");
    return { fired: false, empty: true };
  }
  w.mag--;
  w.cool = 60 / w.def.rpm;
  w.shots++;

  const origin = { x: shooter.pos.x, y: shooter.pos.y + shooter.eye, z: shooter.pos.z };
  const base = aimVector(shooter.yaw - w.recoilSide * 0.01, shooter.pitch + w.recoilUp * 0.01);
  const spread = spreadOf(w, shooter);
  let firstHit = null;

  for (let p = 0; p < w.def.pellets; p++) {
    const ang = rng.range(0, Math.PI * 2);
    const rad = spread * Math.sqrt(rng.rnd());
    const dir = rotate(base, Math.cos(ang) * rad, Math.sin(ang) * rad);
    const maxT = w.def.range[1];
    const hit = castRay(origin, dir, maxT, world.boxes, agents, shooter);
    const end = hit ? { x: hit.x, y: hit.y, z: hit.z } : { x: origin.x + dir.x * maxT, y: origin.y + dir.y * maxT, z: origin.z + dir.z * maxT };
    if (ctx.fx) ctx.fx.tracer(origin, end, shooter.isPlayer ? 0xffd08a : 0xffb040);
    if (hit) {
      if (hit.kind === "agent") {
        const dist = hit.t;
        const fall = falloff(w.def.range, dist);
        let dmg = w.def.dmg * fall;
        if (hit.part === "head") dmg *= w.def.headshot;
        const dealt = ctx.applyDamage(shooter, hit.agent, dmg, hit.part);
        if (ctx.fx) ctx.fx.blood(hit.x, hit.y, hit.z);
        if (ctx.audio) ctx.audio.play("hit", { dist, byPlayer: shooter.isPlayer });
        if (shooter.isPlayer && ctx.bus) ctx.bus.emit(EV.HIT, { head: hit.part === "head", kill: !hit.agent.alive, dealt });
        if (!firstHit) firstHit = { agent: hit.agent, part: hit.part, dealt };
      } else if (ctx.fx) {
        ctx.fx.impact(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz);
      }
    }
  }

  // Recoil climbs with each shot and pushes the view up and to one side.
  const r = w.def.recoil;
  const climb = 1 + Math.min(1.5, w.shots * 0.06);
  w.recoilUp += r.up * climb * (w.ads ? 0.7 : 1);
  w.recoilSide += r.side * rng.sign();
  w.bloom = Math.min(0.05, w.bloom + spread * 0.5);
  shooter.pitch = clampPitch(shooter.pitch + r.up * 0.0022 * climb * (w.ads ? 0.75 : 1));
  shooter.yaw += r.side * 0.0011 * rng.sign();

  if (ctx.fx) ctx.fx.muzzle(muzzlePos(shooter), shooter.isPlayer);
  if (ctx.audio) ctx.audio.play("shot_" + w.id, { pos: shooter.pos, byPlayer: shooter.isPlayer });
  if (ctx.bus) ctx.bus.emit(EV.NOISE, { x: shooter.pos.x, y: shooter.pos.y, z: shooter.pos.z, team: shooter.team, r: 34 });
  if (w.mag === 0 && w.def.autoReload) startReload(w);
  return { fired: true, hit: firstHit };
}

export function clampPitch(p) {
  const lim = Math.PI / 2 - 0.02;
  return p > lim ? lim : p < -lim ? -lim : p;
}

export function falloff(range, dist) {
  const [near, far, min] = range;
  if (dist <= near) return 1;
  if (dist >= far) return min;
  const t = (dist - near) / (far - near);
  return 1 + (min - 1) * t;
}
