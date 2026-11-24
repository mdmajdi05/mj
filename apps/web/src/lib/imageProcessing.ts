/**
 * Client-side image preparation.
 *
 * Camera photos and modern phone gallery images are often 8–30 MB and many
 * thousands of pixels wide. Uploading them untouched wastes bandwidth and can
 * trip reverse-proxy body limits. This module downsizes and re-encodes images
 * in the browser before upload. It never throws: if the browser cannot decode
 * an image (for example HEIC in an unsupported browser) the original file is
 * returned unchanged.
 */

import { formatUploadLimit } from './uploadLimits';

const MAX_DIMENSION = 2560;
const MAX_TARGET_BYTES = 6 * 1024 * 1024;
const SKIP_IF_SMALLER_THAN = 1.5 * 1024 * 1024;
const SKIPPED_TYPES = new Set(['image/gif', 'image/svg+xml']);

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close()
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url)
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  );
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (typeof window === 'undefined') return file;
  if (!file.type.startsWith('image/') || SKIPPED_TYPES.has(file.type)) return file;

  let decoded: Decoded | null = null;
  try {
    decoded = await decode(file);
    const { width, height } = decoded;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    // Small, already-web-sized images do not need another lossy pass.
    if (scale === 1 && file.size <= SKIP_IF_SMALLER_THAN) return file;

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) return file;

    // Flatten transparency onto white so PNG screenshots do not turn black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);

    let quality = 0.86;
    let blob = await canvasToBlob(canvas, quality);
    while (blob && blob.size > MAX_TARGET_BYTES && quality > 0.52) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, quality);
    }
    if (!blob) return file;

    // Re-encoding can occasionally grow a small file; keep the original then.
    if (scale === 1 && blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } catch {
    // Unsupported codec (HEIC/AVIF on some browsers) or canvas failure.
    return file;
  } finally {
    decoded?.release();
  }
}

export function describeUploadLimit(kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE') {
  const label =
    kind === 'VIDEO'
      ? 'Videos'
      : kind === 'IMAGE'
        ? 'Images'
        : kind === 'AUDIO'
          ? 'Voice messages'
          : 'Files';
  return `${label} must be ${formatUploadLimit()} or smaller.`;
}
