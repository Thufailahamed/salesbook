"use client";

import * as React from "react";

/**
 * useHotkeys("mod+k", handler)
 * Combos: modifiers "mod" (⌘ on Mac, Ctrl elsewhere), "ctrl", "shift", "alt" + a key ("k", "f2", "escape", "enter", "/").
 * Several combos can be comma-separated: "f9, mod+enter".
 * While typing in inputs, plain keys are ignored unless `enableInInputs`; function keys, Escape and mod-combos always fire.
 */
export function useHotkeys(
  combos: string,
  handler: (e: KeyboardEvent) => void,
  opts: { enabled?: boolean; enableInInputs?: boolean; preventDefault?: boolean } = {},
) {
  const { enabled = true, enableInInputs = false, preventDefault = true } = opts;
  const ref = React.useRef(handler);
  React.useEffect(() => {
    ref.current = handler;
  });

  React.useEffect(() => {
    if (!enabled) return;
    const parsed = combos.split(",").map((c) => {
      const parts = c.trim().toLowerCase().split("+");
      const key = parts.pop() ?? "";
      return {
        key: key === "esc" ? "escape" : key,
        mod: parts.includes("mod"),
        ctrl: parts.includes("ctrl"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt"),
      };
    });
    const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.userAgent);

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      const key = e.key.toLowerCase();
      for (const c of parsed) {
        if (key !== c.key) continue;
        const wantsMeta = c.mod && isMac;
        const wantsCtrl = c.ctrl || (c.mod && !isMac);
        if (wantsMeta !== e.metaKey) continue;
        if (wantsCtrl !== e.ctrlKey) continue;
        if (c.alt !== e.altKey) continue;
        if (c.shift && !e.shiftKey) continue;
        const special = /^f\d{1,2}$/.test(c.key) || c.key === "escape" || c.mod || c.ctrl;
        if (typing && !enableInInputs && !special) continue;
        if (preventDefault) e.preventDefault();
        ref.current(e);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combos, enabled, enableInInputs, preventDefault]);
}
