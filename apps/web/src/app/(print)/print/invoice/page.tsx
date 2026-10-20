"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { Invoice } from "@shopbooks/shared";
import { TENDER_LABELS } from "@shopbooks/shared";
import {
  DocFooter,
  DocHeader,
  PartyBlock,
  PrintPage,
  PrintTable,
  PrintToolbar,
  ReceiptDivider,
  ReceiptFooter,
  ReceiptHeader,
  ReceiptRow,
  TotalsBlock,
} from "@/components/print/print-shell";
import { Barcode } from "@/components/barcode";
import { usePageTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { formatDate, formatDateTime, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={null}>
      <InvoicePrint />
    </React.Suspense>
  );
}

function InvoicePrint() {
  const params = useSearchParams();
  const id = params.get("id");
  const format = params.get("format") === "receipt" ? "receipt" : "a4";
  const money = useMoney();
  const { business } = useSession();
  const { data: inv } = useApiQuery<Invoice>(id ? `/sales/${id}` : null);
  usePageTitle(inv ? `Invoice ${inv.number}` : "Invoice");

  const switchFormat = (f: "a4" | "receipt") => {
    const u = new URL(window.location.href);
    u.searchParams.set("format", f);
    u.searchParams.delete("autoprint");
    window.location.href = u.toString();
  };

  const lines = inv?.lines ?? [];
  const payments = (inv?.payments ?? []).filter((p) => p.status !== "void" && p.direction === "in");
  const change = payments.reduce((s, p) => s + (p.change ?? 0), 0);

  return (
    <>
      <PrintToolbar
        title={inv ? `Invoice ${inv.number}` : "Invoice"}
        backHref={id ? `/sales/view?id=${id}` : "/sales"}
        ready={!!inv}
        actions={
          <Button variant="outline" size="sm" onClick={() => switchFormat(format === "a4" ? "receipt" : "a4")}>
            {format === "a4" ? "Receipt format" : "A4 format"}
          </Button>
        }
      />
      {inv && format === "receipt" && (
        <PrintPage size="receipt">
          <ReceiptHeader />
          <ReceiptDivider />
          <ReceiptRow label={inv.status === "void" ? "VOID INVOICE" : "INVOICE"} value={inv.number} bold />
          <ReceiptRow label="Date" value={formatDateTime(inv.createdAt)} />
          {inv.customerName && <ReceiptRow label="Customer" value={inv.customerName} />}
          <ReceiptRow label="Served by" value={inv.salespersonName ?? inv.createdByName ?? ""} />
          <ReceiptDivider />
          {lines.map((l) => (
            <div key={l.id} className="mb-1">
              <p className="font-semibold">{l.name}</p>
              <ReceiptRow
                label={`  ${formatQty(l.quantity)} × ${money.format(l.unitPrice, { symbol: false })}`}
                value={money.format(l.quantity * l.unitPrice - l.lineDiscount, { symbol: false })}
              />
              {l.lineDiscount > 0 && <ReceiptRow label="  discount" value={`-${money.format(l.lineDiscount, { symbol: false })}`} />}
              {l.note && <p className="pl-2 italic">{l.note}</p>}
            </div>
          ))}
          <ReceiptDivider />
          <ReceiptRow label="Subtotal" value={money.format(inv.subtotal)} />
          {inv.docDiscount > 0 && <ReceiptRow label="Discount" value={`-${money.format(inv.docDiscount)}`} />}
          <ReceiptRow label={inv.taxInclusive ? "Tax (incl.)" : "Tax"} value={money.format(inv.taxTotal)} />
          {inv.shipping > 0 && <ReceiptRow label="Charges" value={money.format(inv.shipping)} />}
          {inv.roundOff !== 0 && <ReceiptRow label="Rounding" value={money.format(inv.roundOff)} />}
          <ReceiptDivider double />
          <ReceiptRow label="TOTAL" value={money.format(inv.total)} bold />
          <ReceiptDivider />
          {payments.map((p) => (
            <ReceiptRow key={p.id} label={p.methodName ?? TENDER_LABELS[p.tender]} value={money.format((p.tendered ?? p.amount) || p.amount)} />
          ))}
          {change > 0 && <ReceiptRow label="Change" value={money.format(change)} bold />}
          {inv.amountDue > 0 && <ReceiptRow label="Balance due" value={money.format(inv.amountDue)} bold />}
          {inv.dueDate && inv.amountDue > 0 && <ReceiptRow label="Due by" value={formatDate(inv.dueDate)} />}
          {business.loyaltyEnabled && inv.pointsEarned > 0 && <ReceiptRow label="Points earned" value={String(inv.pointsEarned)} />}
          <div className="mt-3 px-2">
            <Barcode value={inv.number} height={36} />
          </div>
          <ReceiptFooter />
        </PrintPage>
      )}
      {inv && format === "a4" && (
        <PrintPage>
          <DocHeader
            title={business.taxNumber ? "Tax invoice" : "Invoice"}
            number={inv.number}
            badge={inv.status === "void" ? <span className="rounded border border-red-600 px-2 py-0.5 text-xs font-bold text-red-600">VOID</span> : undefined}
            meta={[
              { label: "Date", value: formatDate(inv.date) },
              ...(inv.dueDate ? [{ label: "Due date", value: formatDate(inv.dueDate) }] : []),
              { label: "Status", value: inv.status === "void" ? "Void" : inv.paymentStatus === "paid" ? "Paid" : inv.paymentStatus === "partial" ? "Partially paid" : "Unpaid" },
            ]}
          />
          <div className="my-6 grid grid-cols-2 gap-6">
            <PartyBlock label="Bill to" name={inv.customerName ?? "Walk-in customer"} lines={[inv.customerPhone]} />
            <PartyBlock label="Sold from" name={inv.locationName ?? ""} lines={[inv.salespersonName ? `Salesperson: ${inv.salespersonName}` : null]} />
          </div>
          <PrintTable
            rows={lines}
            rowKey={(l) => l.id}
            columns={[
              { key: "n", header: "#", cell: (_, i) => i + 1, className: "w-8" },
              {
                key: "item",
                header: "Item",
                cell: (l) => (
                  <>
                    <p className="font-medium">{l.name}</p>
                    {(l.sku || l.note) && <p className="text-[11px] text-neutral-500">{[l.sku, l.note].filter(Boolean).join(" · ")}</p>}
                  </>
                ),
              },
              { key: "qty", header: "Qty", align: "right", cell: (l) => formatQty(l.quantity) },
              { key: "price", header: "Unit price", align: "right", cell: (l) => money.format(l.unitPrice, { symbol: false }) },
              { key: "disc", header: "Discount", align: "right", cell: (l) => (l.lineDiscount + l.docDiscount ? money.format(l.lineDiscount + l.docDiscount, { symbol: false }) : "—") },
              { key: "tax", header: "Tax", align: "right", cell: (l) => (l.taxRate ? `${l.taxRate}%` : "—") },
              { key: "total", header: "Amount", align: "right", cell: (l) => money.format(l.total, { symbol: false }) },
            ]}
          />
          <div className="mt-6">
            <TotalsBlock
              rows={[
                { label: "Subtotal", value: money.format(inv.subtotal + inv.itemDiscount) },
                { label: "Discounts", value: `-${money.format(inv.discountTotal)}`, hidden: inv.discountTotal === 0 },
                { label: inv.taxInclusive ? "Tax (included)" : "Tax", value: money.format(inv.taxTotal), muted: inv.taxInclusive },
                { label: "Charges", value: money.format(inv.shipping), hidden: inv.shipping === 0 },
                { label: "Rounding", value: money.format(inv.roundOff), hidden: inv.roundOff === 0 },
                { label: "Total", value: money.format(inv.total), strong: true },
                { label: "Returned", value: `-${money.format(inv.amountReturned)}`, hidden: inv.amountReturned === 0 },
                { label: "Paid", value: money.format(inv.amountPaid) },
                { label: "Balance due", value: money.format(inv.amountDue), hidden: inv.amountDue === 0 },
              ]}
            />
          </div>
          {payments.length > 0 && (
            <p className="mt-4 text-[11.5px] text-neutral-500">
              Payments: {payments.map((p) => `${p.methodName ?? TENDER_LABELS[p.tender]} ${money.format(p.amount)}`).join(" · ")}
            </p>
          )}
          <DocFooter notes={inv.note} terms={business.invoiceTerms} />
        </PrintPage>
      )}
    </>
  );
}
