// Interface da prévia em volta do site: barra superior, dicas de acesso, arquivos de exemplo,
// avisos e visualizador de documentos. Nada disso existe no site real.
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { setTrackingSession, TRACKING_COOKIE } from "@/lib/auth/tracking";
import { createAdminSession, ADMIN_COOKIE } from "@/lib/auth/admin";
import { DEMO_PASSWORD } from "@/lib/demo/seed";
import { simplePdf } from "@/lib/demo/simple-pdf";
import { config } from "@/lib/env";
import { formatCpf } from "@/lib/cpf";
import { decimalToCents, formatAmount } from "@/lib/format";
import { PLATFORMS } from "@/lib/options";
import { prisma } from "@/lib/db";
import { CASE_STATUS_LABEL, type CaseStatusValue } from "@/lib/status";
import { clearStoredFiles } from "../shims/storage-local";
import { resetDb } from "../shims/fake-prisma";
import { fetchApiFollow } from "./api";
import { confirms, toast, toasts, viewer, type ConfirmRequest, type ViewerFile } from "./bus";
import { openWithPdfJs, simplePdfLines } from "./pdf";
import { clearCookies, cookieStore } from "./request";
import { getRouter } from "./router-state";

const YEAR = config.comprovabetYear;
const OTHER_CPF = "111.444.777-35";

// ─── Barra da prévia ─────────────────────────────────────────────────────
function PreviewBar() {
  const link = "rounded px-1 text-white/90 underline-offset-2 hover:text-white hover:underline";
  const reset = () =>
    confirms.emit({ message: "Apagar tudo o que foi feito na prévia e começar de novo?", confirmLabel: "Reiniciar", onConfirm: () => void resetNow() });
  const resetNow = async () => {
    resetDb();
    clearCookies();
    await clearStoredFiles();
    try {
      window.localStorage.removeItem("analise:v1");
    } catch {
      /* ignore */
    }
    window.location.hash = "#/";
    window.location.reload();
  };
  return (
    <div className="bg-ink px-4 py-2 text-[0.8rem] text-white/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span className="font-semibold text-white">Prévia navegável</span>
        <span className="text-white/60">dados fictícios · nada é enviado de verdade</span>
        <nav className="flex flex-wrap items-center gap-x-2" aria-label="Áreas da prévia">
          <a href="#/" className={link}>
            Site
          </a>
          <a href="#/analise" className={link}>
            Formulário
          </a>
          <a href="#/acompanhar" className={link}>
            Acompanhamento
          </a>
          <a href="#/admin" className={link}>
            Painel da equipe
          </a>
        </nav>
        <button type="button" className="rounded px-1 text-white/55 hover:text-white" onClick={reset}>
          Reiniciar prévia
        </button>
      </div>
    </div>
  );
}

function Tip({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <aside className="fade-in fixed inset-x-3 bottom-3 z-40 max-h-[55dvh] overflow-y-auto rounded-2xl border border-line bg-surface p-4 text-sm shadow-soft sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-80">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-navy-700">Dica da prévia</p>
        <button type="button" onClick={onClose} className="-m-1 rounded px-1.5 text-muted hover:text-ink" aria-label="Fechar dica">
          ×
        </button>
      </div>
      {children}
    </aside>
  );
}

const TRACKING_SHORTCUTS: { protocol: string; hint: string }[] = [
  { protocol: "DEMO-100001", hint: "Validação documental" },
  { protocol: "DEMO-100008", hint: "CPF divergente" },
  { protocol: "DEMO-100003", hint: "Complemento solicitado" },
  { protocol: "DEMO-100002", hint: "Documento aprovado · pagamento" },
  { protocol: "DEMO-100004", hint: "Análise em andamento" },
  { protocol: "DEMO-100006", hint: "Análise concluída" },
];

type CaseShortcut = { id: string; protocol: string; email: string; hint: string };

