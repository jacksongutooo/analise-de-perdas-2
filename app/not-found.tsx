import { PageShell } from "@/components/site";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <PageShell>
      <h1 className="text-3xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="mt-2 text-ink-soft">O endereço pode ter sido digitado errado ou a página não existe mais.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <LinkButton href="/">Voltar ao início</LinkButton>
        <LinkButton href="/acompanhar" variant="secondary">
          Acompanhar análise
        </LinkButton>
      </div>
    </PageShell>
  );
}
