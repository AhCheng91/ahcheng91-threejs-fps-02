// collision.js — AABB world colliders, per-axis move-and-slide with stair step-up,
// ray vs world, ray vs agents (head sphere / body box), sphere tests. No allocation
// in per-frame movement paths; results of casts are small plain objects.

// A world collider is a plain object { x0,y0,z0,x1,y1,z1 } with x0<x1 etc.

// Per-axis push against a box list. ext: { r, y0, y1 } computed by caller.
// Returns true when the agent was pushed out (velocity should die on that axis);
// false when it was stepped up onto a lip (keep moving).
function pushAxis(axis, pos, r, y0, y1, vel, boxes, step) {
  const x = pos.x, y = pos.y, z = pos.z;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (y1 <= b.y0 || y0 >= b.y1) continue;
    if (x + r <= b.x0 || x - r >= b.x1) continue;
    if (z + r <= b.z0 || z - r >= b.z1) continue;
    if (axis === 0) { // X
      const lip = b.y1 - y;
      if (step && lip > 0 && lip <= step) { pos.y = b.y1; return false; }
      if (vel >= 0) pos.x = b.x0 - r; else pos.x = b.x1 + r;
      return true;
    } else if (axis === 2) { // Z
      const lip = b.y1 - y;
      if (step && lip > 0 && lip <= step) { pos.y = b.y1; return false; }
      if (vel >= 0) pos.z = b.z0 - r; else pos.z = b.z1 + r;
      return true;
    } else { // Y
      if (vel >= 0) pos.y = b.y0 - (y1 - y); else pos.y = b.y1;
      return true;
    }
  }
  return false;
}

// Move an upright agent (feet at pos.y, top at pos.y+h, half-width r) by vel*dt,
// resolving per axis. Returns true when grounded after the move.
export function moveAgent(pos, vel, dt, r, h, boxes, step) {
  let grounded = false;
  pos.x += vel.x * dt;
  if (pushAxis(0, pos, r, pos.y, pos.y + h, vel.x, boxes, step)) vel.x = 0;
  pos.z += vel.z * dt;
  if (pushAxis(2, pos, r, pos.y, pos.y + h, vel.z, boxes, step)) vel.z = 0;
  pos.y += vel.y * dt;
  if (pushAxis(1, pos, r, pos.y, pos.y + h, vel.y, boxes, 0)) {
    if (vel.y < 0) grounded = true;
    vel.y = 0;
  }
  return grounded;
}

// Move a point-sphere (radius r) with per-axis resolution, no step. Returns array
// [hitX, hitY, hitZ] flags so the caller can bounce off surfaces.
export function moveSphere(pos, vel, dt, r, boxes) {
  const hits = [0, 0, 0];
  pos.x += vel.x * dt;
  if (pushAxis(0, pos, r, pos.y - r, pos.y + r, vel.x, boxes, 0)) { hits[0] = 1; vel.x = 0; }
  pos.z += vel.z * dt;
  if (pushAxis(2, pos, r, pos.y - r, pos.y + r, vel.z, boxes, 0)) { hits[2] = 1; vel.z = 0; }
  pos.y += vel.y * dt;
  if (pushAxis(1, pos, r, pos.y - r, pos.y + r, vel.y, boxes, 0)) { hits[1] = 1; vel.y = 0; }
  return hits;
}

// True when an upright AABB overlaps any box (used for spawn / spot checks).
export function overlapsAny(x, y, z, r, h, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (y + h <= b.y0 || y >= b.y1) continue;
    if (x + r <= b.x0 || x - r >= b.x1) continue;
    if (z + r <= b.z0 || z - r >= b.z1) continue;
    return true;
  }
  return false;
}

export function pointInBox(px, py, pz, b) {
  return px > b.x0 && px < b.x1 && py > b.y0 && py < b.y1 && pz > b.z0 && pz < b.z1;
}

