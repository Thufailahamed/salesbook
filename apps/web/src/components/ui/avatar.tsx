import * as React from "react";
import { cn, hashHue, initials } from "@/lib/utils";

const sizes = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-9 text-[13px]",
  lg: "size-11 text-sm",
  xl: "size-14 text-base",
} as const;

/** Initials avatar with a stable colour derived from the name; shows `src` when provided. */
function Avatar({
  name,
  src,
  size = "md",
  className,
  square = false,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
  square?: boolean;
}) {
  const hue = hashHue(name ?? "?");
  return (
    <span
      data-slot="avatar"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold select-none",
        square ? "rounded-lg" : "rounded-full",
        !src &&
          "bg-[oklch(0.94_0.022_var(--h))] text-[oklch(0.4_0.06_var(--h))] ring-1 ring-inset ring-[oklch(0.4_0.06_var(--h)/0.1)] dark:bg-[oklch(0.3_0.03_var(--h))] dark:text-[oklch(0.88_0.05_var(--h))]",
        sizes[size],
        className,
      )}
      style={{ "--h": hue } as React.CSSProperties}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? ""} className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export { Avatar };
