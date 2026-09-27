#!/usr/bin/env bash
# Instalação local (Linux/macOS): dependências, .env, banco (Docker), migrations e primeiro acesso.
# Uso: bash scripts/setup.sh   (ou: npm run setup)
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf "\n\033[1m%s\033[0m\n" "$1"; }

step "1/5 Verificando o Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão 20.9 ou superior: https://nodejs.org"
  exit 1
fi
node -e 'const [a, b] = process.versions.node.split(".").map(Number); if (a < 20 || (a === 20 && b < 9)) { console.error("Node.js " + process.versions.node + " encontrado; é necessário 20.9 ou superior."); process.exit(1); }'
echo "Node.js $(node -v)"

step "2/5 Instalando dependências"
npm install

step "3/5 Configurando o .env"
if [ ! -f .env ]; then
  cp .env.example .env
  node -e '
    const fs = require("fs");
    const crypto = require("crypto");
    const secret = () => crypto.randomBytes(48).toString("base64url");
    let env = fs.readFileSync(".env", "utf8");
    env = env.replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET="${secret()}"`).replace(/^CRON_SECRET=.*$/m, `CRON_SECRET="${secret()}"`);
    fs.writeFileSync(".env", env);
  '
  echo ".env criado a partir do .env.example, com segredos aleatórios."
else
  echo ".env já existe e foi mantido como está."
fi

step "4/5 Banco de dados"
COMPOSE=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
fi
if grep -Eq '^DATABASE_URL=.*@(localhost|127\.0\.0\.1)' .env && [ -n "$COMPOSE" ]; then
  $COMPOSE up -d
  printf "Aguardando o PostgreSQL"
  ready=0
  for _ in $(seq 1 40); do
    if $COMPOSE exec -T db pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
    printf "."
    sleep 1
  done
  echo
  if [ "$ready" != 1 ]; then
    echo "O PostgreSQL não respondeu. Verifique com: $COMPOSE logs db"
    exit 1
  fi
else
  echo "Usando o banco configurado em DATABASE_URL no .env (Docker não utilizado)."
fi
npx prisma migrate deploy

step "5/5 Acesso da equipe"
answer=""
read -r -p "Criar um acesso ao painel agora? [s/N] " answer || true
if [[ "$answer" =~ ^[sS] ]]; then
  email=""
  name=""
  read -r -p "E-mail: " email || true
  read -r -p "Nome: " name || true
  npm run admin:create -- --email "$email" --name "$name"
else
  echo "Você pode criar depois com: npm run admin:create -- --email voce@empresa.com.br --name \"Seu Nome\""
fi

step "Pronto!"
echo "Inicie com: npm run dev   →   http://localhost:3000   (painel em /admin)"
echo "Dados fictícios de demonstração: coloque DEMO_MODE=\"true\" no .env e rode npm run db:seed"
