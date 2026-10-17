/** 카드 → 전체보기. 같은 티커의 다른 종류도 구별하도록 항목 id를 보존한다. */
export function todayPicksHref(locale: string, id: string): string {
  return `/${locale}/app-view/today?${new URLSearchParams({ focus: id })}`;
}

/** 뉴스 펄스와 같은 즉시 스크롤 + 2.5초 테두리. 외부 id는 CSS 선택자로 해석하지 않는다. */
export function focusTodayPick(root: HTMLElement, id: string): () => void {
  const item = Array.from(root.querySelectorAll<HTMLElement>('[data-pick-id]'))
    .find((el) => el.dataset.pickId === id);
  if (!item) return () => {};
  item.scrollIntoView({ behavior: 'instant', block: 'start' });
  item.dataset.pickFocused = 'true';
  const clear = () => { delete item.dataset.pickFocused; };
  const timer = window.setTimeout(clear, 2500);
  return () => { window.clearTimeout(timer); clear(); };
}
