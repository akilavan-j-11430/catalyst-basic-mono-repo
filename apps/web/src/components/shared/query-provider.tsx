"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ClientPath } from "@repo/routing/client-path";
import { SignInRequired } from "@/catalyst/auth-client";
import { ApiError } from "@/services/api/client";

const MAX_RETRIES = 3;

/** A 4xx answers the same way however often it is asked, so it is never retried - nor is a
 *  session that has ended. */
function isClientError(error: Error): boolean {
  const isClientStatus = error instanceof ApiError && error.status !== undefined && error.status >= 400 && error.status < 500;
  return isClientStatus || error instanceof SignInRequired;
}

/** The session ended: no token could be issued, or the API answered 401. */
function needsSignIn(error: Error): boolean {
  return error instanceof SignInRequired || (error instanceof ApiError && error.status === 401);
}

/**
 * The one error handler: every failed query and mutation lands here, so no call site
 * handles errors of its own. An `ApiError` already carries the message the API chose;
 * anything else is a bug on this side and gets a generic line rather than a stack trace.
 *
 * One exception: a query answered 404 is a page showing something that is not there, and
 * that page says so itself ("No monitor here") - a toast on top would say it twice. A
 * mutation's 404 still toasts, since nothing else reports it.
 *
 * And an ended session is not an error to show: it goes to sign-in. A full navigation, so
 * the in-memory API token goes with the page.
 */
function createQueryClient(): QueryClient {
  const onError = (error: Error): void => {
    if (needsSignIn(error)) {
      window.location.replace(ClientPath.SignIn);
      return;
    }
    const message = error instanceof ApiError ? error.message : "Something went wrong. Try again.";
    // Keyed by its message: a list refetching every 15 seconds against a failing API
    // replaces the one toast instead of stacking a new one each time.
    toast.error(message, { id: message });
  };
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => !(error instanceof ApiError && error.status === 404) && onError(error),
    }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: { retry: (failureCount, error) => !isClientError(error) && failureCount < MAX_RETRIES },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // Held in state so the cache is created once per client and never shared across renders.
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
