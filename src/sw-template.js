// Сервис-воркер. Список файлов и версия подставляются при сборке (vite.config.ts).
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'gorodok-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // по одному файлу: ответ с ошибкой не попадает в кэш, установка тогда не считается успешной
    for (const url of FILES) {
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error('precache ' + url + ' ' + res.status);
      await cache.put(url, res);
    }
  })());
  // skipWaiting не вызываем: новая версия ждёт, пока игрок согласится обновиться
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('gorodok-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'VERSION') event.source && event.source.postMessage({ version: VERSION, files: FILES.length });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) || (req.mode === 'navigate' ? await cache.match('./', { ignoreVary: true }) : undefined);
    if (hit) return hit;
    return fetch(req); // чужие и неизвестные запросы в кэш не кладём
  })());
});
