"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { currentUser, type SignedInUser } from "@/catalyst/auth-client";
import { ClientPath } from "@repo/routing/client-path";

const SignedInUserContext = createContext<SignedInUser | null>(null);

/** Only valid below an `AuthGate`, which renders nothing until the user is known. */
export function useSignedInUser(): SignedInUser {
  const user = useContext(SignedInUserContext);
  if (user === null) {
    throw new Error("useSignedInUser must be called inside an AuthGate.");
  }
  return user;
}

/**
 * Gates everything below it on a Catalyst session: children never render for a
 * signed-out visitor, who is sent to sign-in instead. The check is client-side
 * because a Catalyst session can only be validated by asking the platform, which
 * Next middleware cannot do without a per-request call out.
 *
 * `fallback` is the shape of the page being gated, so the wait reads as that page
 * arriving rather than as a separate screen in front of it.
 */
export function AuthGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const router = useRouter();

  useEffect(() => {
    // `replace`, not `push`: otherwise Back from /sign-in lands here and bounces.
    currentUser()
      .then((found) => (found === null ? router.replace(ClientPath.SignIn) : setUser(found)))
      .catch(() => router.replace(ClientPath.SignIn));
  }, [router]);

  if (user === null) {
    return fallback;
  }

  return <SignedInUserContext.Provider value={user}>{children}</SignedInUserContext.Provider>;
}
