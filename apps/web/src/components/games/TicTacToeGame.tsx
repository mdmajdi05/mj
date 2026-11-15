'use client';

import { useCallback, useEffect, useState } from 'react';
import { Grid3x3, RotateCcw } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

type Cell = 'X' | 'O' | null;
const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

function winnerOf(board: Cell[]): Cell | 'draw' {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

function computerMove(board: Cell[]): number {
  const empty = board.map((cell, index) => (cell ? -1 : index)).filter((index) => index >= 0);
  for (const player of ['O', 'X'] as const) {
    for (const index of empty) {
      const next = [...board];
      next[index] = player;
      if (winnerOf(next) === player) return index;
    }
  }
  if (board[4] === null) return 4;
  return empty[Math.floor(Math.random() * empty.length)];
}

export function TicTacToeGame({ onScore }: { onScore: (score: number) => void }) {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [result, setResult] = useState<Cell | 'draw'>(null);
  const [wins, setWins] = useState(0);
  const [rounds, setRounds] = useState(0);

  const finish = useCallback(
    (outcome: Cell | 'draw') => {
      setResult(outcome);
      setRounds((value) => value + 1);
      if (outcome === 'X') {
        setWins((value) => value + 1);
        onScore((wins + 1) * 100);
      } else if (outcome === 'draw') {
        onScore(wins * 100 + 25);
      } else {
        onScore(wins * 100);
      }
    },
    [onScore, wins]
  );

  useEffect(() => {
    if (result) return;
    const outcome = winnerOf(board);
    if (outcome) finish(outcome);
  }, [board, result, finish]);

  function play(index: number) {
    if (board[index] || result) return;
    const next = [...board];
    next[index] = 'X';
    setBoard(next);
    if (winnerOf(next)) return;
    const reply = computerMove(next);
    if (reply === undefined) return;
    next[reply] = 'O';
    setTimeout(() => setBoard([...next]), 220);
  }

  function reset() {
    setBoard(Array(9).fill(null));
    setResult(null);
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1">
            <Grid3x3 size={13} /> Tic Tac Toe
          </p>
          <p className="muted mt-1 text-xs">
            Wins {wins} · Rounds {rounds}
            {result === 'X' ? ' · you won!' : result === 'O' ? ' · computer won' : result === 'draw' ? ' · draw' : ' · your turn'}
          </p>
        </div>
        <Button variant="primary" onClick={reset}>
          <RotateCcw size={15} /> New round
        </Button>
      </div>

      <div className="mx-auto mt-4 grid max-w-[280px] grid-cols-3 gap-2">
        {board.map((cell, index) => (
          <button
            key={index}
            type="button"
            onClick={() => play(index)}
            className={`flex aspect-square items-center justify-center rounded-xl text-2xl font-semibold transition ${
              cell === 'X'
                ? 'bg-rose-500/20 text-rose-200'
                : cell === 'O'
                  ? 'bg-sky-500/20 text-sky-200'
                  : 'bg-white/[0.04] hover:bg-white/[0.08]'
            }`}
          >
            {cell ?? ''}
          </button>
        ))}
      </div>
    </Panel>
  );
}
