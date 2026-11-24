import { useEffect, useRef } from "react";

/**
 * Moves keyboard focus into a panel when it opens (to its heading, so a screen reader
 * announces it) and back to whatever opened it when it closes, unless the reader has
 * already moved focus somewhere else on purpose.
 */
export function usePanelFocus(open: boolean, selector: string) {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement as HTMLElement | null;
      const raf = requestAnimationFrame(() => {
        const heading = document.querySelector<HTMLElement>(`${selector} h2`);
        if (!heading) return;
        // Don't steal focus from a field the panel focused itself (e.g. a search box).
        const panel = heading.closest(selector);
        if (panel && panel.contains(document.activeElement)) return;
        if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(raf);
    }
    const back = opener.current;
    opener.current = null;
    const active = document.activeElement;
    if (back && back.isConnected && (!active || active === document.body)) back.focus({ preventScroll: true });
    return undefined;
  }, [open, selector]);
}
