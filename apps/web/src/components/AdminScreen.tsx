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
  ChevronDown,
  Database,
  Gamepad2,
  HardDrive,
  History,
  Inbox,
  ListChecks,
  Menu,
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
  Users,
  X
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDuo } from '@/hooks/useDuoApp';
import type {
  AdminActivity,
  AdminConversation,
  AdminStats,
  CallRecord,
  GameMessage,
  Message,
  Permission
} from '@/lib/types';
import { formatDateTime, eventLabel } from '@/lib/utils';
import { formatUploadLimitFromMb } from '@/lib/uploadLimits';
import { Badge, Button, EmptyState, Field, Modal, Panel, Toggle } from '@/components/ui';

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
  createdAt?: string;
  deletedAt?: string | null;
  chatNotifications: boolean;
  adminPushNotifications: boolean;
  adminButterflyNotifications: boolean;
  adminSoundNotifications: boolean;
};

type AdminDeletedUser = {
  id: string;
  username: string;
  displayName?: string | null;
  role: 'HOST' | 'GUEST';
  lastSeenAt?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  conversations: number;
  messages: number;
};
type NotificationFeatureState = {
  enabled: boolean;
  pushConfigured: boolean;
  updatedAt?: string | null;
  notificationTexts?: Record<string, string> | null;
  callAcceptText?: string | null;
  callRejectText?: string | null;
};
type Tab =
  | 'overview'
  | 'chat'
  | 'deleted'
  | 'users'
  | 'features'
  | 'study'
  | 'game'
  | 'permissions'
  | 'promo'
  | 'activity';

type TabMeta = {
  id: Tab;
  label: string;
  group: string;
  description: string;
  icon: React.ReactNode;
};

const tabs: TabMeta[] = [
  {
    id: 'overview',
    label: 'Overview',
    group: 'Workspace',
    description: 'A quick read on messages, calls, permissions and Host actions.',
    icon: <Activity size={16} />
  },
  {
    id: 'chat',
    label: 'Message delete',
    group: 'Moderation',
    description: 'Choose a chat, filter by date and soft delete individual messages.',
    icon: <MessageCircle size={16} />
  },
  {
    id: 'deleted',
    label: 'Recycle Bin',
    group: 'Moderation',
    description: 'Review deleted messages chat by chat, then restore or purge them.',
    icon: <RotateCcw size={16} />
  },
  {
    id: 'users',
    label: 'Users',
    group: 'Workspace',
    description: 'Manage accounts, reset passwords and recover or remove users.',
    icon: <Users size={16} />
  },
  {
    id: 'features',
    label: 'User features',
    group: 'Settings',
    description: 'Control notification availability and per-account switches.',
    icon: <Bell size={16} />
  },
  {
    id: 'study',
    label: 'Study assistance',
    group: 'Content',
    description: 'Host-managed Study Assistant messages and replies.',
    icon: <BookOpen size={16} />
  },
  {
    id: 'game',
    label: 'Game messages',
    group: 'Content',
    description: 'Messages sent from Chat to Game Chat.',
    icon: <Gamepad2 size={16} />
  },
  {
    id: 'permissions',
    label: 'Permissions',
    group: 'Workspace',
    description: 'Review consent requests, grants and revocations.',
    icon: <Shield size={16} />
  },
  {
    id: 'promo',
    label: 'Promo code',
    group: 'Settings',
    description: 'Rotate or disable the code that unlocks private Chat.',
    icon: <Ticket size={16} />
  },
  {
    id: 'activity',
    label: 'Activity & audit',
    group: 'Workspace',
    description: 'Notifications, game sessions, calls and the administrative audit trail.',
    icon: <History size={16} />
  }
];

const tabGroups = [...new Set(tabs.map((item) => item.group))];

function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  className,
  children
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-xl border border-white/10 bg-black/15 ${className || ''}`.trim()}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="muted mt-0.5 text-xs leading-5">{description}</p>}
        </div>
        <ChevronDown
          size={16}
          className={`shrink-0 text-white/60 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-white/10 p-3">{children}</div>}
    </div>
  );
}

