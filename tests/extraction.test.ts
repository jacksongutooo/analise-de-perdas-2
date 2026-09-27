import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as XLSX from "xlsx";
import { detectFileType } from "@/lib/files/detect";
import { classifyMovement, detectPlatformName, firstAmountInText, isFailedStatus, parseDateCell, parseDateText } from "@/lib/extraction/normalize";
import { readCsvRows, readPdfLines, readXlsxSheets } from "@/lib/extraction/readers";
import { extractFromRows, type ExtractionResult } from "@/lib/extraction/table";
import { extractFromLines } from "@/lib/extraction/text";

const totals = (r: ExtractionResult) => ({
  deposits: r.movements.filter((m) => m.type === "deposit").reduce((acc, m) => acc + m.amountCents, 0),
  withdrawals: r.movements.filter((m) => m.type === "withdrawal").reduce((acc, m) => acc + m.amountCents, 0),
});

// Extrato em PDF gerado para teste (texto selecionável, 1 página).
const PDF_BASE64 = "JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAzOTEKPj4Kc3RyZWFtCniclZTPSsQwEMbveYqeBXH+zwREcJctHrwIfQERFUUPK+LzO62yKjSSpTShTTJf5pd8sy+bqcAwP2+P5ezq/uXj/v3p7vbUoYYEeNQBcZgeCskwXRdcpuKgMATAML2Wc1EPFydDFxsJzKzazjBfNrWaI/lXNioyXgzTc5lOym4qN2Xf0q4uZEFq0dJ2+9aWRRX74hIABGgNW42bw4fAKrlxsO4NK+QCAl8NLL8DW5LZ2ujUF9rVSZmtseeZhXxFZmClMVvMlrInNoLsK18yMvTphShgADZSWRjJAb7OjJyT1XL0SaFqdApZHoRj+Pohyy8hJZLMhGjHcz5A27ntk9EgMSPm9l2iAz9f4Yccya9bD9M1SoKubX7fgsp5eXOi6XHkPCIqIhi3ydEfcs56HLXqlUUqNc3vcIBWV6FhQuNeOXIIrLXqP8aEFrTsKesMp1NyzKTXtOaQtiIzaWOEPxj52MuX3LMASqx7KTGa/WSVVeGrfmZFy/zye85sEcYZ7YrwJ67ZQHYKZW5kc3RyZWFtCmVuZG9iagoKNyAwIG9iago8PAovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvT2JqU3RtCi9OIDUKL0ZpcnN0IDI2Ci9MZW5ndGggNDM1Cj4+CnN0cmVhbQp4nH1TS2vbQBC+61fMsT2UnX3PFmPIyy2U0JAEWlp6UKTFqBhtkdcl/fedlS1MyLbooJ3HNzPfPCQgKDAGNHgCAyoQWCAdYLVqxOOfXxHEXbuN+0Z8Gvo9fGcfhHv40YirdBgzyGa9bs6+V21ud2nbHEEgi/PicTel/tDFCVabm80G0RtEZ/mvl/e6Ebepv25zhDfX7xUqh0EZiUoZ+vaWU06xzen/AWafIY3/jvI45F1cYpiCpyPeK44hT7HYxiK6U47yruV7wb6QLtSnWDozcxf3cZ8OU8fNKH6bxJby+Bh3v2Meuvadx0CGuIjAnZ8hZ1vwRjlS1tFrW6mI0AZyNZxF44JC/9rmrVdWa1fDEbdDEsoajhzn8pJ8pRZLyjintK7YJLOz3H9vK7UQUZASna5xCNqYoCptUR5JhhBshYLzyNyUc6aSTlvrgqGFHQ9PfP389DN281CKePOcPzzksjtHRdHdxn5oL9Mzbz/yZwNfiFHlBi7GMeVyFfM9jJnnXiR3upEXy1FG34iHw1OexaKUjbhs93FeinOZXMTYpX4YtyC+DOPFuB8WRYn4FxvS890KZW5kc3RyZWFtCmVuZG9iagoKOCAwIG9iago8PAovU2l6ZSA5Ci9Sb290IDIgMCBSCi9JbmZvIDMgMCBSCi9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9UeXBlIC9YUmVmCi9MZW5ndGggNDEKL1cgWyAxIDIgMiBdCi9JbmRleCBbIDAgOSBdCj4+CnN0cmVhbQp4nBXEsREAMAgDsTdwlzb7T8caqQhWIWAmOODkwqUrcUHqLR98Y5oEJgplbmRzdHJlYW0KZW5kb2JqCgpzdGFydHhyZWYKMTAxNwolJUVPRg==";

