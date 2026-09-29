import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  EMPTY_DATA,
  FIELD_SCREEN,
  PAYMENT_REQUIRED_MESSAGE,
  SCREENS,
  TERMS_REQUIRED_MESSAGE,
  buildPayload,
  buildPreferences,
  contactErrors,
  firstInvalidScreen,
  loadProgress,
  preferenceErrors,
  resumeScreen,
  saveProgress,
  screenError,
  selectedPlatformNames,
  type WizardData,
} from "@/components/analysis/state";
import { addBusinessDays, contactDeadlineFrom } from "@/lib/business-days";
import { resolvePlatforms } from "@/lib/cases/platforms";
import { legacySubmissionSchema, parseStoredAnswers, preferencesSchema, submissionSchema } from "@/lib/cases/submission";
import { contactState, deadlineDistance, formatDeadline } from "@/lib/contact";
import { ALREADY_REQUESTED_MESSAGE } from "@/lib/intake";
import { generateProtocol, normalizeProtocol } from "@/lib/protocol";
import { hashPassword, verifyPassword } from "@/lib/security";
import { clientCpfLabel, clientDocumentLabel, clientTimeline, divergenceOf, paidBeforeRequest } from "@/lib/status";

const filled: WizardData = {
  ...EMPTY_DATA,
  previousRequest: "no",
  platforms: ["betano"],
  otherPlatformEnabled: true,
  customPlatforms: [" Minha  Bet ", "betano"],
  period: "over_12m",
  lossRange: "from_5k_to_20k",
  privacyConsent: true,
  fullName: " Ana  Souza ",
  cpf: "52998224725",
  email: "ana@exemplo.com.br",
  whatsapp: "(49) 99999-9999",
  isAdult: true,
};

