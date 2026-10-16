import { useEffect } from 'react';

/**
 * Side columns on wide screens (`.qt-rail`, index.css) scroll on their own. Their height must fit what is left of the
 * window below where they start: lower down the page (under a title) at first, right under the header once stuck.
 * This keeps `--qt-rail-top` = where each one starts now, so its last item can always be scrolled into view.
 */
export function useRailFit(dep: unknown) {
  useEffect(() => {
    let frame = 0;
    const fit = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>('.qt-rail').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.position !== 'sticky') return el.style.removeProperty('--qt-rail-top');
        const top = Math.max(el.getBoundingClientRect().top, parseFloat(cs.top) || 0);
        el.style.setProperty('--qt-rail-top', `${Math.round(top)}px`);
      });
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(fit); };
    soon();
    window.addEventListener('scroll', soon, { passive: true });
    window.addEventListener('resize', soon);
    document.addEventListener('animationend', soon); // the page slides in on a tab change
    // content above a rail can grow or shrink (a card appears after loading) without any scrolling
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(soon) : null;
    const main = document.querySelector('main');
    if (ro && main) ro.observe(main);
    return () => {
      window.removeEventListener('scroll', soon);
      window.removeEventListener('resize', soon);
      document.removeEventListener('animationend', soon);
      ro?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [dep]);
}
