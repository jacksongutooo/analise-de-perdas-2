// Banco de dados simulado para a prévia: interpreta, em memória, o subconjunto da API do Prisma usado
// pelo site (consultas com where/select/include/orderBy, _count, groupBy, aggregate, gravações aninhadas,
// exclusão em cascata e transações). O esquema vem do DMMF gerado pelo próprio Prisma no build da prévia.
// Os dados ficam salvos no navegador (localStorage), nunca saem dele.
import dmmf from "previa:dmmf";
import { PrismaClientKnownRequestError } from "./prisma-client";

type Field = {
  name: string;
  kind: "scalar" | "object" | "enum" | "unsupported";
  type: string;
  isList: boolean;
  isRequired: boolean;
  isId: boolean;
  isUnique: boolean;
  isUpdatedAt: boolean;
  hasDefaultValue: boolean;
  default?: unknown;
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
  relationOnDelete?: string;
};
type Model = {
  name: string;
  fields: Field[];
  primaryKey: { fields: string[] } | null;
  uniqueFields: string[][];
  fieldMap: Record<string, Field>;
  uniques: string[][];
};
type Row = Record<string, any>;
type Args = Record<string, any> | undefined;

const MODELS: Record<string, Model> = {};
for (const m of (dmmf as any).models as Omit<Model, "fieldMap" | "uniques">[]) {
  const fieldMap = Object.fromEntries(m.fields.map((f) => [f.name, f]));
  const uniques = [
    ...m.fields.filter((f) => f.isId || f.isUnique).map((f) => [f.name]),
    ...(m.primaryKey ? [m.primaryKey.fields] : []),
    ...m.uniqueFields,
  ];
  MODELS[m.name] = { ...m, fieldMap, uniques };
}

// ─── Estado e persistência ────────────────────────────────────────────────
let db: Record<string, Row[]> = {};
export const STORAGE_KEY = "previa-analise:db:v3";
let saveScheduled = false;
let autoincrement = 1;

function emptyDb() {
  return Object.fromEntries(Object.keys(MODELS).map((name) => [name, [] as Row[]]));
}
db = emptyDb();

function serialize(): string {
  return JSON.stringify({ db, autoincrement }, function (this: any, key, value) {
    const original = this[key];
    return original instanceof Date ? { $d: original.toISOString() } : value;
  });
}

function revive(raw: string) {
  return JSON.parse(raw, (_key, value) => (value && typeof value === "object" && typeof value.$d === "string" ? new Date(value.$d) : value));
}

export function loadDb(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = revive(raw);
    db = { ...emptyDb(), ...parsed.db };
    autoincrement = parsed.autoincrement ?? 1;
    return true;
  } catch {
    return false;
  }
}

function scheduleSave() {
  if (saveScheduled) return;
  saveScheduled = true;
  setTimeout(() => {
    saveScheduled = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, serialize());
    } catch {
      /* armazenamento indisponível: a prévia segue só em memória */
    }
  }, 0);
}

export function resetDb() {
  db = emptyDb();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ─── Valores ──────────────────────────────────────────────────────────────
function cuid(): string {
  const time = Date.now().toString(36);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join("");
  return `c${time}${rand}`.slice(0, 25);
}

function clone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (typeof value === "object") return structuredClone(value);
  return value;
}

function normalize(field: Field, value: any): any {
  if (value === null || value === undefined) return value ?? null;
  if (field.isList) return Array.isArray(value) ? value.map((v) => normalize({ ...field, isList: false }, v)) : [normalize({ ...field, isList: false }, value)];
  switch (field.type) {
    case "DateTime":
      return value instanceof Date ? new Date(value.getTime()) : new Date(value);
    case "Decimal": {
      const n = Number(typeof value === "object" ? value.toString() : value);
      if (!Number.isFinite(n)) throw new Error(`Valor decimal inválido em ${field.name}: ${value}`);
      return String(value);
    }
    case "Int":
    case "BigInt":
    case "Float":
      return Number(value);
    case "Boolean":
      return Boolean(value);
    case "Json":
      // Prisma.DbNull / JsonNull (marcadores do shim de @prisma/client) viram null.
      if (typeof value === "object" && "__previaNull" in value) return null;
      return structuredClone(value);
    default:
      return value;
  }
}

