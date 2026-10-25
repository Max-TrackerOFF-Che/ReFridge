// Service worker ReFridge: кешує застосунок, щоб він відкривався без інтернету.
// Змініть VERSION, коли оновлюєте файли, — старий кеш буде видалено.
const VERSION = "refridge-v1";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "src/app.js",
  "src/logic.js",
  "src/placement.js",
  "src/products.js",
  "src/recipes.js",
  "src/scene.js",
  "src/store.js",
  "src/styles.css",
  "assets/closed-sad.webp",
  "assets/closed-happy.webp",
  "assets/closed-neutral.webp",
  "assets/open-sad.webp",
  "assets/open-happy.webp",
  "assets/open-neutral.webp",
  "assets/bin-closed.webp",
  "assets/bin-open.webp",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Спершу мережа (щоб бачити оновлення), а без інтернету — кеш.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? caches.match("index.html"))),
  );
});
