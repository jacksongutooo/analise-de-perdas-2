// Opções do formulário e rótulos. Compartilhado entre navegador e servidor.

export type Option<V extends string> = { value: V; label: string; description?: string };

export function labelFor<V extends string>(options: readonly Option<V>[], value: string | null | undefined): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

export const BET_TYPE_VALUES = ["sports", "casino", "both"] as const;
export type BetTypeValue = (typeof BET_TYPE_VALUES)[number];
export const BET_TYPES: Option<BetTypeValue>[] = [
  { value: "sports", label: "Apostas esportivas", description: "Futebol, basquete, tênis, apostas ao vivo e outros esportes." },
  { value: "casino", label: "Cassino online", description: "Slots, roleta, blackjack, crash, mines e outros jogos." },
  { value: "both", label: "Utilizei os dois", description: "Apostas esportivas e cassino online." },
];
export const BET_TYPE_SUMMARY: Record<BetTypeValue, string> = {
  sports: "Apostas esportivas",
  casino: "Cassino online",
  both: "Ambos (esportivas e cassino)",
};
export const BET_TYPE_SHORT: Record<BetTypeValue, string> = { sports: "Esportivas", casino: "Cassino", both: "Misto" };

export const SPORTS_KIND_VALUES = ["pre_game", "live", "multiple", "various"] as const;
export const SPORTS_KINDS: Option<(typeof SPORTS_KIND_VALUES)[number]>[] = [
  { value: "pre_game", label: "Pré-jogo" },
  { value: "live", label: "Ao vivo" },
  { value: "multiple", label: "Múltiplas" },
  { value: "various", label: "Utilizava vários tipos" },
];

export const CASINO_GAME_VALUES = ["slots", "roulette", "blackjack", "crash", "mines", "other"] as const;
export const CASINO_GAMES: Option<(typeof CASINO_GAME_VALUES)[number]>[] = [
  { value: "slots", label: "Slots" },
  { value: "roulette", label: "Roleta" },
  { value: "blackjack", label: "Blackjack" },
  { value: "crash", label: "Crash" },
  { value: "mines", label: "Mines" },
  { value: "other", label: "Outros" },
];

export const MAIN_LOSS_VALUES = ["sports", "casino", "similar"] as const;
export const MAIN_LOSS_AREAS: Option<(typeof MAIN_LOSS_VALUES)[number]>[] = [
  { value: "sports", label: "Apostas esportivas" },
  { value: "casino", label: "Cassino online" },
  { value: "similar", label: "Valores semelhantes nos dois" },
];

export const PLATFORM_SLUGS = ["betano", "bet365", "kto", "superbet", "betnacional", "sportingbet"] as const;
export type PlatformSlug = (typeof PLATFORM_SLUGS)[number];
export const PLATFORMS: { slug: PlatformSlug; name: string }[] = [
  { slug: "betano", name: "Betano" },
  { slug: "bet365", name: "Bet365" },
  { slug: "kto", name: "KTO" },
  { slug: "superbet", name: "Superbet" },
  { slug: "betnacional", name: "Betnacional" },
  { slug: "sportingbet", name: "Sportingbet" },
];

export const PERIOD_VALUES = ["up_to_3m", "from_3_to_6m", "from_6_to_12m", "over_12m"] as const;
export type PeriodValue = (typeof PERIOD_VALUES)[number];
export const PERIODS: Option<PeriodValue>[] = [
  { value: "up_to_3m", label: "Até 3 meses" },
  { value: "from_3_to_6m", label: "3 a 6 meses" },
  { value: "from_6_to_12m", label: "6 a 12 meses" },
  { value: "over_12m", label: "Mais de 12 meses" },
];

// ─── Formulário sem documento ────────────────────────────────────────────
/** Já pediu o estorno dessas perdas? A solicitação é feita uma única vez por CPF: "Sim" encerra o formulário. */
export const PREVIOUS_REQUEST_VALUES = ["no", "yes"] as const;
export type PreviousRequestValue = (typeof PREVIOUS_REQUEST_VALUES)[number];
export const PREVIOUS_REQUESTS: Option<PreviousRequestValue>[] = [
  { value: "no", label: "Não, nunca pedi", description: "Esta seria a primeira solicitação do meu CPF." },
  { value: "yes", label: "Sim, já pedi", description: "Já solicitei o estorno dessas perdas antes." },
];

