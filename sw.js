const CACHE = "budget-pwa-v1";
const ASSETS = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
});