function defaultFor(field: Field): any {
  if (field.isUpdatedAt) return new Date();
  if (!field.hasDefaultValue) return field.isList ? [] : null;
  const d = field.default as any;
  if (d && typeof d === "object" && !Array.isArray(d) && "name" in d) {
    switch (d.name) {
      case "cuid":
        return cuid();
      case "uuid":
        return crypto.randomUUID();
      case "now":
        return new Date();
      case "autoincrement":
        return autoincrement++;
      default:
        return null;
    }
  }
  return clone(d);
}

const num = (v: any) => Number(typeof v === "object" && v !== null && !(v instanceof Date) ? v.toString() : v);

function comparable(field: Field | undefined, value: any): any {
  if (value instanceof Date) return value.getTime();
  if (field?.type === "Decimal" || field?.type === "Float" || field?.type === "Int") return num(value);
  if (field?.type === "DateTime" && value !== null && value !== undefined) return new Date(value).getTime();
  return value;
}

function eq(field: Field, a: any, b: any, insensitive = false): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  if (insensitive && typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  return comparable(field, a) === comparable(field, normalize(field, b));
}

// ─── Relações ─────────────────────────────────────────────────────────────
function opposite(model: Model, field: Field): Field {
  const target = MODELS[field.type]!;
  const found = target.fields.find((f) => f.kind === "object" && f.relationName === field.relationName && (target !== model || f.name !== field.name));
  if (!found) throw new Error(`Relação sem contraparte: ${model.name}.${field.name}`);
  return found;
}

function related(model: Model, row: Row, field: Field): Row[] | Row | null {
  const target = MODELS[field.type]!;
  let from: string[];
  let to: string[];
  let rowKeys: string[];
  if (field.relationFromFields?.length) {
    // A chave estrangeira está nesta tabela.
    from = field.relationToFields!;
    rowKeys = field.relationFromFields;
    to = from;
  } else {
    const opp = opposite(model, field);
    to = opp.relationFromFields!;
    rowKeys = opp.relationToFields!;
    from = to;
  }
  const values = rowKeys.map((k) => row[k]);
  if (values.some((v) => v === null || v === undefined)) return field.isList ? [] : null;
  const matches = (r: Row) => from.every((k, i) => r[k] === values[i]);
  if (field.isList) return db[target.name]!.filter(matches);
  return db[target.name]!.find(matches) ?? null;
}

// ─── Filtros ──────────────────────────────────────────────────────────────
function matchScalar(field: Field, value: any, cond: any): boolean {
  if (cond === undefined) return true;
  if (cond === null) return value === null || value === undefined;
  if (typeof cond !== "object" || cond instanceof Date || Array.isArray(cond)) return eq(field, value, cond);
  const insensitive = cond.mode === "insensitive";
  const text = (v: any) => (insensitive ? String(v).toLowerCase() : String(v));
  for (const [op, arg] of Object.entries(cond)) {
    if (arg === undefined || op === "mode") continue;
    switch (op) {
      case "equals":
        if (arg === null ? value != null : value == null || !eq(field, value, arg, insensitive)) return false;
        break;
      case "not":
        if (arg === null) {
          if (value == null) return false;
        } else if (typeof arg === "object" && !(arg instanceof Date) && !Array.isArray(arg)) {
          if (value == null || matchScalar(field, value, arg)) return false;
        } else if (value == null || eq(field, value, arg, insensitive)) return false;
        break;
      case "in":
        if (value == null || !(arg as any[]).some((a) => eq(field, value, a, insensitive))) return false;
        break;
      case "notIn":
        if (value == null || (arg as any[]).some((a) => eq(field, value, a, insensitive))) return false;
        break;
      case "lt":
      case "lte":
      case "gt":
      case "gte": {
        if (value == null) return false;
        const a = comparable(field, value);
        const b = comparable(field, normalize(field, arg));
        if (op === "lt" && !(a < b)) return false;
        if (op === "lte" && !(a <= b)) return false;
        if (op === "gt" && !(a > b)) return false;
        if (op === "gte" && !(a >= b)) return false;
        break;
      }
      case "contains":
        if (value == null || !text(value).includes(text(arg))) return false;
        break;
      case "startsWith":
        if (value == null || !text(value).startsWith(text(arg))) return false;
        break;
      case "endsWith":
        if (value == null || !text(value).endsWith(text(arg))) return false;
        break;
      case "has":
        if (!Array.isArray(value) || !value.includes(arg)) return false;
        break;
      case "hasSome":
        if (!Array.isArray(value) || !(arg as any[]).some((a) => value.includes(a))) return false;
        break;
      case "hasEvery":
        if (!Array.isArray(value) || !(arg as any[]).every((a) => value.includes(a))) return false;
        break;
      case "isEmpty":
        if (!Array.isArray(value) || (value.length === 0) !== arg) return false;
        break;
      default:
        throw new Error(`Filtro "${op}" não suportado na prévia (${field.name}).`);
    }
  }
  return true;
}