describe("formulário sem documento", () => {
  test("ordem: 5 perguntas, resultado, pagamento e, por último, as preferências de contato", () => {
    assert.deepEqual(
      SCREENS.map((s) => s.id),
      ["previous", "platforms", "period", "loss", "contact", "result", "payment", "preferences"],
    );
    assert.deepEqual(
      SCREENS.filter((s) => s.step !== null).map((s) => s.step),
      [1, 2, 3, 4, 5],
    );
    // Nenhuma tela de envio de documento no formulário.
    assert.ok(!SCREENS.some((s) => (s.id as string) === "documents"));
  });

  test("quem já pediu o estorno não segue (uma solicitação por CPF)", () => {
    assert.equal(screenError("previous", { ...filled, previousRequest: null }), "Escolha uma opção para continuar.");
    assert.equal(screenError("previous", { ...filled, previousRequest: "yes" }), ALREADY_REQUESTED_MESSAGE);
    assert.equal(screenError("previous", filled), null);
    assert.equal(firstInvalidScreen({ ...filled, previousRequest: "yes" }), "previous");
    // O servidor também recusa: a declaração vai nas respostas.
    const result = submissionSchema.safeParse(buildPayload({ ...filled, previousRequest: "yes" }));
    assert.ok(!result.success);
    assert.equal(result.error.issues[0]?.path.join("."), "neverRequested");
    assert.equal(result.error.issues[0]?.message, ALREADY_REQUESTED_MESSAGE);
    assert.equal(FIELD_SCREEN.neverRequested, "previous");
  });

  test("casas selecionadas (listadas e digitadas em “Outra”)", () => {
    assert.deepEqual(selectedPlatformNames(filled), ["Betano", "Minha Bet"]);
    assert.equal(screenError("platforms", { ...filled, platforms: [], otherPlatformEnabled: false }), "Selecione ao menos uma casa de apostas.");
    assert.equal(
      screenError("platforms", { ...filled, platforms: [], otherPlatformEnabled: true, customPlatforms: [" "] }),
      "Informe o nome da casa de apostas.",
    );
  });

  test("validação de cada tela", () => {
    for (const s of ["previous", "platforms", "period", "loss", "contact", "result"] as const) {
      assert.equal(screenError(s, filled), null, s);
    }
    assert.equal(screenError("period", { ...filled, period: null }), "Escolha uma opção para continuar.");
    assert.equal(screenError("loss", { ...filled, lossRange: null }), "Escolha uma faixa para continuar.");
    assert.equal(screenError("contact", { ...filled, fullName: "Ana" }), "Informe seu nome completo.");
    assert.equal(screenError("contact", { ...filled, cpf: "123.456.789-00" }), "CPF inválido. Confira os números.");
    assert.equal(screenError("contact", { ...filled, privacyConsent: false }), "Para continuar, autorize o tratamento dos seus dados.");
    assert.equal(screenError("contact", { ...filled, isAdult: false }), "O serviço é exclusivo para maiores de 18 anos.");
  });

  test("CPF obrigatório e válido nos dados do solicitante", () => {
    assert.equal(contactErrors({ ...filled, cpf: "" }).cpf, "Informe seu CPF.");
    assert.equal(contactErrors({ ...filled, cpf: "52998224724" }).cpf, "CPF inválido. Confira os números.");
    assert.equal(contactErrors({ ...filled, cpf: "11111111111" }).cpf, "CPF inválido. Confira os números.");
    assert.equal(contactErrors(filled).cpf, undefined);
    // CPF já registrado no servidor (só a versão mascarada fica no navegador).
    assert.equal(contactErrors({ ...filled, cpf: "", cpfMasked: "***.***.***-25" }).cpf, undefined);
  });

  test("pagamento: depois do resultado; as preferências só depois do pagamento aprovado", () => {
    const order = SCREENS.map((s) => s.id);
    assert.equal(order.indexOf("result") + 1, order.indexOf("payment"));
    assert.equal(order.at(-1), "preferences");
    assert.equal(screenError("payment", { ...filled, termsAccepted: false }), TERMS_REQUIRED_MESSAGE);
    assert.equal(screenError("payment", { ...filled, termsAccepted: true }), PAYMENT_REQUIRED_MESSAGE);
    assert.equal(screenError("payment", { ...filled, termsAccepted: true }, { paid: true }), null);
    // Antes de gerar o PIX, todas as respostas precisam estar completas.
    assert.equal(firstInvalidScreen(filled), null);
    assert.equal(firstInvalidScreen({ ...filled, lossRange: null }), "loss");
    assert.equal(FIELD_SCREEN.accept, "payment");
    assert.equal(FIELD_SCREEN.payment, "payment");
    // O aceite não vai nas respostas (é registrado pelo servidor ao gerar o PIX).
    assert.ok(!("termsAccepted" in buildPayload({ ...filled, termsAccepted: true })));
  });

  test("preferências de contato: as três respostas são obrigatórias", () => {
    assert.deepEqual(Object.keys(preferenceErrors(filled)), ["evidence", "contactChannel", "contactPeriod"]);
    const chosen: WizardData = { ...filled, evidence: "bank_statement", contactChannel: "whatsapp", contactPeriod: "evening" };
    assert.equal(screenError("preferences", chosen), null);
    assert.equal(screenError("preferences", { ...chosen, contactPeriod: null }), "Escolha o melhor horário para o contato.");
    assert.ok(preferencesSchema.safeParse(buildPreferences(chosen)).success);
    assert.ok(!preferencesSchema.safeParse(buildPreferences({ ...chosen, evidence: null })).success);
    assert.ok(!preferencesSchema.safeParse({ ...buildPreferences(chosen), channel: "telegram" }).success);
  });

  test("o CPF completo não é salvo no navegador", () => {
    const store = new Map<string, string>();
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const g = globalThis as unknown as { window?: unknown };
    g.window = { localStorage };
    try {
      assert.ok(saveProgress({ v: 2, screen: "result", data: { ...filled, cpfMasked: "***.***.***-25" }, draft: null, savedAt: 1 }));
      const raw = [...store.values()].join("");
      assert.ok(!raw.includes("52998224725"));
      assert.ok(raw.includes("***.***.***-25"));
      const loaded = loadProgress();
      assert.equal(loaded?.data.cpf, "");
      assert.equal(loaded?.data.cpfMasked, "***.***.***-25");
      // Preenchimento salvo pelo formulário anterior (com o ComprovaBet) é ignorado.
      store.clear();
      store.set("analise:v1", JSON.stringify({ v: 1, screen: "documents", data: filled, draft: null, savedAt: 1 }));
      assert.equal(loadProgress(), null);
    } finally {
      delete g.window;
    }
  });

  test("retomada volta para a primeira etapa incompleta", () => {
    assert.equal(resumeScreen("result", { ...filled, period: null }), "period");
    assert.equal(resumeScreen("payment", { ...filled, previousRequest: "yes" }), "previous");
    assert.equal(resumeScreen("contact", filled), "contact");
    // Sem o CPF registrado no servidor, a retomada volta para os dados do solicitante.
    assert.equal(resumeScreen("result", { ...filled, cpf: "", cpfMasked: null }), "contact");
    assert.equal(resumeScreen("payment", { ...filled, cpf: "", cpfMasked: "***.***.***-25" }), "payment");
  });

  test("dados enviados ao servidor passam na validação", () => {
    const payload = buildPayload(filled);
    assert.equal(payload.fullName, "Ana Souza");
    assert.equal(payload.neverRequested, true);
    // O CPF não vai nas respostas: ele fica registrado no rascunho do servidor.
    assert.ok(!("cpf" in payload));
    const result = submissionSchema.safeParse(payload);
    assert.ok(result.success);
  });

  test("servidor recusa dados inconsistentes", () => {
    const payload = buildPayload(filled);
    const firstIssuePath = (patch: Record<string, unknown>) => {
      const result = submissionSchema.safeParse({ ...payload, ...patch });
      assert.ok(!result.success);
      return result.error.issues[0]?.path.join(".");
    };
    assert.equal(firstIssuePath({ neverRequested: false }), "neverRequested");
    assert.equal(firstIssuePath({ lossRange: "over_1m" }), "lossRange");
    assert.equal(firstIssuePath({ period: null }), "period");
    assert.equal(firstIssuePath({ whatsapp: "123" }), "whatsapp");
    assert.equal(firstIssuePath({ privacyConsent: false }), "privacyConsent");
    assert.equal(firstIssuePath({ isAdult: false }), "isAdult");
    assert.equal(firstIssuePath({ email: "ana@" }), "email");
    assert.equal(firstIssuePath({ platforms: [], otherPlatformEnabled: false, customPlatforms: [] }), "platforms");
  });

  test("respostas gravadas no rascunho: do formulário atual ou do anterior (PIX gerado antes da atualização)", () => {
    const current = parseStoredAnswers(buildPayload(filled));
    assert.equal(current?.kind, "current");
    const legacy = {
      betType: "sports",
      sportsKind: "live",
      casinoGames: [],
      mainLossArea: null,
      platforms: ["betano"],
      otherPlatformEnabled: false,
      customPlatforms: [],
      period: "over_12m",
      depositsCents: 3000000,
      withdrawalsCents: 1000000,
      hasBalance: false,
      balanceCents: null,
      controlLoss: "yes",
      situations: ["chasing_losses"],
      situationOther: "",
      privacyConsent: true,
      commitment: true,
      fullName: "Ana Souza",
      email: "ana@exemplo.com.br",
      whatsapp: "(49) 99999-9999",
      isAdult: true,
    };
    assert.ok(legacySubmissionSchema.safeParse(legacy).success);
    const parsed = parseStoredAnswers(legacy);
    assert.equal(parsed?.kind, "legacy");
    assert.equal(parseStoredAnswers({ fullName: "Ana" }), null);
    assert.equal(parseStoredAnswers(null), null);
  });
});

