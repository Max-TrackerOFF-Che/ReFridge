import { CATEGORIES, SHELF_LIFE, addDays, daysUntil, freshness, matchRecipes, sortByExpiry } from "./logic.js";
import { guessProduct, productEmoji } from "./products.js";
import { RECIPES } from "./recipes.js";
import { loadItems, loadStats, saveItems, saveStats } from "./store.js";

let items = loadItems();
let stats = loadStats();
let justAdded = null;
let selectedId = null;

const $ = (sel) => document.querySelector(sel);
const shelves = [...document.querySelectorAll(".shelf")];
const addDialog = $("#add-dialog");
const addForm = $("#add-form");
const itemDialog = $("#item-dialog");
const recipesDialog = $("#recipes-dialog");

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

function expiryLabel(iso) {
  const days = daysUntil(iso);
  if (days < 0) return `прострочено ${-days} дн. тому`;
  if (days === 0) return "спливає сьогодні";
  if (days === 1) return "спливає завтра";
  return `ще ${days} дн.`;
}

function commit() {
  saveItems(items);
  saveStats(stats);
  render();
}

/* ---------- Дверцята ---------- */

function compartmentFor(category) {
  return document.querySelector(`.compartment[data-zone="${category === "frozen" ? "freezer" : "main"}"]`);
}

function setOpen(compartment, open) {
  compartment.classList.toggle("open", open);
  compartment.querySelector(".door").setAttribute("aria-expanded", String(open));
  // За зачиненими дверцятами продукти недоступні ні мишею, ні з клавіатури.
  compartment.querySelector(".interior").inert = !open;
}

for (const compartment of document.querySelectorAll(".compartment")) {
  setOpen(compartment, false);
  // На вузьких екранах відчинені дверцята виходять за край, тому зачиняємо
  // їх і кліком по порожньому місцю всередині — наче штовхнули дверцята.
  compartment.querySelector(".interior").addEventListener("click", (e) => {
    if (!e.target.closest(".product")) setOpen(compartment, false);
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
    document.querySelectorAll(".compartment").forEach((c) => setOpen(c, false));
  }
});

for (const door of document.querySelectorAll(".door")) {
  const compartment = door.closest(".compartment");
  const toggle = () => setOpen(compartment, !compartment.classList.contains("open"));
  door.addEventListener("click", toggle);
  door.addEventListener("keydown", (e) => {
    if (e.target === door && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      toggle();
    }
  });
}

/* ---------- Продукти на полицях ---------- */

function productTile(item) {
  const status = freshness(item.expires);
  const tile = el(
    "div",
    {
      role: "button",
      tabIndex: 0,
      className: `product ${status}${item.id === justAdded ? " dropping" : ""}`,
      title: `${item.name}${item.quantity ? ` · ${item.quantity}` : ""} — ${expiryLabel(item.expires)}`,
    },
    el("span", { className: "emoji", textContent: productEmoji(item) }),
    el("span", { className: "label", textContent: item.name }),
  );
  tile.dataset.id = item.id;
  return tile;
}

function shelfOf(item) {
  return CATEGORIES[item.category] ? item.category : "other";
}

document.addEventListener("click", (e) => {
  const tile = e.target.closest(".product");
  if (tile) openItem(tile.dataset.id);
});
document.addEventListener("keydown", (e) => {
  const tile = e.target.closest?.(".product");
  if (tile && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    openItem(tile.dataset.id);
  }
});

// Перетягування продукту на іншу полицю — Pointer Events, тож працює і мишею, і пальцем.
let drag = null;
let suppressClick = false;

function shelfAt(x, y) {
  return document.elementFromPoint(x, y)?.closest(".compartment.open .shelf") ?? null;
}

function highlight(shelf) {
  shelves.forEach((s) => s.classList.toggle("drop-target", s === shelf));
}

document.addEventListener("pointerdown", (e) => {
  const tile = e.target.closest(".product");
  if (!tile || e.button !== 0) return;
  drag = { tile, id: tile.dataset.id, x: e.clientX, y: e.clientY, ghost: null };
});

document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.ghost = el("div", { className: "drag-ghost", textContent: drag.tile.querySelector(".emoji").textContent });
    document.body.append(drag.ghost);
    drag.tile.classList.add("dragging");
  }
  drag.ghost.style.translate = `${e.clientX}px ${e.clientY}px`;
  highlight(shelfAt(e.clientX, e.clientY));
});

