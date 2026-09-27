// "next/server" na prévia.
export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit): NextResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }

  static redirect(url: string | URL, init?: number | ResponseInit): NextResponse {
    const status = typeof init === "number" ? init : (init?.status ?? 307);
    const headers = new Headers(typeof init === "object" ? init.headers : undefined);
    headers.set("Location", String(url));
    return new NextResponse(null, { status, headers });
  }

  static next(): NextResponse {
    return new NextResponse(null, { status: 200 });
  }
}

export type NextRequest = Request;

/** Tarefas depois da resposta: na prévia, logo em seguida. */
export function after(task: (() => unknown) | Promise<unknown>) {
  setTimeout(() => {
    Promise.resolve()
      .then(() => (typeof task === "function" ? task() : task))
      .catch((error) => console.error("[prévia] tarefa posterior falhou", error));
  }, 0);
}
