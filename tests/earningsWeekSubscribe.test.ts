import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { EarningsWeekSubscribe } from '../src/components/earnings/EarningsWeekSubscribe';
import { StoreBadge } from '../src/components/common/StoreBadge';
import type { Loc } from '../src/lib/earningsWeek';

const titles: Record<Loc, string> = {
  ko: '매주 월요일, 이번 주 실적 예상 변동폭을 메일로',
  en: "Get this week's earnings implied moves every Monday",
  ja: '毎週月曜、今週の決算想定変動幅をメールで',
};
for (const locale of ['ko', 'en', 'ja'] as const) {
  const html = renderToStaticMarkup(createElement(EarningsWeekSubscribe, { locale }));
  assert.ok(html.includes(titles[locale].replace("'", '&#x27;')), locale);
  assert.equal((html.match(/href="https:\/\/signumhq\.substack\.com\/"/g) || []).length, 1);
  assert.match(html, /<a href="https:\/\/apps\.apple\.com\/app\/id6783130444" aria-label="[^"]*App Store[^"]*"/);
  assert.match(html, /<a href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.signumhq\.app" aria-label="[^"]*Google Play[^"]*"/);
  assert.doesNotMatch(html, /<input|<form/);
}
const before = execFileSync('git', ['show', 'origin/main:src/remotion/kit/AppPlate.tsx'], { encoding: 'utf8' });
const badgeSource = before.slice(before.indexOf('const INK'), before.indexOf('export interface AppPlateApp'));
const js = ts.transpileModule(badgeSource + '\nexports.StoreBadge = StoreBadge;', { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const old: { StoreBadge?: typeof StoreBadge } = {};
runInNewContext(js, { React, exports: old });
for (const kind of ['ios', 'android'] as const) {
  assert.equal(renderToStaticMarkup(createElement(StoreBadge, { kind })), renderToStaticMarkup(createElement(old.StoreBadge!, { kind })));
}
console.log('3개 언어 구독 블록과 기존 스토어 배지 렌더 통과');
