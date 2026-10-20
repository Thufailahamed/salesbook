"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { can as canRole, type MeResponse, type Permission, type Location } from "@shopbooks/shared";

const LOCATION_KEY = "sb.locationId";

export interface SessionValue {
  me: MeResponse;
  user: MeResponse["user"];
  business: MeResponse["business"];
  locations: MeResponse["locations"];
  /** Active locations only */
  activeLocations: Location[];
  taxRates: MeResponse["taxRates"];
  paymentMethods: MeResponse["paymentMethods"];
  permissions: Permission[];
  can: (permission: Permission) => boolean;
  /** Currently selected working location (POS, stock views). */
  locationId: string;
  location: Location | null;
  setLocationId: (id: string) => void;
  /** Re-fetch /auth/me (after settings changes). */
  refresh: () => Promise<void>;
}

export const SessionContext = React.createContext<SessionValue | null>(null);

function pickLocation(me: MeResponse, stored: string | null): string {
  const active = me.locations.filter((l) => l.isActive);
  if (stored && active.some((l) => l.id === stored)) return stored;
  if (me.user.defaultLocationId && active.some((l) => l.id === me.user.defaultLocationId)) return me.user.defaultLocationId;
  return (active.find((l) => l.isDefault) ?? active[0] ?? me.locations[0])?.id ?? "";
}

export function SessionProvider({ me, children }: { me: MeResponse; children: React.ReactNode }) {
  const qc = useQueryClient();
  const [locationId, setLocationIdState] = React.useState<string>(() => {
    let stored: string | null = null;
    try {
      stored = typeof window !== "undefined" ? localStorage.getItem(LOCATION_KEY) : null;
    } catch {}
    return pickLocation(me, stored);
  });

  // keep selection valid when locations change
  React.useEffect(() => {
    const next = pickLocation(me, locationId);
    if (next !== locationId) setLocationIdState(next);
  }, [me, locationId]);

  const setLocationId = React.useCallback((id: string) => {
    setLocationIdState(id);
    try {
      localStorage.setItem(LOCATION_KEY, id);
    } catch {}
  }, []);

  const value = React.useMemo<SessionValue>(() => {
    const perms = new Set(me.permissions);
    return {
      me,
      user: me.user,
      business: me.business,
      locations: me.locations,
      activeLocations: me.locations.filter((l) => l.isActive),
      taxRates: me.taxRates,
      paymentMethods: me.paymentMethods,
      permissions: me.permissions,
      can: (p: Permission) => perms.has(p) || canRole(me.user.role, p),
      locationId,
      location: me.locations.find((l) => l.id === locationId) ?? null,
      setLocationId,
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: ["/auth/me"] });
      },
    };
  }, [me, locationId, setLocationId, qc]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
