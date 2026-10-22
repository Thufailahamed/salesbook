"use client";

import * as React from "react";
import { CloudOff, RefreshCw, TriangleAlert, UploadCloud } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { useOnline, useOutbox } from "@/hooks/use-offline";
import { useSession } from "@/hooks/use-session";
import { outboxDel, outboxPut } from "@/lib/offline-db";
import { cn, formatTime } from "@/lib/utils";
import { syncNow } from "./offline-runner";

/** Header pill: shows "Offline" and/or how many sales are waiting to sync; opens the list of queued sales. */
export function OfflineStatus() {
  const online = useOnline();
  const { business, user } = useSession();
  const mine = useOutbox().filter((r) => r.businessId === business.id && r.userId === user.id);
  const [open, setOpen] = React.useState(false);
  const failed = mine.filter((r) => r.status === "failed").length;
  if (online && mine.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 transition-colors",
          failed > 0 ? "bg-destructive/15 text-destructive ring-destructive/30" : "bg-warning/15 text-warning ring-warning/30",
        )}
      >
        {failed > 0 ? <TriangleAlert className="size-3.5" /> : online ? <UploadCloud className="size-3.5" /> : <CloudOff className="size-3.5" />}
        {!online && <span>Offline</span>}
        {mine.length > 0 && (
          <span>
            {!online && "· "}
            {mine.length} to sync
          </span>
        )}
      </button>
      <OutboxDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function OutboxDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const online = useOnline();
  const { business, user } = useSession();
  const rows = useOutbox().filter((r) => r.businessId === business.id && r.userId === user.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Sales waiting to sync</DialogTitle>
          <DialogDescription>
            {online
              ? "These were rung up without a connection. They are sent automatically."
              : "You are offline. Sales are saved on this device and sent as soon as the connection is back."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-2">
          {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Everything is synced.</p>}
          {rows.map((r) => (
            <div key={r.ref} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[12.5px]">OFFLINE-{r.ref.slice(0, 6).toUpperCase()}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {formatTime(r.createdAt)} · {r.summary.itemCount} item{r.summary.itemCount === 1 ? "" : "s"}
                    {r.summary.customerName && ` · ${r.summary.customerName}`}
                  </p>
                </div>
                <Money value={r.summary.total} className="font-semibold" />
              </div>
              {r.status === "failed" && (
                <div className="mt-2 grid gap-2">
                  <p className="text-[12.5px] text-destructive">The server rejected this sale: {r.error}</p>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await outboxPut({ ...r, status: "pending", error: undefined });
                        syncNow();
                      }}
                    >
                      Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (window.confirm("Discard this sale? It will not be recorded in your books.")) void outboxDel(r.ref);
                      }}
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={syncNow} disabled={!online || rows.length === 0}>
            <RefreshCw /> Sync now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
