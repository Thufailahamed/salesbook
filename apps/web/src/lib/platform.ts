import type { BadgeVariant } from "@/components/ui/badge";
import type { PlatformOrder, SubscriptionInfo } from "@shopbooks/shared";

/** Platform prices are always LKR cents. */
export function lkr(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return `Rs. ${v.toLocaleString("en-LK", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export const SUB_STATE: Record<SubscriptionInfo["state"], { label: string; variant: BadgeVariant }> = {
  none: { label: "No plan", variant: "neutral" },
  active: { label: "Active", variant: "success" },
  expiring: { label: "Expiring", variant: "warning" },
  expired: { label: "Expired", variant: "danger" },
  suspended: { label: "Suspended", variant: "danger" },
};

export const ORDER_STATE: Record<PlatformOrder["status"], { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pending", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  expired: { label: "Expired", variant: "neutral" },
};

export function periodLabel(days: number): string {
  if (days % 365 === 0) return days === 365 ? "year" : `${days / 365} years`;
  if (days === 30) return "month";
  if (days % 30 === 0) return `${days / 30} months`;
  return `${days} days`;
}
