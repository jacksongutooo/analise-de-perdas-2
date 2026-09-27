// Dados FICTÍCIOS de demonstração. Só roda com DEMO_MODE=true e fora de produção.
// Os casos ficam em src/lib/demo/seed.ts (compartilhados com a prévia navegável).
import "../scripts/load-env";
import { prisma } from "../src/lib/db";
import { DEMO_PASSWORD, seedDemoData } from "../src/lib/demo/seed";
import { config } from "../src/lib/env";
import { getStorage } from "../src/lib/storage";

async function wipeDemoData() {
  const storage = await getStorage();
  const docs = await prisma.document.findMany({ where: { isDemo: true }, select: { storageKey: true } });
  for (const d of docs) await storage.remove(d.storageKey).catch(() => undefined);
  await prisma.case.deleteMany({ where: { isDemo: true } });
  await prisma.caseDraft.deleteMany({ where: { isDemo: true } });
  await prisma.payment.deleteMany({ where: { isDemo: true } });
  await prisma.document.deleteMany({ where: { isDemo: true } });
  await prisma.user.deleteMany({ where: { isDemo: true } });
  await prisma.adminSession.deleteMany({ where: { admin: { isDemo: true } } });
}

async function main() {
  if (!config.demoMode || config.isProduction) {
    console.error("O seed de demonstração só roda com DEMO_MODE=true e fora de produção.");
    process.exit(1);
  }
  console.log("Limpando dados de demonstração anteriores…");
  await wipeDemoData();
  for (const c of await seedDemoData()) {
    console.log(`  ${c.protocol}  ${c.status.padEnd(20)} ${c.paymentStatus.padEnd(22)} ${c.email}`);
  }
  console.log("\nDados de demonstração criados (fictícios).");
  console.log(`Painel: /admin/login  ·  demo@example.com  ·  senha: ${DEMO_PASSWORD}`);
  console.log("Acompanhamento: /acompanhar  ·  use um protocolo acima com o e-mail correspondente.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
