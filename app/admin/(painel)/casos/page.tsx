import Link from "next/link";
import { IconSearch } from "@/components/icons";
import { Badge, LinkButton, Notice, Select, TextInput, buttonClasses } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/admin";
import { getFilterOptions, listCases, parseCaseFilters, type CaseFilters } from "@/lib/cases/admin-queries";
import { formatBRL, formatDate } from "@/lib/format";
import { BET_TYPES, BET_TYPE_SHORT } from "@/lib/options";
import {
  CASE_STATUS_LABEL,
  CASE_STATUS_TONE,
  CASE_STATUS_VALUES,
  CPF_CHECK_LABEL,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  PAYMENT_STATUS_VALUES,
  type CpfCheckValue,
  type DocumentStatusValue,
} from "@/lib/status";

const GROUP_OPTIONS = [
  { value: "group:new", label: "Validação documental" },
  { value: "group:waiting", label: "Aguardando o cliente" },
  { value: "group:ready", label: "Prontos para análise" },
  { value: "group:review", label: "Em análise" },
  { value: "group:done", label: "Concluídas" },
];

function DocumentationBadge({ status, cpfCheck }: { status: DocumentStatusValue | null; cpfCheck: CpfCheckValue | null }) {
  if (!status) return <span className="text-xs text-muted">Sem ComprovaBet</span>;
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={DOCUMENT_STATUS_TONE[status]}>{DOCUMENT_STATUS_LABEL[status]}</Badge>
      {cpfCheck && cpfCheck !== "match" && cpfCheck !== "manual_match" && status !== "cpf_mismatch" && (
        <span className="text-[0.7rem] text-warn-700">{CPF_CHECK_LABEL[cpfCheck]}</span>
      )}
    </span>
  );
}

