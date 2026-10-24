import { useEffect, useRef } from 'react';

const overlays=[];
let originalOverflow='';

// Keep scroll and keyboard focus inside the active drawer/dialog.
export default function useOverlay(open, onClose) {
  const root = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    if(!overlays.length) originalOverflow=document.body.style.overflow;
    overlays.push(root);
    document.body.style.overflow = 'hidden';
    const focusable = () => [...(root.current?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') || [])].filter(el => el.getClientRects().length);
    focusable()[0]?.focus({ preventScroll: true });
    const keydown = event => {
      if(overlays.at(-1)!==root)return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const items = focusable(); const first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { const index=overlays.indexOf(root);if(index>=0)overlays.splice(index,1);if(!overlays.length)document.body.style.overflow=originalOverflow; document.removeEventListener('keydown', keydown); if(previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open]);
  return root;
}
