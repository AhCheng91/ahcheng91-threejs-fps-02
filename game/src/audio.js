// audio.js — every sound made from a few oscillators and a noise buffer, so the game
// ships no audio files. One context, started on the first click.

const SHOTS = {
  tack: { f: 440, drop: 0.5, len: 0.14, noise: 0.5, gain: 0.5 },
  needle: { f: 620, drop: 0.42, len: 0.1, noise: 0.62, gain: 0.42 },
  kestrel: { f: 300, drop: 0.34, len: 0.19, noise: 0.78, gain: 0.62 },
  bellows: { f: 150, drop: 0.55, len: 0.26, noise: 0.9, gain: 0.66 },
};

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function env(node, t0, attack, len, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + len);
  }

  function noise(t0, len, gain, filterHz, type) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = type || "bandpass";
    f.frequency.setValueAtTime(filterHz, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(120, filterHz * 0.35), t0 + len);
    f.Q.value = 1.1;
    const g = ctx.createGain();
    env(g, t0, 0.004, len, gain);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + len + 0.02);
  }

  function tone(t0, from, to, len, gain, type) {
    const o = ctx.createOscillator();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + len);
    const g = ctx.createGain();
    env(g, t0, 0.006, len, gain);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + len + 0.02);
  }

  const api = {
    resume() {
      const c = ensure();
      if (c && c.state === "suspended") c.resume();
    },
    // pos is optional: sounds further away are quieter and duller.
    play(name, opts) {
      if (!ctx || ctx.state !== "running") return;
      const o = opts || {};
      let vol = 1;
      if (o.pos && o.byPlayer === false) {
        const p = api.listener;
        const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
        vol = Math.max(0, 1 - d / 46) * 0.72;
        if (vol < 0.02) return;
      }
      const t0 = ctx.currentTime;
      if (name.startsWith("shot_")) {
        const s = SHOTS[name.slice(5)] || SHOTS.kestrel;
        noise(t0, s.len, s.gain * vol, s.f * 3.2);
        tone(t0, s.f, s.f * s.drop, s.len * 0.8, 0.16 * vol, "square");
        return;
      }
      switch (name) {
        case "empty":
          tone(t0, 180, 120, 0.05, 0.1, "square");
          break;
        case "reload":
          noise(t0, 0.06, 0.16 * vol, 1800, "highpass");
          noise(t0 + 0.18, 0.05, 0.14 * vol, 2400, "highpass");
          break;
        case "hit":
          tone(t0, 1180, 900, 0.06, 0.12 * vol, "sine");
          break;
        case "step":
          noise(t0, 0.08, 0.1 * vol, 520, "lowpass");
          break;
        case "plant":
          tone(t0, 300, 420, 0.12, 0.16, "sawtooth");
          break;
        case "beep":
          tone(t0, 1400, 1400, 0.07, 0.2, "square");
          break;
        case "defuse":
          tone(t0, 520, 900, 0.3, 0.16, "sine");
          break;
        case "boom":
          noise(t0, 0.7, 0.55, 260, "lowpass");
          tone(t0, 90, 34, 0.75, 0.4, "sine");
          break;
        case "smoke":
          noise(t0, 0.5, 0.22, 900, "lowpass");
          break;
        case "start":
          tone(t0, 330, 496, 0.5, 0.12, "triangle");
          tone(t0 + 0.12, 496, 660, 0.4, 0.1, "triangle");
          break;
        case "win":
          tone(t0, 392, 523, 0.3, 0.16, "triangle");
          tone(t0 + 0.16, 523, 784, 0.45, 0.14, "triangle");
          break;
        case "lose":
          tone(t0, 330, 196, 0.55, 0.16, "sawtooth");
          break;
      }
    },
    listener: { x: 0, y: 0, z: 0 },
  };
  return api;
}
