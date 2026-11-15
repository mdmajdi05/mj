'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArchiveRestore,
  Check,
  Gamepad2,
  History,
  MessageCircle,
  Mic,
  Phone,
  RefreshCw,
  Search,
  Shield,
  Ticket,
  Trash2,
  X
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDuo } from '@/hooks/useDuoApp';
import type { AdminActivity, CallRecord, GameMessage, Message, Permission } from '@/lib/types';
import { formatDateTime, eventLabel } from '@/lib/utils';
import { Badge, Button, EmptyState, Field, Modal, Panel, SectionTitle } from '@/components/ui';

type AdminMessage = Message & { conversation?: { status: string } };
type Tab = 'overview' | 'chat' | 'game' | 'permissions' | 'promo' | 'activity';

const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <Activity size={15} /> },
  { id: 'chat', label: 'Chat history', icon: <MessageCircle size={15} /> },
  { id: 'game', label: 'Game messages', icon: <Gamepad2 size={15} /> },
  { id: 'permissions', label: 'Permissions', icon: <Shield size={15} /> },
  { id: 'promo', label: 'Promo code', icon: <Ticket size={15} /> },
  { id: 'activity', label: 'Activity & audit', icon: <History size={15} /> }
];

export function AdminScreen() {
  const duo = useDuo();
  const [tab, setTab] = useState<Tab>('overview');
  const [activity, setActivity] = useState<AdminActivity | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [gameMessages, setGameMessages] = useState<GameMessage[]>([]);
  const [search, setSearch] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  const refresh = useCallback(async (query: string) => {
    setLoading(true);
    const [activityResult, messagesResult, gameResult, promoResult] = await Promise.allSettled([
      api<AdminActivity>('/chat/admin/activity'),
      api<AdminMessage[]>(`/chat/admin/messages${query ? `?q=${encodeURIComponent(query)}` : ''}`),
      api<GameMessage[]>('/chat/admin/game-messages'),
      api<any>('/chat/admin/promo/status')
    ]);
    if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
    if (messagesResult.status === 'fulfilled') setMessages(messagesResult.value);
    if (gameResult.status === 'fulfilled') setGameMessages(gameResult.value);
    if (promoResult.status === 'fulfilled') setPromoStatus(promoResult.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh('');
    void duo.loadPermissions();
  }, [refresh, duo.loadPermissions]);

  const stats = useMemo(() => {
    return {
      messages: messages.length,
      gameMessages: gameMessages.length,
      calls: activity?.calls.length || 0,
      permissions: duo.permissions.length,
      active: duo.permissions.filter((permission) => permission.status === 'GRANTED').length
    };
  }, [activity, duo.permissions, gameMessages.length, messages.length]);

  async function deleteMessage(id: string) {
    if (!window.confirm('Delete this selected message? The action is recorded in the audit log.')) {
      return;
    }
    setBusy(id);
    try {
      await api(`/chat/messages/${id}`, { method: 'DELETE' });
      await refresh(search);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy('');
    }
  }

  async function deleteGameMessage(id: string) {
    if (!window.confirm('Delete this game message permanently?')) return;
    setBusy(id);
    try {
      await api(`/chat/admin/game-messages/${id}`, { method: 'DELETE' });
      await refresh(search);
      await duo.loadInbox();
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy('');
    }
  }

  async function deleteAllGameMessages() {
    if (!window.confirm('Delete every Game Chat message permanently? This cannot be undone.')) {
      return;
    }
    setBusy('game-history');
    try {
      await api('/chat/admin/game-messages', { method: 'DELETE' });
      await refresh(search);
      await duo.loadInbox();
      duo.setNotice('All Game Chat messages were deleted.');
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy('');
    }
  }

  async function deleteHistory() {
    if (deleteText.trim().toUpperCase() !== 'DELETE') {
      duo.setError('Type DELETE to confirm permanent history deletion.');
      return;
    }
    setBusy('history');
    try {
      await duo.deleteHistory();
      setDeleteOpen(false);
      setDeleteText('');
      await refresh(search);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy('');
    }
  }

  async function rotatePromo() {
    if (!promoCode.trim()) return;
    setBusy('promo');
    try {
      await api('/chat/admin/promo', {
        method: 'POST',
        body: JSON.stringify({ code: promoCode.trim() })
      });
      setPromoCode('');
      await refresh(search);
      duo.setNotice('Promo code rotated. Only the new hash is stored.');
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Promo update failed');
    } finally {
      setBusy('');
    }
  }

  async function disablePromo() {
    if (!window.confirm('Disable the current promo code? New unlocks will stop working.')) return;
    setBusy('promo');
    try {
      await api('/chat/admin/promo/disable', { method: 'POST' });
      await refresh(search);
      duo.setNotice('Promo code disabled.');
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Promo update failed');
    } finally {
      setBusy('');
    }
  }

  async function permissionAction(id: string, action: 'approve' | 'reject' | 'revoke') {
    setBusy(id + action);
    try {
      await duo.permissionAction(id, action);
      await refresh(search);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Permission update failed');
    } finally {
      setBusy('');
    }
  }

  const grantedPermissions = duo.permissions.filter((permission) => permission.status === 'GRANTED');
  const hostMicGrant = duo.permissions.find(
    (permission) =>
      permission.name === 'REMOTE_MIC_CONTROL' &&
      permission.requestedBy === duo.user?.id &&
      permission.status === 'GRANTED'
  );
  const guestMicGrant = duo.permissions.find(
    (permission) =>
      permission.name === 'REMOTE_MIC_CONTROL' &&
      permission.grantedBy === duo.user?.id &&
      permission.status === 'GRANTED'
  );

  return (
    <>
      <SectionTitle
        eyebrow="Host only"
        title="Admin Dashboard"
        description="Moderation, conversation authority, permissions, activity and audit records."
        action={
          <Button onClick={() => void refresh(search)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      <div className="admin-tabs mb-4">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={`admin-tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Chat messages" value={String(stats.messages)} />
            <StatCard label="Game messages" value={String(stats.gameMessages)} />
            <StatCard label="Calls logged" value={String(stats.calls)} />
            <StatCard label="Active permissions" value={String(stats.active)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-5">
              <p className="eyebrow">Live status</p>
              <h3 className="mt-1 text-lg font-semibold">Participants & call</h3>
              <div className="mt-3 space-y-2 text-sm">
                <Row label="Host" value={duo.user?.username || 'host'} />
                <Row label="Other participant" value={duo.otherOnline ? 'Online' : 'Offline'} />
                <Row label="Call state" value={duo.callState} />
                <Row label="Your microphone" value={duo.micOn ? 'On' : 'Muted'} />
                <Row
                  label="Other microphone"
                  value={duo.remoteMicOn === null ? 'Unknown' : duo.remoteMicOn ? 'On' : 'Muted'}
                />
                <Row label="Conversation" value={duo.conversationStatus} />
              </div>
            </Panel>

            <Panel className="p-5">
              <p className="eyebrow">Microphone management</p>
              <h3 className="mt-1 text-lg font-semibold">Consent-based controls</h3>
              <p className="muted mt-2 text-xs leading-5">
                Remote microphone controls work only with an explicit grant from the other
                participant. Guest can revoke at any time and can always mute locally.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={hostMicGrant ? 'good' : 'warn'}>
                  {hostMicGrant ? 'Host → Guest mic granted' : 'Guest mic consent not granted'}
                </Badge>
                <Badge tone={guestMicGrant ? 'good' : 'neutral'}>
                  {guestMicGrant ? 'Guest may mute Host mic' : 'Guest → Host mic not granted'}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    void duo.requestPermission(
                      'REMOTE_MIC_CONTROL',
                      'Allow Host to request remote microphone mute/unmute during an active call.',
                      true
                    )
                  }
                >
                  <Mic size={15} /> Request Guest mic control
                </Button>
                <Button
                  onClick={() =>
                    void duo.requestPermission(
                      'REMOTE_MIC_CONTROL',
                      'Allow Guest to mute the Host microphone during a call. Host can always unmute locally.',
                      false
                    )
                  }
                >
                  Allow Guest to mute Host mic
                </Button>
                <Button
                  onClick={() => duo.remoteMic(false)}
                  disabled={!hostMicGrant || duo.callState !== 'ACTIVE'}
                >
                  Mute Guest mic
                </Button>
                <Button
                  onClick={() => duo.remoteMic(true)}
                  disabled={!hostMicGrant || duo.callState !== 'ACTIVE'}
                >
                  Request unmute
                </Button>
              </div>
            </Panel>
          </div>

          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Destructive authority</p>
                <h3 className="mt-1 text-lg font-semibold">Conversation history</h3>
                <p className="muted mt-1 text-sm">
                  Permanently delete every Chat message. Audit records are kept without
                  message content, and RESTORE cannot recover deleted data.
                </p>
              </div>
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={15} /> Delete all history
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'chat' && (
        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Authorized history</p>
              <h3 className="mt-1 text-lg font-semibold">Normal chat messages</h3>
            </div>
            <div className="flex gap-2">
              <input
                className="field w-56"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void refresh(search);
                }}
                placeholder="Search messages"
              />
              <Button onClick={() => void refresh(search)}>
                <Search size={15} />
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-black/15 p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">{message.sender?.username || message.senderId}</Badge>
                    <span className="muted text-[11px]">{formatDateTime(message.createdAt)}</span>
                    {message.conversation?.status && (
                      <Badge tone={message.conversation.status === 'ACTIVE' ? 'good' : 'warn'}>
                        {message.conversation.status}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 break-words text-sm leading-6">{message.content}</p>
                </div>
                <Button
                  variant="danger"
                  className="shrink-0"
                  aria-label="Delete message"
                  onClick={() => void deleteMessage(message.id)}
                  disabled={busy === message.id}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            {!messages.length && (
              <EmptyState
                icon={<MessageCircle size={24} />}
                title="No messages found"
                description="Try a different search or start a conversation."
              />
            )}
          </div>
        </Panel>
      )}

      {tab === 'game' && (
        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Game Chat</p>
              <h3 className="mt-1 text-lg font-semibold">Game messages</h3>
            </div>
            <Button
              variant="danger"
              onClick={() => void deleteAllGameMessages()}
              disabled={busy === 'game-history' || gameMessages.length === 0}
            >
              <Trash2 size={14} /> Delete all game messages
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {gameMessages.map((message) => (
              <div
                key={message.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-black/15 p-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">{message.sender?.username || 'Participant'}</Badge>
                    <span className="muted text-[11px]">{formatDateTime(message.createdAt)}</span>
                  </div>
                  <p className="mt-1 break-words text-sm leading-6">{message.content}</p>
                </div>
                <Button
                  variant="danger"
                  aria-label="Delete game message"
                  onClick={() => void deleteGameMessage(message.id)}
                  disabled={busy === message.id}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            {!gameMessages.length && (
              <EmptyState
                icon={<Gamepad2 size={24} />}
                title="No game messages"
                description="Messages sent with SEND-TO-GAME ON appear here."
              />
            )}
          </div>
        </Panel>
      )}

      {tab === 'permissions' && (
        <Panel className="p-5">
          <p className="eyebrow">Consent records</p>
          <h3 className="mt-1 text-lg font-semibold">Permissions</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {duo.permissions.map((permission) => (
              <PermissionCard
                key={permission.id}
                permission={permission}
                currentUserId={duo.user?.id || ''}
                host={duo.user?.role === 'HOST'}
                busy={busy !== ''}
                onAction={permissionAction}
              />
            ))}
            {!duo.permissions.length && (
              <p className="muted text-sm">No permission records yet.</p>
            )}
          </div>
        </Panel>
      )}

      {tab === 'promo' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-5">
            <p className="eyebrow">Access code</p>
            <h3 className="mt-1 text-lg font-semibold">Rotate promo code</h3>
            <p className="muted mt-2 text-sm leading-6">
              The database stores only a bcrypt hash. Host can change the code at any time. The
              promo code is separate from account passwords.
            </p>
            <div className="mt-4 flex gap-2">
              <Field
                className="w-full"
                value={promoCode}
                onChange={(event) => setPromoCode(event.target.value)}
                placeholder="New code (6–100 characters)"
                autoComplete="off"
              />
              <Button variant="primary" onClick={() => void rotatePromo()} disabled={busy === 'promo'}>
                Save
              </Button>
            </div>
            <Button className="mt-3" variant="danger" onClick={() => void disablePromo()}>
              Disable current promo code
            </Button>
          </Panel>

          <Panel className="p-5">
            <p className="eyebrow">Code status</p>
            <h3 className="mt-1 text-lg font-semibold">Protection</h3>
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Status" value={promoStatus?.enabled ? 'Active' : 'Not configured'} />
              <Row
                label="Last updated"
                value={promoStatus?.updatedAt ? formatDateTime(promoStatus.updatedAt) : '—'}
              />
              <Row
                label="Rate limit"
                value={
                  promoStatus?.rateLimit
                    ? `${promoStatus.rateLimit.attempts} attempts / ${promoStatus.rateLimit.windowMinutes} min`
                    : '8 attempts / 15 min'
                }
              />
              <Row label="Storage" value="bcrypt hash only" />
            </div>
            <div className="muted mt-4 rounded-xl border border-white/5 bg-black/15 p-3 text-xs leading-5">
              Promo unlock opens Chat. RESTORE is a separate command and only reopens an existing,
              non-deleted conversation.
            </div>
          </Panel>
        </div>
      )}

      {tab === 'activity' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-5">
            <p className="eyebrow">Notifications</p>
            <h3 className="mt-1 text-lg font-semibold">Activity feed</h3>
            <div className="mt-3 max-h-96 space-y-2 overflow-auto">
              {activity?.notifications.map((notification) => (
                <div key={notification.id} className="rounded-xl border border-white/5 bg-black/15 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm">{eventLabel(notification.eventType)}</p>
                    <span className="muted text-[11px]">
                      {notification.readAt ? 'Read' : 'Unread'}
                    </span>
                  </div>
                  <p className="muted mt-1 text-[11px]">
                    {notification.actor?.username || 'System'} ·{' '}
                    {formatDateTime(notification.createdAt)}
                  </p>
                </div>
              ))}
              {!activity?.notifications.length && (
                <p className="muted text-sm">No activity yet.</p>
              )}
            </div>
          </Panel>

          <Panel className="p-5">
            <p className="eyebrow">Game activity</p>
            <h3 className="mt-1 text-lg font-semibold">Game sessions</h3>
            <div className="mt-3 max-h-96 space-y-2 overflow-auto">
              {activity?.gameSessions.map((session) => (
                <div key={session.id} className="rounded-xl border border-white/5 bg-black/15 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm">{session.game.name}</p>
                    <Badge tone="accent">{session.score} pts</Badge>
                  </div>
                  <p className="muted mt-1 text-[11px]">
                    {formatDateTime(session.startedAt)}
                    {session.endedAt ? ` → ${formatDateTime(session.endedAt)}` : ' · In progress'}
                  </p>
                </div>
              ))}
              {!activity?.gameSessions.length && (
                <p className="muted text-sm">No game sessions recorded.</p>
              )}
            </div>
          </Panel>

          <Panel className="p-5">
            <p className="eyebrow">Calls</p>
            <h3 className="mt-1 text-lg font-semibold">Call history</h3>
            <div className="mt-3 max-h-96 space-y-2 overflow-auto">
              {activity?.calls.map((call) => (
                <div key={call.id} className="rounded-xl border border-white/5 bg-black/15 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm">
                      <Phone size={13} /> {eventLabel(call.status)}
                    </p>
                    <span className="muted text-[11px]">{formatDateTime(call.startedAt)}</span>
                  </div>
                  <p className="muted mt-1 text-[11px]">
                    {call.participants.map((participant) => participant.user?.username).join(' · ')}
                  </p>
                </div>
              ))}
              {!activity?.calls.length && <p className="muted text-sm">No calls yet.</p>}
            </div>
          </Panel>

          <Panel className="p-5">
            <p className="eyebrow">Audit log</p>
            <h3 className="mt-1 text-lg font-semibold">Administrative actions</h3>
            <div className="mt-3 max-h-96 space-y-2 overflow-auto">
              {activity?.logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-white/5 bg-black/15 p-3">
                  <p className="text-sm">{eventLabel(log.action)}</p>
                  <p className="muted mt-1 text-[11px]">
                    {formatDateTime(log.createdAt)}
                    {log.targetId ? ` · ${log.targetId.slice(0, 8)}…` : ''}
                  </p>
                </div>
              ))}
              {!activity?.logs.length && <p className="muted text-sm">No audit events yet.</p>}
            </div>
          </Panel>
        </div>
      )}

      <Modal
        open={deleteOpen}
        title="Delete complete conversation history?"
        onClose={() => {
          setDeleteOpen(false);
          setDeleteText('');
        }}
      >
        <p className="muted text-sm leading-6">
          This permanently deletes every Chat message. It cannot be undone and RESTORE can
          never bring it back. An audit record will say the history was deleted, without keeping
          message content.
        </p>
        <Field
          label="Type DELETE to confirm"
          className="mt-4"
          value={deleteText}
          onChange={(event) => setDeleteText(event.target.value)}
          placeholder="DELETE"
          autoComplete="off"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button
            onClick={() => {
              setDeleteOpen(false);
              setDeleteText('');
            }}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void deleteHistory()} disabled={busy === 'history'}>
            {busy === 'history' ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-soft p-4">
      <p className="muted text-[10px] uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-black/15 px-3 py-2">
      <span className="muted text-xs">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function PermissionCard({
  permission,
  currentUserId,
  host,
  busy,
  onAction
}: {
  permission: Permission;
  currentUserId: string;
  host: boolean;
  busy: boolean;
  onAction: (id: string, action: 'approve' | 'reject' | 'revoke') => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{permission.name.replaceAll('_', ' ')}</p>
        <Badge
          tone={
            permission.status === 'GRANTED'
              ? 'good'
              : permission.status === 'REQUESTED'
                ? 'warn'
                : permission.status === 'REJECTED'
                  ? 'bad'
                  : 'neutral'
          }
        >
          {permission.status}
        </Badge>
      </div>
      <p className="muted mt-1 text-xs leading-5">{permission.description}</p>
      <p className="muted mt-1 text-[11px]">
        Requested by {permission.requester?.username || 'participant'}
        {permission.grantor?.username ? ` · Granted by ${permission.grantor.username}` : ''}
        {permission.grantedAt ? ` · ${formatDateTime(permission.grantedAt)}` : ''}
        {permission.rejectedAt ? ` · Rejected ${formatDateTime(permission.rejectedAt)}` : ''}
        {permission.revokedAt ? ` · Revoked ${formatDateTime(permission.revokedAt)}` : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {permission.status === 'REQUESTED' && permission.requestedBy !== currentUserId && (
          <>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void onAction(permission.id, 'approve')}
            >
              <Check size={14} /> Approve
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void onAction(permission.id, 'reject')}
            >
              <X size={14} /> Reject
            </Button>
          </>
        )}
        {permission.status === 'GRANTED' &&
          (permission.requestedBy === currentUserId ||
            permission.grantedBy === currentUserId ||
            host) && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void onAction(permission.id, 'revoke')}
            >
              <X size={14} /> Revoke
            </Button>
          )}
      </div>
    </div>
  );
}
