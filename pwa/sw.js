// Git Training の service worker。ビルド時に vite.config.ts の pwaPlugin が、版とファイル一覧（下の2つの目印）を埋めて dist/sw.js に書き出す。
// 全ファイルを最初に保存し、以後は通信なしで動く（設計書 §8）。新しい版は待機させ、画面の「更新」ボタンで切り替える。
const CACHE = 'git-training-__VERSION__';
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('git-training-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 画面の「更新」ボタンから届く
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) ?? (req.mode === 'navigate' ? await cache.match('./') : undefined);
      return hit ?? fetch(req);
    }),
  );
});
