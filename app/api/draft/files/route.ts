import { NextResponse } from "next/server";
import { logAccess } from "@/lib/audit";
import { authenticateDraft } from "@/lib/auth/draft";
import { COMPROVABET_MAX_FILES, CPF_MISMATCH_MESSAGE } from "@/lib/comprovabet";
import { maskCpf, safeErrorMessage } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { checkToDocumentData, inspectComprovaBet } from "@/lib/documents/comprovabet-check";
import { config } from "@/lib/env";
import { acceptUpload, readUploadForm, toUploadedFileDTO } from "@/lib/files/accept";
import { INITIAL_DOC_CATEGORY_VALUES } from "@/lib/options";
import { clientIp, userAgent } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPIRED = "Sua sessão de envio expirou. Envie os arquivos novamente.";

export async function GET(req: Request) {
  const draft = await authenticateDraft(req);
  // Solicitação já concluída (por exemplo, com a confirmação do pagamento): os arquivos agora pertencem ao caso.
  if (draft?.submittedAt) return NextResponse.json({ error: "Esta solicitação já foi enviada.", submitted: true }, { status: 409 });
  if (!draft || draft.expired) return NextResponse.json({ error: EXPIRED }, { status: 401 });
  const docs = await prisma.document.findMany({ where: { draftId: draft.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ files: docs.map(toUploadedFileDTO), cpfMasked: draft.cpf ? maskCpf(draft.cpf) : null });
}

/**
 * Envio do ComprovaBet no formulário. O arquivo é validado (formato real e tamanho) e, quando é um
 * PDF com texto, o CPF do documento é comparado com o CPF informado. Documento de outro CPF é
 * recusado e não é gravado.
 */
export async function POST(req: Request) {
  const draft = await authenticateDraft(req);
  if (!draft || draft.expired || draft.submittedAt) return NextResponse.json({ error: EXPIRED }, { status: 401 });

  const parsed = await readUploadForm(req);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const file = parsed.form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo." }, { status: 400 });
  const category = String(parsed.form.get("category") ?? "");
  if (!(INITIAL_DOC_CATEGORY_VALUES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
  }
  const cpf = draft.cpf;
  if (!cpf) {
    return NextResponse.json({ error: "Informe seu CPF antes de enviar o ComprovaBet.", field: "cpf" }, { status: 409 });
  }
  const sent = await prisma.document.count({ where: { draftId: draft.id, category: "comprovabet" } });
  if (sent >= COMPROVABET_MAX_FILES) {
    return NextResponse.json({ error: `Limite de ${COMPROVABET_MAX_FILES} arquivos para o ComprovaBet.` }, { status: 409 });
  }

  const ip = clientIp(req.headers);
  const ua = userAgent(req.headers);
  try {
    const result = await acceptUpload({
      file,
      owner: { draftId: draft.id },
      platformName: null,
      category: "comprovabet",
      uploadedVia: "form",
      isDemo: draft.isDemo,
      allowedKinds: ["pdf", "png", "jpeg"],
      allowedKindsError: "Para o ComprovaBet, envie o arquivo em PDF, JPG ou PNG.",
      referenceYear: config.comprovabetYear,
      inspect: async (buffer, kind) => {
        const check = await inspectComprovaBet({ buffer, kind, cpf, referenceYear: config.comprovabetYear });
        if (check.cpfCheck === "mismatch") {
          // Registro sem o CPF: só a ocorrência, para a equipe e para auditoria.
          await logAccess({ action: "document.cpf_mismatch", targetType: "draft", targetId: draft.id, ip, userAgent: ua, success: false });
          return { ok: false, status: 422, error: CPF_MISMATCH_MESSAGE };
        }
        return { ok: true, data: checkToDocumentData(check) };
      },
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ file: result.file }, { status: 201 });
  } catch (error) {
    console.error("[upload] falha ao salvar arquivo", safeErrorMessage(error));
    return NextResponse.json({ error: "Não foi possível salvar o arquivo. Tente novamente." }, { status: 500 });
  }
}
