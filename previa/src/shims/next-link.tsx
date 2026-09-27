// "next/link" na prévia: links viram endereços com # (#/admin/casos), navegando sem recarregar.
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { getRouter } from "../runtime/router-state";

type Href = string | { pathname?: string; query?: Record<string, string | number | undefined>; hash?: string };

function toUrl(href: Href): string {
  if (typeof href === "string") return href;
  const query = new URLSearchParams(
    Object.entries(href.query ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return `${href.pathname ?? ""}${query ? `?${query}` : ""}${href.hash ? `#${href.hash.replace(/^#/, "")}` : ""}`;
}

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: Href;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
  children?: ReactNode;
};

export default function Link({ href, replace, scroll, prefetch: _prefetch, onClick, children, ...rest }: Props) {
  const url = toUrl(href);
  const internal = url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/api/");
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !internal) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void getRouter().navigate(url, { replace, scroll });
  };
  return (
    <a href={internal ? `#${url}` : url} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

(Link as unknown as { $$client: boolean }).$$client = true;
