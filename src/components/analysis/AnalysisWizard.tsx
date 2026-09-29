"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PreAnalysis } from "@/lib/documents/pre-analysis";
import type { BetTypeValue } from "@/lib/options";
import { PIX_ERROR_MESSAGE } from "@/lib/payments/types";
import { IconCheck, IconX } from "../icons";
import { Logo } from "../site";
import { Button } from "../ui";
import { DocumentsStep } from "./DocumentsStep";
import {
  EMPTY_DATA,
  FIELD_SCREEN,
  SCREENS,
  TERMS_REQUIRED_MESSAGE,
  TOTAL_STEPS,
  buildPayload,
  clearProgress,
  comprovabetFiles,
  draftHeaders,
  firstInvalidScreen,
  loadProgress,
  resumeScreen,
  sameDocuments,
  saveProgress,
  screenError,
  selectedPlatformNames,
  type DraftCreds,
  type DraftFile,
  type PaymentState,
  type Screen,
  type WizardData,
} from "./state";
import {
  AmountsStep,
  AnalysisStep,
  BalanceStep,
  CommitmentStep,
  ContactStep,
  ControlStep,
  PaymentStep,
  PeriodStep,
  PlatformsStep,
  ReviewStep,
  SituationStep,
  TypeDetailStep,
  TypeStep,
  type PaymentSettings,
} from "./steps";

export type WizardSettings = { maxUploadMb: number; reviewDays: number; comprovabetYear: number; payment: PaymentSettings };

/** Enquanto o PIX aguarda pagamento, a tela pergunta ao nosso servidor a cada 4 s (por até 30 minutos). */
const PAYMENT_POLL_MS = 4000;
const PAYMENT_POLL_ROUNDS = 450;

