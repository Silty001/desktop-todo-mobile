// Network first, cache as fallback: updates show up whenever online, and the app still opens offline.
// Firestore traffic is not cached here; the Firebase SDK keeps its own offline copy.
const CACHE = 'desktop-todo-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const cacheable = e.request.method === 'GET' && (url.origin === location.origin ||
    url.host === 'www.gstatic.com' || url.host.startsWith('fonts.'));
  if (!cacheable) return;
  e.respondWith(fetch(e.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return response;
  }).catch(() => caches.match(e.request, { ignoreSearch: url.origin === location.origin })));
});
