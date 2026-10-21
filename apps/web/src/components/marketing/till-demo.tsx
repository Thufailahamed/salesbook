"use client";

import * as React from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { calculateDocument } from "@shopbooks/shared";
import { cn } from "@/lib/utils";

/** Interactive demo: ring up a sale and watch the receipt, journal and sub-ledgers move together. */

const products = [
  { id: "shirt", name: "Linen shirt", sku: "LS-M-WHT", price: 320000, cost: 170000, stock: 24 },
  { id: "belt", name: "Leather belt", sku: "LB-34-BRN", price: 145000, cost: 70000, stock: 41 },
  { id: "sneaker", name: "Canvas sneakers", sku: "CS-42-OFW", price: 690000, cost: 390000, stock: 12 },
  { id: "scarf", name: "Wool scarf", sku: "WS-OS-CHR", price: 225000, cost: 100000, stock: 18 },
  { id: "jacket", name: "Denim jacket", sku: "DJ-L-IND", price: 850000, cost: 480000, stock: 7 },
  { id: "socks", name: "Cotton socks ×3", sku: "CS3-OS-MIX", price: 99000, cost: 42000, stock: 60 },
];

const tenders = {
  cash: { label: "Cash", code: "1000", account: "Cash on Hand" },
  card: { label: "Card", code: "1020", account: "Card Payments Clearing" },
  credit: { label: "On credit", code: "1100", account: "Accounts Receivable" },
} as const;
type Tender = keyof typeof tenders;

const VAT = 18;

