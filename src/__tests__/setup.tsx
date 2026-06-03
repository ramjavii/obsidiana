import "@testing-library/jest-dom/vitest";
import { vi, afterEach, type Mock } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastHost } from "@/components/ToastHost";

export const invokeMock: Mock<(cmd: unknown, args?: unknown) => Promise<unknown>> =
  vi.fn(() => Promise.resolve("pong"));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: unknown, args?: unknown) =>
    invokeMock(cmd, args) as Promise<unknown>,
}));

export function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {ui}
      <ToastHost />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  invokeMock.mockImplementation(() => Promise.resolve("pong"));
});