/** Folha modal da prévia (celular: sobe de baixo; computador: centralizada). */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-ink/40 p-3 sm:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={label} className="fade-in max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl bg-surface p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-navy-700">Dica da prévia</p>
          <button type="button" onClick={onClose} className="-m-1 rounded px-1.5 text-muted hover:text-ink" aria-label="Fechar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const PILL =
  "rounded-full bg-ink px-4 py-2.5 text-xs font-semibold text-white shadow-soft ring-1 ring-white/20 transition-colors hover:bg-navy-700";

function TrackingTip() {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<CaseShortcut[]>([]);
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const rows = (await prisma.case.findMany({
        where: { isDemo: true },
        orderBy: { createdAt: "desc" },
        select: { id: true, protocol: true, status: true, user: { select: { email: true } } },
      })) as { id: string; protocol: string; status: CaseStatusValue; user: { email: string } }[];
      const known = new Set(TRACKING_SHORTCUTS.map((s) => s.protocol));
      const mine = rows.filter((r) => !/^DEMO-1000\d\d$/.test(r.protocol) && !known.has(r.protocol)).slice(0, 1);
      setCases([
        ...mine.map((r) => ({ id: r.id, protocol: r.protocol, email: r.user.email, hint: `Seu caso · ${CASE_STATUS_LABEL[r.status]}` })),
        ...TRACKING_SHORTCUTS.flatMap((s) => {
          const r = rows.find((row) => row.protocol === s.protocol);
          return r ? [{ id: r.id, protocol: r.protocol, email: r.user.email, hint: CASE_STATUS_LABEL[r.status] ?? s.hint }] : [];
        }),
      ]);
    })();
  }, [open]);
  const enter = async (c: CaseShortcut) => {
    setOpen(false);
    await setTrackingSession(c.id);
    await getRouter().navigate("/acompanhar");
  };
  return (
    <>
      <div className="fixed right-3 z-40 sm:right-6" style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
        <button type="button" className={PILL} onClick={() => setOpen(true)}>
          Abrir caso fictício
        </button>
      </div>
      {open && (
        <Sheet label="Casos fictícios" onClose={() => setOpen(false)}>
          <p className="mt-1 text-sm text-ink-soft">Abra um caso fictício (ou digite protocolo e e-mail):</p>
          <ul className="mt-3 space-y-2">
            {cases.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void enter(c)}
                  className="w-full rounded-xl border border-line px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-paper"
                >
                  <span className="block font-medium tabular-nums text-ink">{c.protocol}</span>
                  <span className="block truncate text-xs text-muted">
                    {c.hint} · {c.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}

function AdminTip({ onClose }: { onClose: () => void }) {
  const enter = async () => {
    const admin = (await prisma.adminUser.findUnique({ where: { email: "demo@example.com" }, select: { id: true } })) as { id: string } | null;
    if (!admin) return toast("Acesso de demonstração não encontrado. Use “Reiniciar prévia”.");
    await createAdminSession(admin.id);
    await getRouter().navigate("/admin");
  };
  return (
    <Tip onClose={onClose}>
      <p className="mt-1 text-ink-soft">
        Acesso de demonstração: <strong className="text-ink">demo@example.com</strong>, senha <strong className="text-ink">{DEMO_PASSWORD}</strong>.
      </p>
      <button
        type="button"
        onClick={() => void enter()}
        className="mt-3 w-full rounded-xl bg-navy-900 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-white hover:bg-navy-700"
      >
        Entrar como demonstração
      </button>
    </Tip>
  );
}

// ─── Arquivos de exemplo (ComprovaBet fictício) ──────────────────────────
type ExampleOwner = { cpf: string; name: string; platforms: string[]; depositsCents: number | null; withdrawalsCents: number | null };

/** PDF de exemplo com as plataformas e os valores informados (a pré-análise da prévia confere tudo). */
function examplePdf(holder: string, cpfText: string, owner: ExampleOwner | null = null): File {
  const bytes = simplePdf([
    { text: "DOCUMENTO FICTÍCIO — ARQUIVO DE EXEMPLO DA PRÉVIA", bold: true, size: 9 },
    { text: `ComprovaBet — Demonstrativo anual ${YEAR}`, bold: true, size: 18, gap: 36 },
    { text: `Período de referência: 01/01/${YEAR} a 31/12/${YEAR}`, gap: 28 },
    { text: `Titular: ${holder}` },
    { text: `CPF: ${cpfText}` },
    ...(owner?.platforms.length ? [{ text: `Plataforma: ${owner.platforms.join(", ")}` }] : []),
    { text: "Resumo do período", bold: true, size: 13, gap: 36 },
    { text: `Total de depósitos no ano: R$ ${formatAmount(owner?.depositsCents ?? 1_230_000)}` },
    { text: `Total de saques no ano: R$ ${formatAmount(owner?.withdrawalsCents ?? 180_000)}` },
    { text: "Este arquivo não tem validade e não representa um documento real.", size: 9, gap: 44 },
  ]);
  const slug = cpfText === OTHER_CPF ? "outro-cpf" : "seu-cpf";
  return new File([Uint8Array.from(bytes)], `comprovabet-${YEAR}-exemplo-${slug}.pdf`, { type: "application/pdf" });
}

async function examplePhoto(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 600;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f7f4ee";
  ctx.fillRect(0, 0, 900, 600);
  ctx.fillStyle = "#1f2937";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText(`ComprovaBet ${YEAR}`, 60, 110);
  ctx.font = "26px sans-serif";
  ctx.fillText("Foto fictícia de exemplo (prévia)", 60, 170);
  for (let i = 0; i < 8; i++) ctx.fillRect(60, 230 + i * 40, 520 + ((i * 97) % 220), 14);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
  return new File([blob], `foto-comprovabet-${YEAR}.jpg`, { type: "image/jpeg" });
}

/** CPF, nome, plataformas e valores que a prévia usa nos exemplos: do formulário em andamento ou do caso acompanhado. */
async function exampleOwner(pathname: string): Promise<ExampleOwner | null> {
  if (pathname === "/acompanhar/documentos") {
    const raw = cookieStore.get(TRACKING_COOKIE)?.value;
    const caseId = raw?.split(".")[0];
    if (!caseId) return null;
    const c = (await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        declaredDeposits: true,
        declaredWithdrawals: true,
        user: { select: { cpf: true, fullName: true } },
        platforms: { select: { platform: { select: { name: true } } } },
      },
    })) as {
      declaredDeposits: string;
      declaredWithdrawals: string;
      user: { cpf: string | null; fullName: string };
      platforms: { platform: { name: string } }[];
    } | null;
    if (!c?.user.cpf) return null;
    return {
      cpf: c.user.cpf,
      name: c.user.fullName,
      platforms: c.platforms.map((p) => p.platform.name),
      depositsCents: decimalToCents(c.declaredDeposits),
      withdrawalsCents: decimalToCents(c.declaredWithdrawals),
    };
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem("analise:v1") ?? "null");
    const draftId = saved?.draft?.id as string | undefined;
    if (!draftId) return null;
    const draft = (await prisma.caseDraft.findUnique({ where: { id: draftId }, select: { cpf: true } })) as { cpf: string | null } | null;
    if (!draft?.cpf) return null;
    const data = saved?.data ?? {};
    const platforms = PLATFORMS.filter((p) => (data.platforms ?? []).includes(p.slug)).map((p) => p.name);
    if (data.otherPlatformEnabled) platforms.push(...(data.customPlatforms ?? []).map((n: string) => String(n).trim()).filter(Boolean));
    return {
      cpf: draft.cpf,
      name: data.fullName?.trim() || "Solicitante da Prévia",
      platforms,
      depositsCents: typeof data.depositsCents === "number" ? data.depositsCents : null,
      withdrawalsCents: typeof data.withdrawalsCents === "number" ? data.withdrawalsCents : null,
    };
  } catch {
    return null;
  }
}

