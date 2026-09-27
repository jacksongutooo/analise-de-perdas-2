import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { safeEqual, sha256Hex } from "@/lib/security";

export type DraftAuth = {
  id: string;
  isDemo: boolean;
  expired: boolean;
  submittedAt: Date | null;
  caseId: string | null;
  /** CPF informado no formulário (somente dígitos). Nunca é devolvido ao navegador sem máscara. */
  cpf: string | null;
};

/**
 * Rascunhos são identificados por cabeçalhos x-draft-id / x-draft-token.
 * O token fica apenas no navegador do solicitante; no banco guardamos só o hash.
 */
export async function authenticateDraft(req: Request): Promise<DraftAuth | null> {
  const id = req.headers.get("x-draft-id") ?? "";
  const token = req.headers.get("x-draft-token") ?? "";
  if (!id || !token || id.length > 40 || token.length > 100) return null;
  const draft = await prisma.caseDraft.findUnique({ where: { id } });
  if (!draft || !safeEqual(draft.tokenHash, sha256Hex(token))) return null;
  if (draft.isDemo !== config.demoMode) return null;
  return {
    id: draft.id,
    isDemo: draft.isDemo,
    expired: draft.expiresAt.getTime() < Date.now(),
    submittedAt: draft.submittedAt,
    caseId: draft.caseId,
    cpf: draft.cpf,
  };
}
