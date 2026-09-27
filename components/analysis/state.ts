// Estado do formulário em etapas: telas, validação por etapa, cálculo e salvamento automático.
import { isValidCpf } from "@/lib/cpf";
import { isValidEmail, normalizePhoneBR } from "@/lib/format";
import type { PreAnalysisStatus } from "@/lib/documents/pre-analysis";
import { PLATFORMS, situationValuesFor, type BetTypeValue, type ControlLossValue, type PeriodValue, type SituationValue } from "@/lib/options";

export type Screen =
  | "type"
  | "typeDetail"
  | "platforms"
  | "period"
  | "amounts"
  | "balance"
  | "control"
  | "situation"
  | "documents"
  | "analysis"
  | "commitment"
  | "contact"
  | "review"
  | "payment";

export const TOTAL_STEPS = 7;

/**
 * Cada etapa numerada tem no máximo 1 ou 2 perguntas; algumas ocupam duas telas curtas.
 * Os dados do solicitante (com o CPF) vêm antes do ComprovaBet: o documento é conferido com esse CPF.
 * Depois da revisão das respostas, o cliente envia o ComprovaBet, que passa pela pré-análise automática;
 * com ela concluída, segue direto para o pagamento. Só com o pagamento aprovado o botão "Solicitar análise" aparece.
 */
export const SCREENS: { id: Screen; step: number | null; label?: string }[] = [
  { id: "type", step: 1 },
  { id: "typeDetail", step: 1 },
  { id: "platforms", step: 2 },
  { id: "period", step: 3 },
  { id: "amounts", step: 4 },
  { id: "balance", step: 4 },
  { id: "control", step: 5 },
  { id: "situation", step: 5 },
  { id: "contact", step: 6 },
  { id: "commitment", step: null, label: "Compromisso" },
  { id: "review", step: null, label: "Revisão" },
  { id: "documents", step: 7 },
  { id: "analysis", step: null, label: "Pré-análise" },
  { id: "payment", step: null, label: "Pagamento" },
];

export type WizardData = {
  betType: BetTypeValue | null;
  sportsKind: string | null;
  casinoGames: string[];
  mainLossArea: string | null;
  platforms: string[];
  otherPlatformEnabled: boolean;
  customPlatforms: string[];
  period: PeriodValue | null;
  depositsCents: number | null;
  withdrawalsCents: number | null;
  hasBalance: boolean | null;
  balanceCents: number | null;
  /** Etapa 5: as apostas saíram do controle? */
  controlLoss: ControlLossValue | null;
  situations: SituationValue[];
  situationOther: string;
  privacyConsent: boolean;
  commitment: boolean;
  fullName: string;
  /** CPF digitado (somente dígitos). Fica só na memória: nunca vai para o salvamento automático. */
  cpf: string;
  /** CPF já registrado no rascunho do servidor, na versão mascarada (***.***.***-00). */
  cpfMasked: string | null;
  email: string;
  whatsapp: string;
  isAdult: boolean;
  /** Aceite das condições do serviço na tela de pagamento (registrado no servidor ao abrir o pagamento). */
  termsAccepted: boolean;
};

export const EMPTY_DATA: WizardData = {
  betType: null,
  sportsKind: null,
  casinoGames: [],
  mainLossArea: null,
  platforms: [],
  otherPlatformEnabled: false,
  customPlatforms: [""],
  period: null,
  depositsCents: null,
  withdrawalsCents: null,
  hasBalance: null,
  balanceCents: null,
  controlLoss: null,
  situations: [],
  situationOther: "",
  privacyConsent: false,
  commitment: false,
  fullName: "",
  cpf: "",
  cpfMasked: null,
  email: "",
  whatsapp: "",
  isAdult: false,
  termsAccepted: false,
};

export type DraftCreds = { id: string; token: string };
export type DraftFile = {
  id: string;
  name: string;
  size: number;
  platform: string | null;
  category: string;
  createdAt: string;
  manualCheck?: boolean;
};

/** Situação do pagamento da análise, como devolvida por GET /api/draft/payment. */
export type PaymentState = {
  status: "none" | "pending" | "approved" | "rejected" | "cancelled" | "refunded";
  method: string | null;
  paidAt: string | null;
  checkoutUrl: string | null;
  termsAcceptedAt: string | null;
  protocol: string | null;
  /** Resultado da última pré-análise automática gravada no servidor. */
  preAnalysis: PreAnalysisStatus | null;
};

export const TERMS_REQUIRED_MESSAGE = "Para continuar, marque a declaração de aceite.";
export const PAYMENT_REQUIRED_MESSAGE = "Conclua o pagamento para solicitar a análise.";

export function draftHeaders(creds: DraftCreds): Record<string, string> {
  return { "x-draft-id": creds.id, "x-draft-token": creds.token };
}

