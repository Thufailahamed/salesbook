"use client";

import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";

export default function NewProductPage() {
  return (
    <>
      <PageHeader
        backHref="/products"
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: "New" }]}
        title="New product"
        description="Add an item to your catalog. Products with sizes or colours get one variant per combination."
      />
      <ProductForm />
    </>
  );
}
