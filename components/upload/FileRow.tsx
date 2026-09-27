"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";
import { formatBytes } from "@/lib/format";
import { FileTypeIcon, IconAlert, IconTrash, IconX } from "../icons";

export type FileRowItem = {
  key: string;
  name: string;
  size: number;
  meta?: string;
  /** Linha extra de orientação (ex.: conferência feita pela equipe). */
  note?: string;
  progress?: number;
  error?: string | null;
  uploading?: boolean;
};

/** Linha de arquivo com progresso, erro e remoção com confirmação. */
export function FileRow({ item, onRemove, onDismiss }: { item: FileRowItem; onRemove?: () => Promise<void>; onDismiss?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function confirmRemove() {
    if (!onRemove) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await onRemove();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Não foi possível remover.");
      setRemoving(false);
      setConfirming(false);
    }
  }

  return (
    <li className={cx("py-3", item.error && "text-danger-700")}>
      <div className="flex items-center gap-3">
        <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg", item.error ? "bg-danger-50" : "bg-paper text-navy-700")}>
          {item.error ? <IconAlert size={18} /> : <FileTypeIcon name={item.name} size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{item.name}</p>
          <p className={cx(item.error ? "text-sm font-medium leading-snug text-danger-700" : "text-xs text-muted")}>
            {item.error ?? (item.uploading ? `Enviando… ${item.progress ?? 0}%` : [item.meta, formatBytes(item.size)].filter(Boolean).join(" · "))}
          </p>
          {!item.error && !item.uploading && item.note && <p className="mt-0.5 text-xs leading-snug text-ink-soft">{item.note}</p>}
        </div>
        {item.error && onDismiss && (
          <button type="button" onClick={onDismiss} className="rounded-lg p-2 text-muted hover:bg-paper" aria-label="Dispensar aviso">
            <IconX size={16} />
          </button>
        )}
        {!item.error && !item.uploading && onRemove && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-50 hover:text-danger-700"
            aria-label={`Remover ${item.name}`}
          >
            <IconTrash size={17} />
          </button>
        )}
      </div>
      {item.uploading && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-navy-100">
          <div className="h-full rounded-full bg-navy-900 transition-[width]" style={{ width: `${item.progress ?? 0}%` }} />
        </div>
      )}
      {confirming && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 rounded-xl bg-paper px-3 py-2">
          <span className="mr-auto text-sm text-ink">Remover este arquivo?</span>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-surface">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmRemove}
            disabled={removing}
            className="rounded-lg bg-danger-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {removing ? "Removendo…" : "Remover"}
          </button>
        </div>
      )}
      {removeError && <p className="mt-1 text-xs font-medium text-danger-700">{removeError}</p>}
    </li>
  );
}
