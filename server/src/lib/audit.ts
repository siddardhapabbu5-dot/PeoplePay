import { prisma } from "./prisma.js";

export async function writeAudit(
  userId: string | undefined,
  action: string,
  entity: string,
  entityId?: string,
  details?: string,
) {
  await prisma.auditLog.create({
    data: { userId, action, entity, entityId, details },
  });
}
