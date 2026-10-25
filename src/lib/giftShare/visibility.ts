/** 버튼 면적 50% 이상 + 전경 문서. 마운트당 1회이며 관찰 API가 없으면 추정 노출을 만들지 않는다. */
export function observeGiftVisibility(node: HTMLElement, seen: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  let visible = false, done = false;
  const check = () => {
    if (!done && visible && document.visibilityState === 'visible') { done = true; seen(); observer.disconnect(); }
  };
  const observer = new IntersectionObserver(entries => {
    for (const e of entries) if (e.target === node) visible = e.isIntersecting && e.intersectionRatio >= 0.5;
    check();
  }, { threshold: 0.5 });
  observer.observe(node);
  document.addEventListener('visibilitychange', check);
  return () => { observer.disconnect(); document.removeEventListener('visibilitychange', check); };
}