// Slab test: ray (o + t*d, d normalized) vs AABB. Returns {t,x,y,z,nx,ny,nz} or null.
export function rayBox(o, d, b) {
  let t0 = 0, t1 = Infinity;
  let nx = 0, ny = 0, nz = 0;
  let tmin, tmax;
  if (Math.abs(d.x) < 1e-9) { if (o.x < b.x0 || o.x > b.x1) return null; }
  else {
    tmin = (b.x0 - o.x) / d.x; tmax = (b.x1 - o.x) / d.x;
    if (tmin > tmax) { const s = tmin; tmin = tmax; tmax = s; }
    if (tmin > t0) { t0 = tmin; nx = d.x > 0 ? -1 : 1; }
    if (tmax < t1) t1 = tmax;
    if (t0 > t1) return null;
  }
  if (Math.abs(d.y) < 1e-9) { if (o.y < b.y0 || o.y > b.y1) return null; }
  else {
    tmin = (b.y0 - o.y) / d.y; tmax = (b.y1 - o.y) / d.y;
    if (tmin > tmax) { const s = tmin; tmin = tmax; tmax = s; }
    if (tmin > t0) { t0 = tmin; ny = d.y > 0 ? -1 : 1; }
    if (tmax < t1) t1 = tmax;
    if (t0 > t1) return null;
  }
  if (Math.abs(d.z) < 1e-9) { if (o.z < b.z0 || o.z > b.z1) return null; }
  else {
    tmin = (b.z0 - o.z) / d.z; tmax = (b.z1 - o.z) / d.z;
    if (tmin > tmax) { const s = tmin; tmin = tmax; tmax = s; }
    if (tmin > t0) { t0 = tmin; nz = d.z > 0 ? -1 : 1; }
    if (tmax < t1) t1 = tmax;
    if (t0 > t1) return null;
  }
  return { t: t0, x: o.x + d.x * t0, y: o.y + d.y * t0, z: o.z + d.z * t0, nx, ny, nz };
}

// Closest box along the ray up to maxT. Returns box hit or null.
export function rayWorld(o, d, maxT, boxes) {
  let best = null, bt = maxT;
  for (let i = 0; i < boxes.length; i++) {
    const h = rayBox(o, d, boxes[i]);
    if (h && h.t < bt) { bt = h.t; best = h; }
  }
  return best;
}

export function raySphere(o, d, cx, cy, cz, r) {
  const lx = cx - o.x, ly = cy - o.y, lz = cz - o.z;
  const tc = lx * d.x + ly * d.y + lz * d.z;
  if (tc < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  if (d2 > r * r) return -1;
  return tc - Math.sqrt(r * r - d2);
}

// Agent geometry: body AABB [pos, pos+height] x radius; head sphere at pos+headH.
export function agentParts(a) {
  return {
    r: a.radius,
    h: a.height,
    headH: a.height - 0.18,
    headR: 0.16,
    legH: 0.5,
  };
}

// Cast a shot ray: returns the nearest hit among world boxes and agents (head gets
// part "head", body "body", below legH "legs"). ignore is the shooter (or null).
export function castRay(o, d, maxT, boxes, agents, ignore) {
  const r = rayWorld(o, d, maxT, boxes);
  let t = r ? r.t : maxT;
  let best = r ? { kind: "world", t: r.t, x: r.x, y: r.y, z: r.z, nx: r.nx, ny: r.ny, nz: r.nz } : null;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.alive || a === ignore) continue;
    const hh = a.height - 0.18, hr = 0.16;
    const th = raySphere(o, d, a.pos.x, a.pos.y + hh, a.pos.z, hr);
    if (th >= 0 && th < t) { t = th; best = { kind: "agent", agent: a, part: "head", t: th, x: o.x + d.x * th, y: o.y + d.y * th, z: o.z + d.z * th }; }
    const tb = rayBox(o, d, { x0: a.pos.x - a.radius, x1: a.pos.x + a.radius, y0: a.pos.y, y1: a.pos.y + a.height, z0: a.pos.z - a.radius, z1: a.pos.z + a.radius });
    if (tb) {
      if (tb.t < t) {
        const part = tb.y < a.pos.y + 0.5 ? "legs" : "body";
        best = { kind: "agent", agent: a, part, t: tb.t, x: tb.x, y: tb.y, z: tb.z, nx: tb.nx, ny: tb.ny, nz: tb.nz };
        t = tb.t;
      } else if (tb.t === t) { /* keep head */ }
    }
  }
  return best;
}

// True when a straight segment between two points is not blocked by a world box.
export function hasLOS(x0, y0, z0, x1, y1, z1, boxes) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const d = { x: dx / len, y: dy / len, z: dz / len };
  const h = rayWorld({ x: x0, y: y0, z: z0 }, d, len - 0.2, boxes);
  return !h;
}

// Sphere vs box overlap.
export function sphereHitsBox(cx, cy, cz, r, b) {
  const px = Math.max(b.x0, Math.min(cx, b.x1));
  const py = Math.max(b.y0, Math.min(cy, b.y1));
  const pz = Math.max(b.z0, Math.min(cz, b.z1));
  const dx = cx - px, dy = cy - py, dz = cz - pz;
  return dx * dx + dy * dy + dz * dz <= r * r;
}
