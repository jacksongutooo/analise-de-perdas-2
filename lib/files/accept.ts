import { randomUUID } from "node:crypto";
import type { DocumentCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config, maxUploadBytes } from "@/lib/env";
import { sha256Hex } from "@/lib/security";
import { getStorage } from "@/lib/storage";
import { detectFileType, extensionOf, type AllowedKind } from "./detect";
import { sanitizeFileName } from "./names";

export type UploadedFileDTO = {
  id: string;
  name: string;
  size: number;
  platform: string | null;
  category: string;
  createdAt: string;
  /** A conferência do CPF deste arquivo depende da equipe (sem leitura automática possível). */
  manualCheck?: boolean;
};

export function toUploadedFileDTO(d: {
  id: string;
  originalName: string;
  sizeBytes: number;
  platformName: string | null;
  category: string;
  createdAt: Date;
  cpfCheck?: string | null;
}): UploadedFileDTO {
  return {
    id: d.id,
    name: d.originalName,
    size: d.sizeBytes,
    platform: d.platformName,
    category: d.category,
    createdAt: d.createdAt.toISOString(),
    ...(d.category === "comprovabet" ? { manualCheck: d.cpfCheck !== "match" && d.cpfCheck !== "manual_match" } : {}),
  };
}

type Failure = { ok: false; status: number; error: string };

/** Dados extras gravados no documento após a inspeção do conteúdo (ex.: conferência do CPF). */
export type InspectionData = Partial<Pick<Prisma.DocumentUncheckedCreateInput, "cpfCheck" | "cpfCheckNote" | "cpfCheckedAt" | "checkDetails">>;
export type Inspector = (buffer: Buffer, kind: AllowedKind) => Promise<{ ok: true; data: InspectionData } | Failure>;

/** Lê o multipart da requisição, recusando corpos grandes antes de carregá-los na memória. */
export async function readUploadForm(req: Request): Promise<{ ok: true; form: FormData } | Failure> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > maxUploadBytes() + 256 * 1024) {
    return { ok: false, status: 413, error: `Arquivo maior que ${config.maxUploadMb} MB.` };
  }
  try {
    return { ok: true, form: await req.formData() };
  } catch {
    return { ok: false, status: 400, error: "Não foi possível ler o envio. Tente novamente." };
  }
}

type Owner = { draftId: string } | { caseId: string };

/**
 * Valida e armazena um arquivo enviado: tamanho, extensão, conteúdo real, duplicidade e limite.
 * O arquivo recebe um nome aleatório no armazenamento privado; o nome original fica só no banco.
 */
export async function acceptUpload(input: {
  file: File;
  owner: Owner;
  platformName: string | null;
  category: DocumentCategory;
  uploadedVia: "form" | "additional";
  requestId?: string | null;
  isDemo: boolean;
  /** Restringe os formatos aceitos (o ComprovaBet aceita só PDF, JPG e PNG). */
  allowedKinds?: AllowedKind[];
  allowedKindsError?: string;
  /** Inspeção do conteúdo ANTES de gravar: pode recusar o arquivo (ex.: CPF de outra pessoa). */
  inspect?: Inspector;
  referenceYear?: number | null;
}): Promise<{ ok: true; documentId: string; file: UploadedFileDTO } | Failure> {
  const { file } = input;
  if (file.size === 0) return { ok: false, status: 400, error: "O arquivo está vazio." };
  if (file.size > maxUploadBytes()) return { ok: false, status: 413, error: `Arquivo maior que ${config.maxUploadMb} MB.` };

  const originalName = sanitizeFileName(file.name || "arquivo");
  const extension = extensionOf(originalName);
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectFileType(buffer, extension);
  if (!detected.ok) {
    // Com formatos restritos (ex.: ComprovaBet), a mensagem genérica listaria formatos que não valem aqui.
    const generic = detected.error.startsWith("Formato não aceito") || detected.error.startsWith("Não foi possível reconhecer");
    const error = generic && input.allowedKinds ? (input.allowedKindsError ?? "Formato não aceito para este documento.") : detected.error;
    return { ok: false, status: 415, error };
  }
  if (input.allowedKinds && !input.allowedKinds.includes(detected.kind)) {
    return { ok: false, status: 415, error: input.allowedKindsError ?? "Formato não aceito para este documento." };
  }

  const ownerWhere = "draftId" in input.owner ? { draftId: input.owner.draftId } : { caseId: input.owner.caseId };
  const count = await prisma.document.count({ where: ownerWhere });
  if (count >= config.maxFilesPerCase) {
    return { ok: false, status: 409, error: `Limite de ${config.maxFilesPerCase} arquivos atingido.` };
  }

  const sha256 = sha256Hex(buffer);
  const sameFile = await prisma.document.findFirst({ where: { ...ownerWhere, sha256 }, select: { id: true } });
  if (sameFile) return { ok: false, status: 409, error: "Este arquivo já foi enviado." };

  // Mesmo arquivo em OUTRO caso: aceito, mas sinalizado para conferência da equipe.
  const elsewhere = await prisma.document.findFirst({
    where: {
      sha256,
      isDemo: input.isDemo,
      AND: [{ caseId: { not: null } }, ...("caseId" in input.owner ? [{ caseId: { not: input.owner.caseId } }] : [])],
    },
    select: { id: true },
  });

  // Arquivos recusados na inspeção não chegam ao armazenamento.
  let inspection: InspectionData = {};
  if (input.inspect) {
    const result = await input.inspect(buffer, detected.kind);
    if (!result.ok) return result;
    inspection = result.data;
  }

  const now = new Date();
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const storageKey = `documents/${month}/${randomUUID()}.${detected.kind === "jpeg" ? "jpg" : detected.kind}`;
  const storage = await getStorage();
  await storage.put(storageKey, buffer, detected.mime);

  try {
    const doc = await prisma.document.create({
      data: {
        ...ownerWhere,
        platformName: input.platformName,
        category: input.category,
        originalName,
        storageKey,
        mimeType: detected.mime,
        sizeBytes: buffer.length,
        sha256,
        uploadedVia: input.uploadedVia,
        requestId: input.requestId ?? null,
        isDemo: input.isDemo,
        status: elsewhere ? "duplicate" : "pending",
        duplicateOfId: elsewhere?.id ?? null,
        reviewNote: elsewhere ? "Arquivo idêntico já enviado em outro caso." : null,
        referenceYear: input.referenceYear ?? null,
        ...inspection,
      },
    });
    return { ok: true, documentId: doc.id, file: toUploadedFileDTO(doc) };
  } catch (error) {
    await storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function deleteDocumentAndFile(doc: { id: string; storageKey: string }): Promise<void> {
  await prisma.document.delete({ where: { id: doc.id } });
  const storage = await getStorage();
  await storage.remove(doc.storageKey).catch((error) => console.error("[storage] falha ao remover arquivo", error));
}
