/**
 * 웹 지표 잠금 해제 시험 — src/components/gate/FeatureGate.tsx · GuestWall.tsx · 웹 관심종목 안내 문구
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/webGatesOff.test.tsx
 * 지키는 것(2026-09-30, 9/8 법적 전제 «잠기는 지표 없음», 대표 승인 9/30 07:4x):
 *  1) ProGate·EliteGate 로 감싼 내용이 흐림 래퍼·자물쇠·«잠금 해제» 없이 그대로 렌더된다(비로그인·로딩 중에도)
 *     — WEB_METRIC_GATES 를 true 로 켜면 이 시험이 실패한다(음성 대조로 확인)
 *  1-2) 가디언 흐름 지도(인라인 ELITE 게이트)도 같은 스위치를 본다
 *  2) 비로그인 가입 권유 창에 근거 없는 «2,400명» 사회적 증명·«Founding» 가격 권유가 없다
 *  3) 웹 관심종목 안내는 없어진 웹 요금제(PRO 10·ELITE 20)가 아니라 앱 PRO 100 을 말한다
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';

// 라우팅 모듈(next-intl 내비게이션)은 ts-node 에서 풀리지 않는다 → Link 만 가짜로 끼우고 게이트를 불러온다
// eslint-disable-next-line @typescript-eslint/no-var-requires
const routingPath = require.resolve('../src/i18n/routing');
require.cache[routingPath] = { id: routingPath, filename: routingPath, loaded: true, exports: { Link: (p: any) => React.createElement('a', p) } } as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ProGate, EliteGate } = require('../src/components/gate/FeatureGate');

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ko = JSON.parse(read('src/messages/ko.json'));

const wrap = (el: React.ReactElement) =>
  renderToStaticMarkup(<NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">{el}</NextIntlClientProvider>);

t('ProGate·EliteGate — 내용이 그대로(흐림·자물쇠·잠금 해제 없음)', () => {
  const inner = '<span id="dp">DARK POOL 41.2%</span>';
  for (const Gate of [ProGate, EliteGate] as any[]) {
    const html = wrap(<Gate title="x"><span id="dp">DARK POOL 41.2%</span></Gate>);
    assert.equal(html, inner, html.slice(0, 200));
    assert.equal(/data-gate-pending|blur\(|잠금 해제|Unlock/.test(html), false);
  }
});

t('가디언 흐름 지도(인라인 ELITE 게이트)도 같은 스위치를 본다', () => {
  const src = read('src/app/[locale]/intel-guardian/GuardianDesktop.tsx');
  assert.match(src, /const isMapUnlocked = !WEB_METRIC_GATES \|\| hasAccess\('elite'\)/);
  assert.match(src, /import \{[^}]*WEB_METRIC_GATES[^}]*\} from '@\/components\/gate\/FeatureGate'/);
});

t('비로그인 가입 권유 창 — 근거 없는 숫자·파운딩 권유 없음', () => {
  const src = read('src/components/gate/GuestWall.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.equal(src.includes("t('guestWallSocialProof')"), false);
  assert.equal(src.includes("t('foundingBadge')"), false);
  assert.equal(src.includes("t('foundingDesc')"), false);
});

t('웹 관심종목 안내 — 앱 PRO 100', () => {
  for (const l of ['ko', 'en', 'ja']) {
    const g = JSON.parse(read(`src/messages/${l}.json`)).gate;
    for (const k of ['watchlistLimitPro', 'watchlistLimitElite', 'watchlistUpgradePro', 'watchlistUpgradeElite']) {
      assert.ok(/100/.test(g[k]) && /PRO/.test(g[k]), `${l}.${k}=${g[k]}`);
      assert.equal(/ELITE|\{count\}/.test(g[k]), false, `${l}.${k}=${g[k]}`);
    }
  }
});

console.log(`\n✅ webGatesOff: ${n}건 통과`);