function sendToUpload(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) return toast(`Avance até a etapa “Envie seu ComprovaBet ${YEAR}” para usar os arquivos de exemplo.`);
  if (input.disabled) return toast("Marque a autorização de tratamento dos dados antes de enviar o arquivo.");
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function useElementPresent(selector: string): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    const check = () => setPresent(Boolean(document.querySelector(selector)));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    return () => observer.disconnect();
  }, [selector]);
  return present;
}

function fillExampleCpf() {
  const input = document.querySelector<HTMLInputElement>("#cpf");
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, "529.982.247-25");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}

/** Atalhos discretos do formulário: CPF fictício e arquivos de exemplo (sem cobrir os botões do site). */
function ExamplesTip({ pathname }: { pathname: string }) {
  const hasCpf = useElementPresent("#cpf");
  const hasUpload = useElementPresent('input[type="file"]');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!hasUpload) setOpen(false);
  }, [hasUpload]);
  const run = async (kind: "mine" | "other" | "photo") => {
    setBusy(true);
    try {
      if (kind === "photo") return sendToUpload(await examplePhoto());
      const owner = await exampleOwner(pathname);
      if (!owner) return toast("Informe e continue a etapa “Seus dados” (com o CPF) antes de usar os exemplos.");
      sendToUpload(
        kind === "mine" ? examplePdf(owner.name, formatCpf(owner.cpf), owner) : examplePdf("Outra Pessoa Fictícia", OTHER_CPF),
      );
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };
  if (!hasCpf && !hasUpload) return null;
  const pill = PILL;
  const option =
    "w-full rounded-xl border border-line px-3 py-2.5 text-left text-[0.86rem] font-medium text-ink transition-colors hover:border-line-strong hover:bg-paper disabled:opacity-50";
  return (
    <>
      <div className="fixed right-3 z-40 sm:right-6" style={{ bottom: "calc(7rem + env(safe-area-inset-bottom, 0px))" }}>
        {hasUpload ? (
          <button type="button" className={pill} onClick={() => setOpen(true)}>
            Arquivos de exemplo
          </button>
        ) : (
          <button type="button" className={pill} onClick={fillExampleCpf}>
            CPF de exemplo
          </button>
        )}
      </div>
      {open && (
        <Sheet label="Arquivos de exemplo" onClose={() => setOpen(false)}>
          <p className="mt-1 text-sm text-ink-soft">Envie um ComprovaBet fictício para ver cada situação:</p>
          <div className="mt-3 grid gap-2">
            <button type="button" disabled={busy} className={option} onClick={() => void run("mine")}>
              PDF com o CPF informado <span className="block text-xs font-normal text-muted">A leitura automática confere o CPF</span>
            </button>
            <button type="button" disabled={busy} className={option} onClick={() => void run("other")}>
              PDF com outro CPF <span className="block text-xs font-normal text-muted">O envio é recusado</span>
            </button>
            <button type="button" disabled={busy} className={option} onClick={() => void run("photo")}>
              Foto do documento <span className="block text-xs font-normal text-muted">Sem leitura automática: conferência da equipe</span>
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function TipFor({ pathname }: { pathname: string }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const close = () => setClosed((c) => ({ ...c, [pathname]: true }));
  if (closed[pathname]) return null;
  if (pathname === "/acompanhar" && !cookieStore.has(TRACKING_COOKIE)) return <TrackingTip />;
  if (pathname === "/admin/login" && !cookieStore.has(ADMIN_COOKIE)) return <AdminTip onClose={close} />;
  if (pathname === "/analise" || pathname === "/acompanhar/documentos") return <ExamplesTip pathname={pathname} />;
  return null;
}

// ─── Avisos e visualizador ───────────────────────────────────────────────
function Toasts() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(
    () =>
      toasts.subscribe((text) => {
        const id = Date.now() + Math.random();
        setItems((list) => [...list.slice(-2), { id, text }]);
        setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 5200);
      }),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3">
      {items.map((i) => (
        <div key={i.id} role="status" className="fade-in w-full max-w-md rounded-xl bg-ink px-4 py-3 text-sm leading-relaxed text-white shadow-soft">
          {i.text}
        </div>
      ))}
    </div>
  );
}

function PdfPages({ blob }: { blob: Blob }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "pages" | "text">("loading");
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      try {
        const pdf = await openWithPdfJs(bytes);
        for (let n = 1; n <= Math.min(pdf.numPages, 12); n++) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-3 block h-auto w-full max-w-3xl rounded-lg bg-white shadow-soft";
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (cancelled) return;
          box.current?.appendChild(canvas);
        }
        if (!cancelled) setState("pages");
      } catch {
        const text = await simplePdfLines(bytes).catch(() => []);
        if (!cancelled) {
          setLines(text);
          setState("text");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);
  return (
    <div>
      {state === "loading" && <p className="py-10 text-center text-sm text-muted">Carregando o documento…</p>}
      {state === "text" && (
        <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 text-sm leading-relaxed text-ink shadow-soft">
          <p className="mb-4 text-xs text-muted">Visualização simplificada (texto do PDF).</p>
          {lines.length ? lines.map((l, i) => <p key={i}>{l}</p>) : <p className="text-muted">Sem texto legível neste PDF.</p>}
        </div>
      )}
      <div ref={box} />
    </div>
  );
}

function TextPreview({ blob }: { blob: Blob }) {
  const [text, setText] = useState("");
  useEffect(() => {
    void blob.text().then((t) => {
      try {
        setText(JSON.stringify(JSON.parse(t), null, 2));
      } catch {
        setText(t);
      }
    });
  }, [blob]);
  return <pre className="mx-auto max-w-3xl whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-xs leading-relaxed text-ink shadow-soft">{text}</pre>;
}

function DocumentViewer() {
  const [file, setFile] = useState<ViewerFile | null>(null);
  const [url, setUrl] = useState("");
  useEffect(() => viewer.subscribe(setFile), []);
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file.blob);
    setUrl(u);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFile(null);
    window.addEventListener("keydown", onKey);
    return () => {
      URL.revokeObjectURL(u);
      window.removeEventListener("keydown", onKey);
    };
  }, [file]);
  if (!file) return null;
  const type = file.type.split(";")[0]!.trim();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      className="fixed inset-0 z-[60] flex bg-ink/75 p-2 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && setFile(null)}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-surface shadow-soft">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{file.name}</p>
          <button type="button" onClick={() => setFile(null)} className="rounded-lg px-2 py-1 text-sm font-medium text-ink-soft hover:bg-paper">
            Fechar
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-paper p-3 sm:p-5">
          {type.startsWith("image/") ? (
            <img src={url} alt={file.name} className="mx-auto h-auto max-w-full rounded-lg shadow-soft" />
          ) : type === "application/pdf" ? (
            <PdfPages blob={file.blob} />
          ) : type.startsWith("text/") || type === "application/json" ? (
            <TextPreview blob={file.blob} />
          ) : (
            <p className="py-10 text-center text-sm text-muted">Visualização indisponível na prévia para este formato.</p>
          )}
        </div>
        <p className="border-t border-line px-4 py-2 text-xs leading-relaxed text-muted">
          Na prévia, o arquivo fica só neste navegador. No site real, o documento abre por um link temporário de 5 minutos e cada acesso é
          registrado.
        </p>
      </div>
    </div>
  );
}

