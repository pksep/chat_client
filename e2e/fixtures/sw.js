self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event =>
  event.waitUntil(self.clients.claim())
);
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const version = Number(
    new URL(self.location.href).searchParams.get('version')
  );
  if (url.pathname === '/web-update.json' && version > 0) {
    event.respondWith(
      new Response(JSON.stringify({ version }), {
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store'
        }
      })
    );
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches
        .match(event.request, { ignoreSearch: true })
        .then(cached => cached || fetch(event.request))
    );
  }
});
