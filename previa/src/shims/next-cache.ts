// "next/cache" na prévia: a página é atualizada depois de cada ação, então não há cache a invalidar.
export function revalidatePath() {}
export function revalidateTag() {}
export function unstable_noStore() {}
export function unstable_cache<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}
