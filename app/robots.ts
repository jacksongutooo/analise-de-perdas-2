import type { MetadataRoute } from "next";
import { config } from "@/lib/env";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Em modo demonstração nada deve ser indexado.
  if (config.demoMode) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/acompanhar", "/analise", "/api"] }],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
