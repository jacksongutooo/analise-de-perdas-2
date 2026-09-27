// Identidade pública do site. Variáveis NEXT_PUBLIC_* podem ser lidas também no navegador.
export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "Análise de Perdas",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME || "",
  cnpj: process.env.NEXT_PUBLIC_COMPANY_CNPJ || "",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
  dpoEmail: process.env.NEXT_PUBLIC_DPO_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
};
