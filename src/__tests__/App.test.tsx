import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "@/App";
import { renderWithProviders, invokeMock } from "@/__tests__/setup";

function mockVaultOpen() {
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
    if (cmd === "list_tree") return Promise.resolve([]);
    if (cmd === "ping") return Promise.resolve("pong");
    if (cmd === "ping_or_fail") {
      return Promise.reject({ kind: "NotFound", data: { what: "ping_or_fail" } });
    }
    return Promise.resolve(null);
  });
}

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_recent_vaults") return Promise.resolve([]);
      if (cmd === "list_tree") return Promise.resolve([]);
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

  it("renders the shell with the vault switcher and file tree when a vault is open", async () => {
    mockVaultOpen();
    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("vault-switcher")).toBeInTheDocument();
    });
    expect(screen.getByTestId("vault-switcher-toggle")).toHaveTextContent("notes");
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
  });

  it("does NOT show the dev panel by default", async () => {
    mockVaultOpen();
    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("vault-switcher")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("trigger-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ping-status")).not.toBeInTheDocument();
  });

  it("shows the dev panel with ping and trigger when ?dev=1 and a vault is open", async () => {
    window.history.replaceState({}, "", "/?dev=1");
    mockVaultOpen();
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

  it("renders the Editor when a file is selected and the close button clears it", async () => {
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
      if (cmd === "list_tree") {
        return Promise.resolve([
          { kind: "file", path: "hello.md", name: "hello.md" },
        ]);
      }
      if (cmd === "read_note") {
        return Promise.resolve({
          path: "hello.md",
          content: "# hi",
          modifiedAt: "2026-06-03T00:00:00Z",
        });
      }
      if (cmd === "ping") return Promise.resolve("pong");
      return Promise.resolve(null);
    });
    renderWithProviders(<App />);
    const treeItem = await screen.findByText("hello.md");
    const user = userEvent.setup();
    await user.click(treeItem);
    await waitFor(() => {
      expect(screen.getByTestId("editor")).toBeInTheDocument();
    });
    expect(screen.getByTestId("editor-close")).toBeInTheDocument();
    await user.click(screen.getByTestId("editor-close"));
    await waitFor(() => {
      expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
    });
    window.history.replaceState({}, "", "/");
  });
});
