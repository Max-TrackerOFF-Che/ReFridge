import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysUntil, freshness, fridgeMood, matchRecipes, sortByExpiry } from "../src/logic.js";
import { guessProduct, productEmoji } from "../src/products.js";
import { TILE, findFreeSpot, overlaps, toFraction, toPixels } from "../src/placement.js";

const today = new Date(2026, 9, 25); // 25 жовтня 2026

test("daysUntil рахує дні відносно сьогодні", () => {
  assert.equal(daysUntil("2026-10-25", today), 0);
  assert.equal(daysUntil("2026-10-28", today), 3);
  assert.equal(daysUntil("2026-10-20", today), -5);
});

test("freshness визначає статус продукту", () => {
  assert.equal(freshness("2026-10-24", today), "expired");
  assert.equal(freshness("2026-10-27", today), "soon");
  assert.equal(freshness("2026-11-01", today), "ok");
});

test("sortByExpiry ставить найближчі терміни першими", () => {
  const sorted = sortByExpiry([{ expires: "2026-11-01" }, { expires: "2026-10-26" }]);
  assert.deepEqual(sorted.map((i) => i.expires), ["2026-10-26", "2026-11-01"]);
});

test("matchRecipes ранжує за покриттям і ігнорує прострочене", () => {
  const recipes = [
    { id: "a", title: "A", ingredients: ["яйця", "молоко"] },
    { id: "b", title: "B", ingredients: ["яйця", "борошно", "цукор"] },
    { id: "c", title: "C", ingredients: ["риба"] },
  ];
  const items = [
    { name: "Яйця", expires: "2026-10-30" },
    { name: "молоко", expires: "2026-10-26" },
    { name: "риба", expires: "2026-10-20" }, // прострочена
  ];
  const result = matchRecipes(recipes, items, today);
  assert.deepEqual(result.map((r) => r.id), ["a", "b"]);
  assert.equal(result[0].coverage, 1);
  assert.equal(result[0].urgentUsed, 1);
  assert.deepEqual(result[1].missing, ["борошно", "цукор"]);
});

test("addDays рахує дату вперед", () => {
  assert.equal(addDays(7, today), "2026-11-01");
  assert.equal(addDays(0, today), "2026-10-25");
});

test("guessProduct розпізнає продукт і полицю", () => {
  assert.deepEqual(guessProduct("Молоко 2.5%"), { emoji: "🥛", category: "dairy" });
  assert.deepEqual(guessProduct("кисломолочний сир"), { emoji: "🧀", category: "dairy" });
  assert.deepEqual(guessProduct("Салат айсберг"), { emoji: "🥬", category: "veg" });
  assert.deepEqual(guessProduct("пельмені"), { emoji: "🥟", category: "frozen" });
  assert.equal(guessProduct("щось невідоме"), null);
});

test("productEmoji бере емодзі полиці, якщо продукт невідомий", () => {
  assert.equal(productEmoji({ name: "щось", category: "frozen" }), "🧊");
  assert.equal(productEmoji({ name: "банани", category: "other" }), "🍌");
});

test("fridgeMood: червоний, зелений і сірий стани", () => {
  const at = (days) => ({ expires: addDays(days, today) });
  const many = (n, days) => Array.from({ length: n }, () => at(days));

  // 2 з 10 прострочені (20% > 10%) — плаче
  assert.equal(fridgeMood([...many(2, -1), ...many(8, 10)], today).mood, "sad");
  // рівно 10% — ще не червоний
  assert.equal(fridgeMood([at(-1), ...many(9, 10)], today).mood, "neutral");
  // усе свіже, найближчий термін через 5 днів — радіє
  assert.equal(fridgeMood([at(5), at(30)], today).mood, "happy");
  // найближчий через 4 дні — ще не зелений
  assert.equal(fridgeMood([at(4), at(30)], today).mood, "neutral");
  // 20% псуються за ≤ 2 дні, прострочених немає — сірий
  const r = fridgeMood([at(2), ...many(4, 10)], today);
  assert.deepEqual(r, { mood: "neutral", total: 5, expired: 0, soon: 1, nearest: 2 });
  // порожній холодильник — сірий
  assert.equal(fridgeMood([], today).mood, "neutral");
});

test("findFreeSpot: кладе туди, куди кинули, або поруч із зайнятим місцем", () => {
  const area = { w: 300, h: 100 };
  // вільно — лишається де кинули
  assert.deepEqual(findFreeSpot(area, [], { x: 100, y: 20 }), { x: 100, y: 20 });
  // за межами — притискається до краю полиці
  assert.deepEqual(findFreeSpot(area, [], { x: 999, y: -5 }), { x: 300 - TILE.w, y: 0 });
  // зайнято — зсувається на найближче вільне місце без перекриття
  const occupied = [{ x: 100, y: 20 }];
  const spot = findFreeSpot(area, occupied, { x: 105, y: 20 });
  assert.equal(overlaps(spot, occupied[0]), false);
  assert.ok(Math.hypot(spot.x - 105, spot.y - 20) <= TILE.w);
  // повністю заставлена полиця — повертає бажане місце
  const full = { w: TILE.w, h: TILE.h };
  assert.deepEqual(findFreeSpot(full, [{ x: 0, y: 0 }], { x: 0, y: 0 }), { x: 0, y: 0 });
});

test("toFraction і toPixels взаємно обернені", () => {
  const area = { w: 300, h: 100 };
  const px = { x: 123, y: 25 };
  assert.deepEqual(toPixels(toFraction(px, area), area), px);
});
