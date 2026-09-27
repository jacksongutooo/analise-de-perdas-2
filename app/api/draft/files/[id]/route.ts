import { NextResponse } from "next/server";
import { authenticateDraft } from "@/lib/auth/draft";
import { draftPaymentBlock } from "@/lib/cases/drafts";
import { prisma } from "@/lib/db";
import { deleteDocumentAndFile } from "@/lib/files/accept";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await authenticateDraft(req);
  if (!draft || draft.expired || draft.submittedAt) {
    return NextResponse.json({ error: "Sua sessão de envio expirou." }, { status: 401 });
  }
  const doc = await prisma.document.findFirst({ where: { id, draftId: draft.id }, select: { id: true, storageKey: true } });
  if (!doc) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  // Com o pagamento aberto ou aprovado, os documentos ficam fixos: a confirmação do pagamento conclui a solicitação com eles.
  if (await draftPaymentBlock(draft.id)) {
    return NextResponse.json(
      { error: "Há um pagamento em andamento para esta solicitação: os documentos enviados não podem mais ser removidos.", field: "payment" },
      { status: 409 },
    );
  }
  await deleteDocumentAndFile(doc);
  return NextResponse.json({ ok: true });
}
