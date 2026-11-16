// buymenu.js — the field supply panel: the weapons and gear in config.js laid out
// with number keys, priced, and marked when already carried or too dear.

import { WEAPONS, GEAR } from "./config.js";

const $ = (id) => document.getElementById(id);

export function createBuyMenu(S, onBuy) {
  const root = $("buy");
  const list = $("buy-list");
  const money = $("buy-money");
  const hint = $("buy-hint");
  const items = [];
  let open = false;

  function build() {
    if (!list) return;
    list.textContent = "";
    items.length = 0;
    const all = WEAPONS.concat(GEAR);
    all.forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "bi";
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = String(i + 1);
      const name = document.createElement("span");
      name.className = "nm";
      name.textContent = it.name;
      const pr = document.createElement("span");
      pr.className = "pr";
      pr.textContent = it.price === 0 ? "FREE" : "$" + it.price;
      row.append(k, name, pr);
      row.addEventListener("click", () => choose(it.id));
      list.appendChild(row);
      items.push({ it, row });
    });
    if (hint) hint.textContent = "1-9 BUY \u00B7 B CLOSE";
  }

  function choose(id) {
    if (!open) return;
    if (onBuy(id)) refresh();
  }

  function owned(it, p) {
    if (!p) return false;
    if (WEAPONS.includes(it)) return p.weapon && p.weapon.id === it.id;
    if (it.kind === "armor") return p.armor >= 100 && (!it.helmet || p.helmet);
    if (it.kind === "nade") return (p.nades[it.nade] || 0) >= it.max;
    return false;
  }

  function refresh() {
    const p = S.player;
    if (!p) return;
    if (money) money.textContent = "$" + Math.round(p.money);
    for (const { it, row } of items) {
      const isOwned = owned(it, p);
      const poor = !isOwned && it.price > p.money;
      row.className = "bi" + (isOwned ? " own" : "") + (poor ? " no" : "");
    }
  }

  build();

  return {
    isOpen: () => open,
    setOpen(on) {
      if (!root) return;
      open = on && S.phase === "buy";
      root.className = "overlay" + (open ? " show" : "");
      if (open) refresh();
      if (S.input) S.input.buyOpen = open;
    },
    toggle() { this.setOpen(!open); },
    refresh,
    choose,
    keydown(code) {
      if (!open) return false;
      if (code === "KeyB" || code === "Escape") { this.setOpen(false); return true; }
      const m = /^Digit([1-9])$/.exec(code);
      if (m) {
        const idx = Number(m[1]) - 1;
        if (idx < items.length) { choose(items[idx].it.id); return true; }
      }
      return false;
    },
  };
}
