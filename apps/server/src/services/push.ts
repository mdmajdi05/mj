import webpush from 'web-push';
import { prisma } from '../middleware/auth';
import { isGlobalNotificationsEnabled } from './notificationSettings';

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
 * A short, generic label for the notification body. It describes the kind of
 * event only: message text, sender names and attachment names are never
 * included, so a notification preview can never leak private content.
 */
function genericBodyFor(eventType?: string) {
  switch (eventType) {
    case 'NEW_MESSAGE':
    case 'GAME_MESSAGE':
      // Secret app: recipients should never learn this was a real message.
      // The copy stays promotional/offer-like.
      return 'Best deal $10';
    case 'CALL_INCOMING':
      // The incoming-call offer shows as a playful "Best deal" in the UI and
      // the same copy is used for the background push notification.
      return 'Best deal $10';
    case 'PERMISSION_REQUEST':
      return 'New permission request';
    default:
      return 'New activity';
  }
}

/**
 * Background Web Push for one account.
 *
 * Delivery requires all of the following:
 *  1. VAPID credentials are configured on the server.
 *  2. The Host's global notification switch is on.
 *  3. The Host has not revoked notifications for this account.
 *  4. The account enabled browser notifications in Settings and registered a
 *     push subscription.
 *
 * The payload intentionally contains no message text, sender name or
 * attachment name. The service worker shows a generic title only.
 */
export async function sendGenericPush(userId: string, eventType?: string) {
  if (!pub || !priv) return;

  const [globalEnabled, access, preference] = await Promise.all([
    isGlobalNotificationsEnabled(),
    prisma.userPreference.findUnique({
      where: { userId },
      select: {
        chatNotifications: true,
        adminPushNotifications: true,
        adminButterflyNotifications: true,
        adminSoundNotifications: true
      }
    }),
    prisma.notificationPreference.findUnique({ where: { userId } })
  ]);

  // Admin-wide switch wins over everything else.
  if (!globalEnabled) return;
  // Host grant must allow notifications; butterfly, sound and Chrome push each
  // have their own user-controlled switch.
  if (access?.chatNotifications === false) return;
  if (access?.adminPushNotifications === false) return;
  if (!preference?.browser) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subscriptions.length) return;

  const payload = JSON.stringify({
    title: 'Study with Game',
    body: genericBodyFor(eventType),
    eventType: eventType || 'ACTIVITY',
    tag: 'study-with-game',
    url: '/?open=chat'
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          },
          payload,
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
