import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { config } from "@/lib/env";
import { site } from "@/lib/site";
import "./globals.css";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

const DESCRIPTION = `Envie seu ComprovaBet ${config.comprovabetYear} para uma análise documental individual do seu caso, com acompanhamento em todas as etapas. 100% online.`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | Análise documental de perdas em apostas online`, template: `%s | ${site.name}` },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: site.name,
    title: "Teve perdas em apostas online?",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
  robots: config.demoMode ? { index: false, follow: false } : undefined,
};

export const viewport: Viewport = {
  themeColor: "#f3f5f8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={plex.variable}>
      <body className="min-h-dvh">
        {config.demoMode && (
          <div className="bg-warn-50 px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-warn-700">
            DEMO MODE · dados fictícios de demonstração
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
