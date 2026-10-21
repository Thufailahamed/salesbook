"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Download, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Brand, Category, ProductInput, TaxRate, Unit } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery, invalidatePaths } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { parseCSV } from "@/lib/csv";
import { downloadFile, toCSV } from "@/lib/utils";

const COLUMNS = [
  "name",
  "category",
  "brand",
  "unit",
  "tax_percent",
  "sku",
  "barcode",
  "cost_price",
  "sell_price",
  "wholesale_price",
  "mrp",
  "reorder_level",
  "opening_stock",
  "track_stock",
  "description",
] as const;

const TEMPLATE_ROWS: (string | number)[][] = [
  COLUMNS as unknown as string[],
  ["Full cream milk 1L", "Dairy", "Fresh Farm", "pcs", 0, "MILK-1L", "8901234500011", 180, 210, "", 230, 20, 50, "yes", "Pasteurised"],
  ["Basmati rice 5kg", "Grocery", "", "pcs", 5, "RICE-5KG", "", 1100, 1320, "", "", 10, 30, "yes", ""],
];

interface Row {
  line: number;
  values: Record<string, string>;
  errors: string[];
  product: ProductInput | null;
}

export default function ImportProductsPage() {
  const money = useMoney();
  const qc = useQueryClient();
  const { locationId, location, taxRates } = useSession();
  const categories = useApiQuery<Category[]>("/categories");
  const brands = useApiQuery<Brand[]>("/brands");
  const units = useApiQuery<Unit[]>("/units");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [result, setResult] = React.useState<{ created: number; failed: { line: number; name: string; message: string }[] } | null>(null);

  const validRows = rows.filter((r) => r.errors.length === 0);

  const handleFile = async (file: File) => {
    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    setRows(buildRows(parseCSV(text), {
      categories: categories.data ?? [],
      brands: brands.data ?? [],
      units: units.data ?? [],
      taxRates,
      locationId,
      toMinor: money.toMinor,
    }));
  };

  const run = async () => {
    if (validRows.length === 0) return;
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: validRows.length });
    const failed: { line: number; name: string; message: string }[] = [];
    let created = 0;
    // Missing categories and brands are created first, so every row can reference them.
    const categoryIds = new Map((categories.data ?? []).map((c) => [c.name.toLowerCase(), c.id]));
    const brandIds = new Map((brands.data ?? []).map((b) => [b.name.toLowerCase(), b.id]));
    try {
      for (const r of validRows) {
        const p = r.product!;
        const catName = r.values.category?.trim();
        if (catName && !categoryIds.has(catName.toLowerCase())) {
          const c = await api.post<Category>("/categories", { name: catName, parentId: null, color: null, description: null });
          categoryIds.set(catName.toLowerCase(), c.id);
        }
        const brandName = r.values.brand?.trim();
        if (brandName && !brandIds.has(brandName.toLowerCase())) {
          const b = await api.post<Brand>("/brands", { name: brandName });
          brandIds.set(brandName.toLowerCase(), b.id);
        }
        const body: ProductInput = {
          ...p,
          categoryId: catName ? categoryIds.get(catName.toLowerCase()) ?? null : null,
          brandId: brandName ? brandIds.get(brandName.toLowerCase()) ?? null : null,
        };
        try {
          await api.post("/products", body);
          created++;
        } catch (e) {
          failed.push({ line: r.line, name: p.name, message: e instanceof Error ? e.message : "Could not save" });
        }
        setProgress((s) => ({ ...s, done: s.done + 1 }));
      }
    } finally {
      await invalidatePaths(qc, ["/products", "/categories", "/brands", "/inventory", "/reports", "/settings"]);
      setRunning(false);
      setResult({ created, failed });
      if (failed.length === 0) toast.success(`${created} products imported`);
      else toast.error(`${created} imported, ${failed.length} failed`);
    }
  };

  return (
    <>
      <PageHeader
        title="Import products"
        description="Add many products at once from a spreadsheet. One row per product; sizes and colours are added afterwards on the product."
        actions={
          <Button variant="outline" asChild>
            <Link href="/products"><ArrowLeft /> Back to products</Link>
          </Button>
        }
      />
      <div className="grid gap-6">
        <SectionCard title="1 · Get the template">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Columns: {COLUMNS.join(", ")}. Prices are in {money.symbol ? `${money.symbol} ` : ""}major units (e.g. 210.50). Leave a column empty when it doesn&apos;t apply.
              Categories and brands are created automatically if they don&apos;t exist. Units must match an existing unit&apos;s short name; tax_percent must match a tax rate.
              Opening stock is added to {location?.name ?? "the selected location"}.
            </p>
            <Button variant="outline" onClick={() => downloadFile("products-template.csv", toCSV(TEMPLATE_ROWS))}>
              <Download /> Download template
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="2 · Choose your file">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:bg-muted/50">
            <Upload className="size-6 text-muted-foreground" />
            <span className="font-medium">{fileName ?? "Choose a CSV file"}</span>
            <span className="text-sm text-muted-foreground">Save your spreadsheet as CSV (UTF-8), then pick it here.</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={running}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </SectionCard>

        {rows.length > 0 && (
          <SectionCard
            title={`3 · Check the rows (${validRows.length} of ${rows.length} ready)`}
            flush
            action={
              <Button onClick={run} loading={running} disabled={validRows.length === 0}>
                Import {validRows.length} product{validRows.length === 1 ? "" : "s"}
              </Button>
            }
          >
            {running && (
              <div className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
                Importing {progress.done} of {progress.total}…
              </div>
            )}
            <div className="max-h-[480px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-14">Line</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.line} className="hover:bg-transparent">
                      <TableCell className="text-muted-foreground">{r.line}</TableCell>
                      <TableCell className="font-medium">{r.values.name || "—"}<p className="font-mono text-[11.5px] font-normal text-muted-foreground">{r.values.sku}</p></TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{r.values.category || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.values.sell_price || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.values.opening_stock || "0"}</TableCell>
                      <TableCell>
                        {r.errors.length === 0 ? (
                          <StatusBadge variant="success">Ready</StatusBadge>
                        ) : (
                          <span className="flex items-start gap-1.5 text-sm text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{r.errors.join("; ")}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        )}

        {rows.length === 0 && !fileName && <EmptyState compact title="No file yet" description="Pick a CSV above to see a preview before anything is saved." />}

        {result && (
          <SectionCard title="Result">
            <div className="grid gap-3">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="size-5 text-success" /> {result.created} product{result.created === 1 ? "" : "s"} imported
              </p>
              {result.failed.length > 0 && (
                <div className="grid gap-1.5 text-sm">
                  <p className="font-medium text-destructive">{result.failed.length} could not be saved:</p>
                  {result.failed.map((f) => (
                    <p key={f.line} className="text-muted-foreground">Line {f.line} ({f.name}): {f.message}</p>
                  ))}
                </div>
              )}
              <div>
                <Button variant="outline" asChild><Link href="/products">View products</Link></Button>
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </>
  );
}

function buildRows(
  table: string[][],
  ctx: {
    categories: Category[];
    brands: Brand[];
    units: Unit[];
    taxRates: TaxRate[];
    locationId: string;
    toMinor: (major: number) => number;
  },
): Row[] {
  if (table.length < 2) return [];
  const header = table[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = ["name", "sell_price"].filter((c) => !header.includes(c));
  if (missing.length) {
    return [{ line: 1, values: {}, errors: [`The file needs a ${missing.join(" and ")} column`], product: null }];
  }
  const unitByName = new Map(ctx.units.flatMap((u) => [[u.shortName.toLowerCase(), u], [u.name.toLowerCase(), u]] as const));
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();

  return table.slice(1).map((cells, i) => {
    const values: Record<string, string> = {};
    header.forEach((h, idx) => (values[h] = (cells[idx] ?? "").trim()));
    const errors: string[] = [];
    const num = (key: string, label: string, required = false): number | null => {
      const raw = values[key] ?? "";
      if (raw === "") {
        if (required) errors.push(`${label} is required`);
        return null;
      }
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`${label} must be a number`);
        return null;
      }
      return n;
    };
    if (!values.name) errors.push("Name is required");
    const sell = num("sell_price", "Sell price", true);
    const cost = num("cost_price", "Cost price") ?? 0;
    const wholesale = num("wholesale_price", "Wholesale price");
    const mrp = num("mrp", "MRP");
    const reorder = num("reorder_level", "Reorder level");
    const opening = num("opening_stock", "Opening stock") ?? 0;
    const taxPercent = num("tax_percent", "Tax %");

    let taxRateId: string | null = null;
    if (taxPercent !== null) {
      const match = ctx.taxRates.find((t) => t.rate === taxPercent);
      if (match) taxRateId = match.id;
      else errors.push(`No tax rate of ${taxPercent}%`);
    }
    let unitId: string | null = null;
    if (values.unit) {
      const u = unitByName.get(values.unit.toLowerCase());
      if (u) unitId = u.id;
      else errors.push(`Unknown unit "${values.unit}"`);
    }
    const sku = values.sku || null;
    if (sku) {
      if (seenSku.has(sku.toUpperCase())) errors.push(`Duplicate SKU ${sku} in this file`);
      seenSku.add(sku.toUpperCase());
    }
    const barcode = values.barcode || null;
    if (barcode) {
      if (seenBarcode.has(barcode)) errors.push(`Duplicate barcode ${barcode} in this file`);
      seenBarcode.add(barcode);
    }
    const track = !["no", "false", "0"].includes((values.track_stock ?? "yes").toLowerCase());
    const product: ProductInput | null =
      errors.length || sell === null
        ? null
        : {
            name: values.name,
            description: values.description || null,
            type: "standard",
            categoryId: null,
            brandId: null,
            unitId,
            taxRateId,
            trackInventory: track,
            imageUrl: null,
            tags: null,
            isActive: true,
            hasVariants: false,
            options: [],
            variants: [
              {
                name: "",
                options: {},
                sku,
                barcode,
                price: ctx.toMinor(sell),
                wholesalePrice: wholesale === null ? null : ctx.toMinor(wholesale),
                costPrice: ctx.toMinor(cost),
                mrp: mrp === null ? null : ctx.toMinor(mrp),
                reorderLevel: reorder,
                isActive: true,
                openingStock: track && opening > 0 && ctx.locationId ? [{ locationId: ctx.locationId, quantity: opening }] : undefined,
              },
            ],
          };
    return { line: i + 2, values, errors, product };
  });
}
