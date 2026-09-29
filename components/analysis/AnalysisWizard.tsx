"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PIX_ERROR_MESSAGE } from "@/lib/payments/types";
import { IconCheck, IconX } from "../icons";
import { Logo } from "../site";
import { Button } from "../ui";
import {
  EMPTY_DATA,
  FIELD_SCREEN,
  SCREENS,
  TERMS_REQUIRED_MESSAGE,
  TOTAL_STEPS,
  buildPayload,
  buildPreferences,
  clearProgress,
  draftHeaders,
  firstInvalidScreen,
  loadProgress,
  resumeScreen,
  saveProgress,
  screenError,
  selectedPlatformNames,
  type DraftCreds,
  type PaymentState,
  type Screen,
  type WizardData,
} from "./state";
import {
  ContactStep,
  LossStep,
  PaymentStep,
  PeriodStep,
  PlatformsStep,
  PreferencesStep,
  PreviousStep,
  ResultStep,
  type PaymentSettings,
} from "./steps";

export type WizardSettings = { payment: PaymentSettings };

/** Enquanto o PIX aguarda pagamento, a tela pergunta ao nosso servidor a cada 4 s (por até 30 minutos). */
const PAYMENT_POLL_MS = 4000;
const PAYMENT_POLL_ROUNDS = 450;

const OFFLINE = "Sem conexão. Verifique sua internet e tente novamente.";