function pageHref(f: CaseFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(f)) if (key !== "page" && value) params.set(key, String(value));
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/admin/casos${qs ? `?${qs}` : ""}`;
}

function IdentifiedValue({ cents, source }: { cents: number | null; source: string | null }) {
  if (cents === null) return <span className="text-muted">—</span>;
  return (
    <span>
      {formatBRL(cents)}
      {source === "auto" && <span className="block text-[0.7rem] font-normal text-warn-700">automático</span>}
    </span>
  );
}

export default async function CasosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = parseCaseFilters(sp);
  const deletedRaw = Array.isArray(sp.excluido) ? sp.excluido[0] : sp.excluido;
  const deleted = deletedRaw && /^(ANL|DEMO)-\d{6}$/.test(deletedRaw) ? deletedRaw : null;
  const [{ rows, total, pages }, options] = await Promise.all([listCases(filters), getFilterOptions()]);
  const advancedActive = [filters.type, filters.platform, filters.admin, filters.from, filters.to, filters.min, filters.max, filters.payment].filter(
    Boolean,
  ).length;

  return (
    <div className="space-y-5">
      {deleted && <Notice tone="ok">Caso {deleted} excluído definitivamente, com todos os documentos.</Notice>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Casos</h1>
          <p className="text-sm text-muted">{total === 1 ? "1 caso encontrado" : `${total} casos encontrados`}</p>
        </div>
      </div>

      <form method="get" className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <TextInput name="q" defaultValue={filters.q} placeholder="Protocolo, nome, e-mail ou CPF" className="pl-10" aria-label="Buscar" />
          </div>
          <Select name="status" defaultValue={filters.status} aria-label="Status" className="sm:w-64">
            <option value="">Todos os status</option>
            <optgroup label="Grupos">
              {GROUP_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Status">
              {CASE_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {CASE_STATUS_LABEL[s]}
                </option>
              ))}
            </optgroup>
          </Select>
          <button type="submit" className={buttonClasses("primary", "md", "sm:w-auto")}>
            Filtrar
          </button>
        </div>

        <details className="group mt-3" open={advancedActive > 0}>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg px-1 py-1 text-sm font-medium text-navy-700 [&::-webkit-details-marker]:hidden">
            Mais filtros{advancedActive > 0 ? ` (${advancedActive})` : ""}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="text-muted">Tipo de aposta</span>
              <Select name="type" defaultValue={filters.type} className="mt-1">
                <option value="">Todos</option>
                {BET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {BET_TYPE_SHORT[t.value]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="text-muted">Plataforma</span>
              <Select name="platform" defaultValue={filters.platform} className="mt-1">
                <option value="">Todas</option>
                {options.platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="text-muted">Pagamento</span>
              <Select name="payment" defaultValue={filters.payment} className="mt-1">
                <option value="">Todos</option>
                {PAYMENT_STATUS_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_STATUS_LABEL[p]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="text-muted">Responsável</span>
              <Select name="admin" defaultValue={filters.admin} className="mt-1">
                <option value="">Todos</option>
                <option value="none">Sem responsável</option>
                {options.admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>
                <span className="text-muted">De</span>
                <TextInput type="date" name="from" defaultValue={filters.from} className="mt-1 px-2" />
              </label>
              <label>
                <span className="text-muted">Até</span>
                <TextInput type="date" name="to" defaultValue={filters.to} className="mt-1 px-2" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:col-span-2 lg:col-span-1">
              <label>
                <span className="text-muted">Valor declarado mín.</span>
                <TextInput name="min" inputMode="decimal" placeholder="0,00" defaultValue={filters.min} className="mt-1" />
              </label>
              <label>
                <span className="text-muted">máx.</span>
                <TextInput name="max" inputMode="decimal" placeholder="0,00" defaultValue={filters.max} className="mt-1" />
              </label>
            </div>
            <div className="flex items-end">
              <Link href="/admin/casos" className="px-1 py-2 text-sm font-medium text-muted hover:text-ink">
                Limpar filtros
              </Link>
            </div>
          </div>
        </details>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-muted">
          Nenhum caso encontrado com esses filtros.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface shadow-soft lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-paper/60 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Protocolo</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Solicitante</th>
                  <th className="hidden px-4 py-3 font-medium 2xl:table-cell">Plataforma</th>
                  <th className="hidden px-4 py-3 text-right font-medium 2xl:table-cell">Declarado</th>
                  <th className="px-4 py-3 font-medium">Documentação</th>
                  <th className="px-4 py-3 font-medium">Pagamento</th>
                  <th className="px-4 py-3 font-medium">Etapa</th>
                  <th className="hidden px-4 py-3 font-medium xl:table-cell">Responsável</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-paper/60">
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                      <Link href={`/admin/casos/${r.id}`} className="text-navy-900 hover:underline">
                        {r.protocol}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{formatDate(r.createdAt)}</td>
                    <td className="max-w-48 px-4 py-3">
                      <span className="block truncate">{r.name}</span>
                      <span className="block text-xs tabular-nums text-muted">{r.cpfMasked ? `CPF ${r.cpfMasked}` : "CPF não informado"}</span>
                    </td>
                    <td className="hidden max-w-40 truncate px-4 py-3 text-ink-soft 2xl:table-cell">{r.platforms.join(", ")}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums 2xl:table-cell">
                      {formatBRL(r.declaredLossCents)}
                      <span className="block text-[0.7rem] text-muted">
                        <IdentifiedValue cents={r.identifiedLossCents} source={r.identifiedSource} />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DocumentationBadge status={r.docStatus} cpfCheck={r.docCpfCheck} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={PAYMENT_STATUS_TONE[r.paymentStatus]}>{PAYMENT_STATUS_LABEL[r.paymentStatus]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={CASE_STATUS_TONE[r.status]}>{CASE_STATUS_LABEL[r.status]}</Badge>
                    </td>
                    <td className="hidden max-w-32 truncate px-4 py-3 text-ink-soft xl:table-cell">{r.assignee ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <LinkButton href={`/admin/casos/${r.id}`} size="sm" variant="secondary">
                        Abrir caso
                      </LinkButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/casos/${r.id}`} className="font-semibold tabular-nums text-navy-900 hover:underline">
                      {r.protocol}
                    </Link>
                    <p className="truncate text-sm text-ink-soft">{r.name}</p>
                    <p className="text-xs tabular-nums text-muted">{r.cpfMasked ? `CPF ${r.cpfMasked}` : "CPF não informado"}</p>
                  </div>
                  <Badge tone={CASE_STATUS_TONE[r.status]}>{CASE_STATUS_LABEL[r.status]}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Documentação</dt>
                    <dd>
                      <DocumentationBadge status={r.docStatus} cpfCheck={r.docCpfCheck} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Pagamento</dt>
                    <dd>
                      <Badge tone={PAYMENT_STATUS_TONE[r.paymentStatus]}>{PAYMENT_STATUS_LABEL[r.paymentStatus]}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Declarado</dt>
                    <dd className="tabular-nums">{formatBRL(r.declaredLossCents)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Tipo · Data</dt>
                    <dd>
                      {BET_TYPE_SHORT[r.betType]} · {formatDate(r.createdAt)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-muted">Responsável: {r.assignee ?? "—"}</span>
                  <LinkButton href={`/admin/casos/${r.id}`} size="sm">
                    Abrir caso
                  </LinkButton>
                </div>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginação">
              {filters.page > 1 ? (
                <Link href={pageHref(filters, filters.page - 1)} className={buttonClasses("secondary", "sm")}>
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted">
                Página {filters.page} de {pages}
              </span>
              {filters.page < pages ? (
                <Link href={pageHref(filters, filters.page + 1)} className={buttonClasses("secondary", "sm")}>
                  Próxima
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
