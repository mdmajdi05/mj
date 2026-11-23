import { Role, type User } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Returns the account this user talks to.
 *
 * Guests always talk to the (single) Host. The Host can talk to many Guests,
 * so the Host's currently selected Guest is stored in their preferences.
 */
export async function peerFor(userId: string): Promise<User | null> {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.deletedAt) return null;

  if (me.role === Role.HOST) {
    // Removed chats must not silently become the active peer again.
    const hidden = await prisma.conversation.findMany({
      where: { hostId: userId, hostHiddenAt: { not: null }, guestId: { not: null } },
      select: { guestId: true }
    });
    const hiddenIds = hidden
      .map((row) => row.guestId)
      .filter((id): id is string => Boolean(id));
    const available = { role: Role.GUEST, deletedAt: null, id: { notIn: hiddenIds } };
    const preference = await prisma.userPreference.findUnique({ where: { userId } });
    if (preference?.activePeerId) {
      const selected = await prisma.user.findFirst({
        where: { ...available, id: preference.activePeerId }
      });
      if (selected) return selected;
    }
    return prisma.user.findFirst({ where: available, orderBy: { createdAt: 'asc' } });
  }

  return prisma.user.findFirst({
    where: { role: Role.HOST, deletedAt: null },
    orderBy: { createdAt: 'asc' }
  });
}

export type Pair = { host: User; guest: User };

export async function pairFor(userId: string): Promise<Pair | null> {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.deletedAt) return null;

  if (me.role === Role.HOST) {
    const guest = await peerFor(userId);
    return guest && guest.role === Role.GUEST ? { host: me, guest } : null;
  }

  const host = await prisma.user.findFirst({
    where: { role: Role.HOST, deletedAt: null },
    orderBy: { createdAt: 'asc' }
  });
  return host ? { host, guest: me } : null;
}

export async function selectPeer(hostId: string, peerId: string) {
  const guest = await prisma.user.findFirst({
    where: { id: peerId, role: Role.GUEST, deletedAt: null }
  });
  if (!guest) return null;
  await prisma.userPreference.upsert({
    where: { userId: hostId },
    create: { userId: hostId, activePeerId: guest.id },
    update: { activePeerId: guest.id }
  });
  return guest;
}

export type Contact = {
  id: string;
  username: string;
  displayName: string | null;
  role: Role;
  online: boolean;
  lastSeenAt: string | null;
  unread: number;
  lastMessageAt: string | null;
};

export async function contactsFor(userId: string, onlineIds: string[]): Promise<Contact[]> {
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.deletedAt) return [];

  if (me.role === Role.GUEST) {
    const host = await prisma.user.findFirst({
      where: { role: Role.HOST, deletedAt: null },
      orderBy: { createdAt: 'asc' }
    });
    return host
      ? [
          {
            id: host.id,
            username: host.username,
            displayName: host.displayName,
            role: host.role,
            online: onlineIds.includes(host.id),
            lastSeenAt: host.lastSeenAt?.toISOString() ?? null,
            unread: 0,
            lastMessageAt: null
          }
        ]
      : [];
  }

  const guests = await prisma.user.findMany({
    where: { role: Role.GUEST, deletedAt: null },
    orderBy: { createdAt: 'asc' }
  });

  const contacts = await Promise.all(
    guests.map(async (guest) => {
      const conversation = await prisma.conversation.findUnique({
        where: { hostId_guestId: { hostId: me.id, guestId: guest.id } }
      });
      // Chats the Host removed from the list stay hidden until a new message
      // arrives (the message route clears hostHiddenAt) or admin recovery runs.
      if (conversation?.hostHiddenAt) return null;
      const [lastMessage, unread] = await Promise.all([
        conversation
          ? prisma.message.findFirst({
              where: { conversationId: conversation.id, deletedAt: null },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true }
            })
          : null,
        conversation
          ? prisma.message.count({
              where: {
                conversationId: conversation.id,
                senderId: { not: me.id },
                destination: 'CHAT',
                readAt: null,
                deletedAt: null,
                hides: { none: { userId: me.id } }
              }
            })
          : 0
      ]);
      return {
        id: guest.id,
        username: guest.username,
        displayName: guest.displayName,
        role: guest.role,
        online: onlineIds.includes(guest.id),
        lastSeenAt: guest.lastSeenAt?.toISOString() ?? null,
        unread,
        lastMessageAt: lastMessage?.createdAt.toISOString() ?? null
      };
    })
  );

  // Latest message first; contacts without messages stay at the bottom.
  return contacts
    .filter((contact): contact is Contact => Boolean(contact))
    .sort((a, b) => {
    const aTime = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bTime = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    if (aTime !== bTime) return bTime - aTime;
    return (a.displayName || a.username).localeCompare(b.displayName || b.username);
  });
}