function matches(model: Model, row: Row, where: Args): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === "AND") {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.every((w) => matches(model, row, w))) return false;
      continue;
    }
    if (key === "OR") {
      if (!(cond as Args[]).some((w) => matches(model, row, w))) return false;
      continue;
    }
    if (key === "NOT") {
      const list = Array.isArray(cond) ? cond : [cond];
      if (list.some((w) => matches(model, row, w))) return false;
      continue;
    }
    const field = model.fieldMap[key];
    if (!field) {
      // Chave composta (ex.: caseId_platformId).
      if (cond && typeof cond === "object" && key.includes("_")) {
        if (!matches(model, row, cond)) return false;
        continue;
      }
      throw new Error(`Campo desconhecido na prévia: ${model.name}.${key}`);
    }
    if (field.kind === "object") {
      const target = MODELS[field.type]!;
      const rel = related(model, row, field);
      if (field.isList) {
        const list = rel as Row[];
        if (cond.some !== undefined && !list.some((r) => matches(target, r, cond.some))) return false;
        if (cond.none !== undefined && list.some((r) => matches(target, r, cond.none))) return false;
        if (cond.every !== undefined && !list.every((r) => matches(target, r, cond.every))) return false;
      } else {
        const one = rel as Row | null;
        if (cond === null) {
          if (one) return false;
        } else if ("is" in cond || "isNot" in cond) {
          if (cond.is === null && one) return false;
          if (cond.is && (!one || !matches(target, one, cond.is))) return false;
          if (cond.isNot === null && !one) return false;
          if (cond.isNot && one && matches(target, one, cond.isNot)) return false;
        } else if (!one || !matches(target, one, cond)) return false;
      }
      continue;
    }
    if (!matchScalar(field, row[key], cond)) return false;
  }
  return true;
}

// ─── Ordenação, paginação e projeção ─────────────────────────────────────
function orderValue(model: Model, row: Row, spec: Record<string, any>): { value: any; dir: string; nulls?: string } {
  const [key, dir] = Object.entries(spec)[0]!;
  const field = model.fieldMap[key];
  if (field?.kind === "object") {
    const one = related(model, row, field) as Row | null;
    return one ? orderValue(MODELS[field.type]!, one, dir) : { value: null, dir: Object.values(dir)[0] as string };
  }
  if (dir && typeof dir === "object") return { value: comparable(field, row[key]), dir: dir.sort, nulls: dir.nulls };
  return { value: comparable(field, row[key]), dir };
}

function sortRows(model: Model, rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const specs = (Array.isArray(orderBy) ? orderBy : [orderBy]).filter((s) => s && Object.keys(s).length);
  if (!specs.length) return rows;
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const va = orderValue(model, a, spec);
      const vb = orderValue(model, b, spec);
      const desc = va.dir === "desc";
      const aNull = va.value === null || va.value === undefined;
      const bNull = vb.value === null || vb.value === undefined;
      if (aNull || bNull) {
        if (aNull && bNull) continue;
        // PostgreSQL: nulos por último em ASC e primeiro em DESC.
        const nullsFirst = va.nulls ? va.nulls === "first" : desc;
        return aNull === nullsFirst ? -1 : 1;
      }
      if (va.value < vb.value) return desc ? 1 : -1;
      if (va.value > vb.value) return desc ? -1 : 1;
    }
    return 0;
  });
}

function paginate(rows: Row[], skip?: number, take?: number): Row[] {
  const start = skip ?? 0;
  if (take === undefined) return rows.slice(start);
  return take >= 0 ? rows.slice(start, start + take) : rows.slice(Math.max(0, rows.length + take - start), rows.length - start);
}

