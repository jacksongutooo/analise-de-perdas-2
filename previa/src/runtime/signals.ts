// Sinais usados por redirect() e notFound(), como no Next.js: interrompem a renderização ou a ação.
export class RedirectSignal extends Error {
  constructor(
    readonly url: string,
    readonly replace = false,
  ) {
    super(`NEXT_REDIRECT;${url}`);
  }
}

export class NotFoundSignal extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}
