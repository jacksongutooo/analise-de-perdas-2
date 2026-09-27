// Canais simples entre o runtime e a interface da prévia (avisos e visualizador de documentos).
export function channel<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    emit(value: T) {
      for (const l of listeners) l(value);
    },
    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type ViewerFile = { name: string; type: string; blob: Blob };

export type ConfirmRequest = { message: string; confirmLabel?: string; onConfirm: () => void };

export const toasts = channel<string>();
export const confirms = channel<ConfirmRequest>();
export const viewer = channel<ViewerFile | null>();

export function toast(text: string) {
  toasts.emit(text);
}
