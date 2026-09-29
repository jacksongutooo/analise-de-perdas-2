# Análise de Perdas — análise documental de perdas em apostas online

Site responsivo (mobile first) para receber, organizar e analisar solicitações de pessoas que tiveram
perdas em apostas esportivas ou cassino online. O documento principal da análise é o **ComprovaBet anual
de 2025**, em nome do próprio solicitante: o cliente responde um formulário curto, informa o CPF, envia o
ComprovaBet (que passa por uma pré-análise automática na hora), paga a análise por PIX (cobrança gerada pela
BlackCat, com QR Code e copia e cola na própria tela), solicita a análise e acompanha o caso por protocolo. Em até 15 dias úteis a equipe entra em contato com o
resultado. A equipe
trabalha em um painel administrativo com conferência do CPF, ações rápidas com confirmação, leitura
automática dos documentos, conferência de valores e solicitação de documentos complementares.

> O site **não promete recuperação, restituição ou indenização**, não se apresenta como serviço oficial
> ou governamental e não usa números, depoimentos ou contadores fictícios.

## Stack

- **Next.js 15** (App Router, Server Actions, Route Handlers) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (tokens em `src/app/globals.css`), fonte IBM Plex Sans
- **PostgreSQL** + **Prisma 6** (migrations versionadas em `prisma/migrations`)
- Armazenamento privado de arquivos: pasta local (desenvolvimento) ou **S3 compatível** (AWS S3, Cloudflare R2, Backblaze B2, MinIO)
- Leitura de documentos: `papaparse` (CSV), `xlsx` (XLSX), `unpdf` (PDF com texto)
- Pagamento por PIX pela API da BlackCat; QR Code desenhado com `uqr` quando a API não devolve a imagem pronta
- Sem dependência de serviços de autenticação: senhas com scrypt (nativo do Node) e sessões no banco

## Prévia sem servidor

`previa/index.html` é uma prévia navegável do site com dados fictícios: abre no navegador sem instalar nada
(precisa de internet só para carregar estilos, fonte e, ao visualizar PDFs, o pdf.js). Ela roda **o próprio código
desta versão** — páginas, ações e rotas `/api` — sobre um banco simulado no navegador, com os mesmos casos fictícios
do seed, e serve para apresentar o fluxo a clientes. Não substitui o sistema: nada é enviado nem guardado fora do
navegador. Painel na prévia: `demo@example.com` / `demonstracao-2026`.

Para gerar de novo depois de alterar o site: `npm run previa` (script `scripts/build-previa.mjs`, código de apoio em
`previa/src/`). A prévia inclui atalhos que não existem no site real: casos fictícios para abrir direto, CPF de
exemplo e arquivos de exemplo do ComprovaBet (com o CPF informado, com outro CPF e uma foto). O pagamento da
análise usa o PIX simulado do modo demonstração (QR Code e copia e cola fictícios, com botões para simular a
confirmação ou o vencimento), sem cobrar nada.

## Rodando localmente

Pré-requisitos: Node.js 20.9+ e Docker (ou um PostgreSQL próprio).

### Instalação automática

```bash
npm run setup        # Linux e macOS
npm run setup:win    # Windows (PowerShell)
```

O script instala as dependências, cria o `.env` com segredos aleatórios, sobe o PostgreSQL no Docker
(quando o `DATABASE_URL` aponta para `localhost`), aplica as migrations e oferece criar o primeiro acesso
da equipe. Depois é só rodar `npm run dev`.

### Instalação manual

```bash
npm install
docker compose up -d            # sobe o PostgreSQL local
cp .env.example .env            # ajuste AUTH_SECRET (openssl rand -base64 48)
npx prisma migrate deploy       # cria as tabelas
npm run admin:create -- --email voce@empresa.com.br --name "Seu Nome"
npm run dev                     # http://localhost:3000
```

Painel da equipe: `http://localhost:3000/admin`.

### Modo demonstração (dados fictícios)

```bash
# no .env: DEMO_MODE="true"
npm run db:seed
npm run dev
```

