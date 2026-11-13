importScripts('./push-worker.js');
const CACHE_NAME = "rfl-f1-league-v18";
const APP_FILES = [
  "./",
  "./index.html",
  "./backend-config.js",
  "./friends.js",
  "./push.js",
  "./push-worker.js",
  "./startup.js",
  "./intro.css",
  "./help.js",
  "./assets/rfl-intro-logo.png",
  "./trailer-player.js",
  "./assets/rfl-s4-2027-poster-05b8286fed.jpg",
  "./ui-fixes.css",
  "./release-notes.js",
  "./release-notes.json",
  "./app-updates.js",
  "./profile-crop.js",
  "./profile-crop.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./assets/rfl-logo.png",
  "./assets/rfl-discord-avatar-v2.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("rfl-f1-league-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Let the browser handle video byte ranges; do not put a 206 response in CacheStorage.
  // Films load only when Play is pressed, keeping startup light on mobile data.
  if (url.pathname.endsWith(".mp4")) return;

  if (url.pathname.endsWith("/release-notes.json")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || new Response('{"schemaVersion":1,"items":[]}', { headers: { "Content-Type": "application/json" } });
      }
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put("./index.html", response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("./index.html"));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});
