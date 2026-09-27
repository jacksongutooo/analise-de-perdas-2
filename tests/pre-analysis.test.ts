import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addBusinessDays, easterSunday, isBusinessDay, nonBusinessHolidays } from "@/lib/business-days";
import { aggregatePreAnalysis, documentTotals, evaluateComprovaBet, platformsInText } from "@/lib/documents/pre-analysis-check";
import { parsePreAnalysis } from "@/lib/documents/pre-analysis";

const CPF = "52998224725";
const base = {
  documentId: "doc-1",
  name: "comprovabet-2025.pdf",
  kind: "pdf" as const,
  cpf: CPF,
  referenceYear: 2025,
  declaredPlatforms: ["Betano"],
  declaredDepositsCents: 1_200_000,
  declaredWithdrawalsCents: 250_000,
};

const comprovabet = (o: { cpf?: string; year?: number; title?: string; platform?: string; deposits?: string; withdrawals?: string } = {}) => [
  o.title ?? `ComprovaBet — Demonstrativo anual ${o.year ?? 2025}`,
  `Período de referência: 01/01/${o.year ?? 2025} a 31/12/${o.year ?? 2025}`,
  "Titular: Ana Exemplo Souza",
  `CPF: ${o.cpf ?? "529.982.247-25"}`,
  `Plataforma: ${o.platform ?? "Betano"}`,
  `Total de depósitos no ano: R$ ${o.deposits ?? "12.000,00"}`,
  `Total de saques no ano: R$ ${o.withdrawals ?? "2.500,00"}`,
];

const state = (e: ReturnType<typeof evaluateComprovaBet>, key: string) => e.checks.find((c) => c.key === key)?.state;

describe("pré-análise automática do ComprovaBet", () => {
  test("documento conferido: CPF, ano, tipo, plataforma e valores → aprovado", () => {
    const e = evaluateComprovaBet({ ...base, lines: comprovabet() });
    assert.deepEqual(
      e.checks.map((c) => [c.key, c.state]),
      [
        ["reading", "ok"],
        ["cpf", "ok"],
        ["year", "ok"],
        ["type", "ok"],
        ["platforms", "ok"],
        ["values", "ok"],
      ],
    );
    assert.equal(e.approved, true);
    assert.equal(e.blocked, false);
    // O CPF completo nunca aparece no resultado mostrado ao cliente.
    assert.ok(!JSON.stringify(e).includes("529.982.247-25") && !JSON.stringify(e).includes(CPF));
    assert.ok(e.checks.find((c) => c.key === "cpf")?.detail.includes("***.***.***-25"));
    const result = aggregatePreAnalysis([e], 2025, new Date("2026-09-26T12:00:00Z"));
    assert.equal(result.status, "approved");
    assert.deepEqual(result.approvedIds, ["doc-1"]);
    assert.equal(result.message, "Documento aprovado na pré-análise automática.");
  });

  test("plataformas e valores são informativos: diferença não impede a aprovação", () => {
    const e = evaluateComprovaBet({ ...base, lines: comprovabet({ platform: "KTO", deposits: "30.000,00" }) });
    assert.equal(state(e, "platforms"), "review");
    assert.ok(e.checks.find((c) => c.key === "platforms")?.detail.includes("KTO"));
    assert.equal(state(e, "values"), "review");
    // Os valores lidos não são mostrados: só a compatibilidade.
    assert.ok(!e.checks.find((c) => c.key === "values")?.detail.includes("30.000"));
    assert.equal(e.approved, true);
  });

  test("CPF mascarado ou ausente: conferência pela equipe (sem aprovação automática)", () => {
    const masked = evaluateComprovaBet({ ...base, lines: comprovabet({ cpf: "***.982.247-**" }) });
    assert.equal(state(masked, "cpf"), "review");
    assert.equal(masked.approved, false);
    assert.equal(masked.blocked, false);
    const result = aggregatePreAnalysis([masked], 2025);
    assert.equal(result.status, "review");
    assert.match(result.message, /conferência final do documento será feita pela nossa equipe/);
  });

  test("foto ou PDF sem texto: conferência pela equipe", () => {
    const photo = evaluateComprovaBet({ ...base, kind: "image", lines: null });
    assert.equal(state(photo, "reading"), "review");
    assert.ok(photo.checks.every((c) => c.state === "review"));
    assert.equal(photo.approved, false);
    const scanned = evaluateComprovaBet({ ...base, lines: [] });
    assert.match(scanned.checks[0]!.detail, /PDF sem texto/);
  });

  test("documento de outro ano ou de outro CPF: pendência que impede seguir", () => {
    const old = evaluateComprovaBet({ ...base, name: "comprovabet-2024.pdf", lines: comprovabet({ year: 2024 }) });
    assert.equal(state(old, "year"), "fail");
    assert.equal(old.blocked, true);
    const blocked = aggregatePreAnalysis([evaluateComprovaBet({ ...base, lines: comprovabet() }), { ...old, documentId: "doc-2" }], 2025);
    assert.equal(blocked.status, "blocked");
    assert.match(blocked.message, /comprovabet-2024\.pdf/);
    assert.match(blocked.message, /ComprovaBet anual de 2025/);

    const other = evaluateComprovaBet({ ...base, lines: comprovabet({ cpf: "111.444.777-35" }) });
    assert.equal(state(other, "cpf"), "fail");
    assert.match(aggregatePreAnalysis([other], 2025).message, /não corresponde ao CPF informado/);
    assert.equal(aggregatePreAnalysis([], 2025).status, "blocked");
  });

  test("tipo do documento: ComprovaBet ou demonstrativo de apostas; outros ficam para a equipe", () => {
    const statement = evaluateComprovaBet({ ...base, lines: comprovabet({ title: "Extrato anual 2025 — depósitos e saques" }) });
    assert.equal(state(statement, "type"), "ok");
    const unknown = evaluateComprovaBet({ ...base, lines: ["Declaração qualquer 2025", "CPF: 529.982.247-25"] });
    assert.equal(state(unknown, "type"), "review");
    assert.equal(unknown.approved, false);
  });

  test("vários arquivos: um aprovado + uma foto → aprovado (só o arquivo conferido)", () => {
    const pdf = evaluateComprovaBet({ ...base, lines: comprovabet() });
    const photo = evaluateComprovaBet({ ...base, documentId: "doc-2", name: "foto.jpg", kind: "image", lines: null });
    const result = aggregatePreAnalysis([photo, pdf], 2025);
    assert.equal(result.status, "approved");
    assert.deepEqual(result.approvedIds, ["doc-1"]);
    assert.deepEqual(result.documentIds, ["doc-2", "doc-1"]);
    assert.equal(result.checks[0]?.state, "ok");
  });

  test("apoio: plataformas citadas, totais do documento e leitura do resultado gravado", () => {
    assert.deepEqual(platformsInText("Movimentações na BETANO e na Bet 365"), ["Betano", "Bet365"]);
    assert.deepEqual(documentTotals(comprovabet()), { depositsCents: 1_200_000, withdrawalsCents: 250_000 });
    assert.deepEqual(documentTotals(["Sem valores aqui"]), { depositsCents: null, withdrawalsCents: null });
    const saved = aggregatePreAnalysis([evaluateComprovaBet({ ...base, lines: comprovabet() })], 2025);
    assert.equal(parsePreAnalysis(JSON.parse(JSON.stringify(saved)))?.status, "approved");
    assert.equal(parsePreAnalysis({ status: "approved" }), null);
    assert.equal(parsePreAnalysis(null), null);
  });
});

