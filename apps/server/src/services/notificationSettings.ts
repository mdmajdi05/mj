import { prisma } from '../lib/prisma';

/** The singleton row id used by the global notification feature switch. */
export const NOTIFICATION_SETTING_ID = 'global';

export type NotificationFeatureState = {
  enabled: boolean;
  pushConfigured: boolean;
  updatedAt: Date | null;
};

/** True when the server has Web Push (VAPID) credentials configured. */
export function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Reads the Host-managed global notification switch.
 *
 * A missing row (for example on an install that has not run the latest
 * migration yet) is treated as enabled so message notifications keep working
 * instead of silently disappearing.
 */
export async function isGlobalNotificationsEnabled(): Promise<boolean> {
  const row = await prisma.notificationSetting
    .findUnique({ where: { id: NOTIFICATION_SETTING_ID } })
    .catch(() => null);
  return row?.enabled ?? true;
}

export async function getNotificationFeatureState(): Promise<NotificationFeatureState> {
  const row = await prisma.notificationSetting
    .findUnique({ where: { id: NOTIFICATION_SETTING_ID } })
    .catch(() => null);
  return {
    enabled: row?.enabled ?? true,
    pushConfigured: isPushConfigured(),
    updatedAt: row?.updatedAt ?? null
  };
}

/** Persists the global switch. Returns the new feature state. */
export async function setGlobalNotificationsEnabled(enabled: boolean, updatedBy: string) {
  const row = await prisma.notificationSetting.upsert({
    where: { id: NOTIFICATION_SETTING_ID },
    create: { id: NOTIFICATION_SETTING_ID, enabled, updatedBy },
    update: { enabled, updatedBy }
  });
  return {
    enabled: row.enabled,
    pushConfigured: isPushConfigured(),
    updatedAt: row.updatedAt
  } satisfies NotificationFeatureState;
}
