import { Progress } from "@/components/ui/progress";
import { cn } from "cn";

/**
 * Confidence readout. The number is the primary signal, so it is set in the
 * display face at a large size and the bar is secondary reinforcement.
 *
 * Below 60% the pipeline is close to guessing, so the label says so rather
 * than letting a coloured bar imply the number is trustworthy.
 */
export function ConfidenceMeter({
  value,
  className,
}: {
  /** 0..100. */
  value: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const low = clamped < 60;
  const fair = clamped >= 60 && clamped < 80;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-3xl leading-none font-semibold tabular-nums",
            low && "text-destructive",
          )}
        >
          {clamped.toFixed(1)}
        </span>
        <span className="text-sm text-muted-foreground">% confidence</span>
      </div>

      <Progress
        value={clamped}
        aria-label={`Confidence ${clamped.toFixed(1)} percent`}
        className={cn("h-1.5", low && "[&>[data-slot=progress-indicator]]:bg-destructive")}
      />

      <p
        className={cn(
          "text-xs",
          low ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {low
          ? "Low agreement across the ensemble. Treat this grade as provisional."
          : fair
            ? "Moderate agreement. A second capture usually stabilises it."
            : "Strong agreement across the ensemble."}
      </p>
    </div>
  );
}
