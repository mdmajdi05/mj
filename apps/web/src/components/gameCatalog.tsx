import type { ReactNode } from 'react';
import {
  Blocks,
  Brain,
  Bug,
  Calculator,
  Car,
  Circle,
  Grid3x3,
  Hammer,
  Keyboard,
  Layers,
  Puzzle,
  Star
} from 'lucide-react';

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
    slug: 'turbo-track',
    name: 'Turbo Track',
    description: 'Steer through traffic at speed. Dodge the cars and keep the run alive.',
    icon: <Car size={26} />,
    tone: 'from-orange-500/20 to-rose-500/5',
    tag: 'Racing · Dodge · Score'
  },
  {
    slug: 'bubble-pop',
    name: 'Bubble Pop',
    description: 'Aim and pop clusters of bubbles before they reach the bottom.',
    icon: <Circle size={26} />,
    tone: 'from-cyan-500/20 to-blue-500/5',
    tag: 'Aim · Pop · Combos'
  },
  {
    slug: 'snake-classic',
    name: 'Snake Classic',
    description: 'Eat, grow and avoid your own tail. Simple to start, hard to master.',
    icon: <Bug size={26} />,
    tone: 'from-lime-500/20 to-emerald-500/5',
    tag: 'Growth · Speed · Score'
  },
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
  },
  {
    slug: 'slide-puzzle',
    name: 'Slide Puzzle',
    description: 'Slide the tiles back into order with as few moves as possible.',
    icon: <Puzzle size={26} />,
    tone: 'from-amber-500/20 to-yellow-500/5',
    tag: 'Logic · Moves · Timer'
  },
  {
    slug: 'pair-match',
    name: 'Pair Match',
    description: 'Flip the cards and remember where each pair hides.',
    icon: <Layers size={26} />,
    tone: 'from-violet-500/20 to-indigo-500/5',
    tag: 'Memory · Pairs · Moves'
  },
  {
    slug: 'tic-tac-toe',
    name: 'Tic Tac Toe',
    description: 'Three in a row wins. Play quick rounds against the computer.',
    icon: <Grid3x3 size={26} />,
    tone: 'from-rose-500/20 to-pink-500/5',
    tag: 'Strategy · Rounds · Quick'
  },
  {
    slug: 'whack-a-mole',
    name: 'Whack a Mole',
    description: 'Tap the critters as they pop up. Miss too many and the round ends.',
    icon: <Hammer size={26} />,
    tone: 'from-teal-500/20 to-green-500/5',
    tag: 'Reflex · Speed · Score'
  },
  {
    slug: 'brick-breaker',
    name: 'Brick Breaker',
    description: 'Bounce the ball, clear the bricks and protect your paddle.',
    icon: <Blocks size={26} />,
    tone: 'from-blue-500/20 to-sky-500/5',
    tag: 'Arcade · Bounce · Levels'
  },
  {
    slug: 'math-sprint',
    name: 'Math Sprint',
    description: 'Solve quick sums against the clock and build a streak.',
    icon: <Calculator size={26} />,
    tone: 'from-purple-500/20 to-fuchsia-500/5',
    tag: 'Math · Timer · Streak'
  }
];
