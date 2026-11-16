// input.js — pointer lock, keyboard state, mouse look and the goal-arrow keys.
// Everything lands in S.input; no gameplay code here.

import { S } from "./state.js";

const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

// The right mouse button aims, the left one fires; a context menu never opens.
const HANDLED = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyR", "KeyB", "KeyQ", "KeyG",
  "Space", "ShiftLeft", "ControlLeft", "Tab", "Escape",
  "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

export function createInput(canvas, onKey) {
  const input = S.input;

  const onMouseMove = (e) => {
    if (!input.locked) return;
    const sens = input.ads ? 0.0011 : 0.0021;
    input.yaw -= e.movementX * sens;
    input.pitch -= e.movementY * sens;
    const lim = Math.PI / 2 - 0.02;
    if (input.pitch > lim) input.pitch = lim;
    if (input.pitch < -lim) input.pitch = -lim;
  };

  const onDown = (e) => {
    if (HANDLED.has(e.code)) e.preventDefault();
    if (e.code === "Tab" && !e.repeat) { input.keys.add("Tab"); if (onKey) onKey("Tab", true); return; }
    if (e.repeat) return;
    input.keys.add(e.code);
    if (e.code === "ShiftLeft") input.walk = true;
    if (e.code === "ControlLeft") input.crouch = !input.crouch;
    if (onKey) onKey(e.code, false);
  };

  const onUp = (e) => {
    input.keys.delete(e.code);
    if (e.code === "ShiftLeft") input.walk = false;
    if (e.code === "Tab" && onKey) onKey("Tab", false);
  };

  const onMouseDown = (e) => {
    if (!input.locked) { lock(); return; }
    if (e.button === 0) input.fire = true;
    if (e.button === 2) input.ads = true;
  };

  const onMouseUp = (e) => {
    if (e.button === 0) input.fire = false;
    if (e.button === 2) input.ads = false;
  };

  const onBlur = () => {
    input.keys.clear();
    input.fire = false;
    input.ads = false;
    input.walk = false;
  };

  const lock = () => {
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  };

  const onLockChange = () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) onBlur();
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("keydown", onDown);
  document.addEventListener("keyup", onUp);
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("pointerlockchange", onLockChange);
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("blur", onBlur);

  return {
    lock,
    release: () => { if (document.pointerLockElement) document.exitPointerLock(); },
    // Movement wish vector in local space, resolved from the held keys.
    readMove() {
      let x = 0, y = 0;
      for (const code of input.keys) {
        const m = MOVE_KEYS[code];
        if (m) { x += m[0]; y += m[1]; }
      }
      const len = Math.hypot(x, y);
      input.move.x = len > 0 ? x / len : 0;
      input.move.y = len > 0 ? y / len : 0;
      return input.move;
    },
  };
}
