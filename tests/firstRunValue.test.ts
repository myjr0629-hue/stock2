/**
 * 첫 실행 «가치 먼저» 시험 — src/lib/app/firstRunValue.ts · firstRunCopy.ts · app/api/app/onboarding-config · AppFirstRunOnboarding(소스 대조)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/firstRunValue.test.ts
 *
 * 지키는 것
 *  ① 단계 흐름(v2·legacy·웹/네이티브) · 끄기 스위치(레디스 onb2:off · 환경변수) · 설정 응답 해석 — 못 읽으면 옛 흐름
 *  ② 고르기(최대 3 · 중복·빼기·잘못된 티커) · 내 종목에 담기(토스트 없이 저장소에 직접 · 이미 있으면 건너뜀 · 저장 실패 표시)
 *  ③ 카드 = 내 종목 목록 행과 같은 판정(자리표를 지금 가격으로 · 지형이 바뀌면 그리지 않고 stale · 지도가 안 서면 AI 줄 없음)
 *  ④ 실적 임박(14일 · ET 날짜 + 발표 시각) · 옵션 반영 변동폭 · 글자 모양이 앱 실적 화면·내 종목 칩과 같음
 *  ⑤ 글: 금지어 0 · 금융 공통어 번역 안 함 · 3개 언어 완비 · 알림 안내문 = 옛 2/2 단계의 글 그대로 · 법적 고지 글 불변
 *  ⑥ 계측: 닫힌 목록에 새 단계·출처 · 소스가 보내는 모든 (단계, 출처) 쌍이 닫힌 목록 안 · 식별자·종목 없음
 *  ⑦ 기존 사용자(첫 안내 마침)에게는 다시 뜨지 않는다 — 저장 키·판정이 그대로
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// ── 레디스(메모리) 바꿔 끼우기 — 라우트 import 보다 먼저 ──
const store = new Map<string, unknown>();
let redisMode: 'ok' | 'slow' | 'throw' = 'ok';
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
  id: rcPath, filename: rcPath, loaded: true,
  exports: {
    getFromCache: async (k: string) => {
      if (redisMode === 'throw') throw new Error('redis down');
      if (redisMode === 'slow') return new Promise(() => { /* 영영 안 옴 */ });
      return store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null;
    },
  },
} as unknown as Module;

import {
  ONB2_OFF_KEY, ONB_EARNINGS_WINDOW_DAYS, ONB_NUMBERED_STEPS, ONB_PICK_MAX, ONB_POPULAR, buildValueCard, commitPicks, earningsText, imminentEarnings,
  impliedBasisLine, impliedPctLabel, onb2Enabled, onbStepNo, parseOnbConfig, permSrc, pickSrc, stepAfterLegal, stepAfterValue,
  stepSrc, togglePick, isNativeShell,
} from '../src/lib/app/firstRunValue';
import { firstRunCopy } from '../src/lib/app/firstRunCopy';
import { FUNNEL_SRCS, FUNNEL_STAGES, isFunnelSrc, isFunnelStage, funnelKeys } from '../src/lib/app/funnelSchema';
import { createWatchlistStore, FREE_LIMIT, type StorageLike } from '../src/lib/app/watchlist';
import { ONBOARDING_DONE_KEY } from '../src/lib/gift/giftAnnounce';
import type { AiLineEntry } from '../src/lib/app/watchlistAiLine';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

class MemStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

