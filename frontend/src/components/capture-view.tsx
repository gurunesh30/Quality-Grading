import { CalibrationCard } from "@/components/calibration-card";
import { ResultCard, ResultCardSkeleton } from "@/components/result-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/api";
import { useCamera } from "@/hooks/use-camera";
import { useGradeSession } from "@/hooks/use-grade-session";
import { cn } from "cn";
import { Camera, ImageUp, Loader2, RefreshCw, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { GradeRecord, GradeResult } from "@/types/api";
import { PRODUCE_CLASSES, type ProduceClass } from "@/types/grades";

const AUTO = "auto" as const;

export function CaptureView() {
  const { videoRef, status, error: cameraError, start, stop, capture } =
    useCamera();
  const { add } = useGradeSession();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [frame, setFrame] = useState<{ blob: Blob; url: string } | null>(null);
  const [classHint, setClassHint] = useState<ProduceClass | typeof AUTO>(AUTO);
  const [calibrationOn, setCalibrationOn] = useState(false);
  const [calibration, setCalibration] = useState({
    referenceDiameterMm: 20,
    referenceDiameterPx: 94,
  });
  const [result, setResult] = useState<GradeResult | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Object URLs are revoked whenever the frame is replaced or cleared, so a
  // long session does not leak a blob per capture.
  useEffect(() => {
    return () => {
      if (frame) URL.revokeObjectURL(frame.url);
    };
  }, [frame]);

  const retake = useCallback(() => {
    if (frame) URL.revokeObjectURL(frame.url);
    setFrame(null);
    setResult(null);
    setFailure(null);
  }, [frame]);

  const onFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That file is not an image.");
      return;
    }
    if (frame) URL.revokeObjectURL(frame.url);
    setFrame({ blob: file, url: URL.createObjectURL(file) });
    setResult(null);
    setFailure(null);
  }, [frame]);

  const shoot = useCallback(async () => {
    const blob = await capture();
    if (!blob) {
      toast.error("No frame available. Start the camera first.");
      return;
    }
    if (frame) URL.revokeObjectURL(frame.url);
    setFrame({ blob, url: URL.createObjectURL(blob) });
    setResult(null);
    setFailure(null);
  }, [capture, frame]);

  const grade = useCallback(async () => {
    if (!frame) return;
    setIsGrading(true);
    setFailure(null);
    try {
      const graded = await api.grade({
        image: frame.blob,
        produceClassHint: classHint === AUTO ? undefined : classHint,
        ...(calibrationOn
          ? {
              referenceDiameterMm: calibration.referenceDiameterMm,
              referenceDiameterPx: calibration.referenceDiameterPx,
            }
          : {}),
      });
      setResult(graded);
      const record: GradeRecord = { ...graded, thumbnail_url: frame.url };
      add(record);
      toast.success(`${graded.grade} at ${graded.confidence.toFixed(1)}%`);
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : "Grading failed. Is the API reachable?";
      setFailure(message);
      toast.error(message);
    } finally {
      setIsGrading(false);
    }
  }, [add, calibration, calibrationOn, classHint, frame]);

  const live = status === "live";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* ---------------------------------------------------------- */}
      {/* Capture                                                     */}
      {/* ---------------------------------------------------------- */}
      <Card className="shadow-sm">
        <CardHeader className="gap-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="size-4 text-muted-foreground" />
            Capture
          </CardTitle>
          <CardDescription className="text-xs">
            Fill the frame with a single piece of produce on a plain
            background. Frames stay on this device until you submit.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-muted/40">
            {/* Live feed sits under the still; the still wins once captured. */}
            <video
              ref={videoRef}
              playsInline
              muted
              aria-label="Live camera preview"
              className={cn(
                "absolute inset-0 size-full object-cover",
                frame && "opacity-0",
                !live && "opacity-0",
              )}
            />

            {frame ? (
              <img
                src={frame.url}
                alt="Captured produce frame"
                className="absolute inset-0 size-full object-contain"
              />
            ) : null}

            {!frame && !live && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <ScanLine className="size-8 text-muted-foreground/60" />
                <p className="max-w-xs text-sm text-muted-foreground">
                  {status === "requesting"
                    ? "Requesting camera…"
                    : status === "idle"
                      ? "Start the camera, or upload a frame you already have."
                      : "Camera unavailable. Upload a frame to continue."}
                </p>
              </div>
            )}

            {live && !frame && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-[12%] rounded-lg border-2 border-dashed border-foreground/25"
              />
            )}
          </div>

          {cameraError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {cameraError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!live ? (
              <Button
                type="button"
                onClick={start}
                disabled={status === "requesting"}
                className="shadow-xs"
              >
                {status === "requesting" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                Start camera
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={shoot}
                  className="shadow-xs"
                >
                  <ScanLine className="size-4" />
                  Capture frame
                </Button>
                <Button type="button" variant="outline" onClick={stop}>
                  Stop camera
                </Button>
              </>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageUp className="size-4" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />

            {frame && (
              <Button
                type="button"
                variant="ghost"
                onClick={retake}
                className="text-muted-foreground"
              >
                <RefreshCw className="size-4" />
                Retake
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="class-hint" className="text-xs">
                Produce class
              </Label>
              <Select
                value={classHint}
                onValueChange={(value) =>
                  setClassHint(value as ProduceClass | typeof AUTO)
                }
              >
                <SelectTrigger id="class-hint" className="h-8 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>Detect automatically</SelectItem>
                  {PRODUCE_CLASSES.filter((c) => c !== "unknown").map(
                    (produceClass) => (
                      <SelectItem key={produceClass} value={produceClass}>
                        {produceClass.replace(/_/g, " ")}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                onClick={grade}
                disabled={!frame || isGrading}
                className="h-8 w-full shadow-xs"
              >
                {isGrading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ScanLine className="size-4" />
                )}
                {isGrading ? "Grading…" : "Grade this frame"}
              </Button>
            </div>
          </div>

          <CalibrationCard
            enabled={calibrationOn}
            onEnabledChange={setCalibrationOn}
            values={calibration}
            onValuesChange={setCalibration}
          />
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- */}
      {/* Result                                                      */}
      {/* ---------------------------------------------------------- */}
      <div className="space-y-4">
        {failure && (
          <Card className="border-destructive/40 shadow-sm">
            <CardHeader className="gap-1">
              <CardTitle className="text-sm text-destructive">
                Could not grade that frame
              </CardTitle>
              <CardDescription className="text-xs">{failure}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={grade}
                disabled={isGrading}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {isGrading && <ResultCardSkeleton />}

        {!isGrading && result && <ResultCard result={result} />}

        {!isGrading && !result && !failure && <CaptureGuide />}
      </div>
    </div>
  );
}

function CaptureGuide() {
  const steps = [
    {
      title: "One piece, plain background",
      body: "Segmentation isolates the foreground mask. Clutter behind the produce becomes false defect area.",
    },
    {
      title: "Fill the light, do not create it",
      body: "NDTI, VARI and ExB are band ratios, so a hard shadow skews them. Diffuse daylight beats a flash.",
    },
    {
      title: "Add a coin for true area",
      body: "The reference marker converts pixels to millimetres so area and diameter stop depending on camera distance.",
    },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader className="gap-1.5">
        <CardTitle className="text-base">Before you capture</CardTitle>
        <CardDescription className="text-xs">
          Three things that decide whether the grade is trustworthy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, index) => (
          <div key={step.title} className="flex gap-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm bg-muted font-mono text-[11px] text-muted-foreground">
              {index + 1}
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
