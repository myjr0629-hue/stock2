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

/** setTimeout 최대 지연(2^31−1ms ≈ 24.8일). 넘기면 브라우저가 즉시 실행한다 — 조기 안내(만료 수십 일 전)는 나눠서 기다린다 */
export const MAX_TIMER_MS = 2_147_483_647;
export function scheduleTrialOffExpiry(expiresAt: number, onExpired: () => void): () => void {
  let timer: number | undefined;
  const arm = () => {
    const left = expiresAt - Date.now();
    timer = window.setTimeout(left > MAX_TIMER_MS ? arm : onExpired, Math.max(0, Math.min(left, MAX_TIMER_MS)));
  };
  arm();
  return () => window.clearTimeout(timer);
}
