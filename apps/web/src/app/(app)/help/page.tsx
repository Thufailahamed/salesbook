"use client";

import { PageHeader } from "@/components/page-header";
import { HelpAssistant } from "@/components/help-assistant";

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" description="Ask how to do something in ShopBooks and get the steps." />
      <div className="max-w-3xl">
        <HelpAssistant />
      </div>
    </>
  );
}
