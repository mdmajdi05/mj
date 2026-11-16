'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  File as FileIcon,
  Grid2X2,
  Image as ImageIcon,
  Mic,
  Paperclip,
  RefreshCcw,
  Send,
  Smile,
  Square,
  Trash2,
  X
} from 'lucide-react';
import type { Message } from '@/lib/types';
import { Modal } from '@/components/ui';
import {
  endMediaInteraction,
  holdMediaInteraction
} from '@/lib/mediaGuard';

const EMOJIS = ['😊', '😂', '❤️', '👍', '🙏', '🔥', '🎉', '😍', '😢', '🤔', '👏', '💜'];

function formatClock(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
  status: 'ready' | 'uploading' | 'error';
  progress: number;
  error?: string;
};

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onTyping: (typing: boolean) => void;
  onMediaSelect: (files: File[]) => void;
  onQuickSend: (files: File[]) => void;
  onVoiceSend: (blob: Blob) => void;
  pending?: PendingAttachment[];
  uploading?: boolean;
  onSendPending?: () => void;
  onCancelPending?: () => void;
  onRemovePending?: (id: string) => void;
  onRetryPending?: (id: string) => void;
  replyTo?: Message | null;
  replyAuthor?: string;
  onCancelReply?: () => void;
  editing?: Message | null;
  onCancelEdit?: () => void;
};

