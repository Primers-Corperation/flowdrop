const CACHE_NAME = 'localchat-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon.svg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
  'https://unpkg.com/lucide@latest'
];

// Install Event
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching shell assets');
      cache.addAll(ASSETS);
    })
  );
});

// Activate Event
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
});

// Fetch Event
self.addEventListener('fetch', (evt) => {
  // Ignore non-GET requests and API/socket requests
  if (evt.request.method !== 'GET' || evt.request.url.includes('/socket.io/')) {
    return;
  }
  
  evt.respondWith(
    caches.match(evt.request).then((cacheRes) => {
      return cacheRes || fetch(evt.request).then((fetchRes) => {
        return caches.open(CACHE_NAME).then((cache) => {
          // Put in cache if it belongs to our origin or allowed CDNs
          if (evt.request.url.startsWith(self.location.origin) || 
              evt.request.url.startsWith('https://fonts.') ||
              evt.request.url.startsWith('https://unpkg.')) {
              if (evt.request.url.indexOf('/uploads/') === -1) {
                  cache.put(evt.request.url, fetchRes.clone());
              }
          }
          return fetchRes;
        });
      });
    }).catch(() => {
      // Fallback for offline if needed (e.g. return cached index.html for navigation)
      if (evt.request.mode === 'navigate') {
          return caches.match('/index.html');
      }
    })
  );
});
