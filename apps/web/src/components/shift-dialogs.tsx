"use client";

import * as React from "react";
import type { CashMovement, CashMovementInput, Shift, ShiftCloseInput, ShiftOpenInput, ShiftReport } from "@shopbooks/shared";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Money } from "@/components/money";
import { AccountPicker } from "@/components/account-picker";
import { LocationSelect } from "@/components/entity-selects";
import { useApiMutation } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const SHIFT_INVALIDATE = ["/shifts", "/reports", "/accounting", "/payments"];

export function OpenShiftDialog({
  open,
  onOpenChange,
  locationId: initialLocation,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  locationId?: string;
  onOpened?: (s: Shift) => void;
}) {
  const { locationId: sessionLocation } = useSession();
  const [locationId, setLocationId] = React.useState<string | undefined>(initialLocation ?? sessionLocation);
  const [float, setFloat] = React.useState(0);
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setLocationId(initialLocation ?? sessionLocation);
      setFloat(0);
      setNote("");
    }
  }, [open, initialLocation, sessionLocation]);

  const mutation = useApiMutation((body: ShiftOpenInput) => api.post<Shift>("/shifts/open", body), {
    invalidate: SHIFT_INVALIDATE,
    success: (s) => `Shift ${s.number} opened`,
    onSuccess: (s) => {
      onOpened?.(s);
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (locationId) mutation.mutate({ locationId, openingFloat: float, note: note.trim() || null });
          }}
        >
          <DialogHeader>
            <DialogTitle>Open register shift</DialogTitle>
            <DialogDescription>Count the cash in the drawer before your first sale.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Location" required>
              <LocationSelect value={locationId} onChange={setLocationId} />
            </Field>
            <Field label="Opening float" hint="Cash in the drawer right now">
              <MoneyInput value={float} onChange={setFloat} autoFocus className="text-base font-semibold" />
            </Field>
            <Field label="Note" htmlFor="shift-note">
              <Textarea id="shift-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!locationId}>
              Open shift
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CashMovementDialog({
  open,
  onOpenChange,
  shiftId,
  defaultType = "pay_out",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shiftId: string;
  defaultType?: "pay_in" | "pay_out";
}) {
  const { can } = useSession();
  const [type, setType] = React.useState<"pay_in" | "pay_out">(defaultType);
  const [amount, setAmount] = React.useState(0);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setType(defaultType);
      setAmount(0);
      setAccountId(null);
      setReason("");
    }
  }, [open, defaultType]);

  const mutation = useApiMutation((body: CashMovementInput) => api.post<CashMovement>(`/shifts/${shiftId}/movements`, body), {
    invalidate: SHIFT_INVALIDATE,
    success: (m) => (m.type === "pay_in" ? "Cash added to drawer" : "Cash paid out"),
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (amount > 0 && reason.trim()) mutation.mutate({ type, amount, accountId, reason: reason.trim() });
          }}
        >
          <DialogHeader>
            <DialogTitle>Cash in / out</DialogTitle>
            <DialogDescription>Record cash added to or taken from the drawer during the shift.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <ToggleGroup type="single" value={type} onValueChange={(v) => v && setType(v as "pay_in" | "pay_out")} className="w-full">
              <ToggleGroupItem value="pay_out" className="flex-1">
                Pay out
              </ToggleGroupItem>
              <ToggleGroupItem value="pay_in" className="flex-1">
                Pay in
              </ToggleGroupItem>
            </ToggleGroup>
            <Field label="Amount" required>
              <MoneyInput value={amount} onChange={setAmount} autoFocus />
            </Field>
            <Field label="Reason" htmlFor="cm-reason" required>
              <Input
                id="cm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={type === "pay_out" ? "Bank deposit, supplier COD, tea & snacks…" : "Extra change from bank…"}
              />
            </Field>
            {can("accounting.view") && (
              <Field label={type === "pay_out" ? "Paid to account" : "Received from account"} hint="Defaults to the bank account (cash drop)">
                <AccountPicker value={accountId} onChange={(id) => setAccountId(id)} clearable placeholder="Bank account" />
              </Field>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={amount <= 0 || !reason.trim()}>
              {type === "pay_out" ? "Pay out" : "Pay in"} <Money value={amount} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Currencies whose everyday notes go beyond 100 units (and so need 500/1000/… counters). */
const HIGH_VALUE_NOTES: Record<string, number[]> = {
  LKR: [5000, 1000, 500],
  INR: [500, 200],
  PKR: [5000, 1000, 500],
  BDT: [1000, 500],
  NPR: [1000, 500],
  PHP: [1000, 500],
  EGP: [200],
  AED: [200, 100],
  SAR: [500],
};

/** Common note/coin denominations in major units for a currency. */
function denominationsFor(currency: string, decimals: number): number[] {
  if (decimals === 0) return [10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1];
  const high = HIGH_VALUE_NOTES[currency] ?? [];
  const base = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01];
  return [...new Set([...high, ...base])].sort((a, b) => b - a);
}

export function CloseShiftDialog({
  open,
  onOpenChange,
  shift,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shift: Shift | ShiftReport;
  onClosed?: (r: ShiftReport) => void;
}) {
  const { can } = useSession();
  const money = useMoney();
  const blind = !can("registers.viewAll");
  const [counted, setCounted] = React.useState(0);
  const [useBreakdown, setUseBreakdown] = React.useState(false);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setCounted(0);
      setCounts({});
      setUseBreakdown(false);
      setNote("");
    }
  }, [open]);

  const denoms = denominationsFor(money.currency, money.decimals);
  const breakdownTotal = denoms.reduce((s, d) => s + money.toMinor(d) * (counts[String(d)] ?? 0), 0);
  const value = useBreakdown ? breakdownTotal : counted;
  const diff = value - shift.expectedCash;

  const mutation = useApiMutation((body: ShiftCloseInput) => api.post<ShiftReport>(`/shifts/${shift.id}/close`, body), {
    invalidate: SHIFT_INVALIDATE,
    success: (r) => `Shift ${r.number} closed`,
    onSuccess: (r) => {
      onClosed?.(r);
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              countedCash: value,
              note: note.trim() || null,
              denominations: useBreakdown ? Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)) : undefined,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Close shift {shift.number}</DialogTitle>
            <DialogDescription>
              {blind ? "Count the drawer. The expected amount is revealed after closing." : "Count the drawer and compare it with what the system expects."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <label className="flex items-center justify-between text-sm">
              Count by denomination
              <Switch checked={useBreakdown} onCheckedChange={setUseBreakdown} />
            </label>
            {useBreakdown ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {denoms.map((d) => (
                  <label key={d} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                    <span className="num w-16 shrink-0 text-[13px] font-medium">{money.format(money.toMinor(d))}</span>
                    <span className="text-muted-foreground">×</span>
                    <Input
                      inputMode="numeric"
                      className="num h-7 text-right"
                      value={counts[String(d)] ? String(counts[String(d)]) : ""}
                      onChange={(e) => setCounts((c) => ({ ...c, [String(d)]: Number.parseInt(e.target.value.replace(/\D/g, "") || "0", 10) }))}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <Field label="Counted cash" required>
                <MoneyInput value={counted} onChange={setCounted} autoFocus className="text-base font-semibold" />
              </Field>
            )}
            <div className="grid gap-1.5 rounded-xl bg-muted/50 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Counted</span>
                <Money value={value} className="font-semibold" />
              </div>
              {!blind && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expected</span>
                    <Money value={shift.expectedCash} />
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <span className="text-muted-foreground">{diff === 0 ? "Balanced" : diff > 0 ? "Over" : "Short"}</span>
                    <Money value={diff} tone="signed" className={cn("font-semibold", diff === 0 && "text-success-soft-foreground")} />
                  </div>
                </>
              )}
            </div>
            <Field label="Closing note" htmlFor="close-note">
              <Textarea id="close-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Close shift
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
