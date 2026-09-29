import { NextResponse } from "next/server";
import { authenticateDraft } from "@/lib/auth/draft";
import { config } from "@/lib/env";
import { simulateDemoPix } from "@/lib/payments";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Demonstração: simula a confirmação (ou o vencimento) do PIX em aberto. Só existe com DEMO_MODE=true. */
export async function POST(req: Request) {
  if (!config.demoMode) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const draft = await authenticateDraft(req);
  if (!draft || !draft.isDemo) return NextResponse.json({ error: "Sessão de envio não encontrada." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { outcome?: unknown };
  const outcome = body.outcome === "expired" ? "expired" : "paid";
  const payment = await simulateDemoPix(draft.id, outcome);
  if (!payment) return NextResponse.json({ error: "Não há PIX de demonstração em aberto." }, { status: 409 });
  return NextResponse.json({ ok: true, status: payment.status });
}
