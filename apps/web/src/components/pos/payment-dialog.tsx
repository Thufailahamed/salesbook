"use client";

import * as React from "react";
import { CalendarClock, Gift, Search, Star, Trash2, WalletCards } from "lucide-react";
import type { Customer, GiftCard, PaymentMethod, RefundInput, TenderInput } from "@shopbooks/shared";
import { addDays } from "@shopbooks/shared";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { Field } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Money } from "@/components/money";
import { PaymentMethodSelect, PAYMENT_METHOD_ICONS } from "@/components/entity-selects";
import { useBusinessToday } from "@/components/filters";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api, errorMessage } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";

type Active = { kind: "method"; method: PaymentMethod } | { kind: "store_credit" } | { kind: "gift_card" } | { kind: "loyalty" };

interface TenderDraft {
  key: string;
  label: string;
  input: TenderInput;
}

export interface PaymentResult {
  payments: TenderInput[];
  allowCredit: boolean;
  dueDate: string | null;
  refund: RefundInput | null;
}

let k = 0;

/** Quick cash buttons: exact amount plus the next round notes above it. */
function quickCash(amount: number, toMinor: (n: number) => number, decimals: number): number[] {
  const steps = (decimals === 0 ? [100, 500, 1000, 5000, 10000] : [1, 5, 10, 20, 50, 100, 500, 1000, 5000]).map(toMinor);
  const out = new Set<number>([amount]);
  for (const s of steps) {
    const up = Math.ceil(amount / s) * s;
    if (up > amount) out.add(up);
    if (out.size >= 5) break;
  }
  return [...out].sort((a, b) => a - b);
}

