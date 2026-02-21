// ══════════════════════════════════════════════
//   Echo. — Service Worker
//   Network-first so updates always show
// ══════════════════════════════════════════════

const CACHE  = ‘echo-v2’; // bump this whenever you want to force a refresh
const ASSETS = [
‘/’,
‘/index.html’,
‘/app.css’,
‘/app.js’,
‘/manifest.json’,
‘/icons/icon-192.png’,
‘/icons/icon-512.png’,
];

// Install: pre-cache app shell
self.addEventListener(‘install’, e => {
e.waitUntil(
caches.open(CACHE).then(c => c.addAll(ASSETS))
);
self.skipWaiting(); // activate immediately, don’t wait
});

// Activate: delete ALL old caches so stale files are gone
self.addEventListener(‘activate’, e => {
e.waitUntil(
caches.keys().then(keys =>
Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
)
);
self.clients.claim(); // take control of all open tabs immediately
});

// Fetch: NETWORK-FIRST for app files, fallback to cache if offline
self.addEventListener(‘fetch’, e => {
const url = new URL(e.request.url);

// Skip non-GET and cross-origin model/font requests — let them go direct
if (e.request.method !== ‘GET’) return;
if (url.hostname !== location.hostname) return;

e.respondWith(
fetch(e.request)
.then(res => {
// Got a fresh response — update the cache with it
if (res && res.status === 200) {
const clone = res.clone();
caches.open(CACHE).then(c => c.put(e.request, clone));
}
return res;
})
.catch(() => {
// Offline — serve from cache
return caches.match(e.request)
.then(cached => cached || caches.match(’/index.html’));
})
);
});