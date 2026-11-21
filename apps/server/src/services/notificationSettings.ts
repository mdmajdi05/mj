import { prisma } from '../lib/prisma';

/** The singleton row id used by the global notification feature switch. */
export const NOTIFICATION_SETTING_ID = 'global';

export type NotificationFeatureState = {
  enabled: boolean;
  pushConfigured: boolean;
  updatedAt: Date | null;
  /** Admin-configurable push notification copy per event type. */
  notificationTexts?: Record<string, string> | null;
  /** Admin-configurable incoming call button labels. */
  callAcceptText?: string | null;
  callRejectText?: string | null;
};

/** The default promotional copy used when no admin override is saved. */
export const DEFAULT_NOTIFICATION_TEXTS: Record<string, string> = {
  NEW_MESSAGE: 'Best deal $10',
  GAME_MESSAGE: 'Pay only $5',
  CALL_INCOMING: 'Best coming deal $50',
  PERMISSION_REQUEST: 'New permission request',
  ACTIVITY: 'New activity'
};

/** Returns the admin-configured push notification copy for an event type. */
export async function getNotificationTexts(): Promise<Record<string, string>> {
  const row = await prisma.notificationSetting
    .findUnique({ where: { id: NOTIFICATION_SETTING_ID } })
    .catch(() => null);
  const texts = (row?.notificationTexts ?? null) as Record<string, string> | null;
  return texts ?? DEFAULT_NOTIFICATION_TEXTS;
}

/** The default incoming call button labels. */
export const DEFAULT_CALL_ACCEPT_TEXT = 'Pay';
export const DEFAULT_CALL_REJECT_TEXT = 'Reject';

/** True when the server has Web Push (VAPID) credentials configured. */
export function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** The Host's global switch is authoritative: when off nothing is emitted. */
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
  const texts = (row?.notificationTexts ?? null) as Record<string, string> | null;
  return {
    enabled: row?.enabled ?? true,
    pushConfigured: isPushConfigured(),
    updatedAt: row?.updatedAt ?? null,
    notificationTexts: texts,
    callAcceptText: row?.callAcceptText ?? DEFAULT_CALL_ACCEPT_TEXT,
    callRejectText: row?.callRejectText ?? DEFAULT_CALL_REJECT_TEXT
  };
}

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
  };
}

/**
 * Admin-configurable notification copy. Only the Host should call this; the
 * values persist on the global notification setting and are used for every
 * push notification until changed again.
 */
export async function setNotificationCopies(params: {
  notificationTexts?: Record<string, string>;
  callAcceptText?: string;
  callRejectText?: string;
  updatedBy: string;
}) {
  const row = await prisma.notificationSetting.upsert({
    where: { id: NOTIFICATION_SETTING_ID },
    create: {
      id: NOTIFICATION_SETTING_ID,
      enabled: true,
      updatedBy: params.updatedBy,
      notificationTexts: params.notificationTexts ?? undefined,
      callAcceptText: params.callAcceptText ?? undefined,
      callRejectText: params.callRejectText ?? undefined
    },
    update: {
      ...(params.notificationTexts !== undefined ? { notificationTexts: params.notificationTexts } : {}),
      ...(params.callAcceptText !== undefined ? { callAcceptText: params.callAcceptText } : {}),
      ...(params.callRejectText !== undefined ? { callRejectText: params.callRejectText } : {})
    }
  });
  const texts = (row.notificationTexts ?? null) as Record<string, string> | null;
  return {
    enabled: row.enabled,
    pushConfigured: isPushConfigured(),
    updatedAt: row.updatedAt,
    notificationTexts: texts,
    callAcceptText: row.callAcceptText ?? DEFAULT_CALL_ACCEPT_TEXT,
    callRejectText: row.callRejectText ?? DEFAULT_CALL_REJECT_TEXT
  };
}
