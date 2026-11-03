"use client";

import { useEffect, useRef, useState } from "react";
import { appUrl, authSession } from "@/catalyst/auth-client";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemePreference } from "@/lib/theme-preference";
import { cn } from "@/lib/utils";
import { ClientPath } from "@repo/routing/client-path";

const CONTAINER_ID = "catalyst-signin";
const IFRAME_ID = "iam_iframe";

/*
 * The IAM iframe loads this cross-origin and caches it by URL, and /public serves
 * it with no content hash, so a stale sheet survives a reload and the widget comes
 * back with the platform's own 520px layout. Bump on every edit to the file.
 */
const STYLESHEET = "/catalyst-signin.css?r=3";

const CONTENT_ALLOWANCE = 16;

/**
 * The email step's measured height (`.signin_container` plus the allowance), held until
 * the first real measurement. Matching it is what keeps the card from resizing when the
 * skeleton gives way to the form; re-measure if catalyst-signin.css changes the step.
 */
const INITIAL_HEIGHT = 242;

/**
 * Catalyst serves the IAM page from this same origin - that is how the SDK reaches
 * its document to patch placeholders - so the frame is sized to what it actually
 * renders rather than to a height guessed per step. Whatever a step needs, the
 * container grows to it and nothing inside is cut off.
 *
 * It measures `.signin_container`, IAM's own content box, and nothing else. The
 * document element stretches to the frame, so measuring it feeds the frame's own
 * height back in: each reading plus the allowance grew the frame, which grew the
 * next reading, and the card ran away past the viewport until IAM's page replaced
 * the blank one. Until `.signin_container` exists there is simply no reading.
 *
 * It has to re-attach on every `load`: `signIn` resolves the moment the iframe is
 * created, when `contentDocument` is still the blank document the browser gives it.
 */
function observeContentHeight(frame: HTMLIFrameElement, onHeight: (height: number) => void): () => void {
  let observer: ResizeObserver | null = null;
  const attach = (): void => {
    const content = frame.contentDocument?.querySelector(".signin_container");
    if (!content) {
      return;
    }
    observer?.disconnect();
    // The allowance keeps a focus ring or a floated action off the bottom edge.
    observer = new ResizeObserver(() => onHeight(content.scrollHeight + CONTENT_ALLOWANCE));
    observer.observe(content);
    onHeight(content.scrollHeight + CONTENT_ALLOWANCE);
  };
  frame.addEventListener("load", attach);
  attach();
  return () => {
    frame.removeEventListener("load", attach);
    observer?.disconnect();
  };
}

/**
 * The iframe cannot see this document's `.dark` class, so it is copied onto IAM's
 * root on every load and every switch. Its colour-scheme then matches the page's;
 * a mismatch would make the browser paint the frame an opaque white or black.
 */
function mirrorTheme(frame: HTMLIFrameElement): () => void {
  const apply = (): void => {
    frame.contentDocument?.documentElement.classList.toggle("dark", ThemePreference.isDark());
  };
  frame.addEventListener("load", apply);
  const unsubscribe = ThemePreference.subscribe(apply);
  apply();
  return () => {
    frame.removeEventListener("load", apply);
    unsubscribe();
  };
}

function useSignInFrame(): { failure: string | null; contentHeight: number | null } {
  const [failure, setFailure] = useState<string | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in development, and the SDK rebuilds the iframe
    // from scratch on every call.
    if (mounted.current) {
      return;
    }
    mounted.current = true;

    const stops: Array<() => void> = [];
    authSession()
      .then((auth) => auth.signIn(CONTAINER_ID, { redirectUrl: appUrl(ClientPath.Monitors), cssUrl: appUrl(STYLESHEET) }))
      .then(() => {
        const frame = document.getElementById(IFRAME_ID);
        if (!(frame instanceof HTMLIFrameElement)) {
          throw new Error("The sign-in frame was not mounted.");
        }
        stops.push(mirrorTheme(frame));
        stops.push(
          observeContentHeight(frame, (height) =>
            setContentHeight((current) => (current !== null && Math.abs(current - height) <= 2 ? current : height)),
          ),
        );
      })
      .catch(() => setFailure("The sign-in form could not be loaded. Reload to try again."));

    return () => stops.forEach((stop) => stop());
  }, []);

  return { failure, contentHeight };
}

/**
 * The email step drawn at the positions IAM renders it - field at 24px, button at 96px,
 * the forgot-password link at 158px - so the swap to the real form moves nothing.
 */
export function SignInSkeleton() {
  return (
    <div role="status" aria-label="Loading sign in" className="relative" style={{ height: INITIAL_HEIGHT }}>
      <ProgressBar className="fixed inset-x-0 top-0 z-50" />
      <div className="skeleton absolute inset-x-0 top-6 h-[42px]" />
      <div className="skeleton absolute inset-x-0 top-24 h-[42px]" />
      <div className="skeleton absolute top-[157px] left-1/2 h-3.5 w-28 -translate-x-1/2" />
    </div>
  );
}

export function SignInWidget() {
  const { failure, contentHeight } = useSignInFrame();
  const measured = contentHeight !== null;
  const height = contentHeight ?? INITIAL_HEIGHT;

  if (failure !== null) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{failure}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      {!measured && <SignInSkeleton />}
      {/* The SDK replaces this element's contents, so it must stay empty in JSX.
      The height is explicit and in pixels on purpose: the iframe the SDK mounts is
      `height: 100%`, and a percentage height only resolves against a definite one, so
      it sits on this element, the iframe's own parent. Until the first measurement the
      frame is laid out but invisible - `hidden` would give it no layout, and nothing
      inside it could be measured. The SDK also leaves the iframe `display: inline`,
      whose baseline gap would overflow this box. The negative inset cancels the 6px
      gutter catalyst-signin.css keeps for the focus ring, so the fields line up with
      the heading above. */}
      <div
        id={CONTAINER_ID}
        className={cn("absolute -inset-x-1.5 top-0 [&>iframe]:block", !measured && "invisible")}
        style={{ height }}
      />
    </div>
  );
}
