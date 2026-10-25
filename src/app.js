import { CATEGORIES, SHELF_LIFE, addDays, daysUntil, freshness, fridgeMood, matchRecipes, sortByExpiry } from "./logic.js";
import { findFreeSpot, freeSpot, toFraction, toPixels } from "./placement.js";
import { guessProduct, productEmoji } from "./products.js";
import { RECIPES } from "./recipes.js";
import { TILE_FRACTION, ZONES } from "./scene.js";
import { loadItems, loadStats, saveItems, saveStats } from "./store.js";

// Під час першого візиту кладемо кілька продуктів-прикладів, щоб було з чим погратися.
function sampleItems() {
  const sample = [
    ["Молоко", "1 л", "dairy", 1],
    ["Яйця", "10 шт", "dairy", 12],
    ["Сир", "200 г", "dairy", 9],
    ["Курка", "1 кг", "meat", -1],
    ["Помідори", "", "veg", 4],
    ["Огірки", "", "veg", 2],
    ["Кріп", "пучок", "veg", 3],
    ["Банани", "", "fruit", 5],
    ["Яблука", "", "fruit", 14],
    ["Хліб", "", "grain", 3],
    ["Борошно", "1 кг", "grain", 120],
    ["Кетчуп", "", "other", 60],
    ["Пельмені", "500 г", "frozen", 80],
    ["Морозиво", "", "frozen", 45],
  ];
  return sample.map(([name, quantity, category, days]) => ({ id: newId(), name, quantity, category, expires: addDays(days) }));
}

function newId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let items = loadItems() ?? sampleItems();
let stats = loadStats();
let justAdded = null;
let selectedId = null;

const $ = (sel) => document.querySelector(sel);
const shelves = [...document.querySelectorAll(".shelf")];
const addDialog = $("#add-dialog");
const addForm = $("#add-form");
const itemDialog = $("#item-dialog");
const recipesDialog = $("#recipes-dialog");
const scene = $("#scene");

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

/* ---------- Відчинити / зачинити ---------- */

const isOpen = () => scene.dataset.state === "open";

function setOpen(open) {
  scene.dataset.state = open ? "open" : "closed";
  // Коли холодильник зачинений, продукти недоступні ні мишею, ні з клавіатури.
  $("#open-ui").inert = !open;
  $(".closed-ui").inert = open;
  $("#toggle-button").textContent = open ? "Зачинити" : "Відчинити";
  updateBackdrop();
}

$("#door-hit").addEventListener("click", () => setOpen(true));
$("#toggle-button").addEventListener("click", () => setOpen(!isOpen()));

// Клік по фото поза полицями зачиняє холодильник — наче штовхнули дверцята.
scene.addEventListener("click", (e) => {
  if (isOpen() && !e.target.closest(".shelf, .closed-ui")) setOpen(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.querySelector("dialog[open]")) setOpen(false);
});

