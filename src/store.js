// Збереження вмісту холодильника в localStorage браузера.
const KEY = "refridge.items.v1";

export function loadItems() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveItems(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Сховище недоступне (приватний режим тощо) — працюємо лише в пам'яті.
  }
}
