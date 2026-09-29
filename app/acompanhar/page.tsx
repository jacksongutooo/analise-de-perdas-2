import type { Metadata } from "next";
import { PageShell } from "@/components/site";
import { CaseTracking } from "@/components/tracking/CaseTracking";
import { TrackingLogin } from "@/components/tracking/TrackingLogin";
import { getTrackingCaseId } from "@/lib/auth/tracking";
import { loadClientCase } from "@/lib/cases/client-view";

export const metadata: Metadata = { title: "Acompanhar solicitação", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AcompanharPage({ searchParams }: { searchParams: Promise<{ preferencias?: string }> }) {
  const { preferencias } = await searchParams;
  const caseId = await getTrackingCaseId();
  const data = caseId ? await loadClientCase(caseId) : null;
  return <PageShell showTracking={false}>{data ? <CaseTracking data={data} preferencesNotice={preferencias} /> : <TrackingLogin />}</PageShell>;
}
