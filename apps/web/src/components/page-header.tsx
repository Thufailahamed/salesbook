"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { APP_NAME } from "@shopbooks/shared";
import { cn } from "@/lib/utils";

/** Sets document.title to "<title> · ShopBooks" (PageHeader does this automatically for string titles). */
export function usePageTitle(title: string | null | undefined) {
  React.useEffect(() => {
    if (title) document.title = `${title} · ${APP_NAME}`;
  }, [title]);
}

export interface Crumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons on the right */
  actions?: React.ReactNode;
  /** Back arrow link (e.g. "/sales") */
  backHref?: string;
  breadcrumbs?: Crumb[];
  /** Small element next to the title (status badge…) */
  badge?: React.ReactNode;
  /** Small mono caps line above the title (date, section name…) */
  eyebrow?: React.ReactNode;
  /** Rendered below (tabs, filters) */
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  breadcrumbs,
  badge,
  eyebrow,
  children,
  className,
}: PageHeaderProps) {
  usePageTitle(typeof title === "string" ? title : null);
  return (
    <div className={cn("mb-8 flex flex-col gap-4", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="eyebrow flex items-center gap-1.5" aria-label="Breadcrumb">
          {breadcrumbs.map((c, i) => (
            <React.Fragment key={`${c.label}-${i}`}>
              {i > 0 && <ChevronRight className="size-3 opacity-50" />}
              {c.href ? (
                <Link href={c.href} className="transition-colors hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground/80">{c.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {backHref && (
            <Link
              href={backHref}
              className="mt-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:border-border-strong hover:text-foreground"
              aria-label="Back"
            >
              <ArrowLeft className="size-4" />
            </Link>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-2.5 text-primary!">{eyebrow}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate font-display text-[28px] leading-[1.1] font-semibold tracking-[-0.035em] text-foreground sm:text-[32px]">
                {title}
              </h1>
              {badge}
            </div>
            {description && <p className="mt-2 text-[14px] text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
