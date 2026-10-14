/**
 * 뉴스 펄스 «전체 보기» 보관본 (2026-10-13, feat/news-pulse-archive) — 보관 규칙 · 저장/읽기 흐름 · API · 다이제스트 배선 · 화면 소스 · 측정 · UC 줄
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx","resolveJsonModule":true}' tests/newsPulseArchive.test.ts
 */
process.env.TZ = 'Asia/Seoul';   // 묶음 머리(오늘·어제)·시각은 «기기 시간대» — 시험은 한국 시간으로 고정
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// 진짜 레디스 정책 함수(복제 규칙)는 가짜로 바꾸기 «전에» 한 번 읽어 둔다
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realRedis = require('../src/services/redisClient');
const { decideReplicate, shouldFallbackToUpstash } = realRedis as {
  decideReplicate: (k: string, ttl: number | undefined, ecOk: boolean) => string;
  shouldFallbackToUpstash: (k: string, ecAuth: boolean) => boolean;
};

// ── 레디스(메모리)로 바꿔 끼우기 ──
const store = new Map<string, unknown>();
const ttls = new Map<string, number | undefined>();
const writes: string[] = [];
let failSet = false;
let failGet = false;
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
  id: rcPath, filename: rcPath, loaded: true,
  exports: {
    getFromCache: async (k: string) => { if (failGet) throw new Error('boom'); return store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null; },
    mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null)),
    setInCache: async (k: string, v: unknown, ttl?: number) => { if (failSet) throw new Error('set boom'); store.set(k, JSON.parse(JSON.stringify(v))); ttls.set(k, ttl); writes.push(k); return true; },
    deleteFromCache: async (k: string) => { store.delete(k); return true; },
  },
} as unknown as Module;

import {
  ARCHIVE_DAY_CAP, ARCHIVE_KEY_PREFIX, ARCHIVE_RETURN_CAP, ARCHIVE_TTL_SEC, ARCHIVE_WINDOW_MS, DIGEST_REDIS_KEY,
  countsFor, etDay, inWindow, mergeDay, normLocale, readPulseArchive, readableIn, saveToPulseArchive, titleKey, toArchiveItem, toLean, windowDays,
  type ArchiveItem, type DigestLikeItem,
} from '../src/lib/news/pulseArchive';
import {
  NEWS_COPY, VIEW_ALL, clockOf, dayHeading, groupByLocalDay, localDayKey, toNewsLoc,
} from '../src/lib/news/pulseCopy';
import { UI as TODAY_UI } from '../src/lib/todayPicks/copy';
import { FUNNEL_SRCS, isFunnelSrc } from '../src/lib/app/funnelSchema';
import { newsArchiveHref, newsFocusKey } from '../src/lib/news/pulseNavigation';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiveRoute = require('../src/app/api/guardian/news-archive/route');

let n = 0;
const tests: Array<[string, () => unknown]> = [];
const t = (name: string, fn: () => unknown) => tests.push([name, fn]);
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const NOW = Date.parse('2026-10-13T13:00:00Z');   // 한국 22:00 · 뉴욕 09:00
Date.now = () => NOW;                              // 모듈(저장·API)이 읽는 «지금»을 고정한다 — 시험이 실제 시각에 기대지 않게
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

let seq = 0;
function item(over: Partial<DigestLikeItem> & { h?: number } = {}): DigestLikeItem {
  const i = ++seq;
  const { h, ...rest } = over;
  return {
    id: `cnbc-item-${i}`,
    headline: `Headline number ${i} about markets`,
    summaryKR: `한국어 요약 ${i}`, summaryEN: `English summary ${i}`, summaryJP: `日本語の要約${i}かな`,
    analysisKR: `만약 ~라면 ${i}`, analysisEN: `IF x THEN y ${i}`, analysisJP: `もし～なら${i}`,
    category: 'US_MARKET', impact: 'BEARISH', urgency: 4, source: 'CNBC',
    publishedAt: ago(h ?? 1),
    _rawTitleKey: `rawkey${i}`,
    ...rest,
  };
}
const reset = () => { store.clear(); ttls.clear(); writes.length = 0; failSet = false; failGet = false; };

t('TOP SIGNAL focus: 다이제스트 → 보관본 → 언어별 목록까지 같은 id를 유지한다', () => {
  const digest = item({ id: 'source-/news?article=1&lang=ko#日本語' });
  const archived = toArchiveItem(digest)!;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const row = toLean(archived, locale);
    const url = new URL(newsArchiveHref(locale, digest), 'https://example.test');
    assert.equal(url.searchParams.get('focus'), row.id);
    assert.equal(url.searchParams.get('focusKey'), newsFocusKey(row));
    assert.equal(row.id, digest.id);
  }
});

