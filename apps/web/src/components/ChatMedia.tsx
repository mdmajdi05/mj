'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Music, Play, X } from 'lucide-react';
import { API } from '@/lib/api';
import { formatFileSize } from '@/lib/utils';
import type { Message } from '@/lib/types';

export const mediaUrl = (id: string) => `${API}/api/chat/media/${id}`;

const isImage = (message: Message) => message.attachmentKind === 'IMAGE';
const isVideo = (message: Message) => message.attachmentKind === 'VIDEO';
const isAudio = (message: Message) => message.attachmentKind === 'AUDIO';

function attachmentLabel(message: Message) {
  if (isImage(message)) return 'Photo';
  if (isVideo(message)) return 'Video';
  if (isAudio(message)) return 'Voice message';
  return message.attachmentName || 'File';
}

function durationOf(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function VideoTile({ message }: { message: Message }) {
  const [duration, setDuration] = useState('');

  useEffect(() => {
    const element = document.createElement('video');
    element.preload = 'metadata';
    element.src = mediaUrl(message.attachmentId!);
    const onMeta = () => setDuration(durationOf(element.duration));
    element.addEventListener('loadedmetadata', onMeta);
    element.load();
    return () => {
      element.removeEventListener('loadedmetadata', onMeta);
      element.src = '';
    };
  }, [message.attachmentId]);

  return (
    <>
      <video
        src={mediaUrl(message.attachmentId!)}
        muted
        playsInline
        preload="metadata"
        className="media-tile-media"
      />
      <span className="media-tile-play">
        <Play size={18} />
      </span>
      {duration && <span className="media-tile-duration">{duration}</span>}
    </>
  );
}

/** WhatsApp-style adaptive grid for consecutive photos/videos. */
export function MediaGrid({
  messages,
  onOpen
}: {
  messages: Message[];
  onOpen: (messages: Message[], index: number) => void;
}) {
  const count = messages.length;
  const shown = messages.slice(0, 4);
  const extra = count - shown.length;
  const layout =
    count === 1 ? 'one' : count === 2 ? 'two' : count === 3 ? 'three' : 'four';

  return (
    <div className={`media-grid media-grid-${layout}`}>
      {shown.map((message, index) => (
        <button
          key={message.id}
          type="button"
          className="media-tile"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(messages, index);
          }}
          aria-label={isVideo(message) ? 'Play video' : 'Open photo'}
        >
          {isImage(message) ? (
            <img
              src={mediaUrl(message.attachmentId!)}
              alt={message.attachmentName || 'Photo'}
              loading="lazy"
              className="media-tile-media"
            />
          ) : (
            <VideoTile message={message} />
          )}
          {extra > 0 && index === shown.length - 1 && (
            <span className="media-tile-more">+{extra}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function AudioBubble({ message }: { message: Message }) {
  return (
    <div className="audio-bubble">
      <Music size={16} />
      <audio src={mediaUrl(message.attachmentId!)} controls preload="metadata" className="audio-player" />
    </div>
  );
}

export function DocumentBubble({ message }: { message: Message }) {
  const name = message.attachmentName || 'Document';
  const extension = name.includes('.') ? name.split('.').pop()!.toUpperCase() : 'FILE';
  return (
    <a
      className="document-card"
      href={mediaUrl(message.attachmentId!)}
      download={name}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="document-icon">
        <FileText size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="document-name">{name}</span>
        <span className="document-meta">
          {extension} · {message.attachmentSize ? formatFileSize(message.attachmentSize) : 'File'}
        </span>
      </span>
      <Download size={16} className="document-download" />
    </a>
  );
}

/** Full-screen gallery with swipe, counter, download and close controls. */
export function MediaLightbox({
  items,
  index,
  onIndex,
  onClose
}: {
  items: Message[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const startXRef = useRef<number | null>(null);
  const [muted, setMuted] = useState(true);
  const [confirmUnmute, setConfirmUnmute] = useState(false);
  const current = items[index];

  useEffect(() => {
    setMuted(true);
    setConfirmUnmute(false);
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onClose, onIndex]);

  if (!current?.attachmentId) return null;
  const url = mediaUrl(current.attachmentId);
  const name = current.attachmentName || (isVideo(current) ? 'video' : 'photo');

  return (
    <div
      className="media-lightbox"
      role="dialog"
      aria-label="Media viewer"
      onClick={onClose}
      onTouchStart={(event) => {
        startXRef.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (startXRef.current === null) return;
        const delta = event.changedTouches[0].clientX - startXRef.current;
        startXRef.current = null;
        if (Math.abs(delta) < 50) return;
        if (delta < 0 && index < items.length - 1) onIndex(index + 1);
        if (delta > 0 && index > 0) onIndex(index - 1);
      }}
    >
      <div className="media-lightbox-head" onClick={(event) => event.stopPropagation()}>
        <span className="media-lightbox-counter">
          {index + 1} / {items.length}
        </span>
        <div className="flex items-center gap-2">
          <a href={url} download={name} className="media-lightbox-btn" aria-label="Download">
            <Download size={18} />
          </a>
          <button type="button" className="media-lightbox-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="media-lightbox-body" onClick={(event) => event.stopPropagation()}>
        {isVideo(current) ? (
          <div className="media-lightbox-video-wrap">
            <video
              key={current.id}
              src={url}
              controls
              autoPlay
              playsInline
              muted={muted}
              className="media-lightbox-media"
            />
            <button
              type="button"
              className="media-lightbox-sound"
              onClick={() => setConfirmUnmute(true)}
              aria-label={muted ? 'Unmute video' : 'Video sound is on'}
            >
              {muted ? '🔇 Tap to unmute' : '🔊 Sound on'}
            </button>
            {confirmUnmute && muted && (
              <div className="media-unmute-confirm" role="alertdialog">
                <p>This video starts muted. Turn the sound on?</p>
                <div className="flex gap-2">
                  <button type="button" className="media-lightbox-btn" onClick={() => setConfirmUnmute(false)}>
                    Keep muted
                  </button>
                  <button
                    type="button"
                    className="media-lightbox-btn is-primary"
                    onClick={() => {
                      setMuted(false);
                      setConfirmUnmute(false);
                    }}
                  >
                    Unmute
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <img src={url} alt={name} className="media-lightbox-media" />
        )}
      </div>

      {index > 0 && (
        <button
          type="button"
          className="media-lightbox-nav left"
          onClick={(event) => {
            event.stopPropagation();
            onIndex(index - 1);
          }}
          aria-label="Previous"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      {index < items.length - 1 && (
        <button
          type="button"
          className="media-lightbox-nav right"
          onClick={(event) => {
            event.stopPropagation();
            onIndex(index + 1);
          }}
          aria-label="Next"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}

export { attachmentLabel };
