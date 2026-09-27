// Status do caso, dos documentos, da conferência de CPF e do pagamento, com rótulos e regras de exibição.

export type Tone = "neutral" | "info" | "progress" | "warn" | "ok" | "danger";

// ─── Caso ─────────────────────────────────────────────────────────────────
// Fluxo atual: cadastro e ComprovaBet → pagamento da análise → solicitação → validação documental → análise → conclusão.
// Casos anteriores: validação documental → pagamento ("Aguardando pagamento") → análise.
export const CASE_STATUS_VALUES = [
  "submitted",
  "documents_received",
  "additional_documents",
  "awaiting_payment",
  "payment_confirmed",
  "under_review",
  "eligible",
  "not_eligible",
  "completed",
] as const;
export type CaseStatusValue = (typeof CASE_STATUS_VALUES)[number];

export const CASE_STATUS_LABEL: Record<CaseStatusValue, string> = {
  submitted: "Solicitação recebida",
  documents_received: "Validação documental",
  additional_documents: "Documentação complementar necessária",
  awaiting_payment: "Aguardando pagamento",
  // Documento validado e análise paga: falta a equipe iniciar a análise.
  payment_confirmed: "Aguardando início da análise",
  under_review: "Análise em andamento",
  eligible: "Caso com possibilidade de prosseguimento",
  not_eligible: "Elementos insuficientes para prosseguir",
  completed: "Análise concluída",
};

export const CASE_STATUS_TONE: Record<CaseStatusValue, Tone> = {
  submitted: "info",
  documents_received: "info",
  additional_documents: "warn",
  awaiting_payment: "warn",
  payment_confirmed: "info",
  under_review: "progress",
  eligible: "ok",
  not_eligible: "neutral",
  completed: "neutral",
};

/**
 * Status que a equipe pode definir diretamente no formulário "Status do caso".
 * "Documentação complementar", "Aguardando pagamento" e "Pagamento confirmado" vêm das ações próprias
 * (solicitar documentos, aprovar documento e confirmar pagamento), que registram quem fez e quando.
 */
export const ADMIN_SETTABLE_STATUSES: CaseStatusValue[] = [
  "submitted",
  "documents_received",
  "under_review",
  "eligible",
  "not_eligible",
  "completed",
];

export const STATUS_GROUPS = {
  new: ["submitted", "documents_received"],
  /** Depende do cliente: documentação complementar (ou pagamento, nos casos anteriores ao pagamento antecipado). */
  waiting: ["additional_documents", "awaiting_payment"],
  ready: ["payment_confirmed"],
  review: ["under_review"],
  done: ["eligible", "not_eligible", "completed"],
} as const satisfies Record<string, readonly CaseStatusValue[]>;
export type StatusGroup = keyof typeof STATUS_GROUPS;

export const FINISHED_STATUSES: readonly CaseStatusValue[] = STATUS_GROUPS.done;

/** Etapas em que o CPF já não pode ser alterado: a análise documental está em andamento ou concluída. */
export const CPF_LOCKED_STATUSES: readonly CaseStatusValue[] = [
  "awaiting_payment",
  "payment_confirmed",
  "under_review",
  "eligible",
  "not_eligible",
  "completed",
];

export function isCaseStatus(value: string): value is CaseStatusValue {
  return (CASE_STATUS_VALUES as readonly string[]).includes(value);
}

// ─── Documentos ───────────────────────────────────────────────────────────
export const DOCUMENT_STATUS_VALUES = [
  "pending",
  "in_review",
  "manual_review",
  "valid",
  "cpf_mismatch",
  "divergent",
  "invalid",
  "illegible",
  "complement_required",
  "duplicate",
] as const;
export type DocumentStatusValue = (typeof DOCUMENT_STATUS_VALUES)[number];

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatusValue, string> = {
  pending: "Aguardando análise",
  in_review: "Documento em análise",
  manual_review: "Aguardando conferência manual",
  valid: "Documento aprovado",
  cpf_mismatch: "CPF divergente",
  divergent: "Documento inconsistente",
  invalid: "Documento inválido",
  illegible: "Documento ilegível",
  complement_required: "Documentação complementar necessária",
  duplicate: "Possível duplicidade",
};

export const DOCUMENT_STATUS_TONE: Record<DocumentStatusValue, Tone> = {
  pending: "info",
  in_review: "progress",
  manual_review: "warn",
  valid: "ok",
  cpf_mismatch: "danger",
  divergent: "danger",
  invalid: "danger",
  illegible: "danger",
  complement_required: "warn",
  duplicate: "warn",
};