O seed cria 11 casos fictícios (protocolos `DEMO-100001` a `DEMO-100011`), um para cada etapa do fluxo.
Os ComprovaBets são PDFs gerados na hora, marcados como **DOCUMENTO FICTÍCIO**, com CPFs fictícios
(`000.000.0XX-XX`), e passam pela mesma leitura de CPF e pela mesma pré-análise dos envios reais. Todos (menos o
caso anterior ao ComprovaBet) já chegam com a análise paga, como no fluxo atual, com transações do pagamento de
demonstração:

| Protocolo | Situação |
|---|---|
| `DEMO-100001` | Aprovado na pré-análise automática — aguardando início da análise |
| `DEMO-100002` | Aprovado na pré-análise — aguardando início da análise (o primeiro PIX expirou; o segundo foi pago) |
| `DEMO-100007` | Conferência pela equipe — CPF mascarado no documento (pré-análise sem aprovação automática) |
| `DEMO-100010` | CPF mascarado, aprovado manualmente pela equipe — aguardando início da análise |
| `DEMO-100008` | CPF divergente marcado pela equipe — documento em nome de outra pessoa |
| `DEMO-100003` | Complemento solicitado — PDF digitalizado, sem texto e ilegível |
| `DEMO-100009` | Análise em andamento |
| `DEMO-100004` | Análise em andamento, com complemento enviado durante a análise |
| `DEMO-100005` / `DEMO-100006` | Análise concluída (elementos insuficientes / concluída com valor validado) |
| `DEMO-100011` | Caso anterior ao ComprovaBet (sem CPF e sem etapa de pagamento) |

No modo demonstração, o pagamento usa um **PIX simulado**: o QR Code e o copia e cola são fictícios (nenhum valor é
cobrado) e a própria tela traz os botões “Simular pagamento confirmado” e “Simular PIX expirado”
(`/api/payments/demo/simulate`, rota que não existe fora do modo demonstração).

Acesso ao painel: `demo@example.com` / `demonstracao-2026` (ou `DEMO_ADMIN_PASSWORD`). Acompanhamento do
cliente: protocolo + e-mail da tabela exibida pelo seed.

Com `DEMO_MODE=true` o site exibe a faixa **DEMO MODE** e passa a enxergar **somente** dados de
demonstração; com `DEMO_MODE=false`, somente dados reais. Os dois conjuntos nunca aparecem juntos, e os
acessos de demonstração não entram no painel real. O seed se recusa a rodar em produção.

## Deploy na Vercel

1. Crie um PostgreSQL gerenciado (Neon, Supabase, RDS...). Use a URL com pooling em `DATABASE_URL` e a
   conexão direta em `DIRECT_URL`.
2. Crie um bucket **privado** (sem acesso público) no S3/R2/B2 e uma chave com permissão de leitura,
   escrita e exclusão apenas nesse bucket. Configure `STORAGE_DRIVER=s3` e as variáveis `S3_*`.
   Na Vercel o armazenamento local não funciona (o sistema recusa essa configuração).
3. Cadastre as variáveis de `.env.example` no projeto da Vercel, incluindo `AUTH_SECRET` e `CRON_SECRET`
   fortes, `NEXT_PUBLIC_SITE_URL` com o domínio final (https) e os dados da empresa.
4. Configure o pagamento: `ANALYSIS_PRICE`, `BLACKCAT_API_KEY` e `BLACKCAT_BASE_URL` (veja “Pagamento da análise”
   abaixo). Sem eles, o formulário avisa que o pagamento está indisponível e o painel mostra um alerta.
5. O comando de build `vercel-build` já executa `prisma migrate deploy`.
6. Crie o primeiro acesso rodando `npm run admin:create` localmente apontando para o banco de produção.
7. `vercel.json` agenda a limpeza diária (`/api/cron/cleanup`), que apaga rascunhos abandonados e seus
   arquivos, sessões vencidas e registros de acesso antigos.

**Limite de upload:** na Vercel cada requisição tem limite de 4,5 MB, por isso `MAX_UPLOAD_MB=4`.
Fotos maiores são reduzidas no próprio navegador antes do envio. Em servidor próprio o limite pode subir.

## Fluxo do cliente

Formulário (com o CPF) → compromisso → revisão das respostas → envio do ComprovaBet → **pré-análise automática**
(barra de progresso com as conferências) → **pagamento da análise** → Solicitar análise → análise pela equipe →
contato em até 15 dias úteis → acompanhamento pelo painel.

