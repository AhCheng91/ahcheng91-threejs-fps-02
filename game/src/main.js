// main.js — boot the renderer and the scene, build the eight players and the map,
// then run one fixed 1/60 s step for the simulation and one render per frame.

import * as THREE from "three";
import { PAL, PLAYER, BOT, ROUND, SHOT, GAME } from "./config.js";
import { S, EV } from "./state.js";
import { makeRNG } from "./rng.js";
import { buildWorld } from "./world.js";
import { buildNav } from "./nav.js";
import { createPlayer, updatePlayer, damageAgent, eyeHeight } from "./player.js";
import { makeWeapon, tickWeapon, tryFire, startReload, refillWeapon } from "./weapons.js";
import { makeBot, updateBot, onNoise, botWeapon } from "./bots.js";
import { createRounds } from "./rounds.js";
import { createHud } from "./hud.js";
import { createBuyMenu } from "./buymenu.js";
import { buildViewmodel } from "./viewmodel.js";
import { createEffects } from "./effects.js";
import { createAudio } from "./audio.js";
import { createGrenades } from "./grenades.js";
import { createInput } from "./input.js";
import { setupShot } from "./shots.js";

const ROSTER = {
  rooks: ["KESTREL-1", "PELICAN", "DRYER", "MOTH"],
  wardens: ["FOREMAN", "GAUGE", "SLAG", "NIGHT-SHIFT"],
};

const STEP = 1 / 60;

