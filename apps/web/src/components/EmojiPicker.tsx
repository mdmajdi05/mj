'use client';

import { useState } from 'react';
import { EMOJI_CATEGORIES } from '@/lib/emojiData';

/**
 * WhatsApp/Instagram-style emoji picker shared by the chat and study
 * composers. Native Unicode only: no dependency, no images, no network.
 */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [active, setActive] = useState(EMOJI_CATEGORIES[0].id);
  const category =
    EMOJI_CATEGORIES.find((entry) => entry.id === active) ?? EMOJI_CATEGORIES[0];

  return (
    <div className="emoji-picker" role="dialog" aria-label="Emoji picker">
      <div className="emoji-picker-tabs" role="tablist" aria-label="Emoji categories">
        {EMOJI_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            title={entry.label}
            aria-label={entry.label}
            aria-selected={entry.id === active}
            className={entry.id === active ? 'is-active' : ''}
            onClick={() => setActive(entry.id)}
          >
            {entry.icon}
          </button>
        ))}
      </div>
      <div className="emoji-picker-label">{category.label}</div>
      <div className="emoji-picker-grid" role="tabpanel">
        {category.emojis.map((emoji, index) => (
          <button
            key={`${category.id}-${index}`}
            type="button"
            onClick={() => onPick(emoji)}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
