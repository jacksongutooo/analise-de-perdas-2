// MODELO: revise este texto com assessoria jurídica antes de publicar.
import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, LegalSection } from "@/components/legal";
import { PAYMENT_NOTICE, SERVICE_TERMS_VERSION } from "@/lib/comprovabet";
import { MANUAL_SUPPORT_TEXT } from "@/lib/intake";
import { config } from "@/lib/env";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermosPage() {
  const company = site.legalName || site.name;
  return (
    <LegalPage title="Termos de Uso" updatedAt={`setembro de 2026 · versão ${SERVICE_TERMS_VERSION}`}>
      <p>
        Estes termos regulam o uso do site de {company}
        {site.cnpj ? ` (CNPJ ${site.cnpj})` : ""} para solicitar a análise e o acompanhamento do pedido de estorno de perdas em apostas online. Ao enviar uma solicitação, você
        declara que leu e concorda com estes termos e com a{" "}
        <Link href="/privacidade" className="font-medium text-navy-700 underline">
          Política de Privacidade
        </Link>
        .
      </p>

      <LegalSection title="1. O que é o serviço">
        <p>
          Analisamos e acompanhamos individualmente a sua solicitação, a partir das informações que você informa no formulário e dos documentos
          que a equipe pedir depois, para avaliar se existem elementos que permitam prosseguir com o seu caso. A análise não é garantia de
          resultado.
        </p>
        <LegalList
          items={[
            "Cada caso é analisado individualmente.",
            "O resultado exibido ao fim do formulário depende apenas das respostas informadas por você: não é uma consulta a bases de dados do governo ou das casas de apostas.",
            "O envio das informações não garante recuperação, restituição, indenização ou recebimento de valores.",
            "A faixa de perda e os valores exibidos no acompanhamento (informado, identificado e validado) são referências da análise e não representam valores a serem recuperados.",
            "O serviço é oferecido de forma independente e não é um serviço oficial ou governamental. As menções a medidas do Governo Federal para o setor de apostas são informativas: o serviço não tem vínculo com o governo e não depende de iniciativas futuras.",
          ]}
        />
      </LegalSection>

      <LegalSection title="2. Quem pode usar">
        <p>
          O serviço é exclusivo para maiores de 18 anos, que informem dados sobre as próprias contas em casas de apostas. A solicitação é feita uma
          única vez por CPF: o serviço é para quem nunca pediu o estorno dessas perdas. Você se compromete a fornecer informações verdadeiras e
          documentos autênticos, e a não enviar dados de terceiros além do estritamente necessário.
        </p>
      </LegalSection>

      <LegalSection title="3. Documentação">
        <LegalList
          items={[
            "Para começar, não é preciso enviar documentos: você informa se já pediu o estorno, as casas de apostas, o período e a faixa de perda.",
            "Depois do pagamento, a equipe entra em contato para verificar quais documentos são necessários para prosseguir, como o extrato bancário com os PIX para as casas de apostas ou o ComprovaBet. Os documentos são enviados pelo acompanhamento, com o protocolo e o e-mail da solicitação.",
            "Os documentos devem estar em nome do próprio solicitante e corresponder ao CPF informado. Quando possível, o CPF do documento é conferido automaticamente; nos demais casos, a conferência é feita pela equipe.",
            MANUAL_SUPPORT_TEXT,
            "O CPF não pode ser alterado depois que a análise documental estiver em andamento.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Pagamento da taxa">
        <p>{PAYMENT_NOTICE}</p>
        <LegalList
          items={[
            "O pagamento é feito ao final do formulário, depois do resultado e antes do registro da solicitação. A solicitação só é registrada com a confirmação do pagamento.",
            "O pagamento é feito por PIX: o QR Code e o código copia e cola aparecem na própria tela de pagamento, e o pagamento é feito no aplicativo do seu banco. A cobrança é processada pela BlackCat, e a confirmação do pagamento é automática. O site não recebe dados bancários.",
            "Antes do pagamento, você declara que as informações são verdadeiras, que o CPF informado é seu e que nunca solicitou o estorno dessas perdas antes. O aceite é registrado com data, hora e a versão destas condições.",
            "O valor corresponde ao serviço de análise e acompanhamento e não depende do resultado da análise.",
            "Por se tratar de contratação pela internet, você pode desistir em até 7 (sete) dias da contratação, nos termos do art. 49 do Código de Defesa do Consumidor, pelos canais de atendimento informados no site.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Prazos">
        <LegalList
          items={[
            "Primeiro contato: em até 1 dia útil depois da confirmação do pagamento, pelo canal (WhatsApp, ligação ou e-mail) e no horário que você preferir, para verificar os documentos necessários.",
            `Resultado da análise: em até ${config.reviewDays} dias úteis a partir do registro da solicitação, a equipe entra em contato pelo WhatsApp ou e-mail informados para apresentar o resultado e, se o caso puder prosseguir, combinar as condições e as formas de pagamento das próximas etapas. A análise depende do recebimento dos documentos pedidos, e o prazo pode ser ajustado quando eles chegam depois.`,
            "Não contam como dias úteis sábados, domingos, feriados nacionais, Carnaval e Corpus Christi.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Autoexclusão">
        <p>
          Este serviço não bloqueia contas nem impede novas apostas. Para um bloqueio efetivo, existe a autoexclusão oficial do Governo Federal,
          disponível em gov.br/autoexclusaoapostas, que não tem relação com este serviço. Solicitações anteriores podem ter incluído um compromisso
          voluntário de não apostar durante a análise: esse compromisso é pessoal, não representa bloqueio técnico das contas e o seu cumprimento
          não garante aprovação ou recuperação de valores.
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