function boot() {
  const params = new URLSearchParams(location.search);
  const shotName = params.get("shot");
  const seed = Number(params.get("seed")) || 1;

  const canvas = document.getElementById("game");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.sky);
  const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 260);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const rng = makeRNG(seed);
  S.rng = rng;
  S.seed = seed;
  S.mode = shotName && SHOT[shotName] ? shotName : "play";

  const world = buildWorld(scene);
  world.nav = buildNav(world);
  S.world = world;

  const agents = buildRoster(world, rng);
  S.agents = agents;
  S.player = agents[0];

  const fx = createEffects(scene);
  const audio = createAudio();
  const bus = S.bus;
  const rounds = createRounds(S, world, bus, rng, agents);
  S.rounds = rounds;
  const grenades = createGrenades(S, world, rng, bus);

  const hud = createHud(S);
  const buyMenu = createBuyMenu(S, (id) => rounds.buy(S.player, id));
  const view = buildViewmodel(camera);
  const bombMesh = makeBombMesh(scene);
  const avatars = new Map();
  for (const a of agents) avatars.set(a, makeAvatar(scene, a));

  const ctx = {
    world, agents, rng, bus, fx, audio, rounds, grenades, hud,
    applyDamage(shooter, victim, dmg, part) {
      if (S.mode !== "play" && victim.isPlayer) return 0;
      const before = victim.alive;
      const dealt = damageAgent(victim, dmg, part);
      if (victim.isPlayer && dmg > 0) {
        const ang = Math.atan2(-(shooter.pos.x - victim.pos.x), -(shooter.pos.z - victim.pos.z)) - victim.yaw;
        bus.emit(EV.HURT, { angle: ang, dealt });
      }
      if (before && !victim.alive) {
        rounds.onKill(shooter, victim, shooter.weapon ? shooter.weapon.id : "kestrel");
        bus.emit(EV.KILLFEED, {
          killer: shooter, victim,
          weapon: shooter.weapon ? shooter.weapon.id : "kestrel",
          headshot: part === "head",
          byPlayer: shooter.isPlayer || victim.isPlayer,
        });
        if (victim.isPlayer) {
          bus.emit(EV.BANNER, { main: "YOU ARE DOWN", sub: "SPECTATING" });
        }
      }
      return dealt;
    },
  };

  function buildRoster(world, rng) {
    const list = [];
    const spawnsR = world.spawns.rooks;
    const baseR = Array.isArray(spawnsR) ? spawnsR[0] : spawnsR;
    const player = createPlayer({ id: 0, name: "YOU", team: "rooks", x: baseR.x, z: baseR.z, yaw: baseR.yaw, isPlayer: true });
    player.money = 800;
    list.push(player);
    for (let i = 1; i < 4; i++) {
      const b = makeBot(i, ROSTER.rooks[i], "rooks", { x: baseR.x + rng.range(-2.5, 2.5), z: baseR.z + rng.range(-2, 2), yaw: baseR.yaw }, "kestrel");
      list.push(b);
    }
    for (let i = 0; i < 4; i++) {
      const spawns = world.spawns.wardens;
      const sp = spawns[i % spawns.length];
      const b = makeBot(4 + i, ROSTER.wardens[i], "wardens", { x: sp.x + rng.range(-2, 2), z: sp.z + rng.range(-2, 2), yaw: sp.yaw }, i === 1 ? "bellows" : "kestrel");
      list.push(b);
    }
    for (const a of list) a.weapon = makeWeapon(a.isPlayer ? "tack" : botWeapon(a) || "kestrel");
    return list;
  }

  const input = createInput(canvas, (code, isUp) => {
    if (isUp) return;
    if (code === "KeyB") { buyMenu.toggle(); return; }
    if (buyMenu.keydown(code)) return;
    if (code === "KeyR") { startReload(S.player.weapon); audio.play("reload"); return; }
    if (code === "KeyG") { grenades.throwFrom(S.player, "shard", fx, audio); return; }
    if (code === "KeyQ") { grenades.throwFrom(S.player, "veil", fx, audio); return; }
    if (code === "Tab") { board.classList.add("show"); return; }
    if (code === "Escape" && S.started) {
      S.paused = true;
      bus.emit(EV.BANNER, { main: "PAUSED", sub: "CLICK TO RESUME" });
    }
  });

  const board = document.getElementById("scoreboard");
  const startPanel = document.getElementById("start");

  bus.on(EV.ROUND_START, () => { hud.clearFeed(); });
  bus.on(EV.NOISE, (ev) => onNoise(agents.filter((a) => a.bot), ev, world));
  bus.on(EV.ROUND_END, (m) => {
    hud.banner(m.winner === "rooks" ? "ROOKS TAKE THE ROUND" : "WARDENS HOLD", m.reason.toUpperCase(), 3.4);
    audio.play(m.winner === S.player.team ? "win" : "lose");
  });
  bus.on(EV.MATCH_END, (m) => {
    hud.banner(m.winner === "rooks" ? "ROOKS WIN THE MATCH" : "WARDENS WIN THE MATCH", GAME, 8);
  });
  bus.on(EV.PLANT, (m) => {
    hud.banner("CHARGE PLANTED", "SITE " + m.site + " \u00B7 " + ROUND.fuse + "S", 2.6);
    audio.play("plant");
  });

  canvas.addEventListener("click", () => {
    if (!S.started) {
      startPanel.classList.remove("show");
      rounds.startMatch();
      audio.resume();
      audio.play("start");
      input.lock();
      return;
    }
    if (!S.input.locked) {
      input.lock();
      audio.resume();
      S.paused = false;
    }
  });
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement) S.paused = S.started;
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  if (S.mode !== "play") {
    setupShot(S.mode, seed, { S, world, agents, rounds, hud, buyMenu, ctx });
  } else {
    startPanel.classList.add("show");
  }

  let acc = 0;
  let last = performance.now();
  let frames = 0;
  let fps = 0;
  let fpsT = 0;
  let errors = 0;
  window.addEventListener("error", () => { errors++; });

  const shotMode = S.mode !== "play";

  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.1, raw);
    acc += dt;
    let steps = 0;
    const simOn = shotMode || (S.started && !S.paused && !buyMenu.isOpen());
    while (acc >= STEP && steps < 5) {
      if (simOn) simulate(STEP);
      acc -= STEP;
      steps++;
    }
    if (acc > 0.25) acc = 0;
    render(dt);
    frames++;
    fpsT += raw;
    if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
    hud.diag({ fps, frames: S.frames, mode: S.mode, phase: S.phase, alive: agents.filter((a) => a.alive).length, errors });
  }

  function simulate(dt) {
    S.t += dt;
    S.frames = (S.frames || 0) + 1;
    const p = S.player;

    if (p.alive) {
      updatePlayer(p, dt, S.input, world.boxes);
      const w = p.weapon;
      if (w) {
        tickWeapon(w, dt);
        const canFire = S.phase !== "buy" && S.phase !== "end";
        if (S.input.fire && canFire) {
          if (w.def.auto || !w.firedThisPress) {
            const res = tryFire(p, w, world, agents, rng, ctx);
            if (res.fired) w.firedThisPress = true;
          }
        } else {
          w.firedThisPress = false;
        }
        if (w.ads !== S.input.ads) w.ads = S.input.ads;
      }
    }

    for (const a of agents) {
      if (!a.bot || !a.alive) continue;
      if (a.weapon) tickWeapon(a.weapon, dt);
      updateBot(a, dt, ctx);
    }

    grenades.update(dt, ctx);
    if (S.phase === "live" || S.phase === "buy") rounds.update(dt, ctx);
    else rounds.update(dt, ctx);
    fx.update(dt);
    updateAvatars();
    updateBomb();

    if (p.alive) {
      camera.position.set(p.pos.x, p.pos.y + eyeHeight(p), p.pos.z);
      camera.rotation.y = p.yaw;
      camera.rotation.x = p.pitch;
    } else {
      const spec = agents.find((a) => a.alive && a.team === p.team) || agents.find((a) => a.alive);
      if (spec) {
        camera.position.set(spec.pos.x, spec.pos.y + eyeHeight(spec), spec.pos.z);
        camera.rotation.y = spec.yaw;
        camera.rotation.x = spec.pitch;
      }
    }
    audio.listener.x = camera.position.x;
    audio.listener.y = camera.position.y;
    audio.listener.z = camera.position.z;
    if (p.weapon) view.update(dt, p.weapon.id, p.yaw, p.pitch, p.speed, p.weapon.ads,
      p.weapon.reloading, p.weapon.reloadT);
    if (p.weapon && p.weapon.cool > 60 / p.weapon.def.rpm - dt) view.kick(0.02);
    hud.update(dt, S);
  }

  function updateAvatars() {
    for (const a of agents) {
      const av = avatars.get(a);
      if (!av) continue;
      av.group.visible = a.alive;
      if (!a.alive) {
        av.group.position.set(a.pos.x, a.pos.y, a.pos.z);
        av.group.rotation.set(-Math.PI / 2.2, a.yaw, 0);
        continue;
      }
      av.group.position.set(a.pos.x, a.pos.y + (a.height - PLAYER.stand) * 0.5, a.pos.z);
      av.group.rotation.set(0, a.yaw, 0);
      const walk = Math.min(1, a.speed / 4.6);
      const swing = Math.sin(a.bob || S.t * 8) * 0.5 * walk;
      av.legL.rotation.x = swing;
      av.legR.rotation.x = -swing;
      av.armL.rotation.x = -swing * 0.4;
      av.head.rotation.x = a.pitch * 0.4;
      av.group.scale.y = a.crouched ? 0.82 : 1;
      av.muzzleFlash.visible = a.weapon && a.weapon.cool > 60 / a.weapon.def.rpm - 0.05;
    }
  }

  function updateBomb() {
    const b = rounds.bomb;
    bombMesh.group.visible = b.planted;
    if (b.planted) {
      bombMesh.group.position.set(b.x, b.y, b.z);
      const beat = Math.max(0, Math.sin(S.t * (6 + (ROUND.fuse - b.fuse))));
      bombMesh.light.intensity = 2 + beat * 14;
      bombMesh.led.material.color.setHex(beat > 0.6 ? 0xff3b2f : 0x551512);
    }
  }

  function render(dt) {
    void dt;
    renderer.render(scene, camera);
  }

  requestAnimationFrame(frame);
  return { scene, camera, renderer, S, world, agents, rounds, ctx };
}

