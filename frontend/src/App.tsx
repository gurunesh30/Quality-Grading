import { AppHeader, type View } from "@/components/app-header";
import { CaptureView } from "@/components/capture-view";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGradeSession } from "@/hooks/use-grade-session";
import { useState } from "react";
import { ClassesPage } from "@/pages/classes-page";
import { HistoryPage } from "@/pages/history-page";

export default function App() {
  const [view, setView] = useState<View>("capture");
  const { records } = useGradeSession();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh flex-col bg-background">
        <AppHeader
          view={view}
          onViewChange={setView}
          recordCount={records.length}
        />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {view === "capture" && <CaptureView />}
          {view === "history" && <HistoryPage />}
          {view === "classes" && <ClassesPage />}

          <footer className="mt-10 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Frames are processed in the browser and are not retained by
              default. Grades are advisory; confirm with a physical check
              before pricing a batch.
            </p>
          </footer>
        </main>

        <Toaster position="bottom-right" richColors closeButton />
      </div>
    </TooltipProvider>
  );
}
