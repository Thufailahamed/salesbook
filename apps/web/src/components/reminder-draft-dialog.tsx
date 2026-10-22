"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Sparkles } from "lucide-react";
import type { ReminderDraft, ReminderDraftInput } from "@shopbooks/shared";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/form-field";
import { Money } from "@/components/money";
import { useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";

/** Drafts a reminder from the open documents. The text is copied, never sent from here. */
export function ReminderDraftDialog({
  open,
  onOpenChange,
  kind,
  partyId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: ReminderDraftInput["partyType"];
  partyId: string;
}) {
  const draft = useApiMutation((input: ReminderDraftInput) => api.post<ReminderDraft>("/ai/reminder-draft", input), {
    errorToast: true,
  });
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");

  const run = React.useCallback(() => draft.mutate({ partyType: kind, partyId }), [draft, kind, partyId]);
  React.useEffect(() => {
    if (open) run();
    // Draft again only when the dialog opens, not on every render of the mutation object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, partyId]);

  React.useEffect(() => {
    if (draft.data) {
      setSubject(draft.data.subject);
      setMessage(draft.data.message);
    }
  }, [draft.data]);

  const result = draft.data;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${message}`);
      toast.success("Copied. Paste it into your email or message app.");
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Draft a message
          </DialogTitle>
          <DialogDescription>
            {result ? (
              <>
                {result.openCount} open {result.openCount === 1 ? "document" : "documents"} ·{" "}
                {result.overdueCount > 0
                  ? `${result.overdueCount} overdue, oldest ${result.oldestDaysOverdue} days`
                  : "nothing overdue yet"}{" "}
                · Total <Money value={result.totalDue} className="font-medium" />
              </>
            ) : (
              "Reading the open documents…"
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {draft.isPending || !result ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <Field label="Subject" htmlFor="reminder-subject">
                <Input id="reminder-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field label="Message" htmlFor="reminder-message" hint="Check the amounts before you send it.">
                <Textarea id="reminder-message" rows={7} value={message} onChange={(e) => setMessage(e.target.value)} />
              </Field>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" loading={draft.isPending} onClick={run}>
            <Sparkles /> Draft again
          </Button>
          <Button onClick={copy} disabled={!message.trim()}>
            <Copy /> Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
