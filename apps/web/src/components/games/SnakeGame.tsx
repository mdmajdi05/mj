'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bug, RotateCcw } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

const SIZE = 12;
type Point = { x: number; y: number };
type Direction = 'up' | 'down' | 'left' | 'right';

const START: Point[] = [
  { x: 5, y: 6 },
  { x: 4, y: 6 },
  { x: 3, y: 6 }
];

function foodFor(snake: Point[]): Point {
  let next = { x: 0, y: 0 };
  do {
    next = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) };
  } while (snake.some((part) => part.x === next.x && part.y === next.y));
  return next;
}

export function SnakeGame({ onScore }: { onScore: (score: number) => void }) {
  const [snake, setSnake] = useState<Point[]>(START);
  const [food, setFood] = useState<Point>({ x: 8, y: 6 });
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [tick, setTick] = useState(180);
  const directionRef = useRef<Direction>('right');
  const scoreRef = useRef(0);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    if (!over) return;
    onScore(scoreRef.current);
  }, [over, onScore]);

  const reset = useCallback(() => {
    setSnake(START);
    setFood({ x: 8, y: 6 });
    setScore(0);
    setOver(false);
    setRunning(true);
    setTick(180);
    directionRef.current = 'right';
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSnake((current) => {
        const head = current[0];
        const direction = directionRef.current;
        const next = {
          x: head.x + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0),
          y: head.y + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0)
        };

        if (
          next.x < 0 ||
          next.y < 0 ||
          next.x >= SIZE ||
          next.y >= SIZE ||
          current.some((part) => part.x === next.x && part.y === next.y)
        ) {
          setRunning(false);
          setOver(true);
          return current;
        }

        const ate = next.x === food.x && next.y === food.y;
        const body = [next, ...current.slice(0, ate ? current.length : current.length - 1)];
        if (ate) {
          setScore((value) => value + 10);
          setFood(foodFor(body));
          setTick((value) => Math.max(70, value - 6));
        }
        return body;
      });
    }, tick);
    return () => clearInterval(timer);
  }, [running, tick, food, onScore]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const map: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right'
      };
      const next = map[event.key];
      if (!next) return;
      event.preventDefault();
      const opposite: Record<Direction, Direction> = {
        up: 'down',
        down: 'up',
        left: 'right',
        right: 'left'
      };
      if (opposite[next] !== directionRef.current) directionRef.current = next;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function turn(direction: Direction) {
    const opposite: Record<Direction, Direction> = {
      up: 'down',
      down: 'up',
      left: 'right',
      right: 'left'
    };
    if (opposite[direction] !== directionRef.current) directionRef.current = direction;
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1">
            <Bug size={13} /> Snake Classic
          </p>
          <p className="muted mt-1 text-xs">
            Score {score} · Length {snake.length}
          </p>
        </div>
        <Button variant={running ? 'ghost' : 'primary'} onClick={reset}>
          <RotateCcw size={15} /> {running ? 'Restart' : 'Play'}
        </Button>
      </div>

      <div className="mt-4 grid gap-0.5 rounded-2xl border border-white/10 bg-black/40 p-2"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SIZE * SIZE }, (_, index) => {
          const x = index % SIZE;
          const y = Math.floor(index / SIZE);
          const part = snake.findIndex((segment) => segment.x === x && segment.y === y);
          const isFood = food.x === x && food.y === y;
          return (
            <div
              key={index}
              className={`aspect-square rounded-[3px] ${
                part === 0
                  ? 'bg-lime-300'
                  : part > 0
                    ? 'bg-lime-500/60'
                    : isFood
                      ? 'bg-rose-400'
                      : 'bg-white/[0.03]'
              }`}
            />
          );
        })}
      </div>

      <div className="mt-3 mx-auto grid max-w-[200px] grid-cols-3 gap-2">
        <span />
        <Button onClick={() => turn('up')}>▲</Button>
        <span />
        <Button onClick={() => turn('left')}>◀</Button>
        <Button onClick={() => turn('down')}>▼</Button>
        <Button onClick={() => turn('right')}>▶</Button>
      </div>
      {over && <p className="muted mt-2 text-center text-xs">Game over · tap Play to try again</p>}
    </Panel>
  );
}
