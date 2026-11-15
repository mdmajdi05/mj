'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft, Inbox, Send, ToggleLeft, ToggleRight } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { WordTypingGame } from '@/components/games/WordTypingGame';
import { FallingWordsGame } from '@/components/games/FallingWordsGame';
import { ColorSequenceGame } from '@/components/games/ColorSequenceGame';
import { TurboTrackGame } from '@/components/games/TurboTrackGame';
import { BubblePopGame } from '@/components/games/BubblePopGame';
import { SnakeGame } from '@/components/games/SnakeGame';
import { SlidePuzzleGame } from '@/components/games/SlidePuzzleGame';
import { PairMatchGame } from '@/components/games/PairMatchGame';
import { TicTacToeGame } from '@/components/games/TicTacToeGame';
import { WhackAMoleGame } from '@/components/games/WhackAMoleGame';
import { BrickBreakerGame } from '@/components/games/BrickBreakerGame';
import { MathSprintGame } from '@/components/games/MathSprintGame';
import { Badge, Button, Panel } from '@/components/ui';

export function GameScreen() {
  const duo = useDuo();
  const [sendToGame, setSendToGame] = useState(true);
  const [draft, setDraft] = useState('');
  const [lastScore, setLastScore] = useState(0);
  // Main Chat is only offered when the session can use it. Outsiders just see
  // Game Chat, which looks like a normal in-game message thread.
  const showMainChat = duo.chatSessionUnlocked;
  const gameChat = sendToGame || !showMainChat;

  const updateGameScore = duo.updateGameScore;
  const handleScore = useCallback(
    (score: number) => {
      setLastScore(score);
      updateGameScore(score);
    },
    [updateGameScore]
  );

  function send() {
    if (!draft.trim()) return;
    const destination = gameChat ? 'GAME' : 'CHAT';
    if (duo.sendMessage(draft, destination)) {
      setDraft('');
      duo.setNotice(gameChat ? 'Sent to Game Chat.' : 'Sent to Main Chat.');
    }
  }

  if (!duo.activeGame) {
    return (
      <Panel className="p-6 text-center">
        <p className="muted">Choose a game from the Games page first.</p>
        <Button variant="primary" className="mt-4" onClick={() => duo.navigate('GAMES')}>
          Back to Games
        </Button>
      </Panel>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            className="muted mb-2 flex items-center gap-1 text-xs hover:text-white"
            onClick={() => duo.endGame(lastScore)}
          >
            <ArrowLeft size={14} /> Exit game
          </button>
          <p className="eyebrow">Game session</p>
          <h1 className="mt-1 text-2xl font-semibold capitalize">
            {duo.activeGame.replaceAll('-', ' ')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={gameChat ? 'warn' : 'accent'}>
            {gameChat ? 'Chat: Game Chat' : 'Chat: Main Chat'}
          </Badge>
          <Button onClick={() => duo.navigate('INBOX')}>
            <Inbox size={15} />
            Chat
            {duo.inboxUnread > 0 && (
              <span className="rounded-full bg-pink-500 px-1.5 text-[10px]">{duo.inboxUnread}</span>
            )}
          </Button>
        </div>
      </div>

      {duo.activeGame === 'word-typing' && <WordTypingGame onScore={handleScore} />}
      {duo.activeGame === 'falling-words' && <FallingWordsGame onScore={handleScore} />}
      {duo.activeGame === 'memory-match' && <ColorSequenceGame onScore={handleScore} />}
      {duo.activeGame === 'turbo-track' && <TurboTrackGame onScore={handleScore} />}
      {duo.activeGame === 'bubble-pop' && <BubblePopGame onScore={handleScore} />}
      {duo.activeGame === 'snake-classic' && <SnakeGame onScore={handleScore} />}
      {duo.activeGame === 'slide-puzzle' && <SlidePuzzleGame onScore={handleScore} />}
      {duo.activeGame === 'pair-match' && <PairMatchGame onScore={handleScore} />}
      {duo.activeGame === 'tic-tac-toe' && <TicTacToeGame onScore={handleScore} />}
      {duo.activeGame === 'whack-a-mole' && <WhackAMoleGame onScore={handleScore} />}
      {duo.activeGame === 'brick-breaker' && <BrickBreakerGame onScore={handleScore} />}
      {duo.activeGame === 'math-sprint' && <MathSprintGame onScore={handleScore} />}

      <Panel className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              {gameChat ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              GAME CHAT
            </p>
            <p className="muted mt-1 text-xs leading-5">
              Game Chat keeps your in-game messages together with this session.
              {showMainChat ? ' Turn it off to send to Main Chat instead.' : ''}
            </p>
          </div>
          {showMainChat && (
            <button
              type="button"
              role="switch"
              aria-checked={sendToGame}
              aria-label="Toggle game chat"
              className={`send-toggle ${sendToGame ? 'send-toggle-on' : ''}`}
              onClick={() => setSendToGame((value) => !value)}
            >
              <span />
              {sendToGame ? 'ON · Game Chat' : 'OFF · Main Chat'}
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            className="field"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') send();
            }}
            maxLength={5000}
            placeholder={
              gameChat ? 'Send a message to Game Chat…' : 'Send a message to Main Chat…'
            }
          />
          <Button variant="primary" onClick={send}>
            <Send size={16} />
          </Button>
        </div>
      </Panel>
    </>
  );
}
