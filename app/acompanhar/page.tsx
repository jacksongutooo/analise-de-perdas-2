import type { Metadata } from "next";
import { PageShell } from "@/components/site";
import { CaseTracking } from "@/components/tracking/CaseTracking";
import { TrackingLogin } from "@/components/tracking/TrackingLogin";
import { getTrackingCaseId } from "@/lib/auth/tracking";
import { loadClientCase } from "@/lib/cases/client-view";

export const metadata: Metadata = { title: "Acompanhar análise", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AcompanharPage() {
  const caseId = await getTrackingCaseId();
  const data = caseId ? await loadClientCase(caseId) : null;
  return <PageShell showTracking={false}>{data ? <CaseTracking data={data} /> : <TrackingLogin />}</PageShell>;
}
