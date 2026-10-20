"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { Customer, Statement, Supplier } from "@shopbooks/shared";
import { DocHeader, PartyBlock, PrintPage, PrintTable, PrintToolbar, TotalsBlock } from "@/components/print/print-shell";
import { usePageTitle } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { formatDate, withQuery } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={null}>
      <StatementPrint />
    </React.Suspense>
  );
}

function StatementPrint() {
  const params = useSearchParams();
  const kind = params.get("kind") === "supplier" ? "supplier" : "customer";
  const id = params.get("id");
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const money = useMoney();
  const base = kind === "customer" ? "/customers" : "/suppliers";
  const { data: st } = useApiQuery<Statement>(id ? `${base}/${id}/statement` : null, { from, to });
  const party = useApiQuery<Customer | Supplier>(id ? `${base}/${id}` : null);
  usePageTitle(st ? `Statement · ${st.partyName}` : "Statement");
  const p = party.data;

  return (
    <>
      <PrintToolbar
        title={st ? `Statement · ${st.partyName}` : "Statement"}
        backHref={withQuery(`${base}/view`, { id })}
        ready={!!st && !!p}
      />
      {st && (
        <PrintPage>
          <DocHeader
            title="Statement of account"
            meta={[
              { label: "From", value: formatDate(st.from) },
              { label: "To", value: formatDate(st.to) },
              { label: "Issued", value: formatDate(new Date()) },
            ]}
          />
          <div className="my-6 grid grid-cols-2 gap-6">
            <PartyBlock label={kind === "customer" ? "Customer" : "Supplier"} name={st.partyName} lines={[p?.address, [p?.phone, p?.email].filter(Boolean).join(" · ")]} />
            <div className="text-right">
              <p className="text-[10.5px] font-semibold tracking-[0.1em] text-neutral-500 uppercase">
                {kind === "customer" ? "Amount owed" : "Balance"}
              </p>
              <p className="mt-1 font-display text-2xl font-semibold">{money.format(st.closingBalance)}</p>
            </div>
          </div>
          <PrintTable
            rows={[
              { date: st.from, description: "Opening balance", number: null, debit: 0, credit: 0, balance: st.openingBalance, key: "open" },
              ...st.entries.map((e, i) => ({ ...e, key: `${e.createdAt}-${i}` })),
            ]}
            rowKey={(r) => r.key}
            columns={[
              { key: "date", header: "Date", cell: (r) => formatDate(r.date) },
              { key: "ref", header: "Reference", cell: (r) => <span className="font-mono">{r.number ?? ""}</span> },
              { key: "desc", header: "Details", cell: (r) => r.description },
              { key: "dr", header: kind === "customer" ? "Charges" : "Bills", align: "right", cell: (r) => (r.debit ? money.format(r.debit, { symbol: false }) : "") },
              { key: "cr", header: "Payments", align: "right", cell: (r) => (r.credit ? money.format(r.credit, { symbol: false }) : "") },
              { key: "bal", header: "Balance", align: "right", cell: (r) => money.format(r.balance, { symbol: false }) },
            ]}
          />
          <div className="mt-6">
            <TotalsBlock
              rows={[
                { label: "Opening balance", value: money.format(st.openingBalance) },
                { label: kind === "customer" ? "Charges" : "Bills", value: money.format(st.totalDebit) },
                { label: "Payments & credits", value: `-${money.format(st.totalCredit)}` },
                { label: "Closing balance", value: money.format(st.closingBalance), strong: true },
              ]}
            />
          </div>
        </PrintPage>
      )}
    </>
  );
}
