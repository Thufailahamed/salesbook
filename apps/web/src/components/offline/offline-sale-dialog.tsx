"use client";

import { CloudOff, Printer } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import type { OutboxSale } from "@/lib/offline-db";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Shown instead of the normal "Sale complete" dialog when a sale was saved for later. */
export function OfflineSaleDialog({ sale, onNewSale }: { sale: OutboxSale | null; onNewSale: () => void }) {
  const money = useMoney();
  const { business } = useSession();

  const print = () => {
    if (!sale) return;
    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) return;
    const rows = sale.summary.lines
      .map((l) => `<tr><td>${esc(l.name)}<br><small>${l.quantity} × ${money.format(l.unitPrice)}</small></td><td class="r">${money.format(l.total)}</td></tr>`)
      .join("");
    const pays = sale.summary.payments.map((p) => `<tr><td>${esc(p.label)}</td><td class="r">${money.format(p.amount)}</td></tr>`).join("");
    w.document.write(`<!doctype html><title>Receipt</title><style>
      body{font:13px/1.4 ui-monospace,Menlo,monospace;width:300px;margin:12px auto}h1{font-size:16px;text-align:center;margin:0}
      p{text-align:center;margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:2px 0;vertical-align:top}.r{text-align:right}
      hr{border:0;border-top:1px dashed #000;margin:8px 0}small{color:#444}</style>
      <h1>${esc(business.name)}</h1><p>${new Date(sale.createdAt).toLocaleString()}</p><hr>
      <table>${rows}</table><hr>
      <table><tr><td><b>Total</b></td><td class="r"><b>${money.format(sale.summary.total)}</b></td></tr>${pays}
      ${sale.summary.change > 0 ? `<tr><td>Change</td><td class="r">${money.format(sale.summary.change)}</td></tr>` : ""}</table><hr>
      <p>Offline copy · ref ${esc(sale.ref.slice(0, 6).toUpperCase())}</p><p>The invoice number is assigned when this sale syncs.</p>
      <script>window.onload=function(){window.print()}</script>`);
    w.document.close();
  };

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onNewSale()}>
      <DialogContent size="sm" hideClose onEscapeKeyDown={onNewSale}>
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-warning/15 text-warning">
            <CloudOff className="size-7" />
          </span>
          <DialogTitle>Sale saved offline</DialogTitle>
          <DialogDescription>It will be recorded automatically when the connection is back.</DialogDescription>
        </div>
        <DialogBody className="grid gap-2">
          {sale && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <Money value={sale.summary.total} className="font-semibold" />
              </div>
              {sale.summary.change > 0 && (
                <div className="mt-2 rounded-xl bg-highlight-soft px-4 py-3 text-center">
                  <p className="label-caps">Change due</p>
                  <p className="figure text-4xl">{money.format(sale.summary.change)}</p>
                </div>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={print}>
            <Printer /> Receipt
          </Button>
          <Button size="lg" onClick={onNewSale} autoFocus>
            New sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