- `/` — página inicial curta, com o que ter em mãos (CPF, ComprovaBet, e-mail e WhatsApp) e, em letras pequenas, os
  requisitos: ComprovaBet do ano em mãos, nunca ter pedido o estorno dessas perdas antes e uma solicitação por CPF.
- `/analise` — formulário em etapas curtas, com barra de progresso, “Voltar”, salvamento automático no navegador
  (“✓ Informações salvas”) e retomada de onde parou. A etapa 6 traz os dados do solicitante com o **CPF**
  (máscara `000.000.000-00` e dígitos verificadores); depois vêm o compromisso voluntário e a revisão
  “Confira sua solicitação”. A etapa 7 é o envio do **ComprovaBet**, seguido da **Pré-análise** (barra de progresso
  com as conferências, uma a uma) e do **Pagamento da análise**: valor, aviso “Importante”, aceite obrigatório e o
  botão **Gerar PIX** (QR Code e copia e cola na própria tela, atualizada sozinha com a confirmação). O botão
  **Solicitar análise** só aparece com o pagamento confirmado.
- `/analise/recebida` — protocolo `ANL-XXXXXX` e próximos passos.
- `/acompanhar` — acesso com protocolo + e-mail: etapa atual, linha do tempo em 6 etapas (Cadastro realizado ·
  ComprovaBet enviado · Pagamento confirmado · Validação documental · Análise em andamento · Análise concluída),
  situação do documento, valores e prazo.
- `/acompanhar/documentos` — envio de documentação complementar quando a equipe solicitar (inclusive um novo ComprovaBet).
- `/acompanhar/pagamento` — só para casos antigos que ficaram em “Aguardando pagamento” (pagamento depois da
  validação, com link externo e confirmação manual pela equipe). Casos novos já chegam pagos.

## ComprovaBet e CPF

- O CPF é validado no navegador e no servidor. Ele é registrado no rascunho **antes** do envio do documento
  e não fica salvo no navegador (só a versão mascarada, `***.***.***-25`). Depois do envio do ComprovaBet,
  o cliente não pode mais trocar o CPF; no painel, só o perfil `admin` corrige, com motivo, e apenas antes
  de a análise documental avançar.
- Arquivos aceitos: **PDF** (preferencial), JPG e PNG, até 5 por envio, com o limite de tamanho de `MAX_UPLOAD_MB`.
  O tipo é conferido pelo conteúdo real do arquivo (não pela extensão).
- **Conferência automática do CPF** (`src/lib/documents/comprovabet-check.ts`): só acontece quando o PDF tem
  texto selecionável. O texto é lido (até 10 páginas), os CPFs são normalizados (só os 11 dígitos) e comparados:
  - CPF cadastrado encontrado → **CPF compatível**;
  - outro CPF completo e válido, sem o cadastrado → **CPF divergente**: o envio é recusado com a mensagem
    “O CPF identificado no documento não corresponde ao CPF informado no cadastro. Confira os dados e envie o
    documento correto.” e o arquivo **não é armazenado**;
  - imagem, PDF digitalizado, PDF protegido, CPF mascarado ou ausente → **Aguardando conferência documental**
    (a equipe confere manualmente). O sistema nunca informa uma validação automática que não aconteceu.
- A leitura também anota os anos citados no documento, para a equipe conferir o período.
- **Nenhum documento é aprovado só por ter sido enviado**: ou ele passa na pré-análise automática (abaixo), ou a
  equipe aprova. Um ComprovaBet com CPF divergente nunca é aprovado.

## Pré-análise automática do ComprovaBet

Logo depois do envio, a tela **Pré-análise** mostra uma barra de progresso enquanto o servidor confere o documento
com as respostas do formulário (`src/lib/documents/pre-analysis-check.ts`, rota `POST /api/draft/analysis`). Cada
linha mostra o resultado real da conferência:

