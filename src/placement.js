// Вільне розміщення значків на полиці: кожен продукт «прилипає» туди, куди його кинули,
// або на найближче вільне місце, якщо там уже щось лежить.

/** Розмір значка продукту в пікселях (має збігатися з .product у styles.css). */
export const TILE = { w: 48, h: 46 };

/** Чи заважають два значки один одному (невелике перекриття дозволене). */
export function overlaps(a, b, tile = TILE, slack = 0.8) {
  return Math.abs(a.x - b.x) < tile.w * slack && Math.abs(a.y - b.y) < tile.h * slack;
}

function steps(max, step) {
  const out = [];
  for (let v = 0; v < max; v += step) out.push(v);
  out.push(max);
  return out;
}

/**
 * Найближча до `desired` вільна позиція (лівий верхній кут значка, px) у межах `area`,
 * або null, якщо полиця заставлена.
 * `rowFirst` — спершу заповнювати ряд, а вже потім підніматися вище (для нових продуктів).
 */
export function freeSpot(area, occupied, desired, { tile = TILE, step = 4, rowFirst = false } = {}) {
  const maxX = Math.max(0, area.w - tile.w);
  const maxY = Math.max(0, area.h - tile.h);
  const clamp = (v, max) => Math.min(Math.max(v, 0), max);
  const want = { x: clamp(desired.x, maxX), y: clamp(desired.y, maxY) };
  const isFree = (p) => !occupied.some((o) => overlaps(p, o, tile));
  if (isFree(want)) return want;

  let best = null;
  let bestDist = Infinity;
  for (const y of steps(maxY, step)) {
    for (const x of steps(maxX, step)) {
      const dist = (x - want.x) ** 2 + ((y - want.y) * (rowFirst ? 10 : 1)) ** 2;
      if (dist < bestDist && isFree({ x, y })) {
        best = { x, y };
        bestDist = dist;
      }
    }
  }
  return best;
}

/** Як freeSpot, але на заставленій полиці повертає бажану позицію (значок ляже поверх). */
export function findFreeSpot(area, occupied, desired, opts = {}) {
  const tile = opts.tile ?? TILE;
  const clamp = (v, max) => Math.min(Math.max(v, 0), Math.max(0, max));
  return freeSpot(area, occupied, desired, opts) ?? { x: clamp(desired.x, area.w - tile.w), y: clamp(desired.y, area.h - tile.h) };
}

/** Переведення між пікселями та частками (0…1), у яких позиція зберігається. */
export function toFraction(px, area, tile = TILE) {
  const maxX = Math.max(0, area.w - tile.w);
  const maxY = Math.max(0, area.h - tile.h);
  return { x: maxX ? px.x / maxX : 0, y: maxY ? px.y / maxY : 1 };
}

export function toPixels(frac, area, tile = TILE) {
  return {
    x: frac.x * Math.max(0, area.w - tile.w),
    y: frac.y * Math.max(0, area.h - tile.h),
  };
}
