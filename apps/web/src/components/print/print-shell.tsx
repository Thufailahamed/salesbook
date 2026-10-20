"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { assetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/layout/brand";

// ---------------------------------------------------------------- toolbar & page

/** Auto-print once `ready` is true when the URL has ?autoprint=1 */
export function useAutoPrint(ready: boolean) {
  const done = React.useRef(false);
  React.useEffect(() => {
    if (!ready || done.current || typeof window === "undefined") return;
    const auto = new URLSearchParams(window.location.search).get("autoprint");
    if (auto === "1" || auto === "true") {
      done.current = true;
      setTimeout(() => window.print(), 350);
    }
  }, [ready]);
}

/**
 * Screen-only toolbar above a printable document (hidden when printing).
 *   <PrintToolbar title="Invoice INV-00012" backHref={`/sales/view?id=${id}`} ready={!!data} />
 */
export function PrintToolbar({
  title,
  backHref,
  ready = true,
  actions,
}: {
  title?: React.ReactNode;
  backHref?: string;
  ready?: boolean;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  useAutoPrint(ready);
  return (
    <div className="no-print sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[900px] items-center gap-3 px-4">
        {backHref ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft /> Back
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft /> Back
          </Button>
        )}
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
        {actions}
        <Button size="sm" onClick={() => window.print()} disabled={!ready}>
          <Printer /> Print
        </Button>
      </div>
    </div>
  );
}

