import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysUntil, freshness, matchRecipes, sortByExpiry } from "../src/logic.js";
import { guessProduct, productEmoji } from "../src/products.js";

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