t('회귀: 공급사 ID가 바뀌어도 mergeDay가 남긴 기사로 ko/en/ja 링크가 연결된다', () => {
  for (const raw of [undefined, 'originaltitlekey']) {
    const original = item({ id: 'provider-old', _rawTitleKey: raw, headline: 'Fed Holds Rates!' });
    const regenerated = { ...original, id: 'provider-new', headline: 'FED holds rates.' };
    const rows = mergeDay([toArchiveItem(original)!], [toArchiveItem(regenerated)!]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, original.id);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const row = toLean(rows[0], locale);
      const url = new URL(newsArchiveHref(locale, regenerated), 'https://example.test');
      assert.equal(url.searchParams.get('focus'), regenerated.id);
      const focusKey = url.searchParams.get('focusKey');
      assert.ok(row.id === url.searchParams.get('focus') || (!!focusKey && newsFocusKey(row) === focusKey), locale);
      assert.match(focusKey!, /^[a-z0-9]{8,16}$/);
    }
  }
});

// ━━━ 1. 날짜·창 ━━━
t('etDay: 뉴욕 달력 날짜 — 서머타임(EDT)·표준시(EST) 경계에서도 맞다', () => {
  assert.equal(etDay('2026-10-13T03:59:59Z'), '2026-10-12');   // 23:59:59 EDT
  assert.equal(etDay('2026-10-13T04:00:00Z'), '2026-10-13');   // 00:00 EDT
  assert.equal(etDay('2026-11-03T04:59:59Z'), '2026-11-02');   // 11/1 서머타임 끝(EST = UTC−5)
  assert.equal(etDay('2026-11-03T05:00:00Z'), '2026-11-03');
});
t('windowDays: 48시간 창이 걸치는 ET 날짜 3개 이하(최신 먼저) · 서머타임이 끝나는 날에도 빠지지 않는다', () => {
  assert.deepEqual(windowDays(NOW), ['2026-10-13', '2026-10-12', '2026-10-11']);
  const d = windowDays(Date.parse('2026-11-02T20:00:00Z'));   // 11/1 EDT→EST 전환 다음 날
  assert.ok(d.length <= 4 && d[0] === '2026-11-02' && d.includes('2026-11-01') && d.includes('2026-10-31'), d.join());
  // 창 안 모든 시각(1시간 간격)의 ET 날짜가 목록에 든다
  for (const base of [NOW, Date.parse('2026-11-02T20:00:00Z'), Date.parse('2026-03-09T20:00:00Z')]) {
    const days = new Set(windowDays(base));
    for (let h = 0; h <= 48; h++) assert.ok(days.has(etDay(base - h * 3600_000)), `${new Date(base).toISOString()} -${h}h`);
  }
});

// ━━━ 2. 보관 대상·키 ━━━
t('toArchiveItem: AI 해석이 하나도 없으면(AI 실패 원문 항목) 보관하지 않는다', () => {
  assert.equal(toArchiveItem(item({ analysisKR: '', analysisEN: '', analysisJP: '' })), null);
  assert.ok(toArchiveItem(item({ analysisKR: '', analysisJP: '' })), '영어 해석만 있어도 «해석본»');
});
t('toArchiveItem: 한국어도 일본어도 번역되지 않은 항목은 뺀다(영어 원문이 한국어 화면에 새지 않게) · 발행 시각이 이상하면 뺀다', () => {
  assert.equal(toArchiveItem(item({ summaryKR: 'English only', summaryJP: 'English only too' })), null);
  assert.equal(toArchiveItem(item({ publishedAt: 'not a date' })), null);
  assert.equal(toArchiveItem(item({ publishedAt: undefined })), null);
  assert.equal(toArchiveItem({ ...item(), id: '' }), null);
});
t('toArchiveItem: 중복 키 = 원문 제목 키 → 없으면 헤드라인 키 → 없으면 id · 화면에 안 쓰는 칸(headline·ageMinutes·_srcYears)은 담지 않는다', () => {
  assert.equal(toArchiveItem(item({ _rawTitleKey: 'abc' }))!.k, 'abc');
  const a = toArchiveItem(item({ _rawTitleKey: undefined, headline: 'Fed Holds Rates!' }))!;
  assert.equal(a.k, titleKey('Fed Holds Rates!'));
  assert.equal(a.k, 'fedholdsrates');
  const b = toArchiveItem(item({ _rawTitleKey: undefined, headline: '', id: 'xyz-9' }))!;
  assert.equal(b.k, 'xyz-9');
  const raw = toArchiveItem({ ...item(), ageMinutes: 5, _srcYears: ['2026'], headline: 'h' } as any)! as any;
  assert.equal('headline' in raw || 'ageMinutes' in raw || '_srcYears' in raw, false);
  assert.equal(raw.publishedAt.endsWith('Z'), true);
});

