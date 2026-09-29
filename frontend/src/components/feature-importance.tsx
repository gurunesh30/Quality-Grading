import { cn } from "cn";
import type { FeatureValue } from "@/types/api";
import { titleCase } from "@/types/grades";

interface FeatureRow {
  name: string;
  label: string;
  display: string;
  unit: string | null;
  importance: number;
}

function toRows(features: FeatureValue[]): FeatureRow[] {
  return [...features]
    .sort((a, b) => b.importance - a.importance)
    .map((feature) => ({
      name: feature.name,
      label: titleCase(feature.name),
      display: feature.value.toFixed(3),
      unit: feature.unit,
      importance: feature.importance,
    }));
}

/**
 * XAI attribution bars.
 *
 * Deliberately dependency-free: this is the tab the result card opens on, so
 * keeping the charting library out of it means the first paint of a result
 * does not wait on recharts.
 */
export function FeatureImportanceChart({
  features,
  className,
}: {
  features: FeatureValue[];
  className?: string;
}) {
  const rows = toRows(features);
  if (rows.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        The classifier returned no feature attributions for this capture.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Bars are sized against the strongest feature so the relative
          ordering stays legible even when absolute importances are small. */}
      <div className="space-y-2">
        {rows.map((row) => {
          const width = rows[0].importance
            ? (row.importance / rows[0].importance) * 100
            : 0;
          return (
            <div key={row.name} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-foreground">{row.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {row.display}
                  {row.unit ? ` ${row.unit}` : ""}
                </span>
              </div>
              <div
                role="meter"
                aria-valuenow={Math.round(row.importance * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${row.label} importance`}
                className="h-1.5 w-full overflow-hidden rounded-sm bg-muted"
              >
                <div
                  className="h-full rounded-sm bg-primary"
                  style={{ width: `${Math.max(width, 1.5)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Feature importance from the Random Forest, normalised across the
        ensemble. Longer bar means the split contributed more to the decision.
      </p>
    </div>
  );
}
