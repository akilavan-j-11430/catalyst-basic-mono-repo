import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { SignedInAccount } from "@/components/auth/signed-in-account";
import { AppFooter, AppHeader } from "@/components/shared/app-frame";
import { PageLoader } from "@/components/shared/page-loader";
import { ThemeSwitch } from "@/components/shared/theme-switch";

// Every route in this group is behind the gate; /sign-in sits in (auth). The header and
// footer live here, not in each page, so moving between the list and a monitor keeps them
// mounted. Inside the gate, because the account menu needs the signed-in user.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <AuthGate fallback={<PageLoader label="Loading your monitors..." />}>
        <AppHeader
          actions={
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeSwitch />
              <SignedInAccount />
            </div>
          }
        />
        {children}
        <AppFooter />
      </AuthGate>
    </div>
  );
}
