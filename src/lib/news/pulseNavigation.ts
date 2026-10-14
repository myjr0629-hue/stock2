// news-digest → archive → locale 응답이 모두 보존하는 id를 사용한다.
// 번역된 제목·목록 순서는 갱신될 수 있으므로 이동 키로 쓰지 않는다.
export function newsFocusKey(item: { id?: string | null }): string {
  return item.id || '';
}

/** next/navigation router용 경로 — 웹·Capacitor 모두 locale을 명시한다. */
export function newsArchiveHref(locale: string, item: { id?: string | null }): string {
  const path = `/${locale}/app-view/guardian/news`;
  const focus = newsFocusKey(item);
  return focus ? `${path}?${new URLSearchParams({ focus })}` : path;
}

/** 목록 DOM이 준비된 뒤 한 번 호출. CSS 선택자에 외부 id를 보간하지 않는다. */
export function focusNewsArticle(root: HTMLElement, focus: string): () => void {
  const article = Array.from(root.querySelectorAll<HTMLElement>('[data-news-id]'))
    .find((el) => el.dataset.newsId === focus);
  // body가 아닌 .app-main이 스크롤되는 앱 셸에서도 같은 방식으로 동작한다.
  // instant: 네이티브 전역 smooth 설정·줄어든 모션 설정과 무관하게 번쩍임 없이 도착한다.
  (article || root).scrollIntoView({ behavior: 'instant', block: 'start' });
  if (!article) return () => {};

  article.dataset.newsFocused = 'true';
  const clear = () => { delete article.dataset.newsFocused; };
  const timer = window.setTimeout(clear, 2500);
  return () => { window.clearTimeout(timer); clear(); };
}
