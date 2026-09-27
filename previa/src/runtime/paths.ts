// Padrões de rota do App Router: "/admin/casos/[id]" → regex com parâmetros.
export type CompiledPath = { path: string; dynamic: number; match(pathname: string): Record<string, string> | null };

export function compile(path: string): CompiledPath {
  const keys: string[] = [];
  const pattern = path
    .split("/")
    .map((segment) => {
      const m = /^\[(\.\.\.)?([^\]]+)\]$/.exec(segment);
      if (!m) return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      keys.push(m[2]!);
      return m[1] ? "(.+)" : "([^/]+)";
    })
    .join("/");
  const regex = new RegExp(`^${pattern || "/"}$`);
  return {
    path,
    dynamic: keys.length,
    match(pathname) {
      const m = regex.exec(pathname);
      if (!m) return null;
      return Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
    },
  };
}
