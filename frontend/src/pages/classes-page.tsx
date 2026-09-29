import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CLASS_TO_FAMILY,
  FAMILY_LABELS,
  FAMILY_METRICS,
  PRODUCE_CLASSES,
  PRODUCE_FAMILIES,
  QUALITY_GRADES,
} from "@/types/grades";

/**
 * Reference view for the closed vocabularies in `agrigrade.core.enums`.
 *
 * The client mirrors those enums as types; this page is the human-readable
 * side of the same contract, so a reviewer can check the mirror against the
 * Python without reading TypeScript.
 */
export function ClassesPage() {
  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="gap-1.5">
          <CardTitle className="text-base">Colour family routing</CardTitle>
          <CardDescription className="text-xs">
            The feature router picks a recipe from the predicted class, so
            brown produce is never scored as a red fruit.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PRODUCE_FAMILIES.map((family) => {
            const metrics = FAMILY_METRICS[family];
            const members = PRODUCE_CLASSES.filter(
              (produceClass) => CLASS_TO_FAMILY[produceClass] === family,
            );
            return (
              <div
                key={family}
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                <p className="text-sm font-medium">
                  {FAMILY_LABELS[family]}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {family}
                </p>
                <p className="mt-2 text-xs">
                  <span className="text-muted-foreground">Primary: </span>
                  <span className="font-mono">{metrics.primary}</span>
                </p>
                <p className="mt-0.5 text-xs">
                  <span className="text-muted-foreground">Secondary: </span>
                  <span className="font-mono">{metrics.secondary}</span>
                </p>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  {metrics.defect}
                </p>
                {members.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {members.map((member) => (
                      <Badge
                        key={member}
                        variant="secondary"
                        className="rounded-sm text-[10px] font-normal"
                      >
                        {member.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="gap-1.5">
          <CardTitle className="text-base">Class to family routing table</CardTitle>
          <CardDescription className="text-xs">
            Mirrors <code className="font-mono">CLASS_TO_FAMILY</code> in{" "}
            <code className="font-mono">agrigrade.core.enums</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produce class</TableHead>
                <TableHead>Family</TableHead>
                <TableHead className="hidden sm:table-cell">Label</TableHead>
                <TableHead className="text-right">Features</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PRODUCE_CLASSES.map((produceClass) => {
                const family = CLASS_TO_FAMILY[produceClass];
                return (
                  <TableRow key={produceClass}>
                    <TableCell className="font-mono text-xs">
                      {produceClass}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {family}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">
                      {FAMILY_LABELS[family]}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {FAMILY_METRICS[family].primary}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="gap-1.5">
          <CardTitle className="text-base">Grade ladder</CardTitle>
          <CardDescription className="text-xs">
            Order-sensitive. The Random Forest is trained against exactly this
            sequence, so position is part of the contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {QUALITY_GRADES.map((grade, index) => (
            <div
              key={grade}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {index}
              </span>
              <span className="font-mono text-sm">{grade}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {grade === "Reject"
                  ? "Excluded from sale"
                  : `Market tier ${String.fromCharCode(65 + index)}`}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
