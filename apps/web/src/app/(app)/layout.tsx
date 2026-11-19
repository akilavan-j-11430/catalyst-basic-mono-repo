import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { RequestSession } from "@/catalyst/request-session";

// Every route in this group needs a signed-in user; /sign-in and /sign-up sit in (auth).
// A signed-out visitor is turned away here, on the server, before any HTML is sent. Each page
// still lists the scopes it reads with withCatalystPage, since a layout does not re-run on a
// client-side navigation.
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!RequestSession.isSignedIn(await headers())) {
    redirect("/sign-in");
  }
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      {children}
    </main>
  );
}
