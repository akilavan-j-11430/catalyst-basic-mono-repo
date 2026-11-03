"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Every `motion.*` element inherits these: the app's ease-out curve (`--ease-out` in
 * globals.css) at a short duration, and the OS reduced-motion setting, under which motion
 * drops transforms and keeps only the opacity fade.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </MotionConfig>
  );
}
