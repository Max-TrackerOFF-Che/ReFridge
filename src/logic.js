// Чиста бізнес-логіка ReFridge — без DOM і localStorage, щоб легко тестувати.

const DAY_MS = 24 * 60 * 60 * 1000;

export const CATEGORIES = {
  dairy: "Молочне",
  meat: "М'ясо та риба",
  veg: "Овочі",
  fruit: "Фрукти",
  grain: "Крупи та хліб",
  other: "Інше",
};

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
