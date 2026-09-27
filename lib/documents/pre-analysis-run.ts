// Execução da pré-análise automática no servidor: lê os arquivos do ComprovaBet do rascunho e confere com as
// respostas do formulário. O resultado fica gravado no rascunho (e, no envio, também no caso).
import type { Prisma } from "@prisma/client";
import type { SubmissionData } from "@/lib/cases/submission";
import { resolvePlatforms } from "@/lib/cases/platforms";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { readPdfLines } from "@/lib/extraction/readers";
import { getStorage } from "@/lib/storage";
import { aggregatePreAnalysis, evaluateComprovaBet, type DocumentEvaluation } from "./pre-analysis-check";
import type { PreAnalysis } from "./pre-analysis";

const MAX_PAGES = 10;

/** Faz a pré-análise do ComprovaBet do rascunho. Exige o CPF registrado (conferido no envio do documento). */
export async function runPreAnalysis(draftId: string, data: SubmissionData): Promise<PreAnalysis> {
  const draft = await prisma.caseDraft.findUnique({ where: { id: draftId }, select: { cpf: true } });
  if (!draft?.cpf) throw new Error("Rascunho sem CPF registrado.");
  const docs = await prisma.document.findMany({
    where: { draftId, category: "comprovabet" },
    orderBy: { createdAt: "asc" },
    select: { id: true, originalName: true, mimeType: true, storageKey: true },
  });
  const declaredPlatforms = resolvePlatforms(data).platforms.map((p) => p.name);
  const storage = await getStorage();
  const evaluations: DocumentEvaluation[] = [];
  for (const doc of docs) {
    const kind = doc.mimeType === "application/pdf" ? "pdf" : "image";
    let lines: string[] | null = null;
    if (kind === "pdf") {
      try {
        lines = await readPdfLines(await storage.get(doc.storageKey), MAX_PAGES);
      } catch {
        lines = null; // PDF protegido ou danificado: fica para a equipe.
      }
    }
    evaluations.push(
      evaluateComprovaBet({
        documentId: doc.id,
        name: doc.originalName,
        kind,
        lines,
        cpf: draft.cpf,
        referenceYear: config.comprovabetYear,
        declaredPlatforms,
        declaredDepositsCents: data.depositsCents,
        declaredWithdrawalsCents: data.withdrawalsCents,
      }),
    );
  }
  const result = aggregatePreAnalysis(evaluations, config.comprovabetYear);
  await prisma.caseDraft.update({ where: { id: draftId }, data: { preAnalysis: result as unknown as Prisma.InputJsonValue } });
  return result;
}
