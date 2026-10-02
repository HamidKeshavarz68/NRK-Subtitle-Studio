// Local preview server + CORS proxy for the Samsung TV app.
//
//   node scripts/tv-server.mjs [--port 8787]
//
// • Serves build/tv/app so you can try the TV UI in a desktop browser
//   (arrow keys, Enter, Esc/Backspace = Back, R/G/Y/B = colour keys).
// • /proxy?url=<https://…nrk.no/…> forwards GET requests to NRK / Google
//   Translate and adds CORS headers. The TV app uses it automatically when it is
//   served from here, and on the TV if direct requests are blocked and you
//   enter this computer's address under Settings → Proxy server.

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = resolve(root, "build/tv/app");
const portArg = process.argv.indexOf("--port");
const port = Number((portArg !== -1 && process.argv[portArg + 1]) || process.env.PORT || 8787);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const ALLOWED_HOSTS = [/^(.+\.)?nrk\.no$/i, /^translate\.googleapis\.com$/i];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

async function proxy(req, res, target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    res.writeHead(400, cors).end("bad url");
    return;
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.some((re) => re.test(url.hostname))) {
    res.writeHead(403, cors).end("host not allowed");
    return;
  }
  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (SMART-TV; Tizen) NRK-Subtitle-Studio", Accept: "*/*" },
      redirect: "follow",
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      ...cors,
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(502, cors).end("upstream error: " + (e instanceof Error ? e.message : String(e)));
  }
}

function serveStatic(res, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  let file = join(appDir, rel || "index.html");
  if (!file.startsWith(appDir)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, cors).end();
    return;
  }
  if (url.pathname === "/proxy") {
    void proxy(req, res, url.searchParams.get("url") || "");
    return;
  }
  serveStatic(res, url.pathname);
});

if (!existsSync(join(appDir, "index.html"))) {
  console.warn("⚠ build/tv/app not found — run `npm run build:tv` first. The proxy still works.");
}

server.listen(port, "0.0.0.0", () => {
  console.log(`NRK Subtitle Studio TV preview + proxy on port ${port}`);
  console.log(`  Local:   http://localhost:${port}/`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === "IPv4" && !a.internal) console.log(`  Network: http://${a.address}:${port}/   (TV proxy setting: ${a.address}:${port})`);
    }
  }
});
