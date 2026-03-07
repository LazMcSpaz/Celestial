// Celestial — Service Worker
// Handles caching for offline capability and push notifications

const CACHE_NAME = 'celestial-v1';
const FONT_CACHE = 'celestial-fonts-v1';

// Assets to cache on install
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

// ─── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate ──────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== FONT_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Google Fonts — cache-first (they're versioned; safe to cache long-term)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(resp => {
            cache.put(request, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  // App shell (index.html) — network-first, fallback to cache
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html') ||
      url.pathname.endsWith('manifest.json') || url.pathname.endsWith('icon.svg')) {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return resp;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else — try network, fall through
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// ─── Push Notifications ────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Celestial', body: 'Your daily sky is ready.' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}

  const opts = {
    body: data.body,
    icon: './icon.svg',
    badge: './icon.svg',
    tag: data.tag || 'celestial-default',
    renotify: !!data.renotify,
    data: data.url ? { url: data.url } : {},
    actions: data.actions || []
  };

  event.waitUntil(self.registration.showNotification(data.title, opts));
});

// ─── Notification click ────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const match = wins.find(w => w.url.includes('index.html') || w.url.endsWith('/'));
      if (match) return match.focus();
      return clients.openWindow(url);
    })
  );
});

// ─── Background sync (future) ──────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'celestial-morning-brief') {
    event.waitUntil(showMorningBrief());
  }
});

async function showMorningBrief() {
  await self.registration.showNotification('Celestial — Morning Brief', {
    body: 'Your sky report for today is ready.',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: 'morning-brief',
    data: { url: './' }
  });
}
