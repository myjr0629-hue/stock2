/**
 * 옵션 프리미엄 «이름 = 값» 시험 — src/lib/premiumFlow.ts + 앱뷰 화면 소스 회귀 검사
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/premiumFlow.test.ts
 *
 * 픽스처 = 운영 /api/live/ticker?t=…&chain=0 의 flow 블록(2026-10-04 실측, 주간 만기 2026-10-09 · 체인 10/2 EOD)
 *   TSLA: 콜 76,605,763 − 풋 31,677,838 = 순 44,927,925(화면 «TOTAL PREMIUM $44.9M») · 합계 108,283,601
 *   AMZN: 콜 17,159,212 − 풋 3,790,188 = 순 13,369,024 · 합계 20,949,400 (MISTAKES #62 의 실측 종목)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { premiumLabel, totalPremiumOf, fmtPremiumM, NET_PREMIUM_LABEL } from '../src/lib/premiumFlow';

let pass = 0;
const t = (name: string, fn: () => void) => { fn(); pass++; console.log('  ✓', name); };

const TSLA = { netPremium: 44927925.49362909, callPremium: 76605763.06814104, putPremium: 31677837.574511953, totalPremium: 108283600.64265299, dataSource: 'LIVE' };
const AMZN = { netPremium: 13369023.645667173, callPremium: 17159211.659792252, putPremium: 3790188.014125079, totalPremium: 20949399.67391733, dataSource: 'LIVE' };

t('합계 = API totalPremium(콜 + 풋) 그대로 — TSLA $108.3M, AMZN $20.9M', () => {
  assert.equal(totalPremiumOf(TSLA), TSLA.totalPremium);
  assert.equal(fmtPremiumM(totalPremiumOf(TSLA)), '$108.3M');
  assert.equal(fmtPremiumM(totalPremiumOf(AMZN)), '$20.9M');
});

t('순(콜 − 풋)은 합계와 다른 숫자다 — 예전 카드가 그리던 |순| $44.9M 이 합계로 나오지 않는다', () => {
  assert.equal(fmtPremiumM(Math.abs(TSLA.netPremium)), '$44.9M');
  assert.notEqual(fmtPremiumM(totalPremiumOf(TSLA)), fmtPremiumM(Math.abs(TSLA.netPremium)));
  assert.ok(Math.abs(TSLA.callPremium - TSLA.putPremium - TSLA.netPremium) < 1);
});

t('값이 없거나 0 이면 «—»(지어내지 않는다)', () => {
  assert.equal(totalPremiumOf(undefined), null);
  assert.equal(totalPremiumOf({}), null);
  assert.equal(totalPremiumOf({ totalPremium: 0, netPremium: 0, callPremium: 0, putPremium: 0 }), null);
  assert.equal(totalPremiumOf({ totalPremium: null }), null);
  assert.equal(totalPremiumOf({ totalPremium: 'abc' }), null);
  assert.equal(fmtPremiumM(null), '—');
});

t('같은 응답의 콜·풋·순과 어긋나면 «—» — 맞지 않는 합계는 그리지 않는다', () => {
  assert.equal(totalPremiumOf({ ...TSLA, totalPremium: TSLA.netPremium }), null);           // 합계 자리에 순 금액
  assert.equal(totalPremiumOf({ totalPremium: 10e6, netPremium: -12e6 }), null);            // |순| > 합계
  assert.equal(totalPremiumOf({ totalPremium: 10e6, callPremium: null, putPremium: null }), 10e6); // 다리 값 없음 = 검사 생략
});

t('이름표: 순 = 순 프리미엄 / Net Premium / ネットプレミアム, 모르는 로캘은 영어', () => {
  assert.equal(premiumLabel('net', 'ko'), '순 프리미엄');
  assert.equal(premiumLabel('net', 'en'), 'Net Premium');
  assert.equal(premiumLabel('net', 'ja'), 'ネットプレミアム');
  assert.equal(premiumLabel('net', 'de'), 'Net Premium');
  assert.equal(premiumLabel('total', 'ko'), '총 프리미엄');
});

t('칸 폭: 새 이름표는 이미 두 줄로 접히던 «TOTAL PREMIUM»(13자)보다 길지 않다', () => {
  for (const v of Object.values(NET_PREMIUM_LABEL)) assert.ok(v.length <= 'TOTAL PREMIUM'.length, v);
});

// 화면 소스 회귀 — 순 금액에 «TOTAL/총» 이름이 다시 붙지 않게
const root = path.resolve(__dirname, '..');
const stripComments = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const flowSrc = fs.readFileSync(path.join(root, 'src/app/[locale]/app-view/flow/page.tsx'), 'utf8');
const cmdSrc = fs.readFileSync(path.join(root, 'src/app/[locale]/app-view/cmd/page.tsx'), 'utf8');

t('앱뷰 Flow·Command 히어로에 «TOTAL PREMIUM» 이름표가 없다', () => {
  assert.ok(!/TOTAL PREMIUM/.test(stripComments(flowSrc)), 'flow page');
  assert.ok(!/TOTAL PREMIUM/.test(stripComments(cmdSrc)), 'cmd page');
  assert.ok(/premiumLabel\('net', locale\)/.test(flowSrc) && /premiumLabel\('net', locale\)/.test(cmdSrc));
});

t('Flow 화면: «총 프리미엄» 제목 옆 값은 합계(totalPremiumOf), |순|(absNetPrem)은 «총» 이름과 같은 줄에 없다', () => {
  const code = stripComments(flowSrc);
  const i = code.indexOf('{flowCopy.totalPremium}</span>');
  assert.ok(i > 0, 'card title');
  assert.ok(/totalPremiumOf\(tickerData\?\.flow\)/.test(code.slice(i, i + 400)), 'card value = total');
  for (const line of code.split('\n')) {
    if (/flowCopy\.totalPremium|premiumLabel\('total'/.test(line)) assert.ok(!/absNetPrem|netPremium(Val|Overview|Text)\b/.test(line), line.trim().slice(0, 120));
  }
});

console.log(`premiumFlow: ${pass} passed`);
