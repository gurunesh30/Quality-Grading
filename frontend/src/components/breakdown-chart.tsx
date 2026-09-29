import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "cn";
import { QUALITY_GRADES, type QualityGrade } from "@/types/grades";

/* ------------------------------------------------------------------ */
/* Grade distribution                                                 */
/* ------------------------------------------------------------------ */

export function GradeDistributionChart({
  distribution,
  className,
}: {
  distribution: Record<QualityGrade, number>;
  className?: string;
}) {
  const data = QUALITY_GRADES.map((grade) => ({
    grade,
    label: grade.replace("Grade ", ""),
    probability: distribution[grade] ?? 0,
  }));

  // The predicted grade takes `--primary`; the rest share a muted ramp so the
  // eye lands on the winner rather than on the tallest bar. Order alone would
  // otherwise imply that a higher probability is always the predicted grade.
  const fillFor = (index: number) => {
    if (index === 0) return "var(--primary)";
    return `color-mix(in oklch, var(--muted-foreground) ${100 - index * 22}%, transparent)`;
  };

  return (
    <div className={cn("h-40 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: -22 }}
          barCategoryGap="28%"
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="2 4"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.35 }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as
                | (typeof data)[number]
                | undefined;
              if (!active || !row) return null;
              return (
                <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
                  <p className="font-medium text-popover-foreground">
                    {row.grade}
                  </p>
                  <p className="font-mono text-muted-foreground">
                    {row.probability.toFixed(1)}% mean probability
                  </p>
                </div>
              );
            }}
          />
          <Bar
            dataKey="probability"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          >
            {data.map((row, index) => (
              <Cell key={row.grade} fill={fillFor(index)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ensemble agreement                                                 */
/* ------------------------------------------------------------------ */

export function TreeAgreementChart({
  votes,
  className,
}: {
  votes: { grade: QualityGrade; probability: number }[];
  className?: string;
}) {
  if (votes.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No per-tree votes were returned.
      </p>
    );
  }

  const counts = new Map<QualityGrade, number>();
  votes.forEach((vote) => {
    counts.set(vote.grade, (counts.get(vote.grade) ?? 0) + 1);
  });

  const data = QUALITY_GRADES.map((grade) => ({
    grade,
    label: grade.replace("Grade ", ""),
    trees: counts.get(grade) ?? 0,
  })).filter((row) => row.trees > 0);

  const agreed = Math.max(...data.map((row) => row.trees));
  const unanimous = agreed === votes.length;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-foreground">
          {unanimous ? "All trees agreed" : "Trees split across grades"}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {agreed}/{votes.length} on the winner
        </span>
      </div>
      <div className="space-y-1.5">
        {data.map((row) => (
          <div key={row.grade} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-muted-foreground">
              {row.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
              <div
                className="h-full rounded-sm bg-chart-2"
                style={{ width: `${(row.trees / votes.length) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
              {row.trees}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