function countRelations(model: Model, row: Row, spec: any): Record<string, number> {
  const out: Record<string, number> = {};
  const select = spec === true ? Object.fromEntries(model.fields.filter((f) => f.kind === "object" && f.isList).map((f) => [f.name, true])) : spec.select;
  for (const [key, val] of Object.entries(select ?? {})) {
    if (!val) continue;
    const field = model.fieldMap[key]!;
    const list = related(model, row, field) as Row[];
    const where = typeof val === "object" ? (val as any).where : undefined;
    out[key] = where ? list.filter((r) => matches(MODELS[field.type]!, r, where)).length : list.length;
  }
  return out;
}

function projectRelation(model: Model, row: Row, field: Field, args: any): any {
  const target = MODELS[field.type]!;
  const opts = args === true ? {} : args;
  const rel = related(model, row, field);
  if (field.isList) {
    let list = (rel as Row[]).filter((r) => matches(target, r, opts.where));
    list = paginate(sortRows(target, list, opts.orderBy), opts.skip, opts.take);
    return list.map((r) => project(target, r, opts));
  }
  return rel ? project(target, rel as Row, opts) : null;
}

function project(model: Model, row: Row, args: Args): Row {
  const out: Row = {};
  if (args?.select) {
    for (const [key, val] of Object.entries(args.select)) {
      if (!val) continue;
      if (key === "_count") {
        out._count = countRelations(model, row, val);
        continue;
      }
      const field = model.fieldMap[key];
      if (!field) throw new Error(`Campo desconhecido na prévia: ${model.name}.${key}`);
      out[key] = field.kind === "object" ? projectRelation(model, row, field, val) : clone(row[key]);
    }
    return out;
  }
  for (const f of model.fields) if (f.kind !== "object") out[f.name] = clone(row[f.name]);
  for (const [key, val] of Object.entries(args?.include ?? {})) {
    if (!val) continue;
    if (key === "_count") {
      out._count = countRelations(model, row, val);
      continue;
    }
    const field = model.fieldMap[key];
    if (!field) throw new Error(`Relação desconhecida na prévia: ${model.name}.${key}`);
    out[key] = projectRelation(model, row, field, val);
  }
  return out;
}

// ─── Gravações ───────────────────────────────────────────────────────────
function knownError(message: string, code: string, meta?: Record<string, unknown>) {
  return new PrismaClientKnownRequestError(message, { code, clientVersion: "previa", meta });
}

function checkUnique(model: Model, row: Row) {
  for (const fields of model.uniques) {
    if (fields.some((f) => row[f] === null || row[f] === undefined)) continue;
    const clash = db[model.name]!.find((r) => r !== row && fields.every((f) => eq(model.fieldMap[f]!, r[f], row[f])));
    if (clash) throw knownError(`Unique constraint failed on the fields: (${fields.join(",")})`, "P2002", { target: fields });
  }
}

function applyScalar(field: Field, current: any, value: any): any {
  if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value) && field.type !== "Json") {
    if ("set" in value) return normalize(field, value.set);
    if ("increment" in value) return num(current ?? 0) + num(value.increment);
    if ("decrement" in value) return num(current ?? 0) - num(value.decrement);
    if ("multiply" in value) return num(current ?? 0) * num(value.multiply);
    if ("divide" in value) return num(current ?? 0) / num(value.divide);
    if ("push" in value) return [...(current ?? []), ...(Array.isArray(value.push) ? value.push : [value.push])];
    if (field.type === "Decimal") return normalize(field, value);
    throw new Error(`Operação não suportada na prévia em ${field.name}.`);
  }
  return normalize(field, value);
}

function linkChild(model: Model, parent: Row, field: Field): Row {
  // Campos da chave estrangeira do filho que apontam para o registro pai.
  const opp = opposite(model, field);
  return Object.fromEntries(opp.relationFromFields!.map((k, i) => [k, parent[opp.relationToFields![i]!]]));
}

function findUniqueRow(model: Model, where: Args): Row | undefined {
  return db[model.name]!.find((r) => matches(model, r, where));
}

