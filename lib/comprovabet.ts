// Textos do ComprovaBet (enviado no acompanhamento, quando a equipe pede) e das condições do serviço.
// Compartilhado entre navegador e servidor (sem dependências). Linguagem: análise, documentação e
// acompanhamento. Nada aqui promete recuperação, restituição, indenização ou resultado.

export const COMPROVABET_NAME = "ComprovaBet";

/** Formatos aceitos para o ComprovaBet: PDF de preferência, ou foto/print legível. */
export const COMPROVABET_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"];
export const COMPROVABET_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const COMPROVABET_MAX_FILES = 5;

export const COMPROVABET_OWNER_NOTICE = "O ComprovaBet deve estar em nome do próprio solicitante e corresponder ao CPF cadastrado.";

export const CPF_MISMATCH_MESSAGE =
  "O CPF identificado no documento não corresponde ao CPF informado no cadastro. Confira os dados e envie o documento correto.";

/** Mostrado quando a conferência do CPF depende da equipe (imagem, PDF digitalizado ou CPF não encontrado). */
export const MANUAL_CHECK_HINT = "A conferência do CPF deste arquivo será feita pela nossa equipe.";

// ─── Mensagens ao cliente no acompanhamento ───────────────────────────────
export const DOCUMENT_APPROVED_TITLE = "Documento analisado";
export const DOCUMENT_APPROVED_TEXT =
  "Seu ComprovaBet foi recebido e considerado consistente para continuidade da análise. Neste momento, não será necessário enviar outros documentos.";

export const COMPLEMENT_TITLE = "Precisamos complementar sua documentação";
export const COMPLEMENT_TEXT =
  "Identificamos que o documento enviado precisa de complementação ou correção para que a análise possa continuar. Consulte as orientações abaixo ou aguarde o contato da nossa equipe.";

export const VALIDATION_PENDING_TEXT = "Seu ComprovaBet foi recebido e está aguardando a conferência da nossa equipe.";

export const ANALYSIS_IN_PROGRESS_TEXT =
  "Seu caso está em análise documental. Você poderá acompanhar todas as etapas por este painel. Caso seja necessário algum documento adicional, nossa equipe entrará em contato.";

// ─── Pagamento da análise ─────────────────────────────────────────────────
export const PAYMENT_NOTICE =
  "A taxa refere-se ao serviço de análise e acompanhamento da sua solicitação pela nossa equipe e não depende do resultado.";

export const SERVICE_TERMS_CHECKBOX =
  "Li e estou de acordo com as condições do serviço. Confirmo que as informações são verdadeiras, que o CPF informado é meu e que nunca solicitei o estorno dessas perdas antes.";

/** Versão das condições aceitas antes do pagamento. Mude ao alterar o texto acima ou os Termos de Uso. */
export const SERVICE_TERMS_VERSION = "2026-09-v6";

/** Prazo de retorno da equipe depois do pagamento (em dias úteis). */
export function contactWithinText(reviewDays: number): string {
  return `Em até ${reviewDays} dias úteis, nossa equipe entra em contato pelo WhatsApp ou e-mail informados para apresentar o resultado da análise e, se o caso puder prosseguir, combinar as condições e as formas de pagamento das próximas etapas.`;
}

export const TRUST_LINE = "Processo estruturado com transparência, documentação e acompanhamento em todas as etapas.";
