"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Plus, Ruler, Tag, Tags, Trash2 } from "lucide-react";
import type { Brand, BrandInput, Category, CategoryInput, Unit, UnitInput } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/form-field";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

const NONE = "__none__";
const COLORS = ["#2f6b4f", "#b7791f", "#9b2c2c", "#2b6cb0", "#6b46c1", "#2c7a7b", "#975a16", "#4a5568"];

function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Actions" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function CatalogSetupPage() {
  const { can } = useSession();
  const manage = can("products.manage");
  return (
    <>
      <PageHeader title="Categories & brands" description="Organise the catalog and define how items are measured." />
      <Tabs defaultValue="categories" variant="underline">
        <TabsList>
          <TabsTrigger value="categories">
            <Tags /> Categories
          </TabsTrigger>
          <TabsTrigger value="brands">
            <Tag /> Brands
          </TabsTrigger>
          <TabsTrigger value="units">
            <Ruler /> Units
          </TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <CategoriesTab manage={manage} />
        </TabsContent>
        <TabsContent value="brands">
          <BrandsTab manage={manage} />
        </TabsContent>
        <TabsContent value="units">
          <UnitsTab manage={manage} />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ---------------------------------------------------------------- categories

function CategoriesTab({ manage }: { manage: boolean }) {
  const confirm = useConfirm();
  const { data, isLoading } = useApiQuery<Category[]>("/categories");
  const [editing, setEditing] = React.useState<Category | null | "new">(null);
  const del = useApiMutation((id: string) => api.del(`/categories/${id}`), { invalidate: ["/categories", "/products"], success: "Category deleted" });
  const byId = new Map((data ?? []).map((c) => [c.id, c]));

  const rows = React.useMemo(() => {
    // parents first, then their children
    const list = data ?? [];
    const top = list.filter((c) => !c.parentId || !list.some((p) => p.id === c.parentId)).sort((a, b) => a.name.localeCompare(b.name));
    return top.flatMap((t) => [t, ...list.filter((c) => c.parentId === t.id).sort((a, b) => a.name.localeCompare(b.name))]);
  }, [data]);

  const columns: Column<Category>[] = [
    {
      key: "name",
      header: "Category",
      cell: (c) => (
        <div className={c.parentId && byId.has(c.parentId) ? "flex items-center gap-2.5 pl-6" : "flex items-center gap-2.5"}>
          <span className="size-2.5 shrink-0 rounded-full ring-1 ring-black/5" style={{ background: c.color ?? "var(--muted-foreground)" }} />
          <div className="min-w-0">
            <p className="font-medium">{c.name}</p>
            {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "products",
      header: "Products",
      numeric: true,
      cell: (c) => (
        <Link href={`/products?categoryId=${c.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {formatNumber(c.productCount)}
        </Link>
      ),
    },
    ...(manage
      ? [
          {
            key: "actions",
            header: "",
            width: 56,
            cell: (c: Category) => (
              <RowMenu
                onEdit={() => setEditing(c)}
                onDelete={async () => {
                  if (await confirm({ title: `Delete ${c.name}?`, description: "Products in this category become uncategorised.", tone: "destructive", confirmText: "Delete" }))
                    del.mutate(c.id);
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={manage ? (r) => setEditing(r) : undefined}
        toolbar={
          manage ? (
            <Button size="sm" className="sm:ml-auto" onClick={() => setEditing("new")}>
              <Plus /> New category
            </Button>
          ) : undefined
        }
        empty={<EmptyState icon={Tags} title="No categories yet" description="Group products into categories like Shirts, Shoes or Snacks." />}
      />
      <CategoryDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        category={editing === "new" ? null : editing}
        categories={data ?? []}
      />
    </>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
  categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category: Category | null;
  categories: Category[];
}) {
  const [name, setName] = React.useState("");
  const [parentId, setParentId] = React.useState<string | null>(null);
  const [color, setColor] = React.useState<string | null>(COLORS[0]!);
  const [description, setDescription] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setParentId(category?.parentId ?? null);
      setColor(category?.color ?? COLORS[0]!);
      setDescription(category?.description ?? "");
    }
  }, [open, category]);
  const save = useApiMutation(
    (body: CategoryInput) => (category ? api.put(`/categories/${category.id}`, body) : api.post("/categories", body)),
    { invalidate: ["/categories", "/products"], success: category ? "Category saved" : "Category added", onSuccess: () => onOpenChange(false) },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate({ name: name.trim(), parentId, color, description: description.trim() || null });
          }}
        >
          <DialogHeader>
            <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Name" htmlFor="cat-name" required>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Parent category">
              <Select value={parentId ?? NONE} onValueChange={(v) => setParentId(v === NONE ? null : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None (top level)</SelectItem>
                  {categories
                    .filter((c) => c.id !== category?.id && !c.parentId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Colour">
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="size-7 rounded-full ring-offset-2 ring-offset-card transition-shadow data-[on=true]:ring-2 data-[on=true]:ring-ring"
                    data-on={color === c}
                    style={{ background: c }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
              </div>
            </Field>
            <Field label="Description" htmlFor="cat-desc">
              <Textarea id="cat-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- brands

function BrandsTab({ manage }: { manage: boolean }) {
  const confirm = useConfirm();
  const { data, isLoading } = useApiQuery<Brand[]>("/brands");
  const [editing, setEditing] = React.useState<Brand | null | "new">(null);
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (editing) setName(editing === "new" ? "" : editing.name);
  }, [editing]);
  const save = useApiMutation(
    (body: BrandInput) => (editing && editing !== "new" ? api.put(`/brands/${editing.id}`, body) : api.post("/brands", body)),
    { invalidate: ["/brands", "/products"], success: "Brand saved", onSuccess: () => setEditing(null) },
  );
  const del = useApiMutation((id: string) => api.del(`/brands/${id}`), { invalidate: ["/brands", "/products"], success: "Brand deleted" });

  const columns: Column<Brand>[] = [
    { key: "name", header: "Brand", cell: (b) => <span className="font-medium">{b.name}</span> },
    { key: "count", header: "Products", numeric: true, cell: (b) => formatNumber(b.productCount) },
    ...(manage
      ? [
          {
            key: "actions",
            header: "",
            width: 56,
            cell: (b: Brand) => (
              <RowMenu
                onEdit={() => setEditing(b)}
                onDelete={async () => {
                  if (await confirm({ title: `Delete ${b.name}?`, description: "Products keep working without a brand.", tone: "destructive", confirmText: "Delete" }))
                    del.mutate(b.id);
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={data ? [...data].sort((a, b) => a.name.localeCompare(b.name)) : undefined}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={manage ? (r) => setEditing(r) : undefined}
        toolbar={
          manage ? (
            <Button size="sm" className="sm:ml-auto" onClick={() => setEditing("new")}>
              <Plus /> New brand
            </Button>
          ) : undefined
        }
        empty={<EmptyState icon={Tag} title="No brands yet" description="Brands help customers and staff find products faster." />}
      />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="sm">
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) save.mutate({ name: name.trim() });
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "New brand" : "Edit brand"}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Field label="Name" htmlFor="brand-name" required>
                <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- units

function UnitsTab({ manage }: { manage: boolean }) {
  const confirm = useConfirm();
  const { data, isLoading } = useApiQuery<Unit[]>("/units");
  const [editing, setEditing] = React.useState<Unit | null | "new">(null);
  const [form, setForm] = React.useState<UnitInput>({ name: "", shortName: "", allowDecimal: false });
  React.useEffect(() => {
    if (editing) setForm(editing === "new" ? { name: "", shortName: "", allowDecimal: false } : { name: editing.name, shortName: editing.shortName, allowDecimal: editing.allowDecimal });
  }, [editing]);
  const save = useApiMutation(
    (body: UnitInput) => (editing && editing !== "new" ? api.put(`/units/${editing.id}`, body) : api.post("/units", body)),
    { invalidate: ["/units", "/products"], success: "Unit saved", onSuccess: () => setEditing(null) },
  );
  const del = useApiMutation((id: string) => api.del(`/units/${id}`), { invalidate: ["/units"], success: "Unit deleted" });

  const columns: Column<Unit>[] = [
    { key: "name", header: "Unit", cell: (u) => <span className="font-medium">{u.name}</span> },
    { key: "short", header: "Abbreviation", cell: (u) => <span className="font-mono text-[12.5px]">{u.shortName}</span> },
    {
      key: "decimal",
      header: "Quantities",
      cell: (u) => (u.allowDecimal ? <Badge variant="info">Fractional</Badge> : <span className="text-[13px] text-muted-foreground">Whole numbers</span>),
    },
    ...(manage
      ? [
          {
            key: "actions",
            header: "",
            width: 56,
            cell: (u: Unit) => (
              <RowMenu
                onEdit={() => setEditing(u)}
                onDelete={async () => {
                  if (await confirm({ title: `Delete ${u.name}?`, tone: "destructive", confirmText: "Delete" })) del.mutate(u.id);
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={manage ? (r) => setEditing(r) : undefined}
        toolbar={
          manage ? (
            <>
              <p className="text-[13px] text-muted-foreground">Products without a unit are sold by the piece.</p>
              <Button size="sm" className="sm:ml-auto" onClick={() => setEditing("new")}>
                <Plus /> New unit
              </Button>
            </>
          ) : undefined
        }
        empty={<EmptyState icon={Ruler} title="No units yet" description="Add units like Metre (m) or Kilogram (kg) for items sold by measure." />}
      />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="sm">
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              if (form.name.trim() && form.shortName.trim()) save.mutate({ ...form, name: form.name.trim(), shortName: form.shortName.trim() });
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "New unit" : "Edit unit"}</DialogTitle>
            </DialogHeader>
            <DialogBody className="grid gap-4">
              <Field label="Name" htmlFor="u-name" required>
                <Input id="u-name" placeholder="Metre" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
              </Field>
              <Field label="Abbreviation" htmlFor="u-short" required>
                <Input id="u-short" placeholder="m" value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} />
              </Field>
              <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">Allow fractional quantities</span>
                  <span className="block text-[13px] text-muted-foreground">e.g. 1.5 m or 0.25 kg</span>
                </span>
                <Switch checked={form.allowDecimal} onCheckedChange={(v) => setForm((f) => ({ ...f, allowDecimal: v }))} />
              </label>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending} disabled={!form.name.trim() || !form.shortName.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
