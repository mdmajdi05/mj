self.addEventListener('push', event => {
  let data = { title: 'Private Duo', body: 'You have a new notification.' };
  try { if (event.data) { const parsed = event.data.json(); data = { title: 'Private Duo', body: parsed.body || 'You have a new notification.' }; } } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: 'private-duo-message',
    renotify: true,
    data: { url: '/' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) { if ('focus' in client) { if ('navigate' in client) await client.navigate('/?open=chat'); await client.focus(); return; } }
    await clients.openWindow('/?open=chat');
  })());
});
