"use client";

import { AuthGuard } from "@/components/layout/auth-guard";

/** Minimal layout for printable documents: neutral grey canvas on screen, plain white on paper. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-dvh bg-muted/60 text-foreground print:bg-white">{children}</div>
    </AuthGuard>
  );
}