/** Documentos ainda sem decisão da equipe (o ComprovaBet pode vir em mais de um arquivo). */
export const DOCUMENT_AWAITING_REVIEW = ["pending", "in_review", "manual_review", "duplicate"] as const satisfies readonly DocumentStatusValue[];

/** Situações em que o cliente precisa corrigir ou complementar o documento. */
export const DOCUMENT_PROBLEM_STATUSES: readonly DocumentStatusValue[] = [
  "cpf_mismatch",
  "divergent",
  "invalid",
  "illegible",
  "complement_required",
];

export function isDocumentStatus(value: string): value is DocumentStatusValue {
  return (DOCUMENT_STATUS_VALUES as readonly string[]).includes(value);
}

/** Rótulo do documento para o cliente: simples e sem detalhes internos da conferência. */
export function clientDocumentLabel(status: DocumentStatusValue): { label: string; tone: Tone } {
  if (status === "valid") return { label: "Documento aprovado", tone: "ok" };
  if (status === "cpf_mismatch") return { label: "CPF divergente", tone: "danger" };
  if (DOCUMENT_PROBLEM_STATUSES.includes(status)) return { label: "Documentação complementar necessária", tone: "warn" };
  if (status === "in_review" || status === "duplicate") return { label: "Documento em análise", tone: "progress" };
  return { label: "Aguardando análise", tone: "info" };
}

// ─── Conferência do CPF (somente equipe) ─────────────────────────────────
export const CPF_CHECK_VALUES = ["pending", "match", "mismatch", "manual_match"] as const;
export type CpfCheckValue = (typeof CPF_CHECK_VALUES)[number];

export const CPF_CHECK_LABEL: Record<CpfCheckValue, string> = {
  pending: "Aguardando conferência documental",
  match: "CPF compatível",
  mismatch: "CPF divergente",
  manual_match: "CPF conferido pela equipe",
};

export const CPF_CHECK_TONE: Record<CpfCheckValue, Tone> = {
  pending: "warn",
  match: "ok",
  mismatch: "danger",
  manual_match: "ok",
};

/**
 * Situação do CPF mostrada ao cliente. "CPF compatível" só aparece quando houve de fato a leitura
 * automática com o CPF encontrado ou a conferência da equipe; sem leitura, fica "Aguardando conferência documental".
 */
export function clientCpfLabel(status: DocumentStatusValue, check: CpfCheckValue): { label: string; tone: Tone } | null {
  if (status === "cpf_mismatch" || check === "mismatch") return null; // o próprio status do documento já informa
  if (check === "match" || check === "manual_match") return { label: "CPF compatível", tone: "ok" };
  if (status === "valid" || DOCUMENT_PROBLEM_STATUSES.includes(status)) return null;
  return { label: CPF_CHECK_LABEL.pending, tone: "neutral" };
}

