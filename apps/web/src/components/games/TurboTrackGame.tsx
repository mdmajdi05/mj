'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Car, Gauge, RotateCcw } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

const LANES = 3;
const TICK = 120;

type Obstacle = { id: number; lane: number; row: number };

export function TurboTrackGame({ onScore }: { onScore: (score: number) => void }) {
  const [lane, setLane] = useState(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const nextId = useRef(0);
  const laneRef = useRef(1);
  const overRef = useRef(false);
  const scoreRef = useRef(0);

  useEffect(() => {
    laneRef.current = lane;
  }, [lane]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const reset = useCallback(() => {
    setObstacles([]);
    setScore(0);
    setOver(false);
    setRunning(true);
    overRef.current = false;
    nextId.current = 0;
    setLane(1);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setScore((value) => value + 1);
      setObstacles((current) => {
        let next = current
          .map((obstacle) => ({ ...obstacle, row: obstacle.row + 1 }))
          .filter((obstacle) => obstacle.row < 8);
        if (Math.random() < 0.45) {
          next = [...next, { id: nextId.current++, lane: Math.floor(Math.random() * LANES), row: 0 }];
        }
        if (next.some((obstacle) => obstacle.row === 7 && obstacle.lane === laneRef.current)) {
          overRef.current = true;
        }
        return next;
      });
    }, TICK);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!overRef.current) return;
    overRef.current = false;
    setRunning(false);
    setOver(true);
    setBest((previous) => Math.max(previous, scoreRef.current));
    onScore(scoreRef.current);
  }, [obstacles, onScore]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') setLane((value) => Math.max(0, value - 1));
      if (event.key === 'ArrowRight') setLane((value) => Math.min(LANES - 1, value + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cells: Array<{ obstacle: boolean; player: boolean }> = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < LANES; col += 1) {
      cells.push({
        obstacle: obstacles.some((obstacle) => obstacle.row === row && obstacle.lane === col),
        player: row === 7 && col === lane
      });
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1">
            <Car size={13} /> Turbo Track
          </p>
          <p className="muted mt-1 text-xs">
            Score {score} · Best {best}
          </p>
        </div>
        <Button variant={running ? 'ghost' : 'primary'} onClick={reset}>
          <RotateCcw size={15} /> {running ? 'Restart' : 'Drive'}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-black/30 p-2">
        {cells.map((cell, index) => (
          <div
            key={index}
            className={`flex h-10 items-center justify-center rounded-lg text-lg ${
              cell.obstacle
                ? 'bg-rose-500/30'
                : cell.player
                  ? 'bg-sky-400/40'
                  : 'bg-white/[0.03]'
            }`}
          >
            {cell.player ? '🚗' : cell.obstacle ? '🚙' : ''}
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button onClick={() => setLane((value) => Math.max(0, value - 1))}>◀</Button>
        <div className="flex items-center justify-center text-xs text-white/50">
          <Gauge size={14} className="mr-1" /> {running ? 'driving' : over ? 'crashed' : 'ready'}
        </div>
        <Button onClick={() => setLane((value) => Math.min(LANES - 1, value + 1))}>▶</Button>
      </div>
    </Panel>
  );
}
