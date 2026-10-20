"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import { ACCOUNT_TYPE_LABELS, type Account, type AccountType } from "@shopbooks/shared";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { useApiQuery } from "@/hooks/use-api";

export interface AccountPickerProps {
  value: string | null | undefined;
  onChange: (accountId: string | null, account: Account | null) => void;
  /** Restrict to these account types */
  types?: AccountType[];
  /** Restrict to these subtypes (e.g. ["cash","bank"]) */
  subtypes?: string[];
  excludeIds?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
  size?: "sm" | "default" | "lg";
  invalid?: boolean;
  id?: string;
  /** Show the current balance next to each account */
  showBalance?: boolean;
  formatBalance?: (minor: number) => string;
}

/** Hook: chart of accounts (GET /accounting/accounts), cached for 60s. */
export function useAccounts() {
  return useApiQuery<Account[]>("/accounting/accounts", undefined, { staleTime: 60_000 });
}

/**
 * Searchable account select grouped by type ("1000 · Cash on Hand").
 *   <AccountPicker value={accountId} onChange={(id) => setAccountId(id)} types={["expense"]} />
 */
export function AccountPicker({
  value,
  onChange,
  types,
  subtypes,
  excludeIds,
  placeholder = "Select account…",
  disabled,
  className,
  clearable,
  size,
  invalid,
  id,
  showBalance,
  formatBalance,
}: AccountPickerProps) {
  const { data, isLoading, isError } = useAccounts();
  const options: ComboboxOption<Account>[] = React.useMemo(
    () =>
      (data ?? [])
        .filter((a) => a.isActive || a.id === value)
        .filter((a) => !types || types.includes(a.type))
        .filter((a) => !subtypes || subtypes.includes(a.subtype))
        .filter((a) => !excludeIds || !excludeIds.includes(a.id))
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
        .map((a) => ({
          value: a.id,
          label: `${a.code} · ${a.name}`,
          group: ACCOUNT_TYPE_LABELS[a.type],
          keywords: [a.code, a.name, a.subtype],
          data: a,
          description: showBalance && formatBalance ? formatBalance(a.balance) : undefined,
        })),
    [data, types, subtypes, excludeIds, value, showBalance, formatBalance],
  );
  return (
    <Combobox<Account>
      id={id}
      value={value ?? null}
      onChange={(v, o) => onChange(v, o?.data ?? null)}
      options={options}
      loading={isLoading}
      placeholder={isError ? "Accounts unavailable" : placeholder}
      searchPlaceholder="Search code or name…"
      emptyText="No accounts"
      disabled={disabled || isError}
      className={className}
      clearable={clearable}
      size={size}
      invalid={invalid}
      icon={<BookOpen />}
    />
  );
}
