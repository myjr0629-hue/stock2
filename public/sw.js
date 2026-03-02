// SIGNUM HQ — Service Worker v1.0
// Cache-First for static assets, Network-First for API/pages

const CACHE_NAME = 'signum-hq-v1';
const STATIC_ASSETS = [
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/manifest.json',
];

// Install: Pre-cache essential static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
            )
        )
    );
    self.clients.claim();
});

// Fetch: Network-first for navigation/API, cache-first for static files
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET and cross-origin
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    // API routes: network-only (real-time data)
    if (url.pathname.startsWith('/api/')) return;

    // Static assets (fonts, images, JS/CSS): Cache-first
    if (
        url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|eot)$/)
    ) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // Navigation (HTML pages): Network-first with cache fallback
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }
});
