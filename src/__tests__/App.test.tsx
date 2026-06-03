import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "@/App";
import { renderWithProviders, invokeMock } from "@/__tests__/setup";

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_recent_vaults") return Promise.resolve([]);
      if (cmd === "ping") return Promise.resolve("pong");
      return Promise.resolve(null);
    });
  });

  it("renders the empty state when no vault is open", async () => {
    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: /OBSIDIANA/ }),
    ).toBeInTheDocument();
  });

  it("renders the shell with the vault switcher when a vault is open", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_recent_vaults") {
        return Promise.resolve([
          {
            name: "notes",
            path: "/tmp/notes",
            lastOpened: "2024-01-01T00:00:00Z",
            available: true,
          },
        ]);
      }
      if (cmd === "open_vault") return Promise.resolve({ name: "notes", path: "/tmp/notes" });
      if (cmd === "ping") return Promise.resolve("pong");
      return Promise.resolve(null);
    });
    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("vault-switcher")).toBeInTheDocument();
    });
    expect(screen.getByTestId("vault-switcher-toggle")).toHaveTextContent("notes");
  });

  it("does NOT show the dev panel by default", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_recent_vaults") {
        return Promise.resolve([
          {
            name: "notes",
            path: "/tmp/notes",
            lastOpened: "2024-01-01T00:00:00Z",
            available: true,
          },
        ]);
      }
      if (cmd === "open_vault") return Promise.resolve({ name: "notes", path: "/tmp/notes" });
      if (cmd === "ping") return Promise.resolve("pong");
      return Promise.resolve(null);
    });
    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("vault-switcher")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("trigger-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ping-status")).not.toBeInTheDocument();
  });

  it("shows the dev panel with ping and trigger when ?dev=1 and a vault is open", async () => {
    window.history.replaceState({}, "", "/?dev=1");
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_recent_vaults") {
        return Promise.resolve([
          {
            name: "notes",
            path: "/tmp/notes",
            lastOpened: "2024-01-01T00:00:00Z",
            available: true,
          },
        ]);
      }
      if (cmd === "open_vault") return Promise.resolve({ name: "notes", path: "/tmp/notes" });
      if (cmd === "ping") return Promise.resolve("pong");
      if (cmd === "ping_or_fail") {
        return Promise.reject({ kind: "NotFound", data: { what: "ping_or_fail" } });
      }
      return Promise.resolve(null);
    });
    renderWithProviders(<App />);
    const button = await screen.findByTestId("trigger-error");
    await waitFor(() => {
      expect(screen.getByTestId("ping-status")).toBeInTheDocument();
    });
    const user = userEvent.setup();
    await user.click(button);
    await waitFor(() => {
      expect(screen.getByTestId("toast-error")).toBeInTheDocument();
    });
    window.history.replaceState({}, "", "/");
  });
});
