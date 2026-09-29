import { z } from "zod";
import { isValidEmail, normalizePhoneBR } from "@/lib/format";
import { ALREADY_REQUESTED_MESSAGE } from "@/lib/intake";
import {
  BET_TYPE_VALUES,
  CASINO_GAME_VALUES,
  CONTACT_CHANNEL_VALUES,
  CONTACT_PERIOD_VALUES,
  CONTROL_LOSS_VALUES,
  EVIDENCE_VALUES,
  LOSS_RANGE_VALUES,
  MAIN_LOSS_VALUES,
  PERIOD_VALUES,
  PLATFORM_SLUGS,
  SITUATION_VALUES,
  SPORTS_KIND_VALUES,
  situationValuesFor,
} from "@/lib/options";

// Validação no servidor de tudo o que chega do formulário. Nada é aceito sem passar por aqui.

const platformFields = {
  platforms: z.array(z.enum(PLATFORM_SLUGS)).max(PLATFORM_SLUGS.length),
  otherPlatformEnabled: z.boolean(),
  customPlatforms: z.array(z.string().trim().max(60, "Nome da plataforma muito longo.")).max(5),
};

const contactFields = {
  fullName: z.string().trim().min(5, "Informe seu nome completo.").max(120, "Nome muito longo."),
  email: z.string().trim().toLowerCase().max(160, "E-mail muito longo."),
  whatsapp: z.string().trim().max(30),
  isAdult: z.literal(true, { errorMap: () => ({ message: "O serviço é exclusivo para maiores de 18 anos." }) }),
  privacyConsent: z.literal(true, { errorMap: () => ({ message: "É necessário autorizar o tratamento dos dados." }) }),
};

type IssueAdder = (path: string, message: string) => void;

function checkPlatformsAndContact(d: { platforms: string[]; otherPlatformEnabled: boolean; customPlatforms: string[]; fullName: string; email: string; whatsapp: string }, issue: IssueAdder) {
  const hasCustom = d.otherPlatformEnabled && d.customPlatforms.some((n) => /[\p{L}\p{N}]/u.test(n));
  if (d.platforms.length === 0 && !hasCustom) issue("platforms", "Selecione ao menos uma casa de apostas.");
  if (d.fullName.split(/\s+/).filter(Boolean).length < 2) issue("fullName", "Informe seu nome completo.");
  if (!isValidEmail(d.email)) issue("email", "Informe um e-mail válido.");
  if (!normalizePhoneBR(d.whatsapp)) issue("whatsapp", "Informe um WhatsApp válido com DDD.");
}

/**
 * Formulário atual, sem documento: primeira solicitação do CPF, casas, período e faixa de perda, e os dados do
 * solicitante. O CPF não vem aqui: fica registrado no rascunho.
 */
export const submissionSchema = z
  .object({
    neverRequested: z.literal(true, { errorMap: () => ({ message: ALREADY_REQUESTED_MESSAGE }) }),
    ...platformFields,
    period: z.enum(PERIOD_VALUES, { errorMap: () => ({ message: "Informe há quanto tempo você aposta nessas casas." }) }),
    lossRange: z.enum(LOSS_RANGE_VALUES, { errorMap: () => ({ message: "Informe quanto você perdeu, mais ou menos." }) }),
    ...contactFields,
  })
  .superRefine((d, ctx) => checkPlatformsAndContact(d, (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })));

export type SubmissionData = z.infer<typeof submissionSchema>;

/** Como o cliente prefere seguir depois do pagamento (comprovação, canal e horário do contato). */
export const preferencesSchema = z.object({
  evidence: z.enum(EVIDENCE_VALUES, { errorMap: () => ({ message: "Escolha como prefere enviar a comprovação." }) }),
  channel: z.enum(CONTACT_CHANNEL_VALUES, { errorMap: () => ({ message: "Escolha por onde prefere falar com a equipe." }) }),
  contactPeriod: z.enum(CONTACT_PERIOD_VALUES, { errorMap: () => ({ message: "Escolha o melhor horário para o contato." }) }),
});

export type PreferencesData = z.infer<typeof preferencesSchema>;

// ─── Formulário anterior (com o ComprovaBet no envio) ──────────────────────
// Um PIX gerado no formulário anterior pode ser pago depois da atualização do site: com a confirmação, a
// solicitação é concluída com essas respostas, guardadas no rascunho.

const MAX_CENTS = 9_999_999_999; // R$ 99.999.999,99
const cents = z
  .number({ invalid_type_error: "Valor inválido." })
  .int("Valor inválido.")
  .min(0, "Valores não podem ser negativos.")
  .max(MAX_CENTS, "Valor acima do permitido.");

export const legacySubmissionSchema = z
  .object({
    betType: z.enum(BET_TYPE_VALUES, { errorMap: () => ({ message: "Informe onde aconteceram as perdas." }) }),
    sportsKind: z.enum(SPORTS_KIND_VALUES).nullable(),
    casinoGames: z.array(z.enum(CASINO_GAME_VALUES)).max(CASINO_GAME_VALUES.length),
    mainLossArea: z.enum(MAIN_LOSS_VALUES).nullable(),
    ...platformFields,
    period: z.enum(PERIOD_VALUES, { errorMap: () => ({ message: "Informe há quanto tempo utiliza as plataformas." }) }),
    depositsCents: cents.refine((v) => v > 0, "Informe o valor aproximado depositado."),
    withdrawalsCents: cents,
    hasBalance: z.boolean(),
    balanceCents: cents.nullable(),
    controlLoss: z.enum(CONTROL_LOSS_VALUES, { errorMap: () => ({ message: "Responda se as apostas saíram do seu controle." }) }),
    situations: z.array(z.enum(SITUATION_VALUES)).min(1, "Informe a situação do seu caso.").max(SITUATION_VALUES.length),
    situationOther: z.string().trim().max(140, "Use no máximo 140 caracteres."),
    commitment: z.literal(true, { errorMap: () => ({ message: "É necessário aceitar o compromisso voluntário." }) }),
    ...contactFields,
  })
  .superRefine((d, ctx) => {
    const issue: IssueAdder = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (d.betType === "sports" && !d.sportsKind) issue("sportsKind", "Informe o tipo de aposta que utilizava mais.");
    if (d.betType === "casino" && d.casinoGames.length === 0) issue("casinoGames", "Informe os jogos que utilizava.");
    if (d.betType === "both" && !d.mainLossArea) issue("mainLossArea", "Informe onde ocorreu a maior parte das perdas.");
    if (d.hasBalance && !(d.balanceCents && d.balanceCents > 0)) issue("balanceCents", "Informe o saldo aproximado.");
    const allowed = situationValuesFor(d.controlLoss);
    if (d.situations.some((s) => !allowed.includes(s))) issue("situations", "Revise o que aconteceu no seu caso.");
    if (d.situations.includes("other") && !d.situationOther) issue("situationOther", "Descreva a situação em poucas palavras.");
    checkPlatformsAndContact(d, issue);
  });

export type LegacySubmissionData = z.infer<typeof legacySubmissionSchema>;

/** Respostas gravadas no rascunho: do formulário atual ou do anterior. */
export type IntakeAnswers = { kind: "current"; data: SubmissionData } | { kind: "legacy"; data: LegacySubmissionData };

export function parseStoredAnswers(raw: unknown): IntakeAnswers | null {
  const current = submissionSchema.safeParse(raw);
  if (current.success) return { kind: "current", data: current.data };
  const legacy = legacySubmissionSchema.safeParse(raw);
  return legacy.success ? { kind: "legacy", data: legacy.data } : null;
}
