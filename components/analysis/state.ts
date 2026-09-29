// Estado do formulário em etapas: telas, validação por etapa e salvamento automático.
import { isValidCpf } from "@/lib/cpf";
import { isValidEmail, normalizePhoneBR } from "@/lib/format";
import { ALREADY_REQUESTED_MESSAGE } from "@/lib/intake";
import {
  PLATFORMS,
  type ContactChannelValue,
  type ContactPeriodValue,
  type EvidenceValue,
  type LossRangeValue,
  type PeriodValue,
  type PreviousRequestValue,
} from "@/lib/options";

export type Screen = "previous" | "platforms" | "period" | "loss" | "contact" | "result" | "payment" | "preferences";

export const TOTAL_STEPS = 5;

/**
 * Cinco perguntas curtas, sem documento: primeira solicitação do CPF, casas, período, faixa de perda e os dados
 * do solicitante. Em seguida, o resultado na hora e o pagamento da taxa por PIX. Com o pagamento confirmado, o
 * cliente informa como prefere seguir, e a equipe entra em contato em até 1 dia útil.
 */
export const SCREENS: { id: Screen; step: number | null; label?: string }[] = [
  { id: "previous", step: 1 },
  { id: "platforms", step: 2 },
  { id: "period", step: 3 },
  { id: "loss", step: 4 },
  { id: "contact", step: 5 },
  { id: "result", step: null, label: "Resultado" },
  { id: "payment", step: null, label: "Pagamento" },
  { id: "preferences", step: null, label: "Contato com a equipe" },
];

export type WizardData = {
  /** Já pediu o estorno dessas perdas? "yes" encerra o formulário (uma solicitação por CPF). */
  previousRequest: PreviousRequestValue | null;
  platforms: string[];
  otherPlatformEnabled: boolean;
  customPlatforms: string[];
  period: PeriodValue | null;
  lossRange: LossRangeValue | null;
  privacyConsent: boolean;
  fullName: string;
  /** CPF digitado (somente dígitos). Fica só na memória: nunca vai para o salvamento automático. */
  cpf: string;
  /** CPF já registrado no rascunho do servidor, na versão mascarada (***.***.***-00). */
  cpfMasked: string | null;
  email: string;
  whatsapp: string;
  isAdult: boolean;
  /** Aceite das condições do serviço na tela de pagamento (registrado no servidor ao gerar o PIX). */
  termsAccepted: boolean;
  /** Preferências depois do pagamento. */
  evidence: EvidenceValue | null;
  contactChannel: ContactChannelValue | null;
  contactPeriod: ContactPeriodValue | null;
};

export const EMPTY_DATA: WizardData = {
  previousRequest: null,
  platforms: [],
  otherPlatformEnabled: false,
  customPlatforms: [""],
  period: null,
  lossRange: null,
  privacyConsent: false,
  fullName: "",
  cpf: "",
  cpfMasked: null,
  email: "",
  whatsapp: "",
  isAdult: false,
  termsAccepted: false,
  evidence: null,
  contactChannel: null,
  contactPeriod: null,
};

export type DraftCreds = { id: string; token: string };

/** PIX em aberto (QR Code e copia e cola), como devolvido pelo servidor. */
export type PixState = {
  transactionId: string;
  copyPaste: string;
  /** Imagem do QR Code (data URI). */
  qrCode: string;
  expiresAt: string | null;
  amountCents: number;
  createdAt: string;
};

/** Situação do pagamento da taxa, como devolvida por GET /api/draft/payment (lida do banco do site). */
export type PaymentState = {
  status: "none" | "pending" | "paid" | "failed" | "cancelled" | "expired" | "refunded";
  method: string | null;
  paidAt: string | null;
  termsAcceptedAt: string | null;
  protocol: string | null;
  /** PIX aguardando pagamento (só enquanto está em aberto). */
  pix: PixState | null;
  /** PIX simulado (modo demonstração). */
  demo: boolean;
};

export const TERMS_REQUIRED_MESSAGE = "Para continuar, marque a declaração de aceite.";
export const PAYMENT_REQUIRED_MESSAGE = "Conclua o pagamento do PIX para continuar.";

export function draftHeaders(creds: DraftCreds): Record<string, string> {
  return { "x-draft-id": creds.id, "x-draft-token": creds.token };
}

export function cleanPlatformName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Nomes das casas selecionadas, na ordem em que aparecem, sem repetição. */
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

export type ContactErrors = Partial<Record<"fullName" | "cpf" | "email" | "whatsapp" | "isAdult" | "privacyConsent", string>>;

