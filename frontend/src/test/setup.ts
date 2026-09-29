import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * jsdom implements neither `getUserMedia` nor the canvas `toBlob` path the
 * capture view uses, so both are stubbed. Tests that care assert on the stub
 * rather than on real media behaviour.
 */
if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, "mediaDevices", {
    writable: true,
    value: { getUserMedia: vi.fn() },
  });
}