/** Faixa de perda: o cliente não precisa saber o valor exato para começar. */
export const LOSS_RANGE_VALUES = ["up_to_1k", "from_1k_to_5k", "from_5k_to_20k", "from_20k_to_50k", "over_50k"] as const;
export type LossRangeValue = (typeof LOSS_RANGE_VALUES)[number];
export const LOSS_RANGES: Option<LossRangeValue>[] = [
  { value: "up_to_1k", label: "Até R$ 1.000" },
  { value: "from_1k_to_5k", label: "De R$ 1.000 a R$ 5.000" },
  { value: "from_5k_to_20k", label: "De R$ 5.000 a R$ 20.000" },
  { value: "from_20k_to_50k", label: "De R$ 20.000 a R$ 50.000" },
  { value: "over_50k", label: "Mais de R$ 50.000" },
];

// ─── Preferências depois do pagamento ────────────────────────────────────
export const EVIDENCE_VALUES = ["bank_statement", "comprovabet", "team_guidance"] as const;
export type EvidenceValue = (typeof EVIDENCE_VALUES)[number];
export const EVIDENCE_OPTIONS: Option<EvidenceValue>[] = [
  { value: "bank_statement", label: "Extrato bancário em PDF", description: "O extrato do seu banco mostra os PIX feitos para as casas de apostas." },
  { value: "comprovabet", label: "ComprovaBet", description: "Se você tiver o documento em mãos." },
  { value: "team_guidance", label: "Não tenho documentos", description: "Quero que a equipe me oriente." },
];

/** Frase com a preferência de comprovação, para a confirmação ao cliente. */
export const EVIDENCE_SUMMARY: Record<EvidenceValue, string> = {
  bank_statement: "Comprovação pelo extrato bancário em PDF.",
  comprovabet: "Comprovação pelo ComprovaBet.",
  team_guidance: "A equipe vai orientar você sobre os documentos.",
};

export const CONTACT_CHANNEL_VALUES = ["whatsapp", "phone", "email"] as const;
export type ContactChannelValue = (typeof CONTACT_CHANNEL_VALUES)[number];
export const CONTACT_CHANNELS: Option<ContactChannelValue>[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Ligação" },
  { value: "email", label: "E-mail" },
];

export const CONTACT_PERIOD_VALUES = ["morning", "afternoon", "evening"] as const;
export type ContactPeriodValue = (typeof CONTACT_PERIOD_VALUES)[number];
export const CONTACT_PERIODS: Option<ContactPeriodValue>[] = [
  { value: "morning", label: "Manhã" },
  { value: "afternoon", label: "Tarde" },
  { value: "evening", label: "Noite" },
];

// ─── Etapa 5: controle das apostas e o que aconteceu ─────────────────────
// A maior parte dos casos envolve perda de controle das apostas. A primeira pergunta separa esses casos;
// a segunda mostra só as situações que fazem sentido para cada resposta.
export const CONTROL_LOSS_VALUES = ["yes", "sometimes", "no"] as const;
export type ControlLossValue = (typeof CONTROL_LOSS_VALUES)[number];
export const CONTROL_LOSS_SUMMARY: Record<ControlLossValue, string> = {
  yes: "Perdeu o controle das apostas",
  sometimes: "Perdeu o controle em alguns momentos",
  no: "Não relata perda de controle",
};
export function lostControl(value: string | null | undefined): boolean {
  return value === "yes" || value === "sometimes";
}

export const GAMBLING_SUPPORT_NOTE =
  "Se ainda está difícil parar, procure apoio: o CVV atende 24 horas pelo 188 (ligação gratuita) e o CAPS da sua cidade oferece atendimento gratuito pelo SUS.";

export const SITUATION_VALUES = [
  "chasing_losses",
  "borrowed_money",
  "debts",
  "platform_incentives",
  "limit_or_closure",
  "platform_problem",
  "losses",
  "withdrawal_not_done",
  "balance_not_received",
  "account_blocked",
  "unrecognized_transaction",
  "bonus_issue",
  "other",
] as const;
export type SituationValue = (typeof SITUATION_VALUES)[number];
export const SITUATIONS: Option<SituationValue>[] = [
  { value: "chasing_losses", label: "Apostava para tentar recuperar o que tinha perdido" },
  { value: "borrowed_money", label: "Usei empréstimo, cartão de crédito ou dinheiro de outras pessoas" },
  { value: "debts", label: "Fiquei com dívidas ou deixei de pagar contas" },
  { value: "platform_incentives", label: "Recebia bônus e promoções para continuar apostando" },
  { value: "limit_or_closure", label: "Pedi limite, pausa ou encerramento da conta e o pedido não foi atendido" },
  { value: "platform_problem", label: "Tive problema com saque, saldo ou bloqueio da conta" },
  { value: "losses", label: "Perdi dinheiro apostando" },
  { value: "withdrawal_not_done", label: "Saque não realizado" },
  { value: "balance_not_received", label: "Saldo não recebido" },
  { value: "account_blocked", label: "Conta bloqueada" },
  { value: "unrecognized_transaction", label: "Transação que não reconheço" },
  { value: "bonus_issue", label: "Problema com bônus ou promoção" },
  { value: "other", label: "Outro" },
];