function createRow(model: Model, data: Row): Row {
  const row: Row = {};
  const nested: (() => void)[] = [];
  for (const f of model.fields) if (f.kind !== "object") row[f.name] = defaultFor(f);
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const field = model.fieldMap[key];
    if (!field) throw new Error(`Campo desconhecido na prévia: ${model.name}.${key}`);
    if (field.kind !== "object") {
      row[key] = applyScalar(field, undefined, value);
      continue;
    }
    const target = MODELS[field.type]!;
    if (field.relationFromFields?.length) {
      // Relação com a chave estrangeira aqui: conectar ou criar o registro relacionado antes.
      let parent: Row | undefined;
      if (value.connect) parent = findUniqueRow(target, value.connect);
      else if (value.create) parent = createRow(target, value.create);
      else if (value.connectOrCreate) parent = findUniqueRow(target, value.connectOrCreate.where) ?? createRow(target, value.connectOrCreate.create);
      if (!parent) throw knownError(`Registro relacionado não encontrado: ${model.name}.${key}`, "P2025");
      field.relationFromFields.forEach((k, i) => (row[k] = parent![field.relationToFields![i]!]));
      continue;
    }
    // Relação do outro lado: cria os filhos depois do registro principal.
    nested.push(() => {
      const children = value.create ? (Array.isArray(value.create) ? value.create : [value.create]) : [];
      const many = value.createMany ? (Array.isArray(value.createMany.data) ? value.createMany.data : [value.createMany.data]) : [];
      for (const child of [...children, ...many]) createRow(target, { ...child, ...linkChild(model, row, field) });
      const connects = value.connect ? (Array.isArray(value.connect) ? value.connect : [value.connect]) : [];
      for (const where of connects) {
        const child = findUniqueRow(target, where);
        if (!child) throw knownError(`Registro relacionado não encontrado: ${model.name}.${key}`, "P2025");
        Object.assign(child, linkChild(model, row, field));
      }
    });
  }
  for (const f of model.fields) {
    if (f.kind !== "object" && f.isRequired && !f.isList && (row[f.name] === null || row[f.name] === undefined)) {
      throw new Error(`Campo obrigatório ausente na prévia: ${model.name}.${f.name}`);
    }
  }
  checkUnique(model, row);
  db[model.name]!.push(row);
  for (const run of nested) run();
  return row;
}

function updateRow(model: Model, row: Row, data: Row) {
  const before = { ...row };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const field = model.fieldMap[key];
    if (!field) throw new Error(`Campo desconhecido na prévia: ${model.name}.${key}`);
    if (field.kind !== "object") {
      row[key] = applyScalar(field, row[key], value);
      continue;
    }
    const target = MODELS[field.type]!;
    if (field.relationFromFields?.length) {
      if (value.connect) {
        const parent = findUniqueRow(target, value.connect);
        if (!parent) throw knownError(`Registro relacionado não encontrado: ${model.name}.${key}`, "P2025");
        field.relationFromFields.forEach((k, i) => (row[k] = parent[field.relationToFields![i]!]));
      } else if (value.disconnect) {
        field.relationFromFields.forEach((k) => (row[k] = null));
      } else if (value.update) {
        const parent = related(model, row, field) as Row | null;
        if (parent) updateRow(target, parent, value.update);
      } else if (value.create) {
        const parent = createRow(target, value.create);
        field.relationFromFields.forEach((k, i) => (row[k] = parent[field.relationToFields![i]!]));
      } else throw new Error(`Gravação aninhada não suportada na prévia: ${model.name}.${key}`);
      continue;
    }
    if (value.create || value.createMany) {
      const children = value.create ? (Array.isArray(value.create) ? value.create : [value.create]) : [];
      const many = value.createMany ? (Array.isArray(value.createMany.data) ? value.createMany.data : [value.createMany.data]) : [];
      for (const child of [...children, ...many]) createRow(target, { ...child, ...linkChild(model, row, field) });
    }
    if (value.deleteMany) {
      const link = linkChild(model, row, field);
      const where = value.deleteMany === true ? {} : value.deleteMany;
      for (const child of db[target.name]!.filter((r) => Object.entries(link).every(([k, v]) => r[k] === v) && matches(target, r, where))) deleteRow(target, child);
    }
    if (value.update && !value.create) {
      const child = (related(model, row, field) as Row | null) ?? null;
      if (child && !field.isList) updateRow(target, child, value.update);
    }
  }
  for (const f of model.fields) if (f.isUpdatedAt && !("updatedAt" in data)) row[f.name] = new Date();
  try {
    checkUnique(model, row);
  } catch (error) {
    Object.assign(row, before);
    throw error;
  }
}

