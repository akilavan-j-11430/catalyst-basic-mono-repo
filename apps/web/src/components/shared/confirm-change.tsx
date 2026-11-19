"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmChangeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The action as a question, naming the thing it acts on: "Create your account?" */
  title: string;
  /** What will happen, in the person's terms - and whether it can be undone. */
  description: ReactNode;
  /** The same verb as the button that opened it: "Create account", never "Yes". */
  confirmLabel: string;
  /** Shown on the confirm button while the change runs: "Creating account..." */
  pendingLabel: string;
  tone?: "default" | "destructive";
  pending: boolean;
  onConfirm: () => void;
}

/**
 * The one popup that asks before a change is written - `.claude/rules/nextjs/consent.md`.
 * Cancel holds the focus when it opens, so a stray Enter never confirms. While the change
 * runs both buttons are disabled and the popup cannot be dismissed, so it cannot run twice;
 * the component that opened it closes it when the change ends.
 */
export function ConfirmChange({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone = "default",
  pending,
  onConfirm,
}: ConfirmChangeProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
