import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invokeMock } from "@/__tests__/setup";
import { VaultSwitcher } from "@/components/VaultSwitcher";
import { ToastHost } from "@/components/ToastHost";
import type { ReactNode } from "react";

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {ui}
      <ToastHost />
    </QueryClientProvider>,
  );
}

describe("VaultSwitcher", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows the current vault name on the toggle", () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_recent_vaults") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQuery(<VaultSwitcher vault={{ name: "my-vault", path: "/tmp/my-vault" }} />);
    expect(screen.getByTestId("vault-switcher-toggle")).toHaveTextContent("my-vault");
  });

  it("opens the menu on toggle click and lists recents", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_recent_vaults") {
        return Promise.resolve([
          {
            name: "my-vault",
            path: "/tmp/my-vault",
            lastOpened: "2024-01-01T00:00:00Z",
            available: true,
          },
          {
            name: "old",
            path: "/tmp/old",
            lastOpened: "2023-12-01T00:00:00Z",
            available: true,
          },
        ]);
      }
      return Promise.resolve(null);
    });
    renderWithQuery(<VaultSwitcher vault={{ name: "my-vault", path: "/tmp/my-vault" }} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("vault-switcher-toggle"));
    const menu = await screen.findByTestId("vault-switcher-menu");
    expect(within(menu).getByTestId("current-vault-name")).toHaveTextContent("my-vault");
    expect(within(menu).getByTestId("recent-old")).toBeInTheDocument();
  });

  it("calls close_vault when the close button is clicked", async () => {
    let closeCalled = 0;
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "close_vault") {
        closeCalled += 1;
        return Promise.resolve(null);
      }
      if (cmd === "list_recent_vaults") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQuery(<VaultSwitcher vault={{ name: "x", path: "/x" }} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("vault-switcher-toggle"));
    await user.click(screen.getByTestId("close-vault"));
    await waitFor(() => {
      expect(closeCalled).toBe(1);
    });
  });

  it("calls open_vault_force when a recent is clicked", async () => {
    let forceCalledWith: string | null = null;
    invokeMock.mockImplementation((cmd: unknown, args?: unknown) => {
      if (cmd === "list_recent_vaults") {
        return Promise.resolve([
          {
            name: "x",
            path: "/x",
            lastOpened: "2024-01-01T00:00:00Z",
            available: true,
          },
          {
            name: "other",
            path: "/other",
            lastOpened: "2024-01-01T00:00:00Z",
            available: true,
          },
        ]);
      }
      if (cmd === "open_vault_force") {
        const path = (args as { path?: string } | undefined)?.path ?? null;
        forceCalledWith = path;
        return Promise.resolve({ name: "other", path: path ?? "" });
      }
      return Promise.resolve(null);
    });
    renderWithQuery(<VaultSwitcher vault={{ name: "x", path: "/x" }} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("vault-switcher-toggle"));
    await user.click(screen.getByTestId("recent-other"));
    await waitFor(() => {
      expect(forceCalledWith).toBe("/other");
    });
  });
});

vi.mock("@/hooks/useToastStore", () => ({
  reportAppError: vi.fn(),
  reportError: vi.fn(),
  reportInfo: vi.fn(),
  reportSuccess: vi.fn(),
}));