(async () => {
  console.log('첫 실행 «가치 먼저»');

  // ── ① 단계 흐름 ──
  t('번호가 붙는 단계는 둘(법적 고지 1/2 · 가치 2/2) — 알림은 번호 없이 «선택 · 알림»(법적 고지의 «1 / 2» 글자를 건드리지 않는다)', () => {
    assert.equal(ONB_NUMBERED_STEPS, 2);
    assert.equal(firstRunCopy('ko').value.stepLabel(2, ONB_NUMBERED_STEPS), '2 / 2 · 내 종목');
    assert.equal(firstRunCopy('en').value.stepLabel(2, ONB_NUMBERED_STEPS), '2 / 2 · My stocks');
    assert.equal(firstRunCopy('ja').value.stepLabel(2, ONB_NUMBERED_STEPS), '2 / 2 · マイ銘柄');
    assert.deepEqual((['ko', 'en', 'ja'] as const).map((l) => firstRunCopy(l).notif.stepLabel()), ['선택 · 알림', 'Optional · Notifications', '任意 · 通知']);
  });
  t('단계 번호·다음 단계', () => {
    assert.deepEqual(['legal', 'value', 'notif', 'alert'].map((s) => onbStepNo(s as never)), [1, 2, 3, 2]);
    assert.equal(stepAfterLegal('v2'), 'value');
    assert.equal(stepAfterLegal('legacy'), 'alert');
    assert.equal(stepAfterValue(true), 'notif');
    assert.equal(stepAfterValue(false), 'done');
  });
  t('단계 → 계측 출처: 법적 고지는 두 흐름 공통 · 옛 2/2 는 따로', () => {
    assert.equal(stepSrc('legal', 'v2'), 'onb_legal');
    assert.equal(stepSrc('legal', 'legacy'), 'onb_legal');
    assert.equal(stepSrc('value', 'v2'), 'onb_value');
    assert.equal(stepSrc('notif', 'v2'), 'onb_notif');
    assert.equal(stepSrc('alert', 'legacy'), 'onb_oldalert');
  });
  t('웹·시험 환경은 네이티브가 아니다 / Capacitor 전역이 있으면 네이티브', () => {
    assert.equal(isNativeShell(), false);
    (globalThis as any).Capacitor = { isNativePlatform: () => true };
    assert.equal(isNativeShell(), true);
    (globalThis as any).Capacitor = { isNativePlatform: () => { throw new Error('x'); } };
    assert.equal(isNativeShell(), false);
    delete (globalThis as any).Capacitor;
  });

  // ── ② 끄기 스위치 ──
  t('onb2Enabled: 키가 없거나 거짓 같은 값이면 켜짐 · 아무 값이나 있으면 꺼짐 · 환경변수 1 도 꺼짐', () => {
    assert.equal(onb2Enabled({ redis: null }), true);
    assert.equal(onb2Enabled({ redis: '' }), true);
    assert.equal(onb2Enabled({ redis: '0' }), true);
    assert.equal(onb2Enabled({ redis: 'false' }), true);
    assert.equal(onb2Enabled({ redis: 1 }), false);
    assert.equal(onb2Enabled({ redis: '1' }), false);
    assert.equal(onb2Enabled({ redis: 'off' }), false);
    assert.equal(onb2Enabled({ redis: { a: 1 } }), false);
    assert.equal(onb2Enabled({ env: '1', redis: null }), false);
    assert.equal(onb2Enabled({ env: '0', redis: null }), true);
    assert.equal(ONB2_OFF_KEY, 'onb2:off');
  });
  t('parseOnbConfig: 모르는 응답은 null(호출자가 옛 흐름)', () => {
    assert.equal(parseOnbConfig({ v2: true }), 'v2');
    assert.equal(parseOnbConfig({ v2: false, reason: 'switch' }), 'legacy');
    for (const bad of [null, undefined, 'x', 1, {}, { v2: 'true' }, { v2: 1 }, []]) assert.equal(parseOnbConfig(bad), null);
  });

  t('서버 라우트는 React·내 종목 저장소를 가져오지 않는다(RSC 경계 — 클라이언트 훅을 서버 라우트가 import 하면 빌드가 멈춘다, 10/12 로컬 실측)', () => {
    const route = read('src/app/api/app/onboarding-config/route.ts');
    const imports = [...route.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    assert.deepEqual(imports.sort(), ['@/lib/app/onboardingConfig', '@/services/redisClient', 'next/server']);
    assert.ok(!/^import (?!type )/m.test(read('src/lib/app/onboardingConfig.ts')), 'onboardingConfig 는 타입 말고는 아무것도 가져오지 않는다');
  });
  const { GET } = await import('../src/app/api/app/onboarding-config/route');
  const call = async () => { const r = await GET(); return { j: await r.json(), cc: r.headers.get('cache-control') || '' }; };
  await ta('설정 라우트: 키 없음 → v2:true · CDN 15초', async () => {
    store.clear(); redisMode = 'ok'; delete process.env.ONB2_OFF;
    const { j, cc } = await call();
    assert.deepEqual(j, { v2: true });
    assert.ok(/s-maxage=15/.test(cc));
  });
  await ta('설정 라우트: onb2:off 에 값이 있으면 v2:false(재배포 없이) · 지우면 다시 true', async () => {
    store.set('onb2:off', 1);
    const a = await call();
    assert.equal(a.j.v2, false); assert.equal(a.j.reason, 'switch');
    store.delete('onb2:off');
    assert.equal((await call()).j.v2, true);
  });
  await ta('설정 라우트: 환경변수 ONB2_OFF=1 → 꺼짐 · 레디스를 읽지도 않는다', async () => {
    process.env.ONB2_OFF = '1'; redisMode = 'throw';
    const { j } = await call();
    assert.equal(j.v2, false); assert.equal(j.reason, 'env');
    delete process.env.ONB2_OFF; redisMode = 'ok';
  });
  await ta('설정 라우트: 레디스 오류·1.5초 초과 → v2:false(모르면 옛 흐름) + 캐시하지 않는다', async () => {
    redisMode = 'throw';
    const e = await call();
    assert.equal(e.j.v2, false); assert.equal(e.j.reason, 'error'); assert.equal(e.cc, 'no-store');
    redisMode = 'slow';
    const t0 = Date.now();
    const s = await call();
    assert.equal(s.j.v2, false); assert.equal(s.j.reason, 'slow'); assert.equal(s.cc, 'no-store');
    assert.ok(Date.now() - t0 < 2500, '1.5초 안에 답한다');
    redisMode = 'ok';
  });

  // ── ③ 고르기·담기 ──
  t('togglePick: 담기·빼기·최대 3·대소문자·잘못된 티커', () => {
    let p: string[] = [];
    let r = togglePick(p, 'nvda'); assert.deepEqual(r, { picks: ['NVDA'], change: 'added' }); p = r.picks;
    r = togglePick(p, 'TSLA'); p = r.picks;
    r = togglePick(p, 'AAPL'); p = r.picks;
    assert.deepEqual(p, ['NVDA', 'TSLA', 'AAPL']);
    r = togglePick(p, 'MSFT'); assert.equal(r.change, 'full'); assert.deepEqual(r.picks, p);
    r = togglePick(p, 'tsla'); assert.equal(r.change, 'removed'); assert.deepEqual(r.picks, ['NVDA', 'AAPL']);
    assert.equal(togglePick(p, '').change, 'invalid');
    assert.equal(togglePick(p, '$$$').change, 'invalid');
    assert.equal(ONB_PICK_MAX, 3);
  });
  t('pickSrc: 1·2·3 → onb_n1·n2·n3, 0 은 null', () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(pickSrc), [null, 'onb_n1', 'onb_n2', 'onb_n3', 'onb_n3']);
  });
  t('commitPicks: 저장소에 직접 담는다 — 이미 있는 종목은 건너뛰고 src=onb', () => {
    const mem = new MemStorage();
    const wl = createWatchlistStore({ storage: () => mem, now: () => 1 });
    wl.add('AAPL', 'cmd', FREE_LIMIT);
    const r = commitPicks(wl, ['NVDA', 'AAPL', 'TSLA'], FREE_LIMIT);
    assert.deepEqual(r.added, ['NVDA', 'TSLA']); assert.deepEqual(r.skipped, ['AAPL']); assert.equal(r.unsaved, false);
    assert.deepEqual(wl.tickers(), ['AAPL', 'NVDA', 'TSLA']);
    const stored = JSON.parse(mem.getItem('sg-watchlist-v1')!);
    assert.equal(stored.items.find((i: any) => i.t === 'NVDA').src, 'onb');
  });
  t('commitPicks: 한도에 걸리면 못 담은 종목은 skipped · 저장소가 막혀 있으면 unsaved 로 알린다', () => {
    const wl = createWatchlistStore({ storage: () => new MemStorage(), now: () => 1 });
    for (const x of ['A', 'B', 'C', 'D']) wl.add(x, 'x', FREE_LIMIT);
    const r = commitPicks(wl, ['NVDA', 'TSLA'], FREE_LIMIT);
    assert.deepEqual(r.added, ['NVDA']); assert.deepEqual(r.skipped, ['TSLA']);
    const blocked = createWatchlistStore({ storage: () => { throw new Error('SecurityError'); }, now: () => 1 });
    assert.equal(commitPicks(blocked, ['NVDA'], FREE_LIMIT).unsaved, true);
  });
  t('인기 칩 12개: 예열 대상 100종목 안(AI 한 줄이 저장돼 있다) · 중복 없음 · QQQ 제외(체인 날짜 없음)', () => {
    const src = read('src/lib/ai/creditPacing.ts');
    const block = src.slice(src.indexOf('export const PREWARM_TICKERS'));
    for (const tk of ONB_POPULAR) assert.ok(new RegExp(`'${tk}'`).test(block), `${tk} 가 PREWARM_TICKERS 에 없다`);
    assert.equal(new Set(ONB_POPULAR).size, ONB_POPULAR.length);
    assert.equal(ONB_POPULAR.length, 12);
    assert.ok(!ONB_POPULAR.includes('QQQ'));
  });

  // ── ④ 카드 ──
  const NOW = Date.UTC(2026, 9, 12, 15, 0, 0);   // 2026-10-12(월) 11:00 ET — 정규장 전, 직전 마감 10/9
  const rtNvda = {
    price: 229.7, changePct: 1.2, session: 'closed', ext: false, receivedAt: NOW,
    maxPain: 215, callWall: 250, putFloor: 220, gammaFlipLevel: 220,
    levelsChainDate: '2026-10-09', levelsSource: 'structure', hasLevelsMeta: true, levelsDropped: null, levelsRefPrice: 229.7,
  };
  const aiNvda: AiLineEntry = {
    text: 'Max Pain $215 위 {MP} · Call Wall $250까지 {CW} · 양(+) 감마 구간', chain: '2026-10-09',
    lv: { mp: 215, cw: 250, pf: 220, gf: 220 }, sides: { mp: 'a', cw: 'b', pf: 'a', gf: 'a' }, at: NOW,
  };
  t('buildValueCard: 자리표를 «지금 가격»으로 채운다(운영 NVDA 실물 줄과 같은 글자)', () => {
    const c = buildValueCard('NVDA', rtNvda, aiNvda, 'ko', NOW);
    assert.equal(c.levels.ok, true);
    assert.equal(c.aiText, 'Max Pain $215 위 6.4% · Call Wall $250까지 8.8% · 양(+) 감마 구간');
    assert.equal(c.aiStale, false);
    assert.equal(c.price, 229.7); assert.equal(c.changePct, 1.2);
    assert.match(c.basisShort, /10\/9/);
  });
  t('buildValueCard: 가격이 레벨을 건너 지형이 바뀌면 그리지 않고 stale(서버에 다시 써 달라고 알린다)', () => {
    // 풋 플로어 200 · 감마 플립 205 · 맥스 페인 215 · 콜 월 250 — 가격 229.7(맥스 페인 위)에서 쓴 글이 212(맥스 페인 아래)에서는 맞지 않는다
    const lv = { putFloor: 200, gammaFlipLevel: 205 };
    const ai: AiLineEntry = { ...aiNvda, lv: { mp: 215, cw: 250, pf: 200, gf: 205 }, sides: { mp: 'a', cw: 'b', pf: 'a', gf: 'a' } };
    const ok = buildValueCard('NVDA', { ...rtNvda, ...lv }, ai, 'ko', NOW);
    assert.equal(ok.aiStale, false); assert.ok(ok.aiText);
    const c = buildValueCard('NVDA', { ...rtNvda, ...lv, price: 212, levelsRefPrice: 212 }, ai, 'ko', NOW);
    assert.equal(c.levels.ok, true);
    assert.equal(c.aiText, null);
    assert.equal(c.aiStale, true);
    // 체인 날짜가 바뀐 글도 stale
    assert.equal(buildValueCard('NVDA', { ...rtNvda, levelsChainDate: '2026-10-08' }, aiNvda, 'ko', NOW).aiStale, true);
  });
  t('buildValueCard: AI 글이 없으면 줄이 없다 · 지도가 안 서면(가격 없음·메타 없음) AI 줄도 없다 · 값을 지어내지 않는다', () => {
    assert.equal(buildValueCard('NVDA', rtNvda, null, 'ko', NOW).aiText, null);
    const noPrice = buildValueCard('NVDA', { ...rtNvda, price: null }, aiNvda, 'ko', NOW);
    assert.equal(noPrice.levels.ok, false); assert.equal(noPrice.aiText, null); assert.equal(noPrice.price, null);
    const empty = buildValueCard('ZZZZ', undefined, null, 'en', NOW);
    assert.equal(empty.levels.ok, false); assert.equal(empty.price, null); assert.equal(empty.changePct, null); assert.equal(empty.aiText, null);
    const noMeta = buildValueCard('NVDA', { ...rtNvda, hasLevelsMeta: false, levelsSource: undefined } as any, aiNvda, 'ko', NOW);
    assert.equal(noMeta.levels.ok, false); assert.equal(noMeta.aiText, null);
  });
  t('buildValueCard: 같은 입력이면 내 종목 목록(fillAiLine)과 같은 글자 — 3개 언어', () => {
    const en: AiLineEntry = { ...aiNvda, text: '{MP} above Max Pain $215 · {CW} below Call Wall $250 · positive gamma zone' };
    assert.equal(buildValueCard('NVDA', rtNvda, en, 'en', NOW).aiText, '6.4% above Max Pain $215 · 8.8% below Call Wall $250 · positive gamma zone');
    const ja: AiLineEntry = { ...aiNvda, text: 'Max Pain $215の{MP}上 · Call Wall $250まで{CW} · 正ガンマ圏' };
    assert.equal(buildValueCard('NVDA', rtNvda, ja, 'ja', NOW).aiText, 'Max Pain $215の6.4%上 · Call Wall $250まで8.8% · 正ガンマ圏');
  });

  // ── ⑤ 실적 임박 ──
  const rows = [
    { ticker: 'NFLX', date: '2026-10-20', hour: 'amc', implied: { pct: 8.5, expiry: '2026-10-23', basis: 'eod', session: '2026-10-09' } },
    { ticker: 'TSLA', date: '2026-10-21', hour: 'amc', implied: { pct: 7.5, expiry: '2026-10-23', basis: 'eod', session: '2026-10-09' } },
    { ticker: 'TSLA', date: '2027-02-03', hour: '', implied: null },
    { ticker: 'AAPL', date: '2026-11-02', hour: 'amc', implied: null },           // 21일 뒤 — 임박 아님
    { ticker: 'C', date: '2026-10-13', hour: 'bmo', implied: null },             // 내일 · 변동폭 값 없음
    { ticker: 'JPM', date: '2026-10-12', hour: 'bmo', implied: { pct: 3, expiry: '2026-10-16', basis: 'eod', session: '2026-10-09' } },   // 오늘 장 시작 전 — 11:00 ET 라 이미 지났다
    { ticker: 'KO', date: '2026-10-14', hour: 'bmo', implied: { pct: -1, expiry: '2026-10-16', basis: 'eod', session: null } },   // 값이 이상하다
  ];
  t('imminentEarnings: 14일 안 · 옵션 반영 변동폭은 행의 값 그대로', () => {
    const e = imminentEarnings(rows, 'NFLX', NOW)!;
    assert.equal(e.date, '2026-10-20'); assert.equal(e.hour, 'amc'); assert.equal(e.days, 8);
    assert.deepEqual(e.implied, { pct: 8.5, expiry: '2026-10-23', session: '2026-10-09' });
    assert.equal(imminentEarnings(rows, 'tsla', NOW)!.days, 9);
    assert.equal(ONB_EARNINGS_WINDOW_DAYS, 14);
  });
  t('imminentEarnings: 먼 실적(21일)·없는 종목·지난 실적·빈 입력은 null · 값이 없거나 이상하면 implied 만 null', () => {
    assert.equal(imminentEarnings(rows, 'AAPL', NOW), null);
    assert.equal(imminentEarnings(rows, 'NVDA', NOW), null);
    assert.equal(imminentEarnings(rows, 'JPM', NOW), null);
    assert.equal(imminentEarnings(null, 'NFLX', NOW), null);
    assert.equal(imminentEarnings([], 'NFLX', NOW), null);
    const c = imminentEarnings(rows, 'C', NOW)!;
    assert.equal(c.days, 1); assert.equal(c.implied, null);
    assert.equal(imminentEarnings(rows, 'KO', NOW)!.implied, null);
  });
  t('실적 글: 내 종목 실적 칩과 같은 말(D-n · M/D 시각) + 앱 실적 화면의 변동폭 글', () => {
    const e = imminentEarnings(rows, 'NFLX', NOW)!;
    assert.equal(earningsText(e, 'ko'), '실적 D-8 · 10/20 장 마감 후');
    assert.equal(earningsText(e, 'en'), 'Earnings D-8 · 10/20 after close');
    assert.equal(earningsText(e, 'ja'), '決算 D-8 · 10/20 引け後');
    assert.equal(earningsText({ date: '2026-10-13', hour: 'bmo', days: 1 }, 'ko'), '실적 D-1 · 10/13 장 시작 전');
    assert.equal(earningsText({ date: '2026-10-12', hour: '', days: 0 }, 'ko'), '실적 오늘 · 10/12');
    assert.equal(impliedPctLabel(8.5), '±8.5%');
    assert.equal(impliedBasisLine(e.implied!, 'ko'), '10/23 만기 · 10/9 세션');
    assert.equal(impliedBasisLine(e.implied!, 'ja'), '10/23満期 · 10/9セッション');
    assert.equal(impliedBasisLine(e.implied!, 'en'), '10/23 expiry · 10/9 session');
    // 앱 실적 화면(earningsImplied.impliedBasisText)과 같은 글자
    const { impliedBasisText, IMPLIED_LABEL } = require('../src/lib/earnings/earningsImplied');
    for (const loc of ['ko', 'en', 'ja'] as const) {
      assert.equal(impliedBasisLine(e.implied!, loc), impliedBasisText({ pct: 8.5, expiry: '2026-10-23', basis: 'eod', session: '2026-10-09' }, loc));
      assert.ok(IMPLIED_LABEL[loc]);
    }
  });

  // ── ⑥ 글 ──
  const FORBIDDEN = /매수|매도|추천|목표가|예측|전망|수익|보장|\bbuy\b|\bsell\b|recommend|forecast|\bwill\b|should|guarantee|買い|売り|推奨|予測|見通し|予想|利益/i;
  const allStrings = (loc: 'ko' | 'en' | 'ja'): string[] => {
    const c = firstRunCopy(loc);
    const out: string[] = [];
    const walk = (o: any) => {
      if (typeof o === 'string') out.push(o);
      else if (typeof o === 'function') { try { out.push(String(o(2, 3)), String(o('NVDA', 3))); } catch { /* 인자 모양이 다른 함수 */ } }
      else if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') Object.values(o).forEach(walk);
    };
    walk(c);
    return out;
  };
  t('새 단계의 글: 3개 언어 모두 있다 · 투자 권유·예측·수익 약속 문구 없음', () => {
    for (const loc of ['ko', 'en', 'ja'] as const) {
      const strs = allStrings(loc);
      assert.ok(strs.length > 25, `${loc} 문구 수`);
      for (const s of strs) {
        assert.ok(s.trim().length > 0, `${loc} 빈 문구`);
        // 알림 안내문은 옛 2/2 단계의 글 그대로 — «투자 추천이나 매매 신호가 아니며» 같은 부정문을 담고 있다(따로 검사)
        if (s === firstRunCopy(loc).notif.notice) continue;
        assert.ok(!FORBIDDEN.test(s), `${loc} 금지어: ${s}`);
      }
    }
    for (const loc of ['ko', 'en', 'ja'] as const) {
      const keys = (o: any): string[] => Object.keys(o).sort();
      assert.deepEqual(keys(firstRunCopy(loc).value), keys(firstRunCopy('ko').value));
      assert.deepEqual(keys(firstRunCopy(loc).notif), keys(firstRunCopy('ko').notif));
    }
  });
  t('금융 공통어(Put Floor · Max Pain · Call Wall)는 한·일 화면에서도 번역하지 않는다', () => {
    for (const loc of ['ko', 'en', 'ja'] as const) {
      const e = firstRunCopy(loc).value.empty;
      assert.ok(/Put Floor/.test(e) && /Max Pain/.test(e) && /Call Wall/.test(e), `${loc}: ${e}`);
    }
    const strs = [...allStrings('ko'), ...allStrings('ja')].join('\n');
    for (const bad of ['풋 플로어', '콜 월', '맥스 페인', '맥스페인', 'プットフロア', 'コールウォール', 'マックスペイン', '감마 노출', 'ガンマエクスポージャー']) assert.ok(!strs.includes(bad), `번역된 용어: ${bad}`);
  });
  const onbSrc = read('src/components/app/AppFirstRunOnboarding.tsx');
  t('알림 단계 안내문 = 옛 2/2 알림 단계의 안내문(alertBody) 글자 그대로 · 설명 두 줄도 옛 알림 알약의 글', () => {
    for (const loc of ['ko', 'en', 'ja'] as const) {
      const c = firstRunCopy(loc).notif;
      assert.ok(onbSrc.includes(`'${c.notice}'`) || onbSrc.includes(`"${c.notice}"`), `${loc}: alertBody 와 다르다`);
      for (const r of c.rows) assert.ok(onbSrc.includes(r.text), `${loc}: 옛 알림 알약에 없는 설명 «${r.text}»`);
      assert.ok(onbSrc.includes(c.subtitle), `${loc}: alertSubtitle 과 다르다`);
    }
  });
  t('법적 고지 단계의 글은 한 글자도 바뀌지 않았다(제목·본문·네 줄·동의 문장·링크 이름)', () => {
    const must = [
      // ko
      '금융 데이터 고지', 'SIGNUM HQ는 교육과 리서치를 위한 시장 데이터 앱입니다.',
      '지표, AI 요약, 알림은 투자 조언이나 매수/매도 권유가 아닙니다. 정확성, 수익, 손실 회피를 보장하지 않으며 모든 투자 판단과 책임은 사용자에게 있습니다.',
      '1 / 2 · 필수 고지', '투자 조언 또는 매수/매도 권유가 아닙니다.', '교육, 리서치, 시장 데이터 참고용입니다.', '정확성, 수익, 손실 회피를 보장하지 않습니다.',
      '광고 시청은 데이터 접근 권한만 해제하며 수익 가능성을 의미하지 않습니다.', 'SIGNUM HQ 앱 약관과 금융 고지를 읽고 동의합니다.', '앱 약관', '앱 개인정보 처리방침',
      // en
      'Financial Data Notice', 'SIGNUM HQ is a market data app for education and research.',
      'Indicators, AI summaries, and notifications in this app are not investment advice or buy/sell recommendations. Accuracy, returns, and loss avoidance are not guaranteed. All investment decisions remain your responsibility.',
      '1 / 2 · Required notice', 'Not investment advice or a buy/sell recommendation.', 'For education, research, and market-data reference only.',
      'Accuracy, returns, and loss avoidance are not guaranteed.', 'Watching ads unlocks data access only; it does not imply profit potential.',
      'I confirm that I have read and agree to the SIGNUM HQ app terms and financial disclaimer.', 'App Terms', 'App Privacy Policy',
      // ja
      '金融データに関する注意', 'SIGNUM HQは教育とリサーチのための市場データアプリです。',
      '指標、AI要約、通知は投資助言または売買推奨ではありません。正確性、収益、損失回避は保証されず、すべての投資判断と責任は利用者本人にあります。',
      '1 / 2 · 必須確認', '投資助言または売買推奨ではありません。', '教育、リサーチ、市場データの参照用です。', '正確性、収益、損失回避を保証しません。',
      '広告視聴はデータアクセスを解除するだけで、利益可能性を示すものではありません。', 'SIGNUM HQアプリ利用規約および金融データに関する注意を読み、同意します。', 'アプリ利用規約', 'アプリプライバシーポリシー',
    ];
    for (const m of must) assert.ok(onbSrc.includes(m), `법적 고지 글이 바뀌었다: ${m}`);
    // 단계 표시 «1 / 2 · 필수 고지»도 그대로 그린다(분모를 흐름에 따라 바꾸지 않는다 — 시키지 않은 라벨 변경 금지)
    assert.ok(onbSrc.includes('{legal ? copy.legalStep : copy.alertStep}'));
    assert.ok(!/legalStep\.replace|replace\('1 \/ 2'/.test(onbSrc));
    // 옛 알림 단계(2/2)의 글도 그대로 — 끄기 스위치로 되돌아가는 화면
    for (const m of ['리포트 알림', '장마감 리포트와 주요 시장 브리핑이 생성되면 알림을 받을 수 있습니다.', '데이터 잠금해제', '광고 기반 미리보기 안내', '2 / 2 · 알림 설정', '2 / 2 · Notifications', '2 / 2 · 通知設定']) {
      assert.ok(onbSrc.includes(m), `옛 알림 단계 글이 바뀌었다: ${m}`);
    }
  });
  t('약관 체크 → [계속] 순서: 동의하지 않으면 계속이 막힌다(disabled) · 건너뛰기는 가치·알림 단계에만 있다', () => {
    assert.ok(/disabled=\{legal && \(!accepted \|\| advancing\)\}/.test(onbSrc), '계속 버튼은 동의 전 비활성');
    const valueSrc = read('src/components/app/FirstRunValueStep.tsx');
    assert.ok(/finishSkip/.test(valueSrc) && /onLater/.test(valueSrc));
    // 법적 고지 단계 화면 조각에는 건너뛰기 버튼이 없다
    const legalPart = onbSrc.slice(onbSrc.indexOf('const legal = step'));
    assert.ok(!/skip|건너뛰기|スキップ/i.test(legalPart));
  });
  t('기존 사용자: 저장 키·판정이 그대로(accepted 면 뜨지 않는다) · 선물 안내가 읽는 키와 같다', () => {
    assert.ok(onbSrc.includes("const STORAGE_KEY = 'signumhq.app.onboarding.v1'"));
    assert.ok(/getItem\(STORAGE_KEY\) !== 'accepted'/.test(onbSrc));
    assert.equal(ONBOARDING_DONE_KEY, 'signumhq.app.onboarding.v1');
    assert.ok(/setItem\(STORAGE_KEY, 'accepted'\)/.test(onbSrc));
  });
  t('모든 앱 화면에 실리는 오버레이는 무거운 가치 단계를 «필요할 때만» 불러온다 — 이미 마친 기기(대부분)의 번들·요청이 늘지 않는다', () => {
    assert.ok(!/from '\.\/FirstRunValueStep'/.test(onbSrc) && !/from '\.\/firstRunValueData'/.test(onbSrc) && !/from '@\/lib\/app\/firstRunValue'/.test(onbSrc), '정적 import 금지');
    assert.equal((onbSrc.match(/import\('\.\/FirstRunValueStep'\)/g) || []).length, 3);
    for (const heavy of ['useLiveQuotes', 'useWatchlistAiLines', 'PositionMap', 'watchlistInsights', 'useWatchlistData']) assert.ok(!onbSrc.includes(heavy), `오버레이가 ${heavy} 를 직접 가져온다`);
    // 이미 마친 기기: 설정도 읽지 않는다(보이는 동안만 · useOnbMode(mounted && visible …))
    assert.ok(/useOnbMode\(mounted && visible && !isDocumentRoute\)/.test(onbSrc));
  });
  t('푸시 권한 요청 코드는 한 곳 — 옛 [시작하기]와 새 [알림 받기]가 같은 함수를 부른다 · 가치 단계는 권한을 요청하지 않는다', () => {
    assert.equal((onbSrc.match(/requestPermissions\(\)/g) || []).length, 1);
    assert.equal((onbSrc.match(/await requestPushAndRegister\(\)/g) || []).length, 2);
    const valueSrc = read('src/components/app/FirstRunValueStep.tsx') + read('src/components/app/firstRunValueData.ts');
    assert.ok(!/requestPermissions|push-notifications/.test(valueSrc));
  });
  t('가치 단계는 새 AI 생성을 부르지 않는다 — 읽기 API 만(ai-line 저장본·시세·레벨·실적 캘린더·검색)', () => {
    const d = read('src/components/app/firstRunValueData.ts');
    const urls = [...d.matchAll(/'(\/api\/[^'`?]+)/g)].map((m) => m[1]);
    for (const u of urls) assert.ok(['/api/app/onboarding-config', '/api/market/earnings-calendar', '/api/tickers/search'].includes(u), `예상 밖 API: ${u}`);
    assert.ok(/useWatchlistAiLines/.test(d) && /fetchLevels/.test(d) && /useLiveQuotes/.test(d));
    const v = read('src/components/app/FirstRunValueStep.tsx');
    assert.ok(!/\/api\/(ai|cron|deep|analysis)/.test(v + d));
    // src/lib/ai 는 건드리지 않는다(다른 작업자 영역) — 새 파일들은 그쪽을 가져오지 않는다
    for (const f of ['src/lib/app/firstRunValue.ts', 'src/lib/app/firstRunCopy.ts', 'src/components/app/firstRunValueData.ts', 'src/components/app/FirstRunValueStep.tsx', 'src/app/api/app/onboarding-config/route.ts']) {
      assert.ok(!/from '@\/lib\/ai\//.test(read(f)), `${f} 가 lib/ai 를 가져온다`);
    }
  });

  // ── ⑦ 계측 ──
  t('닫힌 목록에 새 단계 6 · 출처 12 가 있다', () => {
    for (const st of ['onb_show', 'onb_done', 'onb_skip', 'onb_pick', 'onb_perm', 'onb_card']) assert.ok(isFunnelStage(st) && FUNNEL_STAGES.includes(st as never), st);
    for (const s of ['onb_legal', 'onb_value', 'onb_notif', 'onb_oldalert', 'onb_n1', 'onb_n2', 'onb_n3', 'onb_allow', 'onb_deny', 'onb_ai', 'onb_noai', 'onb_earn']) assert.ok(isFunnelSrc(s) && FUNNEL_SRCS.includes(s as never), s);
  });
  t('소스가 보내는 모든 (단계, 출처) 쌍이 닫힌 목록 안 · 식별자·종목은 싣지 않는다', () => {
    const files = ['src/components/app/AppFirstRunOnboarding.tsx', 'src/components/app/FirstRunValueStep.tsx'].map(read).join('\n');
    const pairs = [...files.matchAll(/trackFunnel\('(onb_[a-z]+)',\s*\{\s*src:\s*'(onb_[a-z0-9]+)'/g)].map((m) => [m[1], m[2]]);
    assert.ok(pairs.length >= 7, `쌍 ${pairs.length}`);
    for (const [st, src] of pairs) assert.ok(isFunnelStage(st) && isFunnelSrc(src), `${st}/${src}`);
    // 삼항·변수로 보내는 값까지: 소스에 적힌 onb_* 글자는 전부 단계 또는 출처 닫힌 목록에 있다
    const all = new Set([...files.matchAll(/'(onb_[a-z0-9]+)'/g)].map((m) => m[1]));
    for (const w of all) assert.ok(isFunnelStage(w) || isFunnelSrc(w), `닫힌 목록에 없는 글자: ${w}`);
    // 변수로 보내는 src 는 permSrc·pickSrc·stepSrc 가 돌려주는 값뿐
    assert.deepEqual([permSrc('granted'), permSrc('denied'), permSrc('na')], ['onb_allow', 'onb_deny', null]);
    for (const m of files.matchAll(/trackFunnel\([^)]*\)/g)) assert.ok(!/ticker|\bt\b:|code:|symbol/i.test(m[0]), `계측 호출에 종목/식별자: ${m[0]}`);
    assert.deepEqual(funnelKeys('fx', '2026-10-12', 'onb_pick', 'onb_n2', 'ios').main, 'fx:onb_pick:onb_n2:ios:2026-10-12');
  });
  t('계측 단계 노출은 실행당 단계마다 한 번만(Set 가드) · 안드로이드 앱은 기존 규칙대로 보내지 않는다', () => {
    assert.ok(/shownSteps\.current\.has\(src\)/.test(onbSrc));
    const beacon = read('src/lib/app/funnelBeacon.ts');
    assert.ok(/FUNNEL_SEND_ANDROID = false/.test(beacon));
    assert.ok(/from '@\/lib\/app\/funnelBeacon'/.test(onbSrc), '부작용 없는 비콘 모듈을 쓴다');
  });
  t('scripts/mkt-funnel.js 의 새 목록 = 닫힌 목록(funnel.test.ts 가 전체 대조)', () => {
    const r = require('../scripts/mkt-funnel.js');
    for (const st of r.ONB_STAGES) assert.ok(FUNNEL_STAGES.includes(st), st);
    for (const s of r.ONB_SRCS) assert.ok(FUNNEL_SRCS.includes(s), s);
    assert.deepEqual(r.STAGES, [...FUNNEL_STAGES]);
    assert.deepEqual(r.SRCS, [...FUNNEL_SRCS]);
  });

  console.log(`\n✅ firstRunValue: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
