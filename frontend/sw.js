const CACHE_NAME = "ai-robot-cache-v1";

const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/ai3.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", event => {

  const request = event.request;

  // ❌ Do NOT cache API or POST requests
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Ignore chat API
  if (url.pathname.startsWith("/chat")) return;

  event.respondWith(
    caches.match(request).then(response => {
      return response || fetch(request);
    })
  );

});
