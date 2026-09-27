// Gera previa/index.html: a prévia navegável do site, sem servidor, com o código atual do projeto.
// O código do servidor (páginas, ações e rotas /api) roda no navegador sobre um banco simulado
// (previa/src/shims/fake-prisma.ts) com os mesmos dados fictícios do seed (src/lib/demo/seed.ts).
// Uso: npm run previa
import { build } from "esbuild";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const appDir = path.join(src, "app");
const previaDir = path.join(root, "previa");
const shim = (name) => path.join(previaDir, "src", "shims", name);
const require = createRequire(import.meta.url);

// ─── Esquema do banco (DMMF do Prisma Client gerado) ─────────────────────
const { Prisma } = require("@prisma/client");
const dmmf = Prisma.dmmf.datamodel;

// ─── Rotas do App Router ─────────────────────────────────────────────────
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const routeOf = (dir) =>
  "/" +
  path
    .relative(appDir, dir)
    .split(path.sep)
    .filter((seg) => seg && !/^\(.*\)$/.test(seg))
    .join("/");

const files = await walk(appDir);
const byName = (name) => files.filter((f) => path.basename(f) === name);
const rootLayout = path.join(appDir, "layout.tsx");
const layouts = byName("layout.tsx").filter((f) => f !== rootLayout);
const pages = byName("page.tsx");
const apis = byName("route.ts").filter((f) => f.startsWith(path.join(appDir, "api") + path.sep));
const errors = byName("error.tsx");
const notFound = path.join(appDir, "not-found.tsx");

let routesCode = "";
let counter = 0;
const imported = new Map();
const mod = (file) => {
  if (!imported.has(file)) {
    const id = `m${counter++}`;
    imported.set(file, id);
    routesCode += `import * as ${id} from ${JSON.stringify(file)};\n`;
  }
  return imported.get(file);
};
const pageEntries = pages.map((file) => {
  const dir = path.dirname(file);
  const chain = layouts
    .filter((l) => dir === path.dirname(l) || dir.startsWith(path.dirname(l) + path.sep))
    .sort((a, b) => a.length - b.length);
  return `{ path: ${JSON.stringify(routeOf(dir))}, page: ${mod(file)}, layouts: [${chain.map(mod).join(", ")}] }`;
});
const apiEntries = apis.map((file) => `{ path: ${JSON.stringify(routeOf(path.dirname(file)))}, mod: ${mod(file)} }`);
const errorEntries = errors.map((file) => `{ path: ${JSON.stringify(routeOf(path.dirname(file)))}, mod: ${mod(file)} }`);
const rootId = mod(rootLayout);
const notFoundId = mod(notFound);
routesCode += `export const rootLayout = ${rootId};\n`;
routesCode += `export const notFoundPage = ${notFoundId};\n`;
routesCode += `export const pages = [${pageEntries.join(",\n")}];\n`;
routesCode += `export const apis = [${apiEntries.join(",\n")}];\n`;
routesCode += `export const errorPages = [${errorEntries.join(",\n")}];\n`;

// ─── Plugin: módulos do servidor e do Next.js trocados por versões da prévia ─
const MODULE_SHIMS = {
  "next/link": shim("next-link.tsx"),
  "next/navigation": shim("next-navigation.ts"),
  "next/headers": shim("next-headers.ts"),
  "next/server": shim("next-server.ts"),
  "next/cache": shim("next-cache.ts"),
  "next/font/google": shim("next-font.ts"),
  "server-only": shim("server-only.ts"),
  "@prisma/client": shim("prisma-client.ts"),
  "node:crypto": shim("crypto.ts"),
  crypto: shim("crypto.ts"),
};
const readersFile = path.join(src, "lib", "extraction", "readers.ts");
const FILE_SHIMS = {
  [path.join(src, "lib", "db.ts")]: shim("db.ts"),
  [path.join(src, "lib", "storage", "local.ts")]: shim("storage-local.ts"),
  [path.join(src, "lib", "storage", "s3.ts")]: shim("storage-s3.ts"),
  [readersFile]: shim("readers.ts"),
};

function resolveFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const directiveCache = new Map();
function directiveOf(file) {
  if (!directiveCache.has(file)) {
    const code = readFileSync(file, "utf8").replace(/^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
    const m = /^["'](use client|use server)["']/.exec(code);
    directiveCache.set(file, m ? m[1] : null);
  }
  return directiveCache.get(file);
}

function exportedNames(code) {
  const names = new Set();
  for (const m of code.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of code.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of code.matchAll(/export\s*\{([^}]*)\}(?!\s*from)/g)) {
    for (const part of m[1].split(",")) {
      const local = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (local && !local.startsWith("type ")) names.add(local);
    }
  }
  for (const m of code.matchAll(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;/g)) names.add(m[1]);
  return [...names];
}

const previaPlugin = {
  name: "previa",
  setup(b) {
    b.onResolve({ filter: /^previa:(dmmf|routes)$/ }, (args) => ({ path: args.path, namespace: "previa-virtual" }));
    b.onLoad({ filter: /.*/, namespace: "previa-virtual" }, (args) =>
      args.path === "previa:dmmf" ? { contents: JSON.stringify(dmmf), loader: "json" } : { contents: routesCode, loader: "ts", resolveDir: root },
    );

    b.onResolve({ filter: /^(next\/(link|navigation|headers|server|cache|font\/google)|server-only|@prisma\/client|node:crypto|crypto)$/ }, (args) => ({
      path: MODULE_SHIMS[args.path],
    }));
    b.onResolve({ filter: /^node:/ }, (args) => ({
      errors: [{ text: `Módulo do Node indisponível na prévia: ${args.path} (em ${path.relative(root, args.importer)})` }],
    }));

    b.onResolve({ filter: /^(@\/|\.\.?\/|\/)/ }, (args) => {
      if (args.namespace === "previa-virtual" && !args.path.startsWith("/")) return undefined;
      const target = args.path.startsWith("@/")
        ? resolveFile(path.join(src, args.path.slice(2)))
        : resolveFile(path.isAbsolute(args.path) ? args.path : path.resolve(args.resolveDir, args.path));
      if (!target) return undefined;
      if (FILE_SHIMS[target] && !(target === readersFile && args.importer === FILE_SHIMS[readersFile])) return { path: FILE_SHIMS[target] };
      if (target.startsWith(src) && args.namespace !== "previa-action" && directiveOf(target) === "use server") {
        return { path: target, namespace: "previa-action" };
      }
      return { path: target };
    });

    // Ações de servidor: exportadas embrulhadas (redirect navega; depois da ação, a página é atualizada).
    b.onLoad({ filter: /.*/, namespace: "previa-action" }, (args) => {
      const names = exportedNames(readFileSync(args.path, "utf8"));
      const runtime = path.join(previaDir, "src", "runtime", "actions.ts");
      const contents =
        `import * as real from ${JSON.stringify(args.path)};\nimport { wrapAction } from ${JSON.stringify(runtime)};\n` +
        names.map((n) => `export const ${n} = wrapAction(real.${n}, ${JSON.stringify(n)});`).join("\n");
      return { contents, loader: "ts", resolveDir: path.dirname(args.path) };
    });

    // Componentes cliente: marcados para o renderizador não executá-los como componentes de servidor.
    b.onLoad({ filter: /\.(tsx|ts)$/ }, (args) => {
      if (!args.path.startsWith(src) || directiveOf(args.path) !== "use client") return undefined;
      let code = readFileSync(args.path, "utf8");
      code = code.replace(/export\s+default\s+function\s*\(/, "export default function __DefaultExport(");
      const names = exportedNames(code);
      code += `\n;for (const __c of [${names.join(", ")}]) { if (typeof __c === "function") __c.$$client = true; }\n`;
      return { contents: code, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" };
    });
  },
};

// ─── Build ───────────────────────────────────────────────────────────────
const result = await build({
  entryPoints: [path.join(previaDir, "src", "main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2022", "chrome110", "safari16", "firefox115"],
  minify: true,
  jsx: "automatic",
  legalComments: "none",
  charset: "ascii", // caracteres especiais como escapes (ex.: \uFFFD da leitura de CSV)
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "empty", ".png": "empty", ".svg": "empty" },
  external: ["unpdf", "xlsx"],
  plugins: [previaPlugin],
  logLevel: "warning",
});
const bundle = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");

const env = {
  NODE_ENV: "production",
  DEMO_MODE: "true",
  REVIEW_DAYS: "15",
  MAX_UPLOAD_MB: "4",
  MAX_FILES_PER_CASE: "40",
  DRAFT_TTL_DAYS: "7",
  COMPROVABET_YEAR: "2025",
  STORAGE_DRIVER: "local",
  AUTH_SECRET: "previa-navegavel-sem-segredo-real-apenas-demonstracao",
  NEXT_PUBLIC_SITE_NAME: "Análise de Perdas",
  NEXT_PUBLIC_SITE_URL: "https://exemplo.com.br",
};

const css = readFileSync(path.join(appDir, "globals.css"), "utf8").replace(/^@import\s+["']tailwindcss["'];\s*/m, "");
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#f3f5f8" />
<title>Prévia · Análise de Perdas</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.13"></script>
<style type="text/tailwindcss">
${css}
</style>
<style>
:root { --font-plex: "IBM Plex Sans"; color-scheme: light; }
html, body { margin: 0; background: #f3f5f8; }
</style>
</head>
<body>
<div id="root"><p style="padding:48px 24px;font-family:system-ui,sans-serif;color:#6a7585">Carregando a prévia…</p></div>
<script>window.process={env:${JSON.stringify(env)}};</script>
<script>${bundle}</script>
</body>
</html>
`;
await mkdir(previaDir, { recursive: true });
await writeFile(path.join(previaDir, "index.html"), html);
console.log(`previa/index.html gerado (${(html.length / 1024).toFixed(0)} KB)`);

// --fragmento <arquivo>: mesma página sem <html>/<head>/<body>, para publicar onde o esqueleto HTML
// é adicionado automaticamente (ex.: Artifacts do Claude).
const flag = process.argv.indexOf("--fragmento");
if (flag > 0 && process.argv[flag + 1]) {
  const fragment = html
    .replace(/^<!doctype html>\s*/i, "")
    .replace(/<html[^>]*>\s*/i, "")
    .replace(/<\/?head>\s*/gi, "")
    .replace(/<meta charset="utf-8" \/>\s*/i, "")
    .replace(/<meta name="viewport"[^>]*>\s*/i, "")
    .replace(/<\/?body>\s*/gi, "")
    .replace(/<\/html>\s*$/i, "");
  const target = path.resolve(process.argv[flag + 1]);
  await writeFile(target, fragment);
  console.log(`fragmento gerado em ${target}`);
}
