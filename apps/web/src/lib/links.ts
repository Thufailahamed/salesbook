/** Detail-page links for documents referenced by stock movements, payments, journals and statements. */
export function docHref(type: string | null | undefined, id: string | null | undefined): string | null {
  if (!id) return null;
  switch (type) {
    case "invoice":
    case "invoice_void":
      return `/sales/view?id=${id}`;
    case "sale_return":
      return `/sales/returns/view?id=${id}`;
    case "quotation":
      return `/sales/quotations/view?id=${id}`;
    case "purchase":
      return `/purchases/view?id=${id}`;
    case "purchase_return":
      return `/purchases/returns/view?id=${id}`;
    case "adjustment":
      return `/inventory/adjustments/view?id=${id}`;
    case "transfer":
      return `/inventory/transfers/view?id=${id}`;
    case "expense":
    case "expense_void":
      return `/expenses?id=${id}`;
    case "shift":
      return `/registers/view?id=${id}`;
    case "gift_card":
      return `/gift-cards?id=${id}`;
    case "customer":
      return `/customers/view?id=${id}`;
    case "supplier":
      return `/suppliers/view?id=${id}`;
    case "product":
      return `/products/view?id=${id}`;
    case "journal":
    case "manual":
    case "reversal":
      return `/accounting/journals/view?id=${id}`;
    default:
      return null;
  }
}

/** Link to the document that caused a stock movement. */
export function movementHref(m: { referenceType: string | null; referenceId: string | null }): string | null {
  return docHref(m.referenceType, m.referenceId);
}
