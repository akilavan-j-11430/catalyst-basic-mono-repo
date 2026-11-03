"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * The sign-in card, and the client boundary its entrance needs - the layout around it
 * renders on the server. First in the DOM so a phone reaches the form before the figures;
 * on wide screens it moves to the right-hand column and rises into the band.
 */
export function SignInCard({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="-mt-6 flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-[0_24px_60px_-28px_rgb(0_0_0/0.35)] sm:p-8 lg:col-start-2 lg:row-start-1 lg:-mt-52"
    >
      {/* Here rather than in the page, so the route's loading state keeps it too. */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">Don&apos;t have an account? Ask your project admin to add you.</p>
      </div>
      {children}
    </motion.div>
  );
}
