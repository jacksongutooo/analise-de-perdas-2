// Ponto de entrada da prévia navegável (previa/index.html). Gerado por: npm run previa
import "./shims/buffer";
import { seedDemoData } from "@/lib/demo/seed";
import { installNetworkShims } from "./runtime/api";
import { start } from "./runtime/render";
import { installBrowserShims, installClickHandler } from "./runtime/shell";
import { loadDb } from "./shims/fake-prisma";

async function boot() {
  installNetworkShims();
  installClickHandler();
  installBrowserShims();
  if (!loadDb()) await seedDemoData();
  start();
}

boot().catch((error) => {
  console.error(error);
  const root = document.getElementById("root");
  if (root) {
    root.textContent = "";
    const p = document.createElement("p");
    p.style.cssText = "padding:48px 24px;font-family:system-ui,sans-serif;color:#a3302a";
    p.textContent = `Não foi possível iniciar a prévia: ${error instanceof Error ? error.message : String(error)}`;
    root.append(p);
  }
});
