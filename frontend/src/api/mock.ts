/**
 * Fixtures for the mock transport.
 *
 * Values are representative of a real `POST /api/v1/grade` response so the UI
 * can be developed and reviewed before the routes land. They are seeded, not
 * random, so screenshots and tests are stable.
 */

import type {
  ClassCatalog,
  Envelope,
  GradeResult,
  HealthStatus,
  SegmentResult,
} from "@/types/api";
import {
  CLASS_TO_FAMILY,
  PRODUCE_CLASSES,
  PRODUCE_FAMILIES,
  QUALITY_GRADES,
  type ProduceClass,
} from "@/types/grades";

const envelope = <T>(data: T, schemaVersion = "1.0"): Envelope<T> => ({
  schema_version: schemaVersion,
  data,
});

export const mockHealth: HealthStatus = {
  status: "degraded",
  workstreams: { features: true, model: false },
};

export const mockCatalog: ClassCatalog = {
  classes: [...PRODUCE_CLASSES],
  families: [...PRODUCE_FAMILIES],
  grades: [...QUALITY_GRADES],
  routing: { ...CLASS_TO_FAMILY },
};

export const mockSegment: SegmentResult = {
  produce_class: "apple",
  family: "red_smooth",
  mask_coverage: 0.183,
};

/**
 * Deterministic stand-in for the Random Forest response. `tick` rotates
 * through the fixtures so repeated captures show different grades.
 */
const FIXTURES: Record<string, GradeResult> = {
  apple: {
    id: "fx-apple-1",
    produce_class: "apple",
    family: "red_smooth",
    grade: "Grade A",
    confidence: 92.4,
    grade_distribution: {
      "Grade A": 92.4,
      "Grade B": 6.1,
      "Grade C": 1.2,
      Reject: 0.3,
    },
    features: [
      { name: "ndti_mean", value: 0.61, unit: null, importance: 0.31 },
      { name: "vari_mean", value: -0.14, unit: null, importance: 0.24 },
      { name: "ndti_std", value: 0.043, unit: null, importance: 0.18 },
      { name: "a_star_variance", value: 62.4, unit: "a*²", importance: 0.12 },
      { name: "true_area_cm2", value: 41.7, unit: "cm²", importance: 0.09 },
      { name: "l_star_mean", value: 48.2, unit: "L*", importance: 0.06 },
    ],
    scale_mm_per_pixel: 0.214,
    true_area_cm2: 41.7,
    tree_votes: [
      { grade: "Grade A", probability: 0.96 },
      { grade: "Grade A", probability: 0.91 },
      { grade: "Grade B", probability: 0.55 },
      { grade: "Grade A", probability: 0.88 },
    ],
    captured_at: "2026-09-29T09:14:02.000Z",
  },
  banana: {
    id: "fx-banana-1",
    produce_class: "banana",
    family: "yellow_green",
    grade: "Grade B",
    confidence: 78.1,
    grade_distribution: {
      "Grade A": 21.9,
      "Grade B": 78.1,
      "Grade C": 0,
      Reject: 0,
    },
    features: [
      { name: "yi_mean", value: 0.58, unit: null, importance: 0.29 },
      { name: "vari_mean", value: 0.11, unit: null, importance: 0.22 },
      { name: "spot_contour_ratio", value: 0.083, unit: null, importance: 0.2 },
      { name: "defect_fraction", value: 0.083, unit: null, importance: 0.16 },
      { name: "true_area_cm2", value: 28.3, unit: "cm²", importance: 0.13 },
    ],
    scale_mm_per_pixel: 0.198,
    true_area_cm2: 28.3,
    tree_votes: [
      { grade: "Grade B", probability: 0.81 },
      { grade: "Grade A", probability: 0.62 },
      { grade: "Grade B", probability: 0.77 },
      { grade: "Grade C", probability: 0.44 },
    ],
    captured_at: "2026-09-29T09:18:44.000Z",
  },
  kiwi: {
    id: "fx-kiwi-1",
    produce_class: "kiwi",
    family: "brown_textured",
    grade: "Reject",
    confidence: 64.9,
    grade_distribution: {
      "Grade A": 0,
      "Grade B": 4.8,
      "Grade C": 30.3,
      Reject: 64.9,
    },
    features: [
      { name: "exb_mean", value: 0.071, unit: null, importance: 0.34 },
      { name: "l_star_std", value: 19.6, unit: "L*", importance: 0.27 },
      { name: "glcm_homogeneity", value: 0.41, unit: null, importance: 0.19 },
      { name: "lbp_entropy", value: 6.2, unit: "bits", importance: 0.12 },
      { name: "true_area_cm2", value: 33.9, unit: "cm²", importance: 0.08 },
    ],
    scale_mm_per_pixel: 0.221,
    true_area_cm2: 33.9,
    tree_votes: [
      { grade: "Reject", probability: 0.72 },
      { grade: "Reject", probability: 0.66 },
      { grade: "Grade C", probability: 0.51 },
      { grade: "Reject", probability: 0.69 },
    ],
    captured_at: "2026-09-29T09:22:10.000Z",
  },
  tomato: {
    id: "fx-tomato-1",
    produce_class: "tomato",
    family: "red_smooth",
    grade: "Grade C",
    confidence: 71.3,
    grade_distribution: {
      "Grade A": 0,
      "Grade B": 16.2,
      "Grade C": 71.3,
      Reject: 12.5,
    },
    features: [
      { name: "ndti_mean", value: 0.38, unit: null, importance: 0.28 },
      { name: "vari_mean", value: -0.09, unit: null, importance: 0.2 },
      { name: "ndti_std", value: 0.118, unit: null, importance: 0.24 },
      { name: "a_star_variance", value: 118.7, unit: "a*²", importance: 0.18 },
      { name: "true_area_cm2", value: 22.1, unit: "cm²", importance: 0.1 },
    ],
    scale_mm_per_pixel: 0.207,
    true_area_cm2: 22.1,
    tree_votes: [
      { grade: "Grade C", probability: 0.74 },
      { grade: "Grade C", probability: 0.68 },
      { grade: "Grade B", probability: 0.57 },
      { grade: "Reject", probability: 0.49 },
    ],
    captured_at: "2026-09-29T09:26:31.000Z",
  },
};

/** Capture order used when the transport has no class to go on. */
const ROTATION: ProduceClass[] = ["apple", "banana", "kiwi", "tomato"];

export function mockGrade(produceClass?: string): GradeResult {
  const key =
    produceClass && produceClass in FIXTURES
      ? produceClass
      : ROTATION[Math.floor(Date.now() / 1000) % ROTATION.length];
  const fixture = FIXTURES[key] ?? FIXTURES.apple;
  return {
    ...fixture,
    id: `${fixture.id}-${Date.now().toString(36)}`,
    captured_at: new Date().toISOString(),
  };
}

export const mockGrades: GradeResult[] = [
  FIXTURES.apple,
  FIXTURES.banana,
  FIXTURES.kiwi,
  FIXTURES.tomato,
].map((result) => ({ ...result }));

export const mockEnvelopes = {
  health: envelope(mockHealth),
  classes: envelope(mockCatalog),
  segment: envelope(mockSegment),
};

/** Late enough to exercise the pending state without slowing tests down. */
export const MOCK_LATENCY_MS = 450;
