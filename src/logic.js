// Чиста бізнес-логіка ReFridge — без DOM і localStorage, щоб легко тестувати.

const DAY_MS = 24 * 60 * 60 * 1000;

export const CATEGORIES = {
  dairy: "Молочне",
  meat: "М'ясо та риба",
  veg: "Овочі",
  fruit: "Фрукти",
  grain: "Крупи та хліб",
  frozen: "Морозилка",
  other: "Інше",
};

/** Типовий термін зберігання (днів) для нового продукту на полиці. */
export const SHELF_LIFE = { dairy: 7, meat: 3, veg: 7, fruit: 7, grain: 14, frozen: 90, other: 30 };

/** Дата `days` днів після `from` у форматі YYYY-MM-DD (за локальним часом). */
export function addDays(days, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Кількість повних днів від `today` до дати `isoDate` (YYYY-MM-DD). */
export function daysUntil(isoDate, today = new Date()) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / DAY_MS);
}

/** Статус свіжості: expired | soon (≤ 2 днів) | ok. */
export function freshness(isoDate, today = new Date()) {
  const days = daysUntil(isoDate, today);
  if (days < 0) return "expired";
  if (days <= 2) return "soon";
  return "ok";
}

/** Сортує продукти: спершу ті, що зіпсуються найраніше. */
export function sortByExpiry(items) {
  return [...items].sort((a, b) => a.expires.localeCompare(b.expires));
}

export function normalize(name) {
  return name.trim().toLowerCase();
}

/**
 * Підбирає рецепти за вмістом холодильника.
 * Повертає рецепти, у яких є хоча б один збіг, відсортовані за часткою
 * наявних інгредієнтів, а при рівності — за кількістю продуктів «скоро зіпсується».
 */
export function matchRecipes(recipes, items, today = new Date()) {
  const fresh = items.filter((i) => freshness(i.expires, today) !== "expired");
  const have = new Set(fresh.map((i) => normalize(i.name)));
  const urgent = new Set(
    fresh.filter((i) => freshness(i.expires, today) === "soon").map((i) => normalize(i.name)),
  );

  return recipes
    .map((r) => {
      const ingredients = r.ingredients.map(normalize);
      const matched = ingredients.filter((x) => have.has(x));
      return {
        ...r,
        matched,
        missing: ingredients.filter((x) => !have.has(x)),
        coverage: matched.length / ingredients.length,
        urgentUsed: matched.filter((x) => urgent.has(x)).length,
      };
    })
    .filter((r) => r.matched.length > 0)
    .sort((a, b) => b.coverage - a.coverage || b.urgentUsed - a.urgentUsed);
}

/**
 * Настрій холодильника за його вмістом:
 * - sad (червоний) — прострочено більше 10% продуктів;
 * - happy (зелений) — прострочених немає, а найближчий термін спливає не раніше ніж через 5 днів;
 * - neutral (сірий) — усе інше, зокрема коли ≥ 20% продуктів псуються за 2 дні або менше.
 */
export function fridgeMood(items, today = new Date()) {
  const total = items.length;
  const days = items.map((i) => daysUntil(i.expires, today));
  const expired = days.filter((d) => d < 0).length;
  const soon = days.filter((d) => d >= 0 && d <= 2).length;
  const nearest = total ? Math.min(...days) : null;

  let mood = "neutral";
  if (total && expired / total > 0.1) mood = "sad";
  else if (total && expired === 0 && nearest >= 5) mood = "happy";
  return { mood, total, expired, soon, nearest };
}
