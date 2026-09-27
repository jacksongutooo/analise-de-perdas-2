// Renderizador da prévia: monta as páginas do App Router no navegador (layouts, páginas e componentes de
// servidor, inclusive os assíncronos), com endereços por # e os mesmos redirect()/notFound() do Next.js.
import { Children, Fragment, cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { errorPages, notFoundPage, pages, rootLayout } from "previa:routes";
import { STORAGE_KEY, loadDb } from "../shims/fake-prisma";
import { compile } from "./paths";
import { COOKIE_KEY, reloadCookies } from "./request";
import { RouterContext, setRouter } from "./router-state";
import { NotFoundSignal, RedirectSignal } from "./signals";
import { PreviewShell, PreviewErrorView } from "./shell";

const compiled = pages
  .map((p) => ({ ...p, ...compile(p.path) }))
  .sort((a, b) => a.dynamic - b.dynamic);

type Parsed = { pathname: string; searchParams: URLSearchParams; anchor: string; url: string };

function parse(url: string): Parsed {
  const hashAt = url.indexOf("#");
  const anchor = hashAt >= 0 ? url.slice(hashAt + 1) : "";
  const u = new URL(hashAt >= 0 ? url.slice(0, hashAt) : url, "https://previa.local");
  const pathname = u.pathname.replace(/\/+$/, "") || "/";
  return { pathname, searchParams: u.searchParams, anchor, url: `${pathname}${u.search}${anchor ? `#${anchor}` : ""}` };
}

export function currentUrl(): string {
  const hash = window.location.hash;
  return hash.startsWith("#/") ? decodeURI(hash.slice(1)) : "/";
}

function searchRecord(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of params) {
    const prev = out[key];
    out[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return out;
}

const isClient = (type: any) => Boolean(type?.$$client) || Boolean(type?.prototype?.isReactComponent);

/** Resolve os componentes de servidor (inclusive async) até sobrar só HTML e componentes cliente. */
async function resolveTree(node: any): Promise<any> {
  if (node === null || node === undefined || typeof node !== "object") return node;
  if (typeof node.then === "function") return resolveTree(await node);
  if (Array.isArray(node)) return Promise.all(node.map(resolveTree));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<Record<string, unknown>>;
  const type: any = element.type;
  if (typeof type === "function" && !isClient(type)) return resolveTree(await type(element.props));
  const props = element.props;
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (key === "children" || isValidElement(value) || (Array.isArray(value) && value.some(isValidElement))) {
      const resolved = await resolveTree(value);
      if (resolved !== value) {
        next[key] = resolved;
        changed = true;
      }
    }
  }
  return changed ? cloneElement(element, next) : element;
}

/** O layout raiz devolve <html><body>; na prévia, fica só o conteúdo do body. */
function unwrapDocument(node: ReactNode): ReactNode {
  if (isValidElement(node) && node.type === "html") {
    const body = Children.toArray((node.props as { children?: ReactNode }).children).find(
      (c): c is ReactElement<{ className?: string; children?: ReactNode }> => isValidElement(c) && c.type === "body",
    );
    if (body) return createElement("div", { className: body.props.className, "data-previa-body": "" }, body.props.children);
  }
  return node;
}

function titleOf(meta: any): string | null {
  const t = meta?.title;
  if (!t) return null;
  if (typeof t === "string") return t;
  return t.absolute ?? t.default ?? null;
}

async function pageTitle(mod: any, params: Record<string, string>, search: Record<string, string | string[]>): Promise<string> {
  let title = titleOf(mod.metadata);
  if (!title && typeof mod.generateMetadata === "function") {
    title = titleOf(await mod.generateMetadata({ params: Promise.resolve(params), searchParams: Promise.resolve(search) }).catch(() => null));
  }
  return title ?? titleOf(rootLayout.metadata) ?? "Análise de Perdas";
}

async function build(url: string) {
  const parsed = parse(url);
  let route: (typeof compiled)[number] | undefined;
  let params: Record<string, string> = {};
  for (const r of compiled) {
    const m = r.match(parsed.pathname);
    if (m) {
      route = r;
      params = m;
      break;
    }
  }
  if (!route) throw new NotFoundSignal();
  const search = searchRecord(parsed.searchParams);
  let element: ReactElement = createElement(route.page.default, { params: Promise.resolve(params), searchParams: Promise.resolve(search) });
  for (const layout of [...route.layouts].reverse()) {
    element = createElement(layout.default, { params: Promise.resolve(params), children: element });
  }
  const tree = unwrapDocument(await resolveTree(createElement(rootLayout.default, { children: element })));
  return { tree, params, parsed, title: await pageTitle(route.page, params, search) };
}

async function buildNotFound() {
  return unwrapDocument(await resolveTree(createElement(rootLayout.default, { children: createElement(notFoundPage.default) })));
}

function errorComponentFor(pathname: string) {
  const match = errorPages.filter((e) => pathname === e.path || pathname.startsWith(`${e.path === "/" ? "" : e.path}/`) || e.path === "/");
  return match.sort((a, b) => b.path.length - a.path.length)[0]?.mod.default ?? null;
}

// ─── Navegação ────────────────────────────────────────────────────────────
const root = createRoot(document.getElementById("root")!);
let navId = 0;
let lastRendered = "";
let lastPathname = "";
let redirects = 0;

function show(tree: ReactNode, parsed: Parsed, params: Record<string, string>, opts: { scroll?: boolean }) {
  root.render(
    <RouterContext.Provider value={{ pathname: parsed.pathname, searchParams: parsed.searchParams, params }}>
      <PreviewShell pathname={parsed.pathname}>
        <Fragment key={parsed.pathname}>{tree}</Fragment>
      </PreviewShell>
    </RouterContext.Provider>,
  );
  const samePage = parsed.pathname === lastPathname;
  lastRendered = parsed.url;
  lastPathname = parsed.pathname;
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      const target = parsed.anchor ? document.getElementById(parsed.anchor) : null;
      if (target) target.scrollIntoView({ block: "start" });
      else if (!samePage && opts.scroll !== false) window.scrollTo(0, 0);
    }),
  );
}

