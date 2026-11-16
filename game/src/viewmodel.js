// viewmodel.js — the gun in your hands: boxes and cylinders for a receiver, barrel,
// magazine and gloved hands, then sway, recoil kick, reload dip and the aim-down-sight
// pull. It hangs off the camera so it never clips the world.

import * as THREE from "three";
import { PAL } from "./config.js";

const BODY = 0x2f373d;
const DARK = 0x262c30;
const METAL = 0x4d565c;
const GLOVE = 0x22303a;
const SKIN = 0x8a6b52;

function box(w, h, d, color, rough) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: rough ?? 0.45 }),
  );
}

function tube(r, len, color) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, len, 10),
    new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.35 }),
  );
}

// Each weapon gets its own silhouette so the four feel different in the hand.
function buildShape(id) {
  const g = new THREE.Group();
  if (id === "tack") {
    const slide = box(0.07, 0.075, 0.3, BODY);
    slide.position.set(0, 0.02, -0.12);
    const barrel = tube(0.014, 0.1, METAL);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.28);
    const grip = box(0.06, 0.16, 0.08, DARK, 0.7);
    grip.position.set(0, -0.08, 0.0);
    grip.rotation.x = -0.18;
    g.add(slide, barrel, grip);
  } else if (id === "needle") {
    const body = box(0.07, 0.09, 0.34, BODY);
    body.position.set(0, 0.02, -0.12);
    const barrel = tube(0.013, 0.16, METAL);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.34);
    const mag = box(0.045, 0.14, 0.06, DARK);
    mag.position.set(0, -0.1, -0.02);
    const stock = box(0.04, 0.05, 0.12, DARK);
    stock.position.set(0, 0.01, 0.06);
    g.add(body, barrel, mag, stock);
  } else if (id === "kestrel") {
    const body = box(0.075, 0.1, 0.42, BODY);
    body.position.set(0, 0.02, -0.16);
    const top = box(0.05, 0.03, 0.2, DARK);
    top.position.set(0, 0.085, -0.16);
    const barrel = tube(0.015, 0.26, METAL);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.44);
    const mag = box(0.05, 0.17, 0.07, DARK);
    mag.position.set(0, -0.11, -0.05);
    mag.rotation.x = 0.12;
    const stock = box(0.05, 0.07, 0.16, DARK);
    stock.position.set(0, 0.0, 0.1);
    const sight = box(0.03, 0.045, 0.03, PAL.teal);
    sight.position.set(0, 0.1, -0.3);
    g.add(body, top, barrel, mag, stock, sight);
  } else {
    const body = box(0.085, 0.1, 0.5, 0x3a2a1e, 0.75);
    body.position.set(0, 0.02, -0.2);
    const barrel = tube(0.022, 0.34, METAL);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.035, -0.5);
    const pump = box(0.07, 0.06, 0.16, DARK, 0.8);
    pump.position.set(0, -0.03, -0.36);
    const stock = box(0.06, 0.09, 0.2, DARK, 0.8);
    stock.position.set(0, -0.01, 0.14);
    g.add(body, barrel, pump, stock);
  }
  const grip = box(0.055, 0.13, 0.075, GLOVE, 0.9);
  grip.position.set(0, -0.1, 0.03);
  grip.rotation.x = -0.12;
  const handR = box(0.06, 0.05, 0.1, SKIN, 0.8);
  handR.position.set(0.01, -0.13, -0.02);
  const armR = box(0.07, 0.07, 0.3, GLOVE, 0.9);
  armR.position.set(0.06, -0.16, 0.2);
  armR.rotation.y = 0.25;
  const handL = box(0.055, 0.05, 0.09, SKIN, 0.8);
  handL.position.set(-0.012, -0.02, -0.3);
  const armL = box(0.065, 0.065, 0.26, GLOVE, 0.9);
  armL.position.set(-0.08, -0.1, -0.2);
  armL.rotation.set(0.3, -0.4, 0);
  g.add(grip, handR, armR, handL, armL);
  return g;
}

export function buildViewmodel(camera) {
  const root = new THREE.Group();
  root.scale.setScalar(0.66);
  root.position.set(0.19, -0.2, -0.34);
  camera.add(root);

  const shapes = new Map();
  let current = null;
  let kick = 0;
  let dip = 0;
  let swayX = 0;
  let swayY = 0;
  let aim = 0;
  let lastYaw = 0;
  let lastPitch = 0;

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, -0.52);
  root.add(muzzle);

  function show(id) {
    if (current === id) return;
    for (const [key, obj] of shapes) obj.visible = key === id;
    if (!shapes.has(id)) {
      const g = buildShape(id);
      shapes.set(id, g);
      root.add(g);
    }
    shapes.get(id).visible = true;
    current = id;
  }

  return {
    root,
    muzzle,
    show,
    kick(amount) {
      kick = Math.min(0.09, kick + amount);
    },
    reload(progress) {
      dip = Math.sin(Math.min(1, progress) * Math.PI) * 0.14;
    },
    update(dt, weaponId, yaw, pitch, speed, ads, reloading, reloadT) {
      if (weaponId && weaponId !== current) show(weaponId);
      const dYaw = yaw - lastYaw;
      const dPitch = pitch - lastPitch;
      lastYaw = yaw;
      lastPitch = pitch;
      swayX += (-dYaw * 1.6 - swayX) * Math.min(1, dt * 12);
      swayY += (dPitch * 1.2 - swayY) * Math.min(1, dt * 12);
      aim += ((ads ? 1 : 0) - aim) * Math.min(1, dt * 14);
      kick *= Math.max(0, 1 - dt * 11);
      if (reloading && reloadT > 0) dip = Math.max(dip, 0.08); else dip *= Math.max(0, 1 - dt * 7);

      const bob = Math.sin(performance.now() * 0.009) * 0.006 * Math.min(1, speed / 4.6);
      const baseX = 0.235 - aim * 0.235;
      const baseY = -0.225 + aim * 0.085;
      const baseZ = -0.3 + aim * 0.12;
      root.position.set(
        baseX + swayX * 0.5 + bob,
        baseY + swayY * 0.5 - dip + bob * 0.6,
        baseZ + kick,
      );
      root.rotation.set(kick * 2.2 + swayY * 0.6, swayX * 0.8, swayX * 0.5);
    },
  };
}
