import webpush from 'web-push';
import { prisma } from '../middleware/auth';

const pub = process.env.VAPID_PUBLIC_KEY || '';
const priv = process.env.VAPID_PRIVATE_KEY || '';

if (pub && priv) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    pub,
    priv
  );
}

/**
 * Background Web Push. The payload intentionally contains no message text,
 * sender name or attachment name. The service worker shows a generic title
 * only, so a notification preview can never leak private content.
 */
export async function sendGenericPush(userId: string) {
  if (!pub || !priv) return;

  // Admin grant + user browser preference must both allow chat notifications.
  const [access, preference] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId },
      select: { chatNotifications: true }
    }),
    prisma.notificationPreference.findUnique({ where: { userId } })
  ]);
  if (access?.chatNotifications === false) return;
  if (!preference?.browser) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          },
          JSON.stringify({
            title: 'Study with Game',
            body: '',
            tag: 'study-with-game',
            url: '/'
          }),
          { TTL: 3600, urgency: 'high' }
        );
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: subscription.id } })
            .catch(() => {});
        } else {
          console.error('Web Push delivery failed', error?.message || error);
        }
      }
    })
  );
}
