import type { Prisma } from "@prisma/client";
import { checkCpfInText, yearsInText } from "@/lib/cpf";
import { readPdfLines } from "@/lib/extraction/readers";

// Conferência automática do ComprovaBet no envio. Só compara o CPF quando o PDF tem texto
// selecionável (leitura real do conteúdo). Imagens, PDFs digitalizados e CPF mascarado ficam
// "aguardando conferência documental" para a equipe — nunca marcamos como conferido sem leitura.

const MAX_PAGES = 10;

export type ComprovaBetCheck = {
  cpfCheck: "pending" | "match" | "mismatch";
  note: string;
  details: {
    method: "pdf_text" | "none";
    textAvailable: boolean;
    yearsMentioned: number[];
    referenceYear: number;
    referenceYearMentioned: boolean | null;
    maskedCpf: boolean;
    maskedDigitsMatch: boolean | null;
  };
};

export async function inspectComprovaBet(input: {
  buffer: Buffer;
  kind: string;
  cpf: string | null;
  referenceYear: number;
}): Promise<ComprovaBetCheck> {
  const base = {
    method: "none" as const,
    textAvailable: false,
    yearsMentioned: [] as number[],
    referenceYear: input.referenceYear,
    referenceYearMentioned: null,
    maskedCpf: false,
    maskedDigitsMatch: null,
  };
  if (!input.cpf) {
    return { cpfCheck: "pending", note: "Caso sem CPF cadastrado: conferência manual necessária.", details: base };
  }
  if (input.kind !== "pdf") {
    return {
      cpfCheck: "pending",
      note: "Imagem: a leitura automática do CPF não está disponível. Conferência manual necessária.",
      details: base,
    };
  }

  let text = "";
  try {
    text = (await readPdfLines(input.buffer, MAX_PAGES)).join("\n");
  } catch {
    return {
      cpfCheck: "pending",
      note: "Não foi possível ler o texto do PDF (arquivo protegido ou danificado). Conferência manual necessária.",
      details: base,
    };
  }
  if (!text.trim()) {
    return {
      cpfCheck: "pending",
      note: "PDF sem texto selecionável (possivelmente digitalizado). Conferência manual necessária.",
      details: base,
    };
  }

  const years = yearsInText(text);
  const cpf = checkCpfInText(input.cpf, text);
  const details = {
    ...base,
    method: "pdf_text" as const,
    textAvailable: true,
    yearsMentioned: years,
    referenceYearMentioned: years.length ? years.includes(input.referenceYear) : null,
    maskedCpf: cpf.result === "masked",
    maskedDigitsMatch: cpf.result === "masked" ? cpf.visibleDigitsMatch : null,
  };
  switch (cpf.result) {
    case "match":
      return { cpfCheck: "match", note: "CPF cadastrado encontrado no texto do documento (leitura automática).", details };
    case "mismatch":
      return {
        cpfCheck: "mismatch",
        note: "O texto do documento contém outro CPF e não contém o CPF cadastrado (leitura automática).",
        details,
      };
    case "masked":
      return {
        cpfCheck: "pending",
        note: `O documento mostra o CPF parcialmente mascarado; os dígitos visíveis ${
          cpf.visibleDigitsMatch ? "conferem" : "NÃO conferem"
        } com o CPF cadastrado. Conferência manual necessária.`,
        details,
      };
    default:
      return {
        cpfCheck: "pending",
        note: "Nenhum CPF completo encontrado no texto do documento. Conferência manual necessária.",
        details,
      };
  }
}

/** Campos do documento que guardam o resultado da conferência. */
export function checkToDocumentData(check: ComprovaBetCheck) {
  return {
    cpfCheck: check.cpfCheck,
    cpfCheckNote: check.note,
    cpfCheckedAt: new Date(),
    checkDetails: check.details as unknown as Prisma.InputJsonValue,
  };
}
