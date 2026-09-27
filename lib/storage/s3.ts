import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "@/lib/env";
import { contentDisposition } from "@/lib/files/names";
import type { StorageDriver } from "./types";

// Compatível com AWS S3, Cloudflare R2, Backblaze B2, MinIO e similares.
// O bucket deve ser PRIVADO: a visualização acontece somente por URL assinada de curta duração.
export function createS3Storage(): StorageDriver {
  const { bucket, region, endpoint, accessKeyId, secretAccessKey, forcePathStyle } = config.s3;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Configure S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY para usar STORAGE_DRIVER=s3.");
  }
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
    // Evita cabeçalhos de checksum não suportados por alguns provedores compatíveis com S3.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "private, no-store" }),
      );
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!res.Body) throw new Error("Arquivo não encontrado no armazenamento");
      return Buffer.from(await res.Body.transformToByteArray());
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async signedUrl(key, opts) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: opts.contentType,
        ResponseContentDisposition: contentDisposition(opts.disposition, opts.filename),
        ResponseCacheControl: "private, no-store",
      });
      return getSignedUrl(client, command, { expiresIn: opts.expiresInSeconds ?? 300 });
    },
  };
}
