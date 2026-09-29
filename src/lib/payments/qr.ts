// QR Code do PIX desenhado a partir do código copia e cola (quando o gateway não devolve a imagem pronta).
import { encode } from "uqr";

/** SVG (data URI) do QR Code, com nível de correção M e margem para a leitura pelo app do banco. */
export function pixQrDataUri(code: string): string {
  const qr = encode(code, { ecc: "M", border: 2 });
  let path = "";
  qr.data.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let run = 1;
      while (row[x + run]) run += 1;
      path += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" shape-rendering="crispEdges">` +
    `<rect width="${qr.size}" height="${qr.size}" fill="#fff"/><path fill="#000" d="${path}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