export function AdminScreen() {
  const duo = useDuo();
  const [tab, setTab] = useState<Tab>('overview');
  const [activity, setActivity] = useState<AdminActivity | null>(null);
  const [statsData, setStatsData] = useState<AdminStats | null>(null);
  const [navOpen, setNavOpen] = useState(false);
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
  const [deleteUserTarget, setDeleteUserTarget] = useState<{
    id: string;
    username: string;
    displayName?: string | null;
    deletedAt?: string | null;
  } | null>(null);
  const [deletedUsers, setDeletedUsers] = useState<AdminDeletedUser[]>([]);
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleteFrom, setDeleteFrom] = useState('');
  const [deleteTo, setDeleteTo] = useState('');
  const [activeDeletedConversationId, setActiveDeletedConversationId] = useState('');
  const [deletedConversationFilter, setDeletedConversationFilter] = useState('');
  const [deletedFrom, setDeletedFrom] = useState('');
  const [deletedTo, setDeletedTo] = useState('');
  const [deletedSelectMode, setDeletedSelectMode] = useState(false);
  const [selectedDeletedIds, setSelectedDeletedIds] = useState<Set<string>>(new Set());

  const deleteForLabel =
    deleteFor === 'BOTH' ? 'Both members' : deleteFor === 'HOST' ? 'Host only' : 'Guest only';

  const refresh = useCallback(
    async (query: string, conversationId?: string, from?: string, to?: string) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (conversationId) params.set('conversationId', conversationId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const queryString = params.toString();
      const [
        statsResult,
        activityResult,
        messagesResult,
        deletedResult,
        usersResult,
        gameResult,
        promoResult,
        conversationsResult,
        notificationResult,
        deletedUsersResult
      ] = await Promise.allSettled([
        api<AdminStats>('/chat/admin/stats'),
        api<AdminActivity>('/chat/admin/activity'),
        api<AdminMessage[]>(`/chat/admin/messages${queryString ? `?${queryString}` : ''}`),
        api<AdminDeletedMessage[]>('/chat/admin/deleted-messages'),
        api<AdminUser[]>('/chat/admin/users'),
        api<GameMessage[]>('/chat/admin/game-messages'),
        api<any>('/chat/admin/promo/status'),
        api<AdminConversation[]>('/chat/admin/conversations'),
        api<NotificationFeatureState>('/chat/admin/notification-settings'),
        api<AdminDeletedUser[]>('/chat/admin/users/deleted')
      ]);
      if (statsResult.status === 'fulfilled') setStatsData(statsResult.value);
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
      if (deletedUsersResult.status === 'fulfilled') setDeletedUsers(deletedUsersResult.value);
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    void refresh('');
    void duo.loadPermissions();
  }, [refresh, duo.loadPermissions]);

  useEffect(() => {
    if (!navOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [navOpen]);

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
      await refresh(
        search,
        activeConversationId || undefined,
        deleteFrom || undefined,
        deleteTo || undefined
      );
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
      await refresh(
        search,
        activeConversationId || undefined,
        deleteFrom || undefined,
        deleteTo || undefined
      );
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
            deleteFor: deleteForPayload(),
            from: deleteFrom || undefined,
            to: deleteTo || undefined
          })
        }
      );
      setDeleteAllOpen(false);
      await refresh(
        search,
        activeConversationId,
        deleteFrom || undefined,
        deleteTo || undefined
      );
      duo.setNotice(
        `Soft deleted ${result.count} message${result.count === 1 ? '' : 's'} of this chat. Open the Recycle Bin to restore or permanently delete them.`
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy('');
    }
  }

  async function permanentDeleteUser(user: {
    id: string;
    username: string;
    displayName?: string | null;
  }) {
    setBusy(`delete-user-${user.id}`);
    try {
      const result = await api<{
        ok: boolean;
        deleted: { conversations: number; messages: number; gameMessages: number };
      }>(`/chat/admin/users/${user.id}`, { method: 'DELETE' });
      const deletedName = user.displayName || user.username;
      setDeleteUserTarget(null);
      setActiveConversationId('');
      await refresh(search);
      await Promise.allSettled([duo.loadContacts(), duo.loadSummary()]);
      duo.setNotice(
        `${deletedName} deleted permanently. Removed ${result.deleted.messages} chat message(s), ${result.deleted.conversations} conversation(s), and ${result.deleted.gameMessages} game message(s).`
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'User could not be deleted');
    } finally {
      setBusy('');
    }
  }

  async function deleteGuestUser() {
    if (deleteUserTarget) await permanentDeleteUser(deleteUserTarget);
  }

  async function softDeleteUser(user: { id: string; username: string; displayName?: string | null }) {
    setBusy(`soft-delete-user-${user.id}`);
    try {
      await api(`/chat/admin/users/${user.id}/soft-delete`, { method: 'POST' });
      setDeleteUserTarget(null);
      await refresh(search);
      await Promise.allSettled([duo.loadContacts(), duo.loadSummary()]);
      duo.setNotice(
        `${user.displayName || user.username} moved to the Users recycle bin. All messages are kept and can be restored.`
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'User could not be moved to the recycle bin');
    } finally {
      setBusy('');
    }
  }

  async function restoreUser(user: { id: string; username: string; displayName?: string | null }) {
    setBusy(`restore-user-${user.id}`);
    try {
      await api(`/chat/admin/users/${user.id}/restore`, { method: 'POST' });
      await refresh(search);
      await Promise.allSettled([duo.loadContacts(), duo.loadSummary()]);
      duo.setNotice(`${user.displayName || user.username} restored.`);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'User could not be restored');
    } finally {
      setBusy('');
    }
  }

  async function changeUserPassword() {
    if (!passwordTarget) return;
    if (newPassword.trim().length < 6) {
      duo.setError('Use at least 6 characters for the new password.');
      return;
    }
    setBusy(`password-${passwordTarget.id}`);
    try {
      await api(`/chat/admin/users/${passwordTarget.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: newPassword.trim() })
      });
      duo.setNotice(
        `Password changed for ${passwordTarget.displayName || passwordTarget.username}. Their sessions were signed out.`
      );
      setPasswordTarget(null);
      setNewPassword('');
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Password could not be changed');
    } finally {
      setBusy('');
    }
  }

  function toggleDeletedSelected(id: string) {
    setSelectedDeletedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectDeletedChat(conversationId: string) {
    setDeletedConversationFilter(conversationId);
    setActiveDeletedConversationId(conversationId);
    setSelectedDeletedIds(new Set());
  }

  function toggleAdminSelected(id: string) {
    setSelectedAdminIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [recoverPrompt, setRecoverPrompt] = useState<{
    ids?: string[];
    role?: 'HOST' | 'GUEST';
    conversationId?: string;
    from?: string;
    to?: string;
    label: string;
  } | null>(null);

  async function recoverDeleted(
    ids: string[] | undefined,
    role: 'HOST' | 'GUEST' | undefined,
    recoverFor: Array<'HOST' | 'GUEST'>,
    filters?: { conversationId?: string; from?: string; to?: string }
  ) {
    setBusy('recover');
    try {
      await api('/chat/admin/deleted-messages/recover', {
        method: 'POST',
        body: JSON.stringify({ ids, role, recoverFor, ...filters })
      });
      setRecoverPrompt(null);
      setSelectedDeletedIds(new Set());
      setDeletedSelectMode(false);
      await refresh(
        search,
        activeConversationId || undefined,
        deleteFrom || undefined,
        deleteTo || undefined
      );
      duo.setNotice(
        `Recovered for ${recoverFor.length === 2 ? 'Host and Guest' : recoverFor[0] === 'HOST' ? 'Host' : 'Guest'}.`
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Recovery failed');
    } finally {
      setBusy('');
    }
  }

  async function purgeDeleted(
    ids?: string[],
    role?: 'HOST' | 'GUEST',
    filters?: { conversationId?: string; from?: string; to?: string }
  ) {
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
        body: JSON.stringify({ ids, role, ...filters })
      });
      setSelectedDeletedIds(new Set());
      setDeletedSelectMode(false);
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

  async function saveNotificationTexts(copies: Record<string, string>) {
    const textDefaults: Record<string, string> = {
      NEW_MESSAGE: 'Best deal $10',
      GAME_MESSAGE: 'Pay only $5',
      CALL_INCOMING: 'Best coming deal $50'
    };
    const payload: Record<string, unknown> = {};
    const textCopies = Object.entries(copies).filter(([key]) => key in textDefaults);
    if (textCopies.length) {
      // The server replaces the whole object, so keep every other saved copy.
      payload.notificationTexts = {
        ...textDefaults,
        ...(notificationSettings?.notificationTexts ?? {}),
        ...Object.fromEntries(textCopies)
      };
    }
    for (const [key, value] of Object.entries(copies)) {
      if (key === 'callAcceptText' || key === 'callRejectText') payload[key] = value;
    }
    try {
      const state = await api<NotificationFeatureState>('/chat/admin/notification-settings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setNotificationSettings(state);
      duo.setNotice('Notification copy updated.');
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Notification copy could not be saved');
    }
  }

  /** Role and date filters apply to every chat before a chat is picked. */
  const deletedByFilters = useMemo(() => {
    const fromTime = deletedFrom ? Date.parse(`${deletedFrom}T00:00:00`) : null;
    const toTime = deletedTo ? Date.parse(`${deletedTo}T23:59:59.999`) : null;
    return deletedMessages.filter((message) => {
      if (fromTime !== null || toTime !== null) {
        const time = Date.parse(message.createdAt);
        if (fromTime !== null && time < fromTime) return false;
        if (toTime !== null && time > toTime) return false;
      }
      if (!deletedRole) return true;
      return (
        message.sender?.role === deletedRole ||
        Boolean(message.hides?.some((hide) => hide.user?.role === deletedRole))
      );
    });
  }, [deletedMessages, deletedFrom, deletedRole, deletedTo]);

  const visibleDeleted = useMemo(() => {
    if (!deletedConversationFilter) return deletedByFilters;
    return deletedByFilters.filter(
      (message) => message.conversation?.id === deletedConversationFilter
    );
  }, [deletedByFilters, deletedConversationFilter]);

  /** Recycle Bin entries grouped chat-wise so restore/purge can act per conversation. */
  const deletedGroups = useMemo(() => {
    const groups = new Map<string, AdminDeletedMessage[]>();
    for (const message of deletedByFilters) {
      const key = message.conversation?.id || `orphan-${message.id}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(message);
      else groups.set(key, [message]);
    }
    return Array.from(groups.entries()).map(([conversationId, messages]) => ({
      conversationId,
      messages
    }));
  }, [deletedByFilters]);

  const conversationTitle = useCallback(
    (conversationId: string) => {
      const found = conversations.find((conversation) => conversation.id === conversationId);
      if (!found) return `Chat ${conversationId.slice(0, 8)}`;
      return `${found.hostName} ↔ ${found.guestName}`;
    },
    [conversations]
  );

  // If a selected chat is emptied by a filter or an action, return to All chats.
  useEffect(() => {
    if (
      activeDeletedConversationId &&
      !deletedGroups.some((group) => group.conversationId === activeDeletedConversationId)
    ) {
      setActiveDeletedConversationId('');
      setDeletedConversationFilter('');
    }
  }, [activeDeletedConversationId, deletedGroups]);

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

  const activeTab = tabs.find((item) => item.id === tab) || tabs[0];
  const activeDeletedGroup = deletedGroups.find(
    (group) => group.conversationId === activeDeletedConversationId
  );
  const threadMessages = [...(activeDeletedGroup?.messages ?? visibleDeleted)].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
  );

  return (
    <div className="admin-shell">
      <button
        type="button"
        className="admin-mobile-nav-trigger"
        onClick={() => setNavOpen(true)}
        aria-expanded={navOpen}
        aria-controls="admin-section-nav"
      >
        <Menu size={17} />
        <span>Admin sections</span>
        <span className="muted ml-auto text-xs">{activeTab.label}</span>
      </button>

      <button
        type="button"
        className={`admin-nav-backdrop ${navOpen ? 'is-visible' : ''}`}
        onClick={() => setNavOpen(false)}
        aria-label="Close admin navigation"
        tabIndex={navOpen ? 0 : -1}
      />

      <aside
        id="admin-section-nav"
        className={`admin-sidebar ${navOpen ? 'is-open' : ''}`}
        aria-label="Admin sections"
      >
        <div className="admin-sidebar-brand">
          <span className="admin-sidebar-mark">
            <Shield size={17} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Admin console</span>
            <span className="muted block text-[11px]">Host · private workspace</span>
          </span>
          <button
            type="button"
            className="admin-sidebar-close"
            onClick={() => setNavOpen(false)}
            aria-label="Close admin navigation"
          >
            <X size={17} />
          </button>
        </div>
        {tabGroups.map((group) => (
          <div key={group} className="admin-nav-group">
            <p className="admin-nav-group-label">{group}</p>
            {tabs
              .filter((item) => item.group === group)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-nav-item ${tab === item.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setTab(item.id);
                    setNavOpen(false);
                  }}
                  aria-current={tab === item.id ? 'page' : undefined}
                >
                  <span className="admin-nav-icon">{item.icon}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{item.label}</span>
                    <span className="admin-nav-description">{item.description}</span>
                  </span>
                </button>
              ))}
          </div>
        ))}
      </aside>

      <main className="admin-main">
        <header className="admin-main-header">
          <div className="min-w-0">
            <p className="eyebrow">Host only · {activeTab.group}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{activeTab.label}</h1>
            <p className="muted mt-1 text-sm leading-6">{activeTab.description}</p>
          </div>
          <Button
            onClick={() =>
              void refresh(
                search,
                tab === 'chat' ? activeConversationId || undefined : undefined,
                tab === 'chat' ? deleteFrom || undefined : undefined,
                tab === 'chat' ? deleteTo || undefined : undefined
              )
            }
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </header>

      {tab === 'overview' && (
        <div className="admin-overview">
          <section className="admin-overview-primary" aria-label="Workspace health">
            <div className="admin-overview-title">
              <div className="min-w-0">
                <p className="eyebrow">At a glance</p>
                <h2 className="mt-1 text-base font-semibold tracking-tight">Workspace health</h2>
              </div>
              <Badge tone={statsData ? 'good' : 'warn'}>
                {statsData ? 'Live database snapshot' : 'Loading snapshot'}
              </Badge>
            </div>
            <div className="admin-kpi-grid">
              <StatCard
                label="Active chat messages"
                value={formatCount(statsData?.activeChatMessages)}
                detail={`${formatCount(statsData?.chatMessages)} total · ${formatCount(
                  statsData?.recycledChatMessages
                )} recycled`}
                icon={<MessageCircle size={15} />}
                tone="accent"
              />
              <StatCard
                label="Recycle Bin"
                value={formatCount(statsData?.recycledChatMessages)}
                detail={`${formatCount(statsData?.hiddenChatMessages)} hidden copies`}
                icon={<RotateCcw size={15} />}
                tone="warn"
              />
              <StatCard
                label="Active users"
                value={formatCount(statsData?.users)}
                detail={`${formatCount(statsData?.deletedUsers)} in user recycle bin`}
                icon={<Users size={15} />}
              />
              <StatCard
                label="Conversations"
                value={formatCount(statsData?.conversations)}
                detail="Excludes removed chats"
                icon={<Database size={15} />}
              />
            </div>
          </section>

          <Panel className="admin-overview-panel">
            <div className="admin-panel-heading">
              <div className="min-w-0">
                <p className="eyebrow">Workspace</p>
                <h3 className="mt-1 text-sm font-semibold">Quick actions</h3>
              </div>
              <span className="muted text-xs">All sections remain in the sidebar.</span>
            </div>
            <div className="admin-quick-grid mt-3">
              <button type="button" onClick={() => setTab('chat')}>
                <MessageCircle size={16} />
                <span>
                  <strong>Delete messages</strong>
                  <small>Filter a chat by date and remove selected copies.</small>
                </span>
              </button>
              <button type="button" onClick={() => setTab('deleted')}>
                <Inbox size={16} />
                <span>
                  <strong>Review Recycle Bin</strong>
                  <small>Restore or purge deleted messages chat by chat.</small>
                </span>
              </button>
              <button type="button" onClick={() => setTab('users')}>
                <Users size={16} />
                <span>
                  <strong>Manage users</strong>
                  <small>Reset passwords, recover or remove accounts.</small>
                </span>
              </button>
              <button type="button" onClick={() => setTab('activity')}>
                <HardDrive size={16} />
                <span>
                  <strong>Audit activity</strong>
                  <small>Check notifications, sessions, calls and admin logs.</small>
                </span>
              </button>
            </div>
            <div className="admin-metric-strip mt-3">
              <Row label="Game messages" value={formatCount(statsData?.gameMessages)} />
              <Row
                label="Calls logged"
                value={`${formatCount(statsData?.calls)} · ${formatCount(
                  statsData?.activeCalls
                )} active`}
              />
              <Row
                label="Permissions"
                value={`${formatCount(statsData?.grantedPermissions)} · ${formatCount(
                  statsData?.pendingPermissions
                )} pending`}
              />
              <Row
                label="Notifications"
                value={`${formatCount(statsData?.notifications)} · ${formatCount(
                  statsData?.unreadNotifications
                )} unread`}
              />
              <Row
                label="Hidden copies"
                value={formatCount(statsData?.hiddenChatMessages)}
              />
              <Row label="User recycle bin" value={formatCount(statsData?.deletedUsers)} />
              <Row label="Media files" value={formatCount(statsData?.mediaFiles)} />
              <Row label="Media storage" value={formatStorage(statsData?.mediaBytes)} />
              <Row
                label="Upload limit"
                value={
                  typeof statsData?.uploadLimitMb === 'number'
                    ? formatUploadLimitFromMb(statsData.uploadLimitMb)
                    : 'Waiting for server'
                }
              />
              <Row
                label="Snapshot"
                value={
                  statsData?.generatedAt
                    ? formatDateTime(statsData.generatedAt)
                    : 'Waiting for server'
                }
              />
            </div>
          </Panel>

          <div className="admin-collapsible-grid">
            <CollapsibleSection
              title="Participants & call"
              description={`${duo.user?.username || 'host'} · ${duo.callState} · mic ${
                duo.micOn ? 'on' : 'muted'
              }`}
              defaultOpen={false}
            >
              <div className="space-y-2 text-sm">
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
            </CollapsibleSection>

            <CollapsibleSection
              title="Microphone management"
              description={hostMicGrant ? 'Guest mic control granted' : 'Guest consent required'}
              defaultOpen={false}
            >
              <p className="muted text-xs leading-5">
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
              <div className="mt-3 flex flex-wrap gap-2">
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
            </CollapsibleSection>
          </div>

          <Panel className="admin-overview-panel admin-overview-danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">Destructive authority</p>
                <h3 className="mt-1 text-sm font-semibold">Conversation history</h3>
                <p className="muted mt-1 text-xs leading-5">
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
          <div className="admin-toolbar">
            <label className="admin-field">
              <span className="admin-field-label">Chat</span>
              <select
                className="field"
                value={activeConversationId}
                onChange={(event) => {
                  const conversationId = event.target.value;
                  setActiveConversationId(conversationId);
                  setSelectedAdminIds(new Set());
                  setAdminSelectMode(false);
                  void refresh(
                    search,
                    conversationId || undefined,
                    deleteFrom || undefined,
                    deleteTo || undefined
                  );
                }}
              >
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.hostName} ↔ {conversation.guestName}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-field-label">Search messages</span>
              <input
                className="field"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void refresh(
                      search,
                      activeConversationId || undefined,
                      deleteFrom || undefined,
                      deleteTo || undefined
                    );
                  }
                }}
                placeholder="Type text and press Enter"
              />
            </label>
            <label className="admin-field max-w-[11rem]">
              <span className="admin-field-label">From date</span>
              <input
                type="date"
                className="field"
                value={deleteFrom}
                max={deleteTo || undefined}
                onChange={(event) => {
                  const from = event.target.value;
                  setDeleteFrom(from);
                  setSelectedAdminIds(new Set());
                  void refresh(
                    search,
                    activeConversationId || undefined,
                    from || undefined,
                    deleteTo || undefined
                  );
                }}
              />
            </label>
            <label className="admin-field max-w-[11rem]">
              <span className="admin-field-label">To date</span>
              <input
                type="date"
                className="field"
                value={deleteTo}
                min={deleteFrom || undefined}
                onChange={(event) => {
                  const to = event.target.value;
                  setDeleteTo(to);
                  setSelectedAdminIds(new Set());
                  void refresh(
                    search,
                    activeConversationId || undefined,
                    deleteFrom || undefined,
                    to || undefined
                  );
                }}
              />
            </label>
            <Button
              variant="primary"
              className="!px-3"
              aria-label="Search messages"
              onClick={() =>
                void refresh(
                  search,
                  activeConversationId || undefined,
                  deleteFrom || undefined,
                  deleteTo || undefined
                )
              }
            >
              <Search size={15} />
            </Button>
            <Button
              variant="danger"
              onClick={() => setDeleteAllOpen(true)}
              disabled={!activeConversationId || busy === 'admin-delete-all'}
            >
              <Trash2 size={15} /> Delete all in chat
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
          <p className="muted mt-2 text-[11px] leading-5">
            Dates filter both the thread and “Delete all in chat”. Leave them empty to work with the
            whole conversation.
          </p>

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
          <div className="admin-toolbar">
            <label className="admin-field">
              <span className="admin-field-label">User</span>
              <select
                className="field"
                value={deletedRole}
                onChange={(event) => {
                  setDeletedRole(event.target.value as '' | 'HOST' | 'GUEST');
                  setSelectedDeletedIds(new Set());
                }}
              >
                <option value="">All users</option>
                <option value="HOST">Host</option>
                <option value="GUEST">User</option>
              </select>
            </label>
            <label className="admin-field max-w-[11rem]">
              <span className="admin-field-label">From date</span>
              <input
                type="date"
                className="field"
                value={deletedFrom}
                max={deletedTo || undefined}
                onChange={(event) => {
                  setDeletedFrom(event.target.value);
                  setSelectedDeletedIds(new Set());
                }}
              />
            </label>
            <label className="admin-field max-w-[11rem]">
              <span className="admin-field-label">To date</span>
              <input
                type="date"
                className="field"
                value={deletedTo}
                min={deletedFrom || undefined}
                onChange={(event) => {
                  setDeletedTo(event.target.value);
                  setSelectedDeletedIds(new Set());
                }}
              />
            </label>
            <Button
              variant="primary"
              onClick={() =>
                setRecoverPrompt({
                  role: deletedRole || undefined,
                  conversationId: deletedConversationFilter || undefined,
                  from: deletedFrom || undefined,
                  to: deletedTo || undefined,
                  label: deletedConversationFilter
                    ? `messages in ${conversationTitle(deletedConversationFilter)}`
                    : deletedRole
                      ? `${deletedRole.toLowerCase()} messages`
                      : 'all deleted messages'
                })
              }
              disabled={busy === 'recover' || visibleDeleted.length === 0}
            >
              <RotateCcw size={14} /> Recover filtered
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                void purgeDeleted(undefined, deletedRole || undefined, {
                  conversationId: deletedConversationFilter || undefined,
                  from: deletedFrom || undefined,
                  to: deletedTo || undefined
                })
              }
              disabled={busy === 'purge' || visibleDeleted.length === 0}
            >
              <Trash2 size={14} /> Delete filtered forever
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant={deletedSelectMode ? 'primary' : 'ghost'}
              onClick={() => {
                setDeletedSelectMode((value) => !value);
                setSelectedDeletedIds(new Set());
              }}
            >
              <ListChecks size={15} />
              {deletedSelectMode ? 'Done selecting' : 'Select messages'}
            </Button>
            {deletedSelectMode && (
              <>
                <Button
                  disabled={!threadMessages.length}
                  onClick={() =>
                    setSelectedDeletedIds(
                      selectedDeletedIds.size === threadMessages.length
                        ? new Set()
                        : new Set(threadMessages.map((message) => message.id))
                    )
                  }
                >
                  {selectedDeletedIds.size === threadMessages.length && threadMessages.length > 0
                    ? 'Clear all'
                    : 'Select all'}
                </Button>
                <span className="muted text-xs">{selectedDeletedIds.size} selected</span>
                <Button
                  variant="primary"
                  disabled={!selectedDeletedIds.size || busy === 'recover'}
                  onClick={() =>
                    setRecoverPrompt({
                      ids: [...selectedDeletedIds],
                      label: `${selectedDeletedIds.size} selected message(s)`
                    })
                  }
                >
                  <RotateCcw size={14} /> Recover selected
                </Button>
                <Button
                  variant="danger"
                  disabled={!selectedDeletedIds.size || busy === 'purge'}
                  onClick={() => void purgeDeleted([...selectedDeletedIds])}
                >
                  <Trash2 size={14} /> Delete selected
                </Button>
              </>
            )}
            <span className="muted text-xs">
              Pick a chat on the left. Restore asks which side gets the messages back.
            </span>
          </div>

          <div className="admin-chat-workspace mt-4">
            <aside className="admin-chat-sidebar" aria-label="Deleted chats">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                  Chats
                </p>
                <Badge tone={deletedGroups.length ? 'accent' : 'neutral'}>
                  {deletedGroups.length}
                </Badge>
              </div>
              <button
                type="button"
                className={`admin-chat-pick ${!activeDeletedConversationId ? 'is-active' : ''}`}
                onClick={() => selectDeletedChat('')}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-white/70">
                  <MessageCircle size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">All chats</span>
                  <span className="muted block text-[11px]">
                    {deletedByFilters.length} deleted message
                    {deletedByFilters.length === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
              <div className="admin-chat-list">
                {deletedGroups.map((group) => {
                  const preview = group.messages.reduce((newest, message) =>
                    Date.parse(message.createdAt) > Date.parse(newest.createdAt) ? message : newest
                  );
                  const previewName =
                    preview.sender?.displayName || preview.sender?.username || preview.senderId;
                  return (
                    <button
                      key={group.conversationId}
                      type="button"
                      className={`admin-chat-pick ${
                        activeDeletedConversationId === group.conversationId ? 'is-active' : ''
                      }`}
                      onClick={() => selectDeletedChat(group.conversationId)}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fuchsia-500/15 text-[11px] font-semibold uppercase text-fuchsia-100">
                        {conversationTitle(group.conversationId).slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {conversationTitle(group.conversationId)}
                        </span>
                        <span className="muted block truncate text-[11px]">
                          {previewName}: {preview.content || 'Attachment'}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60">
                        {group.messages.length}
                      </span>
                    </button>
                  );
                })}
                {!deletedGroups.length && (
                  <p className="muted px-2 py-6 text-center text-xs">No chats in the Recycle Bin.</p>
                )}
              </div>
            </aside>

            <section className="admin-chat-thread" aria-label="Deleted messages">
              <header className="admin-chat-thread-head">
                <div className="min-w-0">
                  <p className="eyebrow">Deleted thread</p>
                  <h3 className="mt-0.5 truncate text-base font-semibold">
                    {activeDeletedGroup
                      ? conversationTitle(activeDeletedGroup.conversationId)
                      : 'All deleted chats'}
                  </h3>
                  <p className="muted mt-0.5 text-[11px]">
                    {threadMessages.length} message{threadMessages.length === 1 ? '' : 's'} ·{' '}
                    {visibleDeleted.length} in filter
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeDeletedGroup && (
                    <>
                      <Button
                        className="!px-2.5 !py-1.5 text-xs"
                        onClick={() =>
                          setRecoverPrompt({
                            ids: activeDeletedGroup.messages.map((message) => message.id),
                            label: `all messages in ${conversationTitle(
                              activeDeletedGroup.conversationId
                            )}`
                          })
                        }
                        disabled={busy === 'recover'}
                      >
                        <RotateCcw size={13} /> Recover all
                      </Button>
                      <Button
                        variant="danger"
                        className="!px-2.5 !py-1.5 text-xs"
                        onClick={() =>
                          void purgeDeleted(
                            activeDeletedGroup.messages.map((message) => message.id)
                          )
                        }
                        disabled={busy === 'purge'}
                      >
                        <Trash2 size={13} /> Delete forever
                      </Button>
                    </>
                  )}
                </div>
              </header>

              <div className="admin-chat-thread-body">
                {threadMessages.map((message) => {
                  const isHost = message.sender?.role === 'HOST';
                  const senderName =
                    message.sender?.displayName || message.sender?.username || message.senderId;
                  const hiddenNames =
                    message.hides
                      ?.map((hide) => hide.user?.username || 'account')
                      .join(', ') || '';
                  return (
                    <div
                      key={message.id}
                      className={`admin-deleted-row ${isHost ? 'is-host' : ''}`}
                    >
                      {!isHost && (
                        <span className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-[10px] font-semibold uppercase text-white/70">
                          {senderName.slice(0, 2)}
                        </span>
                      )}
                      {deletedSelectMode && (
                        <input
                          type="checkbox"
                          checked={selectedDeletedIds.has(message.id)}
                          onChange={() => toggleDeletedSelected(message.id)}
                          className="mb-6 h-4 w-4 shrink-0 accent-fuchsia-400"
                          aria-label={`Select deleted message from ${senderName}`}
                        />
                      )}
                      <div
                        className={[
                          'admin-deleted-bubble relative w-fit min-w-0 max-w-full rounded-2xl border px-3.5 py-2.5 shadow-lg',
                          isHost
                            ? 'rounded-br-md border-amber-300/20 bg-gradient-to-br from-amber-700/80 to-orange-900/80 text-white'
                            : 'rounded-bl-md border-white/10 bg-[#241f31] text-white/90',
                          deletedSelectMode && selectedDeletedIds.has(message.id)
                            ? 'ring-2 ring-fuchsia-400 ring-offset-2 ring-offset-black/40'
                            : ''
                        ].join(' ')}
                      >
                        <div
                          className={`admin-deleted-meta flex min-w-0 flex-wrap items-center gap-2 text-[11px] ${
                            isHost ? 'justify-end' : ''
                          }`}
                        >
                          <span className="admin-deleted-name font-semibold text-white/90">
                            {senderName}
                          </span>
                          <Badge tone={isHost ? 'warn' : 'neutral'}>
                            {isHost ? 'Host' : 'User'}
                          </Badge>
                          <span className="shrink-0 text-white/50">
                            {formatDateTime(message.createdAt)}
                          </span>
                        </div>
                        <p className="admin-deleted-text text-sm leading-6">
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
                          className={`admin-deleted-actions mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-white/55 ${
                            isHost ? 'justify-end' : ''
                          }`}
                        >
                          {message.hides?.length ? (
                            <span
                              className="admin-deleted-hidden text-amber-200/70"
                              title={hiddenNames}
                            >
                              hidden for {hiddenNames}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-emerald-200 transition hover:bg-emerald-500/25 hover:text-emerald-100"
                            onClick={() =>
                              setRecoverPrompt({ ids: [message.id], label: 'this message' })
                            }
                            disabled={busy === 'recover'}
                          >
                            <RotateCcw size={11} /> Recover
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-rose-200 transition hover:bg-rose-500/25 hover:text-rose-100"
                            onClick={() => void purgeDeleted([message.id])}
                            disabled={busy === 'purge'}
                            aria-label="Delete message forever"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      {isHost && (
                        <span className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-400/20 text-[10px] font-semibold uppercase text-amber-100">
                          {senderName.slice(0, 2)}
                        </span>
                      )}
                    </div>
                  );
                })}
                {!threadMessages.length && (
                  <EmptyState
                    icon={<RotateCcw size={24} />}
                    title="No deleted messages"
                    description="Messages deleted by either side will appear here. Try another chat or clear the filters."
                  />
                )}
              </div>
            </section>
          </div>
        </Panel>
      )}

      {tab === 'users' && (
        <div className="grid gap-4">
          <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="muted max-w-2xl text-xs leading-5">
                Manage account passwords and remove users. Deleting a user asks for confirmation
                and lets you choose the Users recycle bin or permanent deletion.
              </p>
              <Badge tone="neutral">
                {adminUsers.filter((user) => !user.deletedAt).length} active
              </Badge>
            </div>

            <div className="mt-4 space-y-2">
              {adminUsers
                .filter((user) => !user.deletedAt)
                .sort((a, b) => (a.role === b.role ? 0 : a.role === 'HOST' ? -1 : 1))
                .map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/15 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="chat-avatar chat-avatar-sm">
                        {(user.displayName || user.username).charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {user.displayName || user.username}
                          {user.id === duo.user?.id ? ' (you)' : ''}
                        </p>
                        <p className="muted text-[11px]">
                          @{user.username} · {user.role === 'HOST' ? 'Host / Admin' : 'Guest'}
                          {user.lastSeenAt ? ` · ${formatDateTime(user.lastSeenAt)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setPasswordTarget(user);
                          setNewPassword('');
                        }}
                      >
                        <Pencil size={14} /> Change password
                      </Button>
                      {user.role === 'GUEST' && (
                        <Button variant="danger" onClick={() => setDeleteUserTarget(user)}>
                          <Trash2 size={14} /> Delete user
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              {!adminUsers.filter((user) => !user.deletedAt).length && (
                <p className="muted text-sm">No active accounts found.</p>
              )}
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Users recycle bin</p>
                <h3 className="mt-1 text-lg font-semibold">Deleted users</h3>
                <p className="muted mt-1 max-w-2xl text-xs leading-5">
                  Soft-deleted accounts cannot log in and are hidden from contacts. Their chats and
                  messages stay in the database until you restore them or delete forever.
                </p>
              </div>
              <Badge tone={deletedUsers.length ? 'warn' : 'neutral'}>
                {deletedUsers.length} deleted
              </Badge>
            </div>

            <div className="mt-4 space-y-2">
              {deletedUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/15 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="chat-avatar chat-avatar-sm opacity-60">
                      {(user.displayName || user.username).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {user.displayName || user.username}
                      </p>
                      <p className="muted text-[11px]">
                        @{user.username} · deleted {user.deletedAt ? formatDateTime(user.deletedAt) : 'recently'}
                        {' · '}
                        {user.conversations} chat(s), {user.messages} message(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => void restoreUser(user)}
                      disabled={busy === `restore-user-${user.id}`}
                    >
                      <ArchiveRestore size={14} /> Restore
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setDeleteUserTarget(user)}
                      disabled={busy === `delete-user-${user.id}`}
                    >
                      <Trash2 size={14} /> Delete forever
                    </Button>
                  </div>
                </div>
              ))}
              {!deletedUsers.length && (
                <p className="muted text-sm">No deleted users. Accounts you move to the recycle bin appear here.</p>
              )}
            </div>
          </Panel>
        </div>
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

            <div className="mt-4">
              <CollapsibleSection
                title="Notification copy"
                description="Edit push notification texts and incoming call button labels."
                defaultOpen={false}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field
                    label="NEW_MESSAGE text"
                    defaultValue={notificationSettings?.notificationTexts?.NEW_MESSAGE ?? 'Best deal $10'}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      void saveNotificationTexts({ NEW_MESSAGE: value });
                    }}
                  />
                  <Field
                    label="GAME_MESSAGE text"
                    defaultValue={notificationSettings?.notificationTexts?.GAME_MESSAGE ?? 'Pay only $5'}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      void saveNotificationTexts({ GAME_MESSAGE: value });
                    }}
                  />
                  <Field
                    label="CALL_INCOMING text"
                    defaultValue={
                      notificationSettings?.notificationTexts?.CALL_INCOMING ??
                      'Best coming deal $50'
                    }
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      void saveNotificationTexts({ CALL_INCOMING: value });
                    }}
                  />
                  <Field
                    label="Call accept button text"
                    defaultValue={notificationSettings?.callAcceptText ?? 'Pay'}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      void saveNotificationTexts({ callAcceptText: value });
                    }}
                  />
                  <Field
                    label="Call reject button text"
                    defaultValue={notificationSettings?.callRejectText ?? 'Reject'}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      void saveNotificationTexts({ callRejectText: value });
                    }}
                  />
                </div>
              </CollapsibleSection>
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
            <div className="mt-4">
              <CollapsibleSection
                title="Per-user notification settings"
                description="Collapse to hide the per-account switches."
                defaultOpen
                className="bg-black/10"
              >
              <div className="space-y-2">
              {[...adminUsers]
                .filter((user) => !user.deletedAt)
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
              {!adminUsers.some((user) => !user.deletedAt) && (
                <p className="muted text-sm">No accounts found.</p>
              )}
              </div>
              </CollapsibleSection>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'study' && <StudyAdminPanel />}

      {tab === 'game' && (
        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-end gap-3">
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
          <div className="grid gap-3 md:grid-cols-2">
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
            <CollapsibleSection
              title="Activity feed"
              description="Recent notifications and read state."
              defaultOpen
              className="bg-black/10"
            >
              <div className="max-h-96 space-y-2 overflow-auto">
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
            </CollapsibleSection>

            <CollapsibleSection
              title="Game sessions"
              description="Recent game activity and scores."
              defaultOpen={false}
              className="bg-black/10"
            >
              <div className="max-h-96 space-y-2 overflow-auto">
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
            </CollapsibleSection>

            <CollapsibleSection
              title="Call history"
              description="Recent calls and participants."
              defaultOpen={false}
              className="bg-black/10"
            >
              <div className="max-h-96 space-y-2 overflow-auto">
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
            </CollapsibleSection>

            <CollapsibleSection
              title="Administrative actions"
              description="Audit log of admin actions."
              defaultOpen={false}
              className="bg-black/10"
            >
              <div className="max-h-96 space-y-2 overflow-auto">
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
            </CollapsibleSection>
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
          Every message in the selected date range will be soft deleted for{' '}
          <strong>{deleteForLabel}</strong> and moved to the Recycle Bin. Use the date fields in the
          toolbar to narrow the range.
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

      <Modal
        open={recoverPrompt !== null}
        title="Recover messages"
        onClose={() => setRecoverPrompt(null)}
      >
        <p className="muted text-sm leading-6">
          Recover <strong>{recoverPrompt?.label}</strong>. Choose which side should get the messages
          back. If that conversation is missing or archived, it will be reactivated.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button onClick={() => setRecoverPrompt(null)}>Cancel</Button>
          <Button
            onClick={() =>
              recoverPrompt &&
              void recoverDeleted(recoverPrompt.ids, recoverPrompt.role, ['HOST'], {
                conversationId: recoverPrompt.conversationId,
                from: recoverPrompt.from,
                to: recoverPrompt.to
              })
            }
            disabled={busy === 'recover'}
          >
            Host side
          </Button>
          <Button
            onClick={() =>
              recoverPrompt &&
              void recoverDeleted(recoverPrompt.ids, recoverPrompt.role, ['GUEST'], {
                conversationId: recoverPrompt.conversationId,
                from: recoverPrompt.from,
                to: recoverPrompt.to
              })
            }
            disabled={busy === 'recover'}
          >
            Guest side
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              recoverPrompt &&
              void recoverDeleted(recoverPrompt.ids, recoverPrompt.role, ['HOST', 'GUEST'], {
                conversationId: recoverPrompt.conversationId,
                from: recoverPrompt.from,
                to: recoverPrompt.to
              })
            }
            disabled={busy === 'recover'}
          >
            Both sides
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteUserTarget !== null}
        title={deleteUserTarget?.deletedAt ? 'Delete user forever?' : 'Delete user?'}
        onClose={() => setDeleteUserTarget(null)}
      >
        <p className="muted text-sm leading-6">
          {deleteUserTarget?.deletedAt ? (
            <>
              Permanently delete{' '}
              <strong>
                {deleteUserTarget?.displayName || deleteUserTarget?.username || 'this user'}
              </strong>
              ? This removes the account and all chat messages, conversations, and game messages
              from the database. This cannot be undone.
            </>
          ) : (
            <>
              Choose what to do with{' '}
              <strong>
                {deleteUserTarget?.displayName || deleteUserTarget?.username || 'this user'}
              </strong>
              . Moving to the Users recycle bin keeps all messages and lets you restore the account
              later.
            </>
          )}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button onClick={() => setDeleteUserTarget(null)}>Cancel</Button>
          {!deleteUserTarget?.deletedAt && (
            <Button
              onClick={() => {
                if (deleteUserTarget) void softDeleteUser(deleteUserTarget as AdminUser);
              }}
              disabled={!deleteUserTarget || busy === `soft-delete-user-${deleteUserTarget?.id}`}
            >
              {deleteUserTarget && busy === `soft-delete-user-${deleteUserTarget.id}`
                ? 'Moving…'
                : 'Move to recycle bin'}
            </Button>
          )}
          <Button
            variant="danger"
            onClick={() => void deleteGuestUser()}
            disabled={!deleteUserTarget || busy === `delete-user-${deleteUserTarget?.id}`}
          >
            {deleteUserTarget && busy === `delete-user-${deleteUserTarget.id}`
              ? 'Deleting…'
              : 'Delete permanently'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={passwordTarget !== null}
        title="Change password"
        onClose={() => {
          setPasswordTarget(null);
          setNewPassword('');
        }}
      >
        <p className="muted text-sm leading-6">
          Set a new password for{' '}
          <strong>{passwordTarget?.displayName || passwordTarget?.username || 'this user'}</strong>.
          Their active sessions will be signed out.
        </p>
        <Field
          label="New password"
          className="mt-4"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="At least 6 characters"
          autoComplete="new-password"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button
            onClick={() => {
              setPasswordTarget(null);
              setNewPassword('');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void changeUserPassword()}
            disabled={!passwordTarget || busy === `password-${passwordTarget?.id}`}
          >
            {passwordTarget && busy === `password-${passwordTarget.id}`
              ? 'Changing…'
              : 'Change password'}
          </Button>
        </div>
      </Modal>
      </main>
    </div>
  );
}

function formatCount(value?: number) {
  return typeof value === 'number' ? new Intl.NumberFormat().format(value) : '—';
}

function formatStorage(bytes?: number) {
  if (typeof bytes !== 'number') return '—';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function StatCard({
  label,
  value,
  detail,
  icon,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'warn';
}) {
  return (
    <div className={`admin-stat-card admin-stat-${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="admin-stat-label min-w-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
          {label}
        </p>
        {icon && <span className="admin-stat-icon">{icon}</span>}
      </div>
      <p className="admin-stat-value mt-1.5 text-xl font-semibold tracking-tight text-white">
        {value}
      </p>
      {detail && (
        <p className="admin-stat-detail muted mt-0.5 truncate text-[10px] leading-4">{detail}</p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-black/15 px-3 py-2">
      <span className="muted min-w-0 truncate text-xs">{label}</span>
      <span className="min-w-0 truncate text-sm" title={value}>
        {value}
      </span>
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