// A blocky operator: team-coloured vest, helmet, legs that swing as it walks, a rifle
// and a muzzle flash so a shot reads at a distance.
function makeAvatar(scene, a) {
  const group = new THREE.Group();
  const isEnemy = a.team === "wardens";
  const cloth = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x4a3a30 : 0x2f3f3d, roughness: 0.85 });
  const plate = new THREE.MeshStandardMaterial({
    color: isEnemy ? PAL.wardens : PAL.rooks, roughness: 0.5, metalness: 0.2, emissive: isEnemy ? 0x5a2a08 : 0x123a38, emissiveIntensity: 0.5,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a6b52, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2f33, metalness: 0.7, roughness: 0.4 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), cloth);
  torso.position.y = 1.05;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.34, 0.34), plate);
  vest.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  head.position.y = 1.52;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), plate);
  helmet.position.y = 1.54;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.18), cloth);
  legL.position.set(-0.13, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.16), cloth);
  armL.position.set(0.34, 1.08, -0.02);
  const armR = armL.clone();
  armR.position.x = -0.34;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), metal);
  gun.position.set(0.2, 1.16, -0.34);
  const muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd08a }));
  muzzleFlash.position.set(0.2, 1.16, -0.68);
  muzzleFlash.visible = false;
  group.add(torso, vest, head, helmet, legL, legR, armL, armR, gun, muzzleFlash);
  group.position.set(a.pos.x, a.pos.y, a.pos.z);
  scene.add(group);
  return { group, head, legL, legR, armL, muzzleFlash };
}

function makeBombMesh(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x26292b, roughness: 0.7, metalness: 0.3 }));
  body.position.y = 0.09;
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
  led.position.set(0.1, 0.19, 0);
  const light = new THREE.PointLight(0xff3b2f, 0, 6, 2);
  light.position.set(0, 0.4, 0);
  group.add(body, led, light);
  group.visible = false;
  scene.add(group);
  return { group, led, light };
}

const __game = boot();
if (typeof window !== "undefined") window.__game = __game;
void BOT;
void SHOT;
void refillWeapon;
