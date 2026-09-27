import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatAmount, formatBRL, formatDate, isValidEmail, maskPhoneInput, normalizePhoneBR, parseMoneyToCents, slugify } from "@/lib/format";

describe("valores em reais", () => {
  test("converte textos em centavos", () => {
    const cases: [string, number | null][] = [
      ["18.500,00", 1850000],
      ["18500", 1850000],
      ["18500.5", 1850050],
      ["1,234.56", 123456],
      ["R$ -1.000,00", -100000],
      ["(1.000,00)", -100000],
      ["1.000", 100000],
      ["1,5", 150],
      ["12,345", 1234500],
      ["1.000.000,01", 100000001],
      ["250-", -25000],
      ["abc", null],
      ["", null],
      ["1.2.3", null],
    ];
    for (const [input, expected] of cases) assert.equal(parseMoneyToCents(input), expected, input);
  });

  test("formata no padrão brasileiro", () => {
    assert.equal(formatBRL(1850000).replace(/\u00a0/g, " "), "R$ 18.500,00");
    assert.equal(formatBRL(null), "—");
    assert.equal(formatAmount(-123456), "-1.234,56");
    assert.equal(formatAmount(5), "0,05");
  });
});

describe("contato", () => {
  test("valida e normaliza WhatsApp", () => {
    assert.equal(normalizePhoneBR("(49) 99999-9999"), "49999999999");
    assert.equal(normalizePhoneBR("+55 49 99999-9999"), "49999999999");
    assert.equal(normalizePhoneBR("(49) 3333-4444"), "4933334444");
    assert.equal(normalizePhoneBR("(20) 99999-9999"), null);
    assert.equal(normalizePhoneBR("(49) 83333-4444"), null);
    assert.equal(maskPhoneInput("49999999999"), "(49) 99999-9999");
  });

  test("valida e-mail", () => {
    assert.ok(isValidEmail("ana@exemplo.com.br"));
    assert.ok(!isValidEmail("ana@exemplo"));
  });
});

test("datas no horário de Brasília e slugs", () => {
  assert.equal(formatDate(new Date("2026-09-23T02:00:00Z")), "22/09/2026");
  assert.equal(slugify("Minha Bet Ação!"), "minha-bet-acao");
});
