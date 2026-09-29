/**
 * Mirrors `agrigrade.core.enums`.
 *
 * Boundary rule (see frontend/README.md): when a member lands in the Python
 * enum, update this file in the same PR. The API also serves these
 * vocabularies from `GET /api/v1/classes`; `isProduceClass` and friends exist
 * to validate server payloads at runtime.
 */

export const PRODUCE_FAMILIES = [
  "red_smooth",
  "yellow_green",
  "brown_textured",
  "unknown",
] as const;
export type ProduceFamily = (typeof PRODUCE_FAMILIES)[number];

export const PRODUCE_CLASSES = [
  "apple",
  "tomato",
  "red_grape",
  "banana",
  "mango",
  "citrus",
  "papaya",
  "kiwi",
  "chikoo",
  "brown_pear",
  "unknown",
] as const;
export type ProduceClass = (typeof PRODUCE_CLASSES)[number];

/** Canonical, order-sensitive grade ladder — position is part of the contract. */
export const QUALITY_GRADES = [
  "Grade A",
  "Grade B",
  "Grade C",
  "Reject",
] as const;
export type QualityGrade = (typeof QUALITY_GRADES)[number];

/** Mirrors `CLASS_TO_FAMILY` in `agrigrade.core.enums`. */
export const CLASS_TO_FAMILY: Record<ProduceClass, ProduceFamily> = {
  apple: "red_smooth",
  tomato: "red_smooth",
  red_grape: "red_smooth",
  banana: "yellow_green",
  mango: "yellow_green",
  citrus: "yellow_green",
  papaya: "yellow_green",
  kiwi: "brown_textured",
  chikoo: "brown_textured",
  brown_pear: "brown_textured",
  unknown: "unknown",
};

/** Human labels for the classifier's feature recipes (README section 3B). */
export const FAMILY_LABELS: Record<ProduceFamily, string> = {
  red_smooth: "Red / Smooth",
  yellow_green: "Yellow / Green",
  brown_textured: "Brown / Textured",
  unknown: "Unclassified",
};

/** Primary + secondary metrics each family routes to, for UI display. */
export const FAMILY_METRICS: Record<
  ProduceFamily,
  { primary: string; secondary: string; defect: string }
> = {
  red_smooth: {
    primary: "NDTI / VARI",
    secondary: "a* channel variance",
    defect: "Dark spots drop NDTI below the produce baseline",
  },
  yellow_green: {
    primary: "YI / VARI",
    secondary: "Spot contour area ratio",
    defect: "High YI is ripeness; low VARI is age",
  },
  brown_textured: {
    primary: "ExB",
    secondary: "GLCM homogeneity & L* variance",
    defect: "Soft rot shows high L* variance; mold spikes ExB",
  },
  unknown: {
    primary: "—",
    secondary: "—",
    defect: "Class not recognised; no recipe routed",
  },
};

export function isProduceClass(value: unknown): value is ProduceClass {
  return (
    typeof value === "string" &&
    (PRODUCE_CLASSES as readonly string[]).includes(value)
  );
}

export function isProduceFamily(value: unknown): value is ProduceFamily {
  return (
    typeof value === "string" &&
    (PRODUCE_FAMILIES as readonly string[]).includes(value)
  );
}

export function isQualityGrade(value: unknown): value is QualityGrade {
  return (
    typeof value === "string" &&
    (QUALITY_GRADES as readonly string[]).includes(value)
  );
}

/** Unrecognised classes degrade to `unknown`, matching `family_for`. */
export function familyFor(produceClass: string): ProduceFamily {
  const key = produceClass.trim().toLowerCase();
  return isProduceClass(key) ? CLASS_TO_FAMILY[key] : "unknown";
}

export function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Index on the grade ladder; -1 for anything off-ladder. */
export function gradeIndex(grade: QualityGrade): number {
  return QUALITY_GRADES.indexOf(grade);
}