// ━━━ 3. 합치기 ━━━
t('mergeDay: 같은 기사(id 또는 k)는 먼저 저장된 것을 남긴다 · 발행 시각 내림차순 · cap · 입력은 바꾸지 않는다', () => {
  const a = toArchiveItem(item({ h: 3, id: 'A', _rawTitleKey: 'ka' }))!;
  const b = toArchiveItem(item({ h: 2, id: 'B', _rawTitleKey: 'kb' }))!;
  const aDup = { ...toArchiveItem(item({ h: 3, id: 'A2', _rawTitleKey: 'ka' }))!, summaryKR: '다른 문장' };   // k 같음
  const bDupId = { ...toArchiveItem(item({ h: 2, id: 'B', _rawTitleKey: 'kb2' }))!, summaryKR: '다른 문장 2' };   // id 같음
  const c = toArchiveItem(item({ h: 1, id: 'C', _rawTitleKey: 'kc' }))!;
  const existing = [a, b];
  const snapshot = JSON.stringify(existing);
  const out = mergeDay(existing, [aDup, bDupId, c]);
  assert.deepEqual(out.map((x) => x.id), ['C', 'B', 'A']);
  assert.equal(out.find((x) => x.id === 'A')!.summaryKR, a.summaryKR, '먼저 저장된 문장을 남긴다');
  assert.equal(JSON.stringify(existing), snapshot);
  assert.deepEqual(mergeDay(existing, [aDup, bDupId, c], 2).map((x) => x.id), ['C', 'B'], 'cap 은 최신 쪽을 남긴다');
});
t('inWindow: 48시간 안 · 미래 1시간 허용 · 중복 제거 · 최신 먼저', () => {
  const rows = [
    toArchiveItem(item({ h: 47.9, id: 'in-old' }))!, toArchiveItem(item({ h: 48.1, id: 'out' }))!,
    toArchiveItem(item({ h: -0.5, id: 'in-future' }))!, toArchiveItem(item({ h: -2, id: 'out-future' }))!,
    toArchiveItem(item({ h: 5, id: 'in-mid' }))!,
  ];
  assert.deepEqual(inWindow(rows, NOW).map((x) => x.id), ['in-future', 'in-mid', 'in-old']);
  assert.equal(ARCHIVE_WINDOW_MS, 48 * 3600_000);
});
t('readableIn · countsFor · toLean · normLocale — 요청한 언어로 읽을 수 있는 것만, 다른 언어로 대체하지 않는다', () => {
  const ko = toArchiveItem(item({ summaryJP: 'English only' }))!;   // 일본어 칸에 가나 없음
  const ja = toArchiveItem(item({ summaryKR: 'English only', summaryJP: '日本語です' }))!;
  assert.ok(readableIn(ko, 'ko') && !readableIn(ko, 'ja') && readableIn(ko, 'en'));
  assert.ok(!readableIn(ja, 'ko') && readableIn(ja, 'ja'));
  assert.deepEqual(countsFor([ko, ja]), { ko: 1, ja: 1, en: 2 });
  const l = toLean(ko, 'ko');
  assert.deepEqual(Object.keys(l).sort(), ['analysis', 'category', 'focusKey', 'id', 'impact', 'publishedAt', 'source', 'summary', 'urgency']);
  assert.equal(l.summary, ko.summaryKR); assert.equal(l.analysis, ko.analysisKR);
  assert.equal(toLean(ko, 'en').summary, ko.summaryEN); assert.equal(toLean(ja, 'ja').analysis, ja.analysisJP);
  assert.deepEqual(['ko-KR', 'ja', 'EN', null, 'fr'].map((x) => normLocale(x as any)), ['ko', 'ja', 'en', 'en', 'en']);
});

