/**
 * Transport selection.
 *
 * `VITE_API_BASE_URL` set  -> real fetch against the FastAPI surface.
 * unset / `mock`            -> fixtures, so the UI runs before the routes land.
 */

import { createApiClient, createHttpTransport, type Transport } from "./client";
import { MOCK_LATENCY_MS, mockEnvelopes, mockGrade } from "./mock";
import { isProduceClass, type ProduceClass } from "@/types/grades";

const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const isMockMode =
  !configured || configured === "mock" || configured === "";

const delay = () => new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));

function createMockTransport(): Transport {
  return {
    async request<T>(path: string): Promise<T> {
      await delay();
      const body = (() => {
        switch (path) {
          case "/api/v1/health":
            return mockEnvelopes.health;
          case "/api/v1/classes":
            return mockEnvelopes.classes;
          case "/api/v1/segment":
            return mockEnvelopes.segment;
          default:
            throw new Error(`No mock route for ${path}`);
        }
      })();
      return body as T;
    },
  };
}

/** Mock `/api/v1/grade` echoes the caller's class hint so captures vary. */
function createMockGradeTransport(): Transport {
  const inner = createMockTransport();
  return {
    request<T>(path: string, init?: RequestInit): Promise<T> {
      if (path !== "/api/v1/grade" || !(init?.body instanceof FormData)) {
        return inner.request<T>(path, init);
      }
      const hint = init.body.get("produce_class_hint");
      const produceClass: ProduceClass | undefined = isProduceClass(hint)
        ? hint
        : undefined;
      return (async () => {
        await delay();
        return { schema_version: "1.0", data: mockGrade(produceClass) } as T;
      })();
    },
  };
}

const transport: Transport = isMockMode
  ? createMockGradeTransport()
  : createHttpTransport(configured ?? "");

export const api = createApiClient(transport);

export { ApiError } from "./client";
export type { ApiClient, GradeRequest } from "./client";
export { mockCatalog, mockGrades, mockHealth, mockSegment } from "./mock";
