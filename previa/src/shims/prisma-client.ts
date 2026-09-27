// "@prisma/client" na prévia: só os valores usados em tempo de execução (tipos somem no build).
export class PrismaClientKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;
  clientVersion: string;
  constructor(message: string, opts: { code: string; clientVersion: string; meta?: Record<string, unknown> }) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = opts.code;
    this.meta = opts.meta;
    this.clientVersion = opts.clientVersion;
  }
}

/** Marcadores de nulo dos campos JSON (Prisma.DbNull etc.): o banco simulado grava null. */
const nullMarker = (name: string) => Object.freeze({ __previaNull: name });
export const DbNull = nullMarker("DbNull");
export const JsonNull = nullMarker("JsonNull");
export const AnyNull = nullMarker("AnyNull");

export const Prisma = { PrismaClientKnownRequestError, DbNull, JsonNull, AnyNull };

export class PrismaClient {
  constructor() {
    throw new Error("Na prévia, o banco é simulado: use @/lib/db.");
  }
}
