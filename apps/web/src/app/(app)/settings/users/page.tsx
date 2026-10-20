"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Plus, UserCog, UserX } from "lucide-react";
import type { User, UserCreateInput, UserUpdateInput } from "@shopbooks/shared";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/form-field";
import { LocationSelect } from "@/components/entity-selects";
import { useConfirm } from "@/components/confirm-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/utils";

export default function UsersPage() {
  const confirm = useConfirm();
  const { user: me } = useSession();
  const { data, isLoading } = useApiQuery<User[]>("/users");
  const [editing, setEditing] = React.useState<User | "new" | null>(null);
  const deactivate = useApiMutation((id: string) => api.del(`/users/${id}`), { invalidate: ["/users"], success: "User deactivated" });
  const reactivate = useApiMutation((u: User) => api.put(`/users/${u.id}`, { isActive: true }), { invalidate: ["/users"], success: "User reactivated" });

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "User",
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {u.name}
              {u.id === me.id && <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", cell: (u) => <Badge variant={u.role === "owner" ? "solid" : "primary"}>{ROLE_LABELS[u.role]}</Badge> },
    { key: "last", header: "Last sign-in", hideBelow: "md", cell: (u) => <span className="text-[13px] text-muted-foreground">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : "Never"}</span> },
    { key: "status", header: "Status", cell: (u) => (u.isActive ? <Badge variant="success" dot>Active</Badge> : <Badge variant="neutral" dot>Inactive</Badge>) },
    {
      key: "actions",
      header: "",
      width: 56,
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Actions" onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(u)}><Pencil /> Edit</DropdownMenuItem>
            {u.id !== me.id &&
              (u.isActive ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={async () => {
                    if (await confirm({ title: `Deactivate ${u.name}?`, description: "They can no longer sign in. Their history is kept.", tone: "destructive", confirmText: "Deactivate" })) deactivate.mutate(u.id);
                  }}
                >
                  <UserX /> Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => reactivate.mutate(u)}><UserCog /> Reactivate</DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Who can sign in and what they can do."
        actions={<Button onClick={() => setEditing("new")}><Plus /> Add user</Button>}
      />
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => setEditing(r)}
        rowClassName={(u) => (u.isActive ? undefined : "opacity-60")}
        empty={<EmptyState icon={UserCog} title="No users" />}
      />
      <UserDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} user={editing === "new" ? null : editing} />
    </>
  );
}

function UserDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: User | null }) {
  const { user: me } = useSession();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<Role>("cashier");
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [isActive, setIsActive] = React.useState(true);
  React.useEffect(() => {
    if (!open) return;
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setPassword("");
    setRole(user?.role ?? "cashier");
    setLocationId(user?.defaultLocationId ?? undefined);
    setIsActive(user?.isActive ?? true);
  }, [open, user]);

  const save = useApiMutation(
    (body: UserCreateInput | UserUpdateInput) => (user ? api.put(`/users/${user.id}`, body) : api.post("/users", body)),
    { invalidate: ["/users"], success: user ? "User saved" : "User added", onSuccess: () => onOpenChange(false) },
  );
  const self = user?.id === me.id;
  const ownerLocked = user?.role === "owner" && me.role !== "owner";
  const roles = ROLES.filter((r) => r !== "owner" || me.role === "owner");
  const valid = name.trim() && (user ? password === "" || password.length >= 8 : email.trim() && password.length >= 8);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            if (user) {
              save.mutate({
                name: name.trim(),
                role: self ? undefined : role,
                defaultLocationId: locationId ?? null,
                isActive: self ? undefined : isActive,
                password: password || undefined,
              });
            } else {
              save.mutate({ name: name.trim(), email: email.trim(), password, role, defaultLocationId: locationId ?? null });
            }
          }}
        >
          <DialogHeader><DialogTitle>{user ? "Edit user" : "Add user"}</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Name" htmlFor="u-name" required><Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
            <Field label="Email" htmlFor="u-email" required hint={user ? "Email can't be changed." : undefined}>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!user} />
            </Field>
            <Field label={user ? "New password" : "Password"} htmlFor="u-pass" required={!user} hint={user ? "Leave blank to keep the current password." : "At least 8 characters."}>
              <Input id="u-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Role" hint={ROLE_DESCRIPTIONS[role]}>
              <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={self || ownerLocked}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Default location"><LocationSelect value={locationId} onChange={setLocationId} allowAll placeholder="None" /></Field>
            {user && !self && (
              <label className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm">
                Can sign in <Switch checked={isActive} onCheckedChange={setIsActive} />
              </label>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!valid || ownerLocked}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
