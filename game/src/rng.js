// rng.js — deterministic seeded PRNG for all gameplay randomness.
// Never use Math.random() in game code; always go through this module.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRNG(seed) {
  const rnd = mulberry32(seed);
  const rng = {
    rnd,
    range(a, b) { return a + rnd() * (b - a); },
    int(a, b) { return Math.floor(rng.range(a, b + 1)); },
    pick(arr) { return arr[Math.floor(rnd() * arr.length)]; },
    chance(p) { return rnd() < p; },
    gauss(m = 0, s = 1) {
      let u = 0, v = 0;
      while (u === 0) u = rnd();
      while (v === 0) v = rnd();
      return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    gaussC(m = 0, s = 1, k = 3) {
      let x = rng.gauss(m, s);
      if (x > m + k * s) x = m + k * s;
      if (x < m - k * s) x = m - k * s;
      return x;
    },
    sign() { return rnd() < 0.5 ? -1 : 1; },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    pickWeighted(items, weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      let r = rnd() * total;
      for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
      return items[items.length - 1];
    },
  };
  return rng;
}
