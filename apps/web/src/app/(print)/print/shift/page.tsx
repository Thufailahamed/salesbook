"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { ShiftReport } from "@shopbooks/shared";
import { PrintPage, PrintToolbar, ReceiptDivider, ReceiptHeader, ReceiptRow } from "@/components/print/print-shell";
import { usePageTitle } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { formatDateTime, formatNumber } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={null}>
      <ShiftPrint />
    </React.Suspense>
  );
}

/** Z-report (closed) or X-report (open shift) on a thermal receipt. */
function ShiftPrint() {
  const id = useSearchParams().get("id");
  const money = useMoney();
  const { data: s } = useApiQuery<ShiftReport>(id ? `/shifts/${id}` : null);
  const kind = s?.status === "closed" ? "Z-REPORT" : "X-REPORT";
  usePageTitle(s ? `${kind} ${s.number}` : "Shift report");
  const f = (v: number) => money.format(v);

  return (
    <>
      <PrintToolbar title={s ? `${kind} · ${s.number}` : "Shift report"} backHref={id ? `/registers/view?id=${id}` : "/registers"} ready={!!s} />
      {s && (
        <PrintPage size="receipt">
          <ReceiptHeader />
          <ReceiptDivider />
          <ReceiptRow label={kind} value={s.number} bold />
          <ReceiptRow label="Location" value={s.locationName ?? ""} />
          <ReceiptRow label="Cashier" value={s.userName ?? ""} />
          <ReceiptRow label="Opened" value={formatDateTime(s.openedAt)} />
          {s.closedAt && <ReceiptRow label="Closed" value={formatDateTime(s.closedAt)} />}
          <ReceiptDivider />
          <p className="font-bold">SALES</p>
          <ReceiptRow label={`Invoices (${formatNumber(s.invoiceCount)})`} value={f(s.salesTotal)} />
          <ReceiptRow label={`Returns (${formatNumber(s.returnsCount)})`} value={`-${f(s.returnsTotal)}`} />
          <ReceiptRow label="Discounts given" value={f(s.discountTotal)} />
          <ReceiptRow label="Tax collected" value={f(s.taxTotal)} />
          <ReceiptDivider />
          <p className="font-bold">BY METHOD</p>
          {s.byMethod.map((m) => (
            <ReceiptRow key={`${m.methodId}-${m.name}`} label={m.name} value={m.refunded ? `${f(m.collected)} / -${f(m.refunded)}` : f(m.collected)} />
          ))}
          <ReceiptDivider />
          <p className="font-bold">CASH DRAWER</p>
          <ReceiptRow label="Opening float" value={f(s.openingFloat)} />
          <ReceiptRow label="Cash sales" value={f(s.cashSales)} />
          <ReceiptRow label="Cash refunds" value={`-${f(s.cashRefunds)}`} />
          <ReceiptRow label="Pay-ins" value={f(s.payIns)} />
          <ReceiptRow label="Pay-outs" value={`-${f(s.payOuts)}`} />
          <ReceiptDivider double />
          <ReceiptRow label="Expected cash" value={f(s.expectedCash)} bold />
          {s.countedCash !== null && <ReceiptRow label="Counted cash" value={f(s.countedCash)} bold />}
          {s.difference !== null && <ReceiptRow label={s.difference >= 0 ? "Over" : "Short"} value={f(s.difference)} bold />}
          {s.movements.length > 0 && (
            <>
              <ReceiptDivider />
              <p className="font-bold">PAY-INS / PAY-OUTS</p>
              {s.movements.map((m) => (
                <ReceiptRow key={m.id} label={`${m.type === "pay_in" ? "+" : "-"} ${m.reason}`} value={f(m.amount)} />
              ))}
            </>
          )}
          {s.denominations && Object.keys(s.denominations).length > 0 && (
            <>
              <ReceiptDivider />
              <p className="font-bold">COUNT</p>
              {Object.entries(s.denominations)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([d, n]) => (
                  <ReceiptRow key={d} label={`${d} × ${n}`} value={f(money.toMinor(Number(d)) * n)} />
                ))}
            </>
          )}
          {s.closingNote && (
            <>
              <ReceiptDivider />
              <p>{s.closingNote}</p>
            </>
          )}
          <ReceiptDivider />
          <p className="mt-6 text-center">Signature ____________________</p>
        </PrintPage>
      )}
    </>
  );
}
