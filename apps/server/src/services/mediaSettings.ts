import { prisma } from '../lib/prisma';

/** The singleton row id used by the global media upload setting. */
export const MEDIA_SETTING_ID = 'global';

/**
 * Initial value used only to create the singleton row. Once the row exists,
 * the value saved by the Host is authoritative; this constant is never used
 * to reject an upload on its own.
 */
export const DEFAULT_MAX_UPLOAD_MB = 2048;

/**
 * PostgreSQL stores maxUploadMb as a 32-bit INTEGER. This is a storage guard,
 * not a media policy: it allows roughly two petabytes, far above any real
 * upload, while keeping the column valid.
 */
export const MAX_UPLOAD_MB_VALUE = 2_147_483_647;

export type MediaSettingState = {
  maxUploadMb: number;
  maxUploadBytes: number;
  updatedAt: Date | null;
  updatedBy: string | null;
};

function normalizeMaxUploadMb(value: number | null | undefined): number {
  if (!Number.isFinite(value) || !value || value < 1) return DEFAULT_MAX_UPLOAD_MB;
  return Math.min(MAX_UPLOAD_MB_VALUE, Math.floor(value));
}

function stateFromRow(row: {
  maxUploadMb: number;
  updatedAt: Date | null;
  updatedBy: string | null;
}): MediaSettingState {
  const maxUploadMb = normalizeMaxUploadMb(row.maxUploadMb);
  return {
    maxUploadMb,
    maxUploadBytes: maxUploadMb * 1024 * 1024,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy
  };
}

/** Returns the Host-managed ceiling shared by every media kind. */
export async function getMediaSetting(): Promise<MediaSettingState> {
  const row = await prisma.mediaSetting
    .findUnique({ where: { id: MEDIA_SETTING_ID } })
    .catch(() => null);
  if (!row) {
    return {
      maxUploadMb: DEFAULT_MAX_UPLOAD_MB,
      maxUploadBytes: DEFAULT_MAX_UPLOAD_MB * 1024 * 1024,
      updatedAt: null,
      updatedBy: null
    };
  }
  return stateFromRow(row);
}

/**
 * Persists the Host's chosen ceiling. The caller is responsible for the
 * host-only check; every client receives the new value through the socket
 * `media:upload-limit` event.
 */
export async function setMediaUploadLimit(
  maxUploadMb: number,
  updatedBy: string
): Promise<MediaSettingState> {
  const normalized = normalizeMaxUploadMb(maxUploadMb);
  const row = await prisma.mediaSetting.upsert({
    where: { id: MEDIA_SETTING_ID },
    create: {
      id: MEDIA_SETTING_ID,
      maxUploadMb: normalized,
      updatedBy
    },
    update: {
      maxUploadMb: normalized,
      updatedBy
    }
  });
  return stateFromRow(row);
}
