"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookCheck,
  Boxes,
  Check,
  HandCoins,
  LineChart,
  Lock,
  ScanBarcode,
  ShieldCheck,
  Truck,
  Vault,
} from "lucide-react";
import { Brand, BrandMark } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { useMeQuery } from "@/components/layout/auth-guard";
import { TillDemo } from "./till-demo";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ content */

const navLinks = [
  { label: "Live demo", href: "#demo" },
  { label: "Product", href: "#product" },
  { label: "Accounting", href: "#accounting" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const tickerItems = [
  "INV-01285 · Rs 4,250.00 · cash · journal balanced",
  "GRN-0042 · 120 units received · landed cost applied",
  "PAY-0318 · Nadeesha P. paid Rs 18,900.00 on account",
  "TRF-0019 · 6 units Colombo → Kandy · in transit",
  "Z-0207 · drawer counted · over/short Rs 0.00",
];

const shops = [
  "Clothing",
  "Footwear",
  "Electronics",
  "Grocery",
  "Pharmacy",
  "Hardware",
  "Cosmetics",
  "Stationery",
  "Gift shops",
  "Mobile & accessories",
];

const day = [
  { time: "08:30", title: "Open the register", text: "Count the opening float. The shift starts on the record." },
  { time: "10:12", title: "Scan and sell", text: "Barcode, variant, split tender. Receipt prints in a beat." },
  { time: "13:40", title: "Receive stock", text: "Goods in from the supplier bill, freight folded into cost." },
  { time: "16:05", title: "Collect on account", text: "A regular settles their tab — oldest invoices first." },
  { time: "21:00", title: "Count the drawer", text: "Blind count, over/short posted, Z-report printed." },
  { time: "21:02", title: "Read the day", text: "Profit, tax and stock value. Already reconciled." },
];

const plan = {
  price: "10,000",
  included: [
    "Point of sale & receipts",
    "Returns, exchanges & credit sales",
    "Variants, batches & expiry",
    "Multi-location stock & transfers",
    "Purchasing & supplier bills",
    "Customers, loyalty & gift cards",
    "Double-entry journals & ledger",
    "P&L, balance sheet & cash flow",
    "Tax, aging & valuation reports",
    "Fixed assets & bank reconciliation",
  ],
  limits: ["Unlimited products", "Unlimited invoices", "Unlimited staff", "Every location"],
};

const faqs = [
  {
    q: "Do I need an accountant to use the accounting?",
    a: "No. Every sale, return, purchase and payment posts a balanced double-entry journal automatically. Your accountant gets a clean ledger, trial balance and financial statements whenever they need them.",
  },
  {
    q: "Does it work with my barcode scanner and receipt printer?",
    a: "Any USB or Bluetooth barcode scanner that types into the keyboard works out of the box. Receipts print to standard 58 mm and 80 mm thermal printers, and invoices to A4 from the browser.",
  },
  {
    q: "Can I move my products and customers in?",
    a: "Yes. Import products, variants and opening stock from a CSV file, and set opening balances for customers and suppliers so statements are correct from day one.",
  },
  {
    q: "What happens after the 14-day trial?",
    a: "Subscribe for Rs 10,000 a month and keep going — nothing is lost. If you don't, your workspace becomes read-only and you can still export your data.",
  },
  {
    q: "Is my data safe?",
    a: "ShopBooks runs on Cloudflare's global network with encrypted connections, per-business data isolation, role-based permissions and a full audit log of who changed what.",
  },
  {
    q: "Are there any extra fees?",
    a: "No. One flat Rs 10,000 a month covers every feature, user and location — no setup fees, no add-ons and no cut of your sales.",
  },
];

/* ------------------------------------------------------------------ motion helpers */

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fades its children up the first time they scroll into view. */
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.dataset.shown = "";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn("reveal", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export function Landing() {
  const me = useMeQuery();
  const signedIn = !!me.data;

  return (
    <div className="min-h-dvh overflow-x-clip bg-frame text-white">
      <SiteNav signedIn={signedIn} />
      <Hero signedIn={signedIn} />

      {/* the stone panel floating in the obsidian frame */}
      <main className="relative z-10 mx-2 -mt-24 overflow-hidden rounded-[28px] bg-background text-foreground sm:mx-3 sm:-mt-32">
        <Marquee />
        <Demo />
        <Bento />
        <Ledger />
        <Day />
        <Pricing signedIn={signedIn} />
        <Faq />
        <FinalCta signedIn={signedIn} />
      </main>

      <Footer />
    </div>
  );
}

function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto max-w-[1160px] px-5 sm:px-8", className)}>{children}</div>;
}

function SectionHead({
  eyebrow,
  title,
  text,
  center,
  invert,
}: {
  eyebrow: string;
  title: React.ReactNode;
  text?: string;
  center?: boolean;
  invert?: boolean;
}) {
  return (
    <Reveal className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <p className={cn("eyebrow inline-flex items-center gap-2", invert ? "text-[oklch(0.84_0.09_84)]!" : "text-primary!")}>
        <span className="h-px w-6 bg-current opacity-60" />
        {eyebrow}
      </p>
      <h2
        className={cn(
          "mt-5 text-[34px] leading-[1.02] tracking-[-0.045em] text-balance [font-stretch:120%] sm:text-[50px]",
          invert && "text-white",
        )}
      >
        {title}
      </h2>
      {text && (
        <p className={cn("mt-5 text-[15.5px] leading-relaxed", invert ? "text-white/55" : "text-muted-foreground")}>{text}</p>
      )}
    </Reveal>
  );
}

/* ------------------------------------------------------------------ nav */

function SiteNav({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-2 pt-2 sm:px-3">
      <div
        className={cn(
          "mx-auto flex h-14 max-w-[1200px] items-center justify-between rounded-2xl px-3 transition-all duration-500 sm:px-4",
          scrolled && "bg-[oklch(0.15_0.004_70/0.78)] shadow-[0_10px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-white/[0.07] backdrop-blur-xl",
        )}
      >
        <Link href="/" aria-label="ShopBooks home">
          <Brand />
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-[13.5px] text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Button asChild variant="highlight" size="sm">
              <Link href="/dashboard">
                Dashboard <ArrowRight />
              </Link>
            </Button>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-lg px-3 py-1.5 text-[13.5px] text-white/70 transition-colors hover:text-white sm:block"
              >
                Sign in
              </Link>
              <Button asChild variant="highlight" size="sm">
                <Link href="/signup">Start free trial</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

function Ticker() {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    if (reducedMotion()) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % tickerItems.length), 2800);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="mx-auto inline-flex h-8 max-w-full items-center gap-2.5 overflow-hidden rounded-full bg-white/[0.04] pr-4 pl-1.5 text-[12px] ring-1 ring-white/10">
      <span className="flex items-center gap-1.5 rounded-full bg-[oklch(0.82_0.09_84/0.14)] px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.1em] text-[oklch(0.86_0.08_86)] uppercase">
        <span className="relative flex size-1.5">
          <span className="motion-anim absolute inset-0 animate-ping rounded-full bg-[oklch(0.84_0.09_84)]" />
          <span className="relative size-1.5 rounded-full bg-[oklch(0.84_0.09_84)]" />
        </span>
        Live
      </span>
      <span key={i} className="motion-anim animate-[sb-ticker_0.5s_ease-out] truncate font-mono text-[11.5px] text-white/60">
        {tickerItems[i]}
      </span>
    </div>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden pt-32 pb-40 sm:pt-40 sm:pb-52">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-35%] left-1/2 size-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.82_0.09_84/0.12),transparent_58%)]" />
        {/* brass orbit */}
        <div className="absolute top-[-150px] left-1/2 size-[900px] -translate-x-1/2 sm:top-[-260px] sm:size-[1100px]">
          <div
            className="motion-anim absolute inset-0 animate-[sb-spin_40s_linear_infinite] rounded-full"
            style={{
              background: "conic-gradient(from 0deg, transparent 0 62%, oklch(0.86 0.09 86 / 0.55) 75%, transparent 82%)",
              mask: "radial-gradient(closest-side, transparent calc(100% - 1.5px), black calc(100% - 1px))",
              WebkitMask: "radial-gradient(closest-side, transparent calc(100% - 1.5px), black calc(100% - 1px))",
            }}
          />
          <div className="absolute inset-0 rounded-full ring-1 ring-white/[0.05]" />
          <div className="absolute inset-[14%] rounded-full ring-1 ring-white/[0.035]" />
        </div>
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(ellipse at 50% 30%, black, transparent 60%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="mx-auto max-w-6xl text-center">
          <Ticker />
          <h1 className="mt-8 text-[46px] leading-[0.95] font-semibold tracking-[-0.05em] [font-stretch:125%] sm:text-[76px] lg:text-[96px]">
            <span className="motion-anim inline-block animate-[sb-rise_1.1s_cubic-bezier(0.2,0.7,0.2,1)_both]">Run the shop.</span>
            <br />
            <span className="motion-anim text-gold inline-block animate-[sb-rise_1.1s_cubic-bezier(0.2,0.7,0.2,1)_both] pb-2 [animation-delay:180ms]">
              Keep perfect books.
            </span>
          </h1>
          <p className="motion-anim mx-auto mt-6 max-w-xl animate-[sb-rise_1.1s_cubic-bezier(0.2,0.7,0.2,1)_both] text-[16px] leading-relaxed text-white/55 [animation-delay:320ms] sm:text-[17.5px]">
            Checkout, stock, customers, suppliers and real double-entry accounting — one quietly powerful workspace where
            every sale balances the books the moment it rings up.
          </p>
          <div className="motion-anim mt-10 flex animate-[sb-rise_1.1s_cubic-bezier(0.2,0.7,0.2,1)_both] flex-col items-center justify-center gap-3 [animation-delay:440ms] sm:flex-row">
            <Button asChild variant="highlight" size="xl" className="w-full sm:w-auto">
              <Link href={signedIn ? "/dashboard" : "/signup"}>
                {signedIn ? "Open dashboard" : "Start your 14-day trial"} <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="xl"
              variant="ghost"
              className="w-full font-medium text-white/75 ring-1 ring-white/12 hover:bg-white/[0.06] hover:text-white sm:w-auto"
            >
              <a href="#demo">Try the live till</a>
            </Button>
          </div>
          <p className="mt-6 text-[12px] text-white/35">Rs 10,000 / month · Everything included · No card to start</p>
        </div>

        <ProductShot />
      </div>
    </section>
  );
}

const shotBars = [34, 48, 41, 58, 52, 66, 61, 78, 70, 88, 81, 94];
const shotRows = [
  { no: "INV-01284", who: "Walk-in", amt: "4,250.00", status: "Paid" },
  { no: "INV-01283", who: "Nadeesha P.", amt: "18,900.00", status: "Partial" },
  { no: "INV-01282", who: "Walk-in", amt: "1,120.00", status: "Paid" },
  { no: "INV-01281", who: "Lanka Traders", amt: "62,400.00", status: "Credit" },
];

/** A stylised dashboard that tilts flat as the page scrolls. */
function ProductShot() {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      el.style.transform = "none";
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const p = Math.min(1, Math.max(0, window.scrollY / 560));
      el.style.transform = `perspective(1800px) rotateX(${(1 - p) * 22}deg) scale(${0.93 + p * 0.07})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="relative mx-auto mt-16 max-w-[1060px] sm:mt-20" aria-hidden="true">
      <div className="absolute -inset-x-10 -top-16 bottom-0 rounded-[40px] bg-[radial-gradient(60%_50%_at_50%_0%,oklch(0.82_0.09_84/0.2),transparent)] blur-2xl" />

      <div
        ref={ref}
        className="relative origin-top will-change-transform"
        style={{ transform: "perspective(1800px) rotateX(22deg) scale(0.93)" }}
      >
        <div className="rounded-[22px] bg-white/[0.04] p-2 ring-1 ring-white/10 backdrop-blur">
          <div className="flex overflow-hidden rounded-[16px] bg-[oklch(0.135_0.003_70)] ring-1 ring-white/[0.06]">
            <div className="hidden w-48 shrink-0 flex-col gap-1 border-r border-white/[0.06] p-4 md:flex">
              <div className="mb-4 flex items-center gap-2">
                <BrandMark className="size-6" />
                <span className="text-[12px] font-semibold [font-stretch:120%]">ShopBooks</span>
              </div>
              {["Dashboard", "Point of sale", "Sales", "Products", "Inventory", "Customers", "Purchases", "Accounting", "Reports"].map(
                (l, i) => (
                  <div
                    key={l}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] text-white/45",
                      i === 0 && "bg-white/[0.06] text-white",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full bg-white/15", i === 0 && "bg-[oklch(0.84_0.09_84)]")} />
                    {l}
                  </div>
                ),
              )}
            </div>

            <div className="min-w-0 flex-1 bg-[oklch(0.163_0.004_70)] p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase [font-stretch:115%]">
                    Tuesday, 21 Oct
                  </p>
                  <p className="mt-1 text-[17px] font-semibold tracking-[-0.03em] [font-stretch:115%]">Good evening, Amal</p>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <span className="rounded-md bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/50 ring-1 ring-white/[0.06]">
                    Colombo · Main
                  </span>
                  <span className="rounded-md bg-[oklch(0.88_0.06_86)] px-2.5 py-1 text-[11px] font-medium text-[oklch(0.17_0.008_70)]">
                    New sale
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="metal rounded-[14px] p-4">
                  <p className="text-[9.5px] font-semibold tracking-[0.16em] text-white/45 uppercase">Today&apos;s sales</p>
                  <p className="figure text-gold mt-2 text-[26px] leading-none">128,450</p>
                  <p className="mt-1.5 text-[10.5px] text-white/45">
                    <span className="text-[oklch(0.84_0.09_84)]">↑ 18.2%</span> · 64 invoices
                  </p>
                </div>
                {[
                  { l: "Gross profit", v: "46,210", s: "36.0% margin" },
                  { l: "Receivables", v: "212,900", s: "14 customers" },
                ].map((k) => (
                  <div key={k.l} className="hidden rounded-[14px] bg-white/[0.03] p-4 ring-1 ring-white/[0.06] sm:block">
                    <p className="text-[9.5px] font-semibold tracking-[0.16em] text-white/40 uppercase">{k.l}</p>
                    <p className="figure mt-2 text-[24px] leading-none text-white/90">{k.v}</p>
                    <p className="mt-1.5 text-[10.5px] text-white/40">{k.s}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
                <div className="rounded-[14px] bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <p className="text-[11.5px] font-medium text-white/70">Revenue · last 12 days</p>
                    <p className="text-[10.5px] text-white/35">LKR</p>
                  </div>
                  <div className="mt-4 flex h-28 items-end gap-1.5 sm:h-32">
                    {shotBars.map((h, i) => (
                      <span
                        key={i}
                        className={cn(
                          "flex-1 rounded-t-[4px] bg-white/[0.08]",
                          i === shotBars.length - 1 &&
                            "bg-gradient-to-t from-[oklch(0.82_0.09_84/0.3)] to-[oklch(0.86_0.08_86)]",
                        )}
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
                <div className="hidden rounded-[14px] bg-white/[0.03] p-4 ring-1 ring-white/[0.06] lg:block">
                  <p className="text-[11.5px] font-medium text-white/70">Recent invoices</p>
                  <div className="mt-3 divide-y divide-white/[0.05]">
                    {shotRows.map((r) => (
                      <div key={r.no} className="flex items-center justify-between py-2 text-[11px]">
                        <div>
                          <p className="font-mono text-white/80">{r.no}</p>
                          <p className="text-white/35">{r.who}</p>
                        </div>
                        <div className="text-right">
                          <p className="num text-white/85">{r.amt}</p>
                          <p
                            className={cn(
                              "text-[10px]",
                              r.status === "Paid" ? "text-[oklch(0.72_0.11_155)]" : "text-[oklch(0.84_0.09_84)]",
                            )}
                          >
                            {r.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating notes */}
      <FloatNote className="top-[18%] -left-10 [animation-delay:-2s]" label="Stock" value="Linen shirt M · 24 → 23" />
      <FloatNote className="top-[52%] -left-16" label="Journal" value="JE-004812 · Dr = Cr ✓" gold />
      <FloatNote className="top-[8%] -right-12 [animation-delay:-4s]" label="Customer" value="Nadeesha P. · due 18,900" />
    </div>
  );
}

function FloatNote({ className, label, value, gold }: { className?: string; label: string; value: string; gold?: boolean }) {
  return (
    <div
      className={cn(
        "motion-anim absolute hidden animate-[sb-float_7s_ease-in-out_infinite] rounded-xl bg-[oklch(0.2_0.005_70/0.85)] px-3.5 py-2.5 shadow-[0_20px_40px_-16px_rgb(0_0_0/0.8)] ring-1 ring-white/10 backdrop-blur-md xl:block",
        className,
      )}
    >
      <p className="text-[9px] font-semibold tracking-[0.16em] text-white/40 uppercase">{label}</p>
      <p className={cn("mt-0.5 font-mono text-[11.5px] text-white/85", gold && "text-[oklch(0.86_0.08_86)]")}>{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ marquee */

function Marquee() {
  return (
    <section className="border-b border-border pt-16 pb-14 sm:pt-20">
      <p className="eyebrow text-center">Built for the shops on your street</p>
      <div className="mt-8 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div className="motion-anim flex w-max animate-[sb-marquee_70s_linear_infinite]">
          {[...shops, ...shops].map((s, i) => (
            <span key={i} className="flex items-center gap-10 pr-10">
              <span
                className={cn(
                  "text-[44px] leading-none font-semibold tracking-[-0.045em] whitespace-nowrap [font-stretch:125%] sm:text-[72px]",
                  i % 2 ? "text-outline" : "text-foreground",
                )}
              >
                {s}
              </span>
              <Sparkle className="size-5 text-primary sm:size-6" />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 0c.9 6.6 5.4 11.1 12 12-6.6.9-11.1 5.4-12 12-.9-6.6-5.4-11.1-12-12C6.6 11.1 11.1 6.6 12 0z" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ demo */

function Demo() {
  return (
    <section id="demo" className="scroll-mt-24 py-24 sm:py-32">
      <Container>
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SectionHead
            eyebrow="Try it — right here"
            title={
              <>
                Ring up a sale.
                <br />
                <span className="text-muted-foreground">Watch the books keep themselves.</span>
              </>
            }
          />
          <Reveal delay={120} className="max-w-sm lg:pb-2">
            <p className="text-[14.5px] leading-relaxed text-muted-foreground">
              Tap products, add a discount, change how the customer pays. The receipt, the journal entry, stock and
              balances all update together — using the same tax engine ShopBooks runs at the counter.
            </p>
          </Reveal>
        </div>
        <Reveal className="mt-12">
          <TillDemo />
        </Reveal>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ bento */

function BentoCell({
  icon: Icon,
  title,
  text,
  className,
  children,
  delay,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  text: string;
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className={cn("group", className)}>
      <div className="flex h-full flex-col overflow-hidden rounded-[24px] bg-card ring-1 ring-border transition-shadow duration-500 hover:shadow-[var(--shadow-raised)]">
        <div className="relative m-2 flex h-48 items-center justify-center overflow-hidden rounded-[18px] bg-background ring-1 ring-border/70">
          {children}
        </div>
        <div className="flex flex-1 flex-col p-6 pt-4">
          <div className="flex items-center gap-2.5">
            <Icon className="size-[17px] text-primary" strokeWidth={1.8} />
            <h3 className="text-[17px] tracking-[-0.025em]">{title}</h3>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{text}</p>
        </div>
      </div>
    </Reveal>
  );
}

const barcode = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 2, 1, 1, 3, 1, 1, 2, 1, 2, 3, 1, 1, 2, 1, 1, 3, 2, 1, 2];

function Bento() {
  return (
    <section id="product" className="scroll-mt-24 border-t border-border bg-card/40 py-24 sm:py-32">
      <Container>
        <SectionHead
          eyebrow="The product"
          title={
            <>
              Everything a shop runs on. <span className="text-muted-foreground">Nothing it doesn&apos;t.</span>
            </>
          }
          text="Six connected modules sharing one source of truth — no exports, no sync, no month-end surprises."
        />

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <BentoCell
            className="lg:col-span-4"
            icon={ScanBarcode}
            title="Point of sale"
            text="Keyboard-first checkout with barcode scanning, variants, split tender, holds, credit sales, returns and exchanges in one step."
          >
            <div className="flex w-full items-center justify-center gap-8 px-6">
              <div className="relative rounded-xl bg-card px-5 py-4 shadow-[var(--shadow-card)] ring-1 ring-border">
                <div className="flex h-20 items-stretch gap-[2px]">
                  {barcode.map((w, i) => (
                    <span key={i} className={cn("bg-foreground", i % 2 && "bg-transparent")} style={{ width: w * 2 }} />
                  ))}
                </div>
                <p className="mt-1.5 text-center font-mono text-[10px] tracking-[0.2em] text-muted-foreground">8 901234 567890</p>
                <span className="motion-anim absolute inset-x-2 h-[2px] animate-[sb-scan_2.6s_ease-in-out_infinite] rounded-full bg-[oklch(0.7_0.17_30)] shadow-[0_0_12px_2px_oklch(0.7_0.17_30/0.6)]" />
              </div>
              <div className="hidden w-52 space-y-1.5 text-[12px] sm:block">
                {[
                  ["Linen shirt · M", "3,200.00"],
                  ["Leather belt · 34", "1,450.00"],
                ].map(([a, b]) => (
                  <div key={a} className="flex justify-between rounded-lg bg-card px-3 py-2 ring-1 ring-border">
                    <span>{a}</span>
                    <span className="num text-muted-foreground">{b}</span>
                  </div>
                ))}
                <div className="flex justify-between rounded-lg bg-ink px-3 py-2 font-medium text-ink-foreground">
                  <span>Cash + Card</span>
                  <span className="num">4,650.00</span>
                </div>
              </div>
            </div>
          </BentoCell>

          <BentoCell
            className="lg:col-span-2"
            delay={80}
            icon={Boxes}
            title="Inventory"
            text="Multi-location stock, weighted-average cost, batches with expiry, counts and transfers."
          >
            <div className="w-full space-y-3 px-7">
              {[
                { l: "Colombo", v: 64 },
                { l: "Kandy", v: 31 },
                { l: "Galle", v: 12 },
              ].map((r, i) => (
                <div key={r.l}>
                  <div className="flex justify-between text-[11.5px]">
                    <span className="text-muted-foreground">{r.l}</span>
                    <span className="num font-medium">{r.v}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", i === 0 ? "bg-primary" : "bg-foreground/25")}
                      style={{ width: `${r.v}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </BentoCell>

          <BentoCell
            className="lg:col-span-2"
            icon={HandCoins}
            title="Customers & credit"
            text="Sell now, collect later — limits, statements, store credit and loyalty."
          >
            <div className="flex h-28 items-end gap-3 px-8">
              {[
                { l: "0–30", h: 86 },
                { l: "31–60", h: 52 },
                { l: "61–90", h: 28 },
                { l: "90+", h: 14 },
              ].map((b, i) => (
                <div key={b.l} className="flex h-full flex-col items-center justify-end gap-1.5">
                  <div
                    className={cn("w-9 rounded-t-lg", i === 0 ? "bg-primary" : "bg-foreground/15")}
                    style={{ height: `${b.h}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{b.l}</span>
                </div>
              ))}
            </div>
          </BentoCell>

          <BentoCell
            className="lg:col-span-2"
            delay={80}
            icon={Truck}
            title="Purchasing"
            text="Purchase order to goods received to supplier bill, with landed cost and debit notes."
          >
            <div className="flex items-center gap-0 px-6">
              {["PO", "GRN", "Bill", "Paid"].map((s, i, a) => (
                <React.Fragment key={s}>
                  <div className="flex flex-col items-center gap-2">
                    <span
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full text-[10.5px] font-semibold [font-stretch:120%]",
                        i < 3 ? "bg-ink text-ink-foreground" : "bg-card text-muted-foreground ring-1 ring-border",
                      )}
                    >
                      {i < 3 ? <Check className="size-4" strokeWidth={2.4} /> : i + 1}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">{s}</span>
                  </div>
                  {i < a.length - 1 && (
                    <span className={cn("mb-6 h-px w-7 sm:w-9", i < 2 ? "bg-foreground/50" : "bg-border-strong")} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </BentoCell>

          <BentoCell
            className="lg:col-span-2"
            delay={160}
            icon={Vault}
            title="Money"
            text="Payments, expenses, gift cards and a blind-count cash drawer with Z-reports."
          >
            <div className="w-56 rounded-xl bg-card p-4 font-mono text-[11.5px] shadow-[var(--shadow-card)] ring-1 ring-border">
              <p className="mb-2 text-center text-[10px] tracking-[0.18em] text-muted-foreground">Z-REPORT · SHIFT 207</p>
              {[
                ["Expected", "48,250.00"],
                ["Counted", "48,200.00"],
              ].map(([a, b]) => (
                <div key={a} className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{a}</span>
                  <span>{b}</span>
                </div>
              ))}
              <div className="mt-1.5 flex justify-between border-t border-dashed border-border-strong pt-1.5 font-semibold">
                <span>Short</span>
                <span className="text-destructive">−50.00</span>
              </div>
            </div>
          </BentoCell>

          <BentoCell
            className="md:col-span-2 lg:col-span-6"
            icon={LineChart}
            title="Reports"
            text="Profit & loss, balance sheet, cash flow, tax, inventory valuation and sales by product, category, staff and hour — always live, CSV everywhere."
          >
            <div className="absolute inset-0">
              <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[70%] w-full">
                <defs>
                  <linearGradient id="sb-area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="var(--primary)" stopOpacity="0.28" />
                    <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 160 C 80 150, 120 120, 200 128 S 320 90, 400 96 S 520 60, 600 70 S 720 30, 800 24 L 800 200 L 0 200 Z"
                  fill="url(#sb-area)"
                />
                <path
                  d="M0 160 C 80 150, 120 120, 200 128 S 320 90, 400 96 S 520 60, 600 70 S 720 30, 800 24"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="relative flex gap-8 p-6 sm:gap-14 sm:p-8">
                {[
                  { l: "Revenue", v: "3.84M" },
                  { l: "Gross profit", v: "1.38M" },
                  { l: "Net profit", v: "612K" },
                ].map((k) => (
                  <div key={k.l}>
                    <p className="eyebrow">{k.l}</p>
                    <p className="figure mt-1.5 text-[26px] leading-none sm:text-[34px]">{k.v}</p>
                  </div>
                ))}
              </div>
            </div>
          </BentoCell>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ ledger statement */

function Ledger() {
  const proofs = [
    { a: "Inventory valuation", b: "Inventory ledger" },
    { a: "Customer balances", b: "Accounts receivable" },
    { a: "Supplier balances", b: "Accounts payable" },
  ];
  const reports = ["Trial balance", "General ledger", "Profit & loss", "Balance sheet", "Cash flow", "Tax report", "Aging", "Valuation"];

  return (
    <section id="accounting" className="scroll-mt-24 px-2 sm:px-3">
      <div className="metal relative overflow-hidden rounded-[26px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,oklch(0.82_0.09_84/0.14),transparent)]" />
        <Container className="relative">
          <SectionHead
            invert
            center
            eyebrow="Accounting, built in"
            title="Books that reconcile themselves."
            text="Most POS systems hand your accountant a spreadsheet. ShopBooks hands them a ledger — every money event posts a balanced double-entry journal, atomically, the moment it happens."
          />

          <Reveal className="mt-14 flex items-center justify-center gap-4 sm:gap-8">
            <span className="figure text-[56px] leading-none text-white/90 sm:text-[120px] lg:text-[150px]">Σ Dr</span>
            <span className="figure text-gold text-[56px] leading-none sm:text-[120px] lg:text-[150px]">=</span>
            <span className="figure text-[56px] leading-none text-white/90 sm:text-[120px] lg:text-[150px]">Σ Cr</span>
          </Reveal>
          <p className="mt-4 text-center font-mono text-[12px] tracking-[0.1em] text-white/35">DIFFERENCE 0.00 · EVERY ENTRY · EVERY DAY</p>

          <div className="mx-auto mt-16 grid max-w-4xl gap-px overflow-hidden rounded-[20px] bg-white/[0.07] sm:grid-cols-3">
            {proofs.map((p, i) => (
              <Reveal key={p.a} delay={i * 100} className="bg-[oklch(0.18_0.005_70)] p-6">
                <Check className="size-4 text-[oklch(0.84_0.09_84)]" strokeWidth={2.4} />
                <p className="mt-4 text-[14px] font-medium text-white">{p.a}</p>
                <p className="mt-1 text-[13px] text-white/45">equals {p.b}</p>
              </Reveal>
            ))}
          </div>

          <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2">
            {reports.map((r) => (
              <span key={r} className="rounded-full px-3.5 py-1.5 text-[12.5px] text-white/60 ring-1 ring-white/10">
                {r}
              </span>
            ))}
          </div>
        </Container>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ day timeline */

function Day() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <SectionHead
          eyebrow="A day with ShopBooks"
          title={
            <>
              From first float <span className="text-muted-foreground">to closed books.</span>
            </>
          }
        />
        <div className="relative mt-16">
          <div className="absolute top-[7px] right-0 left-0 hidden h-px bg-gradient-to-r from-primary via-border-strong to-transparent lg:block" />
          <div className="absolute top-0 bottom-0 left-[7px] w-px bg-gradient-to-b from-primary via-border-strong to-transparent lg:hidden" />
          <ol className="grid gap-10 lg:grid-cols-6 lg:gap-6">
            {day.map((d, i) => (
              <li key={d.time} className="relative pl-9 lg:pl-0">
                <span
                  className={cn(
                    "absolute top-0 left-0 size-[15px] rounded-full bg-background ring-[3px]",
                    i === 0 || i === day.length - 1 ? "ring-primary" : "ring-border-strong",
                  )}
                />
                <Reveal delay={i * 90}>
                  <p className="figure text-[22px] leading-none text-primary lg:mt-9">{d.time}</p>
                  <h3 className="mt-3 text-[15.5px] tracking-[-0.02em]">{d.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{d.text}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ pricing */

function MemberCard() {
  const ref = React.useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(1200px) rotateY(${(x - 0.5) * 16}deg) rotateX(${(0.5 - y) * 12}deg)`;
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (el) el.style.transform = "perspective(1200px) rotateY(-8deg) rotateX(6deg)";
  };

  return (
    <div onPointerMove={onMove} onPointerLeave={onLeave} className="mx-auto w-full max-w-[460px] py-6">
      <div
        ref={ref}
        className="metal relative aspect-[1.586] w-full overflow-hidden rounded-[22px] p-6 transition-transform duration-300 ease-out will-change-transform sm:p-8"
        style={{ transform: "perspective(1200px) rotateY(-8deg) rotateX(6deg)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-70 mix-blend-overlay"
          style={{ background: "radial-gradient(circle at var(--gx,30%) var(--gy,20%), oklch(1 0 0 / 0.35), transparent 45%)" }}
        />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <BrandMark className="size-8" />
              <span className="text-[13px] font-semibold tracking-[0.14em] text-white/85 uppercase [font-stretch:125%]">ShopBooks</span>
            </div>
            {/* EMV-style chip */}
            <div className="grid h-9 w-12 grid-cols-3 grid-rows-3 gap-px overflow-hidden rounded-[7px] bg-[linear-gradient(135deg,oklch(0.9_0.07_88),oklch(0.72_0.1_75))] p-[3px] opacity-90">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="rounded-[2px] bg-[oklch(0.82_0.09_84/0.6)] ring-1 ring-[oklch(0.5_0.08_70/0.35)]" />
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-white/40 uppercase">Monthly</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="figure text-[18px] text-white/55">Rs</span>
              <span className="figure text-gold text-[48px] leading-none sm:text-[60px]">{plan.price}</span>
            </p>
          </div>

          <div className="flex items-end justify-between gap-3 font-mono text-[9.5px] tracking-[0.14em] text-white/45 uppercase sm:text-[10.5px]">
            <span>All features · All users</span>
            <span className="text-right">Valid while you trade</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pricing({ signedIn }: { signedIn: boolean }) {
  return (
    <section id="pricing" className="scroll-mt-24 border-t border-border py-24 sm:py-32">
      <Container className="grid items-center gap-14 [&>*]:min-w-0 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
        <Reveal>
          <MemberCard />
        </Reveal>

        <div>
          <SectionHead
            eyebrow="Pricing"
            title="One plan. Everything included."
            text="No tiers to outgrow, no features held back, no cut of your sales. Rs 10,000 a month runs the whole shop — every counter, every branch, every report."
          />
          <Reveal delay={100}>
            <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {plan.limits.map((l) => (
                <div key={l} className="rounded-xl bg-card px-3 py-2.5 text-center text-[12px] font-medium ring-1 ring-border">
                  {l}
                </div>
              ))}
            </div>
            <ul className="mt-7 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {plan.included.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-foreground/80">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.2} />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link href={signedIn ? "/dashboard" : "/signup"}>
                  {signedIn ? "Open dashboard" : "Start 14-day free trial"} <ArrowRight />
                </Link>
              </Button>
              <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" strokeWidth={1.8} /> No card to start · cancel anytime
              </p>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ faq + cta */

function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 border-t border-border py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
        <SectionHead
          eyebrow="FAQ"
          title="Questions, answered."
          text="Can't find what you're looking for? Write to support@shopbooks.app — a real person replies."
        />
        <Reveal delay={100}>
          <div className="divide-y divide-border border-y border-border">
            {faqs.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[15.5px] font-medium transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-border transition-colors group-open:bg-ink group-open:text-ink-foreground group-open:ring-ink">
                    <span className="absolute h-px w-3 bg-current" />
                    <span className="absolute h-3 w-px bg-current transition-transform group-open:scale-y-0" />
                  </span>
                </summary>
                <p className="max-w-xl pb-6 text-[14px] leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="px-2 pb-2 sm:px-3 sm:pb-3">
      <div className="metal relative overflow-hidden rounded-[22px] px-6 py-24 text-center sm:py-32">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,oklch(0.82_0.09_84/0.16),transparent)]" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-white/[0.05]" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-white/[0.05]" />
        <Reveal className="relative">
          <BrandMark className="mx-auto size-14" />
          <h2 className="mx-auto mt-8 max-w-3xl text-[38px] leading-[1] tracking-[-0.05em] text-white [font-stretch:122%] sm:text-[64px]">
            Open tomorrow with <span className="text-gold">books that balance.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[15px] text-white/55">
            Fourteen days, every feature, no card. Bring your products — we&apos;ll handle the ledger.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild variant="highlight" size="xl">
              <Link href={signedIn ? "/dashboard" : "/signup"}>
                {signedIn ? "Open dashboard" : "Start free trial"} <ArrowRight />
              </Link>
            </Button>
            {!signedIn && (
              <Button asChild variant="ghost" size="xl" className="font-medium text-white/70 hover:bg-white/[0.06] hover:text-white">
                <Link href="/login">I already have an account</Link>
              </Button>
            )}
          </div>
          <p className="mt-9 inline-flex items-center gap-1.5 text-[12px] text-white/35">
            <Lock className="size-3.5" /> Encrypted · Per-business isolation · Hosted on Cloudflare
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { title: "Product", links: [["Live demo", "#demo"], ["Features", "#product"], ["Accounting", "#accounting"], ["Pricing", "#pricing"]] },
    { title: "Account", links: [["Sign in", "/login"], ["Start free trial", "/signup"]] },
    { title: "Company", links: [["Support", "mailto:support@shopbooks.app"], ["Sales", "mailto:sales@shopbooks.app"]] },
  ];
  return (
    <footer className="relative overflow-hidden">
      <div className="mx-auto max-w-[1160px] px-5 pt-16 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <Brand />
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-white/40">
              Point of sale, inventory and double-entry accounting for retail shops.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 text-[12px] text-white/40">
              <BookCheck className="size-3.5 text-[oklch(0.84_0.09_84)]" /> Books balanced since the first sale
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-[10.5px] font-semibold tracking-[0.14em] text-white/35 uppercase [font-stretch:115%]">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map(([l, h]) => (
                  <li key={l}>
                    <a href={h} className="text-[13.5px] text-white/60 transition-colors hover:text-white">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col justify-between gap-3 border-t border-white/[0.07] pt-6 text-[12px] text-white/30 sm:flex-row">
          <p>© {new Date().getFullYear()} ShopBooks. All rights reserved.</p>
          <p>Prices in LKR, excluding applicable taxes.</p>
        </div>
      </div>
      <p
        aria-hidden="true"
        className="pointer-events-none mt-6 -mb-[0.22em] text-center text-[15.5vw] leading-none font-semibold tracking-[-0.06em] select-none [font-stretch:125%]"
        style={{
          background: "linear-gradient(180deg, oklch(1 0 0 / 0.09), oklch(1 0 0 / 0))",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        ShopBooks
      </p>
    </footer>
  );
}