describe("regras de classificação", () => {
  test("depósitos, saques e o que deve ser ignorado", () => {
    assert.equal(classifyMovement("Depósito PIX"), "deposit");
    assert.equal(classifyMovement("Deposit via Pix"), "deposit");
    assert.equal(classifyMovement("Saque PIX"), "withdrawal");
    assert.equal(classifyMovement("Withdrawal"), "withdrawal");
    for (const other of ["Bônus de depósito", "Estorno de depósito", "Aposta simples", "Rodadas grátis"]) assert.equal(classifyMovement(other), "other", other);
    assert.ok(isFailedStatus("Recusado") && isFailedStatus("PENDENTE"));
    assert.ok(!isFailedStatus("Concluído") && !isFailedStatus("Aprovado"));
  });

  test("datas (horário de Brasília) e valores", () => {
    assert.equal(parseDateText("15/03/2026 14:32")?.toISOString(), "2026-03-15T17:32:00.000Z");
    assert.equal(parseDateText("2026-03-15")?.toISOString(), "2026-03-15T15:00:00.000Z");
    assert.equal(parseDateText("31/02/2026"), null);
    assert.equal(parseDateCell(46096)?.toISOString().slice(0, 10), "2026-03-15");
    assert.equal(firstAmountInText("15/03/2026 Depósito PIX R$ 1.500,00 Concluído"), 150000);
    assert.equal(firstAmountInText("Saque 12/03/2026 10:22 -250,00"), -25000);
    assert.equal(detectPlatformName("Relatório financeiro - BETANO"), "Betano");
  });
});

describe("tabelas", () => {
  test("soma apenas depósitos e saques concluídos e lê o saldo final", () => {
    const r = extractFromRows([
      ["Relatório da conta"],
      ["Data", "Tipo", "Valor", "Status", "Saldo"],
      ["01/10/2025 10:00", "Depósito PIX", "1.000,00", "Concluído", "1.000,00"],
      ["02/10/2025 10:00", "Aposta", "-200,00", "Concluído", "800,00"],
      ["03/10/2025 10:00", "Bônus", "50,00", "Concluído", "850,00"],
      ["10/10/2025 10:00", "Saque PIX", "-300,00", "Concluído", "550,00"],
      ["11/10/2025 10:00", "Saque PIX", "-400,00", "Recusado", "550,00"],
      ["05/09/2026 10:00", "Depósito PIX", "2.500,00", "Concluído", "120,00"],
      ["", "Total depósitos", "3.500,00", "", ""],
    ]);
    assert.deepEqual(totals(r), { deposits: 350000, withdrawals: 30000 });
    assert.equal(r.balanceCents, 12000);
    assert.ok(r.warnings.some((w) => w.includes("1 movimentação ignorada")));
  });

  test("avisa quando não reconhece as colunas", () => {
    assert.deepEqual(extractFromRows([["a", "b"], ["1", "2"]]).warnings, ["Colunas de data e valor não reconhecidas."]);
  });

  test("arquivo CSV com ponto e vírgula e BOM", async () => {
    const csv = "\uFEFFData;Tipo;Valor;Status\n05/01/2026 09:10;Depósito PIX;2.000,00;Concluído\n07/01/2026 18:00;Saque PIX;-750,00;Concluído\n";
    const r = extractFromRows(await readCsvRows(Buffer.from(csv, "utf8")));
    assert.deepEqual(totals(r), { deposits: 200000, withdrawals: 75000 });
  });

  test("arquivo XLSX", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Date", "Transaction", "Amount"],
      ["05/01/2026 09:10", "Deposit", 2000],
      ["07/01/2026 18:00", "Withdrawal", -750],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Extrato");
    const buffer: Buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
    assert.equal(detectFileType(buffer, "xlsx").ok, true);
    const [rows] = await readXlsxSheets(buffer);
    assert.deepEqual(totals(extractFromRows(rows ?? [])), { deposits: 200000, withdrawals: 75000 });
  });
});

describe("PDF", () => {
  test("linhas de texto viram movimentações", () => {
    const r = extractFromLines([
      "15/03/2026 14:32",
      "Depósito PIX R$ 1.500,00 Concluído",
      "20/03/2026 Saque PIX R$ 300,00 Cancelado",
      "22/03/2026 Saque PIX R$ 200,00 Concluído",
      "Total de depósitos R$ 1.500,00",
      "Saldo atual R$ 120,00",
    ]);
    assert.deepEqual(r.movements.map((m) => [m.type, m.amountCents]), [["deposit", 150000], ["withdrawal", 20000]]);
    assert.equal(r.statedTotals?.depositsCents, 150000);
    assert.equal(r.balanceCents, 12000);
  });

  test("arquivo PDF real", async () => {
    const buffer = Buffer.from(PDF_BASE64, "base64");
    assert.equal(detectFileType(buffer, "pdf").ok, true);
    const lines = await readPdfLines(buffer);
    assert.ok(lines.includes("05/01/2026 09:10 Deposito PIX R$ 2.000,00"), lines.join(" | "));
    const r = extractFromLines(lines);
    assert.deepEqual(r.movements.map((m) => [m.type, m.amountCents]), [["deposit", 200000], ["withdrawal", 75000]]);
    assert.equal(r.balanceCents, 12000);
    assert.equal(detectPlatformName(lines.join(" ")), "KTO");
  });
});
