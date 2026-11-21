'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Bell,
  BellOff,
  BookOpen,
  Check,
  Gamepad2,
  History,
  ListChecks,
  MessageCircle,
  Mic,
  Pencil,
  Plus,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Ticket,
  Trash2,
  X
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDuo } from '@/hooks/useDuoApp';
import type {
  AdminActivity,
  AdminConversation,
  CallRecord,
  GameMessage,
  Message,
  Permission
} from '@/lib/types';
import { formatDateTime, eventLabel } from '@/lib/utils';
import { Badge, Button, EmptyState, Field, Modal, Panel, SectionTitle, Toggle } from '@/components/ui';

type AdminMessage = Message & { conversation?: { id?: string; status: string } };
type AdminDeletedMessage = Message & {
  conversation?: {
    id?: string;
    status: string;
    hostId?: string | null;
    guestId?: string | null;
  };
  hides?: Array<{ id: string; user?: { id: string; username: string; role: string } }>;
};
type AdminUser = {
  id: string;
  username: string;
  displayName?: string | null;
  role: 'HOST' | 'GUEST';
  lastSeenAt?: string | null;
  chatNotifications: boolean;
  adminPushNotifications: boolean;
  adminButterflyNotifications: boolean;
  adminSoundNotifications: boolean;
};
type NotificationFeatureState = {
  enabled: boolean;
  pushConfigured: boolean;
  updatedAt?: string | null;
};
type Tab =
  | 'overview'
  | 'chat'
  | 'deleted'
  | 'features'
  | 'study'
  | 'game'
  | 'permissions'
  | 'promo'
  | 'activity';

