import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EarningsWeekSubscribe } from '../src/components/earnings/EarningsWeekSubscribe';
import type { Loc } from '../src/lib/earningsWeek';

const copy: Record<Loc, { title: string; subscribe: string; ios: string; android: string }> = {
  ko: { title: '매주 월요일, 이번 주 실적 예상 변동폭을 메일로', subscribe: 'Substack 구독하기', ios: 'App Store에서 앱 받기', android: 'Google Play에서 앱 받기' },
  en: { title: "Get this week's earnings implied moves every Monday", subscribe: 'Subscribe on Substack', ios: 'Get the app on the App Store', android: 'Get the app on Google Play' },
  ja: { title: '毎週月曜、今週の決算想定変動幅をメールで', subscribe: 'Substackを購読', ios: 'App Storeでアプリを入手', android: 'Google Playでアプリを入手' },
};

for (const locale of ['ko', 'en', 'ja'] as const) {
  const html = renderToStaticMarkup(createElement(EarningsWeekSubscribe, { locale }));
  const expected = copy[locale];
  assert.ok(html.includes(expected.title.replace("'", '&#x27;')), locale);
  assert.ok(html.includes(expected.subscribe), locale);

  const links = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) || [];
  for (const [badge, href, label] of [
    ['App Store', 'https://apps.apple.com/app/id6783130444', expected.ios],
    ['Google Play', 'https://play.google.com/store/apps/details?id=com.signumhq.app', expected.android],
  ]) {
    const matching = links.filter((link) => link.includes(`>${badge}</span>`));
    assert.equal(matching.length, 1, `${locale}: ${badge}`);
    assert.ok(matching[0].includes(`href="${href}"`), `${locale}: ${badge} href`);
    assert.ok(matching[0].includes(`aria-label="${label}"`), `${locale}: ${badge} label`);
  }
}
console.log('3개 언어 구독 문구와 스토어 배지 링크 통과');
