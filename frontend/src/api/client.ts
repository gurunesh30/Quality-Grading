/**
 * Typed client for the FastAPI surface.
 *
 * The routes in `src/agrigrade/api/routes/` are not implemented yet, so
 * `createApiClient` takes a `transport`. In mock mode the client resolves
 * against fixtures in `./mock.ts`; against a real deployment it is plain
 * `fetch`. Swapping happens in `src/api/index.ts` via `VITE_API_BASE_URL`.
 */

import type {
  ClassCatalog,
  Envelope,
  GradeResult,
  HealthStatus,
  SegmentResult,
} from "@/types/api";
import { isProduceClass, isQualityGrade } from "@/types/grades";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface GradeRequest {
  /** JPEG/PNG bytes of the captured frame. */
  image: Blob;
  /** Known diameter of the on-screen reference, in millimetres. */
  referenceDiameterMm?: number;
  /** Measured reference diameter in the frame, in pixels. */
  referenceDiameterPx?: number;
  /** Skip the segmentation stage when the caller already knows the class. */
  produceClassHint?: string;
}

export type Transport = {
  request<T>(path: string, init?: RequestInit): Promise<T>;
};

/** Guards an untrusted payload before it reaches a React component. */
function assertShape<T>(value: unknown, guard: (v: unknown) => boolean): T {
  if (!guard(value)) {
    throw new ApiError("Unexpected payload shape from API", 502);
  }
  return value as T;
}

const isHealth = (v: unknown): boolean =>
  typeof v === "object" &&
  v !== null &&
  "status" in v &&
  "workstreams" in v;

const isCatalog = (v: unknown): boolean =>
  typeof v === "object" &&
  v !== null &&
  Array.isArray((v as ClassCatalog).classes) &&
  Array.isArray((v as ClassCatalog).grades);

const isSegment = (v: unknown): boolean =>
  typeof v === "object" &&
  v !== null &&
  isProduceClass((v as SegmentResult).produce_class);

const isGrade = (v: unknown): boolean => {
  if (typeof v !== "object" || v === null) return false;
  const r = v as GradeResult;
  return isQualityGrade(r.grade) && typeof r.confidence === "number";
};

function unwrap<T>(envelope: Envelope<T>): T {
  if (typeof envelope !== "object" || envelope === null || !("data" in envelope)) {
    throw new ApiError("Missing versioned envelope", 502);
  }
  return envelope.data;
}

/** Transport backed by `fetch`, for a real deployment. */
export function createHttpTransport(baseUrl: string): Transport {
  return {
    async request<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(`${baseUrl}${path}`, init);
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new ApiError(
          detail || `${init?.method ?? "GET"} ${path} failed`,
          response.status,
        );
      }
      return (await response.json()) as T;
    },
  };
}

export function createApiClient(transport: Transport) {
  return {
    async health(): Promise<HealthStatus> {
      const body = await transport.request<Envelope<HealthStatus>>(
        "/api/v1/health",
      );
      return assertShape(unwrap(body), isHealth);
    },

    async classes(): Promise<ClassCatalog> {
      const body = await transport.request<Envelope<ClassCatalog>>(
        "/api/v1/classes",
      );
      return assertShape(unwrap(body), isCatalog);
    },

    async segment(image: Blob): Promise<SegmentResult> {
      const body = await transport.request<Envelope<SegmentResult>>(
        "/api/v1/segment",
        { method: "POST", body: image },
      );
      return assertShape(unwrap(body), isSegment);
    },

    async grade(request: GradeRequest): Promise<GradeResult> {
      const form = new FormData();
      form.append("image", request.image, "frame.jpg");
      if (request.referenceDiameterMm !== undefined) {
        form.append("reference_diameter_mm", String(request.referenceDiameterMm));
      }
      if (request.referenceDiameterPx !== undefined) {
        form.append("reference_diameter_px", String(request.referenceDiameterPx));
      }
      if (request.produceClassHint) {
        form.append("produce_class_hint", request.produceClassHint);
      }

      const body = await transport.request<Envelope<GradeResult>>(
        "/api/v1/grade",
        { method: "POST", body: form },
      );
      return assertShape(unwrap(body), isGrade);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
