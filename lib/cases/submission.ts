import { z } from "zod";
import { isValidEmail, normalizePhoneBR } from "@/lib/format";
import {
  BET_TYPE_VALUES,
  CASINO_GAME_VALUES,
  CONTROL_LOSS_VALUES,
  MAIN_LOSS_VALUES,
  PERIOD_VALUES,
  PLATFORM_SLUGS,
  SITUATION_VALUES,
  SPORTS_KIND_VALUES,
  situationValuesFor,
} from "@/lib/options";

// Validação no servidor de tudo o que chega do formulário. Nada é aceito sem passar por aqui.

const MAX_CENTS = 9_999_999_999; // R$ 99.999.999,99
const cents = z
  .number({ invalid_type_error: "Valor inválido." })
  .int("Valor inválido.")
  .min(0, "Valores não podem ser negativos.")
  .max(MAX_CENTS, "Valor acima do permitido.");

export const submissionSchema = z
  .object({
    betType: z.enum(BET_TYPE_VALUES, { errorMap: () => ({ message: "Informe onde aconteceram as perdas." }) }),
    sportsKind: z.enum(SPORTS_KIND_VALUES).nullable(),
    casinoGames: z.array(z.enum(CASINO_GAME_VALUES)).max(CASINO_GAME_VALUES.length),
    mainLossArea: z.enum(MAIN_LOSS_VALUES).nullable(),
    platforms: z.array(z.enum(PLATFORM_SLUGS)).max(PLATFORM_SLUGS.length),
    otherPlatformEnabled: z.boolean(),
    customPlatforms: z.array(z.string().trim().max(60, "Nome da plataforma muito longo.")).max(5),
    period: z.enum(PERIOD_VALUES, { errorMap: () => ({ message: "Informe há quanto tempo utiliza as plataformas." }) }),
    depositsCents: cents.refine((v) => v > 0, "Informe o valor aproximado depositado."),
    withdrawalsCents: cents,
    hasBalance: z.boolean(),
    balanceCents: cents.nullable(),
    controlLoss: z.enum(CONTROL_LOSS_VALUES, { errorMap: () => ({ message: "Responda se as apostas saíram do seu controle." }) }),
    situations: z.array(z.enum(SITUATION_VALUES)).min(1, "Informe a situação do seu caso.").max(SITUATION_VALUES.length),
    situationOther: z.string().trim().max(140, "Use no máximo 140 caracteres."),
    privacyConsent: z.literal(true, { errorMap: () => ({ message: "É necessário autorizar o tratamento dos dados." }) }),
    commitment: z.literal(true, { errorMap: () => ({ message: "É necessário aceitar o compromisso voluntário." }) }),
    fullName: z.string().trim().min(5, "Informe seu nome completo.").max(120, "Nome muito longo."),
    email: z.string().trim().toLowerCase().max(160, "E-mail muito longo."),
    whatsapp: z.string().trim().max(30),
    isAdult: z.literal(true, { errorMap: () => ({ message: "O serviço é exclusivo para maiores de 18 anos." }) }),
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (d.betType === "sports" && !d.sportsKind) issue("sportsKind", "Informe o tipo de aposta que utilizava mais.");
    if (d.betType === "casino" && d.casinoGames.length === 0) issue("casinoGames", "Informe os jogos que utilizava.");
    if (d.betType === "both" && !d.mainLossArea) issue("mainLossArea", "Informe onde ocorreu a maior parte das perdas.");
    const hasCustom = d.otherPlatformEnabled && d.customPlatforms.some((n) => /[\p{L}\p{N}]/u.test(n));
    if (d.platforms.length === 0 && !hasCustom) issue("platforms", "Selecione ao menos uma plataforma.");
    if (d.hasBalance && !(d.balanceCents && d.balanceCents > 0)) issue("balanceCents", "Informe o saldo aproximado.");
    const allowed = situationValuesFor(d.controlLoss);
    if (d.situations.some((s) => !allowed.includes(s))) issue("situations", "Revise o que aconteceu no seu caso.");
    if (d.situations.includes("other") && !d.situationOther) issue("situationOther", "Descreva a situação em poucas palavras.");
    if (d.fullName.split(/\s+/).filter(Boolean).length < 2) issue("fullName", "Informe seu nome completo.");
    if (!isValidEmail(d.email)) issue("email", "Informe um e-mail válido.");
    if (!normalizePhoneBR(d.whatsapp)) issue("whatsapp", "Informe um WhatsApp válido com DDD.");
  });

export type SubmissionData = z.infer<typeof submissionSchema>;
