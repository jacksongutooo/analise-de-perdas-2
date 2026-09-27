// Pré-análise automática do ComprovaBet, feita logo depois do envio (antes do pagamento).
// Confere o documento com os dados informados no formulário: leitura, CPF, ano de referência, tipo do
// documento, plataformas e valores. Só "aprova" quando a leitura automática realmente confirmou o CPF, o ano
// e o tipo do documento; nos demais casos, a conferência fica para a equipe (nunca uma aprovação sem leitura).
// Este arquivo tem só tipos e textos (usado também no navegador). Conferências: pre-analysis-check.ts;
// execução no servidor: pre-analysis-run.ts.

export type PreCheckKey = "reading" | "cpf" | "year" | "type" | "platforms" | "values";
/** ok = conferido · review = fica para a equipe (não impede seguir) · fail = impede seguir. */
export type PreCheckState = "ok" | "review" | "fail";
export type PreCheck = { key: PreCheckKey; state: PreCheckState; detail: string };
export type PreAnalysisStatus = "approved" | "review" | "blocked";

export type PreAnalysis = {
  version: 1;
  status: PreAnalysisStatus;
  referenceYear: number;
  analyzedAt: string;
  /** Arquivos do ComprovaBet considerados nesta pré-análise. */
  documentIds: string[];
  /** Arquivos que passaram em todas as conferências obrigatórias. */
  approvedIds: string[];
  /** Conferências do arquivo que representa o resultado (o aprovado, o que bloqueou ou o primeiro). */
  checks: PreCheck[];
  /** Resumo para o cliente. */
  message: string;
};

export const PRE_CHECK_ORDER: PreCheckKey[] = ["reading", "cpf", "year", "type", "platforms", "values"];

export const PRE_CHECK_LABEL: Record<PreCheckKey, string> = {
  reading: "Leitura do documento",
  cpf: "CPF do titular",
  year: "Ano de referência",
  type: "Tipo de documento",
  platforms: "Plataformas informadas",
  values: "Valores informados",
};

/** Conferências obrigatórias para a aprovação automática. Plataformas e valores são informativos. */
export const PRE_CHECK_REQUIRED: PreCheckKey[] = ["reading", "cpf", "year", "type"];

export const PRE_ANALYSIS_APPROVED_MESSAGE = "Documento aprovado na pré-análise automática.";
export const PRE_ANALYSIS_REVIEW_MESSAGE =
  "Pré-análise concluída. Não foi possível confirmar todos os dados automaticamente: a conferência final do documento será feita pela nossa equipe.";
/** Registro no documento aprovado automaticamente (visto pela equipe). */
export const AUTO_APPROVAL_NOTE = "Aprovado na pré-análise automática: CPF, ano de referência e tipo do documento conferidos pela leitura do PDF.";

/** Lê o resultado gravado (JSON do banco), aceitando só o formato conhecido. */
export function parsePreAnalysis(value: unknown): PreAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<PreAnalysis>;
  if (v.version !== 1 || !v.status || !Array.isArray(v.checks) || !Array.isArray(v.documentIds)) return null;
  return v as PreAnalysis;
}

/** Rótulo curto do resultado (painel e tela de pagamento). */
export const PRE_ANALYSIS_STATUS_LABEL: Record<PreAnalysisStatus, string> = {
  approved: "Aprovado na pré-análise",
  review: "Conferência pela equipe",
  blocked: "Documento com pendência",
};
