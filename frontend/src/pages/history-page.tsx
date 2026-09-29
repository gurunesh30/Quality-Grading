import { GradeBadge, GradeLadder } from "@/components/grade-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGradeSession } from "@/hooks/use-grade-session";
import { cn } from "cn";
import { History, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  FAMILY_LABELS,
  QUALITY_GRADES,
  titleCase,
  type QualityGrade,
} from "@/types/grades";

export function HistoryPage() {
  const { records, averageConfidence, clear, remove } = useGradeSession();
  const [filter, setFilter] = useState<QualityGrade | "all">("all");

  const visible = useMemo(
    () => (filter === "all" ? records : records.filter((r) => r.grade === filter)),
    [filter, records],
  );

  const tallies = useMemo(() => {
    const map = new Map<QualityGrade, number>();
    records.forEach((record) => {
      map.set(record.grade, (map.get(record.grade) ?? 0) + 1);
    });
    return map;
  }, [records]);

  if (records.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <History className="size-7 text-muted-foreground/60" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No grades in this session</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Capture a frame to start a batch. History is kept in this tab
              only and clears when you close it.
            </p>
          </div>
          <GradeLadder className="justify-center pt-1" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Captures" value={String(records.length)} />
        <Stat
          label="Mean confidence"
          value={
            averageConfidence ? `${averageConfidence.toFixed(1)}%` : "—"
          }
        />
        <Stat
          label="Most frequent"
          value={
            [...tallies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"
          }
        />
      </div>

      <Card className="shadow-sm">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">Session history</CardTitle>
              <CardDescription className="text-xs">
                Newest first. Thumbnails stay on this device.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clear}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Clear
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={filter === "all" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 rounded-md text-xs"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            {QUALITY_GRADES.map((grade) => (
              <Button
                key={grade}
                type="button"
                variant={filter === grade ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-7 rounded-md text-xs")}
                onClick={() => setFilter(grade)}
              >
                {grade.replace("Grade ", "")}
                {tallies.get(grade) ? (
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    {tallies.get(grade)}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No {filter} captures this session.
            </p>
          ) : (
            <ScrollArea className="max-h-[28rem]">
              <ul className="divide-y divide-border pr-3">
                {visible.map((record) => (
                  <li
                    key={record.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    {record.thumbnail_url ? (
                      <img
                        src={record.thumbnail_url}
                        alt=""
                        className="size-11 shrink-0 rounded-md border border-border object-cover"
                      />
                    ) : (
                      <div className="size-11 shrink-0 rounded-md border border-border bg-muted" />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {titleCase(record.produce_class)}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {FAMILY_LABELS[record.family]}
                        </span>
                      </p>
                      <p className="font-mono text-xs tabular-nums text-muted-foreground">
                        {record.confidence.toFixed(1)}%
                        {record.true_area_cm2
                          ? ` · ${record.true_area_cm2.toFixed(1)} cm²`
                          : " · uncalibrated"}
                        {" · "}
                        {new Date(record.captured_at).toLocaleTimeString()}
                      </p>
                    </div>

                    <GradeBadge grade={record.grade} size="sm" />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(record.id)}
                      aria-label={`Remove ${record.grade} capture`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="px-4 py-3">
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
