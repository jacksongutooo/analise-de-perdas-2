// Primeiro contato da equipe depois do pagamento (formulário sem documento): prazo e situação.
// Compartilhado entre navegador e servidor.
import { TIME_ZONE } from "@/lib/format";

export type ContactState = "done" | "pending" | "overdue";

/** Situação do primeiro contato. Casos anteriores ao formulário sem documento não têm prazo (null). */
export function contactState(deadline: Date | null, contactedAt: Date | null, now: Date = new Date()): ContactState | null {
  if (!deadline) return null;
  if (contactedAt) return "done";
  return now.getTime() > deadline.getTime() ? "overdue" : "pending";
}

/** Prazo por extenso para o cliente, ex.: "quarta-feira, 01/10, até 18h". */
export function formatDeadline(value: Date | string): string {
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" }).format(date);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(date));
  return `${weekday}, ${day}, até ${hour}h`;
}

/** Tempo até o prazo (ou de atraso) para a equipe, ex.: "faltam 5 h", "atrasado há 1 dia". */
export function deadlineDistance(deadline: Date, now: Date = new Date()): string {
  const diff = deadline.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 3_600_000);
  const days = Math.floor(hours / 24);
  const amount = days >= 1 ? `${days} ${days === 1 ? "dia" : "dias"}` : hours >= 1 ? `${hours} h` : `${Math.max(1, Math.floor(abs / 60_000))} min`;
  return diff >= 0 ? `faltam ${amount}` : `atrasado há ${amount}`;
}
