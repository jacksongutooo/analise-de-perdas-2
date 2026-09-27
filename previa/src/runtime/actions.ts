// Ações de servidor na prévia: rodam no navegador e, como no Next.js, redirect() navega e o
// restante atualiza a página atual com os dados novos.
import { getRouter } from "./router-state";
import { NotFoundSignal, RedirectSignal } from "./signals";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function wrapAction<T extends (...args: any[]) => any>(fn: T, name: string): T {
  if (typeof fn !== "function") return fn;
  const wrapped = async (...args: unknown[]) => {
    await pause(150); // latência simulada, para os estados de "carregando" aparecerem
    try {
      const result = await fn(...args);
      await getRouter().refresh();
      return result;
    } catch (error) {
      if (error instanceof RedirectSignal) {
        await getRouter().navigate(error.url, { replace: error.replace });
        return undefined;
      }
      if (error instanceof NotFoundSignal) {
        await getRouter().notFound();
        return undefined;
      }
      throw error;
    }
  };
  Object.defineProperty(wrapped, "name", { value: name });
  return wrapped as unknown as T;
}
