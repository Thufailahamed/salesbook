"use client";

import * as React from "react";
import { AlertTriangle, Info } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** destructive = red confirm button + warning icon */
  tone?: "default" | "destructive";
  /** Ask for a reason (e.g. void reason). The promise then resolves to the text, or false when cancelled. */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
}

type Resolver = (value: boolean | string) => void;

const ConfirmContext = React.createContext<((opts: ConfirmOptions) => Promise<boolean | string>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ opts: ConfirmOptions; resolve: Resolver } | null>(null);
  const [reason, setReason] = React.useState("");

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    setReason("");
    return new Promise<boolean | string>((resolve) => setState({ opts, resolve }));
  }, []);

  const close = (value: boolean | string) => {
    state?.resolve(value);
    setState(null);
  };

  const opts = state?.opts;
  const destructive = opts?.tone === "destructive";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!state} onOpenChange={(o) => !o && close(false)}>
        <AlertDialogContent>
          <div className="flex gap-4">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                destructive ? "bg-destructive-soft text-destructive" : "bg-primary-soft text-primary",
              )}
            >
              {destructive ? <AlertTriangle className="size-5" /> : <Info className="size-5" />}
            </div>
            <AlertDialogHeader className="pt-1">
              <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
              {opts?.description && <AlertDialogDescription asChild><div>{opts.description}</div></AlertDialogDescription>}
            </AlertDialogHeader>
          </div>
          {opts?.requireReason && (
            <div className="grid gap-2">
              <Label htmlFor="confirm-reason">{opts.reasonLabel ?? "Reason"}</Label>
              <Textarea
                id="confirm-reason"
                autoFocus
                value={reason}
                placeholder={opts.reasonPlaceholder ?? "Add a short reason…"}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {opts?.cancelText ?? "Cancel"}
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={!!opts?.requireReason && reason.trim().length === 0}
              onClick={() => close(opts?.requireReason ? reason.trim() : true)}
            >
              {opts?.confirmText ?? "Confirm"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Promise-based confirmation.
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete product?", tone: "destructive" }))) return;
 *   const reason = await confirm({ title: "Void invoice", requireReason: true }); // string | false
 */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