export function AnalysisWizard({ settings }: { settings: WizardSettings }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("previous");
  const [data, setData] = useState<WizardData>(EMPTY_DATA);
  const [draft, setDraftState] = useState<DraftCreds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [resumed, setResumed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingCpf, setSavingCpf] = useState(false);
  const [cpfServerError, setCpfServerError] = useState<string | null>(null);
  // Pagamento da taxa por PIX (antes do registro da solicitação).
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [simulating, setSimulating] = useState(false);

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
      setResumed(saved.screen !== "previous" && saved.screen !== "payment" && saved.screen !== "preferences");
    }
    setReady(true);
  }, [setDraft]);

  // Salvamento automático a cada alteração.
  useEffect(() => {
    if (!ready || finished.current) return;
    latest.current = { screen, data, draft };
    const timeout = window.setTimeout(() => {
      const now = Date.now();
      if (saveProgress({ v: 2, screen, data, draft, savedAt: now })) setSavedAt(now);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [ready, screen, data, draft]);

  // Garante o salvamento se a página for fechada ou recarregada antes do intervalo acima.
  useEffect(() => {
    const flush = () => {
      if (latest.current && !finished.current) saveProgress({ v: 2, ...latest.current, savedAt: Date.now() });
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const goTo = useCallback((target: Screen) => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    setError(null);
    setCpfServerError(null);
    setAttempted(false);
    setResumed(false);
    setScreen(target);
    window.scrollTo({ top: 0 });
  }, []);

  /** O rascunho no servidor expirou: o CPF (guardado nele) precisa ser informado de novo. */
  const invalidateDraft = useCallback(() => {
    restoredDraftId.current = null;
    setDraft(null);
    draftPromise.current = null;
    setPayment(null);
    setData((current) => ({ ...current, cpfMasked: null }));
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

  // Ao retomar um preenchimento salvo, confere o rascunho no servidor (ex.: ao voltar outro dia).
  const draftId = draft?.id ?? null;
  useEffect(() => {
    const creds = draftRef.current;
    if (!ready || !draftId || !creds || draftId !== restoredDraftId.current) return;
    let cancelled = false;
    fetch("/api/draft", { headers: draftHeaders(creds), cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as { cpfMasked?: string | null };
          setData((current) => ({ ...current, cpfMasked: body.cpfMasked ?? null }));
        } else if (res.status === 401) {
          invalidateDraft();
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, draftId, invalidateDraft]);

  const ensureDraft = useCallback(async (): Promise<DraftCreds> => {
    if (draftRef.current) return draftRef.current;
    if (!draftPromise.current) {
      draftPromise.current = (async () => {
        const res = await fetch("/api/draft", { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as { id?: string; token?: string; error?: string };
        if (!res.ok || !body.id || !body.token) throw new Error(body.error ?? "Não foi possível continuar agora. Tente novamente.");
        const creds = { id: body.id, token: body.token };
        setDraft(creds);
        return creds;
      })().finally(() => {
        draftPromise.current = null;
      });
    }
    return draftPromise.current;
  }, [setDraft]);

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

  // O PIX em aberto saiu da tela (vencido ou cancelado): volta ao topo, onde fica o aviso da nova situação.
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
  const progress = Math.round(((index + 1) / SCREENS.length) * 100);

  useEffect(() => {
    if (ready) headingRef.current?.focus({ preventScroll: true });
  }, [screen, ready]);

  // Com o pagamento confirmado, as respostas ficam fechadas: resta dizer como prefere ser contatado.
  // Sem pagamento confirmado, a tela das preferências ainda não vale (ex.: preenchimento retomado).
  useEffect(() => {
    if (paid && screen !== "preferences") goTo("preferences");
    else if (!paid && paymentLoaded && screen === "preferences") goTo("payment");
  }, [paid, paymentLoaded, screen, goTo]);

  // De volta à tela de pagamento depois de rever as respostas com um PIX em aberto: grava as respostas de novo
  // no servidor, que devolve o mesmo PIX (nunca gera outra cobrança nesse caso).
  const resyncPixRef = useRef<() => void>(() => undefined);
  resyncPixRef.current = () => void generatePix({ quiet: true, reuseOnly: true });
  useEffect(() => {
    if (!ready || screen !== "payment" || !leftPixOpen.current) return;
    leftPixOpen.current = false;
    resyncPixRef.current();
  }, [ready, screen]);

  const update = useCallback((patch: Partial<WizardData>) => {
    setData((current) => ({ ...current, ...patch }));
    setError(null);
    if ("cpf" in patch) setCpfServerError(null);
  }, []);

  /** Escolha única: avança sozinho depois de um instante (dá tempo de ver a marcação). */
  const chooseAndAdvance = (patch: Partial<WizardData>, from: Screen) => {
    update(patch);
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      const i = SCREENS.findIndex((s) => s.id === from);
      const target = SCREENS[i + 1];
      if (target) goTo(target.id);
    }, 260);
  };

  const choosePrevious = (value: "yes" | "no") => {
    if (value === "yes") {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
      update({ previousRequest: "yes" });
      return;
    }
    chooseAndAdvance({ previousRequest: "no" }, "previous");
  };

  /** Leva à tela com a resposta pendente (ou aos dados, sem rascunho com o CPF). Devolve null se algo falta. */
  function answersComplete(): DraftCreds | null {
    const invalid = firstInvalidScreen(data);
    if (invalid) {
      goTo(invalid);
      setAttempted(true);
      setError(screenError(invalid, data));
      return null;
    }
    const creds = draftRef.current;
    if (!creds || !data.cpfMasked) {
      goTo("contact");
      setAttempted(true);
      setCpfServerError("Confirme seu CPF para continuar.");
      update({ cpfMasked: null });
      return null;
    }
    return creds;
  }

  /** Erro devolvido pelo servidor: leva à tela do campo apontado (ou aos dados, se o rascunho expirou). */
  function showServerError(status: number, body: { error?: string; field?: string }, fallback: string) {
    const message = body.error ?? fallback;
    if (status === 401 || status === 410) {
      invalidateDraft();
      goTo("contact");
      setAttempted(true);
      setCpfServerError("Sua sessão expirou. Confirme seu CPF para continuar.");
      return;
    }
    const field = body.field?.split(".")[0] ?? "";
    const target = field ? FIELD_SCREEN[field] : undefined;
    if (field === "cpf") update({ cpfMasked: null });
    // Depois do pagamento aprovado, as respostas ficam fechadas: o aviso aparece na própria tela.
    if (target && target !== screen && !paid) {
      goTo(target);
      setAttempted(true);
    } else if (field === "accept" || field === "preferences") {
      setAttempted(true);
    }
    setError(message);
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
      setError(OFFLINE);
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
      setError(OFFLINE);
    } finally {
      setSimulating(false);
    }
  }

  /** Conclui: grava as preferências de contato na solicitação (registrada com a confirmação do pagamento). */
  async function finish() {
    const message = screenError("preferences", data);
    if (message) {
      setAttempted(true);
      setError(message);
      return;
    }
    const creds = draftRef.current;
    if (!creds) {
      setError("Sua sessão expirou. Acesse o acompanhamento com o protocolo enviado para concluir.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...draftHeaders(creds) },
        body: JSON.stringify({ answers: buildPayload(data), preferences: buildPreferences(data) }),
      });
      const body = (await res.json().catch(() => ({}))) as { protocol?: string; error?: string; field?: string };
      if (res.ok && body.protocol) {
        finished.current = true;
        clearProgress();
        router.replace("/analise/recebida");
        return;
      }
      if (body.field === "payment") void refreshPayment();
      showServerError(res.status, body, "Não foi possível concluir agora. Tente novamente.");
    } catch {
      setError(OFFLINE);
    } finally {
      if (!finished.current) setSubmitting(false);
    }
  }

  /** Registra o CPF no rascunho (usado na cobrança e no registro da solicitação) e mostra o resultado. */
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
      setError(err instanceof Error && err.message ? err.message : OFFLINE);
    } finally {
      setSavingCpf(false);
    }
  }

  function next() {
    if (savingCpf || paying || submitting) return;
    if (screen === "previous" && data.previousRequest === "yes") {
      router.push("/");
      return;
    }
    if (screen === "payment") {
      if (paid) goTo("preferences");
      else if (pixOpen) void refreshPayment({ manual: true });
      else void generatePix();
      return;
    }
    if (screen === "preferences") {
      void finish();
      return;
    }
    const message = screenError(screen, data, { paid });
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

  function back() {
    if (paid) return;
    if (screen === "payment" && pixOpen) leftPixOpen.current = true;
    const previous = SCREENS[index - 1];
    if (previous) goTo(previous.id);
    else router.push("/");
  }

  async function restart() {
    if (paymentStarted) return;
    if (!window.confirm("Recomeçar do início? As respostas informadas até agora serão apagadas.")) return;
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
    setData(EMPTY_DATA);
    setDraft(null);
    setSavedAt(null);
    goTo("previous");
  }

  function renderScreen() {
    const common = { data, update, headingRef };
    switch (screen) {
      case "previous":
        return <PreviousStep data={data} headingRef={headingRef} onChoose={choosePrevious} />;
      case "platforms":
        return <PlatformsStep {...common} />;
      case "period":
        return <PeriodStep data={data} headingRef={headingRef} onChoose={(period) => chooseAndAdvance({ period }, "period")} />;
      case "loss":
        return <LossStep data={data} headingRef={headingRef} onChoose={(lossRange) => chooseAndAdvance({ lossRange }, "loss")} />;
      case "contact":
        return <ContactStep {...common} showErrors={attempted} serverError={cpfServerError} />;
      case "result":
        return <ResultStep data={data} headingRef={headingRef} platformNames={platformNames} priceCents={settings.payment.priceCents} goTo={goTo} />;
      case "payment":
        return (
          <PaymentStep
            {...common}
            settings={settings.payment}
            payment={payment}
            showErrors={attempted}
            onSimulate={(outcome) => void simulateDemo(outcome)}
            simulating={simulating}
          />
        );
      case "preferences":
        return <PreferencesStep {...common} payment={payment} showErrors={attempted} />;
    }
  }

  const primaryLabel =
    screen === "previous" && data.previousRequest === "yes"
      ? "Voltar para o início"
      : screen === "result"
        ? "Continuar para o pagamento"
        : screen === "payment"
          ? paid
            ? "Continuar"
            : paying
              ? "Gerando PIX…"
              : pixOpen
                ? "Verificar pagamento"
                : payment && payment.status !== "none"
                  ? "Gerar novo PIX"
                  : "Gerar PIX"
          : screen === "preferences"
            ? "Concluir"
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
          {!paid && screen !== "preferences" && (
            <Button variant="secondary" onClick={back} className="w-[7.5rem] shrink-0" disabled={!ready || submitting || savingCpf || paying}>
              Voltar
            </Button>
          )}
          <Button
            onClick={next}
            className="flex-1"
            disabled={!ready || (onPaymentScreen && !paid && !settings.payment.available)}
            loading={submitting || savingCpf || paying || (onPaymentScreen && (!paymentLoaded || (pixOpen && paymentChecking)))}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
