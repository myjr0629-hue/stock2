/** Subscribe once while a different dialog is present. */
export function waitForOtherModal(doc: Document, ready: () => void): () => void {
  const observer = new MutationObserver(() => {
    if (!doc.querySelector('[aria-modal="true"]')) {
      observer.disconnect();
      ready();
    }
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
  return () => observer.disconnect();
}

export function scheduleTrialOffExpiry(expiresAt: number, onExpired: () => void): () => void {
  const timer = window.setTimeout(onExpired, Math.max(0, expiresAt - Date.now()));
  return () => window.clearTimeout(timer);
}
