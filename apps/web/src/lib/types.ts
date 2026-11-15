export type Role = 'HOST' | 'GUEST';

export type User = {
  id: string;
  username: string;
  displayName?: string | null;
  role: Role;
  chatUnlocked: boolean;
  lastSeenAt?: string | null;
};

export type Contact = {
  id: string;
  username: string;
  displayName?: string | null;
  role: Role;
  online: boolean;
  lastSeenAt?: string | null;
  unread: number;
  lastMessageAt?: string | null;
};

export type Screen =
  | 'HOME'
  | 'CHAT'
  | 'STUDY'
  | 'GAMES'
  | 'GAME'
  | 'INBOX'
  | 'PROMO'
  | 'RESTORE'
  | 'SETTINGS'
  | 'ADMIN';

export type MessageDestination = 'CHAT' | 'GAME';

export type AudioOutput = 'EARPIECE' | 'SPEAKER';

export type Message = {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  readAt?: string | null;
  deliveredAt?: string | null;
  destination: MessageDestination;
  attachmentId?: string | null;
  attachmentKind?: string | null;
  attachmentMime?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  sender?: { username: string; role: Role; displayName?: string | null };
};

export type GameMessage = Message;

export type Notification = {
  id: string;
  eventType: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  readAt?: string | null;
  actor?: { username: string; role: Role } | null;
};

export type PermissionStatus = 'REQUESTED' | 'GRANTED' | 'REJECTED' | 'REVOKED';

export type Permission = {
  id: string;
  name: string;
  description: string;
  status: PermissionStatus;
  requestedBy: string;
  grantedBy?: string | null;
  createdAt: string;
  grantedAt?: string | null;
  rejectedAt?: string | null;
  revokedAt?: string | null;
  requester?: { username: string; role: Role };
  grantor?: { username: string; role: Role } | null;
};

export type Preferences = {
  butterfly: boolean;
  sound: boolean;
  browser: boolean;
  activitySharing: boolean;
  reducedMotion: boolean;
};

export type CallParticipant = {
  id: string;
  userId: string;
  joinedAt?: string | null;
  leftAt?: string | null;
  user?: { username: string; role: Role };
};

export type CallRecord = {
  id: string;
  status: 'RINGING' | 'ACTIVE' | 'ENDED' | 'DECLINED';
  startedAt: string;
  endedAt?: string | null;
  participants: CallParticipant[];
};

export type ConversationStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'NONE';

export type Summary = {
  status: ConversationStatus;
  conversationId: string | null;
  peerId?: string | null;
  peerLastSeenAt?: string | null;
  unreadMessages: number;
  unreadGameMessages: number;
  unreadNotifications: number;
  chatVisible: boolean;
  chatUnlocked: boolean;
  onlineUserIds: string[];
  contacts?: Contact[];
  activeCall: CallRecord | null;
};

export type IncomingCall = {
  callId: string;
  from: string;
  createdAt?: string;
};

export type CallState = 'IDLE' | 'RINGING' | 'CONNECTING' | 'ACTIVE' | 'RECONNECTING' | 'ENDED';

export type AdminActivity = {
  notifications: Notification[];
  calls: CallRecord[];
  logs: Array<{
    id: string;
    actorId: string;
    action: string;
    targetId?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
  }>;
  permissions: Permission[];
  gameSessions: Array<{
    id: string;
    startedAt: string;
    endedAt?: string | null;
    score: number;
    game: { name: string; slug: string };
  }>;
  presence: string[];
};
