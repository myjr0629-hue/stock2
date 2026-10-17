/** Resolve on each tap: pages may scroll inside app-main or in a body portal. */
export function findAppScroller(doc: Document, win: Window): HTMLElement | null {
  const main = doc.querySelector<HTMLElement>('.app-main');
  const viewport = { left: 0, right: win.innerWidth, top: 0, bottom: win.innerHeight };
  const visibleArea = (el: HTMLElement, bounds = viewport) => {
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || !el.getClientRects().length) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(bounds.right, r.right) - Math.max(bounds.left, r.left)) *
      Math.max(0, Math.min(bounds.bottom, r.bottom) - Math.max(bounds.top, r.top));
  };
  const allowsScroll = (el: HTMLElement) => /^(auto|scroll)$/.test(win.getComputedStyle(el).overflowY);
  // Intel's full-screen report is a body portal, outside app-main. Hit-test the
  // foreground first; walking ancestors also handles taps over report text.
  let foreground = doc.elementFromPoint(win.innerWidth / 2, win.innerHeight / 2) as HTMLElement | null;
  if (foreground && !main?.contains(foreground)) {
    while (foreground && foreground !== doc.body && foreground !== doc.documentElement) {
      // Even a short report owns this gesture: never scroll the page behind it.
      if (allowsScroll(foreground) && visibleArea(foreground) >= win.innerWidth * win.innerHeight / 2) return foreground;
      foreground = foreground.parentElement;
    }
  }
  if (!main) return null;
  const rect = main.getBoundingClientRect();
  const bounds = {
    left: Math.max(0, rect.left), right: Math.min(win.innerWidth, rect.right),
    top: Math.max(0, rect.top), bottom: Math.min(win.innerHeight, rect.bottom),
  };
  const area = (el: HTMLElement) => visibleArea(el, bounds);
  const scrollable = (el: HTMLElement) => el.scrollHeight > el.clientHeight &&
    allowsScroll(el);
  const mainArea = Math.max(0, bounds.right - bounds.left) * Math.max(0, bounds.bottom - bounds.top);
  if (!mainArea) return null;

  // Prefer the nearest large scroller under the visible page's centre. Small widgets
  // and offscreen/hidden tabs must not capture the page's scroll-to-top action.
  let hit = doc.elementFromPoint((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2) as HTMLElement | null;
  if (hit && main.contains(hit)) {
    while (hit) {
      if (scrollable(hit) && area(hit) >= mainArea / 2) return hit;
      if (hit === main) break;
      hit = hit.parentElement;
    }
  }
  let best: HTMLElement | null = null;
  let bestArea = mainArea / 2;
  for (const el of main.querySelectorAll<HTMLElement>('*')) {
    const visibleArea = area(el);
    if (visibleArea >= bestArea && scrollable(el)) { best = el; bestArea = visibleArea; }
  }
  return best ?? (scrollable(main) && area(main) ? main : null);
}

export function registerAppStatusTap(win: Window = window, doc: Document = document): () => void {
  const onTap = () => {
    const scroller = findAppScroller(doc, win);
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
    else win.scrollTo({ top: 0, behavior: 'smooth' });
  };
  win.addEventListener('statusTap', onTap);
  return () => win.removeEventListener('statusTap', onTap);
}
