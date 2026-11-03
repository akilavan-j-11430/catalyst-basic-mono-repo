import { cn } from "@/lib/utils";

const BARS = 7;
const STAGGER_MS = 110;

/**
 * A part of the page that is still loading - one monitor's drawer, the next page of the
 * list. `PageLoader` is for a whole page; this sits inside one, so it is smaller and
 * quieter: a short row of bars rising in turn, the uptime strip's shape. The caller names
 * what is loading.
 */
export function ContentLoader({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-col items-center justify-center gap-3 py-10", className)}>
      <div aria-hidden className="flex h-5 items-end gap-1">
        {Array.from({ length: BARS }, (_, index) => (
          <span
            key={index}
            className="content-loader-bar h-full w-1 rounded-sm bg-primary/70"
            style={{ animationDelay: `${index * STAGGER_MS}ms` }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
