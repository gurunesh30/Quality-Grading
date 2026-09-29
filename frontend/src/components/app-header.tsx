import { isMockMode } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "cn";
import { FlaskConical, Leaf, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

export type View = "capture" | "history" | "classes";

const NAV: { value: View; label: string }[] = [
  { value: "capture", label: "Capture" },
  { value: "history", label: "History" },
  { value: "classes", label: "Classes" },
];

export function AppHeader({
  view,
  onViewChange,
  recordCount,
  children,
}: {
  view: View;
  onViewChange: (view: View) => void;
  recordCount: number;
  children?: ReactNode;
}) {
  const { resolved, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs">
            <Leaf className="size-4" />
          </span>
          <div className="leading-none">
            <p className="text-sm font-semibold tracking-tight">AgriGrade</p>
            <p className="text-[11px] text-muted-foreground">
              Quality grading
            </p>
          </div>
        </div>

        <Separator orientation="vertical" className="hidden h-6 sm:block" />

        <Tabs
          value={view}
          onValueChange={(value) => onViewChange(value as View)}
          className="min-w-0 flex-1"
        >
          <TabsList>
            {NAV.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="text-xs"
              >
                {item.label}
                {item.value === "history" && recordCount > 0 && (
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    {recordCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1.5">
          {isMockMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="hidden cursor-default rounded-md border-dashed text-[10px] font-normal sm:inline-flex"
                >
                  <FlaskConical className="size-3" />
                  Mock API
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                No backend yet. Set VITE_API_BASE_URL to use the real service.
              </TooltipContent>
            </Tooltip>
          )}

          {children}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={
              resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"
            }
            className={cn("size-8")}
          >
            {resolved === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
