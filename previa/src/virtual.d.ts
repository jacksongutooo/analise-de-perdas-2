declare module "previa:dmmf" {
  const datamodel: unknown;
  export default datamodel;
}
declare module "previa:routes" {
  type Mod = Record<string, any>;
  export const rootLayout: Mod;
  export const notFoundPage: Mod;
  export const errorPages: { path: string; mod: Mod }[];
  export const pages: { path: string; page: Mod; layouts: Mod[] }[];
  export const apis: { path: string; mod: Mod }[];
}