describe("primeiro contato da equipe", () => {
  test("prazo: fim do expediente (18h) do próximo dia útil depois do pagamento", () => {
    // Segunda, 28/09/2026, 10h em Brasília → terça, 29/09, 18h (21h UTC).
    assert.equal(contactDeadlineFrom(new Date("2026-09-28T13:00:00Z")).toISOString(), "2026-09-29T21:00:00.000Z");
    // Sexta à noite → segunda.
    assert.equal(contactDeadlineFrom(new Date("2026-10-02T23:00:00Z")).toISOString(), "2026-10-05T21:00:00.000Z");
    // Sábado → segunda; domingo → segunda.
    assert.equal(contactDeadlineFrom(new Date("2026-10-03T15:00:00Z")).toISOString(), "2026-10-05T21:00:00.000Z");
    assert.equal(contactDeadlineFrom(new Date("2026-10-04T15:00:00Z")).toISOString(), "2026-10-05T21:00:00.000Z");
    // Véspera de feriado (Aparecida, segunda 12/10/2026) → terça.
    assert.equal(contactDeadlineFrom(new Date("2026-10-09T15:00:00Z")).toISOString(), "2026-10-13T21:00:00.000Z");
    // O prazo da análise continua ao meio-dia.
    assert.equal(addBusinessDays(new Date("2026-09-28T13:00:00Z"), 1).toISOString(), "2026-09-29T15:00:00.000Z");
  });

  test("situação e textos do prazo", () => {
    const deadline = new Date("2026-10-01T21:00:00Z");
    assert.equal(contactState(null, null), null);
    assert.equal(contactState(deadline, null, new Date("2026-10-01T12:00:00Z")), "pending");
    assert.equal(contactState(deadline, null, new Date("2026-10-02T12:00:00Z")), "overdue");
    assert.equal(contactState(deadline, new Date("2026-10-01T13:00:00Z"), new Date("2026-10-05T12:00:00Z")), "done");
    assert.equal(formatDeadline(deadline), "quinta-feira, 01/10, até 18h");
    assert.equal(deadlineDistance(deadline, new Date("2026-10-01T16:00:00Z")), "faltam 5 h");
    assert.equal(deadlineDistance(deadline, new Date("2026-10-03T00:00:00Z")), "atrasado há 1 dia");
    assert.equal(deadlineDistance(deadline, new Date("2026-10-01T20:30:00Z")), "faltam 30 min");
  });
});