export function PaymentDialog({
  open,
  onOpenChange,
  amountDue,
  refundDue,
  customer,
  summary,
  pending,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** What the customer still has to pay for the sale (after exchange credit) */
  amountDue: number;
  /** Money owed back to the customer (return credit beyond the new sale) */
  refundDue: number;
  customer: Customer | null;
  /** Lines shown above the amount (exchange credit etc.) */
  summary?: { label: string; value: number }[];
  pending?: boolean;
  onComplete: (r: PaymentResult) => void;
}) {
  const { paymentMethods, business } = useSession();
  const money = useMoney();
  const today = useBusinessToday();
  const methods = React.useMemo(
    () => paymentMethods.filter((m) => m.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [paymentMethods],
  );
  const defaultMethod = methods.find((m) => m.type === "cash") ?? methods[0];

  const [tenders, setTenders] = React.useState<TenderDraft[]>([]);
  const [active, setActive] = React.useState<Active | null>(defaultMethod ? { kind: "method", method: defaultMethod } : null);
  const [amount, setAmount] = React.useState(0);
  const [tendered, setTendered] = React.useState(0);
  const [reference, setReference] = React.useState("");
  const [cardCode, setCardCode] = React.useState("");
  const [card, setCard] = React.useState<GiftCard | null>(null);
  const [cardError, setCardError] = React.useState<string | null>(null);
  const [cardLoading, setCardLoading] = React.useState(false);
  const [points, setPoints] = React.useState(0);
  const [onAccount, setOnAccount] = React.useState(false);
  const [dueDate, setDueDate] = React.useState(addDays(today, business.creditDueDays));
  const [refundMode, setRefundMode] = React.useState<"method" | "store_credit">("method");
  const [refundMethodId, setRefundMethodId] = React.useState<string | undefined>(defaultMethod?.id);

  const paid = tenders.reduce((s, t) => s + t.input.amount, 0);
  const remaining = Math.max(0, amountDue - paid);
  const storeCreditUsed = tenders.filter((t) => t.input.tender === "store_credit").reduce((s, t) => s + t.input.amount, 0);
  const pointsUsed = tenders.filter((t) => t.input.tender === "loyalty").reduce((s, t) => s + (t.input.points ?? 0), 0);
  const storeCreditLeft = Math.max(0, (customer?.creditBalance ?? 0) - storeCreditUsed);
  const pointsLeft = Math.max(0, (customer?.loyaltyPoints ?? 0) - pointsUsed);
  const loyaltyOn = business.loyaltyEnabled && business.loyaltyPointValue > 0 && !!customer && pointsLeft >= Math.max(1, business.loyaltyMinRedeem);

  // reset when opened
  React.useEffect(() => {
    if (!open) return;
    setTenders([]);
    setActive(defaultMethod ? { kind: "method", method: defaultMethod } : null);
    setAmount(amountDue);
    setTendered(amountDue);
    setReference("");
    setCardCode("");
    setCard(null);
    setCardError(null);
    setPoints(0);
    setOnAccount(false);
    setDueDate(addDays(today, business.creditDueDays));
    setRefundMode(customer ? "method" : "method");
    setRefundMethodId(defaultMethod?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (a: Active) => {
    setActive(a);
    setReference("");
    if (a.kind === "store_credit") setAmount(Math.min(remaining, storeCreditLeft));
    else if (a.kind === "loyalty") {
      const maxPts = Math.min(pointsLeft, Math.floor(remaining / business.loyaltyPointValue));
      setPoints(maxPts);
      setAmount(maxPts * business.loyaltyPointValue);
    } else if (a.kind === "gift_card") {
      setAmount(card ? Math.min(remaining, card.balance) : 0);
    } else {
      setAmount(remaining);
      setTendered(remaining);
    }
  };

  const isCash = active?.kind === "method" && active.method.type === "cash";
  const change = isCash ? Math.max(0, tendered - amount) : 0;

  /** The tender currently being entered (if valid), so "Complete" can include it. */
  const entry = React.useMemo((): TenderDraft | null => {
    if (!active || amount <= 0) return null;
    const amt = Math.min(amount, remaining);
    if (amt <= 0) return null;
    switch (active.kind) {
      case "method":
        return {
          key: `t${k++}`,
          label: active.method.name,
          input: {
            tender: "method",
            methodId: active.method.id,
            amount: amt,
            tendered: active.method.type === "cash" ? Math.max(tendered, amt) : null,
            reference: reference.trim() || null,
          },
        };
      case "store_credit":
        return amt <= storeCreditLeft ? { key: `t${k++}`, label: "Store credit", input: { tender: "store_credit", amount: amt } } : null;
      case "gift_card":
        return card && amt <= card.balance
          ? { key: `t${k++}`, label: `Gift card ${card.code}`, input: { tender: "gift_card", amount: amt, giftCardCode: card.code } }
          : null;
      case "loyalty":
        return points > 0 && points <= pointsLeft && points >= business.loyaltyMinRedeem
          ? {
              key: `t${k++}`,
              label: `${formatNumber(points)} points`,
              input: { tender: "loyalty", amount: points * business.loyaltyPointValue, points },
            }
          : null;
    }
  }, [active, amount, remaining, tendered, reference, storeCreditLeft, card, points, pointsLeft, business]);

  const addEntry = () => {
    if (!entry) return;
    setTenders((ts) => [...ts, entry]);
    const left = remaining - entry.input.amount;
    setAmount(left);
    setTendered(left);
    setReference("");
    if (active?.kind !== "method" && defaultMethod) setActive({ kind: "method", method: defaultMethod });
  };

  const lookupCard = async () => {
    const code = cardCode.trim().toUpperCase();
    if (!code) return;
    setCardLoading(true);
    setCardError(null);
    try {
      const c = await api.get<GiftCard>("/gift-cards/lookup", { code });
      if (c.status !== "active") throw new Error(`This card is ${c.status}`);
      if (c.expiresOn && c.expiresOn < today) throw new Error("This card has expired");
      const used = tenders.filter((t) => t.input.giftCardCode === c.code).reduce((s, t) => s + t.input.amount, 0);
      const bal = c.balance - used;
      setCard({ ...c, balance: bal });
      setAmount(Math.min(remaining, bal));
    } catch (e) {
      setCard(null);
      setCardError(errorMessage(e));
    } finally {
      setCardLoading(false);
    }
  };

  const all = entry && remaining > 0 ? [...tenders, entry] : tenders;
  const totalPaid = all.reduce((s, t) => s + t.input.amount, 0);
  const balance = Math.max(0, amountDue - totalPaid);
  const canCredit = !!customer && customer.allowCredit;
  const creditRoom = customer && customer.creditLimit > 0 ? customer.creditLimit - customer.dueBalance : Infinity;
  const needsCredit = balance > 0;
  const creditOk = !needsCredit || (onAccount && canCredit && balance <= creditRoom);
  const refundOk = refundDue <= 0 || (refundMode === "store_credit" ? !!customer : !!refundMethodId);
  const totalChange = all.reduce((s, t) => s + Math.max(0, (t.input.tendered ?? 0) - t.input.amount), 0);
  const canComplete = creditOk && refundOk && !pending;

  const complete = () => {
    if (!canComplete) return;
    onComplete({
      payments: all.map((t) => t.input),
      allowCredit: needsCredit && onAccount,
      dueDate: needsCredit && onAccount ? dueDate : null,
      refund: refundDue > 0 ? { mode: refundMode, methodId: refundMode === "method" ? refundMethodId : null } : null,
    });
  };

  useHotkeys("mod+enter, f9", complete, { enabled: open, enableInInputs: true });

  const isRefundOnly = amountDue <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[calc(100dvh-1rem)]">
        <DialogHeader>
          <DialogTitle>{isRefundOnly ? (refundDue > 0 ? "Refund" : "Complete return") : "Take payment"}</DialogTitle>
          <DialogDescription>
            {customer ? (
              <>
                {customer.name}
                {customer.creditBalance > 0 && <> · store credit <Money value={customer.creditBalance} /></>}
                {customer.dueBalance > 0 && <> · owes <Money value={customer.dueBalance} /></>}
              </>
            ) : (
              "Walk-in customer"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          {/* summary */}
          <div className="flex flex-col gap-4 border-b border-border/70 bg-muted/30 p-6 md:border-r md:border-b-0">
            {summary?.map((s) => (
              <div key={s.label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <Money value={s.value} tone="signed" />
              </div>
            ))}
            {!isRefundOnly && (
              <div>
                <p className="label-caps">Amount due</p>
                <p className="figure mt-1 text-[44px] leading-none">{money.format(amountDue)}</p>
              </div>
            )}
            {tenders.length > 0 && (
              <ul className="grid gap-1.5">
                {tenders.map((t) => (
                  <li key={t.key} className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm shadow-xs">
                    <span className="min-w-0 flex-1 truncate">{t.label}</span>
                    <Money value={t.input.amount} className="font-medium" />
                    <Button variant="ghost" size="icon-xs" onClick={() => setTenders((ts) => ts.filter((x) => x.key !== t.key))} aria-label="Remove payment">
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {!isRefundOnly && (
              <div className="mt-auto grid gap-1.5 border-t border-border pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paying now</span>
                  <Money value={totalPaid} className="font-medium" />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{balance > 0 ? "Balance" : "Change"}</span>
                  {balance > 0 ? (
                    <Money value={balance} className="font-semibold text-destructive" />
                  ) : (
                    <Money value={totalChange} className="figure text-xl text-success-soft-foreground" />
                  )}
                </div>
              </div>
            )}
            {refundDue > 0 && (
              <div className="rounded-xl bg-card p-4 shadow-xs">
                <p className="label-caps">Refund due to customer</p>
                <p className="figure mt-1 text-3xl">{money.format(refundDue)}</p>
              </div>
            )}
          </div>

          {/* entry */}
          <div className="grid content-start gap-5 p-6">
            {!isRefundOnly && remaining > 0 && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {methods.map((m) => {
                    const Icon = PAYMENT_METHOD_ICONS[m.type];
                    const on = active?.kind === "method" && active.method.id === m.id;
                    return (
                      <TenderButton key={m.id} on={on} onClick={() => choose({ kind: "method", method: m })}>
                        <Icon className="size-4" /> {m.name}
                      </TenderButton>
                    );
                  })}
                  {storeCreditLeft > 0 && (
                    <TenderButton on={active?.kind === "store_credit"} onClick={() => choose({ kind: "store_credit" })}>
                      <WalletCards className="size-4" /> Store credit
                    </TenderButton>
                  )}
                  <TenderButton on={active?.kind === "gift_card"} onClick={() => choose({ kind: "gift_card" })}>
                    <Gift className="size-4" /> Gift card
                  </TenderButton>
                  {loyaltyOn && (
                    <TenderButton on={active?.kind === "loyalty"} onClick={() => choose({ kind: "loyalty" })}>
                      <Star className="size-4" /> Points
                    </TenderButton>
                  )}
                </div>

                {active?.kind === "gift_card" && (
                  <Field label="Gift card code" error={cardError}>
                    <div className="flex gap-2">
                      <Input
                        value={cardCode}
                        onChange={(e) => setCardCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void lookupCard();
                          }
                        }}
                        className="font-mono"
                        autoFocus
                        placeholder="Scan or type the code"
                      />
                      <Button variant="outline" onClick={lookupCard} loading={cardLoading}>
                        <Search /> Check
                      </Button>
                    </div>
                    {card && (
                      <p className="text-[13px] text-success-soft-foreground">
                        Balance <Money value={card.balance} className="font-semibold" />
                      </p>
                    )}
                  </Field>
                )}

                {active?.kind === "loyalty" && (
                  <Field
                    label="Points to redeem"
                    hint={`${formatNumber(pointsLeft)} available · each worth ${money.format(business.loyaltyPointValue)}${business.loyaltyMinRedeem ? ` · min ${business.loyaltyMinRedeem}` : ""}`}
                  >
                    <Input
                      inputMode="numeric"
                      className="num"
                      value={String(points)}
                      onChange={(e) => {
                        const p = Math.min(pointsLeft, Number.parseInt(e.target.value.replace(/\D/g, "") || "0", 10));
                        setPoints(p);
                        setAmount(p * business.loyaltyPointValue);
                      }}
                    />
                  </Field>
                )}

                {active && active.kind !== "loyalty" && (
                  <Field label="Amount">
                    <MoneyInput
                      value={amount}
                      onChange={(v) => {
                        setAmount(v);
                        if (isCash && tendered < v) setTendered(v);
                      }}
                      className="h-11 text-lg font-semibold"
                      wrapperClassName="h-11"
                      autoFocus={active.kind === "method"}
                    />
                  </Field>
                )}

                {isCash && (
                  <Field label="Cash received" hint={change > 0 ? undefined : "Enter what the customer hands over to compute change"}>
                    <MoneyInput value={tendered} onChange={setTendered} className="h-11 text-lg" wrapperClassName="h-11" />
                    <div className="flex flex-wrap gap-1.5">
                      {quickCash(amount, money.toMinor, money.decimals).map((v) => (
                        <Button key={v} type="button" variant={tendered === v ? "soft" : "outline"} size="sm" onClick={() => setTendered(v)}>
                          {money.format(v)}
                        </Button>
                      ))}
                    </div>
                    {change > 0 && (
                      <p className="text-sm">
                        Change <Money value={change} className="figure text-lg text-success-soft-foreground" />
                      </p>
                    )}
                  </Field>
                )}

                {active?.kind === "method" && active.method.type !== "cash" && (
                  <Field label="Reference" hint="Approval code, transaction ID, cheque no.">
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                  </Field>
                )}

                {entry && entry.input.amount < remaining && (
                  <Button variant="outline" onClick={addEntry}>
                    Add {entry.label} payment of <Money value={entry.input.amount} /> and split
                  </Button>
                )}
              </>
            )}

            {!isRefundOnly && balance > 0 && (
              <div className={cn("rounded-xl border p-4", onAccount ? "border-primary/40 bg-primary-soft/30" : "border-border")}>
                {canCredit ? (
                  <>
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox checked={onAccount} onCheckedChange={(v) => setOnAccount(!!v)} className="mt-0.5" />
                      <span>
                        <span className="font-medium">
                          Put <Money value={balance} /> on {customer!.name}&apos;s account
                        </span>
                        <span className="block text-[13px] text-muted-foreground">
                          Sell on credit (pay later).{" "}
                          {customer!.creditLimit > 0 && <>Credit available: <Money value={Math.max(0, creditRoom)} />.</>}
                        </span>
                      </span>
                    </label>
                    {onAccount && balance > creditRoom && <p className="mt-2 text-[13px] text-destructive">This exceeds the customer&apos;s credit limit.</p>}
                    {onAccount && (
                      <Field label="Due date" className="mt-3 max-w-48">
                        <Input type="date" value={dueDate} min={today} onChange={(e) => setDueDate(e.target.value)} />
                      </Field>
                    )}
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <CalendarClock className="size-4" />
                    {customer ? `${customer.name} can't buy on credit.` : "Select a customer to sell on credit."} Take the full amount to continue.
                  </p>
                )}
              </div>
            )}

            {refundDue > 0 && (
              <div className="grid gap-3">
                <p className="label-caps">Refund the difference as</p>
                <RadioGroup value={refundMode} onValueChange={(v) => setRefundMode(v as "method" | "store_credit")} className="grid gap-2 sm:grid-cols-2">
                  <RadioCard value="method">
                    <span className="font-medium">Money back</span>
                    <span className="block text-[12.5px] text-muted-foreground">Cash, card or transfer</span>
                  </RadioCard>
                  <RadioCard value="store_credit" disabled={!customer}>
                    <span className="font-medium">Store credit</span>
                    <span className="block text-[12.5px] text-muted-foreground">{customer ? "Kept on the account" : "Needs a customer"}</span>
                  </RadioCard>
                </RadioGroup>
                {refundMode === "method" && (
                  <Field label="Refund via">
                    <PaymentMethodSelect value={refundMethodId} onChange={setRefundMethodId} />
                  </Field>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Back to cart
          </Button>
          <Button size="lg" variant="brand" onClick={complete} disabled={!canComplete} loading={pending} className="min-w-48">
            {isRefundOnly
              ? refundDue > 0
                ? <>Refund <Money value={refundDue} /></>
                : "Complete return"
              : balance > 0
                ? <>Complete · <Money value={balance} /> on account</>
                : <>Complete sale</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TenderButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-all",
        on ? "border-primary bg-primary-soft/50 text-foreground ring-1 ring-primary" : "border-border bg-card text-foreground/80 hover:border-border-strong hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}
