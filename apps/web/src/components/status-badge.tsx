import * as React from "react";
import type {
  GiftCardStatus,
  InvoiceStatus,
  PaymentStatus,
  PurchaseStatus,
  QuotationStatus,
  ShiftStatus,
} from "@shopbooks/shared";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

export function StatusBadge({
  variant = "neutral",
  children,
  dot = true,
  className,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <Badge variant={variant} dot={dot} className={className}>
      {children}
    </Badge>
  );
}

const payment: Record<PaymentStatus, [BadgeVariant, string]> = {
  paid: ["success", "Paid"],
  partial: ["warning", "Partially paid"],
  unpaid: ["danger", "Unpaid"],
};

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const [v, label] = payment[status] ?? ["neutral", status];
  return <StatusBadge variant={v} className={className}>{label}</StatusBadge>;
}

const invoice: Record<InvoiceStatus, [BadgeVariant, string]> = {
  completed: ["success", "Completed"],
  void: ["neutral", "Void"],
};

export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  const [v, label] = invoice[status] ?? ["neutral", status];
  return <StatusBadge variant={v} className={className}>{label}</StatusBadge>;
}

const purchase: Record<PurchaseStatus, [BadgeVariant, string]> = {
  ordered: ["info", "Ordered"],
  received: ["success", "Received"],
  cancelled: ["neutral", "Cancelled"],
};

export function PurchaseStatusBadge({ status, className }: { status: PurchaseStatus; className?: string }) {
  const [v, label] = purchase[status] ?? ["neutral", status];
  return <StatusBadge variant={v} className={className}>{label}</StatusBadge>;
}

const quotation: Record<QuotationStatus, [BadgeVariant, string]> = {
  draft: ["neutral", "Draft"],
  sent: ["info", "Sent"],
  accepted: ["primary", "Accepted"],
  declined: ["danger", "Declined"],
  converted: ["success", "Converted"],
  expired: ["warning", "Expired"],
};

export function QuotationStatusBadge({ status, className }: { status: QuotationStatus; className?: string }) {
  const [v, label] = quotation[status] ?? ["neutral", status];
  return <StatusBadge variant={v} className={className}>{label}</StatusBadge>;
}

const giftCard: Record<GiftCardStatus, [BadgeVariant, string]> = {
  active: ["success", "Active"],
  redeemed: ["neutral", "Redeemed"],
  void: ["danger", "Void"],
  expired: ["warning", "Expired"],
};

export function GiftCardStatusBadge({ status, className }: { status: GiftCardStatus; className?: string }) {
  const [v, label] = giftCard[status] ?? ["neutral", status];
  return <StatusBadge variant={v} className={className}>{label}</StatusBadge>;
}

const shift: Record<ShiftStatus, [BadgeVariant, string]> = {
  open: ["success", "Open"],
  closed: ["neutral", "Closed"],
};

export function ShiftStatusBadge({ status, className }: { status: ShiftStatus; className?: string }) {
  const [v, label] = shift[status] ?? ["neutral", status];
  return <StatusBadge variant={v} className={className}>{label}</StatusBadge>;
}

/** Active / archived */
export function ActiveBadge({ active, className }: { active: boolean; className?: string }) {
  return (
    <StatusBadge variant={active ? "success" : "neutral"} className={className}>
      {active ? "Active" : "Archived"}
    </StatusBadge>
  );
}

/** Stock level chip: out / low / ok */
export function StockBadge({
  quantity,
  reorderLevel,
  className,
}: {
  quantity: number;
  reorderLevel?: number | null;
  className?: string;
}) {
  if (quantity <= 0)
    return (
      <StatusBadge variant="danger" className={className}>
        Out of stock
      </StatusBadge>
    );
  if (reorderLevel !== null && reorderLevel !== undefined && quantity <= reorderLevel)
    return (
      <StatusBadge variant="warning" className={className}>
        Low stock
      </StatusBadge>
    );
  return (
    <StatusBadge variant="success" className={className}>
      In stock
    </StatusBadge>
  );
}