function deleteRow(model: Model, row: Row) {
  // Ações referenciais: Cascade, SetNull ou Restrict (padrão do Prisma para relações obrigatórias).
  for (const other of Object.values(MODELS)) {
    for (const f of other.fields) {
      if (f.kind !== "object" || f.type !== model.name || !f.relationFromFields?.length) continue;
      const children = db[other.name]!.filter((r) => f.relationFromFields!.every((k, i) => r[k] === row[f.relationToFields![i]!]));
      if (!children.length) continue;
      const action = f.relationOnDelete ?? (f.isRequired ? "Restrict" : "SetNull");
      if (action === "Cascade") for (const child of children) deleteRow(other, child);
      else if (action === "SetNull") for (const child of children) for (const k of f.relationFromFields) child[k] = null;
      else throw knownError(`Foreign key constraint failed: ${other.name}.${f.name}`, "P2003");
    }
  }
  const list = db[model.name]!;
  const index = list.indexOf(row);
  if (index >= 0) list.splice(index, 1);
}

// ─── Agregações ──────────────────────────────────────────────────────────
function aggregateRows(model: Model, rows: Row[], args: any): Row {
  const out: Row = {};
  const numeric = (field: string) => rows.map((r) => r[field]).filter((v) => v !== null && v !== undefined).map(num);
  const asType = (field: string, value: number | null) =>
    value === null ? null : model.fieldMap[field]?.type === "Decimal" ? value.toFixed(Number.isInteger(value * 100) ? 2 : 6) : value;
  if (args._count) {
    out._count = {};
    const spec = args._count === true ? { _all: true } : args._count;
    for (const [key, on] of Object.entries(spec)) {
      if (!on) continue;
      out._count[key] = key === "_all" ? rows.length : rows.filter((r) => r[key] !== null && r[key] !== undefined).length;
    }
    if (args._count === true) out._count = rows.length;
  }
  for (const kind of ["_sum", "_avg", "_min", "_max"] as const) {
    if (!args[kind]) continue;
    out[kind] = {};
    for (const [key, on] of Object.entries(args[kind])) {
      if (!on) continue;
      const values = numeric(key);
      let value: number | null = null;
      if (values.length) {
        if (kind === "_sum") value = values.reduce((a, b) => a + b, 0);
        if (kind === "_avg") value = values.reduce((a, b) => a + b, 0) / values.length;
        if (kind === "_min") value = Math.min(...values);
        if (kind === "_max") value = Math.max(...values);
      }
      out[kind][key] = kind === "_avg" && model.fieldMap[key]?.type !== "Decimal" ? value : asType(key, value);
    }
  }
  return out;
}

// ─── Cliente ─────────────────────────────────────────────────────────────
type Lazy<T> = PromiseLike<T> & { catch: Promise<T>["catch"]; finally: Promise<T>["finally"] };

function lazy<T>(run: () => T | Promise<T>): Lazy<T> {
  let promise: Promise<T> | null = null;
  const exec = () => (promise ??= Promise.resolve().then(run));
  return {
    then: (ok, fail) => exec().then(ok, fail),
    catch: (fail) => exec().catch(fail),
    finally: (fn) => exec().finally(fn),
    [Symbol.toStringTag]: "PrismaPromise",
  } as Lazy<T>;
}

function write<T>(run: () => T): Lazy<T> {
  return lazy(() => {
    const result = run();
    scheduleSave();
    return result;
  });
}

