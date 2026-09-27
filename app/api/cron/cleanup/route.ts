import { NextResponse } from "next/server";
import { deleteDraftCompletely } from "@/lib/cases/drafts";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { safeEqual } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Executada diariamente pela Vercel Cron (vercel.json). Apaga rascunhos abandonados e seus
// arquivos, sessões vencidas e registros de acesso com mais de ~13 meses.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!config.cronSecret || !safeEqual(auth, `Bearer ${config.cronSecret}`)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const now = new Date();
  // Rascunhos com pagamento aprovado não são apagados (a solicitação é concluída com o pagamento).
  const drafts = await prisma.caseDraft.findMany({
    where: { submittedAt: null, expiresAt: { lt: now }, payments: { none: { status: "approved" } } },
    select: { id: true },
    take: 200,
  });
  let draftsRemoved = 0;
  for (const draft of drafts) if (await deleteDraftCompletely(draft.id)) draftsRemoved++;
  const sessions = await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } });
  const logs = await prisma.accessLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 400 * 86_400_000) } } });
  return NextResponse.json({ draftsRemoved, sessionsRemoved: sessions.count, logsRemoved: logs.count });
}
