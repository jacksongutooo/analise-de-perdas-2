// Estado do roteador da prévia, compartilhado entre o renderizador, as ações e os shims do Next.
import { createContext, useContext } from "react";

export type RouterState = { pathname: string; searchParams: URLSearchParams; params: Record<string, string> };

export const RouterContext = createContext<RouterState>({ pathname: "/", searchParams: new URLSearchParams(), params: {} });

export type PreviewRouter = {
  navigate(href: string, opts?: { replace?: boolean; scroll?: boolean }): Promise<void>;
  refresh(): Promise<void>;
  notFound(): Promise<void>;
  back(): void;
  forward(): void;
};

let router: PreviewRouter | null = null;

export function setRouter(r: PreviewRouter) {
  router = r;
}

export function getRouter(): PreviewRouter {
  if (!router) throw new Error("Roteador da prévia ainda não iniciado.");
  return router;
}

export function useRouterState(): RouterState {
  return useContext(RouterContext);
}
