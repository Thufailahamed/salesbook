import * as React from "react";
import { cn } from "@/lib/utils";

function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div data-slot="table-container" className={cn("relative w-full overflow-x-auto scrollbar-thin", containerClassName)}>
      <table data-slot="table" className={cn("w-full caption-bottom border-collapse text-sm", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, sticky = false, ...props }: React.ComponentProps<"thead"> & { sticky?: boolean }) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b [&_tr]:border-border/70 [&_tr]:hover:bg-transparent",
        sticky && "sticky top-0 z-10 bg-card/95 backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-border-strong bg-muted/40 font-semibold [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border/70 transition-colors hover:bg-muted/60 data-[state=selected]:bg-primary-soft/60",
        className,
      )}
      {...props}
    />
  );
}

type Align = "left" | "right" | "center";
const alignClass: Record<Align, string> = { left: "text-left", right: "text-right", center: "text-center" };

function TableHead({ className, align = "left", ...props }: React.ComponentProps<"th"> & { align?: Align }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 align-middle text-[10.5px] font-semibold tracking-[0.1em] whitespace-nowrap text-muted-foreground uppercase [font-stretch:115%] first:pl-6 last:pr-6 [&:has([role=checkbox])]:w-10 [&:has([role=checkbox])]:pr-0",
        alignClass[align],
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  align = "left",
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { align?: Align; numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-[52px] px-3 py-2 align-middle first:pl-6 last:pr-6 [&:has([role=checkbox])]:pr-0",
        alignClass[numeric ? "right" : align],
        numeric && "num whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />;
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
