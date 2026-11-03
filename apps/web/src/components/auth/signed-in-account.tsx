"use client";

import { LogOut } from "lucide-react";
import { appUrl, authSession, type SignedInUser } from "@/catalyst/auth-client";
import { useSignedInUser } from "@/components/auth/auth-gate";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClientPath } from "@repo/routing/client-path";

function displayName(user: SignedInUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full === "" ? user.emailId : full;
}

/** Up to two letters: first and last name when both exist, else the first character. */
function initials(user: SignedInUser): string {
  const nameParts = [user.firstName, user.lastName].filter((part): part is string => Boolean(part));
  const letters = nameParts.length > 0 ? nameParts.map((part) => part[0]).join("") : user.emailId[0];
  return (letters ?? "?").slice(0, 2).toUpperCase();
}

/** Who is signed in, behind one round button in the header; the card holds sign-out. */
export function SignedInAccount() {
  const user = useSignedInUser();
  const name = displayName(user);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Account - ${name}`}
          title={name}
          className="rounded-full bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/15 hover:text-primary"
        >
          {initials(user)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="flex w-64 flex-col gap-4 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{user.emailId}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void authSession().then((auth) => auth.signOut(appUrl(ClientPath.SignIn)))}
        >
          <LogOut aria-hidden />
          Sign out
        </Button>
      </PopoverContent>
    </Popover>
  );
}
