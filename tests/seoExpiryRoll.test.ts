/** SEO 실제 서버 렌더: 만기 롤오버 때 지난 사본 숫자를 되살리지 않는다 — 새 문구·새 UI 요소 없이(기존 «레벨 없음» 경로). */
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { displayLevels, levelsFromStructure } from '../src/lib/optionLevelGate';
import { ucMoneyAtExit } from '../src/lib/seo/ucMoneyExit';
import { WL_COPY } from '../src/components/app/watchlist/copy';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let now = Date.parse('2026-10-16T19:02:00-04:00');
Date.now = () => now;
const stub = (path: string, exports: any) => {
  const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
const old = levelsFromStructure({
  options_status: 'OK', expiration: '2026-10-16', chainDate: '2026-10-15', underlyingPrice: 100,
  maxPain: 100, levels: { callWall: 110, putFloor: 90 }, gammaFlipLevel: null,
})!;
let lv: any = displayLevels({ ...old, levelsAsOf: now - 120_000 });
let levelsMap = (): Map<string, any> => new Map(lv ? [['MSTR', lv]] : []);
stub('../src/services/structureService', { peekStructureLevelsDetailed: async () => ({ levels: levelsMap(), noSnapshot: lv ? [] : ['MSTR'] }) });
stub('../src/services/darkPool', { getDarkPoolCurrent: async () => null });
stub('../src/services/intrinioClient', { peekEodCloseRow: async () => null });
stub('../src/lib/marketing/pageViewMark', { markPageView: async () => {} });
stub('../src/components/share/ShareLanding', { ShareLanding: () => null });
stub('../src/lib/net/publicBase', { publicBase: () => 'https://local.test' });
stub('next/headers', { headers: async () => new Headers({ 'user-agent': 'Googlebot' }), cookies: async () => ({ get: () => undefined }) });
let copy: any = { generatedAt: '2026-10-16T19:00:00Z', money: { price: null, maxPain: 777, callWall: 888, putFloor: 666 } };
globalThis.fetch = async (url: any) => {
  assert.ok(String(url).startsWith('https://local.test/api/undercurrent/ticker?'));
  return Response.json({ success: true, ticker: 'MSTR', hasMoneyData: true, cards: [], ...copy });
};
const Page = require('../src/app/[locale]/flow/[ticker]/page');

const render = async (locale = 'ko') => renderToStaticMarkup(await Page.default({ params: Promise.resolve({ locale, ticker: 'MSTR' }), searchParams: Promise.resolve({}) }));
const NEW_UI = (html: string, locale: string) => [WL_COPY[locale as 'ko'].levelsWait, 'lucide-clock', '범위 밖', 'Out of range'].filter((x) => html.includes(x));
// 세 칸(맥스페인·콜월·풋플로어)이 «—» 로 남아야 한다(칸을 숨기지 않는다) — 라벨은 실제 렌더에서 그대로 읽는다
const dashCells = (html: string, locale: string) => {
  const lbl = { ko: ['맥스페인', '콜월', '풋플로어'], en: ['Max pain', 'Call wall', 'Put floor'], ja: ['マックスペイン', 'コールウォール', 'プットフロア'] }[locale as 'ko'];
  return lbl.filter((x) => new RegExp(x.replace(/ /g, '\\s') + '</div><div[^>]*>—</div>', 'i').test(html));
};

(async () => {
  // 금 19:02 ET — 구조 판본(10/16 만기)은 지났고, 사본(금 15:00 ET 생성 = 10/16 만기분) 숫자 777·888·666 은 되살리면 안 된다
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const html = await render(locale);
    for (const stale of ['777', '888', '666', '$100', '$110', '$90']) assert.ok(!html.includes(stale), `지난 숫자 재사용 금지 ${stale}`);
    assert.deepEqual(NEW_UI(html, locale), [], '새 문구·시계 없음');
    assert.equal(dashCells(html, locale).length, 3, `${locale}: 칸 유지(—)`);
    const meta = await Page.generateMetadata({ params: Promise.resolve({ locale, ticker: 'MSTR' }), searchParams: Promise.resolve({}) });
    assert.ok(!JSON.stringify(meta).includes('777'));
    console.log(`✓ ${locale}: 지난 만기 사본/판본 숫자 없음 · 새 문구/시계 없음 · 메타데이터 깨끗`);
  }
  // 구조 판본 자체가 없을 때(사본만 남음)도 같다
  lv = null;
  { const html = await render('ko'); for (const x of ['777', '888', '666']) assert.ok(!html.includes(x)); assert.deepEqual(NEW_UI(html, 'ko'), []); assert.equal(dashCells(html, 'ko').length, 3); }
  console.log('✓ 구조 판본 없음 + 만기 전 사본 → 숫자 없이 세 칸 «—»(새 문구 없음)');
  // 금 15:59 에 읽고 16:00:10 에 끝난 사본(10/16 만기분)도 마찬가지
  copy = { generatedAt: '2026-10-16T20:00:10Z', money: { price: null, maxPain: 777, callWall: 888, putFloor: 666 } };
  { const html = await render('ko'); for (const x of ['777', '888', '666']) assert.ok(!html.includes(x)); assert.equal(dashCells(html, 'ko').length, 3); }
  console.log('✓ 마감 직후(16:00:10)에 끝난 사본: 지난 숫자 없음');
  // 옵션 없는 종목(NO_MARKET): 레벨 맵이 비고 사본에도 레벨이 없다 — «갱신 대기»가 뜨면 안 된다
  copy = { generatedAt: '2026-10-16T19:00:00Z', money: { price: null, maxPain: null, callWall: null, putFloor: null } };
  { const html = await render('ko'); assert.deepEqual(NEW_UI(html, 'ko'), [], 'NO_MARKET 은 대기 표시 없음'); assert.equal(dashCells(html, 'ko').length, 0, 'NO_MARKET 은 기존대로 칸 없음'); }
  console.log('✓ NO_MARKET(빈 레벨 맵·사본 레벨 없음): 대기 표시 없음');
  // 마감 «뒤»에 만든 사본(금 17:00 ET 생성 = 다음 주 만기분)은 판본이 없어도 기존처럼 쓴다
  copy = { generatedAt: '2026-10-16T21:00:00Z', money: { price: null, maxPain: 777, callWall: 888, putFloor: 666 } };
  { const html = await render('ko'); for (const x of ['777', '888', '666']) assert.ok(html.includes(x), `마감 뒤 사본은 유지 ${x}`); }
  console.log('✓ 마감 뒤 만든 사본: 기존 경로 그대로 숫자 유지');
  // UC 응답 문이 이미 지난 레벨을 비운 사본(숫자 null · levelsPending)이 오고 구조 판본이 없어도 세 칸은 «—» 로 남는다
  copy = { generatedAt: '2026-10-16T19:00:00Z', money: { price: null, maxPain: null, callWall: null, putFloor: null, levelsPending: true } };
  for (const locale of ['ko', 'en', 'ja'] as const) { const html = await render(locale); assert.equal(dashCells(html, locale).length, 3, locale); assert.deepEqual(NEW_UI(html, locale), []); }
  console.log('✓ UC 가 비운 사본(levelsPending) + 판본 없음: ko/en/ja 세 칸 «—» 유지');
  // 마감 뒤 16:10 ET 에 읽고 만든 정상 다음 주 사본은 판본 조회가 실패해도 그대로
  copy = { generatedAt: '2026-10-16T20:10:00Z', money: { price: null, maxPain: 777, callWall: 888, putFloor: 666 } };
  { const html = await render('ko'); for (const x of ['777', '888', '666']) assert.ok(html.includes(x)); }
  console.log('✓ 마감 뒤 16:10 ET 생성 사본: 유지');
  // 다음 판본 도착 — 10/23 만기 판본이 오면 정상 복귀
  copy = { generatedAt: '2026-10-16T19:00:00Z', money: { price: null, maxPain: 777, callWall: 888, putFloor: 666 } };
  lv = { ...old, levelsExpiration: '2026-10-23', levelsAsOf: now };
  { const html = await render('ko'); assert.ok(html.includes('10/23')); assert.ok(html.includes('$100') || html.includes('100')); assert.ok(!html.includes('777')); }
  console.log('✓ 다음 판본 도착: 10/23 만기 숫자로 복귀');
  // 실제 UC 출구를 거친 응답을 SEO가 읽는 연쇄 재현(사본 숫자가 이미 null 인 상태).
  lv = null;
  for (const iso of ['2026-10-16T16:01:00-04:00', '2026-10-17T12:00:00-04:00', '2026-10-18T12:00:00-04:00', '2026-10-19T08:00:00-04:00']) {
    now = Date.parse(iso);
    const money = ucMoneyAtExit({ price: null, maxPain: 777, callWall: 888, putFloor: 666, levelsExpiration: '2026-10-16' }, {
      generatedAt: '2026-10-16T20:20:00Z', lastClosed: '2026-10-16', now, regularNow: false, todayET: iso.slice(0, 10), eod: null, levels: null,
    });
    assert.equal((money as any).levelsPending, true);
    copy = { generatedAt: '2026-10-16T20:20:00Z', money };
    for (const locale of ['ko', 'en', 'ja']) {
      const html = await render(locale);
      assert.equal(dashCells(html, locale).length, 3, iso + locale);
      for (const x of ['777', '888', '666']) assert.ok(!html.includes(x));
    }
  }
  console.log('✓ 금 16:01·토·일·월 08:00: 실제 UC 출구 → SEO 3언어, 지난 숫자 없음·세 칸 유지');
  // 마감 직후 생성된 정상 다음 만기는 명시 만기를 기준으로 유지한다(생성 완료시각에서 빼지 않음).
  copy = { generatedAt: '2026-10-16T20:00:10Z', money: { price: null, maxPain: 777, callWall: 888, putFloor: 666, levelsExpiration: '2026-10-23' } };
  { const html = await render('ko'); for (const x of ['777', '888', '666']) assert.ok(html.includes(x)); }
  console.log('✓ 명시된 다음 만기 사본은 AI 완료시각과 무관하게 유지');
  // 새 UI 가 소스에 없다(대표 규칙: 새 문구·새 UI 요소 금지)
  const seoSrc = fs.readFileSync('src/app/[locale]/flow/[ticker]/page.tsx', 'utf8');
  const ucSrc = fs.readFileSync('src/app/[locale]/undercurrent/page.tsx', 'utf8');
  assert.ok(!seoSrc.includes('levelsWait'));
  assert.ok(!/Clock/.test(seoSrc) && !seoSrc.includes('levelOutOfRangeText'));
  assert.ok(!ucSrc.includes('levelsWait') && !/Clock|lucide/.test(ucSrc.slice(ucSrc.indexOf('function LevelMap('), ucSrc.indexOf('function DeepLayer('))));
  console.log('✓ SEO/UC 화면 소스에 새 대기 문구·시계·범위 밖 요소 없음');
  // UC 지도(실제 함수 원문 서버 렌더): 지난 레벨을 비운 응답은 라벨 세 칸을 «—» 로 남기고, 새 문구·시계는 없다
  const mapSource = ucSrc.slice(ucSrc.indexOf('function LevelMap('), ucSrc.indexOf('function DeepLayer('));
  const compiled = ts.transpileModule(mapSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const UCMap = vm.runInNewContext(compiled + '\nLevelMap;', { require, exports: {}, C: { sub: '#777', ink: '#111', emerald: '#0a0', neutral: '#999', amber: '#a70' } });
  const labels = { levels: 'Options levels', lvFloor: 'Put Floor', lvMagnet: 'Max Pain', lvWall: 'Call Wall', lvNow: 'Price' };
  const pendingMap = renderToStaticMarkup(UCMap({ m: { levelsPending: true, maxPain: null, callWall: null, putFloor: null, price: 100 }, t: labels }));
  for (const x of ['Put Floor', 'Max Pain', 'Call Wall']) assert.ok(pendingMap.includes(x), x);
  assert.equal(pendingMap.split('>—<').length - 1, 3);
  assert.ok(!pendingMap.includes('lucide') && !pendingMap.includes('<time'));
  const livePts = renderToStaticMarkup(UCMap({ m: { levelsPending: false, putFloor: 90, maxPain: 100, callWall: 110, price: 100 }, t: labels }));
  assert.ok(livePts.includes('$90') && !livePts.includes('>—<'));
  const noLevels = renderToStaticMarkup(UCMap({ m: { maxPain: null, callWall: null, putFloor: null, price: 100 }, t: labels }));
  assert.equal(noLevels, '', '레벨이 원래 없는 종목은 기존대로 지도를 그리지 않는다');
  console.log('✓ UC 지도: 지난 레벨 비움 → 세 라벨 «—» 유지(새 문구 없음) · 복귀 · 원래 없는 종목은 기존대로');
  console.log('총 14개 통과');
})().catch((e) => { console.error(e); process.exitCode = 1; });