function fmt(minor: number) {
  return (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function TillDemo() {
  const [cart, setCart] = React.useState<Record<string, number>>({ shirt: 1, belt: 1 });
  const [discount, setDiscount] = React.useState(false);
  const [tender, setTender] = React.useState<Tender>("cash");

  const lines = products.filter((p) => cart[p.id]).map((p) => ({ ...p, qty: cart[p.id] }));
  const calc = calculateDocument(
    lines.map((l) => ({ quantity: l.qty, unitPrice: l.price, taxRate: VAT })),
    { taxInclusive: true, docDiscountType: discount ? "percent" : null, docDiscountValue: discount ? 10 : null },
  );
  const cost = lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const empty = lines.length === 0;
  const t = tenders[tender];

  const journal = empty
    ? []
    : [
        { code: t.code, account: t.account, dr: calc.total, cr: 0 },
        { code: "4000", account: "Sales Revenue", dr: 0, cr: calc.netTotal },
        { code: "2100", account: "Sales Tax Payable", dr: 0, cr: calc.taxTotal },
        { code: "5000", account: "Cost of Goods Sold", dr: cost, cr: 0 },
        { code: "1200", account: "Inventory", dr: 0, cr: cost },
      ];
  const dr = journal.reduce((s, j) => s + j.dr, 0);
  const cr = journal.reduce((s, j) => s + j.cr, 0);
  const sig = `${JSON.stringify(cart)}-${discount}-${tender}`;

  const add = (id: string, delta: number) =>
    setCart((c) => {
      const p = products.find((x) => x.id === id)!;
      const next = Math.max(0, Math.min(p.stock, (c[id] ?? 0) + delta));
      const copy = { ...c };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)]">
      {/* counter */}
      <div className="rounded-[24px] bg-card p-5 ring-1 ring-border sm:p-6">
        <div className="flex items-center justify-between">
          <p className="eyebrow">The counter</p>
          <button
            onClick={() => setCart({})}
            className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> Clear
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {products.map((p) => {
            const qty = cart[p.id] ?? 0;
            return (
              <button
                key={p.id}
                onClick={() => add(p.id, 1)}
                className={cn(
                  "group relative flex flex-col items-start rounded-2xl bg-background p-3.5 text-left ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] active:translate-y-0",
                  qty > 0 && "ring-2 ring-primary/60",
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-[11px] font-semibold tracking-[0.04em] [font-stretch:125%] transition-colors group-hover:bg-primary-soft group-hover:text-primary-soft-foreground">
                  {initials(p.name)}
                </span>
                <span className="mt-3 text-[13px] leading-tight font-medium">{p.name}</span>
                <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">{p.sku}</span>
                <span className="num mt-2 text-[13px] font-semibold">Rs {fmt(p.price)}</span>
                {qty > 0 && (
                  <span className="absolute top-2.5 right-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[10.5px] font-semibold text-ink-foreground">
                    {qty}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <p className="text-[12px] font-medium text-muted-foreground">Cart discount</p>
            <Segmented
              value={discount ? "10" : "0"}
              onChange={(v) => setDiscount(v === "10")}
              options={[
                { value: "0", label: "None" },
                { value: "10", label: "10% off" },
              ]}
            />
          </div>
          <div>
            <p className="text-[12px] font-medium text-muted-foreground">Payment</p>
            <Segmented
              value={tender}
              onChange={(v) => setTender(v as Tender)}
              options={(Object.keys(tenders) as Tender[]).map((k) => ({ value: k, label: tenders[k].label }))}
            />
          </div>
        </div>
      </div>

      {/* what happens */}
      <div className="metal relative overflow-hidden rounded-[24px] p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_0%,oklch(0.82_0.09_84/0.12),transparent)]" />
        <div className="relative grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
          {/* receipt */}
          <div className="self-start rounded-[12px] bg-[oklch(0.985_0.004_85)] p-4 font-mono text-[10.5px] text-[oklch(0.25_0.005_70)] shadow-[0_24px_50px_-20px_rgb(0_0_0/0.8)] md:rotate-[-1.5deg]">
            <p className="text-center text-[11.5px] font-semibold tracking-[0.08em]">KANDY THREADS</p>
            <p className="text-center text-[9.5px] opacity-55">Colombo · Main · INV-01285</p>
            <div className="my-2.5 border-t border-dashed border-black/20" />
            {empty ? (
              <p className="py-6 text-center opacity-50">Tap a product to start a sale</p>
            ) : (
              <div className="space-y-1.5">
                {lines.map((l, i) => (
                  <div key={`${l.id}-${l.qty}`} className="motion-anim animate-[sb-pop_0.6s_ease-out] rounded-sm">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{l.name}</span>
                      <span className="num">{fmt(calc.lines[i].gross)}</span>
                    </div>
                    <div className="flex items-center justify-between opacity-55">
                      <span>
                        {l.qty} × {fmt(l.price)}
                      </span>
                      <span className="flex gap-1">
                        <QtyBtn label={`Remove one ${l.name}`} onClick={() => add(l.id, -1)}>
                          <Minus className="size-2.5" />
                        </QtyBtn>
                        <QtyBtn label={`Add one ${l.name}`} onClick={() => add(l.id, 1)}>
                          <Plus className="size-2.5" />
                        </QtyBtn>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="my-2.5 border-t border-dashed border-black/20" />
            {calc.discountTotal > 0 && <Row label="Discount 10%" value={`-${fmt(calc.discountTotal)}`} />}
            <Row label={`VAT ${VAT}% (incl.)`} value={fmt(calc.taxTotal)} />
            <div className="mt-1.5 flex justify-between text-[12.5px] font-semibold">
              <span>TOTAL</span>
              <span className="num">{fmt(calc.total)}</span>
            </div>
            <Row label={t.label} value={fmt(calc.total)} />
            <div className="mt-3 flex h-6 items-end justify-center gap-[1.5px] opacity-70">
              {Array.from({ length: 38 }, (_, i) => (
                <span key={i} className="bg-black" style={{ width: (i * 7) % 3 === 0 ? 2 : 1, height: "100%" }} />
              ))}
            </div>
          </div>

          {/* journal */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase [font-stretch:115%]">Journal posted</p>
                <p className="mt-0.5 font-mono text-[12px] text-white/75">JE-004813 · auto</p>
              </div>
              {!empty && (
                <span
                  key={sig}
                  className="motion-anim inline-flex animate-[sb-pop_0.6s_ease-out] items-center gap-1.5 rounded-full bg-[oklch(0.7_0.13_155/0.16)] px-2.5 py-1 text-[11px] font-medium text-[oklch(0.82_0.12_155)] ring-1 ring-[oklch(0.7_0.13_155/0.3)]"
                >
                  <Check className="size-3.5" strokeWidth={2.5} /> Balanced
                </span>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[9.5px] tracking-[0.14em] text-white/35 uppercase">
                    <th className="pb-2 font-semibold">Account</th>
                    <th className="pb-2 text-right font-semibold">Debit</th>
                    <th className="pb-2 text-right font-semibold">Credit</th>
                  </tr>
                </thead>
                <tbody key={sig} className="divide-y divide-white/[0.06]">
                  {empty
                    ? Array.from({ length: 5 }, (_, i) => (
                        <tr key={i}>
                          <td className="py-2.5 text-white/20">—</td>
                          <td />
                          <td />
                        </tr>
                      ))
                    : journal.map((j, i) => (
                        <tr
                          key={j.code}
                          className="motion-anim animate-[sb-rise_0.6s_ease-out_both]"
                          style={{ animationDelay: `${i * 70}ms` }}
                        >
                          <td className="py-2.5 whitespace-nowrap text-white/80">
                            <span className="mr-2.5 hidden font-mono text-[11px] text-white/35 sm:inline">{j.code}</span>
                            <span className={cn(j.cr > 0 && "pl-3")}>{j.account}</span>
                          </td>
                          <td className="num py-2.5 text-right text-white/90">{j.dr ? fmt(j.dr) : ""}</td>
                          <td className="num py-2.5 text-right text-white/90">{j.cr ? fmt(j.cr) : ""}</td>
                        </tr>
                      ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-[3px] border-double border-white/15">
                    <td className="pt-3 text-[11px] font-semibold text-white/60">Total</td>
                    <td className="figure text-gold pt-3 text-right text-[14px]">{fmt(dr)}</td>
                    <td className="figure text-gold pt-3 text-right text-[14px]">{fmt(cr)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="mt-6 text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase [font-stretch:115%]">
              Also updated, same instant
            </p>
            <div key={`fx-${sig}`} className="mt-3 flex flex-wrap gap-2">
              {empty ? (
                <Chip muted>Waiting for a sale</Chip>
              ) : (
                <>
                  {lines.map((l) => (
                    <Chip key={l.id}>
                      {l.name} <span className="text-white/40">stock</span> {l.stock} → {l.stock - l.qty}
                    </Chip>
                  ))}
                  {tender === "credit" && (
                    <Chip gold>
                      Nadeesha P. <span className="text-white/40">owes</span> +Rs {fmt(calc.total)}
                    </Chip>
                  )}
                  {tender === "cash" && (
                    <Chip gold>
                      Drawer <span className="text-white/40">expected</span> +Rs {fmt(calc.total)}
                    </Chip>
                  )}
                  <Chip>
                    Gross profit <span className="text-white/40">today</span> +Rs {fmt(calc.netTotal - cost)}
                  </Chip>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function QtyBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex size-4 items-center justify-center rounded-[4px] ring-1 ring-black/15 transition-colors hover:bg-black/5"
    >
      {children}
    </button>
  );
}

function Chip({ children, gold, muted }: { children: React.ReactNode; gold?: boolean; muted?: boolean }) {
  return (
    <span
      className={cn(
        "motion-anim inline-flex animate-[sb-pop_0.6s_ease-out] items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 text-[11.5px] text-white/80 ring-1 ring-white/[0.08]",
        gold && "bg-[oklch(0.82_0.09_84/0.1)] text-[oklch(0.88_0.07_86)] ring-[oklch(0.82_0.09_84/0.25)]",
        muted && "text-white/35",
      )}
    >
      {children}
    </span>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div role="radiogroup" className="mt-2 flex rounded-xl bg-muted p-1 ring-1 ring-border">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-[9px] px-2 py-1.5 text-[12.5px] font-medium whitespace-nowrap text-muted-foreground transition-all",
            value === o.value && "bg-card text-foreground shadow-[var(--shadow-card)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
