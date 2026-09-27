"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { IconCheck } from "../icons";

export function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  icon,
  multiple = false,
  compact = false,
}: {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  multiple?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        "flex w-full items-center gap-3.5 rounded-2xl border bg-surface text-left transition-[border-color,background-color,box-shadow] duration-150",
        compact ? "min-h-14 px-3.5 py-3" : "px-4 py-4 sm:px-5 sm:py-5",
        selected ? "border-navy-900 bg-navy-50 shadow-[inset_0_0_0_1px_var(--color-navy-900)]" : "border-line hover:border-line-strong",
      )}
    >
      {icon && (
        <span
          className={cx(
            "grid size-11 shrink-0 place-items-center rounded-xl transition-colors",
            selected ? "bg-navy-900 text-white" : "bg-paper text-navy-700",
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cx("block font-semibold text-ink", compact && "text-[0.95rem]")}>{title}</span>
        {/* O espaço separa título e descrição na leitura por leitores de tela. */}
        {description && " "}
        {description && <span className="mt-0.5 block text-sm leading-snug text-muted">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          "grid size-6 shrink-0 place-items-center border-2 transition-colors",
          multiple ? "rounded-md" : "rounded-full",
          selected ? "border-navy-900 bg-navy-900 text-white" : "border-line-strong bg-surface",
        )}
      >
        {selected && <IconCheck size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}
