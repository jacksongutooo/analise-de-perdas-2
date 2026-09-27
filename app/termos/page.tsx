// MODELO: revise este texto com assessoria jurídica antes de publicar.
import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, LegalSection } from "@/components/legal";
import { PAYMENT_NOTICE, SERVICE_TERMS_VERSION } from "@/lib/comprovabet";
import { config } from "@/lib/env";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermosPage() {
  const company = site.legalName || site.name;
  const year = config.comprovabetYear;
  return (
    <LegalPage title="Termos de Uso" updatedAt={`setembro de 2026 · versão ${SERVICE_TERMS_VERSION}`}>
      <p>
        Estes termos regulam o uso do site de {company}
        {site.cnpj ? ` (CNPJ ${site.cnpj})` : ""} para solicitar a análise documental de perdas em apostas online. Ao enviar uma solicitação, você
        declara que leu e concorda com estes termos e com a{" "}
        <Link href="/privacidade" className="font-medium text-navy-700 underline">
          Política de Privacidade
        </Link>
        .
      </p>

      <LegalSection title="1. O que é o serviço">
        <p>
          Realizamos uma análise documental individual das informações e dos documentos enviados por você, para avaliar se existem elementos que
          permitam prosseguir com o seu caso. A análise não é garantia de resultado.
        </p>
        <LegalList
          items={[
            "Cada caso é analisado individualmente.",
            "O envio das informações não garante recuperação, restituição, indenização ou recebimento de valores.",
            "Os valores exibidos no acompanhamento (declarado, identificado e validado) são referências da análise documental e não representam valores a serem recuperados.",
            "O serviço é oferecido de forma independente e não é um serviço oficial ou governamental.",
          ]}
        />
      </LegalSection>

      <LegalSection title="2. Quem pode usar">
        <p>
          O serviço é exclusivo para maiores de 18 anos, que enviem informações sobre as próprias contas em plataformas de apostas. Você se
          compromete a fornecer informações verdadeiras e documentos autênticos, e a não enviar dados de terceiros além do estritamente necessário.
        </p>
      </LegalSection>

      <LegalSection title="3. Documentação">
        <LegalList
          items={[
            `O documento principal da análise é o ComprovaBet anual referente a ${year}.`,
            "O ComprovaBet deve estar em nome do próprio solicitante e corresponder ao CPF informado no cadastro. Quando possível, o CPF do documento é conferido automaticamente; nos demais casos, a conferência é feita pela equipe.",
            "Logo depois do envio, o ComprovaBet passa por uma pré-análise automática: a leitura do PDF confere o CPF, o ano de referência e o tipo do documento, e compara as plataformas e os valores com as informações do formulário. Quando essas conferências são confirmadas, o documento é aprovado na pré-análise; quando a leitura automática não é possível (por exemplo, foto ou PDF digitalizado), a conferência é feita pela equipe. Documento de outro ano ou de outro CPF precisa ser substituído antes do pagamento.",
            "A pré-análise automática confere o documento, não o resultado do caso. Se o ComprovaBet estiver completo e consistente, não serão pedidos outros documentos naquele momento. Havendo informação faltante ou inconsistência, a equipe poderá solicitar documentos complementares.",
            "O CPF não pode ser alterado depois que a análise documental estiver em andamento.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Pagamento da análise">
        <p>{PAYMENT_NOTICE}</p>
        <LegalList
          items={[
            "O pagamento é feito ao final do formulário, depois da revisão das informações e antes do envio da solicitação. A solicitação só é registrada com a confirmação do pagamento.",
            "O pagamento é feito por Pix ou cartão de crédito, na página do provedor de pagamento (Mercado Pago). O site não recebe nem armazena os dados do cartão.",
            "Antes do pagamento, você declara que as informações e os documentos enviados são verdadeiros e pertencem ao solicitante cadastrado. O aceite é registrado com data, hora e a versão destas condições.",
            "O valor corresponde ao serviço de análise documental e não depende do resultado da análise.",
            "Por se tratar de contratação pela internet, você pode desistir em até 7 (sete) dias da contratação, nos termos do art. 49 do Código de Defesa do Consumidor, pelos canais de atendimento informados no site.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Prazo">
        <p>
          Em até {config.reviewDays} dias úteis a partir do envio da solicitação (feito com o pagamento confirmado), a equipe entra em contato pelo
          WhatsApp ou e-mail informados para apresentar o resultado da análise e, se o caso puder prosseguir, combinar as condições e as formas de
          pagamento das próximas etapas. Não contam como dias úteis sábados, domingos, feriados nacionais, Carnaval e Corpus Christi. Se forem
          necessários documentos complementares, a análise continua após o recebimento deles e o prazo pode ser ajustado.
        </p>
      </LegalSection>

      <LegalSection title="6. Compromisso voluntário">
        <p>
          O compromisso de não realizar novas apostas durante a análise é uma decisão pessoal e voluntária. Ele não representa bloqueio técnico das
          suas contas e o seu cumprimento não garante aprovação ou recuperação de valores. Para um bloqueio efetivo, existe a autoexclusão oficial do
          Governo Federal, disponível em gov.br/autoexclusaoapostas, que não tem relação com este serviço.
        </p>
      </LegalSection>

      <LegalSection title="7. Segurança e comunicação">
        <p>
          Nunca solicitaremos sua senha da plataforma, senha bancária, código SMS ou código de autenticação. Se alguém pedir esses dados em nosso
          nome, não informe e comunique-nos. O acompanhamento do caso é feito com o protocolo e o e-mail informados na solicitação; mantenha esses
          dados em sigilo.
        </p>
      </LegalSection>

      <LegalSection title="8. Responsabilidades">
        <LegalList
          items={[
            "Você é responsável pela veracidade das informações e pela autenticidade dos documentos enviados.",
            "Podemos recusar ou encerrar solicitações com indícios de fraude, dados falsos, documentos de terceiros ou uso indevido do serviço.",
            "O site pode passar por manutenções e indisponibilidades temporárias.",
          ]}
        />
      </LegalSection>

      <LegalSection title="9. Alterações e legislação">
        <p>
          Estes termos podem ser atualizados, e a versão vigente estará sempre nesta página. Aplica-se a legislação brasileira, inclusive o Código de
          Defesa do Consumidor, sendo competente o foro do domicílio do consumidor.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
