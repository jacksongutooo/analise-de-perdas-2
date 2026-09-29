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
        {site.cnpj ? `, inscrita no CNPJ ${site.cnpj},` : ""} trata os dados pessoais de quem solicita a análise e o acompanhamento do pedido de estorno de
        perdas em apostas online, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD).
      </p>

      <LegalSection title="1. Dados que tratamos">
        <LegalList
          items={[
            "Identificação e contato: nome completo, CPF, e-mail e WhatsApp.",
            "Confirmação de maioridade (18 anos ou mais).",
            "Respostas do formulário: se você já pediu o estorno, as casas de apostas utilizadas, o período e a faixa de perda informada. Em solicitações anteriores, o formulário também perguntava o tipo de aposta, os valores aproximados e se as apostas saíram do controle; essa informação pode dizer respeito à saúde, é usada apenas para a análise do caso, com o seu consentimento, e fica restrita à equipe.",
            "Preferências de contato informadas depois do pagamento: como prefere comprovar as perdas, o canal (WhatsApp, ligação ou e-mail) e o melhor horário.",
            "Documentos enviados por você quando a equipe pedir, como o extrato bancário ou o ComprovaBet anual, que podem conter dados de movimentações financeiras.",
            "Registro do compromisso voluntário, em solicitações anteriores que o incluíam: aceite, data e hora, endereço IP e identificação do navegador.",
            "Registro do aceite das condições do serviço antes do pagamento: data e hora, versão do texto, endereço IP e identificação do navegador.",
            "Dados do pagamento da taxa (PIX): situação, valor, datas, identificador da transação e referência interna do pedido. O pagamento é feito no aplicativo do seu banco: o site não recebe dados bancários.",
            "Dados técnicos de acesso: endereço IP, data e hora e identificação do navegador, inclusive nos acessos ao acompanhamento.",
          ]}
        />
        <p>Não pedimos endereço, senhas de plataformas, senhas bancárias, códigos SMS ou códigos de autenticação.</p>
      </LegalSection>

      <LegalSection title="2. Para que usamos os dados">
        <LegalList
          items={[
            "Mostrar o resultado ao fim do formulário, com base nas suas respostas.",
            "Entrar em contato com você depois do pagamento, pelo canal e no horário preferidos, para combinar os documentos necessários.",
            "Analisar a documentação enviada e classificar o seu caso.",
            "Conferir se os documentos pertencem a você, comparando o CPF do documento com o CPF informado.",
            "Registrar o aceite das condições e confirmar o pagamento da taxa com o provedor de pagamento.",
            "Conferir os valores informados com os documentos.",
            "Informar o andamento e o resultado da análise pelo painel de acompanhamento, e-mail ou WhatsApp.",
            "Solicitar documentos adicionais, quando necessários.",
            "Garantir a segurança do serviço, prevenir fraudes e cumprir obrigações legais.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Bases legais">
        <p>
          Tratamos os dados com base no seu consentimento (art. 7º, I, da LGPD), registrado no formulário, antes do resultado; na execução de
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
          O pagamento da taxa (PIX) é processado pela BlackCat, que recebe o seu nome, o seu CPF, o seu e-mail, o seu WhatsApp e o valor
          para gerar a cobrança e identificar o pagamento, e trata esses dados conforme a política de privacidade própria. Os documentos e as
          respostas do formulário não são enviados ao processador de pagamento.
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
            `Respostas e CPF de solicitações não concluídas são apagados automaticamente em até ${config.draftTtlDays} dias (ou em até 30 dias, quando o pagamento chegou a ser iniciado).`,
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
            "revisão, por uma pessoa da equipe, de decisões tomadas apenas com base em tratamento automatizado, como a leitura automática dos documentos (art. 20 da LGPD).",
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
          Usamos apenas cookies essenciais para manter sua sessão de acompanhamento e a sessão da equipe. As respostas do formulário (sem o CPF completo) ficam
          salvas no seu próprio navegador até o envio, para que você possa continuar de onde parou. Não usamos cookies de publicidade.
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
