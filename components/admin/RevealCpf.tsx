"use client";

import { useState } from "react";

/**
 * Mostra o CPF mascarado. O número completo só é buscado quando a equipe pede,
 * e cada visualização fica registrada no servidor.
 */
export function RevealCpf({ masked, reveal }: { masked: string; reveal: () => Promise<string | null> }) {
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function show() {
    setLoading(true);
    setFailed(false);
    try {
      const value = await reveal();
      if (value) setFull(value);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="tabular-nums tracking-wide">{full ?? masked}</span>
      {full ? (
        <button type="button" onClick={() => setFull(null)} className="rounded px-1 text-xs font-medium text-navy-700 hover:bg-navy-50">
          Ocultar
        </button>
      ) : (
        <button
          type="button"
          onClick={show}
          disabled={loading}
          className="rounded px-1 text-xs font-medium text-navy-700 hover:bg-navy-50 disabled:opacity-50"
        >
          {loading ? "Carregando…" : "Mostrar"}
        </button>
      )}
      {failed && <span className="text-xs text-danger-700">Não foi possível mostrar.</span>}
    </span>
  );
}
