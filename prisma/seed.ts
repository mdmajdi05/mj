import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const games = [
  { slug: 'word-typing', name: 'Word Typing' },
  { slug: 'falling-words', name: 'Falling Words' },
  { slug: 'memory-match', name: 'Color Sequence' },
  { slug: 'turbo-track', name: 'Turbo Track' },
  { slug: 'bubble-pop', name: 'Bubble Pop' },
  { slug: 'snake-classic', name: 'Snake Classic' },
  { slug: 'slide-puzzle', name: 'Slide Puzzle' },
  { slug: 'pair-match', name: 'Pair Match' },
  { slug: 'tic-tac-toe', name: 'Tic Tac Toe' },
  { slug: 'whack-a-mole', name: 'Whack a Mole' },
  { slug: 'brick-breaker', name: 'Brick Breaker' },
  { slug: 'math-sprint', name: 'Math Sprint' }
];

async function main() {
  const hostPassword = process.env.HOST_INITIAL_PASSWORD;
  const guestPassword = process.env.GUEST_INITIAL_PASSWORD;
  if (!hostPassword || !guestPassword) {
    throw new Error('Set HOST_INITIAL_PASSWORD and GUEST_INITIAL_PASSWORD before starting.');
  }

  // Find by role so a Guest who chose a display name is never duplicated by a
  // later deploy. The guest never signs in with a password.
  let host = await prisma.user.findFirst({ where: { role: Role.HOST } });
  if (!host) {
    host = await prisma.user.create({
      data: {
        username: 'host',
        displayName: 'Host',
        role: Role.HOST,
        chatUnlocked: true,
        passwordHash: await bcrypt.hash(hostPassword, 12)
      }
    });
  } else if (!host.chatUnlocked) {
    host = await prisma.user.update({
      where: { id: host.id },
      data: { chatUnlocked: true }
    });
  }

  let guest = await prisma.user.findFirst({ where: { role: Role.GUEST } });
  if (!guest) {
    guest = await prisma.user.create({
      data: {
        username: 'guest',
        displayName: 'Guest',
        role: Role.GUEST,
        chatUnlocked: false,
        passwordHash: await bcrypt.hash(guestPassword, 12)
      }
    });
  }

  await prisma.game.createMany({ data: games, skipDuplicates: true });

  const promo = process.env.INITIAL_PROMO_CODE;
  if (promo) {
    const existing = await prisma.accessCode.findFirst({ where: { purpose: 'PROMO' } });
    if (!existing) {
      await prisma.accessCode.create({
        data: { purpose: 'PROMO', codeHash: await bcrypt.hash(promo, 12) }
      });
    }
  }

  await prisma.notificationPreference.createMany({
    data: [{ userId: host.id }, { userId: guest.id }],
    skipDuplicates: true
  });
  await prisma.userPreference.createMany({
    data: [{ userId: host.id }, { userId: guest.id }],
    skipDuplicates: true
  });
  await prisma.screenPreference.createMany({
    data: [
      { userId: host.id, screen: 'HOME', chatVisible: true },
      { userId: guest.id, screen: 'HOME', chatVisible: true }
    ],
    skipDuplicates: true
  });

  console.log('Seeded host and guest. Promo code configured:', Boolean(promo));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
