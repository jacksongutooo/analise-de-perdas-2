// "Requisição" simulada: cookies guardados no navegador e cabeçalhos com IP fictício de documentação.
export const COOKIE_KEY = "previa-analise:cookies:v3";
export const PREVIEW_IP = "203.0.113.10";

type Stored = { value: string; expires: number | null };
let jar: Record<string, Stored> = load();

function load(): Record<string, Stored> {
  try {
    return JSON.parse(window.localStorage.getItem(COOKIE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function save() {
  try {
    window.localStorage.setItem(COOKIE_KEY, JSON.stringify(jar));
  } catch {
    /* sem armazenamento: cookies só em memória */
  }
}

function alive(name: string): Stored | null {
  const c = jar[name];
  if (!c) return null;
  if (c.expires !== null && c.expires < Date.now()) {
    delete jar[name];
    save();
    return null;
  }
  return c;
}

type CookieInput = { name: string; value: string; expires?: Date | number | string; maxAge?: number; [key: string]: unknown };

export const cookieStore = {
  get(nameOrObj: string | { name: string }) {
    const name = typeof nameOrObj === "string" ? nameOrObj : nameOrObj.name;
    const c = alive(name);
    return c ? { name, value: c.value } : undefined;
  },
  getAll() {
    return Object.keys(jar)
      .map((name) => ({ name, cookie: alive(name) }))
      .filter((c) => c.cookie)
      .map((c) => ({ name: c.name, value: c.cookie!.value }));
  },
  has(name: string) {
    return Boolean(alive(name));
  },
  set(nameOrObj: string | CookieInput, value?: string, options?: Omit<CookieInput, "name" | "value">) {
    const c: CookieInput = typeof nameOrObj === "object" ? nameOrObj : { name: nameOrObj, value: value ?? "", ...options };
    const expires = c.expires !== undefined ? new Date(c.expires).getTime() : c.maxAge !== undefined ? Date.now() + c.maxAge * 1000 : null;
    if (c.maxAge === 0 || (expires !== null && expires <= Date.now())) delete jar[c.name];
    else jar[c.name] = { value: String(c.value), expires };
    save();
    return cookieStore;
  },
  delete(nameOrObj: string | { name: string }) {
    delete jar[typeof nameOrObj === "string" ? nameOrObj : nameOrObj.name];
    save();
    return cookieStore;
  },
  toString() {
    return cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  },
};

/** Outra aba mudou os cookies da prévia. */
export function reloadCookies() {
  jar = load();
}

export function clearCookies() {
  jar = {};
  save();
}

export function appOrigin(): string {
  return new URL(window.location.href).origin;
}

/** Cabeçalhos de uma requisição da prévia (navegador real + IP fictício + mesma origem). */
export function requestHeaders(init?: HeadersInit): Headers {
  const h = new Headers(init);
  const set = (name: string, value: string) => {
    try {
      h.set(name, value);
    } catch {
      /* cabeçalho protegido: ignora */
    }
  };
  if (!h.has("user-agent")) set("user-agent", navigator.userAgent);
  set("x-forwarded-for", PREVIEW_IP);
  set("host", new URL(window.location.href).host || "previa.local");
  return h;
}
