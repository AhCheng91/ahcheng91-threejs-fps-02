// grenades.js — thrown gear: a shard that hurts through a radius, a veil of smoke
// and a whiteout flash. Each one is a small projectile stepped with the same
// collision the bodies use.

import { GRENADES } from "./config.js";
import { moveSphere, hasLOS } from "./collision.js";
import { damageAgent } from "./player.js";
import { EV } from "./state.js";

export function createGrenades(S, world, bus) {
  const live = [];
  let flashT = 0;

  function throwFrom(a, kind, audio) {
    if (!a.nades || !a.nades[kind] || a.nades[kind] <= 0) return false;
    a.nades[kind]--;
    const d = {
      x: -Math.sin(a.yaw) * Math.cos(a.pitch),
      y: Math.sin(a.pitch) + 0.16,
      z: -Math.cos(a.yaw) * Math.cos(a.pitch),
    };
    const speed = 15;
    live.push({
      kind,
      def: GRENADES[kind],
      pos: { x: a.pos.x + d.x * 0.4, y: a.pos.y + a.eye - 0.05, z: a.pos.z + d.z * 0.4 },
      vel: { x: d.x * speed + (a.vel ? a.vel.x : 0), y: d.y * speed, z: d.z * speed + (a.vel ? a.vel.z : 0) },
      fuse: GRENADES[kind].fuse || 2,
      owner: a,
      rest: 0,
    });
    if (audio) audio.play("step", { pos: a.pos, byPlayer: a.isPlayer });
    return true;
  }

  function explode(g, ctx) {
    const { fx, audio, agents } = ctx;
    const def = g.def;
    if (g.kind === "shard") {
      if (fx) fx.blast(g.pos.x, g.pos.y, g.pos.z, def.radius);
      if (audio) audio.play("boom", { pos: g.pos, byPlayer: false });
      for (const a of agents) {
        if (!a.alive) continue;
        const d = Math.hypot(a.pos.x - g.pos.x, a.pos.y + 0.8 - g.pos.y, a.pos.z - g.pos.z);
        if (d > def.radius) continue;
        if (!hasLOS(g.pos.x, g.pos.y, g.pos.z, a.pos.x, a.pos.y + a.eye, a.pos.z, world.boxes)) continue;
        const fall = 1 - d / def.radius;
        const dmg = def.maxDmg * fall * fall;
        const dealt = damageAgent(a, dmg, "body");
        if (a.isPlayer && bus) bus.emit(EV.HURT, { angle: 0, dealt });
        if (ctx.onKill && !a.alive) ctx.onKill(g.owner, a, "shard");
      }
      if (bus) bus.emit(EV.NOISE, { x: g.pos.x, y: g.pos.y, z: g.pos.z, team: g.owner.team, r: 26 });
    } else if (g.kind === "veil") {
      if (fx) fx.smoke(g.pos.x, g.pos.y + 0.5, g.pos.z, [0.2, 0.22, 0.24]);
      if (audio) audio.play("smoke", { pos: g.pos, byPlayer: false });
      if (bus) bus.emit(EV.NOISE, { x: g.pos.x, y: g.pos.y, z: g.pos.z, team: g.owner.team, r: 12 });
    } else {
      if (fx) fx.blast(g.pos.x, g.pos.y, g.pos.z, 6);
      if (audio) audio.play("beep", { pos: g.pos, byPlayer: false });
      const a = S.player;
      if (a && a.alive) {
        const d = Math.hypot(a.pos.x - g.pos.x, a.pos.z - g.pos.z);
        if (d < def.radius && hasLOS(g.pos.x, g.pos.y, g.pos.z, a.pos.x, a.pos.y + a.eye, a.pos.z, world.boxes)) {
          flashT = Math.min(1.6, def.duration * (1 - d / def.radius));
        }
      }
    }
  }

  return {
    live,
    throwFrom,
    flash() {
      flashT = Math.max(0, flashT);
      return flashT;
    },
    update(dt, ctx) {
      if (flashT > 0) flashT -= dt;
      for (let i = live.length - 1; i >= 0; i--) {
        const g = live[i];
        g.vel.y -= 13.5 * dt;
        const hits = moveSphere(g.pos, g.vel, dt, 0.12, world.boxes);
        if (hits[0] || hits[2]) { g.vel.x *= -0.35; g.vel.z *= -0.35; g.vel.y *= 0.7; }
        if (hits[1]) { g.vel.y *= -0.32; g.vel.x *= 0.6; g.vel.z *= 0.6; g.rest = 0.2; }
        if (g.pos.y < 0.1) { g.pos.y = 0.1; g.vel.y = Math.abs(g.vel.y) * 0.3; g.vel.x *= 0.72; g.vel.z *= 0.72; }
        g.fuse -= dt;
        if (g.fuse <= 0) {
          explode(g, ctx);
          live.splice(i, 1);
        }
      }
    },
  };
}
