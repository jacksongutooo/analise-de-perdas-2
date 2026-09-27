import { slugify } from "@/lib/format";
import { PLATFORMS } from "@/lib/options";

export type ResolvedPlatform = { slug: string; name: string; isCustom: boolean };

/**
 * Lista final de plataformas do caso. "aliases" liga cada nome exibido no formulário
 * (inclusive nomes digitados em "Outra") ao slug da plataforma, para vincular os arquivos.
 */
export function resolvePlatforms(input: { platforms: readonly string[]; otherPlatformEnabled: boolean; customPlatforms: readonly string[] }): {
  platforms: ResolvedPlatform[];
  aliases: Map<string, string>;
} {
  const platforms: ResolvedPlatform[] = [];
  const aliases = new Map<string, string>();
  const add = (p: ResolvedPlatform, alias: string) => {
    if (!platforms.some((x) => x.slug === p.slug)) platforms.push(p);
    aliases.set(alias.toLowerCase(), p.slug);
    aliases.set(p.name.toLowerCase(), p.slug);
  };
  for (const p of PLATFORMS) if (input.platforms.includes(p.slug)) add({ slug: p.slug, name: p.name, isCustom: false }, p.name);
  if (input.otherPlatformEnabled) {
    for (const raw of input.customPlatforms) {
      const name = raw.replace(/\s+/g, " ").trim();
      const slug = slugify(name);
      if (!name || !slug) continue;
      const listed = PLATFORMS.find((p) => p.slug === slug || p.name.toLowerCase() === name.toLowerCase());
      if (listed) add({ slug: listed.slug, name: listed.name, isCustom: false }, name);
      else add({ slug, name, isCustom: true }, name);
    }
  }
  return { platforms, aliases };
}
