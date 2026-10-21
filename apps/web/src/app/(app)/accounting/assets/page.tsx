"use client";

import * as React from "react";
import { Boxes, Plus, TrendingDown } from "lucide-react";
import type { DepreciationRunResult, FixedAssetInput, FixedAssetRegister } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { EmptyState } from "@/components/empty-state";
import { Field, FieldGrid } from "@/components/form-field";
import { AccountPicker } from "@/components/account-picker";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { useBusinessToday } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { useMoney } from "@/hooks/use-money";
import { api } from "@/lib/api";

export default function FixedAssetsPage() {
  const { can } = useSession();
  const manage = can("accounting.manage");
  const { data, isLoading } = useApiQuery<FixedAssetRegister>("/accounting/fixed-assets");
  const [creating, setCreating] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  return (
    <>
      <PageHeader
        title="Fixed assets"
        description="Equipment and fittings, depreciated straight-line each month."
        backHref="/accounting"
        actions={
          manage && (
            <>
              <Button variant="outline" onClick={() => setRunning(true)} disabled={!data?.rows.length}>
                <TrendingDown /> Run depreciation
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus /> New asset
              </Button>
            </>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={Boxes} title="No fixed assets yet" description="Record an asset when you buy it. Its cost is posted to the books straight away." />
      ) : (
        <SectionCard flush>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Asset</TableHead>
                <TableHead>Acquired</TableHead>
                <TableHead align="right">Cost</TableHead>
                <TableHead align="right" className="hidden md:table-cell">Per month</TableHead>
                <TableHead align="right">Accumulated</TableHead>
                <TableHead align="right">Book value</TableHead>
                <TableHead className="hidden lg:table-cell">Depreciated to</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <span className="font-medium">{a.name}</span>
                    <p className="text-xs text-muted-foreground">{a.usefulLifeMonths} months · {a.accountName}</p>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{a.acquiredOn}</TableCell>
                  <TableCell numeric><Money value={a.cost} /></TableCell>
                  <TableCell numeric className="hidden md:table-cell"><Money value={a.monthlyCharge} /></TableCell>
                  <TableCell numeric><Money value={a.accumulated} /></TableCell>
                  <TableCell numeric className="font-medium"><Money value={a.netBookValue} /></TableCell>
                  <TableCell className="hidden text-[13px] text-muted-foreground lg:table-cell">{a.depreciatedThrough ?? "Not yet"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell numeric><Money value={data.totalCost} /></TableCell>
                <TableCell className="hidden md:table-cell" />
                <TableCell numeric><Money value={data.totalAccumulated} /></TableCell>
                <TableCell numeric><Money value={data.totalNetBookValue} /></TableCell>
                <TableCell className="hidden lg:table-cell" />
              </TableRow>
            </TableFooter>
          </Table>
        </SectionCard>
      )}
      <NewAssetDialog open={creating} onOpenChange={setCreating} />
      <RunDialog open={running} onOpenChange={setRunning} />
    </>
  );
}

function NewAssetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const today = useBusinessToday();
  const [name, setName] = React.useState("");
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [paidFrom, setPaidFrom] = React.useState<string | null>(null);
  const [acquiredOn, setAcquiredOn] = React.useState(today);
  const [cost, setCost] = React.useState(0);
  const [salvage, setSalvage] = React.useState(0);
  const [life, setLife] = React.useState("60");
  React.useEffect(() => {
    if (open) {
      setName("");
      setAccountId(null);
      setPaidFrom(null);
      setAcquiredOn(today);
      setCost(0);
      setSalvage(0);
      setLife("60");
    }
  }, [open, today]);
  const months = Number(life);
  const valid = !!name.trim() && !!accountId && !!paidFrom && cost > 0 && salvage >= 0 && salvage < cost && months >= 1;
  const save = useApiMutation((body: FixedAssetInput) => api.post("/accounting/fixed-assets", body), {
    invalidate: ["/accounting"],
    success: "Asset recorded",
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate({ name: name.trim(), accountId: accountId!, paidFromAccountId: paidFrom!, acquiredOn, cost, salvage, usefulLifeMonths: months });
          }}
        >
          <DialogHeader><DialogTitle>New fixed asset</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Name" htmlFor="asset-name" required>
              <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chiller, shelving, POS terminal" />
            </Field>
            <Field label="Asset account" required>
              <AccountPicker value={accountId} onChange={(id) => setAccountId(id)} types={["asset"]} subtypes={["fixed_asset"]} />
            </Field>
            <Field label="Paid from" required hint="Cash, bank, or a loan or payable you owe">
              <AccountPicker
                value={paidFrom}
                onChange={(id) => setPaidFrom(id)}
                subtypes={["cash", "bank", "payable", "long_term_liability", "other_current_liability"]}
              />
            </Field>
            <FieldGrid>
              <Field label="Date acquired" htmlFor="asset-date">
                <Input id="asset-date" type="date" value={acquiredOn} max={today} onChange={(e) => setAcquiredOn(e.target.value)} />
              </Field>
              <Field label="Useful life (months)" htmlFor="asset-life" required>
                <Input id="asset-life" type="number" min={1} max={600} value={life} onChange={(e) => setLife(e.target.value)} />
              </Field>
            </FieldGrid>
            <FieldGrid>
              <Field label="Cost" required><MoneyInput value={cost} onChange={setCost} /></Field>
              <Field label="Salvage value" hint="What it's worth at the end of its life"><MoneyInput value={salvage} onChange={setSalvage} /></Field>
            </FieldGrid>
            {valid && (
              <p className="text-[13px] text-muted-foreground">
                Depreciation starts the month after purchase.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!valid}>Record asset</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RunDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const today = useBusinessToday();
  const money = useMoney();
  const [throughDate, setThroughDate] = React.useState(today);
  React.useEffect(() => {
    if (open) setThroughDate(today);
  }, [open, today]);
  const run = useApiMutation((body: { throughDate: string }) => api.post<DepreciationRunResult>("/accounting/fixed-assets/depreciate", body), {
    invalidate: ["/accounting"],
    success: (r) => (r.amount > 0 ? `Posted ${money.format(r.amount)} across ${r.assets} asset(s)` : "Nothing new to depreciate"),
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate({ throughDate });
          }}
        >
          <DialogHeader><DialogTitle>Run depreciation</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <p className="text-[13px] text-muted-foreground">
              Depreciates every asset for each full month that has ended by this date. Running it again for the same date posts nothing new.
            </p>
            <Field label="Depreciate through" htmlFor="run-date" required>
              <Input id="run-date" type="date" value={throughDate} max={today} onChange={(e) => setThroughDate(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={run.isPending} disabled={!throughDate}>Run</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