/**
 * Compact premium composer:
 * 4-dot menu (Camera / Attach / Gallery / File), emoji + input in the middle,
 * microphone when empty and Send as soon as there is text or a pending file.
 * The attachment menu is portalled and clamped to the viewport, so it is never
 * clipped on phones or tablets.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onTyping,
  onMediaSelect,
  onQuickSend,
  onVoiceSend,
  pending = [],
  uploading = false,
  onSendPending,
  onCancelPending,
  onRemovePending,
  onRetryPending,
  replyTo,
  replyAuthor,
  onCancelReply,
  editing,
  onCancelEdit
}: ChatComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ left: 8, top: 8, width: 280, above: true });
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [captured, setCaptured] = useState<{ file: File; url: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [wave, setWave] = useState<number[]>(() =>
    Array.from({ length: 28 }, () => 8 + Math.random() * 20)
  );

  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const attachRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  // Recording timer + animated waveform.
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    const waveTimer = window.setInterval(
      () => setWave(Array.from({ length: 28 }, () => 6 + Math.random() * 24)),
      160
    );
    return () => {
      window.clearInterval(timer);
      window.clearInterval(waveTimer);
    };
  }, [recording]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      recordStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (captured?.url) URL.revokeObjectURL(captured.url);
    };
  }, [captured?.url]);

  // The camera modal mounts after the state change, so attach the stream once
  // both the modal and the getUserMedia request are ready.
  useEffect(() => {
    if (!cameraOpen || !cameraReady) return;
    const video = videoRef.current;
    const stream = cameraStreamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [cameraOpen, cameraReady]);

  useEffect(() => {
    if (!menuOpen && !emojiOpen) return;
    const handler = (event: Event) => {
      const target = event.target as Node;
      if (
        menuOpen &&
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !menuButtonRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
      if (emojiOpen && emojiRef.current && !emojiRef.current.contains(target)) setEmojiOpen(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('touchstart', handler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [menuOpen, emojiOpen]);

  // The floating menu is anchored to the button but clamped inside the
  // viewport. It flips above/below depending on the available space.
  useEffect(() => {
    if (!menuOpen) return;
    const update = () => {
      const button = menuButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 16);
      const height = 104;
      const above = rect.top > height + 18;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const top = above ? rect.top - height - 10 : rect.bottom + 10;
      setMenuPos({ left, top, width, above });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [menuOpen]);

  function openFilePicker(ref: React.RefObject<HTMLInputElement | null>) {
    // Shield the privacy guard: the native picker hides the document.
    holdMediaInteraction(120000);
    setMenuOpen(false);
    ref.current?.click();
  }

  function pickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    endMediaInteraction();
    setMenuOpen(false);
    if (cameraOpen) closeCamera();
    if (files.length) onMediaSelect(files);
  }

  async function startCamera(facing: 'environment' | 'user') {
    setCameraError('');
    setCameraReady(false);
    setCameraBusy(true);
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser cannot open the camera. Pick a photo from the gallery instead.');
      }
      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        throw new Error('Camera access needs HTTPS. Open the site over a secure connection.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false
      });
      cameraStreamRef.current = stream;
      setCameraFacing(facing);
      setCameraReady(true);
    } catch (cause) {
      const error = cause as DOMException;
      const message =
        error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
          ? 'Camera permission is blocked. Tap “Try again” and choose Allow, or enable Camera in your browser site settings.'
          : error?.name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : error?.name === 'NotReadableError'
              ? 'The camera is already in use by another app. Close it and try again.'
              : error?.message || 'Camera could not be started.';
      setCameraError(message);
    } finally {
      setCameraBusy(false);
    }
  }

  async function openCamera() {
    holdMediaInteraction(120000);
    setMenuOpen(false);
    setCaptured(null);
    setCameraOpen(true);
    await startCamera(cameraFacing);
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraReady(false);
  }

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
    setCameraError('');
    if (captured?.url) URL.revokeObjectURL(captured.url);
    setCaptured(null);
    endMediaInteraction();
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setCameraError('The camera is still starting. Wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92)
    );
    if (!blob) return;
    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    if (captured?.url) URL.revokeObjectURL(captured.url);
    setCaptured({ file, url: URL.createObjectURL(blob) });
  }

  function sendCaptured() {
    if (!captured) return;
    const file = captured.file;
    // The captured photo is sent directly and never saved to the gallery.
    onQuickSend([file]);
    closeCamera();
  }

  function retakePhoto() {
    if (captured?.url) URL.revokeObjectURL(captured.url);
    setCaptured(null);
    setCameraError('');
    void startCamera(cameraFacing);
  }

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      holdMediaInteraction(120000);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      endMediaInteraction();
      recordStreamRef.current = stream;
      chunksRef.current = [];
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4'
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm'
        });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        recordStreamRef.current = null;
      };
      recorder.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      endMediaInteraction();
      onCancelReply?.();
      window.alert('Please allow microphone access to record a voice message.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setRecording(false);
  }

  function resetVoice() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordStreamRef.current = null;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setRecording(false);
    setAudioBlob(null);
    setAudioUrl('');
    setSeconds(0);
  }

  function sendVoice() {
    if (!audioBlob) return;
    const extension = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
    const file = new File([audioBlob], `voice-${Date.now()}.${extension}`, {
      type: audioBlob.type || 'audio/webm'
    });
    onVoiceSend(file);
    resetVoice();
  }

  const hasText = value.trim().length > 0;
  const hasPending = pending.length > 0;
  const voiceMode = recording || Boolean(audioBlob);

  const menu = menuOpen
    ? createPortal(
        <>
          <div className="composer-menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div
            ref={menuRef}
            className="composer-menu-portal"
            style={{ left: menuPos.left, top: menuPos.top, width: menuPos.width }}
            role="menu"
          >
            <button type="button" role="menuitem" onClick={() => void openCamera()}>
              <Camera size={21} />
              <span>Camera</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openFilePicker(attachRef)}
            >
              <Paperclip size={21} />
              <span>Attach</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openFilePicker(galleryRef)}
            >
              <ImageIcon size={21} />
              <span>Gallery</span>
            </button>
            <button type="button" role="menuitem" onClick={() => openFilePicker(fileRef)}>
              <FileIcon size={21} />
              <span>File</span>
            </button>
          </div>
        </>,
        document.body
      )
    : null;

  if (voiceMode) {
    return (
      <div className="composer-voice">
        <button type="button" className="composer-icon" onClick={resetVoice} aria-label="Cancel recording">
          <Trash2 size={19} />
        </button>

        {recording ? (
          <>
            <span className="composer-rec-dot" />
            <span className="composer-timer">{formatClock(seconds)}</span>
            <div className="composer-wave" aria-hidden="true">
              {wave.map((height, index) => (
                <span key={index} style={{ height: `${height}px` }} />
              ))}
            </div>
            <button
              type="button"
              className="composer-send composer-stop"
              onClick={stopRecording}
              aria-label="Stop recording"
            >
              <Square size={16} />
            </button>
          </>
        ) : (
          <>
            <audio src={audioUrl} controls className="composer-audio" />
            <button
              type="button"
              className="composer-send"
              onClick={sendVoice}
              aria-label="Send voice message"
            >
              <Send size={18} />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="composer-wrap">
      {menu}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onClick={() => holdMediaInteraction(120000)}
        onChange={pickFiles}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={pickFiles}
      />
      <input
        ref={attachRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.ppt,.pptx,.csv,.zip"
        multiple
        className="hidden"
        onChange={pickFiles}
      />
      <input ref={fileRef} type="file" multiple className="hidden" onChange={pickFiles} />

      {hasPending && (
        <div className="composer-pending">
          <div className="composer-pending-head">
            <span>
              {pending.length} attachment{pending.length === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="composer-pending-cancel"
                onClick={onCancelPending}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="composer-pending-send"
                onClick={onSendPending}
                disabled={uploading}
              >
                {uploading ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
          <div className="composer-pending-list">
            {pending.map((item) => (
              <div
                key={item.id}
                className={`composer-pending-item is-${item.status}`}
                title={item.error || item.file.name}
              >
                {item.kind === 'IMAGE' ? (
                  <img src={item.previewUrl} alt={item.file.name} />
                ) : item.kind === 'VIDEO' ? (
                  <video src={item.previewUrl} muted playsInline preload="metadata" />
                ) : (
                  <span className="composer-pending-file">
                    <FileIcon size={18} />
                  </span>
                )}
                <span className="composer-pending-meta">
                  <span className="composer-pending-name">{item.file.name}</span>
                  <span className="composer-pending-size">
                    {item.status === 'uploading'
                      ? `${item.progress}%`
                      : item.status === 'error'
                        ? item.error || 'Upload failed'
                        : formatSize(item.file.size)}
                  </span>
                </span>
                {item.status === 'uploading' && (
                  <span className="composer-pending-progress">
                    <span style={{ width: `${item.progress}%` }} />
                  </span>
                )}
                {item.status === 'error' ? (
                  <button
                    type="button"
                    className="composer-pending-action"
                    onClick={() => onRetryPending?.(item.id)}
                    aria-label="Retry upload"
                  >
                    <RefreshCcw size={13} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="composer-pending-action"
                  onClick={() => onRemovePending?.(item.id)}
                  disabled={uploading}
                  aria-label="Remove attachment"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {replyTo && !editing && (
        <div className="composer-quote">
          <span className="composer-quote-bar" />
          <div className="min-w-0 flex-1">
            <p className="composer-quote-title">Replying to {replyAuthor || 'message'}</p>
            <p className="composer-quote-text">
              {replyTo.content ||
                (replyTo.attachmentKind === 'IMAGE'
                  ? 'Photo'
                  : replyTo.attachmentKind === 'VIDEO'
                    ? 'Video'
                    : replyTo.attachmentKind === 'AUDIO'
                      ? 'Voice message'
                      : replyTo.attachmentName || 'Attachment')}
            </p>
          </div>
          <button type="button" className="composer-icon" onClick={onCancelReply} aria-label="Cancel reply">
            <X size={16} />
          </button>
        </div>
      )}

      {editing && (
        <div className="composer-quote is-edit">
          <span className="composer-quote-bar" />
          <div className="min-w-0 flex-1">
            <p className="composer-quote-title">Editing message</p>
            <p className="composer-quote-text">{editing.content}</p>
          </div>
          <button type="button" className="composer-icon" onClick={onCancelEdit} aria-label="Cancel edit">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="composer-bar">
        <button
          ref={menuButtonRef}
          type="button"
          className={`composer-icon composer-menu-btn ${menuOpen ? 'is-active' : ''}`}
          aria-label="Open attachments"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((open) => !open);
            setEmojiOpen(false);
          }}
        >
          {menuOpen ? <X size={20} /> : <Grid2X2 size={20} />}
        </button>

        <div className="composer-field">
          <textarea
            ref={textRef}
            rows={1}
            value={value}
            maxLength={5000}
            placeholder={editing ? 'Edit message…' : 'Message…'}
            onChange={(event) => {
              onChange(event.target.value);
              onTyping(event.target.value.length > 0);
              const element = event.currentTarget;
              element.style.height = 'auto';
              element.style.height = `${Math.min(element.scrollHeight, 112)}px`;
            }}
            onBlur={() => onTyping(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSend();
              }
              if (event.key === 'Escape') {
                onCancelEdit?.();
                onCancelReply?.();
                setMenuOpen(false);
                setEmojiOpen(false);
              }
            }}
          />

          <div className="relative" ref={emojiRef}>
            <button
              type="button"
              className="composer-emoji"
              aria-label="Emoji"
              onClick={() => {
                setEmojiOpen((open) => !open);
                setMenuOpen(false);
              }}
            >
              <Smile size={20} />
            </button>
            {emojiOpen && (
              <div className="composer-emojis" role="menu">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onChange(value + emoji);
                      setEmojiOpen(false);
                      textRef.current?.focus();
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {hasText || editing || hasPending ? (
          <button
            type="button"
            className="composer-send"
            onClick={onSend}
            aria-label={hasPending && !hasText ? 'Send attachments' : 'Send message'}
            disabled={uploading && !hasText}
          >
            <Send size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="composer-send composer-mic"
            onClick={() => void startRecording()}
            aria-label="Record voice message"
          >
            <Mic size={19} />
          </button>
        )}
      </div>

      <Modal
        open={cameraOpen}
        wide
        title={captured ? 'Preview photo' : 'Take a photo'}
        onClose={closeCamera}
      >
        <div className="camera-modal">
          {captured ? (
            <img src={captured.url} alt="Captured preview" className="camera-preview" />
          ) : (
            <>
              <div className="camera-stage">
                <video ref={videoRef} playsInline muted className="camera-preview" />
                {cameraBusy && <span className="camera-status">Starting camera…</span>}
                {!cameraBusy && cameraReady && (
                  <button
                    type="button"
                    className="camera-switch"
                    aria-label="Switch camera"
                    onClick={() =>
                      void startCamera(cameraFacing === 'environment' ? 'user' : 'environment')
                    }
                  >
                    <RefreshCcw size={17} />
                  </button>
                )}
              </div>
              {cameraError && (
                <div className="camera-error" role="alert">
                  <p>{cameraError}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="composer-menu-fallback"
                      onClick={() => void startCamera(cameraFacing)}
                    >
                      Try again
                    </button>
                    <button
                      type="button"
                      className="composer-menu-fallback"
                      onClick={() => openFilePicker(cameraInputRef)}
                    >
                      Pick photo instead
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="camera-actions">
          {captured ? (
            <>
              <button type="button" className="camera-cancel" onClick={retakePhoto}>
                Retake
              </button>
              <button type="button" className="composer-send camera-send" onClick={sendCaptured}>
                <Send size={17} /> Send
              </button>
            </>
          ) : (
            <>
              <button type="button" className="camera-cancel" onClick={closeCamera}>
                Cancel
              </button>
              <button
                type="button"
                className={`camera-shutter ${cameraReady ? '' : 'is-disabled'}`}
                onClick={() => void capturePhoto()}
                aria-label="Capture photo"
              >
                <span />
              </button>
              <span className="camera-spacer" />
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
