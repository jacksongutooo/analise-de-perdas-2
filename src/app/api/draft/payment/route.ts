import { NextResponse } from "next/server";
import { authenticateDraft } from "@/lib/auth/draft";
import { setTrackingSession } from "@/lib/auth/tracking";
import { safeErrorMessage } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { draftPaymentView } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPIRED = "Sua sessão de envio expirou. Preencha seus dados novamente.";

/**
 * Situação do pagamento, respondida com o que está gravado no banco ("esse pagamento já foi confirmado?").
 * A confirmação chega pela notificação da BlackCat; sem ela, o servidor faz no máximo uma consulta de reserva
 * por minuto (?verificar=1, do botão "Verificar pagamento": a cada 10 s).
 */
export async function GET(req: Request) {
  const draft = await authenticateDraft(req);
  if (!draft) return NextResponse.json({ error: EXPIRED, field: "documents" }, { status: 401 });
  const manual = new URL(req.url).searchParams.get("verificar") === "1";
  try {
    const view = await draftPaymentView(draft.id, { manual });
    if (view.protocol) {
      // Pagamento confirmado e solicitação concluída: o acompanhamento já fica liberado neste navegador.
      const c = await prisma.case.findUnique({ where: { protocol: view.protocol }, select: { id: true } });
      if (c) await setTrackingSession(c.id);
    }
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[payments] falha ao consultar pagamento", safeErrorMessage(error));
    return NextResponse.json({ error: "Não foi possível consultar o pagamento agora." }, { status: 502 });
  }
}
