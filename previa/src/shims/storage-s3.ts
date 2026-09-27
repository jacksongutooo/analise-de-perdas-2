// A prévia não usa S3.
export function createS3Storage(): never {
  throw new Error("Armazenamento S3 indisponível na prévia.");
}
