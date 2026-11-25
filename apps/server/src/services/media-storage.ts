import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import type { IncomingMessage } from 'node:http';
import { HttpError } from '../lib/http-error';

/**
 * Private media bytes live outside PostgreSQL so multi-GB videos do not hit
 * BYTEA or row-size ceilings. The directory is mounted from a durable volume
 * in production and is configurable through MEDIA_STORAGE_DIR.
 */
const storageDirectory =
  process.env.MEDIA_STORAGE_DIR || join(process.cwd(), '.media');

export function mediaStorageDirectory() {
  return storageDirectory;
}

/**
 * Streams the request body to a temporary file, enforcing the live Host
 * setting while it arrives. A rejected upload leaves no partial file behind.
 */
export async function storeIncomingMedia(
  request: IncomingMessage,
  maxBytes: number,
  limitMessage: string
): Promise<{ storageKey: string; size: number }> {
  const declaredSize = Number(request.headers['content-length']);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    request.resume();
    throw new HttpError(413, limitMessage);
  }

  await mkdir(storageDirectory, { recursive: true, mode: 0o700 });
  const storageKey = randomUUID();
  const temporaryPath = join(storageDirectory, `${storageKey}.part`);
  const finalPath = join(storageDirectory, storageKey);
  const output = createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 });
  const outputFinished = finished(output);
  void outputFinished.catch(() => undefined);
  let size = 0;
  let exceedsLimit = false;

  try {
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes) {
        exceedsLimit = true;
        continue;
      }
      if (!output.write(bytes)) await once(output, 'drain');
    }

    if (exceedsLimit) {
      throw new HttpError(413, limitMessage);
    }
    if (size === 0) throw new HttpError(400, 'Choose a file or a photo to send');

    output.end();
    await outputFinished;
    await rename(temporaryPath, finalPath);
    return { storageKey, size };
  } catch (error) {
    output.destroy();
    await outputFinished.catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch((cleanupError: unknown) => {
      console.error('Failed to remove temporary media upload', cleanupError);
    });
    throw error;
  }
}

export function mediaPath(storageKey: string) {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storageKey);
  if (!isUuid) {
    throw new Error('Invalid media storage key');
  }
  return join(storageDirectory, storageKey);
}

export async function removeStoredMedia(storageKey: string) {
  await rm(mediaPath(storageKey), { force: true });
}

/** Removes `.part` files left behind by a crash during an upload. */
export async function cleanupTemporaryMediaFiles() {
  await mkdir(storageDirectory, { recursive: true, mode: 0o700 });
  const entries = await readdir(storageDirectory, { withFileTypes: true });
  const abandonedUploads = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.part$/i.test(
          entry.name
        )
    )
    .map((entry) => rm(join(storageDirectory, entry.name), { force: true }));
  await Promise.all(abandonedUploads);
}

export function parseMediaRange(header: string | undefined, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;

  const start = match[1] ? Number(match[1]) : null;
  const requestedEnd = match[2] ? Number(match[2]) : null;
  if (
    (start !== null && !Number.isSafeInteger(start)) ||
    (requestedEnd !== null && !Number.isSafeInteger(requestedEnd))
  ) {
    return null;
  }

  if (start === null) {
    if (requestedEnd === 0) return 'unsatisfiable';
    if (requestedEnd === null || requestedEnd < 0) return null;
    return {
      start: Math.max(0, size - requestedEnd),
      end: size - 1
    };
  }

  if (start >= size || (requestedEnd !== null && requestedEnd < start)) return 'unsatisfiable';
  return { start, end: Math.min(requestedEnd ?? size - 1, size - 1) };
}
