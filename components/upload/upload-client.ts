// Utilitários de envio no navegador: validação prévia, compressão de imagens grandes e progresso.

export const ACCEPTED_EXTENSIONS = ["pdf", "csv", "xlsx", "jpg", "jpeg", "png"];
export const ACCEPT_ATTRIBUTE =
  ".pdf,.csv,.xlsx,.jpg,.jpeg,.png,application/pdf,text/csv,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function tempId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function preflightError(
  file: File,
  allowed: string[] = ACCEPTED_EXTENSIONS,
  message = "Formato não aceito. Envie PDF, CSV, XLSX, JPG ou PNG.",
): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.includes(ext)) return message;
  if (file.size === 0) return "O arquivo está vazio.";
  return null;
}

/** Reduz fotos/prints acima do limite (mantendo legibilidade) para caber no envio. */
export async function shrinkImageIfNeeded(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes || !/^image\/(jpeg|png)$/.test(file.type) || typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const attempts: [number, number][] = [
    [2600, 0.86],
    [2000, 0.8],
    [1600, 0.74],
  ];
  for (const [maxSide, quality] of attempts) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) {
      return new File([blob], `${file.name.replace(/\.(png|jpe?g)$/i, "")}.jpg`, { type: "image/jpeg" });
    }
  }
  return file;
}

export type UploadResponse = { status: number; body: { file?: unknown; error?: string; field?: string } };

export function uploadWithProgress(
  url: string,
  form: FormData,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      let body: UploadResponse["body"] = {};
      try {
        body = JSON.parse(xhr.responseText) as UploadResponse["body"];
      } catch {
        body = { error: xhr.status === 413 ? "Arquivo grande demais para envio." : undefined };
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ status: 0, body: { error: "Falha de conexão. Verifique sua internet e tente novamente." } });
    xhr.send(form);
  });
}
