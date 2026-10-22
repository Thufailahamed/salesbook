"use client";

import { Sparkles } from "lucide-react";
import type { AiFeature, AiSettings } from "@shopbooks/shared";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";

/** Switch each AI feature off or on for this business. Features with no model on the server cannot be switched on. */
export function AiFeaturesTab() {
  const { can } = useSession();
  const canManage = can("settings.manage");
  const settings = useApiQuery<AiSettings>("/ai/settings");
  const save = useApiMutation(
    (features: Partial<Record<AiFeature, boolean>>) => api.put<AiSettings>("/ai/settings", { features }),
    { invalidate: ["/ai"], success: "AI features saved" },
  );

  return (
    <SectionCard
      title="AI features"
      icon={Sparkles}
      description="Turn off any AI feature for this business. Each one only runs where the server has its model set up."
      flush
    >
      {settings.isLoading || !settings.data ? (
        <div className="space-y-4 p-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ul className="divide-y">
          {settings.data.features.map((f) => {
            const locked = !canManage || !f.available || save.isPending;
            return (
              <li key={f.key} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{f.label}</p>
                    {!f.available && <Badge variant="outline">Not set up</Badge>}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{f.description}</p>
                </div>
                <Switch
                  aria-label={`${f.enabled ? "Turn off" : "Turn on"} ${f.label}`}
                  checked={f.enabled && f.available}
                  disabled={locked}
                  onCheckedChange={(on) => save.mutate({ [f.key]: on })}
                />
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
