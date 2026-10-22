"use client";

import type { TaxReport } from "@shopbooks/shared";
import { ReportPage, ReportSection } from "@/components/report-shell";
import { StatCard } from "@/components/stat-card";
import { KeyValue } from "@/components/key-value";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";

export default function TaxReportPage() {
  const money = useMoney();
  return (
    <ReportPage<TaxReport>
      path="/reports/tax"
      title="Tax report"
      description="Tax collected on sales against tax you can recover."
      controls={{ range: true, preset: "lastMonth" }}
      csv={(r) => [
        ["Rate %", "Taxable sales", "Sales tax", "Taxable purchases", "Purchase tax"],
        ...r.byRate.map((x) => [x.rate, money.toMajor(x.taxableSales), money.toMajor(x.salesTax), money.toMajor(x.taxablePurchases), money.toMajor(x.purchaseTax)]),
        [],
        ["Output tax", money.toMajor(r.outputTax)],
        ["Input tax", money.toMajor(r.inputTax)],
        ["Net payable", money.toMajor(r.netPayable)],
      ]}
    >
      {(r) => (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Output tax (collected)" value={money.format(r.outputTax)} tone="warning" />
            <StatCard label="Input tax (recoverable)" value={money.format(r.inputTax)} tone="info" />
            <StatCard
              variant="feature"
              label={r.netPayable >= 0 ? "Net tax payable" : "Net tax refundable"}
              value={money.format(Math.abs(r.netPayable))}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <ReportSection title="Output tax">
              <KeyValue
                layout="inline"
                items={[
                  { label: "Tax on sales", value: <Money value={r.salesTax} /> },
                  { label: "Less: tax on sales returns", value: <Money value={-r.salesReturnsTax} dashZero /> },
                  { label: "Output tax", value: <Money value={r.outputTax} className="font-semibold" /> },
                ]}
              />
            </ReportSection>
            <ReportSection title="Input tax">
              <KeyValue
                layout="inline"
                items={[
                  { label: "Tax on purchases", value: <Money value={r.purchaseTax} /> },
                  { label: "Less: tax on purchase returns", value: <Money value={-r.purchaseReturnsTax} dashZero /> },
                  { label: "Tax on expenses", value: <Money value={r.expenseTax} dashZero /> },
                  { label: "Input tax", value: <Money value={r.inputTax} className="font-semibold" /> },
                ]}
              />
            </ReportSection>
          </div>
          <ReportSection title="By tax rate" flush>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Rate</TableHead>
                  <TableHead align="right">Taxable sales</TableHead>
                  <TableHead align="right">Sales tax</TableHead>
                  <TableHead align="right" className="hidden sm:table-cell">Taxable purchases</TableHead>
                  <TableHead align="right" className="hidden sm:table-cell">Purchase tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.byRate.map((x) => (
                  <TableRow key={x.rate} className="hover:bg-transparent">
                    <TableCell className="font-medium">{x.rate}%</TableCell>
                    <TableCell numeric><Money value={x.taxableSales} /></TableCell>
                    <TableCell numeric><Money value={x.salesTax} /></TableCell>
                    <TableCell numeric className="hidden sm:table-cell"><Money value={x.taxablePurchases} /></TableCell>
                    <TableCell numeric className="hidden sm:table-cell"><Money value={x.purchaseTax} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportSection>
        </div>
      )}
    </ReportPage>
  );
}
