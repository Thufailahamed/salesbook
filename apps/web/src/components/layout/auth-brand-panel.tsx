import { BookCheck, Boxes, HandCoins, ScanBarcode } from "lucide-react";
import { Brand, BrandMark } from "./brand";

const features = [
  { icon: ScanBarcode, title: "Lightning-fast checkout", text: "Barcode scanning, split payments, holds, returns and exchanges." },
  { icon: Boxes, title: "Inventory that adds up", text: "Sizes, colours and variants, multi-store stock, transfers and counts." },
  { icon: HandCoins, title: "Credit & customer accounts", text: "Sell on credit, take partial payments, store credit and loyalty." },
  { icon: BookCheck, title: "Real double-entry books", text: "Every sale posts to the ledger: P&L, balance sheet and tax, live." },
];

const bars = [38, 52, 44, 61, 57, 72, 66, 84, 78, 96];

/** Left half of the login / signup screens: obsidian stage with a floating "black card". */
export function AuthBrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-frame text-white lg:flex lg:flex-col">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/4 right-[-20%] size-[720px] rounded-full bg-[radial-gradient(circle,oklch(0.82_0.09_84/0.14),transparent_62%)]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 70% 30%, black, transparent 70%)",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
        <Brand />

        <div>
          {/* product vignette */}
          <div className="relative mb-14 h-[220px] max-w-[440px] [perspective:1200px]">
            <div className="absolute top-6 left-10 h-[190px] w-[340px] rounded-[22px] bg-white/[0.03] ring-1 ring-white/[0.06] [transform:rotate(-6deg)]" />
            <div className="metal absolute top-0 left-0 h-[200px] w-[360px] rounded-[22px] p-6 [transform:rotateX(8deg)_rotateY(-14deg)_rotate(2deg)]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-[0.18em] text-white/45 uppercase [font-stretch:120%]">
                  Today&apos;s sales
                </span>
                <BrandMark className="size-6" />
              </div>
              <p className="figure text-gold mt-4 text-[34px] leading-none">Rs 128,450</p>
              <p className="mt-2 text-[12px] text-white/50">
                <span className="font-semibold text-[oklch(0.84_0.09_84)]">↑ 18.2%</span> vs yesterday · 64 invoices
              </p>
              <div className="absolute inset-x-6 bottom-5 flex h-12 items-end gap-1.5">
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-t-[3px] bg-gradient-to-t from-[oklch(0.82_0.09_84/0.15)] to-[oklch(0.82_0.09_84/0.7)]"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          <h2 className="max-w-lg text-[44px] leading-[1.02] font-semibold tracking-[-0.04em] [font-stretch:115%] xl:text-[52px]">
            Run your shop.
            <br />
            <span className="text-gold">Keep perfect books.</span>
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
            Selling, stock, customers, suppliers and real double-entry accounts — in one quietly powerful workspace.
          </p>

          <div className="mt-10 grid max-w-xl grid-cols-2 gap-x-8 gap-y-5">
            {features.map((f) => (
              <div key={f.title} className="flex gap-3">
                <f.icon className="mt-0.5 size-4 shrink-0 text-[oklch(0.84_0.09_84)]" strokeWidth={1.7} />
                <div>
                  <p className="text-[13.5px] font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-white/45">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-white/30">© {new Date().getFullYear()} ShopBooks · Runs on Cloudflare&apos;s global network</p>
      </div>
    </aside>
  );
}
