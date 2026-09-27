"use client";

export default function PainelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-danger-700/20 bg-danger-50 p-6">
      <h1 className="text-lg font-semibold text-danger-700">Não foi possível concluir a operação</h1>
      <p className="mt-1 text-sm text-danger-700">{error.message || "Erro inesperado."}</p>
      <button type="button" onClick={reset} className="mt-4 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-ink ring-1 ring-line-strong">
        Tentar novamente
      </button>
    </div>
  );
}