const LOST_CONTROL_SITUATIONS: readonly SituationValue[] = [
  "chasing_losses",
  "borrowed_money",
  "debts",
  "platform_incentives",
  "limit_or_closure",
  "platform_problem",
  "other",
];
const OTHER_SITUATIONS: readonly SituationValue[] = [
  "losses",
  "withdrawal_not_done",
  "balance_not_received",
  "account_blocked",
  "unrecognized_transaction",
  "bonus_issue",
  "limit_or_closure",
  "other",
];

/** Situações oferecidas na segunda tela da etapa 5, conforme a resposta sobre o controle das apostas. */
export function situationValuesFor(control: string | null | undefined): readonly SituationValue[] {
  return lostControl(control) ? LOST_CONTROL_SITUATIONS : OTHER_SITUATIONS;
}

export const DOC_CATEGORY_VALUES = [
  "comprovabet",
  "financial_history",
  "deposit_history",
  "withdrawal_history",
  "bet_history",
  "bank_statement",
  "pix_receipt",
  "other",
] as const;
export type DocCategoryValue = (typeof DOC_CATEGORY_VALUES)[number];
export const DOC_CATEGORIES: (Option<DocCategoryValue> & { short: string })[] = [
  { value: "comprovabet", label: "ComprovaBet anual", short: "ComprovaBet" },
  { value: "financial_history", label: "Histórico financeiro completo", short: "Histórico completo" },
  { value: "deposit_history", label: "Histórico de depósitos", short: "Depósitos" },
  { value: "withdrawal_history", label: "Histórico de saques", short: "Saques" },
  { value: "bet_history", label: "Histórico de apostas ou jogos", short: "Apostas ou jogos" },
  { value: "bank_statement", label: "Extrato bancário", short: "Extrato bancário" },
  { value: "pix_receipt", label: "Comprovante PIX", short: "Comprovante PIX" },
  { value: "other", label: "Outro documento", short: "Outro" },
];

export const REQUEST_REASON_VALUES = [
  "bank_statement_needed",
  "comprovabet_needed",
  "illegible_file",
  "cut_document",
  "cpf_mismatch",
  "wrong_period",
  "not_comprovabet",
  "incomplete_document",
  "insufficient_data",
  "incomplete_history",
  "divergent_values",
  "missing_withdrawals",
  "missing_deposits",
  "other",
] as const;
export type RequestReasonValue = (typeof REQUEST_REASON_VALUES)[number];
export const REQUEST_REASONS: Option<RequestReasonValue>[] = [
  { value: "bank_statement_needed", label: "Extrato bancário com os PIX para as casas de apostas" },
  { value: "comprovabet_needed", label: "ComprovaBet" },
  { value: "illegible_file", label: "Arquivo ilegível" },
  { value: "cut_document", label: "Documento cortado" },
  { value: "cpf_mismatch", label: "Documento de outro CPF" },
  { value: "wrong_period", label: "Período diferente do solicitado" },
  { value: "not_comprovabet", label: "O arquivo não é um ComprovaBet" },
  { value: "incomplete_document", label: "Documento incompleto" },
  { value: "insufficient_data", label: "Dados insuficientes para a análise" },
  { value: "incomplete_history", label: "Histórico incompleto" },
  { value: "divergent_values", label: "Valores divergentes" },
  { value: "missing_withdrawals", label: "Falta histórico de saques" },
  { value: "missing_deposits", label: "Falta histórico de depósitos" },
  { value: "other", label: "Outro" },
];
/** Motivos ligados ao ComprovaBet (aparecem primeiro nas ações rápidas do painel). */
export const COMPROVABET_REASON_VALUES: RequestReasonValue[] = [
  "illegible_file",
  "cut_document",
  "cpf_mismatch",
  "wrong_period",
  "not_comprovabet",
  "incomplete_document",
  "insufficient_data",
  "other",
];

export const COMMITMENT_VERSION = "2026-09-v2";
export function commitmentText(reviewDays: number): string {
  return `Declaro que, por decisão voluntária, permanecerei sem realizar novas apostas durante o período de análise do meu caso, que poderá durar até ${reviewDays} dias úteis.`;
}

export const PRIVACY_CONSENT_TEXT =
  "Concordo com o tratamento dos meus dados, das respostas sobre as minhas apostas e dos documentos que eu enviar para a análise desta solicitação.";

export const NO_PASSWORD_NOTICE =
  "Nunca solicitaremos sua senha da plataforma, senha bancária, código SMS ou código de autenticação.";

export const DEFAULT_NEXT_STEPS =
  "Nossa equipe entrará em contato pelo WhatsApp ou e-mail informados para explicar as próximas etapas do seu caso. Nunca solicitamos senhas ou códigos de acesso.";
