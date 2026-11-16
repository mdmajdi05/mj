/* Background push for private chat. Deliberately generic: no message text,
 * sender name or attachment name is ever shown in the notification. */
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Study with Game', {
      body: '',
      tag: 'study-with-game',
      renotify: true,
      silent: false,
      data: { url: '/?open=chat' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const target = event.notification.data?.url || '/?open=chat';
      const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientsList) {
        if ('focus' in client) {
          if ('navigate' in client) await client.navigate(target);
          await client.focus();
          return;
        }
      }
      await clients.openWindow(target);
    })()
  );
});

/* Keep the subscription alive when Chrome rotates its endpoint. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch('/api/chat/push/public-key', {
          credentials: 'include'
        });
        const key = (await response.json())?.publicKey;
        if (!key) return;
        const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
        const applicationServerKey = Uint8Array.from(raw, (character) =>
          character.charCodeAt(0)
        );
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
        await fetch('/api/chat/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON())
        });
      } catch {
        /* The next app open can re-subscribe. */
      }
    })()
  );
});
