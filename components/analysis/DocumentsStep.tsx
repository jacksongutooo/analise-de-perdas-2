"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  COMPROVABET_ACCEPT,
  COMPROVABET_EXTENSIONS,
  COMPROVABET_MAX_FILES,
  COMPROVABET_OWNER_NOTICE,
  MANUAL_CHECK_HINT,
  comprovabetIntro,
  comprovabetTitle,
} from "@/lib/comprovabet";
import { cx } from "@/lib/cx";
import { DOC_CATEGORIES, NO_PASSWORD_NOTICE, PRIVACY_CONSENT_TEXT } from "@/lib/options";
import { IconCheck, IconLock, IconShield, IconUpload } from "../icons";
import { Button, Notice } from "../ui";
import { FileRow, type FileRowItem } from "../upload/FileRow";
import { preflightError, shrinkImageIfNeeded, tempId, uploadWithProgress } from "../upload/upload-client";
import { StepHeading } from "./steps";
import { comprovabetFiles, draftHeaders, type DraftCreds, type DraftFile, type WizardData } from "./state";

type Pending = { key: string; name: string; size: number; progress: number; error: string | null };

const categoryLabel = (value: string) => DOC_CATEGORIES.find((c) => c.value === value)?.label ?? "Documento";

/** Etapa do ComprovaBet anual: documento principal da análise, conferido com o CPF informado. */
export function DocumentsStep({
  data,
  update,
  headingRef,
  year,
  files,
  setFiles,
  ensureDraft,
  getDraft,
  onDraftInvalid,
  onCpfMissing,
  setBusy,
  maxUploadMb,
  notice,
  loadingFiles = false,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  year: number;
  files: DraftFile[];
  setFiles: Dispatch<SetStateAction<DraftFile[]>>;
  ensureDraft: () => Promise<DraftCreds>;
  getDraft: () => DraftCreds | null;
  onDraftInvalid: () => void;
  onCpfMissing: (message: string) => void;
  setBusy: (busy: boolean) => void;
  maxUploadMb: number;
  notice: string | null;
  loadingFiles?: boolean;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const input = useRef<HTMLInputElement | null>(null);
  const maxBytes = maxUploadMb * 1024 * 1024;
  const [intro, ...details] = comprovabetIntro(year);
  const sent = comprovabetFiles(files);
  const others = files.filter((f) => f.category !== "comprovabet");

  useEffect(() => {
    setBusy(pending.some((p) => p.error === null));
  }, [pending, setBusy]);
  useEffect(() => () => setBusy(false), [setBusy]);

  const patchPending = (key: string, patch: Partial<Pending>) => setPending((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  async function handleFiles(list: FileList | null) {
    const selected = list ? Array.from(list) : [];
    if (input.current) input.current.value = "";
    for (const original of selected) {
      const key = tempId();
      setPending((p) => [...p, { key, name: original.name, size: original.size, progress: 0, error: null }]);
      const fail = (error: string) => patchPending(key, { error });

      const invalid = preflightError(original, COMPROVABET_EXTENSIONS, "Para o ComprovaBet, envie o arquivo em PDF, JPG ou PNG.");
      if (invalid) {
        fail(invalid);
        continue;
      }
      if (sent.some((f) => f.name === original.name && f.size === original.size)) {
        fail("Este arquivo já foi enviado.");
        continue;
      }
      const file = await shrinkImageIfNeeded(original, maxBytes);
      if (file.size > maxBytes) {
        fail(`Arquivo maior que ${maxUploadMb} MB. Envie uma versão menor.`);
        continue;
      }
      let creds: DraftCreds;
      try {
        creds = await ensureDraft();
      } catch (error) {
        fail(error instanceof Error ? error.message : "Não foi possível iniciar o envio.");
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("category", "comprovabet");
      const res = await uploadWithProgress("/api/draft/files", form, draftHeaders(creds), (progress) => patchPending(key, { progress }));
      if (res.status === 201 && res.body.file) {
        setFiles((current) => [...current, res.body.file as DraftFile]);
        setPending((p) => p.filter((item) => item.key !== key));
      } else {
        const message = res.body.error ?? "Não foi possível enviar o arquivo. Tente novamente.";
        if (res.status === 401) onDraftInvalid();
        if (res.body.field === "cpf") {
          setPending((p) => p.filter((item) => item.key !== key));
          onCpfMissing(message);
          return;
        }
        fail(message);
      }
    }
  }

  async function removeFile(id: string) {
    const creds = getDraft();
    if (!creds) return;
    const res = await fetch(`/api/draft/files/${id}`, { method: "DELETE", headers: draftHeaders(creds) });
    if (res.ok || res.status === 404) {
      setFiles((current) => current.filter((f) => f.id !== id));
      return;
    }
    if (res.status === 401) {
      onDraftInvalid();
      return;
    }
    // 409: pagamento em andamento — os documentos ficam como estão (a mensagem explica).
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(res.status === 409 && body.error ? body.error : "Não foi possível remover o arquivo. Tente novamente.");
  }

  const items: FileRowItem[] = [
    ...sent.map((f) => ({
      key: f.id,
      name: f.name,
      size: f.size,
      meta: `ComprovaBet ${year}`,
      note: f.manualCheck ? MANUAL_CHECK_HINT : undefined,
    })),
    ...pending.map((p) => ({ key: p.key, name: p.name, size: p.size, progress: p.progress, error: p.error, uploading: p.error === null })),
  ];
  const canAddMore = sent.length + pending.filter((p) => p.error === null).length < COMPROVABET_MAX_FILES;

  return (
    <>
      <StepHeading headingRef={headingRef} id="q-documents" title={comprovabetTitle(year)} subtitle={intro} />
      {notice && (
        <Notice tone="warn" className="mb-5">
          {notice}
        </Notice>
      )}

      <div className="rounded-2xl border border-navy-900/15 bg-navy-50 px-4 py-4 sm:px-5">
        <p className="flex items-start gap-2.5 text-[0.95rem] font-semibold leading-snug text-navy-900">
          <IconShield size={20} className="mt-0.5 shrink-0" />
          {COMPROVABET_OWNER_NOTICE}
        </p>
        {data.cpfMasked && (
          <p className="mt-2 pl-[1.875rem] text-sm text-navy-800">
            CPF informado: <span className="font-semibold tabular-nums">{data.cpfMasked}</span>
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2 text-sm leading-relaxed text-ink-soft">
        {details.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <label
        className={cx(
          "mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
          data.privacyConsent ? "border-ok-600/30 bg-ok-50" : "border-line-strong bg-surface",
        )}
      >
        <input
          type="checkbox"
          checked={data.privacyConsent}
          onChange={(e) => update({ privacyConsent: e.target.checked })}
          className="mt-0.5 size-5 shrink-0 accent-navy-900"
        />
        <span className="text-[0.95rem] leading-relaxed text-ink">
          {PRIVACY_CONSENT_TEXT}{" "}
          <Link href="/privacidade" target="_blank" className="whitespace-nowrap font-medium text-navy-700 underline underline-offset-2">
            Política de Privacidade
          </Link>
        </span>
      </label>

      {loadingFiles && <p className="mt-4 text-sm text-muted">Carregando os arquivos já enviados…</p>}

      <section className="mt-5 rounded-2xl border border-line bg-surface p-4 shadow-soft sm:p-5" aria-labelledby="comprovabet-upload">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="comprovabet-upload" className="text-base font-semibold text-ink">
              ComprovaBet {year}
            </h2>
            <p className="text-sm text-muted">PDF de preferência. Foto ou print legível também servem.</p>
          </div>
          {sent.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok-50 px-2.5 py-1 text-xs font-medium text-ok-700">
              <IconCheck size={13} strokeWidth={2.5} />
              Enviado
            </span>
          )}
        </div>

        <input
          ref={input}
          type="file"
          accept={COMPROVABET_ACCEPT}
          multiple
          tabIndex={-1}
          className="sr-only"
          aria-hidden="true"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          variant={sent.length ? "secondary" : "primary"}
          size="lg"
          className="mt-4 w-full"
          disabled={!data.privacyConsent || !canAddMore}
          onClick={() => input.current?.click()}
        >
          <IconUpload size={19} /> {sent.length ? "Enviar outro arquivo" : "Enviar ComprovaBet"}
        </Button>
        <p className="mt-2 text-xs text-muted">
          {!data.privacyConsent ? "Marque a autorização acima para enviar o arquivo." : `PDF, JPG ou PNG, até ${maxUploadMb} MB por arquivo.`}
        </p>

        {items.length > 0 && (
          <ul className="mt-3 divide-y divide-line">
            {items.map((item) => (
              <FileRow
                key={item.key}
                item={item}
                onRemove={item.uploading || item.error ? undefined : () => removeFile(item.key)}
                onDismiss={item.error ? () => setPending((p) => p.filter((x) => x.key !== item.key)) : undefined}
              />
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Outros arquivos enviados</h2>
          <p className="mt-1 text-sm text-muted">Enviados antes. Não são necessários para iniciar a análise.</p>
          <ul className="mt-2 divide-y divide-line">
            {others.map((f) => (
              <FileRow
                key={f.id}
                item={{ key: f.id, name: f.name, size: f.size, meta: [categoryLabel(f.category), f.platform].filter(Boolean).join(" · ") }}
                onRemove={() => removeFile(f.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <IconLock size={15} className="mt-0.5 shrink-0" />
        {NO_PASSWORD_NOTICE}
      </p>
    </>
  );
}
