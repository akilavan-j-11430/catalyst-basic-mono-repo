import Link from "next/link";
import { ClientPath } from "@repo/routing/client-path";
import { Button } from "@/components/ui/button";

/** The beat from the Lively mark, then nothing: the line runs flat to the edge. */
function Flatline() {
  return (
    <svg viewBox="0 0 240 40" aria-hidden className="h-10 w-full max-w-sm" preserveAspectRatio="none">
      <path
        d="M0 24h48l7-15 9 30 7-17h9"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M80 24H240" fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-border" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Something asked for is not there - an unknown page, or a monitor that was deleted. One
 * way out, back to the monitors. The caller says what is missing.
 */
export function NotFoundState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <Flatline />
      <div className="flex flex-col items-center gap-2">
        <p className="font-mono text-sm text-muted-foreground tabular-nums">404</p>
        <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{detail}</p>
      </div>
      <Button asChild>
        <Link href={ClientPath.Monitors}>Go to monitors</Link>
      </Button>
    </div>
  );
}
