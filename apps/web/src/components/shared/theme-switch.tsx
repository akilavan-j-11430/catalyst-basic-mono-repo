"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { ThemePreference } from "@/lib/theme-preference";

/** The server cannot know the stored theme, so it renders the light icon and the
 *  client corrects it after hydration. */
export function ThemeSwitch() {
  const dark = useSyncExternalStore(ThemePreference.subscribe, ThemePreference.isDark, () => false);
  const next = dark ? "light" : "dark";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => ThemePreference.set(next)}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
