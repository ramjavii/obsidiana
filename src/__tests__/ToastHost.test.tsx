import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastHost } from "@/components/ToastHost";
import { useToastStore } from "@/hooks/useToastStore";

describe("ToastHost", () => {
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  afterEach(() => {
    useToastStore.getState().clear();
    vi.useRealTimers();
  });

  it("renders a toast when one is pushed", () => {
    render(<ToastHost />);
    act(() => {
      useToastStore.getState().push("error", "Something broke");
    });
    expect(screen.getByTestId("toast-error")).toBeInTheDocument();
    expect(screen.getByText("Something broke")).toBeInTheDocument();
  });

  it("dismisses a toast on click", () => {
    render(<ToastHost />);
    act(() => {
      useToastStore.getState().push("info", "Hi there");
    });
    const dismiss = screen.getByLabelText("dismiss");
    act(() => {
      dismiss.click();
    });
    expect(screen.queryByTestId("toast-info")).not.toBeInTheDocument();
  });

  it("auto-dismisses a toast after the TTL", () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    act(() => {
      useToastStore.getState().push("success", "Saved");
    });
    expect(screen.getByTestId("toast-success")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5001);
    });
    expect(screen.queryByTestId("toast-success")).not.toBeInTheDocument();
  });

  it("renders multiple toasts stacked", () => {
    render(<ToastHost />);
    act(() => {
      useToastStore.getState().push("info", "A");
      useToastStore.getState().push("error", "B");
    });
    expect(screen.getByTestId("toast-info")).toBeInTheDocument();
    expect(screen.getByTestId("toast-error")).toBeInTheDocument();
  });
});
