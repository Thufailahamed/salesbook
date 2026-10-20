import type { Metadata, Viewport } from "next";
import "@fontsource-variable/mona-sans/wdth.css";
import "@fontsource-variable/geist-mono";
import "./globals.css";
import { AppProviders } from "@/providers/app-providers";
import { themeInitScript } from "@/providers/theme-provider";

export const metadata: Metadata = {
  title: { default: "ShopBooks", template: "%s · ShopBooks" },
  description: "Point of sale, inventory, billing and accounting for retail shops.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#141312" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d0c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