async function render(url: string, opts: { scroll?: boolean } = {}): Promise<void> {
  const id = ++navId;
  const parsed = parse(url);
  try {
    const { tree, params, title } = await build(url);
    if (id !== navId) return;
    redirects = 0;
    document.title = `${title} · Prévia`;
    show(tree, parsed, params, opts);
  } catch (error) {
    if (id !== navId) return;
    if (error instanceof RedirectSignal && redirects < 8) {
      redirects++;
      return navigate(error.url, { replace: true });
    }
    redirects = 0;
    if (error instanceof NotFoundSignal) {
      document.title = "Página não encontrada · Prévia";
      show(await buildNotFound(), parsed, {}, opts);
      return;
    }
    console.error("[prévia]", error);
    const ErrorPage = errorComponentFor(parsed.pathname);
    document.title = "Erro · Prévia";
    show(
      <>
        <PreviewErrorView error={error} />
        {ErrorPage ? <ErrorPage error={error as Error} reset={() => void render(currentUrl(), { scroll: false })} /> : null}
      </>,
      parsed,
      {},
      opts,
    );
  }
}

export function navigate(href: string, opts: { replace?: boolean; scroll?: boolean } = {}): Promise<void> {
  const url = href.startsWith("/") ? href : `/${href.replace(/^#?\/?/, "")}`;
  const hash = `#${url}`;
  try {
    if (opts.replace) window.history.replaceState(window.history.state, "", hash);
    else if (window.location.hash !== hash) window.history.pushState(null, "", hash);
  } catch {
    window.location.hash = hash;
  }
  return render(url, opts);
}

export function start() {
  setRouter({
    navigate,
    refresh: () => render(currentUrl(), { scroll: false }),
    notFound: async () => {
      const parsed = parse(currentUrl());
      show(await buildNotFound(), parsed, {}, {});
    },
    back: () => window.history.back(),
    forward: () => window.history.forward(),
  });
  const onLocationChange = () => {
    const url = parse(currentUrl()).url;
    if (url !== lastRendered) void render(url);
  };
  window.addEventListener("popstate", onLocationChange);
  window.addEventListener("hashchange", onLocationChange);
  // Prévia aberta em mais de uma aba: o que uma aba grava aparece na outra.
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) loadDb();
    else if (event.key === COOKIE_KEY) reloadCookies();
    else return;
    void render(currentUrl(), { scroll: false });
  });
  if (!window.location.hash.startsWith("#/")) window.history.replaceState(null, "", "#/");
  void render(currentUrl());
}
