import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "@/App";
import { renderWithProviders, invokeMock } from "@/__tests__/setup";

describe("App", () => {
  it("renders the OBSIDIANA title", () => {
    renderWithProviders(<App />);
    expect(
      screen.getByRole("heading", { name: /OBSIDIANA/ }),
    ).toBeInTheDocument();
  });

  it("renders the ping status panel", async () => {
    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("ping-status")).toBeInTheDocument();
    });
  });

  it("shows the ping result text after the query resolves", async () => {
    invokeMock.mockImplementationOnce(() => Promise.resolve("pong"));
    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByText(/ping: pong/)).toBeInTheDocument();
    });
  });

  it("does NOT show the dev trigger by default", () => {
    renderWithProviders(<App />);
    expect(screen.queryByTestId("trigger-error")).not.toBeInTheDocument();
  });

  it("does NOT show the dev trigger when ?dev=0", () => {
    window.history.replaceState({}, "", "/?dev=0");
    renderWithProviders(<App />);
    expect(screen.queryByTestId("trigger-error")).not.toBeInTheDocument();
    window.history.replaceState({}, "", "/");
  });

  it("shows the dev trigger when ?dev=1 and clicking it surfaces an error toast", async () => {
    window.history.replaceState({}, "", "/?dev=1");
    invokeMock.mockImplementation(() =>
      Promise.reject({ kind: "NotFound", data: { what: "ping_or_fail" } }),
    );
    renderWithProviders(<App />);
    const button = await screen.findByTestId("trigger-error");
    const user = userEvent.setup();
    await user.click(button);
    await waitFor(() => {
      expect(screen.getByTestId("toast-error")).toBeInTheDocument();
    });
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });
});
