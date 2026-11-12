const CACHE_NAME = "deutsch-v11";
const APP_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "words.json",
  "phrases.json",
  "manifest.json",
  "icons/logo.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          APP_ASSETS.map(
            (assetUrl) => new Request(assetUrl, { cache: "reload" }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (new URL(event.request.url).origin === self.location.origin) {
          const cachedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, cachedResponse),
          );
        }

        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((cachedResponse) => cachedResponse || caches.match("index.html")),
      ),
  );
});
