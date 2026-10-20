"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { Purchase, Supplier } from "@shopbooks/shared";
import { DocFooter, DocHeader, PartyBlock, PrintPage, PrintTable, PrintToolbar, TotalsBlock } from "@/components/print/print-shell";
import { usePageTitle } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { formatDate, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={null}>
      <PurchasePrint />
    </React.Suspense>
  );
}

function PurchasePrint() {
  const id = useSearchParams().get("id");
  const money = useMoney();
  const { data: p } = useApiQuery<Purchase>(id ? `/purchases/${id}` : null);
  const supplier = useApiQuery<Supplier>(p ? `/suppliers/${p.supplierId}` : null);
  const ordered = p?.status === "ordered";
  const title = ordered ? "Purchase order" : "Purchase bill";
  usePageTitle(p ? `${title} ${p.number}` : title);
  const s = supplier.data;

  return (
    <>
      <PrintToolbar title={p ? `${title} ${p.number}` : title} backHref={id ? `/purchases/view?id=${id}` : "/purchases"} ready={!!p && !supplier.isLoading} />
      {p && (
        <PrintPage>
          <DocHeader
            title={title}
            number={p.number}
            meta={[
              { label: "Order date", value: formatDate(p.orderDate) },
              ...(p.receivedDate ? [{ label: "Received", value: formatDate(p.receivedDate) }] : []),
              ...(p.dueDate ? [{ label: "Due date", value: formatDate(p.dueDate) }] : []),
              ...(p.supplierRef ? [{ label: "Supplier ref", value: p.supplierRef }] : []),
            ]}
          />
          <div className="my-6 grid grid-cols-2 gap-6">
            <PartyBlock
              label="Supplier"
              name={p.supplierName ?? ""}
              lines={[s?.contactName, s?.address, [s?.phone, s?.email].filter(Boolean).join(" · "), s?.taxNumber ? `Tax no: ${s.taxNumber}` : null]}
            />
            <PartyBlock label={ordered ? "Deliver to" : "Received at"} name={p.locationName ?? ""} />
          </div>
          <PrintTable
            rows={p.lines ?? []}
            rowKey={(l) => l.id}
            columns={[
              { key: "n", header: "#", cell: (_, i) => i + 1, className: "w-8" },
              {
                key: "item",
                header: "Item",
                cell: (l) => (
                  <>
                    <p className="font-medium">{l.name}</p>
                    {l.sku && <p className="text-[11px] text-neutral-500">{l.sku}</p>}
                  </>
                ),
              },
              { key: "qty", header: "Qty", align: "right", cell: (l) => formatQty(l.quantity) },
              { key: "cost", header: "Unit cost", align: "right", cell: (l) => money.format(l.unitCost, { symbol: false }) },
              { key: "disc", header: "Discount", align: "right", cell: (l) => (l.lineDiscount + l.docDiscount ? money.format(l.lineDiscount + l.docDiscount, { symbol: false }) : "—") },
              { key: "tax", header: "Tax", align: "right", cell: (l) => (l.taxRate ? `${l.taxRate}%` : "—") },
              { key: "total", header: "Amount", align: "right", cell: (l) => money.format(l.total, { symbol: false }) },
            ]}
          />
          <div className="mt-6">
            <TotalsBlock
              rows={[
                { label: "Subtotal", value: money.format(p.subtotal + p.itemDiscount) },
                { label: "Discounts", value: `-${money.format(p.discountTotal)}`, hidden: p.discountTotal === 0 },
                { label: p.taxInclusive ? "Tax (included)" : "Tax", value: money.format(p.taxTotal), muted: p.taxInclusive },
                { label: "Freight", value: money.format(p.shipping), hidden: p.shipping === 0 },
                { label: "Total", value: money.format(p.total), strong: true },
                { label: "Paid", value: money.format(p.amountPaid), hidden: ordered },
                { label: "Balance due", value: money.format(p.amountDue), hidden: ordered || p.amountDue === 0 },
              ]}
            />
          </div>
          <DocFooter notes={p.note} footer="" />
        </PrintPage>
      )}
    </>
  );
}
