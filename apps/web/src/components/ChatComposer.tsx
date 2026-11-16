'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  File as FileIcon,
  Grid2X2,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Send,
  Smile,
  Square,
  Trash2,
  X
} from 'lucide-react';
import type { Message } from '@/lib/types';
import { Modal } from '@/components/ui';

const EMOJIS = ['😊', '😂', '❤️', '👍', '🙏', '🔥', '🎉', '😍', '😢', '🤔', '👏', '💜'];

function formatClock(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onTyping: (typing: boolean) => void;
  onMediaSelect: (files: File[]) => void;
  onVoiceSend: (blob: Blob) => void;
  replyTo?: Message | null;
  replyAuthor?: string;
  onCancelReply?: () => void;
  editing?: Message | null;
  onCancelEdit?: () => void;
};

/**
 * Compact rounded composer:
 * 4-dot menu (Camera / Attach / Gallery / File), emoji + input in the middle,
 * microphone when empty and Send as soon as there is text. The microphone
 * opens a real MediaRecorder voice mode with timer, waveform, cancel and send.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onTyping,
  onMediaSelect,
  onVoiceSend,
  replyTo,
  replyAuthor,
  onCancelReply,
  editing,
  onCancelEdit
}: ChatComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [wave, setWave] = useState<number[]>(() =>
    Array.from({ length: 28 }, () => 8 + Math.random() * 20)
  );

  const menuRef = useRef<HTMLDivElement | null>(null);
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
      if (menuOpen && menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
      if (emojiOpen && emojiRef.current && !emojiRef.current.contains(target)) setEmojiOpen(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('touchstart', handler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [menuOpen, emojiOpen]);

  function pickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    setMenuOpen(false);
    if (files.length) onMediaSelect(files);
  }

  async function openCamera() {
    setMenuOpen(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    setCameraError('');
    setCameraOpen(true);
    setCameraReady(false);
    setCameraBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      cameraStreamRef.current = stream;
      setCameraReady(true);
    } catch {
      setCameraError('Camera access was blocked. You can still pick a photo instead.');
    } finally {
      setCameraBusy(false);
    }
  }

  function closeCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraReady(false);
    setCameraOpen(false);
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
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
    closeCamera();
    // The captured photo is sent directly and never saved to the gallery.
    onMediaSelect([file]);
  }

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
  const voiceMode = recording || Boolean(audioBlob);

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
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
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
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.ppt,.pptx,.csv"
        multiple
        className="hidden"
        onChange={pickFiles}
      />
      <input ref={fileRef} type="file" multiple className="hidden" onChange={pickFiles} />

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
        <div className="relative" ref={menuRef}>
          <button
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

          {menuOpen && (
            <div className="composer-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void openCamera()}>
                <Camera size={20} />
                <span>Camera</span>
              </button>
              <button type="button" role="menuitem" onClick={() => attachRef.current?.click()}>
                <Paperclip size={20} />
                <span>Attach</span>
              </button>
              <button type="button" role="menuitem" onClick={() => galleryRef.current?.click()}>
                <ImageIcon size={20} />
                <span>Gallery</span>
              </button>
              <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>
                <FileIcon size={20} />
                <span>File</span>
              </button>
            </div>
          )}
        </div>

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

        {hasText || editing ? (
          <button type="button" className="composer-send" onClick={onSend} aria-label="Send message">
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

      <Modal open={cameraOpen} title="Take a photo" onClose={closeCamera}>
        <div className="camera-modal">
          <video ref={videoRef} playsInline muted className="camera-preview" />
          {cameraBusy && <p className="muted text-xs">Starting camera…</p>}
          {cameraError && <p className="text-xs text-rose-200">{cameraError}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="composer-menu-fallback" onClick={() => cameraInputRef.current?.click()}>
            Pick photo instead
          </button>
          <button type="button" className="composer-send composer-capture" onClick={() => void capturePhoto()}>
            <Camera size={18} />
          </button>
        </div>
      </Modal>
    </div>
  );
}
