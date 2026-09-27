import { cookies } from "next/headers";
import { authSecret, config } from "@/lib/env";
import { hmac, safeEqual } from "@/lib/security";

// Sessão curta do solicitante no painel /acompanhar (cookie assinado, sem dados pessoais).
export const TRACKING_COOKIE = "acomp_session";
const TRACKING_HOURS = 2;

function signature(caseId: string, exp: string): string {
  return hmac(`tracking:${caseId}.${exp}`, authSecret());
}

export async function setTrackingSession(caseId: string): Promise<void> {
  const exp = String(Date.now() + TRACKING_HOURS * 3_600_000);
  const jar = await cookies();
  jar.set(TRACKING_COOKIE, `${caseId}.${exp}.${signature(caseId, exp)}`, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    expires: new Date(Number(exp)),
  });
}

export async function getTrackingCaseId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(TRACKING_COOKIE)?.value;
  if (!raw) return null;
  const [caseId, exp, sig] = raw.split(".");
  if (!caseId || !exp || !sig) return null;
  if (!Number.isFinite(Number(exp)) || Number(exp) < Date.now()) return null;
  return safeEqual(sig, signature(caseId, exp)) ? caseId : null;
}

export async function clearTrackingSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(TRACKING_COOKIE);
}
