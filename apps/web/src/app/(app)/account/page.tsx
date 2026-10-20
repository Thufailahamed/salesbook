"use client";

import * as React from "react";
import { KeyRound, UserRound } from "lucide-react";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type SessionUser } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field, FieldGrid } from "@/components/form-field";
import { LocationSelect } from "@/components/entity-selects";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useApiMutation } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";

export default function AccountPage() {
  const { user, refresh, business } = useSession();
  const [name, setName] = React.useState(user.name);
  const [defaultLocationId, setDefaultLocationId] = React.useState<string | undefined>(user.defaultLocationId ?? undefined);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const saveProfile = useApiMutation(
    (body: { name: string; defaultLocationId: string | null }) => api.put<SessionUser>("/auth/profile", body),
    { success: "Profile updated", onSuccess: () => refresh() },
  );

  const changePassword = useApiMutation(
    (body: { currentPassword: string; newPassword: string }) => api.post("/auth/change-password", body),
    {
      success: "Password changed",
      onSuccess: () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      },
    },
  );

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My account" description={`Signed in to ${business.name}`} />

      <div className="grid gap-6">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-card">
          <Avatar name={user.name} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="hidden text-right sm:block">
            <Badge variant="primary">{ROLE_LABELS[user.role]}</Badge>
            <p className="mt-1.5 max-w-60 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[user.role]}</p>
          </div>
        </div>

        <SectionCard
          title="Profile"
          description="Your name appears on receipts and in the audit log."
          icon={UserRound}
          footer={
            <div className="ml-auto">
              <Button
                loading={saveProfile.isPending}
                disabled={!name.trim()}
                onClick={() => saveProfile.mutate({ name: name.trim(), defaultLocationId: defaultLocationId ?? null })}
              >
                Save profile
              </Button>
            </div>
          }
        >
          <FieldGrid>
            <Field label="Full name" htmlFor="name" required>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="email" hint="Ask an administrator to change your email.">
              <Input id="email" value={user.email} disabled />
            </Field>
            <Field label="Default location" hint="Selected automatically when you sign in.">
              <LocationSelect value={defaultLocationId} onChange={setDefaultLocationId} />
            </Field>
          </FieldGrid>
        </SectionCard>

        <SectionCard
          title="Password"
          description="Use at least 8 characters. You'll stay signed in on this device."
          icon={KeyRound}
          footer={
            <div className="ml-auto">
              <Button
                loading={changePassword.isPending}
                disabled={!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
                onClick={() => changePassword.mutate({ currentPassword, newPassword })}
              >
                Change password
              </Button>
            </div>
          }
        >
          <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
            <input type="text" autoComplete="username" value={user.email} readOnly hidden />
            <Field label="Current password" htmlFor="cur">
              <Input id="cur" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
            <FieldGrid>
              <Field label="New password" htmlFor="new" error={tooShort ? "At least 8 characters" : null}>
                <Input
                  id="new"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  aria-invalid={tooShort || undefined}
                />
              </Field>
              <Field label="Confirm new password" htmlFor="confirm" error={mismatch ? "Passwords don't match" : null}>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={mismatch || undefined}
                />
              </Field>
            </FieldGrid>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
