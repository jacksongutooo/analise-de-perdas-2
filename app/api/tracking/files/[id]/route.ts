import { NextResponse } from "next/server";
import { getTrackingCaseId } from "@/lib/auth/tracking";
import { prisma } from "@/lib/db";
import { deleteDocumentAndFile } from "@/lib/files/accept";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Permite remover um arquivo adicional enquanto a solicitação de documentos estiver aberta. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const { id } = await params;
  const caseId = await getTrackingCaseId();
  if (!caseId) return NextResponse.json({ error: "Sua sessão expirou." }, { status: 401 });
  const doc = await prisma.document.findFirst({
    where: { id, caseId, uploadedVia: "additional", request: { status: "open" } },
    select: { id: true, storageKey: true },
  });
  if (!doc) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  await deleteDocumentAndFile(doc);
  return NextResponse.json({ ok: true });
}
