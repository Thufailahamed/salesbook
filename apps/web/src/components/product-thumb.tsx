import { Package } from "lucide-react";
import { assetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Square product image (or a package glyph when there is none). */
export function ProductThumb({ url, className }: { url: string | null | undefined; className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(url)!} alt="" className="size-full object-cover" />
      ) : (
        <Package className="size-4 text-muted-foreground" strokeWidth={1.6} />
      )}
    </span>
  );
}
