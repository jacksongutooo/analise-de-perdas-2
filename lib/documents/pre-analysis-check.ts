// Conferências da pré-análise automática do ComprovaBet (funções puras, sem banco).
import { checkCpfInText, maskCpf, yearsInText } from "@/lib/cpf";
import { plain } from "@/lib/extraction/normalize";
import { extractFromLines } from "@/lib/extraction/text";
import { divergenceOf } from "@/lib/status";
import {
  PRE_ANALYSIS_APPROVED_MESSAGE,
  PRE_ANALYSIS_REVIEW_MESSAGE,
  PRE_CHECK_ORDER,
  PRE_CHECK_REQUIRED,
  type PreAnalysis,
  type PreAnalysisStatus,
  type PreCheck,
  type PreCheckKey,
  type PreCheckState,
} from "./pre-analysis";

const TEAM = "a conferência será feita pela equipe";

const COMPROVABET_WORD = /\bcomprova ?bet\b/;
const DEPOSIT_WORD = /\b(depositos?|deposits?|recargas?)\b/;
const OTHER_BET_WORD = /\b(saques?|retiradas?|apostas?|premios?)\b/;

const KNOWN_PLATFORMS: [RegExp, string][] = [
  [/\bbetano\b/, "Betano"],
  [/\bbet ?365\b/, "Bet365"],
  [/\bkto\b/, "KTO"],
  [/\bsuperbet\b/, "Superbet"],
  [/\bbetnacional\b/, "Betnacional"],
  [/\bsportingbet\b/, "Sportingbet"],
  [/\bblaze\b/, "Blaze"],
  [/\bestrela ?bet\b/, "EstrelaBet"],
  [/\bnovibet\b/, "Novibet"],
  [/\bpixbet\b/, "Pixbet"],
  [/\besportes da sorte\b/, "Esportes da Sorte"],
  [/\bbetfair\b/, "Betfair"],
  [/\bvai ?de ?bet\b/, "VaiDeBet"],
  [/\b1xbet\b/, "1xBet"],
  [/\bparimatch\b/, "Parimatch"],
];

/** Plataformas conhecidas citadas no texto. */
export function platformsInText(text: string): string[] {
  const t = plain(text);
  return KNOWN_PLATFORMS.filter(([pattern]) => pattern.test(t)).map(([, name]) => name);
}

const compact = (value: string) => plain(value).replace(/[^a-z0-9]/g, "");

/** Totais de depósitos e saques do documento: os declarados como "total" ou, sem eles, a soma das linhas. */
export function documentTotals(lines: string[]): { depositsCents: number | null; withdrawalsCents: number | null } {
  const result = extractFromLines(lines);
  const sum = (type: "deposit" | "withdrawal") => {
    const list = result.movements.filter((m) => m.type === type);
    return list.length ? list.reduce((acc, m) => acc + m.amountCents, 0) : null;
  };
  return {
    depositsCents: result.statedTotals?.depositsCents ?? sum("deposit"),
    withdrawalsCents: result.statedTotals?.withdrawalsCents ?? sum("withdrawal"),
  };
}

export type DocumentEvaluation = { documentId: string; name: string; approved: boolean; blocked: boolean; checks: PreCheck[] };

/**
 * Conferência de um arquivo. lines = texto do PDF (null quando não há texto legível: imagem, PDF
 * digitalizado ou protegido).
 */
