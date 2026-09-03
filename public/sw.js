const CACHE_VERSION = "hh-science-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("hh-science-") && key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      ),
    ]),
  );
});

// 不快取登入、AI、後台或其他動態資料。
// Service Worker 僅提供 PWA 安裝能力，所有請求仍直接走網路。
self.addEventListener("fetch", () => {});
