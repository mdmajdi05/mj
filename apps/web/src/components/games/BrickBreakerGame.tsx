'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Blocks, RotateCcw } from 'lucide-react';
import { Button, Panel } from '@/components/ui';

const WIDTH = 300;
const HEIGHT = 320;
const PADDLE_W = 64;
const PADDLE_H = 10;
const BRICK_ROWS = 5;
const BRICK_COLS = 6;

type Brick = { x: number; y: number; alive: boolean; tone: string };

function buildBricks(): Brick[] {
  const tones = ['#f472b6', '#c084fc', '#60a5fa', '#34d399', '#fbbf24'];
  const bricks: Brick[] = [];
  const offsetX = 12;
  const offsetY = 18;
  const brickW = (WIDTH - offsetX * 2) / BRICK_COLS;
  const brickH = 16;
  for (let row = 0; row < BRICK_ROWS; row += 1) {
    for (let col = 0; col < BRICK_COLS; col += 1) {
      bricks.push({
        x: offsetX + col * brickW,
        y: offsetY + row * (brickH + 6),
        alive: true,
        tone: tones[row % tones.length]
      });
    }
  }
  return bricks;
}

export function BrickBreakerGame({ onScore }: { onScore: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [message, setMessage] = useState('Press Play');
  const stateRef = useRef({
    paddleX: (WIDTH - PADDLE_W) / 2,
    ballX: WIDTH / 2,
    ballY: HEIGHT - 40,
    dx: 2.6,
    dy: -3,
    bricks: buildBricks(),
    alive: false,
    score: 0
  });

  const reset = useCallback(() => {
    const state = stateRef.current;
    state.paddleX = (WIDTH - PADDLE_W) / 2;
    state.ballX = WIDTH / 2;
    state.ballY = HEIGHT - 40;
    state.dx = 2.6;
    state.dy = -3;
    state.bricks = buildBricks();
    state.alive = true;
    state.score = 0;
    setScore(0);
    setMessage('');
    setRunning(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    function draw() {
      if (!context) return;
      const state = stateRef.current;
      context.clearRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = '#0b0b16';
      context.fillRect(0, 0, WIDTH, HEIGHT);

      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        context.fillStyle = brick.tone;
        context.fillRect(brick.x, brick.y, (WIDTH - 24) / BRICK_COLS - 4, 16);
      }

      context.fillStyle = '#e2e8f0';
      context.fillRect(state.paddleX, HEIGHT - PADDLE_H - 4, PADDLE_W, PADDLE_H);
      context.beginPath();
      context.arc(state.ballX, state.ballY, 6, 0, Math.PI * 2);
      context.fillStyle = '#f8fafc';
      context.fill();
    }

    draw();
  }, []);

  useEffect(() => {
    if (!running) return;
    let frame = 0;

    function step() {
      const state = stateRef.current;
      if (!state.alive) return;

      state.ballX += state.dx;
      state.ballY += state.dy;

      if (state.ballX < 6 || state.ballX > WIDTH - 6) state.dx *= -1;
      if (state.ballY < 6) state.dy *= -1;

      if (state.ballY > HEIGHT - PADDLE_H - 10) {
        if (
          state.ballX > state.paddleX &&
          state.ballX < state.paddleX + PADDLE_W
        ) {
          state.dy = -Math.abs(state.dy);
        } else if (state.ballY > HEIGHT) {
          state.alive = false;
          setRunning(false);
          setMessage('Game over');
          setBest((value) => Math.max(value, state.score));
          onScore(state.score);
          return;
        }
      }

      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        if (
          state.ballX > brick.x &&
          state.ballX < brick.x + (WIDTH - 24) / BRICK_COLS - 4 &&
          state.ballY > brick.y &&
          state.ballY < brick.y + 16
        ) {
          brick.alive = false;
          state.dy *= -1;
          state.score += 10;
          setScore(state.score);
          break;
        }
      }

      if (state.bricks.every((brick) => !brick.alive)) {
        state.alive = false;
        setRunning(false);
        setMessage('Level cleared!');
        setBest((value) => Math.max(value, state.score));
        onScore(state.score + 200);
        return;
      }

      drawFrame();
      frame = requestAnimationFrame(step);
    }

    function drawFrame() {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!context) return;
      const state = stateRef.current;
      context.clearRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = '#0b0b16';
      context.fillRect(0, 0, WIDTH, HEIGHT);
      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        context.fillStyle = brick.tone;
        context.fillRect(brick.x, brick.y, (WIDTH - 24) / BRICK_COLS - 4, 16);
      }
      context.fillStyle = '#e2e8f0';
      context.fillRect(state.paddleX, HEIGHT - PADDLE_H - 4, PADDLE_W, PADDLE_H);
      context.beginPath();
      context.arc(state.ballX, state.ballY, 6, 0, Math.PI * 2);
      context.fillStyle = '#f8fafc';
      context.fill();
    }

    frame = requestAnimationFrame(step);

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const state = stateRef.current;
      const delta = event.key === 'ArrowLeft' ? -26 : 26;
      state.paddleX = Math.max(0, Math.min(WIDTH - PADDLE_W, state.paddleX + delta));
    }
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [running, onScore]);

  function move(delta: number) {
    const state = stateRef.current;
    state.paddleX = Math.max(0, Math.min(WIDTH - PADDLE_W, state.paddleX + delta));
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1">
            <Blocks size={13} /> Brick Breaker
          </p>
          <p className="muted mt-1 text-xs">
            Score {score} · Best {best} {message ? `· ${message}` : ''}
          </p>
        </div>
        <Button variant={running ? 'ghost' : 'primary'} onClick={reset}>
          <RotateCcw size={15} /> {running ? 'Restart' : 'Play'}
        </Button>
      </div>

      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="mx-auto mt-4 block w-full max-w-[300px] rounded-2xl border border-white/10"
      />

      <div className="mt-3 mx-auto grid max-w-[200px] grid-cols-2 gap-2">
        <Button onClick={() => move(-30)}>◀</Button>
        <Button onClick={() => move(30)}>▶</Button>
      </div>
    </Panel>
  );
}
