import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, freshness, matchRecipes, sortByExpiry } from "../src/logic.js";

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
