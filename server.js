// Мінімальний статичний сервер для ReFridge (без залежностей) — для Railway та локального запуску.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 5173;

// Роздаємо лише файли застосунку, а не весь репозиторій.
const PUBLIC = ["index.html", "manifest.webmanifest", "sw.js", "src/", "assets/", "icons/"];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".json": "application/json",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
    if (path === "" || path.endsWith("/")) path += "index.html";
    const file = normalize(join(ROOT, path));
    // Перевіряємо вже нормалізований шлях, щоб «src/../server.js» не проскочив.
    const rel = relative(ROOT, file).split(sep).join("/");
    const allowed = !rel.startsWith("..") && PUBLIC.some((p) => rel === p || (p.endsWith("/") && rel.startsWith(p)));
    if (!allowed || !(await stat(file)).isFile()) throw new Error("not found");

    const ext = extname(file);
    // Фото й іконки довго кешуються, код і service worker — перевіряються щоразу.
    const cache = ext === ".webp" || ext === ".png" ? "public, max-age=604800" : "no-cache";
    res.writeHead(200, { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": cache });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Не знайдено");
  }
}).listen(PORT, () => console.log(`ReFridge: http://localhost:${PORT}`));

// Railway зупиняє контейнер сигналом SIGTERM — виходимо одразу.
process.on("SIGTERM", () => process.exit(0));