export function evaluateComprovaBet(input: {
  documentId: string;
  name: string;
  kind: "pdf" | "image";
  lines: string[] | null;
  cpf: string;
  referenceYear: number;
  declaredPlatforms: string[];
  declaredDepositsCents: number;
  declaredWithdrawalsCents: number;
}): DocumentEvaluation {
  const text = (input.lines ?? []).join("\n");
  const checks: PreCheck[] = [];
  const add = (key: PreCheckKey, state: PreCheckState, detail: string) => checks.push({ key, state, detail });

  if (!text.trim()) {
    add(
      "reading",
      "review",
      input.kind === "image"
        ? `Foto do documento: a leitura automática não está disponível e ${TEAM}.`
        : `PDF sem texto legível (digitalizado ou protegido): ${TEAM}.`,
    );
    for (const key of PRE_CHECK_ORDER.slice(1)) add(key, "review", `Conferência pela equipe.`);
    return { documentId: input.documentId, name: input.name, approved: false, blocked: false, checks };
  }
  add("reading", "ok", "Documento lido automaticamente.");

  // CPF
  const cpf = checkCpfInText(input.cpf, text);
  if (cpf.result === "match") add("cpf", "ok", `Confere com o CPF informado (${maskCpf(input.cpf)}).`);
  else if (cpf.result === "mismatch") add("cpf", "fail", "O CPF do documento não corresponde ao CPF informado.");
  else if (cpf.result === "masked") add("cpf", "review", `O documento mostra o CPF mascarado: ${TEAM}.`);
  else add("cpf", "review", `CPF não encontrado no texto do documento: ${TEAM}.`);

  // Ano de referência
  const years = yearsInText(text);
  if (years.includes(input.referenceYear)) add("year", "ok", `Documento referente a ${input.referenceYear}.`);
  else if (years.length) add("year", "fail", `O documento parece ser de ${years.join(", ")}, e não de ${input.referenceYear}.`);
  else add("year", "review", `Ano não identificado no texto: ${TEAM}.`);

  // Tipo do documento
  const lower = plain(text);
  if (COMPROVABET_WORD.test(lower)) add("type", "ok", "ComprovaBet identificado.");
  else if (DEPOSIT_WORD.test(lower) && OTHER_BET_WORD.test(lower)) add("type", "ok", "Demonstrativo de apostas identificado.");
  else add("type", "review", `Tipo de documento não identificado automaticamente: ${TEAM}.`);

  // Plataformas (informativo)
  const found = new Set(platformsInText(text));
  const declaredFound = input.declaredPlatforms.filter((name) => {
    if (found.has(name)) return true;
    const c = compact(name);
    return c.length >= 3 && compact(text).includes(c);
  });
  if (declaredFound.length) add("platforms", "ok", `${declaredFound.join(", ")} no documento.`);
  else if (found.size) add("platforms", "review", `O documento cita ${[...found].join(", ")}: a equipe confere com as plataformas informadas.`);
  else add("platforms", "review", `Plataformas não identificadas no texto: ${TEAM}.`);

  // Valores (informativo): só a compatibilidade, sem expor os valores lidos.
  const totals = documentTotals(input.lines ?? []);
  if (totals.depositsCents === null) {
    add("values", "review", `Valores não identificados automaticamente: ${TEAM}.`);
  } else {
    const depositsOff = divergenceOf(input.declaredDepositsCents, totals.depositsCents) !== null;
    const withdrawalsOff = totals.withdrawalsCents !== null && divergenceOf(input.declaredWithdrawalsCents, totals.withdrawalsCents) !== null;
    if (depositsOff || withdrawalsOff) add("values", "review", "Diferentes dos valores informados: a equipe vai considerar os valores do documento.");
    else add("values", "ok", "Compatíveis com os valores informados.");
  }

  const state = (key: PreCheckKey) => checks.find((c) => c.key === key)?.state;
  return {
    documentId: input.documentId,
    name: input.name,
    approved: PRE_CHECK_REQUIRED.every((key) => state(key) === "ok"),
    blocked: checks.some((c) => c.state === "fail"),
    checks,
  };
}

/**
 * Resultado do ComprovaBet (pode ter mais de um arquivo): bloqueia se algum arquivo é de outro CPF ou de outro
 * ano; aprova se ao menos um arquivo passou em todas as conferências obrigatórias; senão, fica para a equipe.
 */
export function aggregatePreAnalysis(evaluations: DocumentEvaluation[], referenceYear: number, now = new Date()): PreAnalysis {
  const blocked = evaluations.find((e) => e.blocked);
  const approved = evaluations.filter((e) => e.approved && !e.blocked);
  const status: PreAnalysisStatus = !evaluations.length || blocked ? "blocked" : approved.length ? "approved" : "review";
  const representative = blocked ?? approved[0] ?? evaluations.find((e) => e.checks[0]?.state === "ok") ?? evaluations[0];
  let message = status === "approved" ? PRE_ANALYSIS_APPROVED_MESSAGE : PRE_ANALYSIS_REVIEW_MESSAGE;
  if (!evaluations.length) message = "Envie o seu ComprovaBet para continuar.";
  else if (blocked) {
    const failed = blocked.checks.find((c) => c.state === "fail");
    message =
      failed?.key === "cpf"
        ? "O CPF identificado no documento não corresponde ao CPF informado no cadastro. Confira os dados e envie o documento correto."
        : `O arquivo “${blocked.name}” não parece ser do ComprovaBet ${referenceYear}. Remova esse arquivo e envie o ComprovaBet anual de ${referenceYear}.`;
  }
  return {
    version: 1,
    status,
    referenceYear,
    analyzedAt: now.toISOString(),
    documentIds: evaluations.map((e) => e.documentId),
    approvedIds: approved.map((e) => e.documentId),
    checks: representative?.checks ?? [],
    message,
  };
}