const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <Activity size={15} /> },
  { id: 'chat', label: 'Message delete', icon: <MessageCircle size={15} /> },
  { id: 'deleted', label: 'Recycle Bin', icon: <RotateCcw size={15} /> },
  { id: 'features', label: 'User features', icon: <Bell size={15} /> },
  { id: 'study', label: 'Study assistance', icon: <BookOpen size={15} /> },
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
  const [deletedMessages, setDeletedMessages] = useState<AdminDeletedMessage[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationFeatureState | null>(null);
  const [deletedRole, setDeletedRole] = useState<'' | 'HOST' | 'GUEST'>('');
  const [gameMessages, setGameMessages] = useState<GameMessage[]>([]);
  const [search, setSearch] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [adminSelectMode, setAdminSelectMode] = useState(false);
  const [selectedAdminIds, setSelectedAdminIds] = useState<Set<string>>(new Set());
  const [deleteFor, setDeleteFor] = useState<'BOTH' | 'HOST' | 'GUEST'>('BOTH');
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[] | null>(null);

  const deleteForLabel =
    deleteFor === 'BOTH' ? 'Both members' : deleteFor === 'HOST' ? 'Host only' : 'Guest only';

  const refresh = useCallback(async (query: string, conversationId?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (conversationId) params.set('conversationId', conversationId);
    const queryString = params.toString();
    const [
      activityResult,
      messagesResult,
      deletedResult,
      usersResult,
      gameResult,
      promoResult,
      conversationsResult,
      notificationResult
    ] = await Promise.allSettled([
      api<AdminActivity>('/chat/admin/activity'),
      api<AdminMessage[]>(`/chat/admin/messages${queryString ? `?${queryString}` : ''}`),
      api<AdminDeletedMessage[]>('/chat/admin/deleted-messages'),
      api<AdminUser[]>('/chat/admin/users'),
      api<GameMessage[]>('/chat/admin/game-messages'),
      api<any>('/chat/admin/promo/status'),
      api<AdminConversation[]>('/chat/admin/conversations'),
      api<NotificationFeatureState>('/chat/admin/notification-settings')
    ]);
    if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
    if (messagesResult.status === 'fulfilled') setMessages(messagesResult.value);
    if (deletedResult.status === 'fulfilled') setDeletedMessages(deletedResult.value);
    if (usersResult.status === 'fulfilled') setAdminUsers(usersResult.value);
    if (gameResult.status === 'fulfilled') setGameMessages(gameResult.value);
    if (promoResult.status === 'fulfilled') setPromoStatus(promoResult.value);
    if (conversationsResult.status === 'fulfilled') {
      const next = conversationsResult.value;
      setConversations(next);
      setActiveConversationId((current) => current || next[0]?.id || '');
    }
    if (notificationResult.status === 'fulfilled') setNotificationSettings(notificationResult.value);
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

  /** Host only / Guest only filters the chat view to that member's messages. */
  const visibleMessages = useMemo(() => {
    if (deleteFor === 'BOTH') return messages;
    return messages.filter((message) => message.sender?.role === deleteFor);
  }, [messages, deleteFor]);

  function deleteForPayload(): Array<'HOST' | 'GUEST'> {
    return deleteFor === 'BOTH' ? ['HOST', 'GUEST'] : [deleteFor];
  }

  async function deleteAdminMessages(ids: string[]) {
    if (!ids.length) return;
    if (
      !window.confirm(
        `Soft delete ${ids.length} message${ids.length === 1 ? '' : 's'}? The copy will be kept in the Recycle Bin.`
      )
    ) {
      return;
    }
    setBusy('admin-delete');
    try {
      const result = await api<{ ok: boolean; count: number; ids: string[] }>(
        '/chat/admin/messages/delete',
        {
          method: 'POST',
          body: JSON.stringify({
            conversationId: activeConversationId || undefined,
            ids,
            deleteFor: deleteForPayload()
          })
        }
      );
      setAdminSelectMode(false);
      setSelectedAdminIds(new Set());
      await refresh(search, activeConversationId || undefined);
      duo.setNotice(
        `Soft deleted ${result.count} message${result.count === 1 ? '' : 's'}. Open the Recycle Bin to restore or permanently delete them.`
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy('');
    }
  }

  async function deleteMessage(id: string) {
    if (
      !window.confirm(
        'Delete this message? The action is recorded in the audit log and lands in the Recycle Bin as a soft delete.'
      )
    ) {
      return;
    }
    setBusy(id);
    try {
      const result = await api<{ ok: boolean; count: number; ids: string[] }>(
        '/chat/admin/messages/delete',
        {
          method: 'POST',
          body: JSON.stringify({
            conversationId: activeConversationId || undefined,
            ids: [id],
            deleteFor: deleteForPayload()
          })
        }
      );
      await refresh(search, activeConversationId || undefined);
      duo.setNotice(
        `Soft deleted ${result.count} message${result.count === 1 ? '' : 's'}. Open the Recycle Bin to restore or permanently delete it.`
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy('');
    }
  }

  async function performDeleteAllInChat() {
    if (!activeConversationId) return;
    setBusy('admin-delete-all');
    try {
      const result = await api<{ ok: boolean; count: number; ids: string[] }>(
        '/chat/admin/messages/delete',
        {
          method: 'POST',
          body: JSON.stringify({
            conversationId: activeConversationId,
            deleteFor: deleteForPayload()
          })
        }
      );
      setDeleteAllOpen(false);
      await refresh(search, activeConversationId);
      duo.setNotice(
        `Soft deleted ${result.count} message${result.count === 1 ? '' : 's'} of this chat. Open the Recycle Bin to restore or permanently delete them.`
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy('');
    }
  }

  function toggleAdminSelected(id: string) {
    setSelectedAdminIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function recoverDeleted(ids?: string[], role?: 'HOST' | 'GUEST') {
    if (!ids?.length && !role && !window.confirm('Recover every deleted message?')) return;
    setBusy('recover');
    try {
      await api('/chat/admin/deleted-messages/recover', {
        method: 'POST',
        body: JSON.stringify({ ids, role })
      });
      await refresh(search);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Recovery failed');
    } finally {
      setBusy('');
    }
  }

  async function purgeDeleted(ids?: string[], role?: 'HOST' | 'GUEST') {
    if (
      !window.confirm(
        'Permanently delete these messages? This cannot be undone and the other side loses their copy too.'
      )
    ) {
      return;
    }
    setBusy('purge');
    try {
      await api('/chat/admin/deleted-messages', {
        method: 'DELETE',
        body: JSON.stringify({ ids, role })
      });
      await refresh(search);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy('');
    }
  }

  async function toggleChatNotifications(user: AdminUser) {
    setBusy(`feature-${user.id}`);
    try {
      await api('/chat/admin/features', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          chatNotifications: !user.chatNotifications
        })
      });
      setAdminUsers((current) =>
        current.map((entry) =>
          entry.id === user.id
            ? { ...entry, chatNotifications: !entry.chatNotifications }
            : entry
        )
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Feature could not be updated');
    } finally {
      setBusy('');
    }
  }

  async function toggleAdminNotificationType(
    user: AdminUser,
    type: 'adminPushNotifications' | 'adminButterflyNotifications' | 'adminSoundNotifications',
    next: boolean
  ) {
    setBusy(`feature-${user.id}`);
    try {
      await api('/chat/admin/features', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, [type]: next })
      });
      setAdminUsers((current) =>
        current.map((entry) => (entry.id === user.id ? { ...entry, [type]: next } : entry))
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Feature could not be updated');
    } finally {
      setBusy('');
    }
  }

  async function toggleGlobalNotifications() {
    const next = !(notificationSettings?.enabled ?? true);
    if (
      !next &&
      !window.confirm(
        'Disable notifications for every account? No message or update will notify anyone, and the notification options will be hidden from every Settings screen.'
      )
    ) {
      return;
    }
    setBusy('notification-setting');
    try {
      const state = await api<NotificationFeatureState>('/chat/admin/notification-settings', {
        method: 'POST',
        body: JSON.stringify({ enabled: next })
      });
      setNotificationSettings(state);
      duo.setNotice(
        state.enabled
          ? 'Notifications are enabled for every account.'
          : 'Notifications are disabled for every account.'
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Notification setting could not be saved');
    } finally {
      setBusy('');
    }
  }

  const visibleDeleted = useMemo(
    () =>
      deletedMessages.filter((message) => {
        if (!deletedRole) return true;
        return (
          message.sender?.role === deletedRole ||
          Boolean(message.hides?.some((hide) => hide.user?.role === deletedRole))
        );
      }),
    [deletedMessages, deletedRole]
  );

  /** Recycle Bin entries grouped chat-wise so restore/purge can act per conversation. */
  const deletedGroups = useMemo(() => {
    const groups = new Map<string, AdminDeletedMessage[]>();
    for (const message of visibleDeleted) {
      const key = message.conversation?.id || `orphan-${message.id}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(message);
      else groups.set(key, [message]);
    }
    return Array.from(groups.entries()).map(([conversationId, messages]) => ({
      conversationId,
      messages
    }));
  }, [visibleDeleted]);

  const conversationTitle = useCallback((conversationId: string) => {
    const found = conversations.find((conversation) => conversation.id === conversationId);
    if (!found) return `Chat ${conversationId.slice(0, 8)}`;
    return `${found.hostName} ↔ ${found.guestName}`;
  }, [conversations]);

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

  async function clearAllActivity() {
    if (
      !window.confirm(
        'Delete all activity (notifications, call history, game sessions)? This cannot be undone.'
      )
    ) {
      return;
    }
    setBusy('activity');
    try {
      const result = await duo.clearActivity();
      await refresh(search);
      duo.setNotice(`Activity cleared (${result} records).`);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Could not clear activity');
    } finally {
      setBusy('');
    }
  }

  async function clearAuditLog() {
    if (!window.confirm('Delete the entire audit log? This cannot be undone.')) return;
    setBusy('audit');
    try {
      const result = await duo.clearAudit();
      await refresh(search);
      duo.setNotice(`Audit log cleared (${result} records).`);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Could not clear audit log');
    } finally {
      setBusy('');
    }
  }

  async function deleteHistory() {    if (deleteText.trim().toUpperCase() !== 'DELETE') {
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
                  Hides every Chat message from the Host view only. The User keeps their copy,
                  and you can recover or permanently delete it from the Recycle Bin tab.
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
              <p className="eyebrow">Admin authority</p>
              <h3 className="mt-1 text-lg font-semibold">Message delete</h3>
              <p className="muted mt-1 text-xs">
                Choose a chat, select the messages and delete them. Admin deletes are soft deletes,
                so the copy lands in the Recycle Bin first and can be restored or permanently
                deleted later.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="field w-64"
                value={activeConversationId}
                onChange={(event) => {
                  setActiveConversationId(event.target.value);
                  setSelectedAdminIds(new Set());
                  setAdminSelectMode(false);
                  void refresh(search, event.target.value || undefined);
                }}
              >
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.hostName} ↔ {conversation.guestName}
                  </option>
                ))}
              </select>
              <Button
                variant="danger"
                onClick={() => setDeleteAllOpen(true)}
                disabled={!activeConversationId || busy === 'admin-delete-all'}
              >
                <Trash2 size={15} /> Delete all in chat
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant={adminSelectMode ? 'primary' : 'ghost'}
              onClick={() => {
                setAdminSelectMode((value) => !value);
                setSelectedAdminIds(new Set());
              }}
            >
              <ListChecks size={15} /> {adminSelectMode ? 'Done selecting' : 'Select messages'}
            </Button>
            {adminSelectMode && (
              <Button
                variant="danger"
                disabled={!selectedAdminIds.size}
                onClick={() => setDeleteConfirmIds([...selectedAdminIds])}
              >
                <Trash2 size={15} /> Delete selected ({selectedAdminIds.size})
              </Button>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="muted text-xs font-medium">Show / delete:</span>
              {(['BOTH', 'HOST', 'GUEST'] as const).map((value) => (
                <Button
                  key={value}
                  className="!px-3 !py-1.5 text-xs"
                  variant={deleteFor === value ? 'primary' : 'ghost'}
                  onClick={() => {
                    setDeleteFor(value);
                    setSelectedAdminIds(new Set());
                  }}
                >
                  {value === 'BOTH' ? 'Both members' : value === 'HOST' ? 'Host only' : 'Guest only'}
                </Button>
              ))}
            </div>
            <span className="muted text-xs">
              {deleteFor === 'BOTH'
                ? 'Showing every message · deletes both copies'
                : `Showing ${deleteFor === 'HOST' ? 'Host' : 'Guest'} messages · deletes the ${
                    deleteFor === 'HOST' ? 'Host' : 'Guest'
                  } copy`}
            </span>
          </div>

          <div className="mt-4 flex max-w-sm items-center gap-2">
            <input
              className="field w-56"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void refresh(search, activeConversationId || undefined);
              }}
              placeholder="Search messages"
            />
            <Button onClick={() => void refresh(search, activeConversationId || undefined)}>
              <Search size={15} />
            </Button>
          </div>

          <div className="mt-4 flex max-h-[62vh] flex-col gap-3 overflow-y-auto rounded-2xl border border-white/5 bg-black/20 p-3 sm:p-4">
            {visibleMessages.map((message) => {
              const isHost = message.sender?.role === 'HOST';
              const senderName =
                message.sender?.displayName || message.sender?.username || message.senderId;
              const selected = selectedAdminIds.has(message.id);
              return (
                <div
                  key={message.id}
                  className={`flex items-end gap-2 ${isHost ? 'justify-end' : 'justify-start'}`}
                >
                  {!isHost && (
                    <span className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-[10px] font-semibold uppercase text-white/70">
                      {senderName.slice(0, 2)}
                    </span>
                  )}
                  {adminSelectMode && (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleAdminSelected(message.id)}
                      className="mb-6 h-4 w-4 shrink-0 accent-rose-400"
                      aria-label={`Select message from ${senderName}`}
                    />
                  )}
                  <div
                    onClick={adminSelectMode ? () => toggleAdminSelected(message.id) : undefined}
                    role={adminSelectMode ? 'button' : undefined}
                    aria-pressed={adminSelectMode ? selected : undefined}
                    className={[
                      'relative max-w-[82%] rounded-2xl border px-3.5 py-2.5 shadow-lg sm:max-w-[72%]',
                      isHost
                        ? 'rounded-br-md border-fuchsia-300/20 bg-gradient-to-br from-fuchsia-700/90 to-purple-800/90 text-white'
                        : 'rounded-bl-md border-white/10 bg-[#241f31] text-white/90',
                      adminSelectMode ? 'cursor-pointer' : '',
                      selected ? 'ring-2 ring-fuchsia-400 ring-offset-2 ring-offset-black/40' : ''
                    ].join(' ')}
                  >
                    {selected && (
                      <span className="selection-check">
                        <Check size={11} />
                      </span>
                    )}
                    <div
                      className={`flex flex-wrap items-center gap-2 text-[11px] ${
                        isHost ? 'justify-end' : ''
                      }`}
                    >
                      <span className="font-semibold text-white/90">{senderName}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                          isHost
                            ? 'bg-white/15 text-white/80'
                            : 'bg-emerald-400/15 text-emerald-200'
                        }`}
                      >
                        {isHost ? 'Host' : 'Guest'}
                      </span>
                      <span className="text-white/50">{formatDateTime(message.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                      {message.content ||
                        (message.attachmentKind === 'IMAGE'
                          ? '📷 Photo'
                          : message.attachmentKind === 'VIDEO'
                            ? '🎬 Video'
                            : message.attachmentKind === 'AUDIO'
                              ? '🎙️ Voice message'
                              : message.attachmentName
                                ? `📎 ${message.attachmentName}`
                                : 'Attachment')}
                    </p>
                    <div
                      className={`mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-white/55 ${
                        isHost ? 'justify-end' : ''
                      }`}
                    >
                      {message.conversation?.status && (
                        <span
                          className={
                            message.conversation.status === 'ACTIVE'
                              ? 'text-emerald-300/80'
                              : 'text-amber-300/80'
                          }
                        >
                          {message.conversation.status}
                        </span>
                      )}
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-rose-200 transition hover:bg-rose-500/25 hover:text-rose-100"
                        aria-label="Delete message"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteConfirmIds([message.id]);
                        }}
                        disabled={busy === message.id}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  </div>
                  {isHost && (
                    <span className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fuchsia-500/25 text-[10px] font-semibold uppercase text-fuchsia-100">
                      {senderName.slice(0, 2)}
                    </span>
                  )}
                </div>
              );
            })}
            {!visibleMessages.length && (
              <EmptyState
                icon={<MessageCircle size={24} />}
                title="No messages found"
                description={
                  deleteFor === 'BOTH'
                    ? 'Try a different search or start a conversation.'
                    : `No ${deleteFor === 'HOST' ? 'Host' : 'Guest'} messages in this chat.`
                }
              />
            )}
          </div>
        </Panel>
      )}

      {tab === 'deleted' && (
        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Soft-deleted store</p>
              <h3 className="mt-1 text-lg font-semibold">Recycle Bin</h3>
              <p className="muted mt-1 text-xs">
                Admin deletes are soft deletes. Restore a chat to bring the copies back, or delete
                forever to remove them permanently.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="field w-32"
                value={deletedRole}
                onChange={(event) =>
                  setDeletedRole(event.target.value as '' | 'HOST' | 'GUEST')
                }
              >
                <option value="">All users</option>
                <option value="HOST">Host</option>
                <option value="GUEST">User</option>
              </select>
              <Button
                onClick={() => void recoverDeleted(undefined, deletedRole || undefined)}
                disabled={busy === 'recover' || visibleDeleted.length === 0}
              >
                <RotateCcw size={14} /> Recover {deletedRole ? deletedRole.toLowerCase() : 'all'}
              </Button>
              <Button
                variant="danger"
                onClick={() => void purgeDeleted(undefined, deletedRole || undefined)}
                disabled={busy === 'purge' || visibleDeleted.length === 0}
              >
                <Trash2 size={14} /> Delete forever
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {deletedGroups.map((group) => (
              <div
                key={group.conversationId}
                className="rounded-2xl border border-white/5 bg-black/15 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{conversationTitle(group.conversationId)}</p>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      className="!px-2.5 !py-1.5 text-xs"
                      onClick={() => void recoverDeleted(group.messages.map((message) => message.id))}
                      disabled={busy === 'recover'}
                    >
                      <RotateCcw size={13} /> Recover all
                    </Button>
                    <Button
                      variant="danger"
                      className="!px-2.5 !py-1.5 text-xs"
                      onClick={() => void purgeDeleted(group.messages.map((message) => message.id))}
                      disabled={busy === 'purge'}
                    >
                      <Trash2 size={13} /> Delete forever
                    </Button>
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                {group.messages.map((message) => (
              <div
                key={message.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/5 bg-black/15 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">{message.sender?.username || message.senderId}</Badge>
                    <Badge tone={message.sender?.role === 'HOST' ? 'good' : 'neutral'}>
                      {message.sender?.role || 'USER'}
                    </Badge>
                    <span className="muted text-[11px]">{formatDateTime(message.createdAt)}</span>
                    {message.hides?.length ? (
                      <span className="muted text-[11px]">
                        hidden for{' '}
                        {message.hides
                          .map((hide) => hide.user?.username || 'account')
                          .join(', ')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 break-words text-sm leading-6">
                    {message.content ||
                      (message.attachmentKind === 'IMAGE'
                        ? '📷 Photo'
                        : message.attachmentKind === 'VIDEO'
                          ? '🎬 Video'
                          : message.attachmentKind === 'AUDIO'
                            ? '🎙️ Voice message'
                            : message.attachmentName
                              ? `📎 ${message.attachmentName}`
                              : 'Attachment')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    className="!px-2.5 !py-1.5 text-xs"
                    onClick={() => void recoverDeleted([message.id])}
                    disabled={busy === 'recover'}
                  >
                    <RotateCcw size={13} /> Recover
                  </Button>
                  <Button
                    variant="danger"
                    className="!px-2.5 !py-1.5 text-xs"
                    onClick={() => void purgeDeleted([message.id])}
                    disabled={busy === 'purge'}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
                  ))}
                </div>
              </div>
            ))}
            {!deletedGroups.length && (
              <EmptyState
                icon={<RotateCcw size={24} />}
                title="No deleted messages"
                description="Messages deleted by either side will appear here."
              />
            )}
          </div>
        </Panel>
      )}

      {tab === 'features' && (
        <div className="grid gap-4">
          <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Notification availability</p>
                <h3 className="mt-1 text-lg font-semibold">Show notifications to everyone</h3>
                <p className="muted mt-1 max-w-2xl text-sm leading-6">
                  This is the master switch. When it is on, each account can enable Chrome
                  notifications in Settings. When it is off, no message or update sends a
                  notification to anyone, and the notification options are hidden from every
                  Settings screen.
                </p>
              </div>
              <Badge tone={notificationSettings?.enabled ?? true ? 'good' : 'bad'}>
                {notificationSettings?.enabled ?? true ? 'Enabled for everyone' : 'Disabled for everyone'}
              </Badge>
            </div>

            {notificationSettings && !notificationSettings.pushConfigured && (
              <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-200">
                Background push is not configured on the server (VAPID keys are missing). In-page
                notifications work while a tab is open, but Chrome cannot notify when it is closed.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant={notificationSettings?.enabled ?? true ? 'danger' : 'primary'}
                onClick={() => void toggleGlobalNotifications()}
                disabled={busy === 'notification-setting'}
              >
                {notificationSettings?.enabled ?? true ? (
                  <>
                    <BellOff size={15} /> Disable notifications for everyone
                  </>
                ) : (
                  <>
                    <Bell size={15} /> Enable notifications for everyone
                  </>
                )}
              </Button>
              {notificationSettings?.updatedAt && (
                <span className="muted text-xs">
                  Last changed {formatDateTime(notificationSettings.updatedAt)}
                </span>
              )}
            </div>
          </Panel>

          <Panel className="p-5">
            <div>
              <p className="eyebrow">Per-user features</p>
              <h3 className="mt-1 text-lg font-semibold">Chat notifications</h3>
              <p className="muted mt-1 text-sm leading-6">
                Choose which accounts may receive notifications. This list includes the Host, so you
                can switch your own notifications on or off here too. When an account is allowed, it
                can still turn its own notifications off in Settings. When you disable an account,
                no message notification or butterfly is sent to it and its Settings options are
                hidden. This works only when the master switch above is on.
              </p>
            </div>
            <div className="mt-4 space-y-2">
              {[...adminUsers]
                .sort((a, b) =>
                  a.role === b.role ? 0 : a.role === 'HOST' ? -1 : 1
                )
                .map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/15 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="chat-avatar chat-avatar-sm">
                      {(user.displayName || user.username).charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium">
                        {user.displayName || user.username}
                        {user.id === duo.user?.id ? ' (you)' : ''}
                      </p>
                      <p className="muted text-[11px]">
                        {user.role === 'HOST' ? 'Host / Admin' : 'Guest'} ·{' '}
                        {user.chatNotifications ? 'Admin: allowed' : 'Admin: disabled'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => void toggleChatNotifications(user)}
                      disabled={busy === `feature-${user.id}`}
                      variant={user.chatNotifications ? 'primary' : 'ghost'}
                    >
                      {user.chatNotifications ? <Bell size={14} /> : <BellOff size={14} />}
                      {user.chatNotifications
                        ? user.id === duo.user?.id
                          ? 'Disable my notifications'
                          : 'Disable notifications'
                        : user.id === duo.user?.id
                          ? 'Enable my notifications'
                          : 'Enable notifications'}
                    </Button>
                    <Toggle
                      label="Admin: Chrome push"
                      description="Disable to stop Chrome push notifications for this account."
                      checked={user.adminPushNotifications}
                      onChange={() =>
                        void toggleAdminNotificationType(user, 'adminPushNotifications', !user.adminPushNotifications)
                      }
                    />
                    <Toggle
                      label="Admin: Butterfly"
                      description="Disable to stop the butterfly notification for this account."
                      checked={user.adminButterflyNotifications}
                      onChange={() =>
                        void toggleAdminNotificationType(user, 'adminButterflyNotifications', !user.adminButterflyNotifications)
                      }
                    />
                    <Toggle
                      label="Admin: Sound"
                      description="Disable to stop the notification sound for this account."
                      checked={user.adminSoundNotifications}
                      onChange={() =>
                        void toggleAdminNotificationType(user, 'adminSoundNotifications', !user.adminSoundNotifications)
                      }
                    />
                  </div>
                </div>
              ))}
              {!adminUsers.length && <p className="muted text-sm">No accounts found.</p>}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'study' && <StudyAdminPanel />}

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
                placeholder="New code (4–100 characters)"
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
                    ? `${promoStatus.rateLimit.attempts} wrong attempts / ${promoStatus.rateLimit.windowSeconds} sec`
                    : '10 wrong attempts / 30 sec'
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
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="muted text-xs">
              Host can wipe activity and audit trails at any time.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => void clearAllActivity()} disabled={busy === 'activity'}>
                <Trash2 size={15} /> Clear all activity
              </Button>
              <Button variant="danger" onClick={() => void clearAuditLog()} disabled={busy === 'audit'}>
                <Trash2 size={15} /> Clear audit log
              </Button>
            </div>
          </div>
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
        </>
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
          This hides every Chat message from the Host view only. The User keeps their copy, and
          you can recover or permanently delete the messages from the Recycle Bin tab.
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
            {busy === 'history' ? 'Deleting…' : 'Delete for me'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteAllOpen}
        title="Delete every message of this chat?"
        onClose={() => setDeleteAllOpen(false)}
      >
        <p className="muted text-sm leading-6">
          The whole conversation will be soft deleted for <strong>{deleteForLabel}</strong>. Every
          copy lands in the Recycle Bin and can be restored or permanently deleted from there.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setDeleteAllOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              setDeleteAllOpen(false);
              void performDeleteAllInChat();
            }}
            disabled={busy === 'admin-delete-all'}
          >
            {busy === 'admin-delete-all' ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteConfirmIds !== null}
        title={`Delete ${deleteConfirmIds?.length ?? 0} message(s)?`}
        onClose={() => setDeleteConfirmIds(null)}
      >
        <p className="muted text-sm leading-6">
          This is a soft delete from the admin side for <strong>{deleteForLabel}</strong>. The
          selected copy will be kept in the Recycle Bin and can be restored or permanently deleted
          from there.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setDeleteConfirmIds(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (deleteConfirmIds) void deleteAdminMessages(deleteConfirmIds);
              setDeleteConfirmIds(null);
            }}
            disabled={busy === 'admin-delete'}
          >
            {busy === 'admin-delete' ? 'Deleting…' : 'Delete'}
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

type StudyMessageRow = {
  id: string;
  role: string;
  text: string;
  sortOrder: number;
};

type StudyReplyRow = {
  id: string;
  keywords: string;
  answer: string;
  sortOrder: number;
};

/** Host-managed Study Assistant seed messages and keyword replies. */
function StudyAdminPanel() {
  const duo = useDuo();
  const [messages, setMessages] = useState<StudyMessageRow[]>([]);
  const [replies, setReplies] = useState<StudyReplyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [bulkMessages, setBulkMessages] = useState('');
  const [bulkRole, setBulkRole] = useState<'ASSISTANT' | 'USER'>('ASSISTANT');
  const [replyKeywords, setReplyKeywords] = useState('');
  const [replyAnswer, setReplyAnswer] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api<{ messages: StudyMessageRow[]; replies: StudyReplyRow[] }>(
        '/chat/admin/study'
      );
      setMessages(data.messages || []);
      setReplies(data.replies || []);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Could not load Study content');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    try {
      await action();
      await load();
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Study update failed');
    } finally {
      setBusy('');
    }
  }

  function addMessages() {
    const lines = bulkMessages
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return;
    void run('add-messages', () =>
      api('/chat/admin/study/messages', {
        method: 'POST',
        body: JSON.stringify({
          items: lines.map((text) => ({ role: bulkRole, text }))
        })
      })
    ).then(() => setBulkMessages(''));
  }

  function addReply() {
    if (!replyKeywords.trim() || !replyAnswer.trim()) return;
    void run('add-reply', () =>
      api('/chat/admin/study/replies', {
        method: 'POST',
        body: JSON.stringify({
          keywords: replyKeywords.trim(),
          answer: replyAnswer.trim()
        })
      })
    ).then(() => {
      setReplyKeywords('');
      setReplyAnswer('');
    });
  }

  function moveMessage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= messages.length) return;
    const next = [...messages];
    [next[index], next[target]] = [next[target], next[index]];
    setMessages(next);
    void run('order-messages', () =>
      api('/chat/admin/study/messages/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids: next.map((row) => row.id) })
      })
    );
  }

  function moveReply(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= replies.length) return;
    const next = [...replies];
    [next[index], next[target]] = [next[target], next[index]];
    setReplies(next);
    void run('order-replies', () =>
      api('/chat/admin/study/replies/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids: next.map((row) => row.id) })
      })
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Study assistance</p>
            <h3 className="mt-1 text-lg font-semibold">Conversation messages</h3>
            <p className="muted mt-1 text-sm leading-6">
              These messages appear instantly in the Study Assistant chat. Paste one message per
              line to add several at once. Changes are pushed live to open chats.
            </p>
          </div>
          {messages.length > 0 && (
            <Button
              variant="danger"
              disabled={busy === 'clear-messages'}
              onClick={() => {
                if (!window.confirm('Delete every Study Assistant message?')) return;
                void run('clear-messages', () =>
                  api('/chat/admin/study/messages', {
                    method: 'DELETE',
                    body: JSON.stringify({})
                  })
                );
              }}
            >
              <Trash2 size={14} /> Delete all
            </Button>
          )}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_170px]">
          <textarea
            className="field min-h-[110px] resize-y text-sm"
            value={bulkMessages}
            onChange={(event) => setBulkMessages(event.target.value)}
            placeholder={'One message per line�\nExample: Focus session start karo.'}
          />
          <div className="flex flex-col gap-2">
            <select
              className="field text-sm"
              value={bulkRole}
              onChange={(event) => setBulkRole(event.target.value as 'ASSISTANT' | 'USER')}
            >
              <option value="ASSISTANT">Assistant message</option>
              <option value="USER">User message</option>
            </select>
            <Button
              variant="primary"
              disabled={busy === 'add-messages' || !bulkMessages.trim()}
              onClick={addMessages}
            >
              <Plus size={14} /> Add messages
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {loading && <p className="muted text-sm">Loading�</p>}
          {!loading &&
            messages.map((message, index) => (
              <StudyMessageItem
                key={message.id}
                message={message}
                index={index}
                total={messages.length}
                busy={busy}
                onMove={moveMessage}
                onDelete={() => {
                  if (!window.confirm('Delete this Study message?')) return;
                  void run(`delete-${message.id}`, () =>
                    api(`/chat/admin/study/messages/${message.id}`, { method: 'DELETE' })
                  );
                }}
                onSave={(role, text) =>
                  run(`save-${message.id}`, () =>
                    api(`/chat/admin/study/messages/${message.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ role, text })
                    })
                  )
                }
              />
            ))}
          {!loading && !messages.length && (
            <EmptyState
              icon={<BookOpen size={24} />}
              title="No Study messages yet"
              description="Add messages above. Until then the Study chat shows its built-in sample history."
            />
          )}
        </div>
      </Panel>

      <Panel className="p-5">
        <p className="eyebrow">Study assistance</p>
        <h3 className="mt-1 text-lg font-semibold">Keyword replies</h3>
        <p className="muted mt-1 text-sm leading-6">
          When a user message contains any keyword, the first matching reply is sent. Separate
          keywords with commas. Replies marked higher in the list win ties.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            className="field text-sm"
            value={replyKeywords}
            onChange={(event) => setReplyKeywords(event.target.value)}
            placeholder="focus, concentration, distract"
          />
          <Button
            variant="primary"
            disabled={busy === 'add-reply' || !replyKeywords.trim() || !replyAnswer.trim()}
            onClick={addReply}
          >
            <Plus size={14} /> Add reply
          </Button>
        </div>
        <textarea
          className="field mt-3 min-h-[90px] w-full resize-y text-sm"
          value={replyAnswer}
          onChange={(event) => setReplyAnswer(event.target.value)}
          placeholder="Reply text shown in the Study chat�"
        />

        <div className="mt-4 space-y-2">
          {replies.map((reply, index) => (
            <StudyReplyItem
              key={reply.id}
              reply={reply}
              index={index}
              total={replies.length}
              busy={busy}
              onMove={moveReply}
              onDelete={() => {
                if (!window.confirm('Delete this Study reply?')) return;
                void run(`delete-reply-${reply.id}`, () =>
                  api(`/chat/admin/study/replies/${reply.id}`, { method: 'DELETE' })
                );
              }}
              onSave={(keywords, answer) =>
                run(`save-reply-${reply.id}`, () =>
                  api(`/chat/admin/study/replies/${reply.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ keywords, answer })
                  })
                )
              }
            />
          ))}
          {!replies.length && (
            <p className="muted text-sm">
              No replies yet. The built-in keyword engine is used until you add one.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function StudyMessageItem({
  message,
  index,
  total,
  busy,
  onMove,
  onDelete,
  onSave
}: {
  message: StudyMessageRow;
  index: number;
  total: number;
  busy: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: () => void;
  onSave: (role: string, text: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(message.text);
  const [role, setRole] = useState(message.role);

  useEffect(() => {
    setText(message.text);
    setRole(message.role);
  }, [message.text, message.role]);

  const saving = busy === `save-${message.id}`;

  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={message.role === 'USER' ? 'accent' : 'good'}>
          {message.role === 'USER' ? 'User' : 'Assistant'}
        </Badge>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Move up"
            disabled={index === 0 || busy === 'order-messages'}
            onClick={() => onMove(index, -1)}
          >
            <ArrowUp size={14} />
          </Button>
          <Button
            aria-label="Move down"
            disabled={index === total - 1 || busy === 'order-messages'}
            onClick={() => onMove(index, 1)}
          >
            <ArrowDown size={14} />
          </Button>
          <Button
            aria-label={editing ? 'Cancel edit' : 'Edit message'}
            disabled={saving}
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? <X size={14} /> : <Pencil size={14} />}
          </Button>
          <Button
            variant="danger"
            aria-label="Delete message"
            disabled={busy === `delete-${message.id}`}
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <select
            className="field text-sm"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="ASSISTANT">Assistant message</option>
            <option value="USER">User message</option>
          </select>
          <textarea
            className="field min-h-[80px] w-full resize-y text-sm"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Button
            variant="primary"
            disabled={saving || !text.trim()}
            onClick={() => {
              void onSave(role, text.trim()).then(() => setEditing(false));
            }}
          >
            <Check size={14} /> {saving ? 'Saving�' : 'Save'}
          </Button>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-line break-words text-sm leading-6">{message.text}</p>
      )}
    </div>
  );
}