function endDrag(e) {
  if (!drag) return;
  const { ghost, tile, id } = drag;
  drag = null;
  if (!ghost) return; // це був звичайний клік
  ghost.remove();
  tile.classList.remove("dragging");
  highlight(null);
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
  const shelf = e.type === "pointerup" ? shelfAt(e.clientX, e.clientY) : null;
  const item = items.find((i) => i.id === id);
  if (shelf && item && item.category !== shelf.dataset.category) {
    item.category = shelf.dataset.category;
    commit();
  }
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

// Клік, що завершує перетягування, не має відкривати картку чи зачиняти дверцята.
window.addEventListener(
  "click",
  (e) => {
    if (suppressClick) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true,
);

/* ---------- Картка продукту ---------- */

function openItem(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  selectedId = id;
  const status = freshness(item.expires);
  $("#item-emoji").textContent = productEmoji(item);
  $("#item-name").textContent = item.name;
  $("#item-meta").textContent = [CATEGORIES[shelfOf(item)], item.quantity].filter(Boolean).join(" · ");
  const expiry = $("#item-expiry");
  expiry.textContent = `Придатний до ${item.expires.split("-").reverse().join(".")} — ${expiryLabel(item.expires)}`;
  expiry.className = `expiry ${status}`;
  itemDialog.showModal();
}

function takeOut(kind) {
  const tile = document.querySelector(`.product[data-id="${selectedId}"]`);
  const id = selectedId;
  itemDialog.close();
  stats[kind]++;
  const finish = () => {
    items = items.filter((i) => i.id !== id);
    commit();
  };
  if (tile) {
    tile.classList.add(kind === "used" ? "leaving" : "trashed");
    setTimeout(finish, 450);
  } else finish();
}

$("#item-used").addEventListener("click", () => takeOut("used"));
$("#item-wasted").addEventListener("click", () => takeOut("wasted"));

/* ---------- Додавання ---------- */

const categorySelect = addForm.elements.category;
for (const [value, label] of Object.entries(CATEGORIES)) categorySelect.append(new Option(label, value));

// Поки користувач сам не змінив полицю чи дату, підказуємо їх за назвою продукту.
let touched = { category: false, expires: false };

function syncAddForm() {
  const f = addForm.elements;
  const guess = guessProduct(f.name.value);
  if (guess && !touched.category) f.category.value = guess.category;
  if (!touched.expires) f.expires.value = addDays(SHELF_LIFE[f.category.value] ?? 7);
  $("#add-preview").textContent = productEmoji({ name: f.name.value, category: f.category.value });
}

function openAdd() {
  addForm.reset();
  touched = { category: false, expires: false };
  addForm.elements.category.value = "other";
  syncAddForm();
  addDialog.showModal();
  addForm.elements.name.focus();
}

$("#add-button").addEventListener("click", openAdd);
addForm.elements.name.addEventListener("input", syncAddForm);
addForm.elements.category.addEventListener("change", () => {
  touched.category = true;
  syncAddForm();
});
addForm.elements.expires.addEventListener("change", () => (touched.expires = true));

addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = addForm.elements;
  const item = {
    id: crypto.randomUUID(),
    name: f.name.value.trim(),
    quantity: f.quantity.value.trim(),
    category: f.category.value,
    expires: f.expires.value,
  };
  items.push(item);
  justAdded = item.id;
  addDialog.close();
  setOpen(compartmentFor(item.category), true);
  commit();
  justAdded = null;
});

/* ---------- Рецепти ---------- */

function recipeRow(r) {
  return el(
    "li",
    { className: "recipe" },
    el("strong", { textContent: r.title }),
    el("span", { className: "badge", textContent: `${Math.round(r.coverage * 100)}%` }),
    r.urgentUsed ? el("span", { className: "badge soon", textContent: "рятує продукти" }) : null,
    el("div", { className: "small", textContent: `Є: ${r.matched.join(", ")}` }),
    r.missing.length ? el("div", { className: "small muted", textContent: `Докупити: ${r.missing.join(", ")}` }) : null,
  );
}

$("#note").addEventListener("click", (e) => {
  e.stopPropagation(); // не зачиняти/відчиняти дверцята
  recipesDialog.showModal();
});

for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
  });
}

/* ---------- Рендер ---------- */

function render() {
  const sorted = sortByExpiry(items);

  for (const shelf of shelves) {
    const onShelf = sorted.filter((i) => shelfOf(i) === shelf.dataset.category);
    shelf.querySelector(".shelf-items").replaceChildren(...onShelf.map(productTile));
  }

  const counts = { expired: 0, soon: 0, ok: 0 };
  sorted.forEach((i) => counts[freshness(i.expires)]++);
  const magnet = (emoji, value, title, cls = "") =>
    el("span", { className: `magnet ${cls}`, title }, el("span", { textContent: emoji }), el("b", { textContent: value }));
  $("#magnets").replaceChildren(
    magnet("🧺", items.length, "Усього продуктів"),
    magnet("⏳", counts.soon, "Скоро зіпсуються", counts.soon ? "soon" : ""),
    magnet("☠️", counts.expired, "Прострочені", counts.expired ? "expired" : ""),
    magnet("🌱", stats.used, "Використано вчасно"),
    magnet("🗑️", stats.wasted, "Викинуто"),
  );

  const matches = matchRecipes(RECIPES, items);
  $("#note-recipes").replaceChildren(
    ...(matches.length
      ? matches.slice(0, 3).map((r) => el("li", { textContent: `${r.title} — ${Math.round(r.coverage * 100)}%` }))
      : [el("li", { className: "muted", textContent: "холодильник порожній…" })]),
  );
  $("#recipes").replaceChildren(
    ...(matches.length
      ? matches.map(recipeRow)
      : [el("li", { className: "muted", textContent: "Покладіть продукти, щоб побачити рецепти." })]),
  );

  // Сигнал на зачинених дверцятах, якщо всередині щось псується.
  for (const compartment of document.querySelectorAll(".compartment")) {
    const zone = compartment.dataset.zone;
    const inZone = items.filter((i) => (shelfOf(i) === "frozen") === (zone === "freezer"));
    const alert = inZone.some((i) => freshness(i.expires) !== "ok");
    compartment.classList.toggle("alert", alert);
  }
}

render();
