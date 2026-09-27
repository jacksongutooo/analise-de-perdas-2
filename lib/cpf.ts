// CPF: validação, máscaras e busca em texto de documentos. Sem dependências (servidor e navegador).
// No banco, o CPF fica só com os 11 dígitos. Fora do painel autorizado, exibimos a versão mascarada.

export function cpfDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/** Confere os dois dígitos verificadores e recusa sequências repetidas (000.000.000-00 etc.). */
export function isValidCpf(input: string): boolean {
  const d = cpfDigits(input);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(d[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

/** Somente os 11 dígitos quando o CPF é válido; senão null. */
export function normalizeCpf(input: string): string | null {
  const d = cpfDigits(input);
  return isValidCpf(d) ? d : null;
}

/** "52998224725" → "529.982.247-25" */
export function formatCpf(digits: string): string {
  const d = cpfDigits(digits);
  if (d.length !== 11) return digits;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Máscara progressiva para o campo: 000.000.000-00 */
export function maskCpfInput(value: string): string {
  const d = cpfDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Mascara CPFs completos (e outras sequências de 11 dígitos, como telefones) em textos que vão para logs.
 * Erros do banco podem trazer os dados da operação na mensagem.
 */
export function redactCpf(text: string): string {
  return text.replace(/(?<!\d)\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}(?!\d)/g, "***.***.***-**");
}

/** Mensagem de erro segura para logs (sem CPF). */
export function safeErrorMessage(error: unknown): string {
  const text = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
  return redactCpf(text).slice(0, 2000);
}

/** Versão para exibição sem expor o número: "***.***.***-25". */
export function maskCpf(digits: string | null | undefined): string {
  const d = cpfDigits(digits ?? "");
  return d.length === 11 ? `***.***.***-${d.slice(9)}` : "—";
}

// ─── Busca do CPF no texto de um documento ────────────────────────────────

export type CpfTextCheck =
  /** O CPF cadastrado aparece no texto. */
  | { result: "match" }
  /** Há CPF completo e válido no texto, mas nenhum igual ao cadastrado. */
  | { result: "mismatch"; others: number }
  /** O documento mostra o CPF parcialmente mascarado: não dá para confirmar automaticamente. */
  | { result: "masked"; visibleDigitsMatch: boolean }
  /** Nenhum CPF completo encontrado no texto. */
  | { result: "not_found" };

const FORMATTED = /(?<![\d.])(\d{3})\s?\.\s?(\d{3})\s?\.\s?(\d{3})\s?-\s?(\d{2})(?!\d)/g;
// Números sem pontuação só contam quando vêm logo depois da palavra CPF (evita confundir com telefones e códigos).
const LABELED = /\bCPF\b[^\d*•]{0,14}(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})(?!\d)/gi;
const MASKED = /(?<![\d*•xX])([\d*•xX]{3})\s?\.\s?([\d*•xX]{3})\s?\.\s?([\d*•xX]{3})\s?-\s?([\d*•xX]{2})(?![\d*•xX])/g;

function registeredPattern(cpf: string): RegExp {
  const d = cpf.split("");
  const group = (from: number, to: number) => d.slice(from, to).join("");
  return new RegExp(`(?<!\\d)${group(0, 3)}[\\s.]{0,3}${group(3, 6)}[\\s.]{0,3}${group(6, 9)}[\\s.\\-]{0,3}${group(9, 11)}(?!\\d)`);
}

/**
 * Compara o CPF cadastrado com o texto extraído do documento.
 * Só considera divergência quando encontra outro CPF completo e válido; CPF mascarado ou ausente
 * fica para conferência manual da equipe. Nunca "adivinha" um resultado.
 */
export function checkCpfInText(registeredCpf: string, rawText: string): CpfTextCheck {
  const registered = cpfDigits(registeredCpf);
  if (!isValidCpf(registered)) throw new Error("CPF cadastrado inválido.");
  const text = rawText.replace(/ /g, " ");
  if (registeredPattern(registered).test(text)) return { result: "match" };

  const others = new Set<string>();
  for (const pattern of [FORMATTED, LABELED]) {
    for (const match of text.matchAll(pattern)) {
      const digits = cpfDigits(match.slice(1).join(""));
      if (digits !== registered && isValidCpf(digits)) others.add(digits);
    }
  }
  if (others.size) return { result: "mismatch", others: others.size };

  let masked = false;
  let visibleDigitsMatch = true;
  for (const match of text.matchAll(MASKED)) {
    const slots = match.slice(1).join("");
    const visible = [...slots].filter((c) => /\d/.test(c)).length;
    if (visible === 11 || visible < 2) continue;
    masked = true;
    [...slots].forEach((c, i) => {
      if (/\d/.test(c) && c !== registered[i]) visibleDigitsMatch = false;
    });
  }
  if (masked) return { result: "masked", visibleDigitsMatch };
  return { result: "not_found" };
}

/** Anos citados no texto (2010–2029), ignorando valores como "2.025,00". */
export function yearsInText(text: string): number[] {
  const years = new Set<number>();
  for (const match of text.matchAll(/(?<![\d.,])(20[12]\d)(?!\d|,\d|\.\d)/g)) years.add(Number(match[1]));
  return [...years].sort((a, b) => a - b);
}
