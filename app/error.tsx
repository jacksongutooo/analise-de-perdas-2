"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Não foi possível carregar esta página</h1>
      <p className="mt-2 text-ink-soft">Tente novamente em alguns instantes. Suas respostas salvas continuam no seu navegador.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 min-h-12 rounded-xl bg-navy-900 px-5 text-sm font-semibold uppercase tracking-[0.06em] text-white hover:bg-navy-700"
      >
        Tentar novamente
      </button>
    </main>
  );
}
