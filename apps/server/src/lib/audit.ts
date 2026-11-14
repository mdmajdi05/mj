import { prisma } from './prisma';

export async function writeAudit(
  actorId: string,
  action: string,
  targetId?: string,
  metadata?: object
) {
  await prisma.adminAuditLog
    .create({
      data: { actorId, action, targetId: targetId ?? null, metadata: metadata ?? undefined }
    })
    .catch((error) => console.error('Audit write failed', error));
}
