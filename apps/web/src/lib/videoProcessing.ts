/**
 * Client-side video preparation.
 *
 * Large gallery videos are re-encoded in the browser before upload when they
 * are bigger than COMPRESS_THRESHOLD. The re-encode uses the native
 * MediaRecorder + canvas pipeline (no dependency, no upload of the original),
 * scales to at most MAX_DIMENSION on the long side and targets a sane bitrate.
 *
 * If anything is unsupported (MediaRecorder missing, audio graph blocked,
 * codec unsupported, decode error) the original file is returned unchanged so
 * sending still works.
 */

const COMPRESS_THRESHOLD = 120 * 1024 * 1024; // 120 MB
const MAX_DIMENSION = 1280;
const TARGET_BITRATE = 2_500_000;
const AUDIO_BITRATE = 96_000;
const METADATA_TIMEOUT = 60_000;

function pickRecorderType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ];
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // Ignore unsupported probes.
    }
  }
  return null;
}

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
}

export async function prepareVideoForUpload(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<File> {
  if (typeof window === 'undefined') return file;
  if (!file.type.startsWith('video/')) return file;
  // Small and medium videos are already fine; re-encoding costs real time.
  if (file.size <= COMPRESS_THRESHOLD) return file;
  const mimeType = pickRecorderType();
  if (!mimeType) return file;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  let canvasStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('Video metadata timed out')),
        METADATA_TIMEOUT
      );
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Could not read the video'));
      };
    });

    if (
      !video.videoWidth ||
      !video.videoHeight ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0
    ) {
      return file;
    }

    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight)
    );
    const width = even(video.videoWidth * scale);
    const height = even(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;

    if (typeof canvas.captureStream !== 'function') return file;
    canvasStream = canvas.captureStream(30);

    // Keep the audio track alive through the canvas recording. It is routed to
    // a silent gain so the user does not hear the video while compressing.
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtor) {
        audioContext = new AudioCtor();
        const source = audioContext.createMediaElementSource(video);
        const recorderDestination = audioContext.createMediaStreamDestination();
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        source.connect(recorderDestination);
        source.connect(silentGain);
        silentGain.connect(audioContext.destination);
        const audioTrack = recorderDestination.stream.getAudioTracks()[0];
        if (audioTrack) canvasStream.addTrack(audioTrack);
      }
    } catch {
      audioContext = null;
    }

    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: TARGET_BITRATE,
      audioBitsPerSecond: AUDIO_BITRATE
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () =>
        resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
      recorder.onerror = () => reject(new Error('Video compression failed'));
    });

    if (audioContext?.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {
        // Autoplay policies may block resuming; compression still continues.
      }
    }

    let frame = 0;
    const draw = () => {
      if (video.readyState >= 2 && !video.paused && !video.ended) {
        context.drawImage(video, 0, 0, width, height);
        onProgress?.(Math.min(0.99, video.currentTime / video.duration));
      }
      frame = requestAnimationFrame(draw);
    };

    recorder.start(1000);
    frame = requestAnimationFrame(draw);
    await video.play();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });

    cancelAnimationFrame(frame);
    recorder.stop();
    const blob = await recorded;

    if (!blob.size || blob.size >= file.size) return file;

    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([blob], `${baseName}-compressed.${extension}`, {
      type: blob.type,
      lastModified: Date.now()
    });
  } catch {
    // Any decode/recording failure falls back to the original upload.
    return file;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
    canvasStream?.getTracks().forEach((track) => track.stop());
    if (audioContext) {
      audioContext.close().catch(() => undefined);
    }
  }
}
