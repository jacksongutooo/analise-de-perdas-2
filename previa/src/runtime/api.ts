// Rotas /api na prévia: fetch e XMLHttpRequest (upload com progresso) chegam aos route handlers reais.
import { apis } from "previa:routes";
import { appOrigin, requestHeaders } from "./request";
import { compile, type CompiledPath } from "./paths";
import { RedirectSignal } from "./signals";

const routes: (CompiledPath & { mod: Record<string, any> })[] = apis.map((r) => ({ ...compile(r.path), mod: r.mod }));
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isApiUrl(url: URL): boolean {
  return url.origin === appOrigin() && url.pathname.startsWith("/api/");
}

/** Requisição com os cabeçalhos que o servidor veria (inclusive origem e host, que o navegador protege). */
export function buildRequest(url: string, init?: RequestInit, base?: Request): Request {
  const real = base ? new Request(base, init) : new Request(url, init);
  const headers = requestHeaders(real.headers);
  try {
    headers.set("origin", appOrigin());
  } catch {
    /* ignore */
  }
  return new Proxy(real, {
    get(target, prop) {
      if (prop === "headers") return headers;
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export async function handleApi(req: Request): Promise<Response> {
  const url = new URL(req.url);
  for (const route of routes) {
    const params = route.match(url.pathname);
    if (!params) continue;
    const method = req.method.toUpperCase() === "HEAD" ? "GET" : req.method.toUpperCase();
    const handler = route.mod[method];
    if (typeof handler !== "function") return new Response("Método não permitido.", { status: 405 });
    try {
      const res = await handler(req, { params: Promise.resolve(params) });
      return res instanceof Response ? res : new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof RedirectSignal) return new Response(null, { status: 307, headers: { Location: error.url } });
      console.error("[prévia] erro na rota", url.pathname, error);
      return Response.json({ error: "Erro inesperado na prévia." }, { status: 500 });
    }
  }
  return Response.json({ error: "Rota indisponível na prévia." }, { status: 404 });
}

/** GET numa rota da prévia seguindo redirecionamentos internos (ex.: Visualizar → /api/files). */
export async function fetchApiFollow(path: string): Promise<Response> {
  let url = new URL(path, window.location.href);
  for (let hop = 0; hop < 5; hop++) {
    const res = await handleApi(buildRequest(url.href, { method: "GET" }));
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      if (!isApiUrl(url)) return res;
      continue;
    }
    return res;
  }
  throw new Error("Redirecionamentos demais.");
}

export function installNetworkShims() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.href);
    if (!isApiUrl(url)) return realFetch(input, init);
    await pause(180);
    return handleApi(buildRequest(url.href, init, input instanceof Request ? input : undefined));
  };

  const RealXHR = window.XMLHttpRequest;
  class PreviewXHR {
    upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onreadystatechange: (() => void) | null = null;
    readyState = 0;
    status = 0;
    responseText = "";
    response = "";
    private method = "GET";
    private url = "";
    private headers: Record<string, string> = {};
    private responseHeaders = new Headers();
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
      this.readyState = 1;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    getResponseHeader(name: string) {
      return this.responseHeaders.get(name);
    }
    getAllResponseHeaders() {
      return [...this.responseHeaders.entries()].map(([k, v]) => `${k}: ${v}`).join("\r\n");
    }
    abort() {}
    send(body?: Document | XMLHttpRequestBodyInit | null) {
      const url = new URL(this.url, window.location.href);
      if (!isApiUrl(url)) {
        this.onerror?.();
        return;
      }
      const total = body instanceof FormData ? [...body.values()].reduce((acc, v) => acc + (v instanceof Blob ? v.size : String(v).length), 0) : 1;
      void (async () => {
        for (let step = 1; step <= 6; step++) {
          await pause(90);
          this.upload.onprogress?.({ lengthComputable: true, loaded: Math.round((total * step) / 6), total } as ProgressEvent);
        }
        const res = await handleApi(buildRequest(url.href, { method: this.method, headers: this.headers, body: body as BodyInit }));
        this.status = res.status;
        this.responseHeaders = res.headers;
        this.responseText = this.response = await res.text();
        this.readyState = 4;
        this.onreadystatechange?.();
        this.onload?.();
      })().catch(() => {
        this.status = 0;
        this.readyState = 4;
        this.onerror?.();
      });
    }
  }
  (window as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = PreviewXHR;
  (window as unknown as { RealXMLHttpRequest: unknown }).RealXMLHttpRequest = RealXHR;
}
