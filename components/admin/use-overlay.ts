import { useEffect, type RefObject } from "react";

// Panneau superposé (tiroir, modale) ouvert : focus sur `initialFocus`, Échap ferme, la page derrière
// ne défile plus.
export function useOverlay(open: boolean, close: () => void, initialFocus: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    initialFocus.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, initialFocus]);
}
