import * as THREE from "three";

const tex = (rep, draw) => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  draw(cv.getContext("2d"));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(rep, rep);
  return t;
};
const fill = (g, c) => { g.fillStyle = c; g.fillRect(0, 0, 128, 128); };
const speckle = (g, c, n) => { for (let i = 0; i < n; i++) { g.fillStyle = c; g.globalAlpha = 0.1 + Math.random() * 0.45; g.fillRect(Math.random() * 128 | 0, Math.random() * 128 | 0, 2, 2); } g.globalAlpha = 1; };
const mat = (map, o) => new THREE.MeshStandardMaterial({ map, ...o });

export function buildMaterials() {
  const concrete = mat(tex(9, g => { fill(g, "#a09d95"); speckle(g, "#6b6963", 900); }), { roughness: 0.95 });
  const steel = mat(tex(2, g => {
    fill(g, "#8d949c");
    for (let y = 0; y < 128; y += 2) { g.globalAlpha = 0.1 + Math.random() * 0.25; g.fillStyle = "#c2c9d1"; g.fillRect(0, y, 128, 1); }
    g.globalAlpha = 1;
  }), { metalness: 0.85, roughness: 0.35 });
  const hazard = mat(tex(3, g => {
    fill(g, "#c8a014");
    g.strokeStyle = "#181818"; g.lineWidth = 14;
    for (let i = -224; i < 224; i += 32) { g.beginPath(); g.moveTo(i, -32); g.lineTo(i + 160, 128); g.stroke(); }
  }), { roughness: 0.8 });
  const grate = mat(tex(2, g => {
    fill(g, "#1d1f21");
    g.strokeStyle = "#565b60"; g.lineWidth = 4;
    for (let i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    speckle(g, "#3a3e42", 200);
  }), { metalness: 0.7, roughness: 0.6 });
  const wet = mat(tex(5, g => { fill(g, "#4a4f52"); speckle(g, "#2a2f33", 700); }), { roughness: 0.28, metalness: 0.12 });
  const grime = mat(tex(3, g => { fill(g, "#6a5b46"); speckle(g, "#3d3327", 900); speckle(g, "#57503f", 400); }), { roughness: 1 });
  const timber = mat(tex(2, g => {
    fill(g, "#7a6242");
    for (let y = 0; y < 128; y += 16) { g.fillStyle = "#5d4a31"; g.fillRect(0, y, 128, 2); }
    speckle(g, "#4a3a26", 500);
  }), { roughness: 0.95 });
  const timberDark = mat(tex(2, g => {
    fill(g, "#584732");
    for (let y = 0; y < 128; y += 14) { g.fillStyle = "#3d3022"; g.fillRect(0, y, 128, 2); }
    speckle(g, "#33281b", 500);
  }), { roughness: 1 });
  const rust = mat(tex(2, g => {
    fill(g, "#8a4a2a");
    speckle(g, "#5c2c16", 900);
    speckle(g, "#b06a38", 400);
  }), { metalness: 0.5, roughness: 0.7 });
  return { concrete, steel, hazard, grate, wet, grime, timber, timberDark, rust };
}