function StudyReplyItem({
  reply,
  index,
  total,
  busy,
  onMove,
  onDelete,
  onSave
}: {
  reply: StudyReplyRow;
  index: number;
  total: number;
  busy: string;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: () => void;
  onSave: (keywords: string, answer: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [keywords, setKeywords] = useState(reply.keywords);
  const [answer, setAnswer] = useState(reply.answer);

  useEffect(() => {
    setKeywords(reply.keywords);
    setAnswer(reply.answer);
  }, [reply.keywords, reply.answer]);

  const saving = busy === `save-reply-${reply.id}`;

  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {reply.keywords.split(',').map((keyword) => (
            <Badge key={keyword} tone="neutral">
              {keyword.trim()}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Move up"
            disabled={index === 0 || busy === 'order-replies'}
            onClick={() => onMove(index, -1)}
          >
            <ArrowUp size={14} />
          </Button>
          <Button
            aria-label="Move down"
            disabled={index === total - 1 || busy === 'order-replies'}
            onClick={() => onMove(index, 1)}
          >
            <ArrowDown size={14} />
          </Button>
          <Button
            aria-label={editing ? 'Cancel edit' : 'Edit reply'}
            disabled={saving}
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? <X size={14} /> : <Pencil size={14} />}
          </Button>
          <Button
            variant="danger"
            aria-label="Delete reply"
            disabled={busy === `delete-reply-${reply.id}`}
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <input
            className="field w-full text-sm"
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="keyword1, keyword2"
          />
          <textarea
            className="field min-h-[90px] w-full resize-y text-sm"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
          <Button
            variant="primary"
            disabled={saving || !keywords.trim() || !answer.trim()}
            onClick={() => {
              void onSave(keywords.trim(), answer.trim()).then(() => setEditing(false));
            }}
          >
            <Check size={14} /> {saving ? 'Saving�' : 'Save'}
          </Button>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-line break-words text-sm leading-6">{reply.answer}</p>
      )}
    </div>
  );
}
