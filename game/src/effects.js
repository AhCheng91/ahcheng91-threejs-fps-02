// effects.js — every visual flourish, pooled and written in place: tracers as one
// LineSegments buffer, sparks and smoke as one Points buffer, muzzle flash as a light
// and a quad, blasts as a few reused spheres. Nothing is allocated per frame.

import * as THREE from "three";
import { PAL } from "./config.js";

const MAX_TRACERS = 48;
const MAX_PARTICLES = 320;

export function createEffects(scene) {
  const tracerPos = new Float32Array(MAX_TRACERS * 6);
  const tracerCol = new Float32Array(MAX_TRACERS * 6);
  const tracerLife = new Float32Array(MAX_TRACERS);
  const tracerTint = new Float32Array(MAX_TRACERS * 3);
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute("position", new THREE.BufferAttribute(tracerPos, 3));
  tracerGeo.setAttribute("color", new THREE.BufferAttribute(tracerCol, 3));
  const tracerMesh = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  tracerMesh.frustumCulled = false;
  scene.add(tracerMesh);
  let tracerHead = 0;

  const partPos = new Float32Array(MAX_PARTICLES * 3);
  const partCol = new Float32Array(MAX_PARTICLES * 3);
  const partVel = new Float32Array(MAX_PARTICLES * 3);
  const partLife = new Float32Array(MAX_PARTICLES);
  const partMax = new Float32Array(MAX_PARTICLES);
  const partGrav = new Float32Array(MAX_PARTICLES);
  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute("position", new THREE.BufferAttribute(partPos, 3));
  partGeo.setAttribute("color", new THREE.BufferAttribute(partCol, 3));
  const partMesh = new THREE.Points(partGeo, new THREE.PointsMaterial({
    size: 0.14, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  partMesh.frustumCulled = false;
  scene.add(partMesh);
  let partHead = 0;
  let anyParticle = false;

  const muzzleLight = new THREE.PointLight(PAL.lamp, 0, 9, 2);
  scene.add(muzzleLight);
  let muzzleT = 0;

  const blastGeo = new THREE.SphereGeometry(1, 12, 8);
  const blasts = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(blastGeo, new THREE.MeshBasicMaterial({
      color: PAL.hazard, transparent: true, opacity: 0, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    blasts.push({ mesh: m, t: 0, max: 1, r: 1 });
  }
  let blastHead = 0;

  function spawn(x, y, z, vx, vy, vz, life, r, g, b, grav) {
    const i = partHead;
    partHead = (partHead + 1) % MAX_PARTICLES;
    partPos[i * 3] = x; partPos[i * 3 + 1] = y; partPos[i * 3 + 2] = z;
    partVel[i * 3] = vx; partVel[i * 3 + 1] = vy; partVel[i * 3 + 2] = vz;
    partCol[i * 3] = r; partCol[i * 3 + 1] = g; partCol[i * 3 + 2] = b;
    partLife[i] = life;
    partMax[i] = life;
    partGrav[i] = grav;
  }

  return {
    tracer(a, b, tint) {
      const i = tracerHead;
      tracerHead = (tracerHead + 1) % MAX_TRACERS;
      tracerPos[i * 6] = a.x; tracerPos[i * 6 + 1] = a.y; tracerPos[i * 6 + 2] = a.z;
      tracerPos[i * 6 + 3] = b.x; tracerPos[i * 6 + 4] = b.y; tracerPos[i * 6 + 5] = b.z;
      tracerLife[i] = 0.07;
      const c = new THREE.Color(tint);
      tracerTint[i * 3] = c.r; tracerTint[i * 3 + 1] = c.g; tracerTint[i * 3 + 2] = c.b;
    },

    impact(x, y, z, nx, ny, nz) {
      for (let k = 0; k < 5; k++) {
        const s = 1.6 + Math.random() * 2.2;
        spawn(x, y, z, nx * s + (Math.random() - 0.5) * 2.4, ny * s + Math.random() * 2.2, nz * s + (Math.random() - 0.5) * 2.4,
          0.22 + Math.random() * 0.2, 1.0, 0.72, 0.34, 9);
      }
    },

    blood(x, y, z) {
      for (let k = 0; k < 4; k++) {
        spawn(x, y, z, (Math.random() - 0.5) * 2.0, Math.random() * 1.6, (Math.random() - 0.5) * 2.0,
          0.3 + Math.random() * 0.2, 0.62, 0.08, 0.06, 8);
      }
    },

    muzzle(p, byPlayer) {
      muzzleLight.position.set(p.x, p.y, p.z);
      muzzleLight.intensity = byPlayer ? 2.6 : 1.8;
      muzzleT = 0.05;
    },

    smoke(x, y, z, color) {
      for (let k = 0; k < 26; k++) {
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * 1.6;
        spawn(x + Math.cos(a) * 0.4, y + Math.random() * 1.2, z + Math.sin(a) * 0.4,
          Math.cos(a) * s, 0.25 + Math.random() * 0.5, Math.sin(a) * s,
          3.2 + Math.random() * 1.6, color[0], color[1], color[2], -0.15);
      }
    },

    blast(x, y, z, radius) {
      const b = blasts[blastHead];
      blastHead = (blastHead + 1) % blasts.length;
      b.mesh.position.set(x, y, z);
      b.mesh.visible = true;
      b.t = 0.34;
      b.max = 0.34;
      b.r = radius;
      b.mesh.scale.setScalar(0.4);
      for (let k = 0; k < 22; k++) {
        const a = Math.random() * Math.PI * 2;
        const s = 3 + Math.random() * 7;
        spawn(x, y + 0.4, z, Math.cos(a) * s, 1.5 + Math.random() * 5, Math.sin(a) * s,
          0.5 + Math.random() * 0.4, 1.0, 0.52, 0.16, 7);
      }
    },

    update(dt) {
      let live = false;
      for (let i = 0; i < MAX_TRACERS; i++) {
        if (tracerLife[i] > 0) {
          tracerLife[i] -= dt;
          const f = Math.max(0, tracerLife[i] / 0.07);
          tracerCol[i * 6] = tracerTint[i * 3] * f;
          tracerCol[i * 6 + 1] = tracerTint[i * 3 + 1] * f;
          tracerCol[i * 6 + 2] = tracerTint[i * 3 + 2] * f;
          tracerCol[i * 6 + 3] = tracerTint[i * 3] * f * 0.25;
          tracerCol[i * 6 + 4] = tracerTint[i * 3 + 1] * f * 0.25;
          tracerCol[i * 6 + 5] = tracerTint[i * 3 + 2] * f * 0.25;
          live = true;
        } else {
          tracerCol[i * 6] = tracerCol[i * 6 + 1] = tracerCol[i * 6 + 2] = 0;
          tracerCol[i * 6 + 3] = tracerCol[i * 6 + 4] = tracerCol[i * 6 + 5] = 0;
        }
      }
      if (live) {
        tracerGeo.attributes.position.needsUpdate = true;
        tracerGeo.attributes.color.needsUpdate = true;
      }

      let alive = false;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (partLife[i] <= 0) continue;
        alive = true;
        partLife[i] -= dt;
        if (partLife[i] <= 0) {
          partCol[i * 3] = partCol[i * 3 + 1] = partCol[i * 3 + 2] = 0;
          continue;
        }
        partVel[i * 3 + 1] -= partGrav[i] * dt;
        partPos[i * 3] += partVel[i * 3] * dt;
        partPos[i * 3 + 1] += partVel[i * 3 + 1] * dt;
        partPos[i * 3 + 2] += partVel[i * 3 + 2] * dt;
        if (partPos[i * 3 + 1] < 0.02) {
          partPos[i * 3 + 1] = 0.02;
          partVel[i * 3 + 1] *= -0.28;
          partVel[i * 3] *= 0.6;
          partVel[i * 3 + 2] *= 0.6;
        }
        const f = partLife[i] / partMax[i];
        if (partGrav[i] < 0) {
          partCol[i * 3] = 0.26 * f + 0.02;
          partCol[i * 3 + 1] = 0.28 * f + 0.02;
          partCol[i * 3 + 2] = 0.3 * f + 0.02;
        } else {
          partCol[i * 3] *= 0.94;
          partCol[i * 3 + 1] *= 0.94;
          partCol[i * 3 + 2] *= 0.94;
          if (partLife[i] < 0.12) {
            partCol[i * 3] *= 0.5;
            partCol[i * 3 + 1] *= 0.5;
            partCol[i * 3 + 2] *= 0.5;
          }
        }
      }
      if (alive) {
        partGeo.attributes.position.needsUpdate = true;
        partGeo.attributes.color.needsUpdate = true;
      }

      if (muzzleT > 0) {
        muzzleT -= dt;
        if (muzzleT <= 0) muzzleLight.intensity = 0;
        else muzzleLight.intensity *= 0.82;
      }

      for (const b of blasts) {
        if (!b.mesh.visible) continue;
        b.t -= dt;
        if (b.t <= 0) { b.mesh.visible = false; b.mesh.material.opacity = 0; continue; }
        const f = 1 - b.t / b.max;
        b.mesh.scale.setScalar(0.4 + f * b.r * 0.62);
        b.mesh.material.opacity = 0.55 * (1 - f);
      }
    },
  };
}
