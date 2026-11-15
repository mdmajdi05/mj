'use client';

import { useCallback, useEffect, useState } from 'react';
import { Puzzle, RotateCcw } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

const SIZE = 3;

function solved(): number[] {
  return Array.from({ length: SIZE * SIZE }, (_, index) => (index + 1) % (SIZE * SIZE));
}

function shuffled(): number[] {
  const tiles = solved();
  // A few hundred legal moves guarantee a solvable board.
  let blank = tiles.indexOf(0);
  for (let step = 0; step < 220; step += 1) {
    const row = Math.floor(blank / SIZE);
    const col = blank % SIZE;
    const options = [
      row > 0 ? blank - SIZE : -1,
      row < SIZE - 1 ? blank + SIZE : -1,
      col > 0 ? blank - 1 : -1,
      col < SIZE - 1 ? blank + 1 : -1
    ].filter((value) => value >= 0);
    const target = options[Math.floor(Math.random() * options.length)];
    [tiles[blank], tiles[target]] = [tiles[target], tiles[blank]];
    blank = target;
  }
  return tiles;
}

export function SlidePuzzleGame({ onScore }: { onScore: (score: number) => void }) {
  const [tiles, setTiles] = useState<number[]>(solved);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [won, setWon] = useState(false);

  const reset = useCallback(() => {
    setTiles(shuffled());
    setMoves(0);
    setSeconds(0);
    setRunning(true);
    setWon(false);
  }, []);

  useEffect(() => {
    if (!running || won) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running, won]);

  function move(index: number) {
    if (!running) return;
    const blank = tiles.indexOf(0);
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const blankRow = Math.floor(blank / SIZE);
    const blankCol = blank % SIZE;
    const adjacent = Math.abs(row - blankRow) + Math.abs(col - blankCol) === 1;
    if (!adjacent) return;
    const next = [...tiles];
    [next[index], next[blank]] = [next[blank], next[index]];
    setTiles(next);
    setMoves((value) => value + 1);
    if (next.every((value, position) => value === (position + 1) % (SIZE * SIZE))) {
      setWon(true);
      setRunning(false);
      onScore(Math.max(0, 500 - moves * 4 - seconds * 2));
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1">
            <Puzzle size={13} /> Slide Puzzle
          </p>
          <p className="muted mt-1 text-xs">
            Moves {moves} · {seconds}s {won ? '· solved!' : ''}
          </p>
        </div>
        <Button variant={running ? 'ghost' : 'primary'} onClick={reset}>
          <RotateCcw size={15} /> {running ? 'Shuffle' : 'Play'}
        </Button>
      </div>

      <div className="mx-auto mt-4 grid max-w-[300px] grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-black/30 p-2">
        {tiles.map((tile, index) => (
          <button
            key={index}
            type="button"
            onClick={() => move(index)}
            className={`aspect-square rounded-xl text-xl font-semibold transition ${
              tile === 0
                ? 'bg-transparent'
                : 'bg-gradient-to-br from-amber-400/30 to-orange-500/10 hover:from-amber-300/40'
            }`}
          >
            {tile || ''}
          </button>
        ))}
      </div>
      {won && <p className="muted mt-3 text-center text-xs">Solved in {moves} moves.</p>}
    </Panel>
  );
}
