"use client";

import * as React from "react";
import { SessionContext, type SessionValue } from "@/providers/session-provider";

/** Current user, business, locations, permissions and selected location. Must be used under the (app)/(pos)/(print) layouts. */
export function useSession(): SessionValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside an authenticated layout");
  return ctx;
}

/** Same as useSession but returns null outside an authenticated layout. */
export function useOptionalSession(): SessionValue | null {
  return React.useContext(SessionContext);
}