export function cleanPlatformName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Nomes das plataformas selecionadas, na ordem em que aparecem, sem repetição. */
export function selectedPlatformNames(d: WizardData): string[] {
  const names: string[] = PLATFORMS.filter((p) => d.platforms.includes(p.slug)).map((p) => p.name);
  if (d.otherPlatformEnabled) {
    for (const raw of d.customPlatforms) {
      const name = cleanPlatformName(raw);
      if (!name || !/[\p{L}\p{N}]/u.test(name)) continue;
      if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
    }
  }
  return names;
}

export function attachedFiles(files: DraftFile[], names: string[]): DraftFile[] {
  const lower = new Set(names.map((n) => n.toLowerCase()));
  return files.filter((f) => f.category !== "comprovabet" && f.platform && lower.has(f.platform.toLowerCase()));
}

/** Arquivos do ComprovaBet já enviados no rascunho. */
export function comprovabetFiles(files: DraftFile[]): DraftFile[] {
  return files.filter((f) => f.category === "comprovabet");
}

/** Situações marcadas que valem para a resposta atual sobre o controle das apostas. */
export function currentSituations(d: WizardData): SituationValue[] {
  const allowed = situationValuesFor(d.controlLoss);
  return d.situations.filter((s) => allowed.includes(s));
}

/** Perda declarada = depósitos − saques − saldo disponível (negativo vira zero e é sinalizado). */
export function declaredLoss(d: WizardData): { raw: number; loss: number; needsReview: boolean } {
  const raw = (d.depositsCents ?? 0) - (d.withdrawalsCents ?? 0) - (d.hasBalance ? (d.balanceCents ?? 0) : 0);
  return { raw, loss: Math.max(0, raw), needsReview: raw < 0 };
}

export type ContactErrors = Partial<Record<"fullName" | "cpf" | "email" | "whatsapp" | "isAdult", string>>;

export function contactErrors(d: WizardData): ContactErrors {
  const errors: ContactErrors = {};
  const name = d.fullName.trim();
  if (name.length < 5 || name.split(/\s+/).length < 2) errors.fullName = "Informe seu nome completo.";
  if (!d.cpf && !d.cpfMasked) errors.cpf = "Informe seu CPF.";
  else if (d.cpf && !isValidCpf(d.cpf)) errors.cpf = "CPF inválido. Confira os números.";
  if (!isValidEmail(d.email)) errors.email = "Informe um e-mail válido.";
  if (!normalizePhoneBR(d.whatsapp)) errors.whatsapp = "Informe um WhatsApp válido com DDD.";
  if (!d.isAdult) errors.isAdult = "O serviço é exclusivo para maiores de 18 anos.";
  return errors;
}

export type ScreenContext = {
  fileCount: number;
  busy: boolean;
  paid?: boolean;
  /** Resultado conhecido da pré-análise automática (e a mensagem, quando há pendência). */
  analysis?: { status: PreAnalysisStatus; message: string } | null;
};

export const ANALYSIS_REQUIRED_MESSAGE = "Aguarde a pré-análise do seu ComprovaBet.";

export function screenError(screen: Screen, d: WizardData, ctx: ScreenContext): string | null {
  switch (screen) {
    case "type":
      return d.betType ? null : "Escolha uma opção para continuar.";
    case "typeDetail":
      if (d.betType === "sports") return d.sportsKind ? null : "Escolha uma opção para continuar.";
      if (d.betType === "casino") return d.casinoGames.length ? null : "Escolha ao menos um jogo.";
      if (d.betType === "both") return d.mainLossArea ? null : "Escolha uma opção para continuar.";
      return "Volte e informe onde aconteceram suas perdas.";
    case "platforms":
      if (d.otherPlatformEnabled && !d.customPlatforms.some((n) => cleanPlatformName(n))) return "Informe o nome da plataforma.";
      return selectedPlatformNames(d).length ? null : "Selecione ao menos uma plataforma.";
    case "period":
      return d.period ? null : "Escolha uma opção para continuar.";
    case "amounts":
      return d.depositsCents && d.depositsCents > 0 ? null : "Informe o valor aproximado depositado.";
    case "balance":
      if (d.hasBalance === null) return "Informe se ainda existe saldo nas plataformas.";
      return d.hasBalance && !(d.balanceCents && d.balanceCents > 0) ? "Informe o saldo aproximado." : null;
    case "control":
      return d.controlLoss ? null : "Escolha uma opção para continuar.";
    case "situation": {
      if (!d.controlLoss) return "Volte e responda se as apostas saíram do seu controle.";
      const chosen = currentSituations(d);
      if (!chosen.length) return "Escolha ao menos uma opção.";
      return chosen.includes("other") && !d.situationOther.trim() ? "Descreva a situação em poucas palavras." : null;
    }
    case "documents":
      if (!d.privacyConsent) return "Para enviar documentos, marque a autorização de tratamento dos dados.";
      if (ctx.busy) return "Aguarde o envio dos arquivos terminar.";
      return ctx.fileCount > 0 ? null : "Envie o seu ComprovaBet para continuar.";
    case "commitment":
      return d.commitment ? null : "Marque o compromisso para continuar.";
    case "contact":
      return Object.values(contactErrors(d))[0] ?? null;
    case "review":
      return null;
    case "analysis":
      if (!ctx.analysis) return ANALYSIS_REQUIRED_MESSAGE;
      return ctx.analysis.status === "blocked" ? ctx.analysis.message : null;
    case "payment":
      if (ctx.paid) return null;
      return d.termsAccepted ? PAYMENT_REQUIRED_MESSAGE : TERMS_REQUIRED_MESSAGE;
  }
}

