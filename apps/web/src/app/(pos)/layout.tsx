"use client";

import { AuthGuard } from "@/components/layout/auth-guard";

/** Full-screen layout for the point of sale (no sidebar). */
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-dvh flex-col overflow-hidden bg-frame">{children}</div>
    </AuthGuard>
  );
}