// ─── Pagamento ────────────────────────────────────────────────────────────
export const PAYMENT_STATUS_VALUES = ["not_applicable", "pending", "awaiting_confirmation", "confirmed"] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUS_VALUES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatusValue, string> = {
  not_applicable: "Não se aplica",
  pending: "Pagamento pendente",
  awaiting_confirmation: "Pagamento em confirmação",
  confirmed: "Pagamento confirmado",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatusValue, Tone> = {
  not_applicable: "neutral",
  pending: "neutral",
  awaiting_confirmation: "warn",
  confirmed: "ok",
};

/** Cada tentativa de pagamento no gateway (tabela payments). */
export const PAYMENT_ATTEMPT_LABEL: Record<"pending" | "approved" | "rejected" | "cancelled" | "refunded", string> = {
  pending: "Aguardando pagamento",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Não concluído",
  refunded: "Estornado",
};

export const PAYMENT_ATTEMPT_TONE: Record<keyof typeof PAYMENT_ATTEMPT_LABEL, Tone> = {
  pending: "warn",
  approved: "ok",
  rejected: "danger",
  cancelled: "neutral",
  refunded: "neutral",
};

// ─── Linha do tempo do cliente ───────────────────────────────────────────
export type TimelineState = "done" | "current" | "attention" | "pending";
export type TimelineStep = { key: string; label: string; state: TimelineState; date: Date | null; note?: string };

type History = { toStatus: string; fromStatus?: string | null; createdAt: Date }[];

/** O pedido de complemento aconteceu durante a análise (depois do pagamento)? */
export function complementDuringAnalysis(history: History): boolean {
  const last = [...history].reverse().find((h) => h.toStatus === "additional_documents");
  return last?.fromStatus === "under_review" || last?.fromStatus === "payment_confirmed";
}

/** A análise foi paga antes da solicitação (fluxo atual)? Tolerância para a diferença de relógio entre servidores. */
export function paidBeforeRequest(paymentConfirmedAt: Date | null, createdAt: Date): boolean {
  return paymentConfirmedAt !== null && paymentConfirmedAt.getTime() <= createdAt.getTime() + 5 * 60_000;
}

/**
 * Etapas exibidas ao solicitante. No fluxo atual (pagamento antes da solicitação):
 * 1. Cadastro realizado · 2. ComprovaBet enviado · 3. Pagamento confirmado ·
 * 4. Validação documental · 5. Análise em andamento · 6. Análise concluída.
 * Casos em que o pagamento veio depois da validação mostram o pagamento como 4ª etapa;
 * casos anteriores ao pagamento da análise (pagamento "não se aplica") não exibem essa etapa.
 */
export function clientTimeline(input: {
  status: CaseStatusValue;
  paymentStatus: PaymentStatusValue;
  history: History;
  createdAt: Date;
  documentSentAt: Date | null;
  hasComprovaBet: boolean;
  documentApprovedAt: Date | null;
  paymentConfirmedAt: Date | null;
}): TimelineStep[] {
  const { status, paymentStatus, history } = input;
  const at = (statuses: readonly string[], last = false): Date | null => {
    const dates = history
      .filter((h) => statuses.includes(h.toStatus))
      .map((h) => h.createdAt)
      .sort((a, b) => a.getTime() - b.getTime());
    return (last ? dates[dates.length - 1] : dates[0]) ?? null;
  };
  const finished = FINISHED_STATUSES.includes(status);
  const legacy = paymentStatus === "not_applicable";
  const paid = paymentStatus === "confirmed";
  const payFirst = paid && paidBeforeRequest(input.paymentConfirmedAt, input.createdAt);
  const analysisReached = finished || status === "under_review" || at(["under_review"]) !== null;
  // Complemento pedido durante a análise (e não na validação do documento).
  const complementInAnalysis = status === "additional_documents" && (legacy || payFirst ? analysisReached : paid);
  const validated =
    input.documentApprovedAt !== null ||
    finished ||
    status === "awaiting_payment" ||
    status === "payment_confirmed" ||
    status === "under_review" ||
    complementInAnalysis;

  const validation: TimelineStep = {
    key: "validation",
    label: "Validação documental",
    state: validated ? "done" : status === "additional_documents" ? "attention" : "current",
    date: validated ? (input.documentApprovedAt ?? at(payFirst ? ["payment_confirmed", "under_review"] : ["awaiting_payment", "under_review"])) : null,
    note: !validated && status === "additional_documents" ? "Documentação complementar necessária" : undefined,
  };
  const payment: TimelineStep = {
    key: "payment",
    label: "Pagamento confirmado",
    state: paid ? "done" : status === "awaiting_payment" ? "current" : "pending",
    date: paid ? input.paymentConfirmedAt : null,
    note:
      !paid && status === "awaiting_payment"
        ? paymentStatus === "awaiting_confirmation"
          ? "Pagamento em confirmação"
          : "Aguardando pagamento"
        : undefined,
  };
  const steps: TimelineStep[] = [
    { key: "registered", label: "Cadastro realizado", state: "done", date: input.createdAt },
    {
      key: "document",
      label: input.hasComprovaBet ? "ComprovaBet enviado" : "Documentos enviados",
      state: input.documentSentAt || status !== "submitted" ? "done" : "current",
      date: input.documentSentAt ?? at(["documents_received"]),
    },
  ];
  if (legacy) steps.push(validation);
  else if (payFirst) steps.push(payment, validation);
  else steps.push(validation, payment);
  steps.push(
    {
      key: "analysis",
      label: "Análise em andamento",
      state: finished ? "done" : status === "under_review" ? "current" : complementInAnalysis ? "attention" : "pending",
      date: finished || status === "under_review" || complementInAnalysis ? at(["under_review"]) : null,
      note: complementInAnalysis ? "Documentação complementar necessária" : undefined,
    },
    {
      key: "result",
      label: "Análise concluída",
      state: finished ? "done" : "pending",
      date: finished ? at(FINISHED_STATUSES, true) : null,
    },
  );
  return steps;
}

/** Divergência relevante entre valor declarado e identificado (≥ R$ 100 e ≥ 2% do declarado). */
export function divergenceOf(declaredCents: number, identifiedCents: number | null): { diffCents: number } | null {
  if (identifiedCents === null) return null;
  const diff = declaredCents - identifiedCents;
  const threshold = Math.max(10_000, Math.round(Math.abs(declaredCents) * 0.02));
  return Math.abs(diff) >= threshold ? { diffCents: diff } : null;
}
