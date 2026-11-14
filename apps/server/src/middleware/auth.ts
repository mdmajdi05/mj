import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { Role, type PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';

export type AuthUser = {
  id: string;
  role: Role;
  username: string;
  chatUnlocked: boolean;
};

export type AuthRequest = Request & { user?: AuthUser };

export { prisma };

export async function resolveSession(token?: string): Promise<AuthUser | null> {
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }
  return {
    id: session.user.id,
    role: session.user.role,
    username: session.user.username,
    chatUnlocked: session.user.chatUnlocked || session.user.role === Role.HOST
  };
}

export const requireAuth = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = await resolveSession(req.cookies?.duo_session as string | undefined);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.user = user;
  next();
});

export function requireHost(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== Role.HOST) {
    res.status(403).json({ error: 'Host access only' });
    return;
  }
  next();
}

export async function isOtherUser(userId: string) {
  return prisma.user.findFirst({ where: { id: { not: userId } } });
}

export function clientSafeUser(user: {
  id: string;
  username: string;
  role: Role;
  chatUnlocked: boolean;
}): AuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    chatUnlocked: user.chatUnlocked || user.role === Role.HOST
  };
}

export type Db = PrismaClient;
