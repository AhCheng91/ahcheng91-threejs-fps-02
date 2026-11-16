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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), mats.wet);  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const sites = {};
  for (const key of ["A", "B"]) {
    const s = MAPBOX.sites[key];
    const disc = new THREE.Mesh(new THREE.CircleGeometry(s.r, 40), new THREE.MeshStandardMaterial({ color: PAL.hazard, roughness: 0.9, transparent: true, opacity: 0.5 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(s.cx, 0.02, s.cz);
    scene.add(disc);
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

  scene.add(new THREE.HemisphereLight(0x39536b, 0x2a3330, 1.5));
  scene.add(new THREE.AmbientLight(0x4a5a66, 0.35));
  const moon = new THREE.DirectionalLight(0x9fb8d8, 1.5);
  moon.position.set(-28, 46, -16);
  scene.add(moon);
  const fill = new THREE.DirectionalLight(0xffb070, 0.55);
  fill.position.set(30, 22, 26);
  scene.add(fill);
  scene.fog = new THREE.Fog(0x0d1822, 40, 128);

  return {
    boxes, sites,
    spawns: MAPBOX.spawns,
    waypoints: MAPBOX.waypoints,
    lamps,
    bounds: { x0: -half, x1: half, z0: -half, z1: half },
  };
}
