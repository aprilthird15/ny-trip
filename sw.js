/* NEW YORK 2026 — 오프라인 저장용 서비스 워커
   - 페이지: 인터넷 되면 최신 버전을 받아 저장, 안 되면 저장본 표시
   - 지도 라이브러리·글꼴: 저장본 우선, 뒤에서 갱신
   - 지도 타일: 한 번 본 지역만 저장 (최대 600장) */
const VERSION = "ny2026-v1";
const PAGE = "page-" + VERSION;
const ASSET = "asset-" + VERSION;
const TILE = "tiles-v1";
const CORE = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-180.png"];
const LIBS = [
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const pc = await caches.open(PAGE);
    await pc.addAll(CORE);
    const ac = await caches.open(ASSET);
    await Promise.all(LIBS.map(u => fetch(u, {mode: "cors"}).then(r => r.ok && ac.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![PAGE, ASSET, TILE].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trimTiles() {
  const c = await caches.open(TILE); const keys = await c.keys();
  for (let i = 0; i < keys.length - 600; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 페이지(같은 사이트): 네트워크 우선 → 실패 시 저장본
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(PAGE);
      try {
        const r = await fetch(req);
        if (r.ok) c.put(req.mode === "navigate" ? "./index.html" : req, r.clone());
        return r;
      } catch (err) {
        return (await c.match(req.mode === "navigate" ? "./index.html" : req, {ignoreSearch: true})) ||
               (await c.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // 지도 타일: 저장본 우선, 없으면 받아서 저장
  if (url.hostname === "tile.openstreetmap.org") {
    e.respondWith((async () => {
      const c = await caches.open(TILE);
      const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === "opaque") { c.put(req, r.clone()); trimTiles(); } return r; }
      catch (err) { return Response.error(); }
    })());
    return;
  }

  // 지도 라이브러리·글꼴: 저장본 먼저 보여주고 뒤에서 갱신
  if (/cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(ASSET);
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});