// ━━━ 4. 저장 ━━━
t('saveToPulseArchive: 날짜(ET)별 문서 · TTL 5일 · 키 접두사 newsarchive: (guardian: 복제 접두사 밖) · 개수 반환 · 같은 입력을 다시 넣으면 쓰기 0(멱등)', async () => {
  reset();
  const items = [item({ h: 1 }), item({ h: 2 }), item({ h: 13 }), item({ h: 30 })];   // 13시간 전 = ET 10/12 20:00 · 30시간 전 = ET 10/12 03:00
  const r = await saveToPulseArchive(items, NOW);
  assert.ok(r);
  assert.deepEqual(r!.counts, { ko: 4, ja: 4, en: 4 });
  assert.equal(r!.written, 2);
  assert.deepEqual([...writes].sort(), ['newsarchive:v1:2026-10-12', 'newsarchive:v1:2026-10-13']);
  for (const k of writes) assert.equal(ttls.get(k), ARCHIVE_TTL_SEC);
  assert.equal(ARCHIVE_TTL_SEC, 5 * 24 * 3600);
  const d13 = store.get('newsarchive:v1:2026-10-13') as any;
  assert.equal(d13.v, 1); assert.equal(d13.day, '2026-10-13'); assert.equal(d13.items.length, 2);
  assert.ok(d13.items[0].publishedAt > d13.items[1].publishedAt, '최신 먼저');
  // 같은 입력 다시 — 쓰기 0
  writes.length = 0;
  const r2 = await saveToPulseArchive(items, NOW);
  assert.equal(r2!.written, 0);
  assert.deepEqual(r2!.counts, r!.counts);
  // 새 항목 하나 — 그 날 문서만 다시 쓴다
  const r3 = await saveToPulseArchive([...items, item({ h: 0.2 })], NOW);
  assert.equal(r3!.written, 1); assert.equal(writes[0], 'newsarchive:v1:2026-10-13');
  assert.equal(r3!.counts.ko, 5);
});
t('saveToPulseArchive: 카드에서 밀려 사라진 항목도 이전 저장분에 그대로 남는다(대표 요청의 핵심) · 창 밖 날짜 항목은 저장하지 않는다', async () => {
  reset();
  const gone = item({ h: 3, id: 'will-vanish' });
  await saveToPulseArchive([gone, item({ h: 1 })], NOW);
  // 다음 갱신 때는 카드(= 넘기는 목록)에 'will-vanish' 가 없다
  await saveToPulseArchive([item({ h: 0.5 }), item({ h: 0.4 })], NOW + 15 * 60_000);
  const rows = await readPulseArchive(NOW + 15 * 60_000);
  assert.ok(rows.some((x) => x.id === 'will-vanish'), '사라진 뉴스가 보관본에 남아 있다');
  assert.equal(rows.length, 4);
  // 4일 전 항목 — 날짜 문서를 만들지 않는다
  writes.length = 0;
  await saveToPulseArchive([item({ h: 96, id: 'ancient' })], NOW);
  assert.equal(writes.length, 0);
});
t('saveToPulseArchive: AI 해석 없는 항목은 개수에도 안 든다 · 하루 문서는 cap(160)을 넘지 않는다 · 쓰기 실패·예상 밖 입력은 던지지 않는다', async () => {
  reset();
  const r = await saveToPulseArchive([item({ analysisKR: '', analysisEN: '', analysisJP: '' }), item()], NOW);
  assert.equal(r!.counts.en, 1);
  reset();
  const many = Array.from({ length: ARCHIVE_DAY_CAP + 25 }, (_, i) => item({ h: 0.1 + i * 0.01 }));
  await saveToPulseArchive(many, NOW);
  assert.equal((store.get('newsarchive:v1:2026-10-13') as any).items.length, ARCHIVE_DAY_CAP);
  reset(); failSet = true;
  const w = await saveToPulseArchive([item()], NOW);
  assert.ok(w && w.written === 0 && w.counts.en === 1, '쓰기가 실패해도 던지지 않는다(다이제스트 저장을 막지 않는다)');
  assert.equal(await saveToPulseArchive(null as any, NOW), null, '예상 밖 입력 → null(역시 던지지 않는다)');
});
t('readPulseArchive: 여러 날 문서를 합쳐 창 안만 · 최신 먼저 · 읽기 실패는 빈 목록', async () => {
  reset();
  await saveToPulseArchive([item({ h: 1 }), item({ h: 20 }), item({ h: 40 })], NOW);
  const rows = await readPulseArchive(NOW);
  assert.equal(rows.length, 3);
  assert.ok(rows[0].publishedAt > rows[1].publishedAt && rows[1].publishedAt > rows[2].publishedAt);
  // 1시간 지나면 40시간 전 항목은 여전히 창 안(41h) · 49시간 뒤엔 사라진다
  assert.equal((await readPulseArchive(NOW + 7 * 3600_000)).length, 3);
  assert.equal((await readPulseArchive(NOW + 9 * 3600_000)).length, 2);
  failGet = true;
  assert.deepEqual(await readPulseArchive(NOW), []);
});

