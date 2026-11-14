'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft, Inbox, LockKeyhole, Send, ToggleLeft, ToggleRight } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { WordTypingGame } from '@/components/games/WordTypingGame';
import { FallingWordsGame } from '@/components/games/FallingWordsGame';
import { ColorSequenceGame } from '@/components/games/ColorSequenceGame';
import { Badge, Button, Panel } from '@/components/ui';

export function GameScreen() {
  const duo = useDuo();
  const [sendToGame, setSendToGame] = useState(true);
  const [draft, setDraft] = useState('');
  const [lastScore, setLastScore] = useState(0);

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
    const destination = sendToGame ? 'GAME' : 'CHAT';
    if (duo.sendMessage(draft, destination)) {
      setDraft('');
      duo.setNotice(
        sendToGame ? 'Message sent to the Game Inbox.' : 'Message sent to normal private Chat.'
      );
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
            {duo.activeGame.replace('-', ' ')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={sendToGame ? 'warn' : 'accent'}>
            {sendToGame ? 'Destination: Game Inbox' : 'Destination: Private Chat'}
          </Badge>
          <Button onClick={() => duo.navigate('INBOX')}>
            <Inbox size={15} />
            Inbox
            {duo.inboxUnread > 0 && (
              <span className="rounded-full bg-pink-500 px-1.5 text-[10px]">{duo.inboxUnread}</span>
            )}
          </Button>
        </div>
      </div>

      {duo.activeGame === 'word-typing' && <WordTypingGame onScore={handleScore} />}
      {duo.activeGame === 'falling-words' && <FallingWordsGame onScore={handleScore} />}
      {duo.activeGame === 'memory-match' && <ColorSequenceGame onScore={handleScore} />}

      <Panel className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              {sendToGame ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              SEND-TO-GAME
            </p>
            <p className="muted mt-1 text-xs leading-5">
              ON sends from this game screen to the receiver&apos;s Incoming Game Messages. OFF
              sends to normal private Chat.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sendToGame}
            aria-label="Toggle send to game"
            className={`send-toggle ${sendToGame ? 'send-toggle-on' : ''}`}
            onClick={() => setSendToGame((value) => !value)}
          >
            <span />
            {sendToGame ? 'ON · Game Inbox' : 'OFF · Private Chat'}
          </button>
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
              sendToGame ? 'Send a message to the Game Inbox…' : 'Send to normal private Chat…'
            }
          />
          <Button variant="primary" onClick={send}>
            <Send size={16} />
          </Button>
        </div>

        {!sendToGame && !duo.chatSessionUnlocked && (
          <p className="mt-2 flex items-center gap-2 text-xs text-amber-200">
            <LockKeyhole size={13} />
            Private Chat is hidden. Enter the secret code from your profile, or switch SEND-TO-GAME
            ON.
          </p>
        )}
      </Panel>
    </>
  );
}
