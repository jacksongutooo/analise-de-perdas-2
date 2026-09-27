# Instalação local (Windows): dependências, .env, banco (Docker), migrations e primeiro acesso.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1   (ou: npm run setup:win)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Step([string]$text) { Write-Host "`n$text" -ForegroundColor Cyan }
function Check([string]$message) { if ($LASTEXITCODE -ne 0) { Write-Host $message -ForegroundColor Red; exit 1 } }
function New-Secret {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

Step "1/5 Verificando o Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js não encontrado. Instale a versão 20.9 ou superior: https://nodejs.org" -ForegroundColor Red
  exit 1
}
$version = (node -v).TrimStart("v").Split(".")
if ([int]$version[0] -lt 20 -or ([int]$version[0] -eq 20 -and [int]$version[1] -lt 9)) {
  Write-Host "Node.js $(node -v) encontrado; é necessário 20.9 ou superior." -ForegroundColor Red
  exit 1
}
Write-Host "Node.js $(node -v)"

Step "2/5 Instalando dependências"
& npm.cmd install
Check "Falha ao instalar as dependências."

Step "3/5 Configurando o .env"
$envPath = Join-Path (Get-Location) ".env"
if (-not (Test-Path $envPath)) {
  Copy-Item ".env.example" $envPath
  $text = [System.IO.File]::ReadAllText($envPath)
  $text = $text -replace '(?m)^AUTH_SECRET=.*$', ('AUTH_SECRET="' + (New-Secret) + '"')
  $text = $text -replace '(?m)^CRON_SECRET=.*$', ('CRON_SECRET="' + (New-Secret) + '"')
  [System.IO.File]::WriteAllText($envPath, $text, (New-Object System.Text.UTF8Encoding $false))
  Write-Host ".env criado a partir do .env.example, com segredos aleatórios."
} else {
  Write-Host ".env já existe e foi mantido como está."
}

Step "4/5 Banco de dados"
$usesLocalDb = Select-String -Path $envPath -Pattern '^DATABASE_URL=.*@(localhost|127\.0\.0\.1)' -Quiet
$hasDocker = [bool](Get-Command docker -ErrorAction SilentlyContinue)
if ($usesLocalDb -and $hasDocker) {
  & docker compose up -d
  Check "Não foi possível iniciar o PostgreSQL com o Docker. O Docker Desktop está aberto?"
  Write-Host -NoNewline "Aguardando o PostgreSQL"
  $ready = $false
  # No Windows PowerShell 5.1, redirecionar a saída de erro de um programa com "Stop" encerra o script.
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  for ($i = 0; $i -lt 40; $i++) {
    & docker compose exec -T db pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
  }
  $ErrorActionPreference = $previousPreference
  Write-Host ""
  if (-not $ready) { Write-Host "O PostgreSQL não respondeu. Verifique com: docker compose logs db" -ForegroundColor Red; exit 1 }
} else {
  Write-Host "Usando o banco configurado em DATABASE_URL no .env (Docker não utilizado)."
}
& npx.cmd prisma migrate deploy
Check "Falha ao aplicar as migrations. Confira o DATABASE_URL no .env."

Step "5/5 Acesso da equipe"
$answer = Read-Host "Criar um acesso ao painel agora? [s/N]"
if ($answer -match '^[sS]') {
  $email = Read-Host "E-mail"
  $name = Read-Host "Nome"
  & npx.cmd tsx scripts/create-admin.ts --email $email --name $name
  Check "Não foi possível criar o acesso."
} else {
  Write-Host 'Você pode criar depois com: npm run admin:create -- --email voce@empresa.com.br --name "Seu Nome"'
}

Step "Pronto!"
Write-Host "Inicie com: npm run dev   ->   http://localhost:3000   (painel em /admin)"
Write-Host 'Dados fictícios de demonstração: coloque DEMO_MODE="true" no .env e rode npm run db:seed'
