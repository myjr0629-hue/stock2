/**
 * TOP SIGNAL → 뉴스 펄스: locale·id·인코딩·스크롤/테두리 정리·앱 뒤로가기.
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/topSignalNews.test.ts
 * DOM·타이머·history는 메모리 대역만 사용한다(브라우저·네트워크 접근 없음).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { focusNewsArticle, newsArchiveHref, newsFocusKey } from '../src/lib/news/pulseNavigation';
import { _resetInAppHistoryForTest, hasInAppBack, noteInAppPath } from '../src/lib/app/inAppHistory';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok -', name); };
const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('ko/en/ja: 목록으로 바로 push할 locale 경로와 원래 id를 보존한다', () => {
  for (const locale of ['ko', 'en', 'ja']) {
    for (const id of ['fmp-market-news', '한글 / 日本語 + ?x=1&focus=other#%"[data-news-id]']) {
      const item = { id };
      const url = new URL(newsArchiveHref(locale, item), 'https://example.test');
      assert.equal(url.pathname, `/${locale}/app-view/guardian/news`);
      assert.equal(url.searchParams.get('focus'), newsFocusKey(item));
      assert.equal(url.searchParams.size, 1);
      assert.equal(url.hash, '');
    }
  }
});
test('id가 없는 항목은 focus 없이 전체 목록으로 간다', () => {
  for (const item of [{}, { id: '' }, { id: null }]) {
    assert.equal(newsArchiveHref('ko', item), '/ko/app-view/guardian/news');
  }
});

const timers = new Map<number, () => void>();
let nextTimer = 0;
let pop: (() => void) | undefined;
const stack: string[] = [];
const win = {
  location: { pathname: '' },
  history: { length: 1 },
  addEventListener: (name: string, fn: () => void) => { if (name === 'popstate') pop = fn; },
  setTimeout: (fn: () => void, ms: number) => {
    assert.equal(ms, 2500);
    timers.set(++nextTimer, fn);
    return nextTimer;
  },
  clearTimeout: (id: number) => { timers.delete(id); },
};
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', { value: win, configurable: true });

function element(id?: string) {
  const calls: ScrollIntoViewOptions[] = [];
  const dataset: Record<string, string> = id === undefined ? {} : { newsId: id };
  return { dataset, calls, scrollIntoView: (opts: ScrollIntoViewOptions) => { calls.push(opts); } };
}
function fixture() {
  const first = element('first');
  const selected = element('news / 日本語?x=1#"[]');
  const root = Object.assign(element(), {
    querySelectorAll: (selector: string) => {
      assert.equal(selector, '[data-news-id]', 'id를 CSS 선택자로 해석하지 않는다');
      return [first, selected];
    },
  });
  return { first, selected, root, node: root as unknown as HTMLElement };
}

try {
  test('클릭한 id만 즉시 스크롤·테두리 표시, 2.5초 후 해제', () => {
    const { first, selected, root, node } = fixture();
    const clear = focusNewsArticle(node, selected.dataset.newsId);
    assert.deepEqual(selected.calls, [{ behavior: 'instant', block: 'start' }]);
    assert.equal(first.calls.length + root.calls.length, 0);
    assert.equal(selected.dataset.newsFocused, 'true');
    assert.equal(first.dataset.newsFocused, undefined);
    const [id, finish] = [...timers][0];
    timers.delete(id); finish();
    assert.equal(selected.dataset.newsFocused, undefined);
    clear();
    assert.equal(timers.size, 0);
  });
  test('화면 이탈·focus 변경 때 타이머와 강조를 바로 정리한다', () => {
    const { selected, node } = fixture();
    const clear = focusNewsArticle(node, selected.dataset.newsId);
    assert.equal(timers.size, 1);
    clear(); clear();
    assert.equal(timers.size, 0);
    assert.equal(selected.dataset.newsFocused, undefined);
  });
  test('없는 id: 목록 맨 위, 강조·타이머 없음', () => {
    const { first, selected, root, node } = fixture();
    focusNewsArticle(node, 'expired-news')();
    assert.deepEqual(root.calls, [{ behavior: 'instant', block: 'start' }]);
    assert.equal(first.calls.length + selected.calls.length, 0);
    assert.equal(timers.size, 0);
  });
  test('대시 → 목록의 push 기록은 뒤로 한 번에 대시로 돌아온다(3개 locale)', () => {
    for (const locale of ['ko', 'en', 'ja']) {
      _resetInAppHistoryForTest();
      stack.splice(0, stack.length, `/${locale}/app-view/dash`);
      win.location.pathname = stack[0]; win.history.length = 1;
      noteInAppPath('/app-view/dash');
      assert.equal(hasInAppBack(), false);
      stack.push(new URL(newsArchiveHref(locale, { id: 'selected' }), 'https://example.test').pathname);
      win.location.pathname = stack[1]; win.history.length = 2;
      noteInAppPath('/app-view/guardian/news');
      assert.equal(hasInAppBack(), true);
      stack.pop(); win.location.pathname = stack[0]; pop?.();
      noteInAppPath('/app-view/dash');
      assert.equal(win.location.pathname, `/${locale}/app-view/dash`);
      assert.equal(hasInAppBack(), false);
    }
  });
} finally {
  if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
  else Reflect.deleteProperty(globalThis, 'window');
}

test('띠 클릭·키보드 모두 현재 뉴스로 push · 기존 레이아웃 햅틱 한 번', () => {
  const dash = read('src/app/[locale]/app-view/dash/page.tsx');
  const signal = dash.slice(dash.indexOf('{topNews && ('), dash.indexOf('{/* ② 마켓 스테이터스 */}'));
  assert.match(signal, /onClick=\{\(\) => router\.push\(newsArchiveHref\(locale, topNews\)\)\}/);
  assert.match(signal, /e\.key === 'Enter' \|\| e\.key === ' '/);
  assert.match(signal, /e\.preventDefault\(\); e\.currentTarget\.click\(\)/);
  assert.match(signal, /role="button"/);
  assert.match(signal, />TOP SIGNAL<\/span>/);
  assert.doesNotMatch(signal, /hapticImpact|router\.replace|guardian\?tab=/);
  const layout = read('src/app/[locale]/app-view/layout.tsx');
  assert.match(layout, /closest\('button, a, \[role="button"\]/);
  assert.match(layout, /ImpactStyle\.Light/);
  assert.match(layout, /if \(!isNative\) return/);
});
test('목록은 로딩 이후 한 번 focus · query/이탈 정리 · 기존 뒤로 정책 유지', () => {
  const page = read('src/app/[locale]/app-view/guardian/news/page.tsx');
  assert.match(page, /useSearchParams\(\)\.get\('focus'\)/);
  assert.match(page, /data-news-id=\{newsFocusKey\(it\)\}/);
  assert.match(page, /if \(!focus \|\| isLoading \|\| focusRequest\.current\.done/);
  assert.match(page, /requestAnimationFrame/);
  assert.match(page, /cancelAnimationFrame\(frame\); clearFocus\?\.\(\)/);
  assert.match(page, /if \(hasInAppBack\(\)\) router\.back\(\)/);
  assert.match(page, /else router\.replace\(`\/\$\{loc\}\/app-view\/guardian\?tab=reality`\)/);
  const css = read('src/app/[locale]/app-view/guardian/news/news.module.css');
  const rule = css.match(/\.item\[data-news-focused='true'\] \{([^}]+)\}/)![1];
  assert.match(rule, /outline: 1px solid rgba\(34, 211, 238, 0\.30\)/);
  assert.doesNotMatch(rule, /background|animation|transform/);
});

console.log(`\n${passed} passed`);
