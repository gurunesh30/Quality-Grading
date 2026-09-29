import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { scaleMmPerPixel, type CalibrationValues } from "@/lib/calibration";
import { cn } from "cn";
import { Ruler } from "lucide-react";
import { useState } from "react";

export type { CalibrationValues };

/** Common on-screen references, in millimetres. */
const REFERENCE_OPTIONS = [
  { label: "1 rupee coin", mm: 20 },
  { label: "US quarter", mm: 24.26 },
  { label: "US penny", mm: 19.05 },
  { label: "ArUco 40 mm", mm: 40 },
] as const;

export interface CalibrationCardProps {
  /** Off by default: physical size is optional, grading works without it. */
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  values: CalibrationValues;
  onValuesChange: (values: CalibrationValues) => void;
  className?: string;
}

export function CalibrationCard({
  enabled: isEnabled,
  onEnabledChange,
  values,
  onValuesChange,
  className,
}: CalibrationCardProps) {
  // Draft strings so a half-typed number like "2." never reaches the parent.
  const [mm, setMm] = useState(() => String(values.referenceDiameterMm));
  const [px, setPx] = useState(() => String(values.referenceDiameterPx));
  const [lastValues, setLastValues] = useState(values);

  // Reset the drafts when the parent replaces the values (e.g. a retake).
  // Adjusting state during render is the documented alternative to an effect.
  if (lastValues !== values) {
    setLastValues(values);
    setMm(String(values.referenceDiameterMm));
    setPx(String(values.referenceDiameterPx));
  }

  const scale = scaleMmPerPixel({
    referenceDiameterMm: Number.parseFloat(mm),
    referenceDiameterPx: Number.parseFloat(px),
  });

  const commit = () => {
    const next = {
      referenceDiameterMm: Number.parseFloat(mm),
      referenceDiameterPx: Number.parseFloat(px),
    };
    if (scaleMmPerPixel(next) !== null) onValuesChange(next);
  };

  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="gap-1.5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Ruler className="size-4 text-muted-foreground" />
              Size calibration
            </CardTitle>
            <CardDescription className="text-xs">
              Place a coin or ArUco tag beside the produce. Without it you still
              get a grade, just no true area.
            </CardDescription>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={onEnabledChange}
            aria-label="Enable size calibration"
          />
        </div>
      </CardHeader>

      {isEnabled && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {REFERENCE_OPTIONS.map((option) => (
              <Button
                key={option.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-md text-xs"
                onClick={() => setMm(String(option.mm))}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ref-mm" className="text-xs">
                Reference diameter (mm)
              </Label>
              <Input
                id="ref-mm"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={mm}
                onChange={(event) => setMm(event.target.value)}
                onBlur={commit}
                className="h-8 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-px" className="text-xs">
                Reference diameter (px)
              </Label>
              <Input
                id="ref-px"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={px}
                onChange={(event) => setPx(event.target.value)}
                onBlur={commit}
                className="h-8 font-mono text-sm"
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="font-mono text-xs tabular-nums">
              {scale
                ? `scale = ${scale.toFixed(4)} mm/px`
                : "Enter both diameters to compute a scale."}
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