| Conferência | Aprova quando | Se não confirmar |
|---|---|---|
| Leitura do documento | PDF com texto selecionável | foto ou PDF digitalizado → equipe confere |
| CPF do titular | o CPF informado aparece no texto | mascarado/ausente → equipe; outro CPF → pendência |
| Ano de referência | o ano do `COMPROVABET_YEAR` aparece no texto | só outros anos → **pendência**; sem ano → equipe |
| Tipo de documento | “ComprovaBet” ou demonstrativo de depósitos e saques/apostas | equipe confere |
| Plataformas informadas | informativo: plataformas do formulário citadas no documento | a equipe confere |
| Valores informados | informativo: totais do documento compatíveis com os informados (sem mostrar os valores) | a equipe confere |

Resultados:

- **Aprovado na pré-análise** — leitura, CPF, ano e tipo confirmados. O cliente segue para o pagamento e, com o
  pagamento aprovado, o caso já nasce com o ComprovaBet aprovado (“Aprovado automaticamente na pré-análise”) e
  em **Aguardando início da análise**.
- **Conferência pela equipe** — a leitura não confirmou tudo (foto, PDF digitalizado, CPF mascarado). O cliente
  pode seguir para o pagamento; o caso nasce em “Validação documental” para a equipe aprovar.
- **Documento com pendência** — arquivo de outro ano (ou de outro CPF): precisa ser trocado antes do pagamento.
  O servidor refaz a pré-análise ao abrir o pagamento e no envio, então não dá para contornar pela tela.

O resultado fica gravado no rascunho e no caso (`pre_analysis`), aparece no painel e entra na exportação de dados
do titular. A pré-análise confere o documento, não o resultado do caso.

## Pagamento da análise (PIX pela BlackCat)

