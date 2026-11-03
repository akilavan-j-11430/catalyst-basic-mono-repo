export type Theme = "light" | "dark";

/**
 * The colour theme, held as a `dark` class on `<html>` and remembered per browser.
 * The class is the single source of truth: the switch writes it, and anything that has
 * to follow it - the sign-in iframe - subscribes to it rather than to the switch.
 */
export class ThemePreference {
  private static readonly STORAGE_KEY = "lively-theme";

  /**
   * Inlined in `<head>` so it runs before first paint; applied after hydration, a stored
   * dark theme would flash light on every load. With nothing stored, the OS decides.
   */
  static readonly bootScript = `try{const t=localStorage.getItem("${ThemePreference.STORAGE_KEY}");if(t==="dark"||(t===null&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

  static isDark(): boolean {
    return document.documentElement.classList.contains("dark");
  }

  static set(theme: Theme): void {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(ThemePreference.STORAGE_KEY, theme);
    } catch {
      // Storage blocked (private mode, site data off): the switch still works for this visit.
    }
  }

  static subscribe(onChange: () => void): () => void {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }
}
