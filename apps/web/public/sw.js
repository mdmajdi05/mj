/* Background push for private chat. Deliberately generic: no message text,
 * sender name or attachment name is ever shown in the notification. */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Study with Game';
  const body = typeof payload.body === 'string' ? payload.body : 'You have a new message';
  const eventType = typeof payload.eventType === 'string' ? payload.eventType : '';

  // Incoming calls never render a Chrome notification; ringing stays in-app.
  if (eventType === 'CALL_INCOMING') {
    event.waitUntil(Promise.resolve());
    return;
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof payload.tag === 'string' ? payload.tag : 'study-with-game',
      renotify: true,
      silent: false,
      data: {
        url: typeof payload.url === 'string' ? payload.url : '/?open=chat'
      }
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
        // In production the API is same-origin. In local development the web
        // app and API run on different ports, so the registration carries the
        // API base in its query string.
        const apiBase = new URL(self.location.href).searchParams.get('api') || '';
        const response = await fetch(`${apiBase}/api/chat/push/public-key`, {
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
        await fetch(`${apiBase}/api/chat/push/subscribe`, {
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
