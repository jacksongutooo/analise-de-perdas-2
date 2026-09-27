import Link from "next/link";
import { Badge, Notice } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/admin";
import { getDashboard } from "@/lib/cases/admin-queries";
import { config } from "@/lib/env";
import { paymentAvailable } from "@/lib/payments";
import { formatBRL, formatDate } from "@/lib/format";
import { BET_TYPE_SHORT } from "@/lib/options";
import { CASE_STATUS_LABEL, CASE_STATUS_TONE } from "@/lib/status";

export default async function DashboardPage() {
  await requireAdmin();
  const d = await getDashboard();
  const kpis = [
    { label: "Validação documental", value: d.groups.new, href: "/admin/casos?status=group:new" },
    { label: "Aguardando o cliente", value: d.groups.waiting, href: "/admin/casos?status=group:waiting" },
    { label: "Prontos para análise", value: d.groups.ready, href: "/admin/casos?status=group:ready" },
    { label: "Em análise", value: d.groups.review, href: "/admin/casos?status=group:review" },
    { label: "Concluídas", value: d.groups.done, href: "/admin/casos?status=group:done" },
  ];
  const maxPlatform = Math.max(1, ...d.platforms.map((p) => p.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Painel</h1>
          <p className="text-sm text-muted">{d.total === 1 ? "1 solicitação registrada" : `${d.total} solicitações registradas`}</p>
        </div>
        <Link href="/admin/casos" className="text-sm font-medium text-navy-700 hover:underline">
          Ver todos os casos
        </Link>
      </div>

      {!paymentAvailable() && (
        <Notice tone="warn">
          O pagamento da análise não está configurado: sem ele, novas solicitações não podem ser concluídas.{" "}
          {config.analysisPriceCents === null ? "Defina ANALYSIS_PRICE e " : "Defina "}
          MERCADOPAGO_ACCESS_TOKEN nas variáveis de ambiente.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="rounded-2xl border border-line bg-surface p-4 shadow-soft transition-colors hover:border-line-strong sm:p-5">
            <p className="text-sm text-muted">{k.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">{k.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
          <p className="text-sm text-muted">Total declarado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(d.declaredTotalCents)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
          <p className="text-sm text-muted">Total identificado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(d.identifiedTotalCents)}</p>
          <p className="mt-1 text-xs text-muted">Inclui leituras automáticas ainda não conferidas</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
          <p className="text-sm text-muted">Média de perda declarada</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(d.declaredAverageCents)}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">Plataformas mais citadas</h2>
          {d.platforms.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Sem dados ainda.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {d.platforms.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/casos?platform=${p.id}`} className="block rounded-lg hover:bg-paper">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-ink">{p.name}</span>
                      <span className="tabular-nums text-muted">{p.count}</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-navy-50">
                      <div className="h-full rounded-full bg-navy-700" style={{ width: `${(p.count / maxPlatform) * 100}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">Tipo de aposta</h2>
          <ul className="mt-4 space-y-3">
            {d.types.map((t) => (
              <li key={t.type}>
                <Link href={`/admin/casos?type=${t.type}`} className="block rounded-lg hover:bg-paper">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-ink">{BET_TYPE_SHORT[t.type]}</span>
                    <span className="tabular-nums text-muted">
                      {Math.round(t.share * 100)}% · {t.count}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-navy-50">
                    <div className="h-full rounded-full bg-navy-900" style={{ width: `${t.share * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-surface shadow-soft">
        <h2 className="border-b border-line px-5 py-4 text-sm font-semibold text-ink">Solicitações recentes</h2>
        {d.recent.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Nenhuma solicitação ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.recent.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/casos/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-paper">
                  <span className="font-medium tabular-nums text-ink">{r.protocol}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{r.name}</span>
                  <span className="text-sm tabular-nums text-ink">{formatBRL(r.declaredLossCents)}</span>
                  <Badge tone={CASE_STATUS_TONE[r.status]}>{CASE_STATUS_LABEL[r.status]}</Badge>
                  <span className="text-xs text-muted">{formatDate(r.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