function delegate(model: Model) {
  const rows = () => db[model.name]!;
  const find = (args: Args) => sortRows(model, rows().filter((r) => matches(model, r, args?.where)), args?.orderBy);
  const notFound = () => knownError(`No ${model.name} found`, "P2025");
  return {
    findUnique: (args: Args) => lazy(() => {
      const row = findUniqueRow(model, args?.where);
      return row ? project(model, row, args) : null;
    }),
    findUniqueOrThrow: (args: Args) => lazy(() => {
      const row = findUniqueRow(model, args?.where);
      if (!row) throw notFound();
      return project(model, row, args);
    }),
    findFirst: (args: Args) => lazy(() => {
      const row = paginate(find(args), args?.skip, 1)[0];
      return row ? project(model, row, args) : null;
    }),
    findFirstOrThrow: (args: Args) => lazy(() => {
      const row = paginate(find(args), args?.skip, 1)[0];
      if (!row) throw notFound();
      return project(model, row, args);
    }),
    findMany: (args: Args) => lazy(() => paginate(find(args), args?.skip, args?.take).map((r) => project(model, r, args))),
    count: (args: Args) => lazy(() => rows().filter((r) => matches(model, r, args?.where)).length),
    create: (args: Args) => write(() => project(model, createRow(model, args!.data), args)),
    createMany: (args: Args) =>
      write(() => {
        const list = Array.isArray(args!.data) ? args!.data : [args!.data];
        for (const data of list) createRow(model, data);
        return { count: list.length };
      }),
    update: (args: Args) =>
      write(() => {
        const row = findUniqueRow(model, args!.where);
        if (!row) throw notFound();
        updateRow(model, row, args!.data);
        return project(model, row, args);
      }),
    updateMany: (args: Args) =>
      write(() => {
        const list = rows().filter((r) => matches(model, r, args?.where));
        for (const row of list) updateRow(model, row, args!.data);
        return { count: list.length };
      }),
    upsert: (args: Args) =>
      write(() => {
        const row = findUniqueRow(model, args!.where);
        if (row) {
          updateRow(model, row, args!.update);
          return project(model, row, args);
        }
        return project(model, createRow(model, args!.create), args);
      }),
    delete: (args: Args) =>
      write(() => {
        const row = findUniqueRow(model, args!.where);
        if (!row) throw notFound();
        const result = project(model, row, args);
        deleteRow(model, row);
        return result;
      }),
    deleteMany: (args: Args) =>
      write(() => {
        const list = rows().filter((r) => matches(model, r, args?.where));
        for (const row of list) deleteRow(model, row);
        return { count: list.length };
      }),
    aggregate: (args: Args) => lazy(() => aggregateRows(model, rows().filter((r) => matches(model, r, args?.where)), args ?? {})),
    groupBy: (args: Args) =>
      lazy(() => {
        const by: string[] = Array.isArray(args!.by) ? args!.by : [args!.by];
        const groups = new Map<string, Row[]>();
        for (const row of rows().filter((r) => matches(model, r, args?.where))) {
          const key = JSON.stringify(by.map((f) => row[f] ?? null));
          groups.set(key, [...(groups.get(key) ?? []), row]);
        }
        let result = [...groups.values()].map((list) => ({
          ...Object.fromEntries(by.map((f) => [f, clone(list[0]![f])])),
          ...aggregateRows(model, list, args!),
        }));
        const specs = args!.orderBy ? (Array.isArray(args!.orderBy) ? args!.orderBy : [args!.orderBy]) : [];
        if (specs.length) {
          result = result.sort((a, b) => {
            for (const spec of specs) {
              const [key, dir] = Object.entries(spec)[0]!;
              let va: any;
              let vb: any;
              let direction = dir as string;
              if (key.startsWith("_")) {
                const [field, d] = Object.entries(dir as Record<string, string>)[0]!;
                va = (a as any)[key]?.[field];
                vb = (b as any)[key]?.[field];
                direction = d;
              } else {
                va = comparable(model.fieldMap[key], (a as any)[key]);
                vb = comparable(model.fieldMap[key], (b as any)[key]);
              }
              if (va < vb) return direction === "desc" ? 1 : -1;
              if (va > vb) return direction === "desc" ? -1 : 1;
            }
            return 0;
          });
        }
        return paginate(result, args!.skip, args!.take);
      }),
  };
}

function snapshot() {
  return { db: structuredClone(db), autoincrement };
}

function restore(state: ReturnType<typeof snapshot>) {
  db = state.db;
  autoincrement = state.autoincrement;
}

const delegates = Object.fromEntries(Object.values(MODELS).map((m) => [m.name[0]!.toLowerCase() + m.name.slice(1), delegate(m)]));

export const prisma: any = {
  ...delegates,
  async $transaction(arg: any) {
    const saved = snapshot();
    try {
      if (typeof arg === "function") return await arg(prisma);
      const results = [];
      for (const op of arg as PromiseLike<unknown>[]) results.push(await op);
      return results;
    } catch (error) {
      restore(saved);
      throw error;
    } finally {
      scheduleSave();
    }
  },
  async $connect() {},
  async $disconnect() {},
};
