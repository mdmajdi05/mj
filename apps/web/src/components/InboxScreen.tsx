'use client';

import { useState } from 'react';
import { CheckCheck, Gamepad2, Inbox, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useDuo } from '@/hooks/useDuoApp';
import { formatDateTime } from '@/lib/utils';
import type { GameMessage } from '@/lib/types';
import { Badge, Button, EmptyState, Modal, SectionTitle } from '@/components/ui';

export function InboxScreen() {
  const duo = useDuo();
  const [selected, setSelected] = useState<GameMessage | null>(null);

  async function open(message: GameMessage) {
    setSelected(message);
    if (!message.readAt && message.senderId !== duo.user?.id) {
      await api(`/chat/inbox/${message.id}/read`, { method: 'POST' }).catch(() => undefined);
      await duo.loadInbox();
    }
  }

  return (
    <>
      <SectionTitle
        eyebrow="Game Chat"
        title="Messages from your games"
        description="Chat sent while playing with SEND-TO-GAME ON. These messages stay separate from the game screen."
        action={
          <div className="flex gap-2">
            <Button onClick={() => void duo.markInboxRead()}>
              <CheckCheck size={15} /> Mark all read
            </Button>
            <Button onClick={() => duo.navigate('GAMES')}>
              <Gamepad2 size={15} /> Games
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={duo.inboxUnread > 0 ? 'accent' : 'neutral'}>
          {duo.inboxUnread} unread
        </Badge>
        <Badge tone={duo.otherOnline ? 'good' : 'neutral'}>
          {duo.otherOnline ? 'Other participant online' : 'Other participant offline'}
        </Badge>
      </div>

      <div className="grid gap-3">
        {duo.gameMessages.map((message) => {
          const mine = message.senderId === duo.user?.id;
          return (
            <button
              key={message.id}
              className={`panel inbox-card p-4 text-left ${!message.readAt && !mine ? 'inbox-unread' : ''}`}
              onClick={() => void open(message)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={mine ? 'accent' : 'good'}>
                      {mine ? 'You' : message.sender?.username || 'Participant'}
                    </Badge>
                    <span className="muted text-[11px]">{formatDateTime(message.createdAt)}</span>
                    {!message.readAt && !mine && <Badge tone="warn">Unread</Badge>}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6">{message.content}</p>
                </div>
                <span className="quick-icon shrink-0">
                  <Inbox size={18} />
                </span>
              </div>
            </button>
          );
        })}
        {!duo.gameMessages.length && (
          <EmptyState
            icon={<Inbox size={26} />}
            title="No game chat yet"
            description="In a game, switch SEND-TO-GAME ON and send a message to see it here."
          />
        )}
      </div>

      <Modal
        open={selected !== null}
        title="Game message"
        onClose={() => setSelected(null)}
        wide
      >
        {selected && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{selected.sender?.username || 'Participant'}</Badge>
              <span className="muted text-xs">{formatDateTime(selected.createdAt)}</span>
              {selected.readAt && <Badge tone="neutral">Read</Badge>}
            </div>
            <p className="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7">
              {selected.content}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button onClick={() => setSelected(null)}>Close</Button>
              <Button onClick={() => duo.navigate('GAMES')}>
                <Send size={15} /> Back to games
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
