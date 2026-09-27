// Prazos em dias úteis (Brasil): sem sábados, domingos e feriados nacionais. Carnaval (segunda e terça) e
// Corpus Christi são pontos facultativos, mas o expediente costuma parar: também não contam, o que deixa o
// prazo informado ao cliente do lado seguro. Feriados estaduais e municipais não entram.
import { TIME_ZONE } from "@/lib/format";

const DAY = 86_400_000;

/** Feriados nacionais de data fixa (Tiradentes, Trabalho, Independência, Aparecida, Finados, República, Consciência Negra, Natal). */
const FIXED = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];

/** Domingo de Páscoa (algoritmo gregoriano anônimo), à meia-noite UTC. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const ymd = (utcMidnight: Date) => utcMidnight.toISOString().slice(0, 10);
const cache = new Map<number, Set<string>>();

/** Dias sem expediente no ano, no formato AAAA-MM-DD. */
export function nonBusinessHolidays(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year).getTime();
  // Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi.
  const movable = [-48, -47, -2, 60].map((offset) => ymd(new Date(easter + offset * DAY)));
  const set = new Set([...FIXED.map((md) => `${year}-${md}`), ...movable]);
  cache.set(year, set);
  return set;
}

/** Dia do calendário em Brasília, representado à meia-noite UTC (para contar dias sem depender do fuso do servidor). */
function localDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

export function isBusinessDay(utcMidnight: Date): boolean {
  const weekday = utcMidnight.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !nonBusinessHolidays(utcMidnight.getUTCFullYear()).has(ymd(utcMidnight));
}

/**
 * Fim de um prazo de N dias úteis contado a partir de `start` (o próprio dia não conta, como nos prazos legais).
 * Devolve o meio-dia (horário de Brasília) do último dia útil do prazo.
 */
export function addBusinessDays(start: Date, days: number): Date {
  let day = localDay(start);
  let counted = 0;
  while (counted < days) {
    day = new Date(day.getTime() + DAY);
    if (isBusinessDay(day)) counted++;
  }
  return new Date(day.getTime() + 15 * 3_600_000); // 12h em Brasília (UTC−3)
}
