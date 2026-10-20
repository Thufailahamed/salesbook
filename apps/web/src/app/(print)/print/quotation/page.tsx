"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { Quotation } from "@shopbooks/shared";
import { DocFooter, DocHeader, PartyBlock, PrintPage, PrintTable, PrintToolbar, TotalsBlock } from "@/components/print/print-shell";
import { usePageTitle } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { formatDate, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={null}>
      <QuotationPrint />
    </React.Suspense>
  );
}

function QuotationPrint() {
  const id = useSearchParams().get("id");
  const money = useMoney();
  const { data: q } = useApiQuery<Quotation>(id ? `/quotations/${id}` : null);
  usePageTitle(q ? `Quotation ${q.number}` : "Quotation");

  return (
    <>
      <PrintToolbar title={q ? `Quotation ${q.number}` : "Quotation"} backHref={id ? `/sales/quotations/view?id=${id}` : "/sales/quotations"} ready={!!q} />
      {q && (
        <PrintPage>
          <DocHeader
            title="Quotation"
            number={q.number}
            meta={[
              { label: "Date", value: formatDate(q.date) },
              ...(q.validUntil ? [{ label: "Valid until", value: formatDate(q.validUntil) }] : []),
            ]}
          />
          <div className="my-6 grid grid-cols-2 gap-6">
            <PartyBlock label="Prepared for" name={q.customerName ?? "—"} lines={[q.customerPhone]} />
            <PartyBlock label="Prepared by" name={q.createdByName ?? ""} lines={[q.locationName]} />
          </div>
          <PrintTable
            rows={q.lines ?? []}
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
              { key: "price", header: "Unit price", align: "right", cell: (l) => money.format(l.unitPrice, { symbol: false }) },
              { key: "disc", header: "Discount", align: "right", cell: (l) => (l.lineDiscount + l.docDiscount ? money.format(l.lineDiscount + l.docDiscount, { symbol: false }) : "—") },
              { key: "tax", header: "Tax", align: "right", cell: (l) => (l.taxRate ? `${l.taxRate}%` : "—") },
              { key: "total", header: "Amount", align: "right", cell: (l) => money.format(l.total, { symbol: false }) },
            ]}
          />
          <div className="mt-6">
            <TotalsBlock
              rows={[
                { label: "Subtotal", value: money.format(q.subtotal) },
                { label: "Discounts", value: `-${money.format(q.discountTotal)}`, hidden: q.discountTotal === 0 },
                { label: q.taxInclusive ? "Tax (included)" : "Tax", value: money.format(q.taxTotal), muted: q.taxInclusive },
                { label: "Charges", value: money.format(q.shipping), hidden: q.shipping === 0 },
                { label: "Total", value: money.format(q.total), strong: true },
              ]}
            />
          </div>
          <DocFooter notes={q.notes} terms={q.terms} />
        </PrintPage>
      )}
    </>
  );
}
