import { describe, expect, it } from "vitest";
import {
  CLASS_TO_FAMILY,
  PRODUCE_CLASSES,
  PRODUCE_FAMILIES,
  QUALITY_GRADES,
  familyFor,
  gradeIndex,
  isProduceClass,
  isQualityGrade,
  titleCase,
} from "@/types/grades";

describe("produce vocabulary", () => {
  it("routes every class to a declared family", () => {
    for (const produceClass of PRODUCE_CLASSES) {
      const family = CLASS_TO_FAMILY[produceClass];
      expect(PRODUCE_FAMILIES).toContain(family);
    }
  });

  it("maps every class exactly once", () => {
    expect(Object.keys(CLASS_TO_FAMILY)).toHaveLength(PRODUCE_CLASSES.length);
  });

  it("puts the brown produce in their own family", () => {
    // The bug README section 3B calls out: brown fruit scored as red fruit.
    expect(CLASS_TO_FAMILY.kiwi).toBe("brown_textured");
    expect(CLASS_TO_FAMILY.chikoo).toBe("brown_textured");
    expect(CLASS_TO_FAMILY.apple).toBe("red_smooth");
  });
});

describe("familyFor", () => {
  it("normalises case and whitespace", () => {
    expect(familyFor("  Apple ")).toBe("red_smooth");
  });

  it("degrades unknown values instead of throwing", () => {
    // Mirrors `family_for` in agrigrade.core.enums.
    expect(familyFor("dragonfruit")).toBe("unknown");
    expect(familyFor("")).toBe("unknown");
  });
});

describe("grade ladder", () => {
  it("keeps the canonical order", () => {
    expect(QUALITY_GRADES).toEqual([
      "Grade A",
      "Grade B",
      "Grade C",
      "Reject",
    ]);
  });

  it("indexes the ladder", () => {
    expect(gradeIndex("Grade A")).toBe(0);
    expect(gradeIndex("Reject")).toBe(3);
  });

  it("guards untrusted server values", () => {
    expect(isQualityGrade("Grade B")).toBe(true);
    expect(isQualityGrade("grade b")).toBe(false);
    expect(isQualityGrade(null)).toBe(false);
    expect(isProduceClass("kiwi")).toBe(true);
    expect(isProduceClass("kiwi2")).toBe(false);
  });
});

describe("titleCase", () => {
  it("turns snake_case into words", () => {
    expect(titleCase("red_grape")).toBe("Red Grape");
    expect(titleCase("ndti_mean")).toBe("Ndti Mean");
  });

  it("collapses repeated separators", () => {
    expect(titleCase("  a__b  ")).toBe("A B");
  });
});
