// hud.js — writes the DOM the CSS lays out: health, armour, ammunition, timer,
// score, pips, plant ring, kill feed, damage arcs and the compass strip. Values are
// cached so a frame only touches the page when something actually changed.

import { W, ROUND } from "./config.js";
import { EV } from "./state.js";

const $ = (id) => document.getElementById(id);

export function createHud(S) {
  const el = {
    health: $("health"), healthNum: $("health-num"),
    armour: $("armour"), armourNum: $("armour-num"),
    mag: $("ammo-mag"), res: $("ammo-res"), weapon: $("weapon"),
    timer: $("timer"), bombline: $("bombline"), objective: $("objective"),
    scoreR: $("score-r"), scoreW: $("score-w"), pips: $("pips"),
    money: $("money"), moneyBox: $("money-box"),
    killfeed: $("killfeed"), dmgdir: $("dmgdir"), dmgflash: $("dmgflash"),
    crosshair: $("crosshair"), hitmarker: $("hitmarker"),
    progress: $("progress"), ring: $("progress-ring"), progressLabel: $("progress-label"),
    banner: $("banner"), bannerMain: $("banner-main"), bannerSub: $("banner-sub"),
    compass: $("compass-track"),
    diag: $("diag"),
  };
  const cache = {};
  const feed = [];
  let bannerT = 0;
  let hitT = 0;
  let dmgT = 0;
  let flashT = 0;
  let boardOpen = false;

  function text(node, key, value) {
    if (!node) return;
    if (cache[key] === value) return;
    cache[key] = value;
    node.textContent = value;
  }

  function width(node, key, pct) {
    if (!node) return;
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    if (cache[key] === v) return;
    cache[key] = v;
    node.style.width = v + "%";
  }

  // Compass strip: ticks every 15 degrees, cardinal letters on the four quarters.
  const CARDINALS = { 0: "N", 90: "E", 180: "S", 270: "W" };
  (function buildCompass() {
    if (!el.compass) return;
    const frag = document.createDocumentFragment();
    for (let deg = -180; deg <= 540; deg += 15) {
      const a = ((deg % 360) + 360) % 360;
      const tick = document.createElement("i");
      tick.className = "tick" + (a % 45 === 0 ? " major" : "");
      tick.style.left = ((deg + 180) / 3.6) + "px";
      frag.appendChild(tick);
      if (CARDINALS[a] !== undefined) {
        const lab = document.createElement("span");
        lab.className = "rlab" + (a % 90 === 0 ? " card" : "");
        lab.style.left = ((deg + 180) / 3.6) + "px";
        lab.textContent = CARDINALS[a];
        frag.appendChild(lab);
      }
    }
    el.compass.appendChild(frag);
  })();

  // Pips: one per round needed to win, filled as each side scores.
  const pips = [];
  (function buildPips() {
    if (!el.pips) return;
    for (let i = 0; i < ROUND.winScore * 2; i++) {
      const p = document.createElement("i");
      p.className = "pip";
      el.pips.appendChild(p);
      pips.push(p);
    }
  })();

  function pushFeed(row) {
    feed.push(row);
    if (feed.length > 4) feed.shift();
    if (!el.killfeed) return;
    el.killfeed.textContent = "";
    for (const r of feed) el.killfeed.appendChild(r.node);
  }

  function killRow(killer, victim, weaponId, headshot, byPlayer) {
    const node = document.createElement("div");
    node.className = "kf" + (byPlayer ? " me" : "");
    const a = document.createElement("span");
    a.className = "a" + (killer && killer.team === "wardens" ? " w" : "");
    a.textContent = killer ? killer.name : "WORLD";
    const v = document.createElement("span");
    v.className = "v";
    v.textContent = victim.name;
    const w = document.createElement("span");
    w.className = "wep";
    w.textContent = (headshot ? "\u25C6 " : "") + (W[weaponId] ? W[weaponId].name.split(" ")[0] : weaponId.toUpperCase());
    node.append(a, document.createTextNode(" "), w, document.createTextNode(" "), v);
    return { node, t: 5.2 };
  }

  const api = {
    update(dt, S2) {
      const p = S2.player;
      const w = p && p.weapon;
      if (p) {
        width(el.health, "hp", p.health);
        width(el.armour, "ar", p.armor);
        text(el.healthNum, "hpn", String(Math.max(0, Math.round(p.health))));
        text(el.armourNum, "arn", String(Math.max(0, Math.round(p.armor))));
        if (el.health) el.health.className = "fill" + (p.health < 35 ? " low" : "");
        if (el.armour) el.armour.className = "fill" + (p.armor < 35 ? " low" : "");
        text(el.money, "money", "$" + Math.round(p.money));
      }
      if (w) {
        text(el.mag, "mag", String(w.mag));
        text(el.res, "res", String(w.reserve));
        text(el.weapon, "wep", w.reloading ? "RELOADING" : w.def.name.toUpperCase());
        if (el.mag) el.mag.className = w.mag <= Math.max(2, w.def.mag * 0.2) ? "low" : "";
        if (el.crosshair) el.crosshair.className = (w.ads ? "aim" : "") + (p && p.speed > 1 ? " move" : "");
      }

      const t = S2.phase === "live" ? Math.max(0, S2.roundT) : S2.phase === "buy" ? Math.max(0, S2.phaseT) : 0;
      const mm = Math.floor(t / 60);
      const ss = Math.floor(t % 60);
      text(el.timer, "timer", mm + ":" + (ss < 10 ? "0" : "") + ss);
      if (el.timer) el.timer.className = t < 20 && S2.phase === "live" ? "low" : "";
      text(el.scoreR, "sr", String(S2.score.rooks));
      text(el.scoreW, "sw", String(S2.score.wardens));

      const live = S2.rounds ? S2.rounds.bomb : null;
      let bombline = "";
      let objective = "ROUND " + Math.max(1, S2.roundNum);
      if (S2.phase === "buy") {
        objective = "BUY PHASE \u00B7 PRESS B";
        bombline = "";
      } else if (live && live.planted) {
        bombline = "CHARGE ARMED \u00B7 " + Math.max(0, Math.ceil(live.fuse)) + "S";
        objective = "WARDENS: DEFUSE IT";
      } else if (p && live && live.carrier === p) {
        objective = "YOU CARRY THE CHARGE";
      } else if (S2.phase === "end" && S2.roundWinner) {
        objective = S2.roundWinner === "rooks" ? "ROOKS TAKE IT" : "WARDENS HOLD";
      } else {
        objective = p && p.team === "rooks" ? "PLANT AT A OR B" : "HOLD THE SITES";
      }
      text(el.bombline, "bl", bombline);
      text(el.objective, "obj", objective);

      for (let i = 0; i < pips.length; i++) {
        const want = "";
        const cls = i < S2.score.rooks ? "pip on rooks" : i >= pips.length - S2.score.wardens ? "pip on wardens" : "pip";
        if (pips[i].className !== cls) pips[i].className = cls;
        void want;
      }

      if (el.compass) {
        const yawDeg = ((-(p ? p.yaw : 0) * 180) / Math.PI + 360) % 360;
        el.compass.style.transform = "translateX(" + (-yawDeg / 3.6 + 94) + "px)";
      }

      if (el.progress) {
        const planting = p && live && live.carrier === p && S2.plantProgress > 0.02;
        const defusing = S2.defuseProgress > 0.02;
        const pct = planting ? S2.plantProgress / ROUND.plantTime : defusing ? S2.defuseProgress / ROUND.defuseTime : 0;
        const on = pct > 0.01;
        if (cache.progOn !== on) {
          cache.progOn = on;
          el.progress.className = on ? "on" : "";
        }
        if (on && el.ring) el.ring.style.strokeDashoffset = String(188.5 * (1 - Math.min(1, pct)));
        text(el.progressLabel, "pl", planting ? "PLANTING" : "DEFUSING");
      }

      for (let i = feed.length - 1; i >= 0; i--) {
        feed[i].t -= dt;
        if (feed[i].t <= 0) {
          feed[i].node.remove();
          feed.splice(i, 1);
        } else if (feed[i].t < 0.8) feed[i].node.classList.add("fade");
      }

      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT <= 0 && el.banner) el.banner.className = "";
      }
      if (hitT > 0) {
        hitT -= dt;
        if (hitT <= 0 && el.hitmarker) el.hitmarker.className = "";
      }
      if (flashT > 0) {
        flashT -= dt;
        if (flashT <= 0 && el.dmgflash) el.dmgflash.className = "";
      }
      if (dmgT > 0) dmgT -= dt;
      void boardOpen;
    },
    hit(kill, head) {
      if (!el.hitmarker) return;
      el.hitmarker.className = "";
      void el.hitmarker.offsetWidth;
      el.hitmarker.className = "show" + (kill ? " kill" : "");
      hitT = 0.18;
      void head;
    },
    damage(angle) {
      if (!el.dmgdir) return;
      const arc = document.createElement("i");
      arc.className = "arc show";
      arc.style.transform = "rotate(" + angle + "rad)";
      el.dmgdir.appendChild(arc);
      dmgT = 0.8;
      setTimeout(() => arc.remove(), 720);
      if (el.dmgflash && flashT <= 0) {
        el.dmgflash.className = "on";
        flashT = 0.12;
      }
    },
    banner(main, sub, secs) {
      text(el.bannerMain, "bm", main);
      text(el.bannerSub, "bs", sub || "");
      if (el.banner) el.banner.className = "show";
      bannerT = secs || 2.6;
    },
    kill(killer, victim, weaponId, headshot, byPlayer) {
      pushFeed(killRow(killer, victim, weaponId, headshot, byPlayer));
    },
    clearFeed() {
      feed.length = 0;
      if (el.killfeed) el.killfeed.textContent = "";
    },
    diag(data) {
      if (el.diag) el.diag.textContent = JSON.stringify(data);
    },
  };

  if (S.bus) {
    S.bus.on(EV.KILLFEED, (m) => api.kill(m.killer, m.victim, m.weapon, m.headshot, m.byPlayer));
    S.bus.on(EV.BANNER, (m) => api.banner(m.main, m.sub, m.secs));
    S.bus.on(EV.HIT, (m) => api.hit(m.kill, m.head));
    S.bus.on(EV.HURT, (m) => api.damage(m.angle || 0));
  }
  S.hud = api;
  return api;
}