export function contactErrors(d: WizardData): ContactErrors {
  const errors: ContactErrors = {};
  const name = d.fullName.trim();
  if (name.length < 5 || name.split(/\s+/).length < 2) errors.fullName = "Informe seu nome completo.";
  if (!d.cpf && !d.cpfMasked) errors.cpf = "Informe seu CPF.";
  else if (d.cpf && !isValidCpf(d.cpf)) errors.cpf = "CPF inválido. Confira os números.";
  if (!isValidEmail(d.email)) errors.email = "Informe um e-mail válido.";
  if (!normalizePhoneBR(d.whatsapp)) errors.whatsapp = "Informe um WhatsApp válido com DDD.";
  if (!d.isAdult) errors.isAdult = "O serviço é exclusivo para maiores de 18 anos.";
  if (!d.privacyConsent) errors.privacyConsent = "Para continuar, autorize o tratamento dos seus dados.";
  return errors;
}

export type PreferenceErrors = Partial<Record<"evidence" | "contactChannel" | "contactPeriod", string>>;

export function preferenceErrors(d: WizardData): PreferenceErrors {
  const errors: PreferenceErrors = {};
  if (!d.evidence) errors.evidence = "Escolha como prefere enviar a comprovação.";
  if (!d.contactChannel) errors.contactChannel = "Escolha por onde prefere falar com a equipe.";
  if (!d.contactPeriod) errors.contactPeriod = "Escolha o melhor horário para o contato.";
  return errors;
}

export type ScreenContext = { paid?: boolean };

export function screenError(screen: Screen, d: WizardData, ctx: ScreenContext = {}): string | null {
  switch (screen) {
    case "previous":
      if (!d.previousRequest) return "Escolha uma opção para continuar.";
      return d.previousRequest === "yes" ? ALREADY_REQUESTED_MESSAGE : null;
    case "platforms":
      if (d.otherPlatformEnabled && !d.customPlatforms.some((n) => cleanPlatformName(n))) return "Informe o nome da casa de apostas.";
      return selectedPlatformNames(d).length ? null : "Selecione ao menos uma casa de apostas.";
    case "period":
      return d.period ? null : "Escolha uma opção para continuar.";
    case "loss":
      return d.lossRange ? null : "Escolha uma faixa para continuar.";
    case "contact":
      return Object.values(contactErrors(d))[0] ?? null;
    case "result":
      return null;
    case "payment":
      if (ctx.paid) return null;
      return d.termsAccepted ? PAYMENT_REQUIRED_MESSAGE : TERMS_REQUIRED_MESSAGE;
    case "preferences":
      return Object.values(preferenceErrors(d))[0] ?? null;
  }
}

/** Primeira tela com resposta pendente antes do pagamento. */
export function firstInvalidScreen(d: WizardData): Screen | null {
  return SCREENS.find((s) => s.step !== null && screenError(s.id, d))?.id ?? null;
}

/** Liga o campo apontado pelo servidor à tela onde ele é corrigido. */
export const FIELD_SCREEN: Record<string, Screen> = {
  neverRequested: "previous",
  platforms: "platforms",
  customPlatforms: "platforms",
  period: "period",
  lossRange: "loss",
  fullName: "contact",
  cpf: "contact",
  email: "contact",
  whatsapp: "contact",
  isAdult: "contact",
  privacyConsent: "contact",
  draft: "contact",
  accept: "payment",
  payment: "payment",
  preferences: "preferences",
};

export function buildPayload(d: WizardData) {
  return {
    neverRequested: d.previousRequest === "no",
    platforms: d.platforms,
    otherPlatformEnabled: d.otherPlatformEnabled,
    customPlatforms: d.otherPlatformEnabled ? d.customPlatforms.map(cleanPlatformName).filter(Boolean) : [],
    period: d.period,
    lossRange: d.lossRange,
    privacyConsent: d.privacyConsent,
    fullName: d.fullName.trim().replace(/\s+/g, " "),
    email: d.email.trim(),
    whatsapp: d.whatsapp,
    isAdult: d.isAdult,
  };
}

export function buildPreferences(d: WizardData) {
  return { evidence: d.evidence, channel: d.contactChannel, contactPeriod: d.contactPeriod };
}

// ─── Salvamento automático no navegador ───────────────────────────────────
// Chave nova para o formulário sem documento: o preenchimento salvo pelo formulário anterior é ignorado.
const STORAGE_KEY = "analise:v2";

export type SavedProgress = { v: 2; screen: Screen; data: WizardData; draft: DraftCreds | null; savedAt: number };

export function loadProgress(): SavedProgress | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedProgress>;
    if (parsed.v !== 2 || !parsed.data || !SCREENS.some((s) => s.id === parsed.screen)) return null;
    const draft = parsed.draft && typeof parsed.draft.id === "string" && typeof parsed.draft.token === "string" ? parsed.draft : null;
    const data = { ...EMPTY_DATA, ...parsed.data, cpf: "" };
    return { v: 2, screen: parsed.screen as Screen, data, draft, savedAt: Number(parsed.savedAt) || Date.now() };
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
  const savedIndex = SCREENS.findIndex((s) => s.id === saved);
  for (let i = 0; i < savedIndex; i++) {
    const s = SCREENS[i];
    if (s && s.step !== null && screenError(s.id, d)) return s.id;
  }
  return saved;
}
