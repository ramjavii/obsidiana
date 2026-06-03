import { describe, it, expect } from "vitest";
import { ipcInvoke, isIpcError } from "@/ipc";
import { invokeMock } from "@/__tests__/setup";

describe("ipcInvoke", () => {
  it("returns ok when invoke resolves", async () => {
    invokeMock.mockImplementationOnce(() => Promise.resolve("pong"));
    const result = await ipcInvoke<string>("ping");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("pong");
    }
  });

  it("returns AppError when invoke rejects with a valid AppError", async () => {
    const backendError = {
      kind: "NotFound",
      data: { what: "vault" },
    };
    invokeMock.mockImplementationOnce(() => Promise.reject(backendError));
    const result = await ipcInvoke<string>("open_vault", { path: "/x" });
    expect(isIpcError(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.kind).toBe("NotFound");
      expect(result.raw).toEqual(backendError);
    }
  });

  it("wraps non-AppError rejections as Internal", async () => {
    invokeMock.mockImplementationOnce(() =>
      Promise.reject(new Error("network down")),
    );
    const result = await ipcInvoke<string>("ping");
    expect(isIpcError(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.kind).toBe("Internal");
      if (result.error.kind === "Internal") {
        expect(result.error.data.message).toBe("network down");
      }
    }
  });

  it("wraps non-Error rejections as Internal with a stringified message", async () => {
    invokeMock.mockImplementationOnce(() => Promise.reject("boom"));
    const result = await ipcInvoke<string>("ping");
    expect(isIpcError(result)).toBe(true);
    if (!result.ok && result.error.kind === "Internal") {
      expect(result.error.data.message).toBe("boom");
    }
  });
});
