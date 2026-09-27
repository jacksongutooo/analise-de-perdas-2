// Carrega o .env antes de qualquer outro módulo (importe este arquivo primeiro).
const proc = process as unknown as { loadEnvFile?: (path?: string) => void };
try {
  proc.loadEnvFile?.(".env");
} catch {
  // Sem arquivo .env: usa apenas as variáveis já definidas no ambiente.
}
export {};
