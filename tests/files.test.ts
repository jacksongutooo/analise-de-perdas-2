import assert from "node:assert/strict";
import { test } from "node:test";
import { detectFileType } from "@/lib/files/detect";
import { contentDisposition, sanitizeFileName } from "@/lib/files/names";

const zip = (content: string) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(content)]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

test("aceita somente o conteúdo real dos formatos permitidos", () => {
  assert.deepEqual(detectFileType(Buffer.from("%PDF-1.7\n"), "pdf"), { ok: true, kind: "pdf", mime: "application/pdf" });
  assert.equal(detectFileType(png, "png").ok, true);
  assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "jpg").ok, true);
  assert.equal(detectFileType(Buffer.from("Data;Valor\n01/01/2026;10,00\n"), "csv").ok, true);
  assert.equal(detectFileType(zip("xl/workbook.xml"), "xlsx").ok, true);
});

test("bloqueia executáveis, macros, extensão trocada e HTML disfarçado", () => {
  assert.deepEqual(detectFileType(png, "pdf"), { ok: false, error: "O conteúdo do arquivo não corresponde à extensão." });
  assert.equal(detectFileType(Buffer.from("MZ\x90\x00"), "pdf").ok, false);
  assert.equal(detectFileType(zip("xl/vbaProject.bin"), "xlsx").ok, false);
  assert.equal(detectFileType(zip("word/document.xml"), "xlsx").ok, false);
  assert.equal(detectFileType(Buffer.from("<html><script>alert(1)</script>"), "csv").ok, false);
  assert.equal(detectFileType(Buffer.from("x"), "exe").ok, false);
  assert.equal(detectFileType(Buffer.alloc(0), "pdf").ok, false);
});

test("nomes de arquivo seguros", () => {
  assert.equal(sanitizeFileName("../../etc/pass<wd>.pdf"), "passwd.pdf");
  assert.equal(contentDisposition("inline", "relatório.pdf"), `inline; filename="relatorio.pdf"; filename*=UTF-8''relat%C3%B3rio.pdf`);
});
