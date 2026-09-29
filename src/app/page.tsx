import { IconFile, IconLock, IconShield } from "@/components/icons";
import { SiteFooter, SiteHeader } from "@/components/site";
import { LinkButton } from "@/components/ui";
import { TRUST_LINE, requirementsText } from "@/lib/comprovabet";
import { config } from "@/lib/env";
import { formatBRL } from "@/lib/format";
import { NO_PASSWORD_NOTICE } from "@/lib/options";
import { analysisPrice } from "@/lib/payments";

// O valor da análise mostrado aqui vem da configuração do servidor (o mesmo cobrado no PIX).
export const dynamic = "force-dynamic";

export default function HomePage() {
  const year = config.comprovabetYear;
  const price = analysisPrice();
  const checklist = [
    { title: "Seu CPF", hint: "O mesmo CPF que aparece no documento" },
    { title: `ComprovaBet ${year}`, hint: "Documento anual em seu nome, de preferência em PDF" },
    { title: "E-mail e WhatsApp", hint: "Para acompanhar o caso e receber orientações" },
    {
      title: "Pagamento via PIX",
      hint:
        price && !price.example
          ? `A análise custa ${formatBRL(price.cents)} e é paga no fim do formulário, antes da solicitação`
          : "A análise é paga no fim do formulário, antes da solicitação",
    },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 pb-14 pt-6 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:pb-20">
        <section className="lg:col-span-7">
          <h1 className="max-w-[13ch] text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.025em] text-ink sm:text-[3.6rem] lg:text-[4.1rem]">
            Teve perdas em apostas online?
          </h1>
          <p className="mt-5 max-w-[34ch] text-lg leading-relaxed text-ink-soft sm:text-xl">
            Envie seu ComprovaBet {year} para uma análise documental do seu caso.
          </p>
          <LinkButton href="/analise" size="lg" className="mt-8 w-full sm:w-auto">
            Iniciar análise
          </LinkButton>
          <p className="mt-5 text-sm font-medium text-ink-soft">100% online • Análise documental • Acompanhamento em todas as etapas</p>
          <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-muted">
            Cada caso é analisado individualmente pela nossa equipe. {requirementsText(year)}
          </p>
        </section>

        <aside className="lg:col-span-5" aria-labelledby="antes">
          <div className="rounded-[1.75rem] border border-line bg-surface p-6 shadow-soft sm:p-8">
            <h2 id="antes" className="text-xl font-semibold tracking-tight text-ink">
              Antes de começar
            </h2>
            <p className="mt-1 text-sm text-muted">Tenha em mãos:</p>
            <ul className="mt-5 divide-y divide-dashed divide-line-strong border-y border-dashed border-line-strong">
              {checklist.map((item) => (
                <li key={item.title} className="flex items-start gap-3.5 py-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper text-navy-700">
                    <IconFile size={18} />
                  </span>
                  <span>
                    <span className="block font-medium text-ink">{item.title}</span>
                    <span className="block text-sm text-muted">{item.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
            <LinkButton href="/analise" variant="secondary" className="mt-6 w-full">
              Tenho o ComprovaBet
            </LinkButton>
            <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
              <IconShield size={17} className="mt-0.5 shrink-0 text-navy-700" />
              {TRUST_LINE}
            </p>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
              <IconLock size={15} className="mt-0.5 shrink-0" />
              {NO_PASSWORD_NOTICE}
            </p>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
