import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkCpfInText, cpfDigits, formatCpf, isValidCpf, maskCpf, maskCpfInput, normalizeCpf, redactCpf, safeErrorMessage, yearsInText } from "@/lib/cpf";
import { simplePdf } from "@/lib/demo/simple-pdf";
import { inspectComprovaBet } from "@/lib/documents/comprovabet-check";
import { detectFileType } from "@/lib/files/detect";

const CPF = "52998224725";
const OTHER = "11144477735";

describe("CPF", () => {
  test("validação pelos dígitos verificadores", () => {
    assert.ok(isValidCpf(CPF));
    assert.ok(isValidCpf("529.982.247-25"));
    assert.ok(isValidCpf(OTHER));
    assert.ok(!isValidCpf("529.982.247-24"));
    assert.ok(!isValidCpf("111.111.111-11"));
    assert.ok(!isValidCpf("5299822472"));
    assert.ok(!isValidCpf(""));
  });

  test("normalização, formatação e máscaras", () => {
    assert.equal(cpfDigits("529.982.247-25"), CPF);
    assert.equal(normalizeCpf(" 529.982.247-25 "), CPF);
    assert.equal(normalizeCpf("529.982.247-00"), null);
    assert.equal(formatCpf(CPF), "529.982.247-25");
    assert.equal(maskCpfInput("5299"), "529.9");
    assert.equal(maskCpfInput("5299822"), "529.982.2");
    assert.equal(maskCpfInput("52998224725999"), "529.982.247-25");
    assert.equal(maskCpfInput("abc"), "");
    assert.equal(maskCpf(CPF), "***.***.***-25");
    assert.equal(maskCpf(null), "—");
  });

  test("CPF não vai para os logs", () => {
    assert.equal(redactCpf('data: { cpf: "52998224725", nome: "Ana" }'), 'data: { cpf: "***.***.***-**", nome: "Ana" }');
    assert.equal(redactCpf("CPF 529.982.247-25 inválido"), "CPF ***.***.***-** inválido");
    assert.equal(redactCpf("protocolo ANL-123456"), "protocolo ANL-123456");
    assert.ok(!safeErrorMessage(new Error("Unique constraint: 529.982.247-25")).includes("529.982.247-25"));
  });
});

describe("CPF no texto do documento", () => {
  test("encontra o CPF cadastrado com ou sem pontuação", () => {
    assert.deepEqual(checkCpfInText(CPF, "Titular: Ana\nCPF: 529.982.247-25"), { result: "match" });
    assert.deepEqual(checkCpfInText(CPF, "CPF 529 982 247 25"), { result: "match" });
    assert.deepEqual(checkCpfInText(CPF, "CPF: 52998224725"), { result: "match" });
    assert.deepEqual(checkCpfInText(CPF, "documento 52998224725 emitido"), { result: "match" });
  });

  test("CPF de outra pessoa é divergência", () => {
    assert.deepEqual(checkCpfInText(CPF, "CPF: 111.444.777-35"), { result: "mismatch", others: 1 });
    assert.deepEqual(checkCpfInText(CPF, "CPF 11144477735"), { result: "mismatch", others: 1 });
  });

  test("telefone, CNPJ e números inválidos não viram CPF", () => {
    assert.deepEqual(checkCpfInText(CPF, "Telefone 11999998888 · protocolo 12345678901"), { result: "not_found" });
    assert.deepEqual(checkCpfInText(CPF, "CNPJ 11.222.333/0001-81"), { result: "not_found" });
    assert.deepEqual(checkCpfInText(CPF, "CPF: 123.456.789-00"), { result: "not_found" });
  });

  test("CPF mascarado fica para a conferência da equipe", () => {
    assert.deepEqual(checkCpfInText(CPF, "CPF: ***.982.247-**"), { result: "masked", visibleDigitsMatch: true });
    assert.deepEqual(checkCpfInText(CPF, "CPF: ***.444.777-**"), { result: "masked", visibleDigitsMatch: false });
  });

  test("anos citados, sem confundir com valores", () => {
    assert.deepEqual(yearsInText("Período: 01/01/2025 a 31/12/2025 · Total R$ 2.025,00 · 2024"), [2024, 2025]);
  });
});

describe("ComprovaBet enviado", () => {
  const pdf = (cpfLine: string, year = 2025) =>
    simplePdf([
      { text: "DOCUMENTO FICTÍCIO — TESTE", bold: true },
      { text: `ComprovaBet — Demonstrativo anual ${year}` },
      { text: "Titular: Pessoa de Teste" },
      { text: cpfLine },
    ]);

  test("PDF com texto: compara o CPF do documento com o cadastrado", async () => {
    const file = pdf("CPF: 529.982.247-25");
    assert.equal(detectFileType(file, "pdf").ok, true);
    const ok = await inspectComprovaBet({ buffer: file, kind: "pdf", cpf: CPF, referenceYear: 2025 });
    assert.equal(ok.cpfCheck, "match");
    assert.equal(ok.details.method, "pdf_text");
    assert.equal(ok.details.referenceYearMentioned, true);

    const other = await inspectComprovaBet({ buffer: file, kind: "pdf", cpf: OTHER, referenceYear: 2025 });
    assert.equal(other.cpfCheck, "mismatch");
  });

  test("sem leitura confiável, nunca conclui: fica aguardando conferência", async () => {
    const masked = await inspectComprovaBet({ buffer: pdf("CPF: ***.982.247-**"), kind: "pdf", cpf: CPF, referenceYear: 2025 });
    assert.equal(masked.cpfCheck, "pending");
    assert.equal(masked.details.maskedDigitsMatch, true);

    const noCpf = await inspectComprovaBet({ buffer: pdf("Sem identificação"), kind: "pdf", cpf: CPF, referenceYear: 2025 });
    assert.equal(noCpf.cpfCheck, "pending");

    const image = await inspectComprovaBet({ buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), kind: "png", cpf: CPF, referenceYear: 2025 });
    assert.equal(image.cpfCheck, "pending");
    assert.equal(image.details.method, "none");

    const broken = await inspectComprovaBet({ buffer: Buffer.from("%PDF-1.7\nquebrado"), kind: "pdf", cpf: CPF, referenceYear: 2025 });
    assert.equal(broken.cpfCheck, "pending");
  });

  test("ano diferente do solicitado é sinalizado para a equipe", async () => {
    const r = await inspectComprovaBet({ buffer: pdf("CPF: 529.982.247-25", 2024), kind: "pdf", cpf: CPF, referenceYear: 2025 });
    assert.equal(r.cpfCheck, "match");
    assert.deepEqual(r.details.yearsMentioned, [2024]);
    assert.equal(r.details.referenceYearMentioned, false);
  });
});
