import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

/** Por quanto tempo um pagamento aberto sem data de vencimento (ainda sem resposta do gateway) impede apagar o rascunho. */
const OPEN_PAYMENT_HOURS = 24;

/**
 * Pagamento que ainda pode concluir a solicitação: confirmado, ou PIX em aberto e dentro do prazo (o cliente pode
 * pagar a qualquer momento, e a confirmação cria o caso com as respostas guardadas no rascunho).
 */
export async function draftPaymentBlock(draftId: string): Promise<"paid" | "pending" | null> {
  const now = new Date();
  const payments = await prisma.payment.findMany({
    where: {
      draftId,
      OR: [
        { status: "paid" },
        { status: "pending", pixExpiresAt: { gt: now } },
        { status: "pending", pixExpiresAt: null, createdAt: { gte: new Date(now.getTime() - OPEN_PAYMENT_HOURS * 3_600_000) } },
      ],
    },
    select: { status: true },
  });
  if (payments.some((p) => p.status === "paid")) return "paid";
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
