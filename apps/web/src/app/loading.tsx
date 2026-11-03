import { PageLoader } from "@/components/shared/page-loader";

/** The catch-all for any route without a loader of its own, so a page never sits blank. */
export default function RootLoading() {
  return <PageLoader label="Loading Lively..." />;
}
