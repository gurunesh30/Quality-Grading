/**
 * Wire types for the FastAPI surface in `src/agrigrade/api/`.
 *
 * The API serialises with a versioned envelope and adds fields rather than
 * renaming them, so every field the client does not understand is tolerated
 * as `unknown` extras. See `src/api/client.ts` for the runtime guards.
 */

import type {
  ProduceClass,
  ProduceFamily,
  QualityGrade,
} from "./grades";

export interface Envelope<T> {
  /** Monotonic contract version, bumped on breaking schema changes. */
  schema_version: string;
  data: T;
}

/** `GET /api/v1/health` */
export interface HealthStatus {
  status: "ok" | "degraded";
  /** Which workstreams (`features`, `model`) are merged and importable. */
  workstreams: Record<string, boolean>;
}

/** `GET /api/v1/classes` */
export interface ClassCatalog {
  classes: ProduceClass[];
  families: ProduceFamily[];
  grades: QualityGrade[];
  /** class -> family, mirroring `CLASS_TO_FAMILY`. */
  routing: Record<string, ProduceFamily>;
}

/** One measured quantity in the feature vector. */
export interface FeatureValue {
  name: string;
  value: number;
  unit: string | null;
  /** Model's XAI attribution for this feature, 0..1. */
  importance: number;
}

/** `GET /api/v1/schema` */
export interface FeatureSchema {
  name: string;
  order: number;
  unit: string | null;
  description: string;
}

/** `POST /api/v1/segment` */
export interface SegmentResult {
  produce_class: ProduceClass;
  family: ProduceFamily;
  /** Foreground mask coverage as a fraction of the frame, 0..1. */
  mask_coverage: number;
  /** Base64 PNG overlay, when the caller asks for one. */
  overlay_png_base64?: string;
}

/** One tree's vote, used to show ensemble agreement behind the confidence. */
export interface TreeVote {
  grade: QualityGrade;
  probability: number;
}

/** `POST /api/v1/grade` */
export interface GradeResult {
  id: string;
  produce_class: ProduceClass;
  family: ProduceFamily;
  grade: QualityGrade;
  /** 0..100, the mean probability across the ensemble. */
  confidence: number;
  /** Per-class mean probability across the forest. */
  grade_distribution: Record<QualityGrade, number>;
  features: FeatureValue[];
  /** Calibrated scale in mm/pixel, or null when no reference was supplied. */
  scale_mm_per_pixel: number | null;
  true_area_cm2: number | null;
  /** Per-tree votes, for the agreement histogram. */
  tree_votes: TreeVote[];
  captured_at: string;
}

/** History is client-owned for a session; the API is stateless. */
export interface GradeRecord extends GradeResult {
  /** Object URL for the captured frame thumbnail. Session-scoped, not uploaded. */
  thumbnail_url: string | null;
}
