"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { Product } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { useApiQuery } from "@/hooks/use-api";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <EditProduct />
    </React.Suspense>
  );
}

function EditProduct() {
  const id = useSearchParams().get("id");
  const { data, isLoading, error, refetch } = useApiQuery<Product>(id ? `/products/${id}` : null, undefined, { staleTime: 0 });
  if (!id) return <ErrorState title="Nothing selected" message="No product selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !data) return <ErrorState message={error?.message ?? "Product not found"} onRetry={() => refetch()} />;
  return (
    <>
      <PageHeader
        backHref={`/products/view?id=${data.id}`}
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: data.name, href: `/products/view?id=${data.id}` }, { label: "Edit" }]}
        title={`Edit ${data.name}`}
      />
      <ProductForm key={data.id} product={data} />
    </>
  );
}
