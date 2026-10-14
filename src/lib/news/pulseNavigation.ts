import { newsFocusKey, type PulseIdentity } from './pulseIdentity';
export { newsFocusKey } from './pulseIdentity';

/** id 또는 mergeDay와 같은 기사 판정 키 중 하나가 맞으면 같은 항목이다. */
export function matchesNewsFocus(item: PulseIdentity, focus: string, focusKey: string): boolean {
  return !!((focus && item.id === focus) || (focusKey && newsFocusKey(item) === focusKey));
}

/** next/navigation router용 경로 — 웹·Capacitor 모두 locale을 명시한다. */
export function newsArchiveHref(locale: string, item: PulseIdentity): string {
  const path = `/${locale}/app-view/guardian/news`;
  if (!item.id) return path;
  return `${path}?${new URLSearchParams({ focus: item.id, focusKey: newsFocusKey(item) })}`;
}

/** 목록 DOM이 준비된 뒤 한 번 호출. CSS 선택자에 외부 id를 보간하지 않는다. */
export function focusNewsArticle(root: HTMLElement, focus: string, focusKey: string = ''): () => void {
  const article = Array.from(root.querySelectorAll<HTMLElement>('[data-news-id]'))
    .find((el) => matchesNewsFocus({ id: el.dataset.newsId, focusKey: el.dataset.newsKey }, focus, focusKey));
  // body가 아닌 .app-main이 스크롤되는 앱 셸에서도 같은 방식으로 동작한다.
  // instant: 네이티브 전역 smooth 설정·줄어든 모션 설정과 무관하게 번쩍임 없이 도착한다.
  (article || root).scrollIntoView({ behavior: 'instant', block: 'start' });
  if (!article) return () => {};

  article.dataset.newsFocused = 'true';
  const clear = () => { delete article.dataset.newsFocused; };
  const timer = window.setTimeout(clear, 2500);
  return () => { window.clearTimeout(timer); clear(); };
}
