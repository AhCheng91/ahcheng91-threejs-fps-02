import { hasLOS } from "./collision.js";

const EDGE = 12;

export function buildNav(world) {
  const wps = world.waypoints.map((w) => ({ id: w.id, x: w.x, y: 0, z: w.z, lane: w.lane }));
  const idx = new Map();
  wps.forEach((w, i) => idx.set(w.id, i));
  const adj = wps.map(() => []);
  const boxes = world.boxes;
  for (let i = 0; i < wps.length; i++) {
    for (let j = i + 1; j < wps.length; j++) {
      const a = wps[i], b = wps[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > EDGE) continue;
      if (hasLOS(a.x, 1.5, a.z, b.x, 1.5, b.z, boxes)) {
        adj[i].push({ to: j, w: d });
        adj[j].push({ to: i, w: d });
      }
    }
  }
  const nearest = (p) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < wps.length; i++) {
      const d = (wps[i].x - p.x) ** 2 + (wps[i].z - p.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return wps[best];
  };
  function aStar(si, gi) {
    const open = [si], g = wps.map(() => Infinity), came = wps.map(() => -1);
    g[si] = 0;
    while (open.length) {
      let u = 0;
      for (let k = 1; k < open.length; k++) if (g[open[k]] < g[open[u]]) u = k;
      const c = open.splice(u, 1)[0];
      if (c === gi) break;
      for (const e of adj[c]) {
        const ng = g[c] + e.w;
        if (ng < g[e.to]) { g[e.to] = ng; came[e.to] = c; if (!open.includes(e.to)) open.push(e.to); }
      }
    }
    const out = [];
    for (let c = gi; c !== -1; c = came[c]) out.push(c);
    out.reverse();
    return out[0] === si ? out : [si, gi];
  }
  const path = (a, b) => {
    const si = nearest(a).id, gi = nearest(b).id;
    return aStar(idx.get(si), idx.get(gi)).map((i) => ({ x: wps[i].x, y: 0, z: wps[i].z }));
  };
  const laneRoute = (lane, rng) => {
    const lanes = wps.filter((w) => w.lane === lane);
    if (!lanes.length) return [];
    const a = rng.pick(lanes), b = rng.pick(lanes);
    return path(a, b);
  };
  const holdPoint = (lane, rng) => {
    const lanes = wps.filter((w) => w.lane === lane);
    return lanes.length ? rng.pick(lanes) : wps[0];
  };
  const smooth = (pts) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const d1 = Math.hypot(b.x - a.x, b.z - a.z);
      const d2 = Math.hypot(c.x - b.x, c.z - b.z);
      if (d1 < 0.01 || d2 < 0.01) continue;
      const cos = ((b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)) / (d1 * d2);
      if (cos < 0.9) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  return { nodes: wps, nearest, path, laneRoute, holdPoint, smooth };
}
