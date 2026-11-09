/*
 * Второй голос — сервис-воркер: хранит программу на телефоне, чтобы она открывалась без интернета.
 * VERSION и ASSETS обновляет скрипт android/update_sw.py — запускайте его после изменений.
 */
const VERSION = 'vg-0bfa7d9275';
const ASSETS = [
  "index.html",
  "manifest.webmanifest",
  "css/fonts.css",
  "css/style.css",
  "js/analysis.js",
  "js/audio.js",
  "js/core.js",
  "js/evt-content.js",
  "js/evt.js",
  "js/harmony.js",
  "js/home.js",
  "js/music.js",
  "js/pitch.js",
  "js/pwa.js",
  "js/solfege.js",
  "js/songs.js",
  "js/teacher.js",
  "js/voice.js",
  "js/warmup.js",
  "fonts/golos-text-cyrillic-0.woff2",
  "fonts/golos-text-latin-1.woff2",
  "fonts/jetbrains-mono-cyrillic-2.woff2",
  "fonts/jetbrains-mono-latin-3.woff2",
  "fonts/noto-music-latin-5.woff2",
  "fonts/noto-music-music-4.woff2",
  "fonts/unbounded-cyrillic-6.woff2",
  "fonts/unbounded-latin-7.woff2",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(['./'].concat(ASSETS))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error())),
    ),
  );
});
