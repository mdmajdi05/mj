import type { ReactNode } from 'react';
import { Brain, Keyboard, Star } from 'lucide-react';

export type GameInfo = {
  slug: string;
  name: string;
  description: string;
  icon: ReactNode;
  tone: string;
  tag: string;
};

export const gameCatalog: GameInfo[] = [
  {
    slug: 'word-typing',
    name: 'Word Typing',
    description: 'Words appear on screen. Type them before the clock runs out and watch them break.',
    icon: <Keyboard size={26} />,
    tone: 'from-fuchsia-500/20 to-purple-500/5',
    tag: 'Score · Timer · Accuracy'
  },
  {
    slug: 'falling-words',
    name: 'Falling Words',
    description: 'Clear words as they fall. The pace increases, so stay sharp.',
    icon: <Star size={26} />,
    tone: 'from-sky-500/20 to-cyan-500/5',
    tag: 'Lives · Speed · Score'
  },
  {
    slug: 'memory-match',
    name: 'Color Sequence',
    description: 'Watch the glowing sequence and repeat it. One wrong tap ends the round.',
    icon: <Brain size={26} />,
    tone: 'from-emerald-500/20 to-teal-500/5',
    tag: 'Rounds · Memory · Score'
  }
];
