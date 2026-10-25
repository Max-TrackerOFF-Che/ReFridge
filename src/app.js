import { CATEGORIES, daysUntil, freshness, matchRecipes, sortByExpiry } from "./logic.js";
import { RECIPES } from "./recipes.js";
import { loadItems, saveItems } from "./store.js";

let items = loadItems();

const form = document.querySelector("#add-form");
const list = document.querySelector("#items");
const recipesEl = document.querySelector("#recipes");
const statsEl = document.querySelector("#stats");
const categorySelect = form.elements.category;

for (const [value, label] of Object.entries(CATEGORIES)) {
  categorySelect.append(new Option(label, value));
}

// За замовчуванням термін придатності — через тиждень.
function defaultExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}
form.elements.expires.value = defaultExpiry();

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(form);
  items.push({
    id: crypto.randomUUID(),
    name: data.get("name").trim(),
    quantity: data.get("quantity").trim(),
    category: data.get("category"),
    expires: data.get("expires"),
  });
  commit();
  form.reset();
  form.elements.expires.value = defaultExpiry();
  form.elements.name.focus();
});

list.addEventListener("click", (e) => {
  const button = e.target.closest("button[data-id]");
  if (!button) return;
  items = items.filter((i) => i.id !== button.dataset.id);
  commit();
});

function commit() {
  saveItems(items);
  render();
}

function expiryLabel(iso) {
  const days = daysUntil(iso);
  if (days < 0) return `прострочено ${-days} дн. тому`;
  if (days === 0) return "спливає сьогодні";
  if (days === 1) return "спливає завтра";
  return `ще ${days} дн.`;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function render() {
  const sorted = sortByExpiry(items);
  const counts = { expired: 0, soon: 0, ok: 0 };
  sorted.forEach((i) => counts[freshness(i.expires)]++);

  statsEl.replaceChildren(
    el("span", { className: "stat" }, `Усього: ${items.length}`),
    el("span", { className: "stat soon" }, `Скоро зіпсуються: ${counts.soon}`),
    el("span", { className: "stat expired" }, `Прострочені: ${counts.expired}`),
  );

  list.replaceChildren(
    ...(sorted.length
      ? sorted.map((i) =>
          el(
            "li",
            { className: `item ${freshness(i.expires)}` },
            el(
              "div",
              { className: "item-main" },
              el("strong", {}, i.name),
              i.quantity ? el("span", { className: "muted" }, ` · ${i.quantity}`) : "",
              el("div", { className: "muted small" }, `${CATEGORIES[i.category] ?? ""} — ${expiryLabel(i.expires)}`),
            ),
            el("button", { className: "remove", type: "button", title: "Використано / видалити", textContent: "✓" }),
          ),
        )
      : [el("li", { className: "empty" }, "Холодильник порожній. Додайте перший продукт!")]),
  );
  list.querySelectorAll("button.remove").forEach((b, idx) => (b.dataset.id = sorted[idx].id));

  const matches = matchRecipes(RECIPES, items);
  recipesEl.replaceChildren(
    ...(matches.length
      ? matches.map((r) =>
          el(
            "li",
            { className: "recipe" },
            el("strong", {}, r.title),
            el("span", { className: "badge" }, `${Math.round(r.coverage * 100)}%`),
            r.urgentUsed ? el("span", { className: "badge soon" }, "рятує продукти") : "",
            el("div", { className: "small" }, "Є: ", r.matched.join(", ")),
            r.missing.length ? el("div", { className: "small muted" }, "Докупити: ", r.missing.join(", ")) : "",
          ),
        )
      : [el("li", { className: "empty" }, "Додайте продукти, щоб побачити рецепти.")]),
  );
}

render();
