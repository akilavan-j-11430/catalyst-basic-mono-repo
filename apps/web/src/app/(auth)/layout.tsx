import type { ReactNode } from "react";
import { SignInCard } from "@/components/auth/sign-in-card";
import { HowItWorks, SIGN_IN_GRID, SignInBand } from "@/components/auth/sign-in-overview";
import { AppFooter, AppHeader, PAGE_COLUMN } from "@/components/shared/app-frame";
import { ThemeSwitch } from "@/components/shared/theme-switch";

// Not LayoutProps<...>: Next keys those by URL path, and a route group has none.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader actions={<ThemeSwitch />} />
      <SignInBand />
      <main className={`${PAGE_COLUMN} ${SIGN_IN_GRID} flex-1 items-start gap-y-10 pb-10`}>
        <SignInCard>{children}</SignInCard>
        <HowItWorks className="lg:col-start-1 lg:row-start-1 lg:pt-10" />
      </main>
      <AppFooter />
    </>
  );
}