// ━━━ 5. 레디스 비용 규칙 ━━━
t('키가 «복제 접두사 밖» — EC2 쓰기가 성공하면 Upstash 쓰기 0 · 읽기 미스에서 Upstash 를 묻지 않는다(비용)', () => {
  const k = `${ARCHIVE_KEY_PREFIX}2026-10-13`;
  assert.equal(k.startsWith('guardian:'), false);
  assert.equal(decideReplicate(k, ARCHIVE_TTL_SEC, true), 'skip');
  assert.equal(decideReplicate(k, ARCHIVE_TTL_SEC, false), 'replicate', 'EC2 쓰기 실패 때만 예전 규칙(Upstash 가 받는다)');
  assert.equal(shouldFallbackToUpstash(k, true), false);
  // 대조: 다이제스트 본체는 guardian: 라서 복제된다(건드리지 않는다)
  assert.equal(decideReplicate(DIGEST_REDIS_KEY, 21600, true), 'replicate');
});

// ━━━ 6. API ━━━
const call = async (locale?: string) => {
  const res = await archiveRoute.GET({ url: `https://x.test/api/guardian/news-archive${locale ? `?locale=${locale}` : ''}` } as any);
  return { body: await res.json(), headers: res.headers };
};
t('GET /api/guardian/news-archive: 요청한 언어 하나만 · 최신 먼저 · 개수 · 30초 공용 캐시 · 저장본뿐(source archive)', async () => {
  reset();
  await saveToPulseArchive([item({ h: 1 }), item({ h: 3 }), item({ h: 20 }), item({ summaryKR: 'English only', h: 2 })], NOW);
  const ko = await call('ko');
  assert.equal(ko.body.source, 'archive'); assert.equal(ko.body._locale, 'ko'); assert.equal(ko.body.windowHours, 48);
  assert.equal(ko.body.items.length, 3, '한국어 요약이 없는 항목은 거른다(영어로 대체 금지)');
  assert.equal(ko.body.count, 3);
  assert.ok(ko.body.items.every((x: any) => /[가-힣]/.test(x.summary)));
  assert.ok(ko.body.items.every((x: any) => !('summaryEN' in x) && !('analysisJP' in x)), '다른 언어 칸을 보내지 않는다');
  assert.ok(ko.body.items.every((x: any) => /^[0-9a-f]{16}$/.test(x.focusKey) && !('k' in x)), '원문 키 대신 짧은 포커스 해시만 보낸다');
  assert.ok(ko.body.items[0].publishedAt >= ko.body.items[1].publishedAt);
  assert.match(ko.headers.get('cache-control'), /s-maxage=30/);
  const ja = await call('ja');
  assert.ok(ja.body.items.length === 4 && ja.body.items.every((x: any) => /[ぁ-ゟ゠-ヿ]/.test(x.summary)) === true);
  const en = await call();
  assert.equal(en.body._locale, 'en'); assert.equal(en.body.items.length, 4);
});
t('GET: 응답 상한 120 — 잘려도 count 는 전체', async () => {
  reset();
  const now = NOW;
  const rows = Array.from({ length: 150 }, (_, i) => item({ h: 0.01 * (i + 1) }));
  // 두 날 문서에 나눠 담기(하루 cap 160 안)
  await saveToPulseArchive(rows, now);
  const r = await call('en');
  assert.equal(r.body.items.length, ARCHIVE_RETURN_CAP);
  assert.equal(r.body.count, 150);
});
t('GET: 보관본이 비면 지금 다이제스트 항목으로 대신(source digest) · 둘 다 비면 empty — 빈 화면 방지', async () => {
  reset();
  store.set(DIGEST_REDIS_KEY, { items: [item({ h: 1 }), item({ h: 2, analysisKR: '', analysisEN: '', analysisJP: '' })] });
  const a = await call('ko');
  assert.equal(a.body.source, 'digest'); assert.equal(a.body.items.length, 1, '해석 없는 항목은 대신 채울 때도 뺀다');
  reset();
  const b = await call('ko');
  assert.equal(b.body.source, 'empty'); assert.deepEqual(b.body.items, []); assert.equal(b.body.count, 0);
});

