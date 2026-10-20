"use client";

import * as React from "react";
import { Barcode } from "@/components/barcode";
import { PrintToolbar } from "@/components/print/print-shell";
import { EmptyState } from "@/components/empty-state";
import { usePageTitle } from "@/components/page-header";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { LABELS_STORAGE_KEY, type LabelJob } from "@/lib/labels";

export default function LabelsPrintPage() {
  usePageTitle("Barcode labels");
  const money = useMoney();
  const { business } = useSession();
  const [job, setJob] = React.useState<LabelJob | null | undefined>(undefined);
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LABELS_STORAGE_KEY);
      setJob(raw ? (JSON.parse(raw) as LabelJob) : null);
    } catch {
      setJob(null);
    }
  }, []);

  const labels = job ? job.items.flatMap((i) => Array.from({ length: Math.max(0, Math.floor(i.copies)) }, () => i)) : [];
  const cols = job?.columns ?? 3;
  const barHeight = cols >= 5 ? 26 : cols === 4 ? 32 : cols === 3 ? 38 : 48;

  return (
    <>
      <PrintToolbar title={`${labels.length} labels`} backHref="/products/labels" ready={job !== undefined && labels.length > 0} />
      {job === undefined ? null : labels.length === 0 ? (
        <div className="p-10">
          <EmptyState title="Nothing to print" description="Choose items on the labels page first." />
        </div>
      ) : (
        <div className="flex justify-center px-4 py-8 print:block print:p-0">
          <style>{`@media print { @page { size: A4; margin: 8mm; } }`}</style>
          <div
            className="print-page grid w-full max-w-[210mm] gap-[2mm] bg-white p-[8mm] text-black shadow-[var(--shadow-raised)] print:p-0 print:shadow-none"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {labels.map((l, i) => (
              <div key={i} className="break-inside-avoid overflow-hidden rounded-[1.5mm] border border-dashed border-neutral-300 px-[2.5mm] py-[2mm] text-center print:border-neutral-200">
                {job!.showBusiness && <p className="truncate text-[8px] font-semibold tracking-wide uppercase">{business.name}</p>}
                {job!.showName && (
                  <p className="truncate text-[10px] leading-tight font-medium">
                    {l.name}
                    {l.variantName ? ` · ${l.variantName}` : ""}
                  </p>
                )}
                <Barcode value={l.code} height={barHeight} className="my-[1mm]" />
                <p className="font-mono text-[9px] leading-none">{l.code}</p>
                {job!.showPrice && (
                  <p className="mt-[1mm] text-[12px] leading-none font-bold">
                    {money.format(l.price)}
                    {l.mrp && l.mrp > l.price ? <span className="ml-1 text-[9px] font-normal line-through">{money.format(l.mrp)}</span> : null}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
