'use client';

import { useCallback, useEffect, useState } from 'react';
import { Layers, RotateCcw } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

const SYMBOLS = ['🌟', '🎈', '🍀', '🚀', '🎧', '🍩', '🐧', '💎'];

type Card = { id: number; symbol: string; matched: boolean };

function buildDeck(): Card[] {
  const deck = [...SYMBOLS, ...SYMBOLS]
    .map((symbol, index) => ({ id: index, symbol, matched: false }))
    .sort(() => Math.random() - 0.5);
  return deck;
}

export function PairMatchGame({ onScore }: { onScore: (score: number) => void }) {
  const [cards, setCards] = useState<Card[]>(buildDeck);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  const reset = useCallback(() => {
    setCards(buildDeck());
    setFlipped([]);
    setMoves(0);
    setSeconds(0);
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [first, second] = flipped;
    if (cards[first].symbol === cards[second].symbol) {
      setCards((current) =>
        current.map((card, index) =>
          index === first || index === second ? { ...card, matched: true } : card
        )
      );
      setFlipped([]);
    } else {
      const timer = setTimeout(() => setFlipped([]), 700);
      return () => clearTimeout(timer);
    }
  }, [flipped, cards]);

  useEffect(() => {
    if (cards.length && cards.every((card) => card.matched) && running) {
      setRunning(false);
      onScore(Math.max(0, 800 - moves * 10 - seconds * 3));
    }
  }, [cards, running, moves, seconds, onScore]);

  function flip(index: number) {
    if (!running || flipped.length === 2) return;
    if (cards[index].matched || flipped.includes(index)) return;
    setFlipped((current) => [...current, index]);
    if (flipped.length === 1) setMoves((value) => value + 1);
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1">
            <Layers size={13} /> Pair Match
          </p>
          <p className="muted mt-1 text-xs">
            Moves {moves} · {seconds}s ·{' '}
            {cards.filter((card) => card.matched).length / 2}/{SYMBOLS.length} pairs
          </p>
        </div>
        <Button variant={running ? 'ghost' : 'primary'} onClick={reset}>
          <RotateCcw size={15} /> {running ? 'Restart' : 'Play'}
        </Button>
      </div>

      <div className="mx-auto mt-4 grid max-w-[340px] grid-cols-4 gap-2">
        {cards.map((card, index) => {
          const revealed = card.matched || flipped.includes(index);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => flip(index)}
              className={`flex aspect-square items-center justify-center rounded-xl text-xl transition ${
                revealed
                  ? 'bg-violet-500/25'
                  : 'bg-white/[0.04] hover:bg-white/[0.08]'
              }`}
            >
              {revealed ? card.symbol : '·'}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
