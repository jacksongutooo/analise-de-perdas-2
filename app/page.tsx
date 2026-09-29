import { IconClock, IconLock, IconShield } from "@/components/icons";
import { SiteFooter, SiteHeader } from "@/components/site";
import { LinkButton } from "@/components/ui";
import { TRUST_LINE } from "@/lib/comprovabet";
import { formatBRL } from "@/lib/format";
import {
  GOV_MEASURES_TEXT,
  GOV_MEASURES_TITLE,
  HOOK_SUBTITLE,
  HOOK_TITLE,
  MANUAL_SUPPORT_TEXT,
  NO_DOCUMENT_TO_START,
  ONE_REQUEST_PER_CPF,
} from "@/lib/intake";
import { GAMBLING_SUPPORT_NOTE, NO_PASSWORD_NOTICE } from "@/lib/options";
import { analysisPrice } from "@/lib/payments";

// O valor da taxa mostrado aqui vem da configuração do servidor (o mesmo cobrado no PIX).
export const dynamic = "force-dynamic";

export default function HomePage() {
  const price = analysisPrice();
  const steps = [
    { title: "Responda 5 perguntas", hint: "Se já pediu o estorno, em quais casas apostou, há quanto tempo e quanto perdeu, mais ou menos." },
    { title: "Veja o resultado na hora", hint: "Com base nas suas respostas, sem enviar documento." },
    {
      title: "Pague a taxa por PIX",
      hint: price && !price.example ? `A taxa da análise é de ${formatBRL(price.cents)}, paga depois do resultado.` : "A taxa da análise é paga depois do resultado.",
    },
    { title: "Receba o contato da equipe", hint: "Em até 1 dia útil, para verificar quais documentos são necessários para prosseguir." },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-12 pt-6 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:pb-16">
          <section className="lg:col-span-7">
            <p className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-navy-700">
              <span className="size-1.5 rounded-full bg-warn-700" aria-hidden />
              Uma solicitação por CPF
            </p>
            <h1 className="mt-5 max-w-[17ch] text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.025em] text-ink sm:text-[3.3rem] lg:text-[3.7rem]">
              {HOOK_TITLE}
            </h1>
            <p className="mt-5 max-w-[34ch] text-lg leading-relaxed text-ink-soft sm:text-xl">{HOOK_SUBTITLE}</p>
            <LinkButton href="/analise" size="lg" className="mt-8 w-full sm:w-auto">
              Ver se meu CPF pode pedir
            </LinkButton>
            <p className="mt-5 text-sm font-medium text-ink-soft">Sem documentos para começar • 5 perguntas • Resultado na hora</p>
            <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-muted">
              {ONE_REQUEST_PER_CPF} {MANUAL_SUPPORT_TEXT}
            </p>
          </section>

          <aside className="lg:col-span-5" aria-labelledby="como-funciona">
            <div className="rounded-[1.75rem] border border-line bg-surface p-6 shadow-soft sm:p-8">
              <h2 id="como-funciona" className="text-xl font-semibold tracking-tight text-ink">
                Como funciona
              </h2>
              <p className="mt-1 text-sm text-muted">{NO_DOCUMENT_TO_START}</p>
              <ol className="mt-5 divide-y divide-dashed divide-line-strong border-y border-dashed border-line-strong">
                {steps.map((item, i) => (
                  <li key={item.title} className="flex items-start gap-3.5 py-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper text-sm font-semibold tabular-nums text-navy-700">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block font-medium text-ink">{item.title}</span>
                      <span className="block text-sm text-muted">{item.hint}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <LinkButton href="/analise" variant="secondary" className="mt-6 w-full">
                Começar agora
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
        </div>

        <section className="border-t border-line bg-surface/60" aria-labelledby="novas-regras">
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-10 sm:px-8 lg:grid-cols-12 lg:gap-16">
            <h2 id="novas-regras" className="flex items-start gap-2.5 text-lg font-semibold tracking-tight text-ink lg:col-span-4">
              <IconClock size={20} className="mt-1 shrink-0 text-navy-700" />
              {GOV_MEASURES_TITLE}
            </h2>
            <div className="max-w-[62ch] space-y-3 text-[0.95rem] leading-relaxed text-ink-soft lg:col-span-8">
              <p>{GOV_MEASURES_TEXT}</p>
              <p className="text-sm text-muted">
                Este serviço é independente e não tem relação com o governo. Para bloquear o acesso às casas de apostas, a autoexclusão oficial
                fica em{" "}
                <a
                  href="https://gov.br/autoexclusaoapostas"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-navy-700 underline underline-offset-2"
                >
                  gov.br/autoexclusaoapostas
                </a>
                . {GAMBLING_SUPPORT_NOTE}
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