A análise é paga **antes** da solicitação, na última tela do formulário (depois da pré-análise), por **PIX**. A
cobrança é criada pela API da BlackCat ([documentação](https://docs.blackcatoficial.com/)) e o QR Code e o código
copia e cola aparecem na própria tela: o cliente não sai do site. A chave da API fica só no servidor.

1. A tela mostra “Pagamento via PIX”, o valor (`ANALYSIS_PRICE`), o aviso **Importante** e o **aceite obrigatório**.
2. **Gerar PIX** chama `POST /api/payments/blackcat/create`, que valida no servidor nome, e-mail, WhatsApp e CPF,
   grava o aceite (data e hora, versão dos termos, IP e navegador) e as respostas no rascunho, registra o pagamento
   como `pending` com uma referência interna única (`AP-AAAAMMDD-XXXXXXXXXX`) e chama
   `POST {BLACKCAT_BASE_URL}/sales/create-sale` com o cabeçalho `X-API-Key` (valor em centavos,
   `paymentMethod: "pix"`, item com `tangible: false`, `pix.expiresInDays: 1`, `postbackUrl` e `externalRef`). O
   valor é sempre o do servidor: qualquer valor enviado pelo navegador é ignorado.
3. Da resposta da BlackCat são usados `data.transactionId`, `data.status` e `data.paymentData` (`copyPaste`,
   `qrCodeBase64`, `expiresAt`). A tela mostra o QR Code, o código com o botão **Copiar código PIX** (“Código PIX
   copiado”), o ID da transação, a validade e “Aguardando confirmação do pagamento”. Se `qrCodeBase64` não trouxer
   uma imagem, o QR Code é desenhado a partir do próprio copia e cola.
4. A BlackCat avisa o site em `POST /api/payments/webhook/blackcat` (evento `transaction.paid`). O conteúdo da
   notificação **não** vale como prova de pagamento: o site consulta `GET /sales/{transactionId}/status` e só marca
   como pago com o status `PAID` na API e o valor da análise. Cada evento fica em `payment_events`, único por
   `transactionId` + evento: entregas repetidas respondem 200 sem ser processadas de novo. A conclusão da
   solicitação roda depois da resposta, para o webhook responder rápido.
5. Com o pagamento confirmado, a solicitação é registrada **automaticamente**, mesmo que o cliente feche a página. A
   tela pergunta ao **nosso** servidor a cada 4 segundos se o pagamento já foi confirmado (resposta lida do banco) e
   muda sozinha para **Pagamento confirmado**; **Solicitar análise** mostra o protocolo (idempotente).
6. Se a notificação não chegar, o servidor faz uma consulta de reserva do status da transação no máximo uma vez por
   minuto por PIX aberto (a cada 10 segundos quando o cliente toca em “Verificar pagamento”) e uma última no
   vencimento. O saldo da conta BlackCat nunca é consultado.
7. PIX vencido fica `expired`, e a tela oferece **Gerar novo PIX**. Com o ComprovaBet aprovado na pré-análise, o
   caso nasce em **Aguardando início da análise**; sem a aprovação automática, nasce em “Validação documental”. O
   prazo (`REVIEW_DAYS`, em **dias úteis**) conta a partir do envio: em até 15 dias úteis a equipe entra em contato
   para apresentar o resultado e, se o caso puder prosseguir, combinar as condições e as formas de pagamento das
   próximas etapas. Dias úteis excluem sábados, domingos, feriados nacionais, Carnaval e Corpus Christi
   (`src/lib/business-days.ts`).

**Status internos** (`payments.status`): `pending` (PENDING), `paid` (PAID), `failed` (FAILED), `cancelled`
(CANCELLED), `expired` (EXPIRED) e `refunded` (estorno). Da BlackCat: `PAID` → `paid`, `PENDING` → `pending`,
`CANCELLED` → `cancelled`, `REFUNDED` → `refunded`, `EXPIRED` → `expired`, `FAILED` → `failed`; qualquer outro
valor continua pendente (nunca aprova por engano).

**Segurança:** chave só no servidor (nunca em variável `NEXT_PUBLIC_`, nunca nos logs); CPF nunca inteiro nos logs;
valor definido no servidor; cliques repetidos e duas abas recebem o mesmo PIX (trava curta no rascunho); rascunho
com PIX em aberto ou pago não pode ser apagado; erro da BlackCat não chega ao cliente (“Não foi possível gerar o PIX
agora. Tente novamente em alguns instantes.”), só ao log, sem segredos; a auditoria (`provider_payload` e
`payment_events.payload`) guarda transação, status, valores e datas, sem os dados do cliente.

**Configuração:**

| Variável | Valor |
|---|---|
| `BLACKCAT_API_KEY` | chave da API da BlackCat. Só no servidor: **nunca** com o prefixo `NEXT_PUBLIC_` |
| `BLACKCAT_BASE_URL` | `https://api.blackcatoficial.com/api` (padrão, se vazio) |
| `ANALYSIS_PRICE` | valor da análise, ex.: `197,00` (convertido para centavos no servidor) |
| `NEXT_PUBLIC_SITE_URL` | domínio final com https (monta o `postbackUrl` de cada cobrança) |

URL do webhook: `https://SEU-DOMINIO/api/payments/webhook/blackcat`. Ela vai em cada cobrança como `postbackUrl`; se
o painel da BlackCat também pedir uma URL de notificação, use a mesma.

**Cobrança de teste:** com as variáveis configuradas e `DEMO_MODE=false`, preencha o formulário, envie o ComprovaBet,
marque o aceite e toque em **Gerar PIX** (num ambiente de teste, use um `ANALYSIS_PRICE` baixo, ex.: `1,00`). Pague
pelo app do banco: em segundos a tela muda para “Pagamento confirmado”.

**Conferir o webhook e as transações no banco:**

```sql
-- Notificações recebidas: evento, resultado do processamento e número de entregas
select event, transaction_id, status, result, deliveries, received_at, processed_at
from payment_events order by received_at desc limit 20;

-- Transações pagas
select external_reference, provider_transaction_id, amount, payment_method, status, paid_at, status_detail
from payments where provider = 'blackcat' and status = 'paid' order by paid_at desc;
```

`status_detail` informa como a confirmação chegou: “confirmado pela BlackCat (webhook transaction.paid)” ou
“(consulta de status)”. No painel, a seção **Pagamento** do caso lista cada tentativa com a transação e a referência.

Pagamentos antigos do Mercado Pago continuam na tabela (provedor `mercadopago`), com os status renomeados
(`approved` → `paid`, `rejected` → `failed`). Casos antigos em “Aguardando pagamento” (fluxo anterior, pagamento
depois da validação) continuam com as instruções enviadas pela equipe, “Já fiz o pagamento” e **Confirmar
pagamento** no painel.

## Os três valores (nunca se misturam)

| Valor | Origem | Quem vê |
|---|---|---|
| **Declarado** | Depósitos − saques − saldo informados pelo cliente (negativo vira zero e é sinalizado) | Cliente e equipe |
| **Identificado** | Leitura automática dos documentos, sempre marcada como “Extraído automaticamente — necessita validação”, ou valor conferido pela equipe | Equipe; o cliente só vê depois de conferido |
| **Validado** | Definido **somente** manualmente pela equipe | Cliente e equipe, com o aviso de que não representa valor a ser recuperado |

Divergências relevantes (a partir de R$ 100 e 2% do declarado) aparecem no caso como “Divergência encontrada”.

## Status

**Caso:** `submitted` (Solicitação recebida) · `documents_received` (Validação documental) ·
`additional_documents` (Documentação complementar necessária) · `awaiting_payment` (Aguardando pagamento — só
casos antigos) · `payment_confirmed` (Aguardando início da análise: documento aprovado e análise paga) ·
`under_review` (Análise em andamento) ·
`eligible` (Caso com possibilidade de prosseguimento) · `not_eligible` (Elementos insuficientes para prosseguir) ·
`completed` (Análise concluída).

**Documento:** Aguardando análise · Documento em análise · Documento aprovado · CPF divergente ·
Documento inconsistente · Documento inválido · Documento ilegível · Documentação complementar necessária ·
Aguardando conferência manual · Possível duplicidade.

**Conferência do CPF (equipe):** Aguardando conferência documental · CPF compatível · CPF divergente · CPF conferido pela equipe.

**Pagamento do caso:** Pagamento confirmado (casos novos, pagos antes da solicitação) · Pagamento pendente e
Pagamento em confirmação (casos antigos) · Não se aplica (casos anteriores ao ComprovaBet, sem etapa de pagamento).

**Tentativas de pagamento (`payments`):** Aguardando pagamento · Aprovado · Recusado · Não concluído · Estornado.

**Ações rápidas no painel** (todas com diálogo de confirmação): Aprovar documento · CPF divergente · Solicitar
complemento · Documento inválido · Confirmar pagamento (só casos antigos; nos novos, a confirmação é automática) ·
Iniciar análise · Concluir análise. Nas ações de problema,
a equipe escolhe os motivos e escreve a orientação que aparece para o cliente.

## Leitura automática dos documentos

`src/lib/extraction/` separa leitores (CSV, XLSX, PDF) das regras de classificação:

- identifica colunas de data, valor, tipo, status e saldo em planilhas;
- soma apenas depósitos e saques concluídos (ignora apostas, bônus, estornos, cancelados, recusados e pendentes);
- aponta período coberto, histórico incompleto (menos de 12 meses), plataforma diferente da informada,
  arquivo repetido em outro caso e movimentações repetidas entre arquivos do mesmo caso;
- PDFs precisam ter texto selecionável; **imagens (JPG/PNG) vão para conferência manual**.

Para ler imagens e PDFs digitalizados, conecte um serviço de OCR em `extractFromBuffer`
(`src/lib/extraction/process.ts`). A leitura automática nunca define o valor validado.

## LGPD no painel

Na página de cada caso, a seção **Dados pessoais (LGPD)** atende pedidos do titular (art. 18):

- **Exportar dados (JSON):** respostas, valores, consentimentos, andamento e lista de documentos. Notas internas
  e registros de conferência da equipe não entram na exportação; os arquivos podem ser entregues pelo botão Visualizar.
- **Excluir definitivamente** (somente perfil `admin`): apaga o caso, as respostas, os valores, as notas e os
  arquivos do armazenamento, após digitar o protocolo para confirmar. Os registros de acesso são mantidos pelo prazo legal.

Toda exportação e exclusão fica registrada.

## Segurança e privacidade

- Documentos em armazenamento privado, com nome aleatório; visualização só pelo painel, via link assinado
  de 5 minutos, com registro de cada acesso.
- Validação do conteúdo real dos arquivos (assinatura), bloqueio de executáveis, de planilhas com macros e
  de arquivos com extensão trocada; limite de tamanho e de quantidade por caso.
- Senhas com scrypt, sessões administrativas no banco (12 h), cookies `httpOnly`, limite de tentativas de
  login e de consulta por protocolo, verificação de origem nos envios.
- Registro do compromisso voluntário (aceite, data, IP e navegador), do consentimento LGPD e do aceite das
  condições do serviço antes do pagamento.
- CPF tratado como dado pessoal: mascarado nas listas, no acompanhamento e nas respostas da API; o número completo
  só aparece no painel autorizado, sob demanda (“Mostrar”), e cada visualização é registrada. O CPF nunca é
  gravado nos registros de acesso. Documento com CPF de outra pessoa é recusado sem ser armazenado.
- Cabeçalhos de segurança e CSP em produção (`next.config.ts`); áreas privadas com `noindex`.
- O site nunca pede senhas, códigos SMS ou códigos de autenticação.

## Testes

```bash
npm test
```

Cobrem formatação de valores, cálculo da perda, validação do formulário no servidor, CPF (dígitos verificadores,
máscaras, busca no texto e conferência de PDFs com CPF igual, divergente, mascarado ou ausente), linha do tempo
em 6 etapas (com o pagamento antes ou depois da validação), a pré-análise automática (CPF, ano, tipo, plataformas,
valores, arquivos com e sem texto), o prazo em dias úteis (feriados e Páscoa), a tela de pagamento, a BlackCat (criação do
PIX, consulta de status, notificações e erros, com respostas simuladas) e o QR Code, regras de divergência e de andamento,
senhas, validação do conteúdo dos arquivos e a leitura automática de CSV, XLSX e PDF.

## Antes de publicar

- [ ] Revisar **Política de Privacidade** e **Termos de Uso** com assessoria jurídica (os textos são modelos).
- [ ] Preencher razão social, CNPJ, e-mail de contato e do encarregado (DPO) no `.env`.
- [ ] Definir o nome/marca em `NEXT_PUBLIC_SITE_NAME` (a imagem de compartilhamento usa esse nome automaticamente).
- [ ] Trocar o ícone, se houver logotipo próprio: `src/app/icon.svg` e `src/app/apple-icon.png`.
- [ ] Usar `AUTH_SECRET` e `CRON_SECRET` fortes e exclusivos de produção.
- [ ] Confirmar que o bucket está privado e com backup/versionamento conforme a política de retenção.
- [ ] Testar a leitura automática com históricos reais de cada plataforma e ajustar as regras se necessário.
- [ ] Testar a conferência do CPF e a pré-análise com ComprovaBets reais (PDF com texto) e conferir `COMPROVABET_YEAR`.
      Se o documento real usar outros termos, ajuste as regras de tipo e de valores em `src/lib/documents/pre-analysis-check.ts`.
- [ ] Configurar o pagamento (`ANALYSIS_PRICE`, `BLACKCAT_API_KEY`, `BLACKCAT_BASE_URL`) e fazer um PIX real de ponta a
      ponta, com valor baixo, antes de divulgar o site. Na primeira notificação real, confira em
      `payment_events.payload` se o evento e o `transactionId` chegaram (o formato é lido em `src/lib/payments/blackcat.ts`).
- [ ] Definir com a assessoria jurídica a política de cancelamento e reembolso (inclusive o direito de
      arrependimento do art. 49 do CDC, citado nos Termos) e revisar o texto das condições do serviço. Ao mudar
      esse texto, atualize `SERVICE_TERMS_VERSION` em `src/lib/comprovabet.ts`.
- [ ] A etapa 7 traz uma linha discreta sobre a autoexclusão oficial (gov.br/autoexclusaoapostas).
      Remova em `src/components/analysis/steps.tsx` se não fizer sentido para a operação.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run setup` / `npm run setup:win` | instalação local completa (Linux/macOS e Windows) |
| `npm run dev` | ambiente de desenvolvimento |
| `npm run build` / `npm start` | build e execução de produção |
| `npm run db:deploy` | aplica as migrations |
| `npm run db:migrate` | cria nova migration em desenvolvimento |
| `npm run db:seed` | dados fictícios (somente com `DEMO_MODE=true`) |
| `npm run admin:create -- --email ... --name ...` | cria ou atualiza acesso da equipe (`--role analyst` opcional) |
| `npm test` | testes automatizados |
| `npm run typecheck` | checagem de tipos |
| `npm run previa` | gera a prévia navegável (`previa/index.html`) |
