import { randomInt } from "node:crypto";

export function generateProtocol(isDemo: boolean): string {
  return `${isDemo ? "DEMO" : "ANL"}-${randomInt(100000, 1000000)}`;
}

/** Aceita "ANL-847291", "anl847291" ou apenas "847291". */
export function normalizeProtocol(input: string, defaultPrefix: "ANL" | "DEMO" = "ANL"): string | null {
  const s = input.toUpperCase().replace(/\s+/g, "");
  const full = /^(ANL|DEMO)-?(\d{6})$/.exec(s);
  if (full) return `${full[1]}-${full[2]}`;
  const digits = /^(\d{6})$/.exec(s);
  return digits ? `${defaultPrefix}-${digits[1]}` : null;
}
