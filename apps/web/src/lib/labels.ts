/** Hand-off between the label designer (/products/labels) and the print route (/print/labels). */
export const LABELS_STORAGE_KEY = "sb.labelJob";

export interface LabelItem {
  variantId: string;
  name: string;
  variantName: string;
  /** Barcode, else SKU */
  code: string;
  price: number;
  mrp: number | null;
  copies: number;
}

export interface LabelJob {
  items: LabelItem[];
  columns: number;
  showPrice: boolean;
  showName: boolean;
  showBusiness: boolean;
}