export function AnalysisWizard({ settings }: { settings: WizardSettings }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("type");
  const [data, setData] = useState<WizardData>(EMPTY_DATA);
  const [draft, setDraftState] = useState<DraftCreds | null>(null);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [resumed, setResumed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [savingCpf, setSavingCpf] = useState(false);
  const [cpfServerError, setCpfServerError] = useState<string | null>(null);
  // Pagamento da análise por PIX (antes da solicitação).
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [simulating, setSimulating] = useState(false);
  // Pré-análise automática do ComprovaBet (tela logo depois do envio do documento).
  const [analysisResult, setAnalysisResult] = useState<PreAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisAnimate, setAnalysisAnimate] = useState(true);
  const [analysisSettled, setAnalysisSettled] = useState(false);

  const draftRef = useRef<DraftCreds | null>(null);
  const restoredDraftId = useRef<string | null>(null);
  const draftPromise = useRef<Promise<DraftCreds> | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const finished = useRef(false);
  const latest = useRef<{ screen: Screen; data: WizardData; draft: DraftCreds | null } | null>(null);
  /** Saiu da tela de pagamento com um PIX em aberto: ao voltar, as respostas são gravadas de novo (o mesmo PIX segue valendo). */
  const leftPixOpen = useRef(false);

  const setDraft = useCallback((creds: DraftCreds | null) => {
    draftRef.current = creds;
    setDraftState(creds);
  }, []);

  // Retoma o preenchimento salvo neste navegador.
  useEffect(() => {
    const saved = loadProgress();
    if (saved) {
      setData(saved.data);
      setDraft(saved.draft);
      restoredDraftId.current = saved.draft?.id ?? null;
      setScreen(resumeScreen(saved.screen, saved.data));
      setSavedAt(saved.savedAt);
      // Na tela de pagamento, a própria situação do PIX aparece: sem o aviso de retomada.
      setResumed(saved.screen !== "type" && saved.screen !== "payment");
    }
    setReady(true);
  }, [setDraft]);

  // Salvamento automático a cada alteração.
  useEffect(() => {
    if (!ready || finished.current) return;
    latest.current = { screen, data, draft };
    const timeout = window.setTimeout(() => {
      const now = Date.now();
      if (saveProgress({ v: 1, screen, data, draft, savedAt: now })) setSavedAt(now);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [ready, screen, data, draft]);

  // Garante o salvamento se a página for fechada ou recarregada antes do intervalo acima.
  useEffect(() => {
    const flush = () => {
      if (latest.current && !finished.current) saveProgress({ v: 1, ...latest.current, savedAt: Date.now() });
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const invalidateDraft = useCallback(() => {
    restoredDraftId.current = null;
    setDraft(null);
    draftPromise.current = null;
    setFiles([]);
    // O CPF ficava registrado no rascunho expirado: precisa ser informado de novo.
    setData((current) => ({ ...current, cpfMasked: null }));
    setNotice("Sua sessão de envio anterior expirou. Confira seu CPF e envie o ComprovaBet novamente.");
  }, [setDraft]);

  /**
   * Pergunta ao nosso servidor se o pagamento já foi confirmado (resposta lida do banco; a confirmação chega pela
   * notificação da BlackCat). manual: botão "Verificar pagamento".
   */
  const refreshPayment = useCallback(
    async (opts: { quiet?: boolean; manual?: boolean } = {}): Promise<PaymentState | null> => {
      const creds = draftRef.current;
      if (!creds) {
        setPaymentLoaded(true);
        return null;
      }
      if (!opts.quiet) setPaymentChecking(true);
      try {
        const res = await fetch(`/api/draft/payment${opts.manual ? "?verificar=1" : ""}`, { headers: draftHeaders(creds), cache: "no-store" });
        if (draftRef.current?.id !== creds.id) return null;
        if (res.status === 401) {
          invalidateDraft();
          setPayment(null);
          return null;
        }
        if (!res.ok) return null;
        const view = (await res.json()) as PaymentState;
        setPayment(view);
        return view;
      } catch {
        return null;
      } finally {
        setPaymentLoaded(true);
        if (!opts.quiet) setPaymentChecking(false);
      }
    },
    [invalidateDraft],
  );

  // Ao retomar um preenchimento salvo, busca os arquivos já enviados (ex.: ao voltar outro dia).
  // Só para o rascunho restaurado: num rascunho novo, a lista local já é a fonte certa.
  const draftId = draft?.id ?? null;
  useEffect(() => {
    const creds = draftRef.current;
    if (!ready || !draftId || !creds || draftId !== restoredDraftId.current) {
      setFilesLoading(false);
      return;
    }
    let cancelled = false;
    setFilesLoading(true);
    fetch("/api/draft/files", { headers: draftHeaders(creds), cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as { files?: DraftFile[]; cpfMasked?: string | null };
          setFiles((current) => {
            const known = new Set(current.map((f) => f.id));
            return [...current, ...(body.files ?? []).filter((f) => !known.has(f.id))];
          });
          setData((current) => ({ ...current, cpfMasked: body.cpfMasked ?? null }));
        } else if (res.status === 401) {
          invalidateDraft();
        }
        // 409: a solicitação já foi concluída com o pagamento aprovado (a tela de pagamento mostra o protocolo).
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, draftId, invalidateDraft]);

  // Avisa antes de sair da página durante um envio.
  useEffect(() => {
    if (!busy) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);

  const ensureDraft = useCallback(async (): Promise<DraftCreds> => {
    if (draftRef.current) return draftRef.current;
    if (!draftPromise.current) {
      draftPromise.current = (async () => {
        const res = await fetch("/api/draft", { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as { id?: string; token?: string; error?: string };
        if (!res.ok || !body.id || !body.token) throw new Error(body.error ?? "Não foi possível iniciar o envio. Tente novamente.");
        const creds = { id: body.id, token: body.token };
        setDraft(creds);
        return creds;
      })().finally(() => {
        draftPromise.current = null;
      });
    }
    return draftPromise.current;
  }, [setDraft]);

  const getDraft = useCallback(() => draftRef.current, []);

  const onPaymentScreen = screen === "payment";
  const paid = payment?.status === "paid";
  const pixOpen = !paid && payment?.status === "pending" && Boolean(payment.pix);
  const paymentStarted = paid || payment?.status === "pending";

  // Situação do pagamento: ao retomar um rascunho salvo e sempre que a tela de pagamento abre.
  useEffect(() => {
    if (!ready) return;
    if (!draftId) {
      setPaymentLoaded(true);
      return;
    }
    if (!onPaymentScreen && draftId !== restoredDraftId.current) return;
    void refreshPayment();
  }, [ready, draftId, onPaymentScreen, refreshPayment]);

  // Enquanto o PIX aguarda pagamento, pergunta ao nosso servidor a cada 4 segundos (atualização automática da tela).
  const paymentStatus = payment?.status ?? null;
  useEffect(() => {
    if (!onPaymentScreen || paymentStatus !== "pending") return;
    let rounds = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      rounds += 1;
      if (rounds > PAYMENT_POLL_ROUNDS) window.clearInterval(timer);
      else void refreshPayment({ quiet: true });
    }, PAYMENT_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshPayment({ quiet: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [onPaymentScreen, paymentStatus, refreshPayment]);

  // O PIX em aberto saiu da tela (pago, vencido ou cancelado): volta ao topo, onde fica o aviso da nova situação.
  const previousStatus = useRef<string | null>(null);
  useEffect(() => {
    const before = previousStatus.current;
    previousStatus.current = paymentStatus;
    if (onPaymentScreen && before === "pending" && paymentStatus && paymentStatus !== "pending") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [onPaymentScreen, paymentStatus]);

  // Página restaurada da memória pelo botão "voltar" do navegador: confere de novo o pagamento.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setPaying(false);
      void refreshPayment({ quiet: true });
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [refreshPayment]);

  const index = Math.max(0, SCREENS.findIndex((s) => s.id === screen));
  const meta = SCREENS[index] ?? SCREENS[0]!;
  const platformNames = useMemo(() => selectedPlatformNames(data), [data]);
  const sentComprovaBet = useMemo(() => comprovabetFiles(files), [files]);
  const comprovabetIds = useMemo(() => sentComprovaBet.map((f) => f.id), [sentComprovaBet]);
  const year = settings.comprovabetYear;
  // Resultado da pré-análise que vale para os arquivos atuais (ou o gravado no servidor, ao retomar o pagamento).
  const freshAnalysis = analysisResult && sameDocuments(analysisResult.documentIds, comprovabetIds) ? analysisResult : null;
  const analysisCtx = freshAnalysis
    ? { status: freshAnalysis.status, message: freshAnalysis.message }
    : payment?.preAnalysis
      ? { status: payment.preAnalysis, message: "Refaça a pré-análise do seu ComprovaBet." }
      : null;
  const progress = Math.round(((index + 1) / SCREENS.length) * 100);

  const goTo = useCallback((target: Screen) => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    setError(null);
    setCpfServerError(null);
    setAttempted(false);
    setResumed(false);
    setScreen(target);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (ready) headingRef.current?.focus({ preventScroll: true });
  }, [screen, ready]);

  // Com o pagamento aprovado, as respostas ficam fechadas: resta só solicitar a análise.
  useEffect(() => {
    if (paid && screen !== "payment") goTo("payment");
  }, [paid, screen, goTo]);

  // De volta à tela de pagamento depois de rever as respostas com um PIX em aberto: grava as respostas de novo
  // no servidor, que devolve o mesmo PIX (nunca gera outra cobrança nesse caso).
  const resyncPixRef = useRef<() => void>(() => undefined);
  resyncPixRef.current = () => void generatePix({ quiet: true, reuseOnly: true });
  useEffect(() => {
    if (!ready || screen !== "payment" || !leftPixOpen.current) return;
    leftPixOpen.current = false;
    resyncPixRef.current();
  }, [ready, screen]);

  // Ao abrir a tela da pré-análise: refaz a conferência (ou mostra o resultado já obtido para os mesmos arquivos).
  const runAnalysisRef = useRef<() => void>(() => undefined);
  runAnalysisRef.current = () => void runAnalysis();
  const freshAnalysisRef = useRef(freshAnalysis);
  freshAnalysisRef.current = freshAnalysis;
  useEffect(() => {
    if (!ready || screen !== "analysis") return;
    if (freshAnalysisRef.current) {
      setAnalysisAnimate(false);
      setAnalysisError(null);
      return;
    }
    runAnalysisRef.current();
  }, [ready, screen]);
  const onAnalysisSettled = useCallback(() => setAnalysisSettled(true), []);

  const update = useCallback((patch: Partial<WizardData>) => {
    setData((current) => ({ ...current, ...patch }));
    setError(null);
    if ("cpf" in patch) setCpfServerError(null);
  }, []);

  const advanceFrom = (from: Screen) => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      const i = SCREENS.findIndex((s) => s.id === from);
      const target = SCREENS[i + 1];
      if (target) goTo(target.id);
    }, 260);
  };

  const chooseType = (value: BetTypeValue) => {
    update(value === data.betType ? { betType: value } : { betType: value, sportsKind: null, casinoGames: [], mainLossArea: null });
    advanceFrom("type");
  };

  /** Leva à tela com a resposta pendente (ou ao envio do documento, sem rascunho). Devolve false se algo falta. */
  function answersComplete(): DraftCreds | null {
    const ctx = { fileCount: sentComprovaBet.length, busy, analysis: analysisCtx };
    const invalid = firstInvalidScreen(data, ctx);
    if (invalid) {
      goTo(invalid);
      setAttempted(true);
      setError(screenError(invalid, data, ctx));
      return null;
    }
    const creds = draftRef.current;
    if (!creds) {
      goTo("documents");
      setError("Envie o seu ComprovaBet para continuar.");
      return null;
    }
    return creds;
  }

  /** Erro devolvido pelo servidor: leva à tela do campo apontado (ou ao documento, se o rascunho expirou). */
  function showServerError(status: number, body: { error?: string; field?: string }, fallback: string) {
    const message = body.error ?? fallback;
    if (status === 401 || status === 410) {
      invalidateDraft();
      goTo("documents");
    } else {
      const field = body.field?.split(".")[0] ?? "";
      const target = field ? FIELD_SCREEN[field] : undefined;
      if (field === "cpf") update({ cpfMasked: null });
      // Depois do pagamento aprovado, as respostas ficam fechadas: o aviso aparece na própria tela de pagamento.
      if (target && target !== screen && !paid) {
        goTo(target);
        setAttempted(true);
      } else if (field === "accept") {
        setAttempted(true);
      }
    }
    setError(message);
  }

  /** Pré-análise automática: o servidor lê o ComprovaBet e confere com as respostas do formulário. */
  async function runAnalysis() {
    const creds = draftRef.current;
    if (!creds) {
      goTo("documents");
      setError("Envie o seu ComprovaBet para continuar.");
      return;
    }
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisSettled(false);
    setAnalysisAnimate(true);
    setAnalysisRunning(true);
    try {
      const res = await fetch("/api/draft/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...draftHeaders(creds) },
        body: JSON.stringify({ answers: buildPayload(data) }),
      });
      const body = (await res.json().catch(() => ({}))) as { analysis?: PreAnalysis; error?: string; field?: string };
      if (res.ok && body.analysis) {
        setAnalysisResult(body.analysis);
        return;
      }
      if (res.status === 401 || res.status === 410 || (res.status === 422 && body.field)) {
        showServerError(res.status, body, "Não foi possível fazer a pré-análise agora. Tente novamente.");
        return;
      }
      setAnalysisError(body.error ?? "Não foi possível fazer a pré-análise agora. Tente novamente.");
    } catch {
      setAnalysisError("Sem conexão. Verifique sua internet e tente novamente.");
    } finally {
      setAnalysisRunning(false);
    }
  }

  /**
   * Gera o PIX: grava o aceite e as respostas no servidor, que cria a cobrança (valor definido no servidor) e
   * devolve o QR Code e o copia e cola. Com um PIX já em aberto, o servidor devolve o mesmo (sem nova cobrança).
   */
  async function generatePix(opts: { quiet?: boolean; reuseOnly?: boolean } = {}) {
    if (paying || !settings.payment.available) return;
    if (!data.termsAccepted && !pixOpen) {
      setAttempted(true);
      setError(TERMS_REQUIRED_MESSAGE);
      return;
    }
    const creds = answersComplete();
    if (!creds) return;
    setPaying(true);
    if (!opts.quiet) setError(null);
    try {
      const res = await fetch("/api/payments/blackcat/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...draftHeaders(creds) },
        body: JSON.stringify({ accept: true, answers: buildPayload(data), reuseOnly: opts.reuseOnly === true }),
      });
      const body = (await res.json().catch(() => ({}))) as { payment?: PaymentState; alreadyPaid?: boolean; error?: string; field?: string };
      if (res.ok && body.alreadyPaid) {
        await refreshPayment();
        return;
      }
      if (res.ok && body.payment) {
        setPayment(body.payment);
        setPaymentLoaded(true);
        if (!data.termsAccepted) update({ termsAccepted: true });
        if (!opts.quiet) window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      showServerError(res.status, body, PIX_ERROR_MESSAGE);
    } catch {
      setError("Sem conexão. Verifique sua internet e tente novamente.");
    } finally {
      setPaying(false);
    }
  }

  /** Demonstração: simula a confirmação (ou o vencimento) do PIX. */
  async function simulateDemo(outcome: "paid" | "expired") {
    const creds = draftRef.current;
    if (!creds || simulating) return;
    setSimulating(true);
    try {
      await fetch("/api/payments/demo/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...draftHeaders(creds) },
        body: JSON.stringify({ outcome }),
      });
      await refreshPayment({ quiet: true });
    } catch {
      setError("Sem conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSimulating(false);
    }
  }

  /** Solicita a análise (liberado só com o pagamento aprovado). */
  async function submit() {
    if (!paid) {
      setError(screenError("payment", data, { fileCount: sentComprovaBet.length, busy, paid }));
      return;
    }
    const creds = draftRef.current;
    if (!creds) {
      goTo("documents");
      setError("Envie o seu ComprovaBet para continuar.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...draftHeaders(creds) },
        body: JSON.stringify(buildPayload(data)),
      });
      const body = (await res.json().catch(() => ({}))) as { protocol?: string; error?: string; field?: string };
      if (res.ok && body.protocol) {
        finished.current = true;
        clearProgress();
        router.replace("/analise/recebida");
        return;
      }
      if (body.field === "payment") void refreshPayment();
      showServerError(res.status, body, "Não foi possível enviar agora. Tente novamente.");
    } catch {
      setError("Sem conexão. Verifique sua internet e tente novamente.");
    } finally {
      if (!finished.current) setSubmitting(false);
    }
  }

  /** Registra o CPF no rascunho (o ComprovaBet é conferido com ele) e segue para o documento. */
  async function saveCpfAndContinue(target: Screen) {
    setSavingCpf(true);
    setError(null);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const creds = await ensureDraft();
        const res = await fetch("/api/draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...draftHeaders(creds) },
          body: JSON.stringify({ cpf: data.cpf }),
        });
        const body = (await res.json().catch(() => ({}))) as { cpfMasked?: string; error?: string };
        if (res.ok && body.cpfMasked) {
          update({ cpfMasked: body.cpfMasked, cpf: "" });
          goTo(target);
          return;
        }
        if (res.status === 401 && attempt === 0) {
          invalidateDraft();
          continue;
        }
        setAttempted(true);
        setCpfServerError(body.error ?? "Não foi possível registrar o CPF. Tente novamente.");
        return;
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Sem conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSavingCpf(false);
    }
  }

  function next() {
    if (savingCpf || paying || submitting) return;
    if (filesLoading && screen === "documents") return;
    if (screen === "payment") {
      if (paid) void submit();
      else if (pixOpen) void refreshPayment({ manual: true });
      else void generatePix();
      return;
    }
    if (screen === "analysis") {
      if (analysisRunning || (freshAnalysis && !analysisSettled)) return;
      if (analysisError || !freshAnalysis) {
        void runAnalysis();
        return;
      }
      if (freshAnalysis.status === "blocked") {
        goTo("documents");
        return;
      }
      if (answersComplete()) goTo("payment");
      return;
    }
    const message = screenError(screen, data, { fileCount: sentComprovaBet.length, busy });
    if (message) {
      setError(message);
      setAttempted(true);
      return;
    }
    const target = SCREENS[index + 1];
    if (screen === "contact" && data.cpf && target) {
      void saveCpfAndContinue(target.id);
      return;
    }
    if (target) goTo(target.id);
  }

  const cpfMissing = useCallback(
    (message: string) => {
      setData((current) => ({ ...current, cpfMasked: null }));
      goTo("contact");
      setAttempted(true);
      setCpfServerError(message);
    },
    [goTo],
  );

  function back() {
    if (paid) return;
    if (screen === "payment" && pixOpen) leftPixOpen.current = true;
    const previous = SCREENS[index - 1];
    if (previous) goTo(previous.id);
    else router.push("/");
  }

  async function restart() {
    if (paymentStarted) return;
    if (!window.confirm("Recomeçar do início? As respostas e os arquivos enviados até agora serão apagados.")) return;
    const creds = draftRef.current;
    if (creds) {
      const res = await fetch("/api/draft", { method: "DELETE", headers: draftHeaders(creds) }).catch(() => null);
      if (res?.status === 409) {
        // Há um pagamento em andamento ou aprovado: o pedido não pode ser apagado.
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Há um pagamento em andamento para esta solicitação.");
        void refreshPayment();
        return;
      }
    }
    clearProgress();
    setPayment(null);
    setAnalysisResult(null);
    setData(EMPTY_DATA);
    setDraft(null);
    setFiles([]);
    setNotice(null);
    setSavedAt(null);
    goTo("type");
  }

  function renderScreen() {
    const common = { data, update, headingRef };
    switch (screen) {
      case "type":
        return <TypeStep data={data} headingRef={headingRef} onChoose={chooseType} />;
      case "typeDetail":
        return <TypeDetailStep {...common} onSingleChoice={() => advanceFrom("typeDetail")} />;
      case "platforms":
        return <PlatformsStep {...common} />;
      case "period":
        return <PeriodStep {...common} year={year} />;
      case "amounts":
        return <AmountsStep {...common} year={year} />;
      case "balance":
        return <BalanceStep {...common} />;
      case "control":
        return <ControlStep {...common} />;
      case "situation":
        return <SituationStep {...common} />;
      case "documents":
        return (
          <DocumentsStep
            {...common}
            year={year}
            files={files}
            setFiles={setFiles}
            ensureDraft={ensureDraft}
            getDraft={getDraft}
            onDraftInvalid={invalidateDraft}
            onCpfMissing={cpfMissing}
            setBusy={setBusy}
            maxUploadMb={settings.maxUploadMb}
            notice={notice}
            loadingFiles={filesLoading}
          />
        );
      case "commitment":
        return <CommitmentStep {...common} reviewDays={settings.reviewDays} />;
      case "contact":
        return <ContactStep {...common} showErrors={attempted} cpfLocked={sentComprovaBet.length > 0} serverError={cpfServerError} />;
      case "review":
        return (
          <ReviewStep
            data={data}
            headingRef={headingRef}
            platformNames={platformNames}
            year={year}
            goTo={goTo}
          />
        );
      case "analysis":
        return (
          <AnalysisStep
            headingRef={headingRef}
            year={year}
            result={freshAnalysis}
            error={analysisError}
            animate={analysisAnimate}
            onSettled={onAnalysisSettled}
          />
        );
      case "payment":
        return (
          <PaymentStep
            {...common}
            settings={settings.payment}
            payment={payment}
            showErrors={attempted}
            analysis={analysisCtx?.status ?? null}
            reviewDays={settings.reviewDays}
            onSimulate={(outcome) => void simulateDemo(outcome)}
            simulating={simulating}
          />
        );
    }
  }

  const analysisBusy = screen === "analysis" && (analysisRunning || Boolean(freshAnalysis && !analysisSettled));
  const primaryLabel =
    screen === "analysis"
      ? analysisBusy
        ? "Analisando…"
        : analysisError || !freshAnalysis
          ? "Tentar novamente"
          : freshAnalysis.status === "blocked"
            ? "Enviar outro documento"
            : "Ir para o pagamento"
      : screen === "payment"
        ? paid
          ? "Solicitar análise"
          : paying
            ? "Gerando PIX…"
            : pixOpen
              ? "Verificar pagamento"
              : payment && payment.status !== "none"
                ? "Gerar novo PIX"
                : "Gerar PIX"
        : "Continuar";

  const stepLabel = meta.step ? `Etapa ${meta.step} de ${TOTAL_STEPS}` : meta.label;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-5 pt-3">
          <Logo compact />
          <div className="flex items-center gap-1">
            {ready && savedAt && (
              <span key={savedAt} className="fade-in inline-flex items-center gap-1 text-xs font-medium text-ok-700" aria-live="polite">
                <IconCheck size={14} strokeWidth={2.5} />
                Informações salvas
              </span>
            )}
            <Link href="/" className="ml-2 rounded-lg p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Sair do formulário">
              <IconX size={20} />
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-xl px-5 pb-3 pt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-ink">{ready ? stepLabel : " "}</span>
            <span className="text-muted tabular-nums">{ready ? `${progress}%` : ""}</span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100"
            role="progressbar"
            aria-label="Progresso da solicitação"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ready ? progress : 0}
          >
            <div className="h-full rounded-full bg-navy-900 transition-[width] duration-500 ease-out" style={{ width: `${ready ? progress : 0}%` }} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-5 pb-40 pt-7 sm:pt-10">
        {!ready ? (
          <div className="space-y-3" aria-busy="true" aria-label="Carregando">
            <div className="h-9 w-3/4 animate-pulse rounded-lg bg-line" />
            <div className="h-20 animate-pulse rounded-2xl bg-line/70" />
            <div className="h-20 animate-pulse rounded-2xl bg-line/70" />
            <div className="h-20 animate-pulse rounded-2xl bg-line/70" />
          </div>
        ) : (
          <>
            {resumed && !paid && (
              <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
                <span className="text-ink-soft">Continuando de onde você parou.</span>
                {!paymentStarted && (
                  <button type="button" onClick={restart} className="font-medium text-navy-700 hover:underline">
                    Recomeçar
                  </button>
                )}
              </div>
            )}
            <div key={screen} className="step-in">
              {renderScreen()}
            </div>
            {error && (
              <p role="alert" className="mt-6 rounded-xl border border-danger-700/20 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">
                {error}
              </p>
            )}
          </>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto flex max-w-xl gap-3 px-5 py-3">
          {!(onPaymentScreen && paid) && (
            <Button variant="secondary" onClick={back} className="w-[7.5rem] shrink-0" disabled={!ready || submitting || savingCpf || paying || analysisRunning}>
              Voltar
            </Button>
          )}
          <Button
            onClick={next}
            className="flex-1"
            disabled={!ready || (onPaymentScreen && !paid && !settings.payment.available)}
            loading={
              submitting ||
              savingCpf ||
              paying ||
              analysisBusy ||
              (filesLoading && screen === "documents") ||
              (onPaymentScreen && (!paymentLoaded || (pixOpen && paymentChecking)))
            }
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
