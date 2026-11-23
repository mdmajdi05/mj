'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Gamepad2, Inbox, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useDuo } from '@/hooks/useDuoApp';
import { formatDateTime } from '@/lib/utils';
import { Badge, Button } from '@/components/ui';
import type { GameMessage } from '@/lib/types';

type BellTab = 'game' | 'activity';

function eventLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Host-only notification bell. It combines the Game Chat inbox with activity
 * notifications into one expandable panel and supports real read actions.
 */
export function NotificationBell() {
  const duo = useDuo();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>('game');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = duo.inboxUnread + duo.activityUnread;

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function toggle() {
    setOpen((value) => {
      if (!value) {
        void duo.loadInbox().catch(() => undefined);
        void duo.loadNotifications().catch(() => undefined);
      }
      return !value;
    });
  }

  if (duo.user?.role !== 'HOST') return null;

  const gameRows = [...duo.gameMessages]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 10);
  const activityRows = [...duo.notifications]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 10);

  async function openGameMessage(message: GameMessage) {
    if (!message.readAt && message.senderId !== duo.user?.id) {
      await api(`/chat/inbox/${message.id}/read`, { method: 'POST' }).catch(() => undefined);
      await duo.loadInbox().catch(() => undefined);
    }
    setOpen(false);
    duo.navigate('INBOX');
  }

  async function markAllRead() {
    await Promise.allSettled([duo.markInboxRead(), duo.markNotificationsRead()]);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="btn btn-profile relative"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="notification-bell-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="panel dropdown-panel right-0 w-[22rem] max-w-[calc(100vw-1.5rem)] p-2">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="muted text-[11px]">
                {unreadCount ? `${unreadCount} unread` : 'You are all caught up'}
              </p>
            </div>
            <Button
              className="!px-2.5 !py-1 text-[11px]"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
            >
              <CheckCheck size={13} /> Mark all read
            </Button>
          </div>

          <div className="my-1 h-px bg-white/10" />

          <div className="flex gap-1 px-1">
            <button
              type="button"
              className={`admin-tab flex-1 justify-center ${tab === 'game' ? 'active' : ''}`}
              onClick={() => setTab('game')}
            >
              <Gamepad2 size={14} /> Game Chat
              {duo.inboxUnread > 0 && (
                <span className="chat-contact-badge">{duo.inboxUnread}</span>
              )}
            </button>
            <button
              type="button"
              className={`admin-tab flex-1 justify-center ${tab === 'activity' ? 'active' : ''}`}
              onClick={() => setTab('activity')}
            >
              <ShieldAlert size={14} /> Activity
              {duo.activityUnread > 0 && (
                <span className="chat-contact-badge">{duo.activityUnread}</span>
              )}
            </button>
          </div>

          <div className="mt-1 max-h-80 space-y-1 overflow-y-auto p-1">
            {tab === 'game' && (
              <>
                {gameRows.map((message) => {
                  const mine = message.senderId === duo.user?.id;
                  const unread = !message.readAt && !mine;
                  return (
                    <button
                      key={message.id}
                      type="button"
                      className={`notification-row ${unread ? 'is-unread' : ''}`}
                      onClick={() => void openGameMessage(message)}
                    >
                      <span className="quick-icon shrink-0">
                        <Inbox size={15} />
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold">
                            {mine ? 'You' : message.sender?.displayName || message.sender?.username || 'Guest'}
                          </span>
                          {unread && <Badge tone="warn">New</Badge>}
                          <span className="muted ml-auto text-[10px]">
                            {formatDateTime(message.createdAt)}
                          </span>
                        </span>
                        <span className="muted mt-0.5 block truncate text-[11px]">
                          {message.content}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {!gameRows.length && (
                  <p className="muted px-3 py-6 text-center text-xs">No game messages yet.</p>
                )}
              </>
            )}

            {tab === 'activity' && (
              <>
                {activityRows.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={`notification-row ${!notification.readAt ? 'is-unread' : ''}`}
                    onClick={() => {
                      void duo.markNotificationsRead();
                      setOpen(false);
                      duo.navigate('ADMIN');
                    }}
                  >
                    <span className="quick-icon shrink-0">
                      <ShieldAlert size={15} />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold">
                          {eventLabel(notification.eventType)}
                        </span>
                        {!notification.readAt && <Badge tone="warn">New</Badge>}
                        <span className="muted ml-auto text-[10px]">
                          {formatDateTime(notification.createdAt)}
                        </span>
                      </span>
                      <span className="muted mt-0.5 block truncate text-[11px]">
                        {notification.actor?.username || 'System'}
                      </span>
                    </span>
                  </button>
                ))}
                {!activityRows.length && (
                  <p className="muted px-3 py-6 text-center text-xs">No activity yet.</p>
                )}
              </>
            )}
          </div>

          <div className="my-1 h-px bg-white/10" />
          <button
            type="button"
            className="nav-item flex w-full items-center gap-2 text-left"
            onClick={() => {
              setOpen(false);
              duo.navigate(tab === 'game' ? 'INBOX' : 'ADMIN');
            }}
          >
            <Inbox size={15} />
            {tab === 'game' ? 'Open full inbox' : 'Open admin activity'}
          </button>
        </div>
      )}
    </div>
  );
}
