import { create } from "zustand";
import type { AppError } from "@/errors";
import { appErrorMessage } from "@/errors";

export type ToastKind = "info" | "success" | "error";

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastState = {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }));
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  clear: () => {
    set({ toasts: [] });
  },
}));

export function reportAppError(err: AppError): void {
  useToastStore.getState().push("error", appErrorMessage(err));
}

export function reportError(message: string): void {
  useToastStore.getState().push("error", message);
}

export function reportInfo(message: string): void {
  useToastStore.getState().push("info", message);
}

export function reportSuccess(message: string): void {
  useToastStore.getState().push("success", message);
}
