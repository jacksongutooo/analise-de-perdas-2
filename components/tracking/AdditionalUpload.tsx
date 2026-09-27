"use client";

import { useRef, useState } from "react";
import {
  COMPROVABET_ACCEPT,
  COMPROVABET_EXTENSIONS,
  COMPROVABET_OWNER_NOTICE,
  MANUAL_CHECK_HINT,
} from "@/lib/comprovabet";
import { DOC_CATEGORIES, NO_PASSWORD_NOTICE } from "@/lib/options";
import { IconLock, IconPlus } from "../icons";
import { Button, Field, Select } from "../ui";
import { FileRow, type FileRowItem } from "../upload/FileRow";
import { ACCEPT_ATTRIBUTE, preflightError, shrinkImageIfNeeded, tempId, uploadWithProgress } from "../upload/upload-client";

type SentFile = { id: string; name: string; size: number; category: string; manualCheck?: boolean };
type Pending = { key: string; name: string; size: number; progress: number; error: string | null };

const categoryLabel = (value: string, year: number) =>
  value === "comprovabet" ? `ComprovaBet ${year}` : (DOC_CATEGORIES.find((c) => c.value === value)?.label ?? "Documento");

/** Envio da documentação complementar pedida pela equipe. O ComprovaBet é o tipo padrão. */
export function AdditionalUpload({
  platforms,
  maxUploadMb,
  year,
  initialFiles,
}: {
  platforms: { id: string; name: string }[];
  maxUploadMb: number;
  year: number;
  initialFiles: SentFile[];
}) {
  const [files, setFiles] = useState<SentFile[]>(initialFiles);
  const [pending, setPending] = useState<Pending[]>([]);
  const [category, setCategory] = useState("comprovabet");
  const [platformId, setPlatformId] = useState(platforms.length === 1 ? (platforms[0]?.id ?? "") : "");
  const input = useRef<HTMLInputElement>(null);
  const maxBytes = maxUploadMb * 1024 * 1024;
  const isComprovaBet = category === "comprovabet";

  const patch = (key: string, p: Partial<Pending>) => setPending((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function handle(list: FileList | null) {
    const selected = list ? Array.from(list) : [];
    if (input.current) input.current.value = "";
    for (const original of selected) {
      const key = tempId();
      setPending((p) => [...p, { key, name: original.name, size: original.size, progress: 0, error: null }]);
      const invalid = isComprovaBet
        ? preflightError(original, COMPROVABET_EXTENSIONS, "Para o ComprovaBet, envie o arquivo em PDF, JPG ou PNG.")
        : preflightError(original);
      if (invalid) {
        patch(key, { error: invalid });
        continue;
      }
      const file = await shrinkImageIfNeeded(original, maxBytes);
      if (file.size > maxBytes) {
        patch(key, { error: `Arquivo maior que ${maxUploadMb} MB. Envie uma versão menor ou dividida.` });
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("category", category);
      form.append("platformId", isComprovaBet ? "" : platformId);
      const res = await uploadWithProgress("/api/tracking/files", form, {}, (progress) => patch(key, { progress }));
      if (res.status === 201 && res.body.file) {
        const f = res.body.file as { id: string; name: string; size: number; category: string; manualCheck?: boolean };
        setFiles((current) => [...current, { id: f.id, name: f.name, size: f.size, category: f.category, manualCheck: f.manualCheck }]);
        setPending((p) => p.filter((x) => x.key !== key));
      } else {
        patch(key, { error: res.body.error ?? "Não foi possível enviar o arquivo. Tente novamente." });
      }
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/tracking/files/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 404) {
      setFiles((current) => current.filter((f) => f.id !== id));
      return;
    }
    throw new Error("Não foi possível remover o arquivo.");
  }

  const items: FileRowItem[] = [
    ...files.map((f) => ({
      key: f.id,
      name: f.name,
      size: f.size,
      meta: categoryLabel(f.category, year),
      note: f.category === "comprovabet" && f.manualCheck ? MANUAL_CHECK_HINT : undefined,
    })),
    ...pending.map((p) => ({ key: p.key, name: p.name, size: p.size, progress: p.progress, error: p.error, uploading: p.error === null })),
  ];

  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de documento" htmlFor="category">
          <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value === "comprovabet" ? `ComprovaBet ${year}` : c.label}
              </option>
            ))}
          </Select>
        </Field>
        {!isComprovaBet && (
          <Field label="Plataforma" htmlFor="platform">
            <Select id="platform" value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
              <option value="">Não se aplica</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {isComprovaBet && <p className="mt-3 rounded-xl bg-navy-50 px-4 py-3 text-sm font-medium text-navy-900">{COMPROVABET_OWNER_NOTICE}</p>}
      <input
        ref={input}
        type="file"
        multiple
        accept={isComprovaBet ? COMPROVABET_ACCEPT : ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handle(e.target.files)}
      />
      <Button variant="secondary" size="lg" className="mt-5 w-full" onClick={() => input.current?.click()}>
        <IconPlus size={18} /> Enviar arquivo
      </Button>
      <p className="mt-2 text-xs text-muted">
        {isComprovaBet ? "PDF, JPG ou PNG" : "PDF, CSV, XLSX, JPG ou PNG"}, até {maxUploadMb} MB por arquivo.
      </p>
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {items.map((item) => (
            <FileRow
              key={item.key}
              item={item}
              onRemove={item.uploading || item.error ? undefined : () => remove(item.key)}
              onDismiss={item.error ? () => setPending((p) => p.filter((x) => x.key !== item.key)) : undefined}
            />
          ))}
        </ul>
      )}
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <IconLock size={15} className="mt-0.5 shrink-0" />
        {NO_PASSWORD_NOTICE}
      </p>
    </section>
  );
}