/** Primeira tela com resposta pendente antes do pagamento (a revisão e o pagamento não têm respostas próprias). */
export function firstInvalidScreen(d: WizardData, ctx: ScreenContext): Screen | null {
  return SCREENS.find((s) => s.id !== "review" && s.id !== "payment" && screenError(s.id, d, ctx))?.id ?? null;
}

/** Arquivos analisados continuam os mesmos? (a pré-análise é refeita quando o ComprovaBet muda) */
export function sameDocuments(analyzed: readonly string[], current: readonly string[]): boolean {
  if (analyzed.length !== current.length) return false;
  const set = new Set(analyzed);
  return current.every((id) => set.has(id));
}

/** Liga o campo apontado pelo servidor à tela onde ele é corrigido. */
export const FIELD_SCREEN: Record<string, Screen> = {
  betType: "type",
  sportsKind: "typeDetail",
  casinoGames: "typeDetail",
  mainLossArea: "typeDetail",
  platforms: "platforms",
  customPlatforms: "platforms",
  period: "period",
  depositsCents: "amounts",
  withdrawalsCents: "amounts",
  hasBalance: "balance",
  balanceCents: "balance",
  controlLoss: "control",
  situations: "situation",
  situationOther: "situation",
  privacyConsent: "documents",
  documents: "documents",
  commitment: "commitment",
  fullName: "contact",
  cpf: "contact",
  email: "contact",
  whatsapp: "contact",
  isAdult: "contact",
  accept: "payment",
  payment: "payment",
  analysis: "analysis",
};

export function buildPayload(d: WizardData) {
  return {
    betType: d.betType,
    sportsKind: d.betType === "sports" ? d.sportsKind : null,
    casinoGames: d.betType === "casino" ? d.casinoGames : [],
    mainLossArea: d.betType === "both" ? d.mainLossArea : null,
    platforms: d.platforms,
    otherPlatformEnabled: d.otherPlatformEnabled,
    customPlatforms: d.otherPlatformEnabled ? d.customPlatforms.map(cleanPlatformName).filter(Boolean) : [],
    period: d.period,
    depositsCents: d.depositsCents ?? 0,
    withdrawalsCents: d.withdrawalsCents ?? 0,
    hasBalance: d.hasBalance === true,
    balanceCents: d.hasBalance ? d.balanceCents : null,
    controlLoss: d.controlLoss,
    situations: currentSituations(d),
    situationOther: currentSituations(d).includes("other") ? d.situationOther.trim() : "",
    privacyConsent: d.privacyConsent,
    commitment: d.commitment,
    fullName: d.fullName.trim().replace(/\s+/g, " "),
    email: d.email.trim(),
    whatsapp: d.whatsapp,
    isAdult: d.isAdult,
  };
}

// ─── Salvamento automático no navegador ───────────────────────────────────
const STORAGE_KEY = "analise:v1";

export type SavedProgress = { v: 1; screen: Screen; data: WizardData; draft: DraftCreds | null; savedAt: number };

export function loadProgress(): SavedProgress | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedProgress>;
    if (parsed.v !== 1 || !parsed.data || !SCREENS.some((s) => s.id === parsed.screen)) return null;
    const draft = parsed.draft && typeof parsed.draft.id === "string" && typeof parsed.draft.token === "string" ? parsed.draft : null;
    const data = { ...EMPTY_DATA, ...parsed.data, cpf: "" };
    return { v: 1, screen: parsed.screen as Screen, data, draft, savedAt: Number(parsed.savedAt) || Date.now() };
  } catch {
    return null;
  }
}

export function saveProgress(progress: SavedProgress): boolean {
  try {
    // O CPF completo nunca é salvo no navegador; fica só a versão mascarada vinda do servidor.
    const safe: SavedProgress = { ...progress, data: { ...progress.data, cpf: "" } };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

export function clearProgress(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* navegação privada ou armazenamento indisponível */
  }
}

/** Ao retomar, volta para a primeira etapa incompleta anterior à tela salva. */
export function resumeScreen(saved: Screen, d: WizardData): Screen {
  // A pré-análise é refeita ao abrir: retomar nela é o mesmo que voltar ao envio do documento.
  const target: Screen = saved === "analysis" ? "documents" : saved;
  const savedIndex = SCREENS.findIndex((s) => s.id === target);
  for (let i = 0; i < savedIndex; i++) {
    const s = SCREENS[i];
    // Documento e pré-análise dependem do servidor: são conferidos nas próprias telas.
    if (s && s.id !== "documents" && s.id !== "analysis" && screenError(s.id, d, { fileCount: 1, busy: false })) return s.id;
  }
  return target;
}
