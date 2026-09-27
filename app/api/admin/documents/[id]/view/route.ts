import { NextResponse } from "next/server";
import { logAccess } from "@/lib/audit";
import { getAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { clientIp, userAgent } from "@/lib/security";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Gera um link temporário (5 minutos) para o documento e registra o acesso. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.redirect(new URL("/admin/login", req.url));
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { id: true, caseId: true, isDemo: true, storageKey: true, originalName: true, mimeType: true },
  });
  if (!doc?.caseId || doc.isDemo !== config.demoMode) return new NextResponse("Documento não encontrado.", { status: 404 });

  const isSheet = doc.mimeType.includes("spreadsheetml");
  const url = await (await getStorage()).signedUrl(doc.storageKey, {
    filename: doc.originalName,
    contentType: doc.mimeType === "text/csv" ? "text/plain; charset=utf-8" : doc.mimeType,
    disposition: isSheet ? "attachment" : "inline",
    expiresInSeconds: 300,
  });
  await logAccess({
    action: "document.view",
    adminId: admin.id,
    targetType: "document",
    targetId: doc.id,
    ip: clientIp(req.headers),
    userAgent: userAgent(req.headers),
  });
  const response = NextResponse.redirect(new URL(url, req.url), 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
