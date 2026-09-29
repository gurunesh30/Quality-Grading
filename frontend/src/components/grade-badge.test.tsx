import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GradeBadge, GradeLadder } from "@/components/grade-badge";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { QUALITY_GRADES, type QualityGrade } from "@/types/grades";

describe("GradeBadge", () => {
  it("renders every grade with its exact contract string", () => {
    for (const grade of QUALITY_GRADES) {
      render(<GradeBadge grade={grade} />);
      expect(screen.getByText(grade)).toBeInTheDocument();
    }
  });

  it("does not rely on colour alone to convey the grade", () => {
    // Grade C and Reject share the warning ramp, so the label has to carry
    // the distinction for colour-blind users.
    const { rerender } = render(<GradeBadge grade="Grade C" />);
    expect(screen.getByText("Grade C")).toBeInTheDocument();
    rerender(<GradeBadge grade="Reject" />);
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.queryByText("Grade C")).not.toBeInTheDocument();
  });
});

describe("GradeLadder", () => {
  it("shows the canonical order", () => {
    render(<GradeLadder />);
    const labels = screen
      .getAllByText(/Grade A|Grade B|Grade C|Reject/)
      .map((node) => node.textContent);
    expect(labels).toEqual([...QUALITY_GRADES]);
  });
});

describe("ConfidenceMeter", () => {
  it("renders the value with one decimal", () => {
    render(<ConfidenceMeter value={92.44} />);
    expect(screen.getByText("92.4")).toBeInTheDocument();
  });

  it("flags low confidence as provisional", () => {
    render(<ConfidenceMeter value={42} />);
    expect(screen.getByText(/provisional/i)).toBeInTheDocument();
  });

  it("does not flag a strong agreement", () => {
    render(<ConfidenceMeter value={95} />);
    expect(screen.queryByText(/provisional/i)).not.toBeInTheDocument();
  });

  it("clamps out-of-range input", () => {
    const { rerender } = render(<ConfidenceMeter value={140} />);
    expect(screen.getByText("100.0")).toBeInTheDocument();
    rerender(<ConfidenceMeter value={-20} />);
    expect(screen.getByText("0.0")).toBeInTheDocument();
  });

  it("exposes the value to assistive tech", () => {
    render(<ConfidenceMeter value={78.1} />);
    expect(
      screen.getByRole("progressbar", { name: /confidence 78.1 percent/i }),
    ).toBeInTheDocument();
  });
});

describe("grade contract strings", () => {
  it("are exactly those the classifier emits", () => {
    const expected: QualityGrade[] = [
      "Grade A",
      "Grade B",
      "Grade C",
      "Reject",
    ];
    expect(QUALITY_GRADES).toEqual(expected);
  });
});