/** Розставляє полиці поверх фото відчиненого холодильника для поточного настрою. */
function layoutShelves() {
  const zones = ZONES[scene.dataset.mood] ?? ZONES.neutral;
  for (const shelf of shelves) {
    const [x, y, w, h] = zones[shelf.dataset.shelf];
    Object.assign(shelf.style, { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` });
  }
}

function updateBackdrop() {
  const photo = scene.querySelector(`.photo[data-for="${scene.dataset.state} ${scene.dataset.mood}"]`);
  if (photo) $("#backdrop").style.backgroundImage = `url("${photo.getAttribute("src")}")`;
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
  if (item.pos) placeTile(tile, item.pos);
  return tile;
}

function placeTile(tile, pos) {
  tile.style.setProperty("--x", pos.x.toFixed(4));
  tile.style.setProperty("--y", pos.y.toFixed(4));
}

function areaOf(shelf) {
  const box = shelf.querySelector(".shelf-items");
  return { w: box.clientWidth, h: box.clientHeight };
}

// Розмір значка залежить від ширини сцени (див. --tw / --th у styles.css).
function tileOf() {
  const w = scene.clientWidth * TILE_FRACTION;
  return { w, h: w * (7 / 7.4) };
}

/** Позиції (px) усіх розміщених продуктів на полиці, крім `exceptId`. */
function occupiedOn(shelf, exceptId) {
  const area = areaOf(shelf);
  const tile = tileOf(shelf);
  return items
    .filter((i) => i.pos && i.id !== exceptId && shelfOf(i) === shelf.dataset.shelf)
    .map((i) => toPixels(i.pos, area, tile));
}

// Полиця за замовчуванням для кожної категорії (соуси й напої — на дверцятах).
const DEFAULT_SHELF = {
  dairy: "dairy",
  meat: "meat",
  grain: "grain",
  veg: "veg",
  fruit: "fruit",
  other: "door-1",
  frozen: "freezer-1",
};
const shelfById = (id) => shelves.find((s) => s.dataset.shelf === id);

/** Id полиці, на якій лежить продукт. */
function shelfOf(item) {
  if (item.shelf && shelfById(item.shelf)) return item.shelf;
  return DEFAULT_SHELF[item.category] ?? DEFAULT_SHELF.other;
}

/** Ставить новий продукт на першу полицю його категорії, де є вільне місце. */
function autoPlace(item) {
  const category = CATEGORIES[item.category] ? item.category : "other";
  const preferred = shelfById(shelfOf(item));
  const candidates = [preferred, ...shelves.filter((s) => s.dataset.category === category && s !== preferred)];
  for (const shelf of candidates) {
    const area = areaOf(shelf);
    const tile = tileOf(shelf);
    const spot = freeSpot(area, occupiedOn(shelf, item.id), { x: 0, y: area.h }, { tile, rowFirst: true });
    if (spot) {
      item.shelf = shelf.dataset.shelf;
      item.pos = toFraction(spot, area, tile);
      return;
    }
  }
  // Усе заставлено — кладемо поверх на основну полицю.
  const area = areaOf(preferred);
  item.shelf = preferred.dataset.shelf;
  item.pos = toFraction(findFreeSpot(area, [], { x: 0, y: area.h }, { tile: tileOf(preferred) }), area, tileOf(preferred));
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
  return document.elementFromPoint(x, y)?.closest(".scene[data-state=\"open\"] .shelf") ?? null;
}

function highlight(shelf) {
  shelves.forEach((s) => s.classList.toggle("drop-target", s === shelf));
}

document.addEventListener("pointerdown", (e) => {
  const tile = e.target.closest(".product");
  if (!tile || e.button !== 0) return;
  const r = tile.getBoundingClientRect();
  drag = { tile, id: tile.dataset.id, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, ghost: null };
});

document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.ghost = drag.tile.cloneNode(true);
    drag.ghost.classList.add("drag-ghost");
    Object.assign(drag.ghost.style, { width: `${drag.tile.offsetWidth}px`, height: `${drag.tile.offsetHeight}px` });
    drag.ghost.style.setProperty("--ghost-emoji", getComputedStyle(drag.tile.querySelector(".emoji")).fontSize);
    drag.ghost.classList.remove("dropping");
    document.body.append(drag.ghost);
    drag.tile.classList.add("dragging");
  }
  drag.ghost.style.left = `${e.clientX - drag.dx}px`;
  drag.ghost.style.top = `${e.clientY - drag.dy}px`;
  highlight(shelfAt(e.clientX, e.clientY));
});

function endDrag(e) {
  if (!drag) return;
  const { ghost, tile, id, dy } = drag;
  drag = null;
  if (!ghost) return; // це був звичайний клік
  ghost.remove();
  tile.classList.remove("dragging");
  highlight(null);
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
  const shelf = e.type === "pointerup" ? shelfAt(e.clientX, e.clientY) : null;
  const item = items.find((i) => i.id === id);
  if (!shelf || !item) return;

  // Продукт прилипає туди, де його відпустили, або на найближче вільне місце.
  // Масштаб враховує полиці на дверцятах, які в перспективі виглядають вужчими.
  const box = shelf.querySelector(".shelf-items").getBoundingClientRect();
  const area = areaOf(shelf);
  const size = tileOf(shelf);
  const desired = {
    x: ((e.clientX - box.left) / box.width) * area.w - size.w / 2,
    y: ((e.clientY - dy - box.top) / box.height) * area.h,
  };
  const spot = findFreeSpot(area, occupiedOn(shelf, id), desired, { tile: size });
  item.category = shelf.dataset.category;
  item.shelf = shelf.dataset.shelf;
  item.pos = toFraction(spot, area, size);
  commit();
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
  $("#item-meta").textContent = [CATEGORIES[item.category] ?? CATEGORIES.other, item.quantity].filter(Boolean).join(" · ");
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
    id: newId(),
    name: f.name.value.trim(),
    quantity: f.quantity.value.trim(),
    category: f.category.value,
    expires: f.expires.value,
  };
  items.push(item);
  justAdded = item.id;
  addDialog.close();
  setOpen(true);
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
  // Настрій визначає фото, а від фото залежить, де саме лежать полиці.
  renderMood();
  layoutShelves();

  // Новим продуктам (і тим, що збереглися зі старої версії) шукаємо вільне місце.
  const unplaced = sorted.filter((i) => !i.pos || !i.shelf || !shelfById(i.shelf));
  unplaced.forEach(autoPlace);
  if (unplaced.length) saveItems(items);

  for (const shelf of shelves) {
    const onShelf = sorted.filter((i) => shelfOf(i) === shelf.dataset.shelf);
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
}

/* ---------- Настрій холодильника ---------- */

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const products = (n) => `${n} ${plural(n, "продукт", "продукти", "продуктів")}`;

function moodText({ mood, total, expired, soon, nearest }) {
  if (!total) return "Я порожній… Покладіть у мене щось смачне!";
  if (mood === "sad") return `Мені погано: ${expired} з ${total} ${plural(total, "продукту", "продуктів", "продуктів")} зіпсувалися. Викиньте їх, будь ласка.`;
  if (mood === "happy") return `Усе свіже! Найближчий термін спливає через ${nearest} ${plural(nearest, "день", "дні", "днів")}.`;
  if (expired) return `Тримаюся, але ${products(expired)} вже ${plural(expired, "прострочений", "прострочені", "прострочені")}.`;
  if (soon) return `${products(soon)} ${plural(soon, "зіпсується", "зіпсуються", "зіпсуються")} за 2 дні. Приготуйте щось!`;
  return `Усе гаразд. Найближчий термін спливає через ${nearest} ${plural(nearest, "день", "дні", "днів")}.`;
}

function renderMood() {
  const state = fridgeMood(items);
  scene.dataset.mood = state.mood;
  $("#mood-bubble").textContent = moodText(state);
  updateBackdrop();
}

// Опівночі терміни зсуваються — перемальовуємо раз на хвилину.
setInterval(render, 60_000);

setOpen(false);
render();