// ━━━ 7. 다이제스트 배선 ━━━
t('news-digest route: 저장 직전에 보관본을 쌓는다(이번에 가진 «전부»를 넘긴다) · 개수를 다이제스트에 싣는다 · 새 AI 호출·공급사 호출을 늘리지 않는다', () => {
  const R = read('src/app/api/guardian/news-digest/route.ts');
  assert.ok(R.includes("import { saveToPulseArchive, type ArchiveCounts } from '@/lib/news/pulseArchive'"));
  assert.ok(R.includes('await saveToPulseArchive(sorted)'), '화면에 오른 10개가 아니라 정렬된 전부(sorted)를 넘긴다');
  assert.ok(R.indexOf('saveToPulseArchive(sorted)') < R.indexOf('await setInCache(REDIS_KEY, digest, ttl)'), '다이제스트 저장 전에(개수를 싣는다)');
  assert.ok(/\.\.\.\(archived \? \{ archiveCount: archived\.counts \} : \{\}\)/.test(R), '실패하면 archiveCount 만 빠진다');
  assert.equal((R.match(/callBedrock\(/g) || []).length, 1, 'AI 호출 지점은 그대로 1곳');
  // 보관 모듈·API 에는 벤더·AI·외부 호출이 없다
  for (const f of ['src/lib/news/pulseArchive.ts', 'src/app/api/guardian/news-archive/route.ts']) {
    const src = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/callBedrock|fetchMassive|massiveClient|bedrockClient|\bfetch\(|intrinio|fmpNews/i.test(src), false, `${f}: 저장본뿐`);
  }
  // 응답에 개수(archiveCount)가 실리는 타입
  assert.ok(/archiveCount\?: ArchiveCounts/.test(R));
  assert.ok(/archiveCount\?: \{ ko: number; ja: number; en: number \}/.test(read('src/hooks/useGuardianNews.ts')));
});

// ━━━ 8. 문구·날짜 묶기 ━━━
t('문구: 3개 언어 모두 · «전체 보기 · n»은 오늘 볼 것 카드와 같은 말 · n 을 모르면 숫자 없이', () => {
  for (const l of ['ko', 'ja', 'en'] as const) {
    const c = NEWS_COPY[l];
    for (const k of ['title', 'aiAria', 'back', 'backAria', 'today', 'yesterday', 'empty', 'error'] as const) assert.ok(c[k].length > 0, `${l}.${k}`);
    assert.deepEqual(Object.keys(c.categories).sort(), ['GEOPOLITICAL', 'GLOBAL', 'MACRO', 'SECTOR', 'US_MARKET']);
    assert.equal(VIEW_ALL[l](5), TODAY_UI[l].viewAll(5));
    assert.equal(VIEW_ALL[l](null), TODAY_UI[l].viewAll(5).split(' · ')[0]);
    assert.equal(VIEW_ALL[l](0), VIEW_ALL[l](undefined));
  }
  assert.deepEqual([NEWS_COPY.ko.title, NEWS_COPY.ja.title], ['뉴스 펄스', 'ニュースパルス'], '탭 이름(RealityCheck newsPulse)과 같은 말');
  assert.deepEqual(['ko', 'ja', 'en', 'fr', undefined].map((x) => toNewsLoc(x)), ['ko', 'ja', 'en', 'en', 'en']);
  // 카드의 분류 이름과 같은 말(RealityCheck CATEGORY_CONFIG)
  const RC = read('src/components/guardian/RealityCheck.tsx');
  for (const l of ['ko', 'ja', 'en'] as const) for (const lab of Object.values(NEWS_COPY[l].categories)) assert.ok(RC.includes(`${l}: '${lab}'`), `${l} ${lab}`);
});
t('날짜 묶기: 기기(한국) 시간대 오늘·어제·그 이전(M/D 요일) · 시각 24시간제 · 순서 유지', () => {
  assert.equal(localDayKey(NOW), '2026-10-13');
  const mk = (id: string, iso: string) => ({ id, publishedAt: iso });
  const rows = [
    mk('a', '2026-10-13T12:50:00Z'),   // 한국 21:50 10/13
    mk('b', '2026-10-13T00:30:00Z'),   // 한국 09:30 10/13
    mk('c', '2026-10-12T14:59:00Z'),   // 한국 23:59 10/12
    mk('d', '2026-10-11T03:00:00Z'),   // 한국 12:00 10/11 (일)
  ];
  const g = groupByLocalDay(rows, NOW, 'ko');
  assert.deepEqual(g.map((x) => [x.heading, x.items.map((i) => i.id).join('')]), [['오늘', 'ab'], ['어제', 'c'], ['10/11 일', 'd']]);
  assert.deepEqual(groupByLocalDay(rows, NOW, 'en').map((x) => x.heading), ['Today', 'Yesterday', '10/11 Sun']);
  assert.deepEqual(groupByLocalDay(rows, NOW, 'ja').map((x) => x.heading), ['今日', '昨日', '10/11 日']);
  assert.equal(clockOf('2026-10-13T12:50:00Z'), '21:50'); assert.equal(clockOf('2026-10-12T15:05:00Z'), '00:05');
  assert.equal(dayHeading('2026-10-13', NOW, 'ko'), '오늘');
  assert.deepEqual(groupByLocalDay([], NOW, 'ko'), []);
});

// ━━━ 9. 화면 소스 ━━━
const PAGE = read('src/app/[locale]/app-view/guardian/news/page.tsx');
const PAGE_CSS = read('src/app/[locale]/app-view/guardian/news/news.module.css').replace(/\/\*[\s\S]*?\*\//g, '');   // 규칙만(주석의 설명 문장은 뺀다)
const RC = read('src/components/guardian/RealityCheck.tsx');
t('전체 페이지: 저장본 읽기뿐 · 뒤로 = 앱 안 기록(없으면 Guardian 시장 현황으로 replace) · 항목별 분류·임팩트·시각·제목·✦AI 해석·출처 · 측정 news_page', () => {
  assert.ok(/hasInAppBack\(\)\) router\.back\(\);\s*else router\.replace\(`\/\$\{loc\}\/app-view\/guardian\?tab=reality`\)/.test(PAGE));
  assert.ok(PAGE.includes("trackFunnel('ai_seen', { src: 'news_page' })"));
  assert.equal(/callBedrock|fetchMassive|runPicks/.test(PAGE), false);
  for (const needle of ['it.impact', 'clockOf(it.publishedAt)', '{it.summary}', '{it.analysis}', '{it.source}', 'c.categories[it.category]', 'groupByLocalDay(items']) assert.ok(PAGE.includes(needle), needle);
  assert.ok(/<span className=\{s\.badge\} role="img" aria-label=\{c\.aiAria\}><i aria-hidden="true">✦<\/i>AI<\/span>/.test(PAGE), '«✦ AI» 배지 — 오늘 볼 것 페이지와 같은 체계');
  assert.ok(/\{it\.analysis && \(/.test(PAGE), '해석이 비면 그 줄만 안 그린다');
  assert.equal(PAGE.includes('onClick={() => router.push'), false, '항목은 눌러서 열리는 곳이 없다(기사 주소를 저장하지 않는다)');
});
t('눌림 표시 없음(대표 10/13): :active·:hover 배경·눌림 애니메이션·::after 없음 · 탭 강조 투명 · 햅틱은 앱 레이아웃 한 번(여기서 또 부르지 않는다)', () => {
  assert.equal(/:active|:hover|:focus-visible\s*\{[^}]*background/.test(PAGE_CSS), false);
  assert.ok(/-webkit-tap-highlight-color: *transparent/.test(PAGE_CSS));
  assert.equal(/::after/.test(PAGE_CSS), false);
  assert.equal(/\btransform\s*:\s*scale|animation:[^;]*(press|flash|blink)/i.test(PAGE_CSS), false);
  assert.equal(/line-clamp|text-overflow: *ellipsis/.test(PAGE_CSS), false, '글을 말줄임하지 않는다');
  assert.equal(/hapticImpact\(|capacitorBridge/.test(PAGE), false);
  const LAYOUT = read('src/app/[locale]/app-view/layout.tsx');
  assert.ok(/closest\('button, a, \[role="button"\]/.test(LAYOUT));
  // 디자인 체계 — 오늘 볼 것 페이지와 같은 머리 줄·카드 면·AI 배지 색(토큰으로 고정)
  assert.ok(PAGE_CSS.includes('linear-gradient(158deg, #141f33 0%, #0c1524 100%)') && PAGE_CSS.includes('border-radius: 20px; margin: 0 16px'), '카드 면');
  assert.ok(PAGE_CSS.includes('linear-gradient(100deg, #7c3aed 0%, #0369a1 100%)'), '«✦ AI» 배지 색');
  assert.ok(PAGE_CSS.includes('background: #070c17') && PAGE_CSS.includes('padding-bottom: 186px'), '바닥 여백(하단 내비·배너)');
  assert.ok(PAGE_CSS.includes('rgba(34, 211, 238, 0.10)') && PAGE_CSS.includes('#a9bcd6'), '뒤로 단추·라벨');
});
t('Guardian 카드: «전체 보기 · n ›» 한 줄(앱 화면에서만 · 44px · 눌림 배경 없음) → 앱 안 전용 페이지 · 돌아올 때 시장 현황 탭 유지 · 카드(점 넘김)는 그대로', () => {
  assert.ok(/const inApp = !!pathname && pathname\.includes\('\/app-view\/'\)/.test(RC));
  assert.ok(/onOpenArchive=\{inApp \? openNewsArchive : undefined\}/.test(RC), '앱 화면이 아니면 줄 자체를 그리지 않는다');
  assert.ok(/\{onOpenArchive && \(\s*<button[\s\S]*?data-testid="news-view-all"[\s\S]*?\bh-11\b[\s\S]*?VIEW_ALL\[newsLoc\]\(archiveCount\)/.test(RC));
  // 앱 화면은 `.app-viewport button { min-height: 0 !important }` — 44px 는 height(h-11)로만 선다(min-h 는 무효, 10/13 로컬 실측 17px)
  assert.ok(/\.app-viewport button \{[^}]*min-height: 0 !important/s.test(read('src/styles/app-view.css')));
  assert.equal(/news-view-all[\s\S]*?min-h-\[/.test(RC.match(/data-testid="news-view-all"[\s\S]*?<\/button>/)![0]), false);
  assert.ok(/router\.push\(`\/\$\{locale\}\/app-view\/guardian\/news`\)/.test(RC));
  assert.ok(/searchParams\.set\('tab', 'reality'\)[\s\S]*?history\.replaceState/.test(RC), '돌아오면 시장 현황 탭');
  assert.equal(RC.includes('trackFunnel('), false, "ai_tap 은 ✦AI 한 줄 → 종목 화면(평점 순간 ③) 전용 — 여기서 부르지 않는다(tests/reviewPromptMoments 가 호출 위치를 센다)");
  // 새 단추에 눌림·hover 배경 클래스 없음
  const btn = RC.match(/data-testid="news-view-all"[\s\S]*?<\/button>/)![0];
  assert.equal(/active:|hover:|focus:bg/.test(btn), false);
  // 기존 카드·탭·점 넘김은 그대로
  for (const keep of ["newsPulse: { ko: '뉴스 펄스', en: 'NEWS PULSE', ja: 'ニュースパルス' }", "macroAlerts: { ko: '매크로 경보', en: 'MACRO ALERTS', ja: 'マクロ警報' }", 'const displayItems = items.slice(0, 10);', '}, 10000);', 'Progress Dots + Navigation']) assert.ok(RC.includes(keep), keep);
});
t('UC 줄: 문구·링크(from=signum_news)는 그대로 · 앞에 UC 앱 아이콘 20px 둥근 모서리 · 줄 전체가 44px 이상 누르는 영역 · 웹 데스크톱은 예전 높이', () => {
  assert.ok(RC.includes("ucNews: { ko: '뉴스 뒤의 돈, Undercurrent에서 →', en: 'The money behind the news — Undercurrent →', ja: 'ニュースの裏のお金 — Undercurrent →' }"), '문구 3개 언어 그대로');
  assert.ok(RC.includes("openExternalUrl('https://www.signumhq.com/app-uc?from=signum_news')"), '링크·from 태그 그대로(/app-uc 가 이미 센다)');
  const uc = RC.match(/data-testid="news-uc-link"[\s\S]*?<\/button>/)![0];
  assert.ok(/src="\/app-icons\/uc-72\.png"/.test(uc) && /width=\{20\}/.test(uc) && /height=\{20\}/.test(uc) && /rounded-\[5px\]/.test(uc));
  assert.ok(/\bh-11\b/.test(uc) && /w-full/.test(uc) && /lg:h-auto/.test(uc) && !/min-h-\[/.test(uc), '높이는 h-11 — 앱 화면은 button min-height 를 0 으로 강제한다');
  assert.ok(/<span className="min-w-0 text-center">\{bt\('ucNews'\)\}<\/span>/.test(uc), '문구는 bt(ucNews) 그대로');
  assert.ok(fs.existsSync(path.join(__dirname, '../public/app-icons/uc-72.png')), 'UC 앱 아이콘 자산이 저장소에 있다');
  // /app-uc 가 from 을 센다(소스 확인)
  const UC = read('src/app/app-uc/route.ts');
  assert.ok(/recordHit\(fromTag\)/.test(UC) && /recordClick\('uc', fromTag/.test(UC));
});
t('측정: news_page 가 닫힌 목록에 있고 구독 퍼널 표에서는 빠진다(scripts/mkt-funnel.js 와 같은 목록)', () => {
  assert.ok(isFunnelSrc('news_page'));
  assert.ok((FUNNEL_SRCS as readonly string[]).includes('news_page'));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mf = require('../scripts/mkt-funnel.js');
  assert.deepEqual(mf.SRCS, [...FUNNEL_SRCS]);
  assert.ok(/NON_FUNNEL_SRCS = new Set\([^)]*'news_page'/.test(read('scripts/mkt-funnel.js')));
});

(async () => {
  for (const [name, fn] of tests) { await fn(); n++; console.log('ok -', name); }
  console.log(`\n${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
