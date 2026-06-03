import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve("pong")),
}));

afterEach(() => {
  cleanup();
});