describe("regras do caso", () => {
  test("divergência relevante entre declarado e identificado", () => {
    assert.deepEqual(divergenceOf(3000000, 1850000), { diffCents: 1150000 });
    assert.equal(divergenceOf(100000, 99000), null);
    assert.equal(divergenceOf(100000, null), null);
  });

  test("linha do tempo do cliente: 6 etapas com o ComprovaBet", () => {
    const d = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`);
    const base = {
      createdAt: d(1),
      documentSentAt: d(1),
      hasComprovaBet: true,
      documentApprovedAt: null,
      paymentConfirmedAt: null,
    };
    const received = [
      { toStatus: "submitted", fromStatus: null, createdAt: d(1) },
      { toStatus: "documents_received", fromStatus: "submitted", createdAt: d(1) },
    ];
    const states = (input: Parameters<typeof clientTimeline>[0]) => clientTimeline(input).map((s) => s.state);
    const timeline = clientTimeline({ ...base, status: "documents_received", paymentStatus: "pending", history: received });
    assert.deepEqual(
      timeline.map((s) => s.label),
      ["Cadastro realizado", "ComprovaBet enviado", "Validação documental", "Pagamento confirmado", "Análise em andamento", "Análise concluída"],
    );
    assert.deepEqual(timeline.map((s) => s.state), ["done", "done", "current", "pending", "pending", "pending"]);

    // Complemento pedido na validação documental.
    const complement = [...received, { toStatus: "additional_documents", fromStatus: "documents_received", createdAt: d(2) }];
    const flagged = clientTimeline({ ...base, status: "additional_documents", paymentStatus: "pending", history: complement });
    assert.deepEqual(flagged.map((s) => s.state), ["done", "done", "attention", "pending", "pending", "pending"]);
    assert.equal(flagged[2]?.note, "Documentação complementar necessária");

    // Documento aprovado: aguardando pagamento → pagamento em confirmação.
    const approved = [...received, { toStatus: "awaiting_payment", fromStatus: "documents_received", createdAt: d(3) }];
    const waiting = { ...base, documentApprovedAt: d(3), status: "awaiting_payment" as const, history: approved };
    assert.deepEqual(states({ ...waiting, paymentStatus: "pending" }), ["done", "done", "done", "current", "pending", "pending"]);
    assert.equal(clientTimeline({ ...waiting, paymentStatus: "pending" })[3]?.note, "Aguardando pagamento");
    assert.equal(clientTimeline({ ...waiting, paymentStatus: "awaiting_confirmation" })[3]?.note, "Pagamento em confirmação");

    // Pagamento confirmado → análise em andamento → concluída.
    const paid = { ...waiting, paymentStatus: "confirmed" as const, paymentConfirmedAt: d(4) };
    const paidHistory = [...approved, { toStatus: "payment_confirmed", fromStatus: "awaiting_payment", createdAt: d(4) }];
    assert.deepEqual(states({ ...paid, status: "payment_confirmed", history: paidHistory }), ["done", "done", "done", "done", "pending", "pending"]);
    const reviewing = [...paidHistory, { toStatus: "under_review", fromStatus: "payment_confirmed", createdAt: d(5) }];
    assert.deepEqual(states({ ...paid, status: "under_review", history: reviewing }), ["done", "done", "done", "done", "current", "pending"]);

    // Complemento pedido durante a análise: a validação continua concluída e a análise fica em atenção.
    const duringAnalysis = [...reviewing, { toStatus: "additional_documents", fromStatus: "under_review", createdAt: d(6) }];
    assert.deepEqual(states({ ...paid, status: "additional_documents", history: duringAnalysis }), ["done", "done", "done", "done", "attention", "pending"]);

    const done = [...reviewing, { toStatus: "completed", fromStatus: "under_review", createdAt: d(7) }];
    assert.deepEqual(states({ ...paid, status: "completed", history: done }), ["done", "done", "done", "done", "done", "done"]);
  });

  test("linha do tempo do cliente: pagamento antes da solicitação", () => {
    const d = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`);
    const base = {
      createdAt: d(1),
      documentSentAt: new Date(d(1).getTime() - 10 * 60_000),
      hasComprovaBet: true,
      documentApprovedAt: null,
      paymentStatus: "confirmed" as const,
      paymentConfirmedAt: new Date(d(1).getTime() - 2 * 60_000),
    };
    const received = [
      { toStatus: "submitted", fromStatus: null, createdAt: d(1) },
      { toStatus: "documents_received", fromStatus: "submitted", createdAt: d(1) },
    ];
    const states = (input: Parameters<typeof clientTimeline>[0]) => clientTimeline(input).map((s) => s.state);
    const timeline = clientTimeline({ ...base, status: "documents_received", history: received });
    assert.deepEqual(
      timeline.map((s) => s.label),
      ["Cadastro realizado", "ComprovaBet enviado", "Pagamento confirmado", "Validação documental", "Análise em andamento", "Análise concluída"],
    );
    assert.deepEqual(timeline.map((s) => s.state), ["done", "done", "done", "current", "pending", "pending"]);

    // Complemento pedido na validação: a atenção fica na validação (não na análise).
    const complement = [...received, { toStatus: "additional_documents", fromStatus: "documents_received", createdAt: d(2) }];
    const flagged = clientTimeline({ ...base, status: "additional_documents", history: complement });
    assert.deepEqual(flagged.map((s) => s.state), ["done", "done", "done", "attention", "pending", "pending"]);
    assert.equal(flagged[3]?.note, "Documentação complementar necessária");

    // Documento aprovado: pronto para iniciar a análise.
    const approved = [...received, { toStatus: "payment_confirmed", fromStatus: "documents_received", createdAt: d(3) }];
    const ready = { ...base, documentApprovedAt: d(3) };
    assert.deepEqual(states({ ...ready, status: "payment_confirmed", history: approved }), ["done", "done", "done", "done", "pending", "pending"]);
    assert.equal(clientTimeline({ ...ready, status: "payment_confirmed", history: approved })[3]?.date?.getTime(), d(3).getTime());

    // Complemento durante a análise.
    const reviewing = [...approved, { toStatus: "under_review", fromStatus: "payment_confirmed", createdAt: d(4) }];
    assert.deepEqual(states({ ...ready, status: "under_review", history: reviewing }), ["done", "done", "done", "done", "current", "pending"]);
    const duringAnalysis = [...reviewing, { toStatus: "additional_documents", fromStatus: "under_review", createdAt: d(5) }];
    assert.deepEqual(states({ ...ready, status: "additional_documents", history: duringAnalysis }), ["done", "done", "done", "done", "attention", "pending"]);
  });

  test("linha do tempo do cliente: formulário sem documento (contato da equipe e comprovação)", () => {
    const d = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`);
    const base = {
      createdAt: d(1),
      documentSentAt: null,
      hasComprovaBet: false,
      documentApprovedAt: null,
      paymentStatus: "confirmed" as const,
      paymentConfirmedAt: d(1),
      contactDeadline: d(2),
      contactedAt: null,
    };
    const registered = [{ toStatus: "submitted", fromStatus: null, createdAt: d(1) }];
    const states = (input: Parameters<typeof clientTimeline>[0]) => clientTimeline(input).map((s) => s.state);
    const waiting = clientTimeline({ ...base, status: "submitted", history: registered });
    assert.deepEqual(
      waiting.map((s) => s.label),
      ["Solicitação registrada", "Pagamento confirmado", "Contato da equipe", "Comprovação das perdas", "Análise em andamento", "Análise concluída"],
    );
    assert.deepEqual(waiting.map((s) => s.state), ["done", "done", "current", "pending", "pending", "pending"]);
    assert.equal(waiting[2]?.note, "Em até 1 dia útil");

    // Contato feito: a comprovação passa a ser a etapa atual.
    const contacted = { ...base, contactedAt: d(2) };
    assert.deepEqual(states({ ...contacted, status: "submitted", history: registered }), ["done", "done", "done", "current", "pending", "pending"]);
    // Documentos pedidos pela equipe: atenção na comprovação.
    const requested = [...registered, { toStatus: "additional_documents", fromStatus: "submitted", createdAt: d(2) }];
    const flagged = clientTimeline({ ...contacted, status: "additional_documents", history: requested });
    assert.deepEqual(flagged.map((s) => s.state), ["done", "done", "done", "attention", "pending", "pending"]);
    assert.equal(flagged[3]?.note, "Envie os documentos pedidos pela equipe");
    // Documento aprovado → análise.
    const approved = [...requested, { toStatus: "payment_confirmed", fromStatus: "documents_received", createdAt: d(4) }];
    assert.deepEqual(
      states({ ...contacted, documentApprovedAt: d(4), status: "payment_confirmed", history: approved }),
      ["done", "done", "done", "done", "pending", "pending"],
    );
    // A equipe pode pedir documentos sem registrar o contato: o contato conta como feito.
    assert.deepEqual(states({ ...base, status: "additional_documents", history: requested }), ["done", "done", "done", "attention", "pending", "pending"]);
    const done = [...approved, { toStatus: "under_review", fromStatus: "payment_confirmed", createdAt: d(5) }, { toStatus: "completed", fromStatus: "under_review", createdAt: d(9) }];
    assert.deepEqual(states({ ...contacted, status: "completed", history: done }), ["done", "done", "done", "done", "done", "done"]);
  });

  test("pagamento antes da solicitação: tolerância de relógio, sem confundir com o fluxo anterior", () => {
    const created = new Date("2026-09-10T12:00:00Z");
    assert.equal(paidBeforeRequest(new Date("2026-09-10T11:58:00Z"), created), true);
    assert.equal(paidBeforeRequest(new Date("2026-09-10T12:03:00Z"), created), true);
    assert.equal(paidBeforeRequest(new Date("2026-09-11T09:00:00Z"), created), false);
    assert.equal(paidBeforeRequest(null, created), false);
  });

  test("casos anteriores ao ComprovaBet não exibem a etapa de pagamento", () => {
    const history = [
      { toStatus: "submitted", createdAt: new Date("2026-09-01") },
      { toStatus: "documents_received", createdAt: new Date("2026-09-01") },
    ];
    const legacy = { paymentStatus: "not_applicable" as const, history, createdAt: new Date("2026-09-01"), documentSentAt: null, hasComprovaBet: false, documentApprovedAt: null, paymentConfirmedAt: null };
    const timeline = clientTimeline({ ...legacy, status: "documents_received" });
    assert.ok(!timeline.some((s) => s.key === "payment"));
    assert.equal(timeline[1]?.label, "Documentos enviados");
    assert.deepEqual(timeline.map((s) => s.state), ["done", "done", "current", "pending", "pending"]);
    assert.deepEqual(clientTimeline({ ...legacy, status: "completed" }).map((s) => s.state), ["done", "done", "done", "done", "done"]);
  });

  test("situação do documento e do CPF para o cliente (sem “validação automática” falsa)", () => {
    assert.deepEqual(clientDocumentLabel("pending"), { label: "Aguardando análise", tone: "info" });
    assert.equal(clientDocumentLabel("valid").label, "Documento aprovado");
    assert.equal(clientDocumentLabel("cpf_mismatch").label, "CPF divergente");
    assert.equal(clientDocumentLabel("illegible").label, "Documentação complementar necessária");
    assert.equal(clientCpfLabel("pending", "match")?.label, "CPF compatível");
    assert.equal(clientCpfLabel("pending", "manual_match")?.label, "CPF compatível");
    // Sem leitura automática (imagem, PDF digitalizado, CPF mascarado): conferência da equipe.
    assert.equal(clientCpfLabel("pending", "pending")?.label, "Aguardando conferência documental");
    assert.equal(clientCpfLabel("cpf_mismatch", "mismatch"), null);
  });

  test("protocolo", () => {
    assert.equal(normalizeProtocol("anl847291"), "ANL-847291");
    assert.equal(normalizeProtocol("847291"), "ANL-847291");
    assert.equal(normalizeProtocol("ANL-12345"), null);
    assert.match(generateProtocol(false), /^ANL-\d{6}$/);
  });

  test("plataformas digitadas em “Outra” são reconhecidas", () => {
    const r = resolvePlatforms({ platforms: ["kto"], otherPlatformEnabled: true, customPlatforms: ["betano", "Minha  Bet"] });
    assert.deepEqual(r.platforms.map((p) => [p.slug, p.isCustom]), [["kto", false], ["betano", false], ["minha-bet", true]]);
    assert.equal(r.aliases.get("minha bet"), "minha-bet");
  });

  test("senhas da equipe", async () => {
    const hash = await hashPassword("uma-senha-bem-longa");
    assert.ok(await verifyPassword("uma-senha-bem-longa", hash));
    assert.ok(!(await verifyPassword("outra-senha-qualquer", hash)));
    assert.ok(!(await verifyPassword("qualquer", "formato-invalido")));
  });
});
