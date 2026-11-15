import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'node:crypto';
import { Role } from '@prisma/client';
import { asyncHandler } from '../lib/async-handler';
import { clientSafeUser, prisma, requireAuth, type AuthRequest } from '../middleware/auth';

export const authRouter = Router();

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

const passwordLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password attempts. Please try again later.' }
});

const loginSchema = z.object({
  username: z.enum(['host', 'guest']),
  password: z.string().min(1).max(200)
});

const guestNameSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(40, 'Name is too long')
});

const hostPasswordSchema = z.object({
  password: z.string().min(1, 'Enter the host password')
});

// HTTPS is the production default. COOKIE_SECURE=false is only used by the
// deploy script when certificate issuance failed and the site is temporarily
// served over plain HTTP.
const cookieSecure = () =>
  process.env.COOKIE_SECURE === undefined
    ? process.env.NODE_ENV === 'production'
    : process.env.COOKIE_SECURE === 'true';

const cookieOptions = () => ({
  httpOnly: true,
  secure: cookieSecure(),
  sameSite: 'lax' as const,
  path: '/',
  maxAge: Number(process.env.SESSION_DAYS || 7) * 86400000
});

async function issueSession(userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const days = Number(process.env.SESSION_DAYS || 7);
  await prisma.session.create({
    data: { tokenHash, userId, expiresAt: new Date(Date.now() + days * 86400000) }
  });
  await prisma.session.deleteMany({
    where: { userId, expiresAt: { lte: new Date() } }
  });
  return token;
}

authRouter.post(
  '/login',
  loginLimit,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid credentials' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = await issueSession(user.id);
    res.cookie('duo_session', token, cookieOptions());
    res.json(clientSafeUser(user));
  })
);

authRouter.post(
  '/guest',
  loginLimit,
  asyncHandler(async (req, res) => {
    const parsed = guestNameSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Enter your name' });
      return;
    }

    const name = parsed.data.name;
    if (name.toLowerCase() === 'host') {
      res.status(400).json({ error: 'Choose a different name.' });
      return;
    }

    let guest = await prisma.user.findFirst({
      where: { role: Role.GUEST },
      orderBy: { createdAt: 'asc' }
    });

    if (!guest) {
      guest = await prisma.user.create({
        data: {
          username: name,
          role: Role.GUEST,
          passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)
        }
      });
    } else {
      const conflict = await prisma.user.findUnique({ where: { username: name } });
      if (conflict && conflict.id !== guest.id) {
        res.status(409).json({ error: 'That name is already in use.' });
        return;
      }
      if (guest.username !== name) {
        guest = await prisma.user.update({
          where: { id: guest.id },
          data: { username: name }
        });
      }
    }

    await prisma.notificationPreference
      .createMany({ data: [{ userId: guest.id }], skipDuplicates: true })
      .catch(() => undefined);
    await prisma.userPreference
      .createMany({ data: [{ userId: guest.id }], skipDuplicates: true })
      .catch(() => undefined);
    await prisma.screenPreference
      .createMany({
        data: [{ userId: guest.id, screen: 'HOME', chatVisible: true }],
        skipDuplicates: true
      })
      .catch(() => undefined);

    const token = await issueSession(guest.id);
    res.cookie('duo_session', token, cookieOptions());
    res.json(clientSafeUser(guest));
  })
);

authRouter.post(
  '/host',
  loginLimit,
  asyncHandler(async (req, res) => {
    const parsed = hostPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Enter the host password' });
      return;
    }

    const host = await prisma.user.findFirst({ where: { role: Role.HOST } });
    if (!host || !(await bcrypt.compare(parsed.data.password, host.passwordHash))) {
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }

    const token = await issueSession(host.id);
    res.cookie('duo_session', token, cookieOptions());
    res.json(clientSafeUser(host));
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(req.user);
  })
);

authRouter.post(
  '/password',
  requireAuth,
  passwordLimit,
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(1, 'Enter a new password')
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      res.status(403).json({ error: 'Current password is incorrect' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) }
    });

    // Revoke every existing session, then issue one fresh session for this browser.
    await prisma.session.deleteMany({ where: { userId: user.id } });
    const token = await issueSession(user.id);
    res.cookie('duo_session', token, cookieOptions());
    res.json({ ok: true, message: 'Password changed. Other sessions were signed out.' });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.duo_session as string | undefined;
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await prisma.session.deleteMany({ where: { tokenHash } });
    }
    res.clearCookie('duo_session', {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure(),
      path: '/'
    });
    res.status(204).end();
  })
);

export const _roleGuardForReference = Role;
