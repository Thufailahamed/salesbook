"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";

/** `?barcode=` pre-fills the barcode, e.g. when a scan at the POS found no product. */
function NewProduct() {
  const barcode = useSearchParams().get("barcode")?.trim() || undefined;
  return <ProductForm initialBarcode={barcode} />;
}

export default function NewProductPage() {
  return (
    <>
      <PageHeader
        backHref="/products"
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: "New" }]}
        title="New product"
        description="Add an item to your catalog. Products with sizes or colours get one variant per combination."
      />
      <React.Suspense>
        <NewProduct />
      </React.Suspense>
    </>
  );
}
