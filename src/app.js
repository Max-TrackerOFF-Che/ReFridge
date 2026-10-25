import { CATEGORIES, SHELF_LIFE, addDays, daysUntil, freshness, fridgeMood, matchRecipes, sortByExpiry } from "./logic.js";
import { guessProduct, productEmoji } from "./products.js";
import { RECIPES } from "./recipes.js";
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
    id: newId(),
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

  renderMood();
}

/* ---------- Настрій холодильника ---------- */

const fridge = $("#fridge");

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
  if (fridge.dataset.mood !== state.mood) {
    fridge.dataset.mood = state.mood;
    fridge.classList.remove("mood-change");
    void fridge.offsetWidth; // перезапуск анімації
    fridge.classList.add("mood-change");
  }
  $("#mood-bubble").textContent = moodText(state);
}
fridge.addEventListener("animationend", (e) => {
  if (e.animationName === "jiggle") fridge.classList.remove("mood-change");
});

// Очі стежать за курсором чи пальцем.
document.addEventListener("pointermove", (e) => {
  for (const iris of document.querySelectorAll(".face .iris")) {
    const eye = iris.closest(".eye").querySelector(".eyeball").getBoundingClientRect();
    if (!eye.width) continue;
    const dx = e.clientX - (eye.left + eye.width / 2);
    const dy = e.clientY - (eye.top + eye.height / 2);
    const k = Math.min(1, Math.hypot(dx, dy) / 300) / (Math.hypot(dx, dy) || 1);
    iris.style.transform = `translate(${(dx * k * 9).toFixed(1)}px, ${(dy * k * 6).toFixed(1)}px)`;
  }
});

/* ---------- Годинник ---------- */

for (let n = 1; n <= 12; n++) {
  const a = (n / 12) * 2 * Math.PI;
  const span = el("span", { textContent: n });
  span.style.left = `${50 + 38 * Math.sin(a)}%`;
  span.style.top = `${50 - 38 * Math.cos(a)}%`;
  $("#clock-numbers").append(span);
}

function tick() {
  const now = new Date();
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  $("#hand-second").style.rotate = `${s * 6}deg`;
  $("#hand-minute").style.rotate = `${m * 6}deg`;
  $("#hand-hour").style.rotate = `${h * 30}deg`;
  $("#clock").setAttribute("aria-label", `Годинник: ${now.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`);
}
tick();
setInterval(tick, 1000);

// Опівночі терміни зсуваються — перемальовуємо раз на хвилину.
setInterval(render, 60_000);

render();
