import { describe, it, expect } from "vitest";
import {
  APP_ERROR_VARIANTS,
  appErrorMessage,
  isAppError,
  parseAppError,
  type AppError,
} from "@/errors";

describe("isAppError", () => {
  it("accepts each known variant", () => {
    for (const kind of APP_ERROR_VARIANTS) {
      const sample = sampleFor(kind);
      expect(isAppError(sample)).toBe(true);
    }
  });

  it("rejects unknown kinds", () => {
    expect(
      isAppError({ kind: "SomethingElse", data: { foo: "bar" } }),
    ).toBe(false);
  });

  it("rejects missing data", () => {
    expect(isAppError({ kind: "Internal" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError("Internal")).toBe(false);
    expect(isAppError(42)).toBe(false);
  });
});

describe("parseAppError", () => {
  it("returns the value when valid", () => {
    const err: AppError = {
      kind: "Io",
      data: { path: "/x", source: "boom" },
    };
    expect(parseAppError(err)).toEqual(err);
  });

  it("returns null when invalid", () => {
    expect(parseAppError({ kind: "Nope", data: {} })).toBeNull();
  });
});

describe("appErrorMessage", () => {
  it("formats Internal", () => {
    expect(appErrorMessage({ kind: "Internal", data: { message: "x" } })).toBe(
      "Internal error: x",
    );
  });

  it("formats NotFound", () => {
    expect(appErrorMessage({ kind: "NotFound", data: { what: "vault" } })).toBe(
      "Not found: vault",
    );
  });

  it("formats InvalidArgument", () => {
    expect(
      appErrorMessage({
        kind: "InvalidArgument",
        data: { message: "bad path" },
      }),
    ).toBe("Invalid input: bad path");
  });

  it("formats Io", () => {
    expect(
      appErrorMessage({
        kind: "Io",
        data: { path: "/a", source: "EACCES" },
      }),
    ).toBe("Couldn't read /a: EACCES");
  });
});

function sampleFor(kind: (typeof APP_ERROR_VARIANTS)[number]): AppError {
  switch (kind) {
    case "Internal":
      return { kind, data: { message: "m" } };
    case "NotFound":
      return { kind, data: { what: "w" } };
    case "InvalidArgument":
      return { kind, data: { message: "m" } };
    case "Io":
      return { kind, data: { path: "/p", source: "s" } };
  }
}
