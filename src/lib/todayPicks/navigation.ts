/** 카드의 제목·종목·전체 보기 모두 요약부터 연다. */
export function todayPicksHref(locale: string): string {
  return `/${locale}/app-view/today`;
}

/** 내부 .app-main은 라우트 사이에도 살아 있으므로 진입할 때 직접 초기화한다. */
export function resetTodayPicksScroll(root: HTMLElement): void {
  let el = root.parentElement;
  while (el) {
    const overflow = window.getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') el.scrollTo({ top: 0, behavior: 'instant' });
    el = el.parentElement;
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}
