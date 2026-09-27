export type SignedUrlOptions = {
  filename: string;
  contentType: string;
  disposition: "inline" | "attachment";
  expiresInSeconds?: number;
};

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** URL temporária e assinada para visualização. Nunca é pública ou permanente. */
  signedUrl(key: string, opts: SignedUrlOptions): Promise<string>;
}
