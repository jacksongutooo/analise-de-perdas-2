// Formatação e validação compartilhadas entre servidor e navegador (sem dependências).

export const TIME_ZONE = "America/Sao_Paulo";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos → "R$ 18.500,00" */
export function formatBRL(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  return brl.format(cents / 100);
}

/** Centavos → "18.500,00" (sem símbolo) */
export function formatAmount(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centavos = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${reais},${centavos}`;
}

/**
 * Converte valores escritos em reais para centavos.
 * Aceita "18.500,00", "18500", "18500.5", "1,234.56", "R$ -1.000,00", "(1.000,00)".
 */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = input.replace(/R\$|\s|\u00a0/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  let intPart = s;
  let decPart = "";
  if (commas && dots) {
    const sep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const idx = s.lastIndexOf(sep);
    intPart = s.slice(0, idx).replace(/[.,]/g, "");
    decPart = s.slice(idx + 1);
  } else if (commas || dots) {
    const parts = s.split(commas ? "," : ".");
    const last = parts[parts.length - 1] ?? "";
    const thousandsOnly =
      parts.length > 1 && (parts[0] ?? "").length >= 1 && (parts[0] ?? "").length <= 3 && parts.slice(1).every((p) => p.length === 3);
    if (parts.length === 2 && last.length <= 2) {
      intPart = parts[0] ?? "";
      decPart = last;
    } else if (thousandsOnly) {
      intPart = parts.join("");
    } else {
      return null;
    }
  }
  if (decPart.length > 2 || !/^\d*$/.test(intPart) || !/^\d*$/.test(decPart)) return null;
  if (!intPart && !decPart) return null;
  const cents = Number(intPart || "0") * 100 + Number(`${decPart}00`.slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Centavos → string decimal aceita pelo Prisma ("18500.00") */
export function centsToDecimal(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

/** Decimal do Prisma (ou número/string) → centavos */
export function decimalToCents(value: { toString(): string } | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function formatDate(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(value),
  );
}

export function formatDateTime(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51,
  53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94,
  95, 96, 97, 98, 99,
]);

/** Retorna somente dígitos (DDD + número) ou null se inválido. */
export function normalizePhoneBR(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (d.length !== 10 && d.length !== 11) return null;
  if (!VALID_DDDS.has(Number(d.slice(0, 2)))) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return d;
}

export function formatPhoneBR(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

/** Máscara progressiva para o campo de WhatsApp: (49) 99999-9999 */
export function maskPhoneInput(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidEmail(email: string): boolean {
  const e = email.trim();
  return e.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
