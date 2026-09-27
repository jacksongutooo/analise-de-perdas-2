import { ImageResponse } from "next/og";
import { config } from "@/lib/env";
import { site } from "@/lib/site";

// Imagem exibida quando o link do site é compartilhado (WhatsApp, redes sociais).
// Usa o nome configurado em NEXT_PUBLIC_SITE_NAME, então acompanha a marca automaticamente.
export const alt = "Análise documental de perdas em apostas online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#f3f5f8",
          color: "#0e2240",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#0e2240",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 14l2 2 4-4" />
            </svg>
          </div>
          <div style={{ display: "flex", marginLeft: 20, fontSize: 34, fontWeight: 600 }}>{site.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 80, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Teve perdas em apostas online?</div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 34, color: "#3a4658" }}>
            {`Envie seu ComprovaBet ${config.comprovabetYear} para uma análise documental do seu caso.`}
          </div>
        </div>
        <div style={{ display: "flex", paddingTop: 28, borderTop: "2px solid #c5ced9", fontSize: 26, color: "#6a7585" }}>
          {"100% online • Análise documental • Acompanhamento em todas as etapas"}
        </div>
      </div>
    ),
    size,
  );
}
