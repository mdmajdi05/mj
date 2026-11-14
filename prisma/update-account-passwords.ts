import 'dotenv/config';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

/**
 * Sets both account passwords from base64-encoded values read from stdin.
 *
 * Two lines are expected:
 *   line 1: base64(host password)
 *   line 2: base64(guest password)
 *
 * Passwords are not passed as command-line arguments, so they do not show up
 * in `ps` output. All existing sessions are revoked after a password change.
 */
const prisma = new PrismaClient();

const MIN_LENGTH = 12;
const MAX_LENGTH = 200;

function fail(message: string): never {
  console.error(`Password update failed: ${message}`);
  process.exit(1);
}

function decodeLine(line: string | undefined, label: string): string {
  const encoded = (line ?? '').trim();
  if (!encoded) fail(`missing ${label} password on stdin`);
  const value = Buffer.from(encoded, 'base64').toString('utf8');
  if (value.length < MIN_LENGTH) fail(`${label} password is too short`);
  if (value.length > MAX_LENGTH) fail(`${label} password is too long`);
  if (/[\r\n\0]/.test(value)) fail(`${label} password contains a forbidden character`);
  return value;
}

async function main() {
  const lines = readFileSync(0, 'utf8').split(/\r?\n/);
  const hostPassword = decodeLine(lines[0], 'Host');
  const guestPassword = decodeLine(lines[1], 'Guest');

  if (hostPassword === guestPassword) {
    fail('Host and Guest passwords must be different');
  }

  const accounts = [
    { username: 'host', role: Role.HOST, password: hostPassword },
    { username: 'guest', role: Role.GUEST, password: guestPassword }
  ] as const;

  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    const user = await prisma.user.findUnique({ where: { username: account.username } });
    if (!user) {
      fail(`account "${account.username}" does not exist; run the seed first`);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        ...(account.role === Role.HOST ? { chatUnlocked: true } : {})
      }
    });
    await prisma.session.deleteMany({ where: { userId: user.id } });
  }

  console.log('Host and Guest passwords updated. All existing sessions were revoked.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
