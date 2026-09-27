"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50"
    >
      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
      {copied ? "Copiado" : label}
    </button>
  );
}
