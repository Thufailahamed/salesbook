"use client";

import * as React from "react";
import { Banknote, CreditCard, Landmark, MapPin, Receipt, Smartphone, Wallet } from "lucide-react";
import { ROLE_LABELS, type PaymentMethodType, type User } from "@shopbooks/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useApiQuery } from "@/hooks/use-api";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export const PAYMENT_METHOD_ICONS: Record<PaymentMethodType, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  card: CreditCard,
  bank: Landmark,
  mobile: Smartphone,
  cheque: Receipt,
  other: Wallet,
};

interface BaseSelectProps {
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
  placeholder?: string;
  id?: string;
  invalid?: boolean;
}

// ---------------------------------------------------------------- payment methods

export interface PaymentMethodSelectProps extends BaseSelectProps {
  value: string | null | undefined;
  onChange: (methodId: string) => void;
  /** Restrict to these method types */
  types?: PaymentMethodType[];
}

/** Active payment methods from the session. */
export function PaymentMethodSelect({ value, onChange, types, disabled, className, size, placeholder = "Payment method", id, invalid }: PaymentMethodSelectProps) {
  const { paymentMethods } = useSession();
  const methods = paymentMethods
    .filter((m) => m.isActive && (!types || types.includes(m.type)))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={cn("w-full", className)} aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {methods.map((m) => {
          const Icon = PAYMENT_METHOD_ICONS[m.type] ?? Wallet;
          return (
            <SelectItem key={m.id} value={m.id}>
              <Icon className="size-4 text-muted-foreground" />
              {m.name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------- locations

export interface LocationSelectProps extends BaseSelectProps {
  value: string | null | undefined;
  onChange: (locationId: string | undefined) => void;
  /** Adds an "All locations" option mapping to undefined */
  allowAll?: boolean;
  excludeId?: string;
}

export function LocationSelect({ value, onChange, allowAll, excludeId, disabled, className, size, placeholder = "Location", id, invalid }: LocationSelectProps) {
  const { activeLocations } = useSession();
  return (
    <Select
      value={value ?? (allowAll ? NONE : undefined)}
      onValueChange={(v) => onChange(v === NONE ? undefined : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} className={cn("w-full", className)} aria-invalid={invalid || undefined}>
        <MapPin className="size-4 text-muted-foreground" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={NONE}>All locations</SelectItem>}
        {activeLocations
          .filter((l) => l.id !== excludeId)
          .map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------- tax rates

export interface TaxRateSelectProps extends BaseSelectProps {
  value: string | null | undefined;
  /** null = no tax */
  onChange: (taxRateId: string | null) => void;
}

export function TaxRateSelect({ value, onChange, disabled, className, size, placeholder = "Tax rate", id, invalid }: TaxRateSelectProps) {
  const { taxRates } = useSession();
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={cn("w-full", className)} aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No tax (0%)</SelectItem>
        {taxRates
          .filter((t) => t.isActive || t.id === value)
          .map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name} <span className="num text-muted-foreground">({t.rate}%)</span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------- users

export interface UserSelectProps extends BaseSelectProps {
  value: string | null | undefined;
  onChange: (userId: string | undefined) => void;
  allowAll?: boolean;
  allLabel?: string;
}

/**
 * Staff select (GET /users/directory → active users, any signed-in user). Falls back to the current user.
 */
export function UserSelect({ value, onChange, allowAll, allLabel = "All staff", disabled, className, size, placeholder = "Staff member", id }: UserSelectProps) {
  const { user } = useSession();
  const { data } = useApiQuery<Pick<User, "id" | "name" | "role">[]>("/users/directory", undefined, {
    staleTime: 60_000,
    retry: false,
  });
  const users: Pick<User, "id" | "name" | "role">[] = data ?? [{ id: user.id, name: user.name, role: user.role }];
  return (
    <Select value={value ?? (allowAll ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? undefined : v)} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={NONE}>{allLabel}</SelectItem>}
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name} <span className="text-muted-foreground">· {ROLE_LABELS[u.role]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
