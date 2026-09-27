// "next/navigation" na prévia.
import { getRouter, useRouterState } from "../runtime/router-state";
import { NotFoundSignal, RedirectSignal } from "../runtime/signals";

export const RedirectType = { push: "push", replace: "replace" } as const;

export function redirect(url: string, type?: "push" | "replace"): never {
  throw new RedirectSignal(url, type === "replace");
}

export const permanentRedirect = redirect;

export function notFound(): never {
  throw new NotFoundSignal();
}

export function useRouter() {
  const r = getRouter();
  return {
    push: (href: string, opts?: { scroll?: boolean }) => void r.navigate(href, { scroll: opts?.scroll }),
    replace: (href: string, opts?: { scroll?: boolean }) => void r.navigate(href, { replace: true, scroll: opts?.scroll }),
    refresh: () => void r.refresh(),
    back: () => r.back(),
    forward: () => r.forward(),
    prefetch: () => undefined,
  };
}

export function usePathname(): string {
  return useRouterState().pathname;
}

export function useSearchParams(): URLSearchParams {
  return useRouterState().searchParams;
}

export function useParams(): Record<string, string> {
  return useRouterState().params;
}
