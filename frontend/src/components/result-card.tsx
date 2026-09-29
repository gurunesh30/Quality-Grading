import {
  lazy,
  Suspense,
  useState,
} from "react";
import { ConfidenceMeter } from "@/components/confidence-meter";
import { FeatureImportanceChart } from "@/components/feature-importance";
import { GradeBadge } from "@/components/grade-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "cn";
import { Leaf, ScanLine } from "lucide-react";
import type { GradeResult } from "@/types/api";
import {
  FAMILY_LABELS,
  FAMILY_METRICS,
  titleCase,
} from "@/types/grades";

// recharts is the heaviest dependency in the app, and these two tabs are
// opened deliberately rather than by default, so they load on demand.
const GradeDistributionChart = lazy(() =>
  import("@/components/breakdown-chart").then((module) => ({
    default: module.GradeDistributionChart,
  })),
);
const TreeAgreementChart = lazy(() =>
  import("@/components/breakdown-chart").then((module) => ({
    default: module.TreeAgreementChart,
  })),
);

export function ResultCardSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-3 w-44" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

function ChartFallback() {
  return <Skeleton className="h-40 w-full" />;
}

export function ResultCard({
  result,
  className,
}: {
  result: GradeResult;
  className?: string;
}) {
  const metrics = FAMILY_METRICS[result.family];
  const area = result.true_area_cm2;
  const [tab, setTab] = useState("importance");

  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanLine className="size-4 text-muted-foreground" />
              Grading result
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1">
                <Leaf className="size-3 text-muted-foreground" />
                {titleCase(result.produce_class)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{FAMILY_LABELS[result.family]}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                {new Date(result.captured_at).toLocaleTimeString()}
              </span>
            </CardDescription>
          </div>
          <GradeBadge grade={result.grade} size="lg" />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <ConfidenceMeter value={result.confidence} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric
            label="Routed metrics"
            value={metrics.primary}
            hint={metrics.defect}
          />
          <Metric
            label="True area"
            value={area !== null ? `${area.toFixed(1)} cm²` : "Not calibrated"}
            hint={
              result.scale_mm_per_pixel
                ? `${result.scale_mm_per_pixel.toFixed(4)} mm/px`
                : "Add a reference marker"
            }
          />
          <Metric
            label="Secondary metric"
            value={metrics.secondary}
            hint="Texture and luminance channel"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        <Separator />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="importance" className="flex-1 text-xs">
              XAI breakdown
            </TabsTrigger>
            <TabsTrigger value="distribution" className="flex-1 text-xs">
              Distribution
            </TabsTrigger>
            <TabsTrigger value="agreement" className="flex-1 text-xs">
              Tree agreement
            </TabsTrigger>
          </TabsList>

          <TabsContent value="importance" className="pt-4">
            <FeatureImportanceChart features={result.features} />
          </TabsContent>

          {/* Radix unmounts the inactive tab, so the lazy chunk is only
              fetched once the user opens it. */}
          {tab === "distribution" && (
            <TabsContent value="distribution" className="pt-4">
              <Suspense fallback={<ChartFallback />}>
                <GradeDistributionChart
                  distribution={result.grade_distribution}
                />
              </Suspense>
            </TabsContent>
          )}

          {tab === "agreement" && (
            <TabsContent value="agreement" className="pt-4">
              <Suspense fallback={<ChartFallback />}>
                <TreeAgreementChart votes={result.tree_votes} />
              </Suspense>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-muted/30 px-3 py-2",
        className,
      )}
    >
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-medium">
        {value}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
