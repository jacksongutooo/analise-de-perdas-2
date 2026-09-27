// MODELO: revise este texto com assessoria jurídica antes de publicar.
import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/components/legal";
import { config } from "@/lib/env";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacidadePage() {
  const controller = site.legalName || site.name;
  const contact = site.dpoEmail || site.contactEmail;
  return (
    <LegalPage title="Política de Privacidade" updatedAt="setembro de 2026">
      <p>
        Esta política explica como {controller}
        {site.cnpj ? `, inscrita no CNPJ ${site.cnpj},` : ""} trata os dados pessoais de quem solicita a análise documental de perdas em apostas
        online, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD).
      </p>

      <LegalSection title="1. Dados que tratamos">
        <LegalList
          items={[
            "Identificação e contato: nome completo, CPF, e-mail e WhatsApp.",
            "Confirmação de maioridade (18 anos ou mais).",
            "Respostas do formulário: tipo de aposta, plataformas utilizadas, período, valores aproximados informados e situação do caso, inclusive se as apostas saíram do seu controle. Essa informação pode dizer respeito à sua saúde: é usada apenas para a análise do caso, com o seu consentimento, e fica restrita à equipe.",
            "Documentos enviados por você, principalmente o ComprovaBet anual e, quando solicitados, documentos complementares (como históricos de depósitos, saques e apostas), que podem conter dados de movimentações financeiras.",
            "Registro do compromisso voluntário: aceite, data e hora, endereço IP e identificação do navegador.",
            "Registro do aceite das condições do serviço antes do pagamento da análise: data e hora, versão do texto, endereço IP e identificação do navegador.",
            "Dados do pagamento da análise informados pelo provedor de pagamento: situação, forma de pagamento (Pix ou cartão), valor, data e identificador da transação. Os dados do cartão são digitados na página do provedor e não passam pelo site.",
            "Dados técnicos de acesso: endereço IP, data e hora e identificação do navegador, inclusive nos acessos ao acompanhamento.",
          ]}
        />
        <p>Não pedimos endereço, senhas de plataformas, senhas bancárias, códigos SMS ou códigos de autenticação.</p>
      </LegalSection>

      <LegalSection title="2. Para que usamos os dados">
        <LegalList
          items={[
            "Analisar a documentação enviada e classificar o seu caso.",
            "Conferir se o ComprovaBet pertence a você, comparando o CPF do documento com o CPF informado.",
            "Fazer a pré-análise automática do ComprovaBet: leitura do texto do PDF para conferir o CPF, o ano de referência e o tipo do documento, e comparar as plataformas e os valores com as suas respostas.",
            "Registrar o aceite das condições e confirmar o pagamento da análise com o provedor de pagamento.",
            "Conferir os valores informados com os documentos.",
            "Informar o andamento e o resultado da análise pelo painel de acompanhamento, e-mail ou WhatsApp.",
            "Solicitar documentos adicionais, quando necessários.",
            "Garantir a segurança do serviço, prevenir fraudes e cumprir obrigações legais.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Bases legais">
        <p>
          Tratamos os dados com base no seu consentimento (art. 7º, I, da LGPD), registrado antes do envio dos documentos; na execução de
          procedimentos preliminares relacionados ao serviço solicitado por você (art. 7º, V); no cumprimento de obrigação legal ou regulatória (art.
          7º, II), como a guarda de registros de acesso prevista no Marco Civil da Internet; e no legítimo interesse para segurança e prevenção de
          fraudes (art. 7º, IX).
        </p>
      </LegalSection>

      <LegalSection title="4. Compartilhamento">
        <p>
          Não vendemos dados pessoais. Os dados podem ser tratados por fornecedores que prestam serviços essenciais ao funcionamento do site, como
          hospedagem, banco de dados e armazenamento de arquivos, sob obrigações de confidencialidade e segurança. Também poderemos compartilhar dados
          quando exigido por lei ou por ordem de autoridade competente.
        </p>
        <p>
          O pagamento da análise é processado pelo Mercado Pago, que recebe o seu nome, o seu e-mail e o valor para identificar o pagamento e
          trata os dados de pagamento conforme a política de privacidade própria. Os documentos e as respostas do formulário não são enviados ao
          provedor de pagamento.
        </p>
      </LegalSection>

      <LegalSection title="5. Armazenamento e segurança">
        <LegalList
          items={[
            "Os documentos ficam em armazenamento privado, sem endereço público, e só podem ser abertos pela equipe autorizada por meio de links temporários.",
            "Todo acesso aos documentos e aos casos é registrado.",
            "O CPF aparece de forma mascarada (ex.: ***.***.***-00). O número completo só é visto pela equipe autorizada, e cada visualização é registrada. O CPF não é gravado nos registros de acesso.",
            "Quando a leitura automática encontra no documento um CPF diferente do informado, o arquivo é recusado e não é armazenado.",
            "A comunicação com o site é criptografada (HTTPS).",
            "Os arquivos são verificados no envio: aceitamos apenas PDF, CSV, XLSX, JPG e PNG, e bloqueamos arquivos executáveis.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Por quanto tempo guardamos">
        <LegalList
          items={[
            `Arquivos enviados em solicitações não concluídas são apagados automaticamente em até ${config.draftTtlDays} dias (ou em até 30 dias, quando o pagamento chegou a ser iniciado).`,
            "Os dados das solicitações enviadas são mantidos durante a análise e pelo período necessário para as finalidades descritas, para o exercício regular de direitos e para o cumprimento de obrigações legais.",
            "Registros de acesso são mantidos por no mínimo 6 meses, conforme o Marco Civil da Internet (Lei nº 12.965/2014).",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Seus direitos">
        <p>Nos termos do art. 18 da LGPD, você pode solicitar a qualquer momento:</p>
        <LegalList
          items={[
            "confirmação da existência de tratamento e acesso aos dados;",
            "correção de dados incompletos, inexatos ou desatualizados;",
            "anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a lei;",
            "portabilidade dos dados;",
            "eliminação dos dados tratados com base no consentimento, ressalvadas as hipóteses legais de conservação;",
            "informação sobre com quem compartilhamos os dados;",
            "revogação do consentimento;",
            "revisão, por uma pessoa da equipe, de decisões tomadas apenas com base em tratamento automatizado, como a pré-análise do documento (art. 20 da LGPD).",
          ]}
        />
        <p>
          {contact ? (
            <>
              Para exercer seus direitos, escreva para <a href={`mailto:${contact}`} className="font-medium text-navy-700 underline">{contact}</a>{" "}
              informando o protocolo da sua solicitação.
            </>
          ) : (
            "Para exercer seus direitos, entre em contato pelos canais informados no atendimento, indicando o protocolo da sua solicitação."
          )}{" "}
          Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </LegalSection>

      <LegalSection title="8. Cookies">
        <p>
          Usamos apenas cookies essenciais para manter sua sessão de acompanhamento e a sessão da equipe. As respostas do formulário ficam salvas no
          seu próprio navegador até o envio, para que você possa continuar de onde parou. Não usamos cookies de publicidade.
        </p>
      </LegalSection>

      <LegalSection title="9. Menores de idade">
        <p>O serviço é exclusivo para maiores de 18 anos. Não tratamos intencionalmente dados de menores.</p>
      </LegalSection>

      <LegalSection title="10. Alterações">
        <p>Esta política pode ser atualizada. A versão vigente estará sempre disponível nesta página, com a data da última atualização.</p>
      </LegalSection>
    </LegalPage>
  );
}
