import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { getStorage } from "@/lib/storage";
import { checkToDocumentData, inspectComprovaBet } from "./comprovabet-check";

/**
 * Refaz a conferência automática do CPF de um ComprovaBet já anexado ao caso
 * (ex.: "Refazer leitura" ou correção do CPF antes da análise).
 * Decisões da equipe prevalecem: CPF conferido manualmente ou marcado como divergente não é alterado.
 */
export async function recheckComprovaBetCpf(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      category: true,
      status: true,
      cpfCheck: true,
      mimeType: true,
      storageKey: true,
      referenceYear: true,
      case: { select: { user: { select: { cpf: true } } } },
    },
  });
  if (!doc || doc.category !== "comprovabet" || !doc.case) return;
  if (doc.cpfCheck === "manual_match" || doc.status === "cpf_mismatch") return;

  const buffer = await (await getStorage()).get(doc.storageKey);
  const kind = doc.mimeType === "application/pdf" ? "pdf" : doc.mimeType === "image/png" ? "png" : "jpeg";
  const check = await inspectComprovaBet({
    buffer,
    kind,
    cpf: doc.case.user.cpf,
    referenceYear: doc.referenceYear ?? config.comprovabetYear,
  });
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      ...checkToDocumentData(check),
      // Divergência automática impede a aprovação até a equipe conferir.
      ...(check.cpfCheck === "mismatch" && doc.status !== "valid" ? { status: "cpf_mismatch" as const } : {}),
    },
  });
}