/** Links para /api (Visualizar documento, Exportar dados) abrem no visualizador da prévia. */
export async function openApiLink(href: string) {
  try {
    const res = await fetchApiFollow(href);
    if (!res.ok) {
      toast((await res.text().catch(() => "")) || "Não foi possível abrir o arquivo na prévia.");
      return;
    }
    const disposition = res.headers.get("content-disposition") ?? "";
    const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] ?? /filename="([^"]+)"/i.exec(disposition)?.[1] ?? "arquivo");
    viewer.emit({ name, type: res.headers.get("content-type") ?? "application/octet-stream", blob: await res.blob() });
  } catch (error) {
    toast(error instanceof Error ? error.message : "Não foi possível abrir o arquivo na prévia.");
  }
}

export function installClickHandler() {
  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      if (!anchor || !href || href.startsWith("#/")) return;
      if (href.startsWith("#")) {
        event.preventDefault();
        document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (href.startsWith("/api/")) {
        event.preventDefault();
        void openApiLink(href);
        return;
      }
      if (href.startsWith("/") && !href.startsWith("//")) {
        event.preventDefault();
        void getRouter().navigate(href);
      }
    },
    true,
  );
}

/** Confirmação da prévia: substitui window.confirm, que o visualizador de artifacts não exibe. */
function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => confirms.subscribe(setRequest), []);
  useEffect(() => {
    if (request) confirmButton.current?.focus();
  }, [request]);
  if (!request) return null;
  const close = () => setRequest(null);
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-ink/45 p-3 sm:items-center" onClick={(e) => e.target === e.currentTarget && close()}>
      <div role="alertdialog" aria-label="Confirmação" className="fade-in w-full max-w-sm rounded-2xl bg-surface p-5 shadow-soft">
        <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-ink">{request.message}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} className="min-h-11 rounded-xl border border-line-strong px-4 text-sm font-semibold text-ink hover:bg-paper">
            Cancelar
          </button>
          <button
            ref={confirmButton}
            type="button"
            onClick={() => {
              close();
              request.onConfirm();
            }}
            className="min-h-11 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-700"
          >
            {request.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * window.confirm/alert da prévia: a confirmação abre dentro da página e, se aceita, repete o clique
 * original (desta vez com a resposta "sim"). Formulários GET (filtros) navegam pelo roteador da prévia.
 */
export function installBrowserShims() {
  let lastActivated: HTMLElement | null = null;
  let bypass = 0;
  document.addEventListener(
    "click",
    (event) => {
      const el = (event.target as Element | null)?.closest?.("button, a, input[type=submit], [role=button]") as HTMLElement | null;
      if (el) lastActivated = el;
    },
    true,
  );
  window.confirm = (message?: string) => {
    if (bypass > 0) {
      bypass--;
      return true;
    }
    const target = lastActivated;
    confirms.emit({
      message: String(message ?? ""),
      onConfirm: () => {
        bypass = 1;
        target?.click();
        bypass = 0;
      },
    });
    return false;
  };
  window.alert = (message?: unknown) => toast(String(message ?? ""));

  document.addEventListener("submit", (event) => {
    if (event.defaultPrevented) return;
    const form = event.target as HTMLFormElement;
    event.preventDefault();
    if ((form.getAttribute("method") ?? "get").toLowerCase() !== "get") return toast("Envio indisponível na prévia.");
    const action = form.getAttribute("action");
    const path = action && action.startsWith("/") ? action.split("?")[0]! : window.location.hash.slice(1).split(/[?#]/)[0] || "/";
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form, (event as SubmitEvent).submitter ?? undefined)) {
      if (typeof value === "string") params.append(key, value);
    }
    const query = params.toString();
    void getRouter().navigate(`${path}${query ? `?${query}` : ""}`);
  });
}

// ─── Erros ───────────────────────────────────────────────────────────────
export function PreviewErrorView({ error }: { error: unknown }) {
  return (
    <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-danger-700/25 bg-danger-50 px-4 py-3 text-xs text-danger-700">
      Erro na prévia: {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

class Boundary extends Component<{ children: ReactNode; pathname: string }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidUpdate(prev: { pathname: string }) {
    if (prev.pathname !== this.props.pathname && this.state.error) this.setState({ error: null });
  }
  componentDidCatch(error: unknown) {
    console.error("[prévia]", error);
  }
  render() {
    if (this.state.error) {
      return (
        <main className="mx-auto max-w-lg px-5 py-16">
          <h1 className="text-2xl font-semibold text-ink">Algo deu errado na prévia</h1>
          <p className="mt-2 text-sm text-ink-soft">{this.state.error instanceof Error ? this.state.error.message : String(this.state.error)}</p>
          <button type="button" className="mt-6 font-medium text-navy-700 underline" onClick={() => this.setState({ error: null })}>
            Tentar novamente
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export function PreviewShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  return (
    <>
      <PreviewBar />
      <Boundary pathname={pathname}>{children}</Boundary>
      <TipFor pathname={pathname} />
      <Toasts />
      <DocumentViewer />
      <ConfirmHost />
    </>
  );
}
