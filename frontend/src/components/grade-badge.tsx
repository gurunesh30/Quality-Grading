import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import { QUALITY_GRADES, type QualityGrade } from "@/types/grades";

/**
 * Grade chip. The palette is deliberately not a red/green traffic light:
 * `Grade C` and `Reject` are both "do not ship at full price", so they sit on
 * the same warning ramp and are told apart by their label, not by hue alone.
 * That keeps the badge readable for colour-blind users.
 */
const TONE: Record<QualityGrade, string> = {
  "Grade A":
    "border-primary/25 bg-primary/10 text-foreground hover:bg-primary/15",
  "Grade B":
    "border-border bg-secondary text-secondary-foreground hover:bg-accent/60",
  "Grade C":
    "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
  Reject:
    "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const SIZE = {
  sm: "px-1.5 py-0 text-[11px]",
  md: "px-2 py-0.5 text-xs",
  lg: "px-3 py-1 text-base",
} as const;

export function GradeBadge({
  grade,
  size = "md",
  className,
}: {
  grade: QualityGrade;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md font-medium tracking-tight",
        TONE[grade],
        SIZE[size],
        className,
      )}
    >
      {grade}
    </Badge>
  );
}

/** The full ladder, for legends and empty states. */
export function GradeLadder({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {QUALITY_GRADES.map((grade) => (
        <GradeBadge key={grade} grade={grade} size="sm" />
      ))}
    </div>
  );
}
