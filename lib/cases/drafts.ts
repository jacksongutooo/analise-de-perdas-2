import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

/** Por quanto tempo um pagamento aberto (ainda sem resposta do gateway) impede apagar o rascunho. */
const OPEN_PAYMENT_HOURS = 24;

/**
 * Pagamento que ainda pode concluir a solicitação: aprovado, ou aberto há pouco (o cliente pode pagar a qualquer
 * momento, e a confirmação cria o caso com as respostas guardadas no rascunho).
 */
export async function draftPaymentBlock(draftId: string): Promise<"approved" | "pending" | null> {
  const payments = await prisma.payment.findMany({
    where: {
      draftId,
      OR: [{ status: "approved" }, { status: "pending", createdAt: { gte: new Date(Date.now() - OPEN_PAYMENT_HOURS * 3_600_000) } }],
    },
    select: { status: true },
  });
  if (payments.some((p) => p.status === "approved")) return "approved";
  return payments.length ? "pending" : null;
}

/** Remove um rascunho não enviado e todos os seus arquivos (banco + armazenamento). Rascunhos pagos (ou com pagamento aberto) ficam. */
export async function deleteDraftCompletely(draftId: string): Promise<boolean> {
  if (await draftPaymentBlock(draftId)) return false;
  const docs = await prisma.document.findMany({ where: { draftId }, select: { storageKey: true } });
  if (docs.length) {
    const storage = await getStorage();
    for (const doc of docs) {
      await storage.remove(doc.storageKey).catch((error) => console.error("[drafts] falha ao remover arquivo", error));
    }
  }
  await prisma.caseDraft.deleteMany({ where: { id: draftId, submittedAt: null } });
  return true;
}