/** White paper sheet. size="a4" for invoices/statements; "receipt" for 58/80mm thermal printers. */
export function PrintPage({
  size = "a4",
  className,
  children,
}: {
  size?: "a4" | "receipt";
  className?: string;
  children: React.ReactNode;
}) {
  const { business } = useSession();
  if (size === "receipt") {
    const width = business.receiptWidth === "58mm" ? "58mm" : "80mm";
    return (
      <div className="flex justify-center px-4 py-8 print:block print:p-0">
        <style>{`@media print { @page { size: ${width} auto; margin: 3mm; } }`}</style>
        <div
          className={cn(
            "print-page print-receipt bg-white px-3 py-4 font-mono text-[11.5px] leading-snug text-black shadow-[var(--shadow-raised)]",
            className,
          )}
          style={{ width }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-center px-4 py-8 print:block print:p-0">
      <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>
      <div
        className={cn(
          "print-page w-full max-w-[210mm] rounded-sm bg-white p-[14mm] text-[12.5px] text-neutral-900 shadow-[var(--shadow-raised)] [color-scheme:light]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- A4 building blocks

/** Business identity block (logo, name, address, contacts, tax number). */
export function BusinessBlock({ compact = false }: { compact?: boolean }) {
  const { business, location } = useSession();
  const logo = assetUrl(business.logoUrl);
  const address = [location?.address || business.address, business.city, business.country].filter(Boolean).join(", ");
  return (
    <div className="flex items-start gap-3">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className={cn("object-contain", compact ? "h-10 max-w-24" : "h-14 max-w-36")} />
      ) : (
        <BrandMark className={compact ? "size-9" : "size-11"} />
      )}
      <div className="min-w-0">
        <p className={cn("font-display font-semibold tracking-[-0.03em] text-neutral-900", compact ? "text-base" : "text-lg")}>
          {business.legalName || business.name}
        </p>
        {address && <p className="text-neutral-600">{address}</p>}
        <p className="text-neutral-600">
          {[location?.phone || business.phone, business.email, business.website].filter(Boolean).join(" · ")}
        </p>
        {business.taxNumber && <p className="text-neutral-600">Tax no: {business.taxNumber}</p>}
      </div>
    </div>
  );
}

/**
 * Document header: business on the left, title + number + meta on the right.
 *   <DocHeader title="Tax invoice" number={inv.number} meta={[{label:"Date", value: formatDate(inv.date)}]} />
 */
export function DocHeader({
  title,
  number,
  meta = [],
  badge,
}: {
  title: string;
  number?: string;
  meta?: { label: string; value: React.ReactNode }[];
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 border-b border-neutral-200 pb-6 sm:flex-row sm:items-start sm:justify-between print:flex-row">
      <BusinessBlock />
      <div className="shrink-0 text-left sm:text-right print:text-right">
        <p className="font-display text-2xl font-semibold tracking-[-0.03em] text-neutral-900 uppercase">{title}</p>
        {number && <p className="mt-0.5 font-mono text-sm font-semibold text-neutral-700">{number}</p>}
        {badge && <div className="mt-1.5 flex sm:justify-end print:justify-end">{badge}</div>}
        {meta.length > 0 && (
          <dl className="mt-3 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[12px] sm:justify-end print:justify-end">
            {meta.map((m) => (
              <React.Fragment key={m.label}>
                <dt className="text-neutral-500">{m.label}</dt>
                <dd className="font-medium text-neutral-900">{m.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

/** "Bill to" style block. */
export function PartyBlock({ label, name, lines = [] }: { label: string; name: React.ReactNode; lines?: (string | null | undefined)[] }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold tracking-[0.1em] text-neutral-500 uppercase">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-900">{name}</p>
      {lines.filter(Boolean).map((l, i) => (
        <p key={i} className="text-neutral-600">
          {l}
        </p>
      ))}
    </div>
  );
}

export interface PrintColumn<T> {
  key: string;
  header: string;
  cell: (row: T, index: number) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

/** Plain table for printed documents. */
export function PrintTable<T>({ columns, rows, rowKey }: { columns: PrintColumn<T>[]; rows: T[]; rowKey: (row: T, i: number) => string }) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b-2 border-neutral-800">
          {columns.map((c) => (
            <th
              key={c.key}
              className={cn(
                "px-2 py-2 text-[10.5px] font-semibold tracking-[0.06em] text-neutral-600 uppercase first:pl-0 last:pr-0",
                c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                c.className,
              )}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={rowKey(r, i)} className="border-b border-neutral-200 align-top">
            {columns.map((c) => (
              <td
                key={c.key}
                className={cn(
                  "px-2 py-2 first:pl-0 last:pr-0",
                  c.align === "right" ? "num text-right" : c.align === "center" ? "text-center" : "text-left",
                  c.className,
                )}
              >
                {c.cell(r, i)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Right-aligned totals block. */
export function TotalsBlock({
  rows,
}: {
  rows: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; muted?: boolean; hidden?: boolean }[];
}) {
  return (
    <div className="ml-auto w-full max-w-[300px]">
      <dl className="grid gap-1 text-[12.5px]">
        {rows
          .filter((r) => !r.hidden)
          .map((r, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between gap-6",
                r.strong && "mt-1 border-t-2 border-neutral-800 pt-2 text-[15px] font-bold text-neutral-900",
                r.muted && "text-neutral-500",
              )}
            >
              <dt>{r.label}</dt>
              <dd className="num">{r.value}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

/** Notes / terms / footer text at the bottom of a document. */
export function DocFooter({ notes, terms, footer }: { notes?: string | null; terms?: string | null; footer?: string | null }) {
  const { business } = useSession();
  const foot = footer ?? business.invoiceFooter;
  return (
    <div className="mt-10 grid gap-4 text-[11.5px] text-neutral-600">
      {notes && (
        <div>
          <p className="mb-1 text-[10.5px] font-semibold tracking-[0.1em] text-neutral-500 uppercase">Notes</p>
          <p className="whitespace-pre-line">{notes}</p>
        </div>
      )}
      {terms && (
        <div>
          <p className="mb-1 text-[10.5px] font-semibold tracking-[0.1em] text-neutral-500 uppercase">Terms</p>
          <p className="whitespace-pre-line">{terms}</p>
        </div>
      )}
      {foot && <p className="border-t border-neutral-200 pt-4 text-center whitespace-pre-line">{foot}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- thermal receipt building blocks

/** Centered business header for receipts. */
export function ReceiptHeader() {
  const { business, location } = useSession();
  return (
    <div className="text-center">
      <p className="text-[14px] font-bold tracking-tight uppercase">{business.name}</p>
      {(location?.address || business.address) && <p>{location?.address || business.address}</p>}
      {(location?.phone || business.phone) && <p>Tel: {location?.phone || business.phone}</p>}
      {business.taxNumber && <p>Tax no: {business.taxNumber}</p>}
    </div>
  );
}

export function ReceiptDivider({ double = false }: { double?: boolean }) {
  return <div className={cn("my-2 border-t border-black", double ? "border-double border-t-[3px]" : "border-dashed")} />;
}

/** label ............ value */
export function ReceiptRow({ label, value, bold, className }: { label: React.ReactNode; value: React.ReactNode; bold?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-2", bold && "text-[13px] font-bold", className)}>
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 text-right tabular-nums">{value}</span>
    </div>
  );
}

export function ReceiptFooter({ text }: { text?: string | null }) {
  const { business } = useSession();
  const t = text ?? business.receiptFooter ?? "Thank you for shopping with us!";
  return <p className="mt-3 text-center whitespace-pre-line">{t}</p>;
}
