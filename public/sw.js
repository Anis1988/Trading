// Minimal service worker: makes the app installable and shows push notifications.
// It deliberately does not cache anything, so you never see a stale version of the app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = { title: 'Trading Assistant', body: '' };
  try {
    d = e.data ? e.data.json() : d;
  } catch {
    d.body = e.data ? e.data.text() : '';
  }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, icon: '/icon-192.png', badge: '/icon-192.png' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ('focus' in w) return w.focus();
      return self.clients.openWindow('/');
    }),
  );
});
