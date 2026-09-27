import { getAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { contentDisposition } from "@/lib/files/names";
import { safeEqual } from "@/lib/security";
import { getStorage } from "@/lib/storage";
import { localFileSignature } from "@/lib/storage/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Entrega de arquivos do armazenamento local: exige sessão administrativa E assinatura temporária.
export async function GET(req: Request) {
  if (config.storageDriver !== "local") return new Response("Não encontrado.", { status: 404 });
  const admin = await getAdmin();
  if (!admin) return new Response("Acesso restrito.", { status: 401 });

  const url = new URL(req.url);
  const key = url.searchParams.get("k") ?? "";
  const exp = Number(url.searchParams.get("e"));
  const sig = url.searchParams.get("s") ?? "";
  if (!key || !Number.isFinite(exp) || exp < Date.now() || !safeEqual(sig, localFileSignature(key, exp))) {
    return new Response("Link expirado. Volte ao caso e clique em Visualizar novamente.", { status: 403 });
  }
  const doc = await prisma.document.findUnique({ where: { storageKey: key }, select: { originalName: true, mimeType: true } });
  if (!doc) return new Response("Não encontrado.", { status: 404 });

  const body = await (await getStorage()).get(key);
  const isCsv = doc.mimeType === "text/csv";
  const headers: Record<string, string> = {
    "Content-Type": isCsv ? "text/plain; charset=utf-8" : doc.mimeType,
    "Content-Disposition": contentDisposition(doc.mimeType.includes("spreadsheetml") ? "attachment" : "inline", doc.originalName),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (isCsv) headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
  return new Response(new Uint8Array(body), { headers });
}
