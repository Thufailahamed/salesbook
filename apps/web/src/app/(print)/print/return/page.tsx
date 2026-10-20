"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { SaleReturn } from "@shopbooks/shared";
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
import { usePageTitle } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { formatDate, formatDateTime, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={null}>
      <ReturnPrint />
    </React.Suspense>
  );
}

function ReturnPrint() {
  const params = useSearchParams();
  const id = params.get("id");
  const receipt = params.get("format") === "receipt";
  const money = useMoney();
  const { data: r } = useApiQuery<SaleReturn>(id ? `/returns/${id}` : null);
  usePageTitle(r ? `Credit note ${r.number}` : "Credit note");
  const settlement = r
    ? [
        { label: "Applied to invoice balance", value: r.appliedToInvoice },
        { label: "Applied to exchange", value: r.appliedToExchange },
        { label: "Added to store credit", value: r.toStoreCredit },
        { label: "Refunded", value: r.refunded },
      ].filter((s) => s.value > 0)
    : [];

  return (
    <>
      <PrintToolbar title={r ? `Credit note ${r.number}` : "Credit note"} backHref={id ? `/sales/returns/view?id=${id}` : "/sales/returns"} ready={!!r} />
      {r && receipt && (
        <PrintPage size="receipt">
          <ReceiptHeader />
          <ReceiptDivider />
          <ReceiptRow label="CREDIT NOTE" value={r.number} bold />
          <ReceiptRow label="Date" value={formatDateTime(r.createdAt)} />
          <ReceiptRow label="Invoice" value={r.invoiceNumber} />
          {r.customerName && <ReceiptRow label="Customer" value={r.customerName} />}
          <ReceiptDivider />
          {(r.lines ?? []).map((l) => (
            <div key={l.id} className="mb-1">
              <p className="font-semibold">{l.name}</p>
              <ReceiptRow label={`  ${formatQty(l.quantity)} returned`} value={money.format(l.total, { symbol: false })} />
            </div>
          ))}
          <ReceiptDivider double />
          <ReceiptRow label="TOTAL CREDIT" value={money.format(r.total)} bold />
          <ReceiptDivider />
          {settlement.map((s) => (
            <ReceiptRow key={s.label} label={s.label} value={money.format(s.value)} />
          ))}
          <ReceiptFooter />
        </PrintPage>
      )}
      {r && !receipt && (
        <PrintPage>
          <DocHeader
            title="Credit note"
            number={r.number}
            meta={[
              { label: "Date", value: formatDate(r.date) },
              { label: "Against invoice", value: r.invoiceNumber },
            ]}
          />
          <div className="my-6 grid grid-cols-2 gap-6">
            <PartyBlock label="Customer" name={r.customerName ?? "Walk-in customer"} />
            {r.reason && <PartyBlock label="Reason" name={r.reason} />}
          </div>
          <PrintTable
            rows={r.lines ?? []}
            rowKey={(l) => l.id}
            columns={[
              { key: "item", header: "Item", cell: (l) => <span className="font-medium">{l.name}</span> },
              { key: "qty", header: "Qty", align: "right", cell: (l) => formatQty(l.quantity) },
              { key: "net", header: "Net", align: "right", cell: (l) => money.format(l.net, { symbol: false }) },
              { key: "tax", header: "Tax", align: "right", cell: (l) => money.format(l.tax, { symbol: false }) },
              { key: "total", header: "Credit", align: "right", cell: (l) => money.format(l.total, { symbol: false }) },
            ]}
          />
          <div className="mt-6">
            <TotalsBlock
              rows={[
                { label: "Net", value: money.format(r.netTotal) },
                { label: "Tax", value: money.format(r.taxTotal) },
                { label: "Total credit", value: money.format(r.total), strong: true },
                ...settlement.map((s) => ({ label: s.label, value: money.format(s.value), muted: true })),
              ]}
            />
          </div>
          <DocFooter />
        </PrintPage>
      )}
    </>
  );
}
