import { prisma } from "@/lib/db";

type AccessEntry = {
  action: string;
  adminId?: string | null;
  subject?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  success?: boolean;
};

/** Registra acessos e eventos sensíveis. Nunca interrompe o fluxo principal. */
export async function logAccess(entry: AccessEntry): Promise<void> {
  try {
    await prisma.accessLog.create({
      data: {
        action: entry.action,
        adminId: entry.adminId ?? null,
        subject: entry.subject ? entry.subject.slice(0, 200) : null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        success: entry.success ?? true,
      },
    });
  } catch (error) {
    console.error("[audit] falha ao registrar acesso", error);
  }
}

/** Limite de tentativas baseado nos registros de acesso (funciona em ambiente serverless). */
export async function isRateLimited(opts: {
  action: string;
  ip?: string | null;
  subject?: string | null;
  limit: number;
  windowMinutes: number;
  onlyFailures?: boolean;
}): Promise<boolean> {
  if (!opts.ip && !opts.subject) return false;
  const since = new Date(Date.now() - opts.windowMinutes * 60_000);
  const count = await prisma.accessLog.count({
    where: {
      action: opts.action,
      createdAt: { gte: since },
      ...(opts.onlyFailures ? { success: false } : {}),
      ...(opts.ip ? { ip: opts.ip } : {}),
      ...(opts.subject ? { subject: opts.subject } : {}),
    },
  });
  return count >= opts.limit;
}
