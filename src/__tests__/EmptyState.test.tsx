import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invokeMock } from "@/__tests__/setup";
import { EmptyState } from "@/components/EmptyState";
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

describe("EmptyState", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("renders the title and the open vault button", () => {
    invokeMock.mockImplementation(() => Promise.resolve([]));
    renderWithQuery(<EmptyState />);
    expect(
      screen.getByRole("heading", { name: /OBSIDIANA/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("open-vault-button")).toBeInTheDocument();
  });

  it("invokes pick_vault when the button is clicked", async () => {
    let pickCalled = 0;
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "pick_vault") {
        pickCalled += 1;
        return Promise.resolve(null);
      }
      if (cmd === "list_recent_vaults") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQuery(<EmptyState />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("open-vault-button"));
    await waitFor(() => {
      expect(pickCalled).toBe(1);
    });
  });

  it("surfaces an inline error when pick_vault rejects", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "pick_vault") {
        return Promise.reject({
          kind: "NotFound",
          data: { what: "no dialog" },
        });
      }
      if (cmd === "list_recent_vaults") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQuery(<EmptyState />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("open-vault-button"));
    await waitFor(() => {
      expect(screen.getByTestId("empty-state-error")).toBeInTheDocument();
    });
  });
});

vi.mock("@/hooks/useToastStore", () => ({
  reportAppError: vi.fn(),
  reportError: vi.fn(),
  reportInfo: vi.fn(),
  reportSuccess: vi.fn(),
}));