describe("prazo em dias úteis", () => {
  test("Páscoa e feriados móveis", () => {
    assert.equal(easterSunday(2025).toISOString().slice(0, 10), "2025-04-20");
    assert.equal(easterSunday(2026).toISOString().slice(0, 10), "2026-04-05");
    assert.equal(easterSunday(2027).toISOString().slice(0, 10), "2027-03-28");
    const h2026 = nonBusinessHolidays(2026);
    for (const day of ["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-20", "2026-12-25"]) {
      assert.ok(h2026.has(day), day);
    }
    assert.equal(isBusinessDay(new Date("2026-09-26T00:00:00Z")), false); // sábado
    assert.equal(isBusinessDay(new Date("2026-10-12T00:00:00Z")), false); // Nossa Senhora Aparecida
    assert.equal(isBusinessDay(new Date("2026-10-13T00:00:00Z")), true);
  });

  test("15 dias úteis pulam fins de semana e feriados (o dia do envio não conta)", () => {
    // Sexta, 25/09/2026 → 15 dias úteis, pulando 12/10 → segunda, 19/10/2026.
    const deadline = addBusinessDays(new Date("2026-09-25T15:00:00-03:00"), 15);
    assert.equal(deadline.toISOString(), "2026-10-19T15:00:00.000Z");
    // Fim da noite em Brasília (já é dia 26 em UTC) continua contando a partir do dia 25.
    assert.equal(addBusinessDays(new Date("2026-09-25T23:30:00-03:00"), 15).toISOString(), "2026-10-19T15:00:00.000Z");
    // Natal no meio do prazo.
    assert.equal(addBusinessDays(new Date("2026-12-23T10:00:00-03:00"), 3).toISOString().slice(0, 10), "2026-12-29");
  });
});
