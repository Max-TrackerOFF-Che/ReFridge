// Збереження вмісту холодильника та статистики в localStorage браузера.
const ITEMS_KEY = "refridge.items.v1";
const STATS_KEY = "refridge.stats.v1";

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Сховище недоступне (приватний режим тощо) — працюємо лише в пам'яті.
  }
}

/** null — якщо холодильник ще ні разу не зберігали (перший візит). */
export const loadItems = () => load(ITEMS_KEY, null);
export const saveItems = (items) => save(ITEMS_KEY, items);

/** Скільки продуктів використано, а скільки викинуто. */
export const loadStats = () => ({ used: 0, wasted: 0, ...load(STATS_KEY, {}) });
export const saveStats = (stats) => save(STATS_KEY, stats);
