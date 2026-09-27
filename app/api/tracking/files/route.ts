import type { DocumentCategory } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { logAccess } from "@/lib/audit";
import { getTrackingCaseId } from "@/lib/auth/tracking";
import { COMPROVABET_MAX_FILES, CPF_MISMATCH_MESSAGE } from "@/lib/comprovabet";
import { safeErrorMessage } from "@/lib/cpf";
import { prisma } from "@/lib/db";
import { checkToDocumentData, inspectComprovaBet } from "@/lib/documents/comprovabet-check";
import { config } from "@/lib/env";
import { processDocument, recomputeCaseIdentified } from "@/lib/extraction/process";
import { acceptUpload, readUploadForm } from "@/lib/files/accept";
import { DOC_CATEGORY_VALUES } from "@/lib/options";
import { clientIp, isSameOrigin, userAgent } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Envio de documentação adicional pelo solicitante (somente quando a equipe solicitou). */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const caseId = await getTrackingCaseId();
  if (!caseId) return NextResponse.json({ error: "Sua sessão expirou. Acesse o acompanhamento novamente." }, { status: 401 });

  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      isDemo: true,
      user: { select: { cpf: true } },
      platforms: { select: { platform: { select: { id: true, name: true } } } },
      requests: { where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });
  const request = c?.requests[0];
  if (!c || c.isDemo !== config.demoMode || !request) {
    return NextResponse.json({ error: "Não há documentos pendentes para este caso." }, { status: 409 });
  }

  const parsed = await readUploadForm(req);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const file = parsed.form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo." }, { status: 400 });
  const category = String(parsed.form.get("category") ?? "");
  if (!(DOC_CATEGORY_VALUES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
  }
  const isComprovaBet = category === "comprovabet";
  const platformId = String(parsed.form.get("platformId") ?? "");
  const platform = isComprovaBet ? null : (c.platforms.find((p) => p.platform.id === platformId)?.platform ?? null);
  if (isComprovaBet) {
    const sent = await prisma.document.count({ where: { requestId: request.id, category: "comprovabet" } });
    if (sent >= COMPROVABET_MAX_FILES) {
      return NextResponse.json({ error: `Limite de ${COMPROVABET_MAX_FILES} arquivos para o ComprovaBet.` }, { status: 409 });
    }
  }
  const ip = clientIp(req.headers);
  const ua = userAgent(req.headers);

  try {
    const result = await acceptUpload({
      file,
      owner: { caseId: c.id },
      platformName: platform?.name ?? null,
      category: category as DocumentCategory,
      uploadedVia: "additional",
      requestId: request.id,
      isDemo: c.isDemo,
      ...(isComprovaBet
        ? {
            allowedKinds: ["pdf" as const, "png" as const, "jpeg" as const],
            allowedKindsError: "Para o ComprovaBet, envie o arquivo em PDF, JPG ou PNG.",
            referenceYear: config.comprovabetYear,
            inspect: async (buffer: Buffer, kind: string) => {
              const check = await inspectComprovaBet({ buffer, kind, cpf: c.user.cpf, referenceYear: config.comprovabetYear });
              if (check.cpfCheck === "mismatch") {
                await logAccess({ action: "document.cpf_mismatch", targetType: "case", targetId: c.id, ip, userAgent: ua, success: false });
                return { ok: false as const, status: 422, error: CPF_MISMATCH_MESSAGE };
              }
              return { ok: true as const, data: checkToDocumentData(check) };
            },
          }
        : {}),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (platform) await prisma.document.update({ where: { id: result.documentId }, data: { platformId: platform.id } });
    after(async () => {
      await processDocument(result.documentId);
      await recomputeCaseIdentified(c.id);
    });
    return NextResponse.json({ file: result.file }, { status: 201 });
  } catch (error) {
    console.error("[tracking-upload] falha", safeErrorMessage(error));
    return NextResponse.json({ error: "Não foi possível salvar o arquivo. Tente novamente." }, { status: 500 });
  }
}
