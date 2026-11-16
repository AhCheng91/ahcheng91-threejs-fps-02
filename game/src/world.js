// world.js — builds the static map: collider boxes, meshes, site floors, lamps, lights.
import * as THREE from "three";
import { MAPBOX } from "./mapdata.js";
import { PAL } from "./config.js";
import { buildMaterials } from "./materials.js";

export function buildWorld(scene) {
  const mats = buildMaterials();
  const half = MAPBOX.size / 2;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const boxes = [{ x0: -half, y0: -1, z0: -half, x1: half, y1: 0, z1: half }];
  // Walls are concrete, containers alternate steel and rust, crates are timber.
  const pickMat = (kind, i) => {
    if (kind === "walls") return mats.concrete;
    if (kind === "containers") return i % 3 === 1 ? mats.rust : mats.steel;
    if (kind === "crates") return i % 4 === 3 ? mats.timberDark : mats.timber;
    return mats.grate;
  };
  const kinds = [["walls", MAPBOX.walls], ["containers", MAPBOX.containers], ["crates", MAPBOX.crates], ["catwalk", MAPBOX.catwalk]];
  for (const [kind, list] of kinds) {
    for (let i = 0; i < list.length; i++) {
      const [x0, y0, z0, x1, y1, z1] = list[i];
      const mesh = new THREE.Mesh(geo, pickMat(kind, i));
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
      scene.add(mesh);
      boxes.push({ x0, y0, z0, x1, y1, z1 });
    }
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), mats.wet);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const sites = {};
  for (const key of ["A", "B"]) {
    const s = MAPBOX.sites[key];
    const disc = new THREE.Mesh(new THREE.CircleGeometry(s.r, 40), new THREE.MeshStandardMaterial({
      color: PAL.hazard, roughness: 0.9, transparent: true, opacity: 0.32, emissive: PAL.hazard, emissiveIntensity: 0.25,
    }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(s.cx, 0.02, s.cz);
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.25, s.r, 44), new THREE.MeshBasicMaterial({ color: PAL.lamp, transparent: true, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.cx, 0.03, s.cz);
    const glow = new THREE.PointLight(PAL.hazard, 12, 16, 2);
    glow.position.set(s.cx, 1.2, s.cz);
    scene.add(disc, ring, glow);
    sites[key] = { x: s.cx, z: s.cz, r: s.r, label: s.label };
  }

  const lamps = [];
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 4.4, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: PAL.steel, metalness: 0.6, roughness: 0.5 });
  const bulbGeo = new THREE.SphereGeometry(0.15, 10, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: PAL.lamp });
  for (const [lx, lz] of [[-24, -24], [24, 24], [-24, 24], [24, -24], [8, 26], [-8, -26], [20, -20], [-18, -18], [0, -18], [0, 14], [26, -6], [-26, 6]]) {
    const post = new THREE.Mesh(poleGeo, poleMat);
    post.position.set(lx, 2.2, lz);
    const orb = new THREE.Mesh(bulbGeo, bulbMat);
    orb.position.set(lx, 4.45, lz);
    const light = new THREE.PointLight(PAL.lamp, 46, 38, 2);
    light.position.set(lx, 4.3, lz);
    scene.add(post, orb, light);
    lamps.push({ x: lx, y: 4.3, z: lz, light });
  }

  const drumGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.95, 12);
  for (const [dx, dz] of [[22, -22], [31, -22], [-22, 22], [-31, 22], [6, 18], [-6, -12]]) {
    const drum = new THREE.Mesh(drumGeo, mats.hazard);
    drum.position.set(dx, 0.48, dz);
    scene.add(drum);
    boxes.push({ x0: dx - 0.42, y0: 0, z0: dz - 0.42, x1: dx + 0.42, y1: 0.95, z1: dz + 0.42 });
  }

  scene.add(new THREE.HemisphereLight(0x4a6a86, 0x333f3a, 2.1));
  scene.add(new THREE.AmbientLight(0x4a5a66, 0.35));
  const moon = new THREE.DirectionalLight(0xa8c2e0, 2.2);
  moon.position.set(-28, 46, -16);
  scene.add(moon);
  const fill = new THREE.DirectionalLight(0xffb070, 0.9);
  fill.position.set(30, 22, 26);
  scene.add(fill);
  scene.fog = new THREE.Fog(0x0d1822, 40, 128);

  // A night sky that lifts toward the horizon, so the yard has depth behind the walls.
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 8;
  skyCanvas.height = 256;
  const sctx = skyCanvas.getContext("2d");
  const grad = sctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#05080c");
  grad.addColorStop(0.55, "#0a1219");
  grad.addColorStop(0.82, "#16303c");
  grad.addColorStop(1, "#2c4450");
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 8, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;

  // Chimneys and tanks beyond the fence: silhouette only, no collision.
  const far = new THREE.MeshStandardMaterial({ color: 0x141d24, roughness: 1 });
  const stacks = [
    [-46, -30, 7, 26], [-38, -44, 9, 34], [40, -40, 8, 30], [46, 14, 6, 22],
    [-44, 30, 10, 28], [12, -46, 5, 20], [-10, 44, 6, 24], [30, 44, 7, 18],
  ];
  for (const [x, z, w, h] of stacks) {
    const m = new THREE.Mesh(geo, far);
    m.position.set(x, h / 2, z);
    m.scale.set(w, h, w);
    scene.add(m);
  }

  return {
    boxes, sites,
    spawns: MAPBOX.spawns,
    waypoints: MAPBOX.waypoints,
    lamps,
    bounds: { x0: -half, x1: half, z0: -half, z1: half },
  };
}
