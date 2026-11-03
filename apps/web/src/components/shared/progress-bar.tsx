import { cn } from "@/lib/utils";

/**
 * Indeterminate on purpose: nothing here knows how long a wait will take, so the fill
 * creeps toward the end without reaching it and a highlight keeps crossing it, which
 * is what tells a long wait apart from a frozen page. The caller labels the wait.
 */
export function ProgressBar({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative h-0.5 overflow-hidden bg-primary/15", className)}>
      <div className="progress-trickle absolute inset-0 overflow-hidden bg-primary">
        <div className="progress-sheen h-full w-1/3 bg-linear-to-r from-transparent via-primary-foreground/70 to-transparent" />
      </div>
    </div>
  );
}
