const CACHE_NAME = "ai-robot-cache-v3";

const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/ai3.png",
  "/pasta.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", event => {

  const requestURL = new URL(event.request.url);

  // Only handle same-origin requests
  if (requestURL.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
