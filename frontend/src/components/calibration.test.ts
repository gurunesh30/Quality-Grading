import { describe, expect, it } from "vitest";
import { scaleMmPerPixel, trueAreaCm2 } from "@/lib/calibration";
import { mockGrade, mockGrades } from "@/api/mock";
import { QUALITY_GRADES, isQualityGrade, isProduceClass } from "@/types/grades";

describe("scaleMmPerPixel", () => {
  it("divides known diameter by measured diameter", () => {
    // README section 3C: mm/px = known mm / reference px.
    expect(
      scaleMmPerPixel({ referenceDiameterMm: 24.26, referenceDiameterPx: 100 }),
    ).toBeCloseTo(0.2426);
  });

  it("returns null for a missing or nonsensical input", () => {
    expect(scaleMmPerPixel({ referenceDiameterMm: 0, referenceDiameterPx: 100 })).toBeNull();
    expect(scaleMmPerPixel({ referenceDiameterMm: 20, referenceDiameterPx: 0 })).toBeNull();
    expect(
      scaleMmPerPixel({
        referenceDiameterMm: Number.NaN,
        referenceDiameterPx: 100,
      }),
    ).toBeNull();
  });

  it("scales area with the square of the ratio", () => {
    // Doubling the reference pixel diameter halves mm/px, so a fixed pixel
    // area maps to a quarter of the true area.
    const half = scaleMmPerPixel({
      referenceDiameterMm: 20,
      referenceDiameterPx: 200,
    });
    const full = scaleMmPerPixel({
      referenceDiameterMm: 20,
      referenceDiameterPx: 100,
    });
    expect(half).not.toBeNull();
    expect(full).not.toBeNull();
    expect(half! * half!).toBeCloseTo((full! * full!) / 4, 6);
  });
});

describe("trueAreaCm2", () => {
  it("converts mm² to cm²", () => {
    // 100 px at 1 mm/px = 100 mm² = 1 cm².
    expect(trueAreaCm2(100, 1)).toBeCloseTo(1);
  });

  it("rejects a missing scale", () => {
    expect(trueAreaCm2(100, 0)).toBeNull();
    expect(trueAreaCm2(0, 0.2)).toBeNull();
  });
});

describe("mock fixtures", () => {
  it("stay on the contract", () => {
    for (const result of [...mockGrades, mockGrade("apple")]) {
      expect(isProduceClass(result.produce_class)).toBe(true);
      expect(isQualityGrade(result.grade)).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
      expect(result.features.length).toBeGreaterThan(0);
    }
  });

  it("keeps the grade distribution on the ladder and summing to ~100", () => {
    for (const result of mockGrades) {
      const total = QUALITY_GRADES.reduce(
        (sum, grade) => sum + (result.grade_distribution[grade] ?? 0),
        0,
      );
      expect(total).toBeCloseTo(100, 0);
    }
  });

  it("marks the predicted grade as the distribution maximum", () => {
    for (const result of mockGrades) {
      const best = Math.max(
        ...QUALITY_GRADES.map((grade) => result.grade_distribution[grade]),
      );
      expect(result.grade_distribution[result.grade]).toBeCloseTo(best, 1);
    }
  });

  it("normalises feature importances against their own maximum", () => {
    const result = mockGrades[0];
    const max = Math.max(...result.features.map((f) => f.importance));
    expect(result.features[0].importance).toBe(max);
  });
});
