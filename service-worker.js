const CACHE_NAME = 'reach-out-ema-v1.0.0';
const RUNTIME_CACHE = 'reach-out-ema-runtime';

// Files to cache on install
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Caching static files');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        console.log('✅ Service Worker: Installation complete');
        return self.skipWaiting(); // Activate immediately
      })
      .catch(error => {
        console.error('❌ Service Worker: Installation failed', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activating...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activation complete');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin && !url.origin.includes('firebase') && !url.origin.includes('gstatic')) {
    return;
  }

  // Handle Firebase requests - always go to network
  if (url.origin.includes('firebase') || url.origin.includes('firestore')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          console.log('⚠️ Firebase request failed - offline mode');
        })
    );
    return;
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          console.log('✅ Serving from cache:', request.url);
          return cachedResponse;
        }

        // If not in cache, fetch from network
        return fetch(request)
          .then(response => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache runtime assets
            caches.open(RUNTIME_CACHE)
              .then(cache => {
                cache.put(request, responseToCache);
              });

            return response;
          })
          .catch(error => {
            console.error('❌ Fetch failed:', error);
            
            // Return offline page or fallback
            return caches.match('/index.html')
              .then(cachedPage => cachedPage || new Response('Offline - Please check your connection', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({
                  'Content-Type': 'text/plain'
                })
              }));
          });
      })
  );
});

// Background sync event - sync orders when back online
self.addEventListener('sync', event => {
  console.log('🔄 Service Worker: Background sync triggered');
  
  if (event.tag === 'sync-orders') {
    event.waitUntil(
      syncOrders()
        .then(() => {
          console.log('✅ Orders synced successfully');
        })
        .catch(error => {
          console.error('❌ Order sync failed:', error);
        })
    );
  }
});

// Push notification event
self.addEventListener('push', event => {
  console.log('📬 Service Worker: Push notification received');
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Reach out Ema Agency';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'notification',
    data: data.data || {},
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification clicked:', event.notification.tag);
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// Message event - communication with main app
self.addEventListener('message', event => {
  console.log('💬 Service Worker: Message received', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }).then(() => {
        console.log('✅ All caches cleared');
        event.ports[0].postMessage({ success: true });
      })
    );
  }
});

// Helper function to sync orders
async function syncOrders() {
  try {
    // Get pending orders from IndexedDB or cache
    const cache = await caches.open(RUNTIME_CACHE);
    const requests = await cache.keys();
    
    const orderRequests = requests.filter(req => 
      req.url.includes('orders') && req.method === 'POST'
    );
    
    // Attempt to send each pending order
    for (const request of orderRequests) {
      try {
        await fetch(request.clone());
        await cache.delete(request);
      } catch (error) {
        console.error('Failed to sync order:', error);
      }
    }
    
    return true;
  } catch (error) {
    throw error;
  }
}

// Log service worker lifecycle
console.log('🎉 Service Worker: Script loaded');
