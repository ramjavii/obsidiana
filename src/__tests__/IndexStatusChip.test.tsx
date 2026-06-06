import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { IndexStatusChip } from "@/components/IndexStatusChip";
import { invokeMock, renderWithProviders } from "@/__tests__/setup";
import type { IndexStatus } from "@/types/index";

function makeStatus<V extends IndexStatus["state"]>(
  state: V,
  shape: Partial<Omit<Extract<IndexStatus, { state: V }>, "state" | "schemaVer" | "documentCount" | "lastRebuiltAt">> = {},
): Extract<IndexStatus, { state: V }> {
  return {
    state,
    schemaVer: 1,
    documentCount: 0,
    lastRebuiltAt: "2026-06-06T00:00:00Z",
    ...shape,
  } as Extract<IndexStatus, { state: V }>;
}

beforeEach(() => {
  invokeMock.mockReset();
});

it("renders the ready state with the document count", async () => {
  invokeMock.mockImplementation((cmd) => {
    if (cmd === "index_status") return Promise.resolve(makeStatus("ready", { documentCount: 42 }));
    return Promise.resolve(null);
  });
  renderWithProviders(<IndexStatusChip />);
  await waitFor(() => {
    expect(screen.getByTestId("index-status-chip")).toHaveTextContent("Indexed · 42 docs");
  });
  expect(screen.getByTestId("index-status-chip")).toHaveAttribute("data-index-state", "ready");
});

it("renders the indexing state with the pulse animation", async () => {
  invokeMock.mockImplementation((cmd) => {
    if (cmd === "index_status") return Promise.resolve(makeStatus("indexing"));
    return Promise.resolve(null);
  });
  renderWithProviders(<IndexStatusChip />);
  await waitFor(() => {
    expect(screen.getByTestId("index-status-chip")).toHaveTextContent("Indexing…");
  });
  expect(screen.getByTestId("index-status-chip")).toHaveAttribute("data-index-state", "indexing");
});

it("renders indexing progress as N/M when indexed and total are present", async () => {
  invokeMock.mockImplementation((cmd) => {
    if (cmd === "index_status") {
      return Promise.resolve(makeStatus("indexing", { indexed: 3, total: 10 }));
    }
    return Promise.resolve(null);
  });
  renderWithProviders(<IndexStatusChip />);
  await waitFor(() => {
    expect(screen.getByTestId("index-status-chip")).toHaveTextContent("Indexing 3/10");
  });
  expect(screen.getByTestId("index-status-chip")).toHaveAttribute("data-index-state", "indexing");
});

it("renders the ready state with the docs count label", async () => {
  invokeMock.mockImplementation((cmd) => {
    if (cmd === "index_status") return Promise.resolve(makeStatus("ready", { documentCount: 42 }));
    return Promise.resolve(null);
  });
  renderWithProviders(<IndexStatusChip />);
  await waitFor(() => {
    expect(screen.getByTestId("index-status-chip")).toHaveTextContent("Indexed · 42 docs");
  });
  expect(screen.getByTestId("index-status-chip")).toHaveAttribute("data-index-state", "ready");
});

it("renders the missing state when no vault is open", async () => {
  invokeMock.mockImplementation((cmd) => {
    if (cmd === "index_status") return Promise.resolve(makeStatus("missing"));
    return Promise.resolve(null);
  });
  renderWithProviders(<IndexStatusChip />);
  await waitFor(() => {
    expect(screen.getByTestId("index-status-chip")).toHaveTextContent("Index idle");
  });
  expect(screen.getByTestId("index-status-chip")).toHaveAttribute("data-index-state", "missing");
});

it("renders the broken state and triggers rebuild on click", async () => {
  invokeMock.mockImplementation((cmd) => {
    if (cmd === "index_status") {
      return Promise.resolve(
        makeStatus("broken", { quarantinedTo: "/v/.obsidiana/index.db.broken-1700000000" }),
      );
    }
    if (cmd === "rebuild_index") return Promise.resolve(null);
    return Promise.resolve(null);
  });
  renderWithProviders(<IndexStatusChip />);
  await waitFor(() => {
    expect(screen.getByTestId("index-status-chip")).toHaveTextContent(
      "Index corrupt — click to rebuild",
    );
  });
  expect(screen.getByTestId("index-status-chip")).toHaveAttribute("data-index-state", "broken");
  await act(async () => {
    fireEvent.click(screen.getByTestId("index-status-chip"));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("rebuild_index", undefined),
    );
  });
});

it("renders the failed state and triggers rebuild on click", async () => {
  invokeMock.mockImplementation((cmd) => {
    if (cmd === "index_status") {
      return Promise.resolve(makeStatus("failed", { message: "permission denied" }));
    }
    if (cmd === "rebuild_index") return Promise.resolve(null);
    return Promise.resolve(null);
  });
  renderWithProviders(<IndexStatusChip />);
  await waitFor(() => {
    expect(screen.getByTestId("index-status-chip")).toHaveTextContent(
      "Index failed — click to rebuild",
    );
  });
  expect(screen.getByTestId("index-status-chip")).toHaveAttribute("data-index-state", "failed");
  await act(async () => {
    fireEvent.click(screen.getByTestId("index-status-chip"));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("rebuild_index", undefined),
    );
  });
});
