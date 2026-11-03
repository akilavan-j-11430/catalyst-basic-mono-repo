"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  /** Merged over the defaults - a wider panel passes its own `max-w-*`. */
  className?: string;
}

/** A native `<dialog>` docked right: focus trap, Escape and the backdrop come with it. */
export function SidePanel({ open, onClose, label, children, className }: SidePanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => event.target === event.currentTarget && onClose()}
      aria-label={label}
      className={cn(
        "fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-xl border-l bg-background p-0 text-foreground transition-[translate,opacity] duration-300 ease-out backdrop:bg-foreground/30 starting:open:translate-x-6 starting:open:opacity-0",
        className,
      )}
    >
      {open && children}
    </dialog>
  );
}
