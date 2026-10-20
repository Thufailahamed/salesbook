import { AuthBrandPanel } from "@/components/layout/auth-brand-panel";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:bg-frame">
      <AuthBrandPanel />
      <main className="flex min-h-dvh flex-col bg-background lg:m-2 lg:min-h-[calc(100dvh-1rem)] lg:rounded-[18px]">{children}</main>
    </div>
  );
}
