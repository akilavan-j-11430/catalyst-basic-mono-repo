import { redirect } from "next/navigation";
import { ClientPath } from "@repo/routing/client-path";

/** The app has no page of its own at `/` - the monitor list is where it starts. */
export default function RootPage() {
  redirect(ClientPath.Monitors);
}
