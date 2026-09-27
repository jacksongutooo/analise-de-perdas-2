"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isRateLimited, logAccess } from "@/lib/audit";
import { createAdminSession, destroyAdminSession, getAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { config } from "@/lib/env";
import { clientIp, userAgent, verifyPassword } from "@/lib/security";

// Hash fictício: mantém o tempo de resposta igual quando o e-mail não existe.
const DUMMY_HASH = `scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$${"A".repeat(86)}==`;

export type AdminLoginState = { error: string | null; email?: string };

export async function adminLogin(_prev: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const h = await headers();
  const ip = clientIp(h);
  const ua = userAgent(h);
  if (!email || !password) return { email, error: "Informe e-mail e senha." };

  const limited =
    (await isRateLimited({ action: "admin.login", ip, limit: 10, windowMinutes: 15, onlyFailures: true })) ||
    (await isRateLimited({ action: "admin.login", subject: email, limit: 5, windowMinutes: 15, onlyFailures: true }));
  if (limited) return { email, error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." };

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  const validPassword = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH);
  const allowed = Boolean(admin && validPassword && admin.isActive && (!admin.isDemo || config.demoMode));
  await logAccess({ action: "admin.login", adminId: allowed && admin ? admin.id : null, subject: email, ip, userAgent: ua, success: allowed });
  if (!admin || !allowed) return { email, error: "E-mail ou senha incorretos." };

  await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await createAdminSession(admin.id);
  redirect("/admin");
}

export async function adminLogout(): Promise<void> {
  const admin = await getAdmin();
  await destroyAdminSession();
  if (admin) {
    const h = await headers();
    await logAccess({ action: "admin.logout", adminId: admin.id, ip: clientIp(h), userAgent: userAgent(h) });
  }
  redirect("/admin/login");
}
