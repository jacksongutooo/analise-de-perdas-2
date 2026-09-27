import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { clientIp, randomToken, sha256Hex, userAgent } from "@/lib/security";

export const ADMIN_COOKIE = "adm_session";
const SESSION_HOURS = 12;

export type AdminIdentity = { id: string; name: string; email: string; role: "admin" | "analyst" };

export async function createAdminSession(adminId: string): Promise<void> {
  const token = randomToken(32);
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  await prisma.adminSession.create({
    data: { adminId, tokenHash: sha256Hex(token), expiresAt, ip: clientIp(h), userAgent: userAgent(h) },
  });
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, { httpOnly: true, secure: config.isProduction, sameSite: "lax", path: "/", expires: expiresAt });
}

export async function destroyAdminSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) await prisma.adminSession.deleteMany({ where: { tokenHash: sha256Hex(token) } });
  jar.delete(ADMIN_COOKIE);
}

async function adminFromToken(token: string | undefined): Promise<AdminIdentity | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.adminSession.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { admin: true } });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const admin = session.admin;
  if (!admin.isActive || (admin.isDemo && !config.demoMode)) return null;
  return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
}

/** Administrador autenticado na requisição atual (ou null). */
export const getAdmin = cache(async (): Promise<AdminIdentity | null> => {
  const jar = await cookies();
  return adminFromToken(jar.get(ADMIN_COOKIE)?.value);
});

/** Usar em toda página, ação e rota administrativa. */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
