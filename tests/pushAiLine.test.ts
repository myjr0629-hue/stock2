/**
 * 푸시 본문 «AI 한 줄» · 알림 토글 · 계측 시험 (2026-10-12, feat/push-ai-line)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/pushAiLine.test.ts
 *
 * 지키는 것:
 *  1) 본문 조립 — 운영 실제 본문(모닝 10/6 12:05Z · 마감 10/9 v3)의 첫 문장, 그 언어로, 상한 안
 *  2) 자르기 — 원문 slice 만(글자·숫자 불변) · 숫자/괄호 중간에서 자르지 않는다 · «…»
 *  3) 금지어(매수·매도·추천·목표가·예측·buy·sell·recommend·目標株価 …)·예측어 → 정적 문구
 *  4) 폴백 — 템플릿·degraded·오늘 것 아님·언어 혼입·거절문·지어낸 연도·금액 자릿수 불일치·글 없음
 *  5) 선호 — 발송이 enabled·morning·closing 을 지킨다 · 등록 POST 는 새 토큰만 기본값 true, 기존 선호·createdAt 유지
 *  6) 계측 — 퍼널 닫힌 목록에 push_open·active · 드라이런은 보내지도 쓰지도 않는다(소스 검사) · 통계 키
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  aiLineFromText, clipLine, firstSentence, bannedHit, scriptOk, foreignYear,
  morningAiLines, closingAiLines, morningBriefState, PUSH_LINE_MAX,
} from '../src/lib/push/aiLine';
import { wantsPush, mergeRegistration, mergePrefs, sanitizePrefs, parseRecord } from '../src/lib/push/prefs';
import { FUNNEL_STAGES, FUNNEL_SRCS, isFunnelStage, isFunnelSrc } from '../src/lib/app/funnelSchema';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const len = (s: string) => Array.from(s).length;
const stripEllipsis = (s: string) => s.replace(/…$/, '');

// ── 운영 실제 본문 ──
// 모닝 10/6 12:05Z(/api/guardian/briefing — tests/morningBriefSplit.test.ts 와 같은 원문의 앞 두 문장)
const MORNING = {
  ko: '화요일 개장 전 거래에서 S&P 500 선물이 7,864(+0.48%), NASDAQ 100 선물이 31,513(+0.62%)으로 소폭 상승 출발함. AI Power Grid 섹터가 +2.3% 상승을 주도하며 기술주 중심의 매수세가 나타나고 있으며, 장기 금리가 5.31%로 상승한 가운데 금값은 $4,201(+1.06%)으로 반등함.',
  en: 'Tuesday pre-market trading shows S&P 500 futures at 7,864 (+0.48%) and NASDAQ 100 futures at 31,513 (+0.62%), with AI Power Grid leading sector gains at +2.3% and Cybersecurity climbing +1.2%. Gold bounced to $4,201 (+1.06%) as long-term yields eased.',
  ja: '火曜日のプレマーケットでS&P 500先物が7,864(+0.48%)、NASDAQ 100先物が31,513(+0.62%)と小幅上昇で始まり、AI Power Grid セクターが+2.3%でリードしている。10年債利回りが5.31%に上昇する中、金は$4,201(+1.06%)に反発した。',
} as const;
// 마감 10/9 postmarket:cross-brief-v3:2026-10-09 structured.marketOverview.summary (EC2 레디스 실측 10/12)
const CLOSING_SUMMARY = {
  ko: 'S&P500 +0.59%, VIX 14.84(-3.70%)로 리스크온 확인되나, 미 10년물 5.24%·금 4,220달러 동반 상승은 인플레이션 헤지 수요를 시사한다. 원/달러 1,340.02(-0.19%)로 외국인 수급 부담은 소폭 완화.',
  en: 'S&P 500 +0.59% with VIX collapsing to 14.84 confirms risk-on, but simultaneous Gold +1.52% and US10Y +5.24% signals inflation hedge demand rather than pure growth euphoria.',
  ja: 'S&P500 +0.59%・VIX 14.84(-3.70%)でリスクオン確認も、金+1.52%と米10年債5.24%同時上昇はインフレヘッジ需要を示唆。USD/JPY 158.25で円安継続。',
};
// 모닝 저장본은 «그날» 것이어야 한다 — 시험 시각을 ET 2026-10-06 09:00 으로 고정
const NOW = new Date('2026-10-06T13:00:00Z');
const rec = (briefing: string, extra: Record<string, unknown> = {}) => ({ briefing, date: '2026-10-06', source: 'claude', generatedAt: '2026-10-06T12:05:00Z', ...extra });

(async () => {
  console.log('━━━ 1. 본문 조립(운영 실제 본문) ━━━');
  t('모닝 3개 언어 — 첫 문장 · 상한 안 · 그 언어', () => {
    const r = morningAiLines({ ko: rec(MORNING.ko), en: rec(MORNING.en), ja: rec(MORNING.ja) }, NOW);
    for (const l of ['ko', 'en', 'ja'] as const) {
      assert.equal(r[l].reason, 'ok', `${l}: ${r[l].reason}`);
      assert.ok(r[l].line && len(r[l].line!) <= PUSH_LINE_MAX[l], `${l} 길이 ${r[l].line && len(r[l].line!)}`);
      assert.ok(scriptOk(r[l].line!, l), `${l} 문자 체계`);
    }
    // ko 첫 문장은 83자 — 자르지 않고 그대로
    assert.equal(r.ko.line, '화요일 개장 전 거래에서 S&P 500 선물이 7,864(+0.48%), NASDAQ 100 선물이 31,513(+0.62%)으로 소폭 상승 출발함.');
    assert.equal(r.en.line, 'Tuesday pre-market trading shows S&P 500 futures at 7,864 (+0.48%) and NASDAQ 100 futures at 31,513 (+0.62%)…');
    assert.equal(r.ja.line, '火曜日のプレマーケットでS&P 500先物が7,864(+0.48%)、NASDAQ 100先物が31,513(+0.62%)と小幅上昇で始まり…');
  });
  t('마감 3개 언어 — marketOverview.summary 첫 문장', () => {
    const r = closingAiLines({ structured: { marketOverview: { summary: CLOSING_SUMMARY } } }, '2026-10-09', '2026-10-09', 2026);
    assert.equal(r.ko.line, 'S&P500 +0.59%, VIX 14.84(-3.70%)로 리스크온 확인되나…');
    assert.equal(r.en.line, 'S&P 500 +0.59% with VIX collapsing to 14.84 confirms risk-on…');
    assert.equal(r.ja.line, 'S&P500 +0.59%・VIX 14.84(-3.70%)でリスクオン確認も、金+1.52%と米10年債5.24%同時上昇はインフレヘッジ需要を示唆。');
  });
  t('숫자는 원문 그대로 — 본문에 나온 숫자는 전부 원문에 있다(새 숫자 0)', () => {
    const nums = (s: string) => s.match(/[+\-]?\$?\d[\d,]*(?:\.\d+)?%?/g) || [];
    const m = morningAiLines({ ko: rec(MORNING.ko), en: rec(MORNING.en), ja: rec(MORNING.ja) }, NOW);
    const c = closingAiLines({ structured: { marketOverview: { summary: CLOSING_SUMMARY } } }, '2026-10-09', '2026-10-09', 2026);
    for (const l of ['ko', 'en', 'ja'] as const) {
      for (const x of nums(m[l].line!)) assert.ok(MORNING[l].includes(x), `모닝 ${l}: ${x}`);
      for (const x of nums(c[l].line!)) assert.ok(CLOSING_SUMMARY[l].includes(x), `마감 ${l}: ${x}`);
    }
  });
  t('금융 공통어(GEX·VIX·P/C·Max Pain)는 원문 그대로 남는다', () => {
    const s = 'VIX 15.32, GEX -24, P/C 0.84, Max Pain $180 기준으로 변동성 압축 상태가 관찰됨.';
    const r = aiLineFromText(s, { locale: 'ko', currentYear: 2026 });
    assert.equal(r.line, s);
  });

  console.log('━━━ 2. 자르기 ━━━');
  t('원문의 앞부분 slice + «…» · 상한 이하', () => {
    for (const [l, s] of [['ko', CLOSING_SUMMARY.ko], ['en', CLOSING_SUMMARY.en], ['en', MORNING.en], ['ja', MORNING.ja]] as const) {
      const first = firstSentence(s)!;
      const c = clipLine(first, PUSH_LINE_MAX[l]);
      assert.ok(len(c) <= PUSH_LINE_MAX[l], `${l} ${len(c)}`);
      if (len(first) > PUSH_LINE_MAX[l]) {
        assert.ok(c.endsWith('…'));
        assert.ok(first.startsWith(stripEllipsis(c)), `${l}: 원문 앞부분이어야 한다 — ${c}`);
      } else assert.equal(c, first);
    }
  });
  t('숫자·괄호 중간에서 자르지 않는다', () => {
    const s = 'Index at 1,234.56 (+0.12%) while ' + 'breadth widened across sectors and '.repeat(4) + 'yields held 5.24% (unchanged).';
    for (const max of [30, 40, 50, 60, 70, 80, 90, 100, 110]) {
      const c = stripEllipsis(clipLine(s, max));
      assert.equal((c.match(/\(/g) || []).length, (c.match(/\)/g) || []).length, `max ${max}: 괄호 짝 — ${c}`);
      assert.ok(!/\d[.,]$|[+\-$]$/.test(c), `max ${max}: 숫자 중간 — ${c}`);
      assert.ok(s.startsWith(c), `max ${max}: slice`);
    }
  });
  t('공백 없는 긴 일본어 — 숫자 밖에서 자른다', () => {
    const s = 'テスト' + 'あ'.repeat(80) + '12.34%上昇' + 'い'.repeat(40);
    const c = clipLine(s, 90);
    assert.ok(len(c) <= 90);
    assert.ok(!/\d$/.test(stripEllipsis(c)));
  });
  t('영어 끝에 기능어가 매달리지 않는다', () => {
    const s = 'Markets opened mixed as traders weighed the latest inflation print and the path of rates with caution today across all sectors.';
    const c = clipLine(s, 60);
    assert.ok(!/\b(and|the|of|with)…$/.test(c), c);
  });

  console.log('━━━ 3. 금지어·예측어 → 정적 문구 ━━━');
  t('금지어 목록', () => {
    for (const w of ['매수세가 유입', '매도 압력', '추천 종목', '목표가 상향', '목표 주가', '예측된다', 'analysts recommend', 'buy the dip', 'sell signal', 'price target raised', '目標株価', '買い推奨', '予測']) {
      assert.ok(bannedHit(w), w);
    }
    for (const w of ['S&P 500 +0.59%', 'VIX 14.84', '사라졌다', 'buyback', 'GEX -24', 'Max Pain $180']) assert.equal(bannedHit(w), null, w);
  });
  t('첫 문장에 금지어 → line=null (reason banned:…)', () => {
    const r = aiLineFromText('기술주 중심의 매수세가 나타나며 S&P 500 선물이 +0.48% 상승함. 둘째 문장.', { locale: 'ko', currentYear: 2026 });
    assert.equal(r.line, null);
    assert.ok(r.reason.startsWith('banned:'), r.reason);
    const e = aiLineFromText('Analysts recommend adding exposure as futures rise 0.5%. Second.', { locale: 'en', currentYear: 2026 });
    assert.equal(e.line, null);
    const j = aiLineFromText('アナリストは目標株価を引き上げ、先物は0.5%上昇した。次。', { locale: 'ja', currentYear: 2026 });
    assert.equal(j.line, null);
  });
  t('예측어(trustLayer) → line=null', () => {
    const r = aiLineFromText('Futures are up 0.4% and the index will likely rally into the close today. Next.', { locale: 'en', currentYear: 2026 });
    assert.equal(r.line, null);
    assert.ok(r.reason.startsWith('forecast:'), r.reason);
    const k = aiLineFromText('VIX 하락으로 반등이 예상된다는 관측이 나오며 선물이 0.4% 오름. 다음.', { locale: 'ko', currentYear: 2026 });
    assert.equal(k.line, null);
  });

  console.log('━━━ 4. 폴백 ━━━');
  t('템플릿·degraded·오늘 것 아님·글 없음 → 해당 로케일만 정적', () => {
    const r = morningAiLines({
      ko: rec(MORNING.ko, { source: 'template' }),
      en: rec(MORNING.en, { degraded: true }),
      ja: rec(MORNING.ja, { date: '2026-10-05' }),
    }, NOW);
    assert.deepEqual([r.ko.line, r.en.line, r.ja.line], [null, null, null]);
    assert.deepEqual([r.ko.reason, r.en.reason, r.ja.reason], ['template', 'template', 'not-today']);
    const none = morningAiLines({}, NOW);
    assert.equal(none.ko.reason, 'no-text');
    assert.equal(morningBriefState(rec(MORNING.ko, { date: '10/6/2026' }), '2026-10-06', '10/6/2026'), 'ok', '생성기의 en-US 날짜 형식도 오늘');
  });
  t('마감: 다른 날 브리프·구조 없음 → 정적', () => {
    const r = closingAiLines({ structured: { marketOverview: { summary: CLOSING_SUMMARY } } }, '2026-10-09', '2026-10-12', 2026);
    assert.equal(r.ko.reason, 'not-today');
    const e = closingAiLines(null, null, '2026-10-12', 2026);
    assert.equal(e.en.reason, 'no-text');
  });
  t('언어 혼입 → 정적 (en 칸에 한글 · ko 칸에 영어만 · ja 칸에 한글)', () => {
    assert.equal(aiLineFromText('S&P 500 선물이 0.48% 상승하며 출발했습니다. 다음.', { locale: 'en', currentYear: 2026 }).reason, 'script');
    assert.equal(aiLineFromText('S&P 500 futures rose 0.48% in early trading today. Next.', { locale: 'ko', currentYear: 2026 }).reason, 'script');
    assert.equal(aiLineFromText('S&P500先物が0.48%上昇 선물 상승했습니다. 次.', { locale: 'ja', currentYear: 2026 }).reason, 'script');
  });
  t('거절문 → 정적', () => {
    assert.equal(aiLineFromText("I can't provide that analysis for today's market session. Sorry.", { locale: 'en', currentYear: 2026 }).reason, 'refusal');
    assert.equal(aiLineFromText('죄송하지만 오늘 시장 분석을 제공할 수 없습니다. 다음.', { locale: 'ko', currentYear: 2026 }).reason, 'refusal');
  });
  t('지어낸 연도 → 정적 · 올해·Russell 2000 은 통과', () => {
    assert.equal(foreignYear('2025년 1월 10일 기준 선물 상승', 2026), '2025');
    assert.equal(foreignYear('Russell 2000 +1.2% · 러셀 2000 · 2026年', 2026), null);
    assert.equal(foreignYear('S&P 500 7,864 · 31,513 · $4,220 · 1,340.02', 2026), null);
    assert.ok(aiLineFromText('2025년 1월 10일 기준 S&P 500 선물이 0.4% 상승함. 다음.', { locale: 'ko', currentYear: 2026 }).reason.startsWith('year:'));
  });
  t('금액 자릿수 불일치(영어판 대조) → 정적 · 영어판이 없으면 금액 문장은 내보내지 않는다', () => {
    const en = 'Tesla secured a $20.0 billion credit line while futures rose 0.3%. Next.';
    assert.equal(aiLineFromText('테슬라가 $20억 신용 한도를 확보하며 선물이 0.3% 상승함. 다음.', { locale: 'ko', englishSource: en, currentYear: 2026 }).reason, 'amount');
    assert.equal(aiLineFromText('테슬라가 200억 달러 신용 한도를 확보하며 선물이 0.3% 상승함. 다음.', { locale: 'ko', englishSource: en, currentYear: 2026 }).reason, 'ok');
    assert.equal(aiLineFromText('테슬라가 200억 달러 신용 한도를 확보하며 선물이 0.3% 상승함. 다음.', { locale: 'ko', currentYear: 2026 }).reason, 'amount');
  });
  t('머리 마크다운·레이블은 걷고 짧은 제목줄은 건너뛴다', () => {
    assert.equal(firstSentence('## 모닝\n**S&P 500 선물이 7,864(+0.48%)로 상승 출발함.** 다음 문장.'), 'S&P 500 선물이 7,864(+0.48%)로 상승 출발함.');
    assert.equal(firstSentence('[현황] VIX 15.32 로 변동성 압축 상태가 이어짐. 다음.'), 'VIX 15.32 로 변동성 압축 상태가 이어짐.');
  });

  console.log('━━━ 5. 알림 선호 ━━━');
  t('발송 판정 — 마스터·종류별 토글을 지킨다, 값 없으면 받는다', () => {
    assert.equal(wantsPush(null, 'morning'), true);
    assert.equal(wantsPush({}, 'closing'), true);
    assert.equal(wantsPush({ preferences: { morning: true, closing: true } }, 'morning'), true);
    assert.equal(wantsPush({ preferences: { morning: false, closing: true } }, 'morning'), false);
    assert.equal(wantsPush({ preferences: { morning: false, closing: true } }, 'closing'), true);
    assert.equal(wantsPush({ preferences: { enabled: false, morning: true, closing: true } }, 'morning'), false);
    assert.equal(wantsPush({ preferences: { enabled: false, morning: true, closing: true } }, 'closing'), false);
  });
  t('등록 POST — 새 토큰만 기본값 true', () => {
    const r = mergeRegistration(null, { token: 'abc', platform: 'ios', locale: 'ko', app: 'signum' }, '2026-10-12T12:00:00.000Z');
    assert.deepEqual(r.preferences, { enabled: true, morning: true, closing: true });
    assert.equal(r.createdAt, '2026-10-12T12:00:00.000Z');
    assert.equal(r.firstSeenAt, '2026-10-12T12:00:00.000Z');
    assert.equal(r.lastSeenAt, '2026-10-12T12:00:00.000Z');
  });
  t('등록 POST — 기존 선호·createdAt 을 덮어쓰지 않는다(옛 결함: 실행마다 {morning:true, closing:true})', () => {
    const prev = { token: 'abc', platform: 'ios', locale: 'ja', app: 'signum' as const, createdAt: '2026-09-01T00:00:00.000Z', preferences: { enabled: true, morning: false, closing: true } };
    const r = mergeRegistration(prev, { token: 'abc', platform: 'ios', locale: 'ja', app: 'signum' }, '2026-10-12T12:00:00.000Z');
    assert.deepEqual(r.preferences, { enabled: true, morning: false, closing: true });
    assert.equal(r.createdAt, '2026-09-01T00:00:00.000Z');
    assert.equal(r.firstSeenAt, undefined, '옛 레코드는 신규로 세지 않는다');
    assert.equal(r.lastSeenAt, '2026-10-12T12:00:00.000Z');
    // 언어만 바꾼 재등록(설정 › 언어) — 선호 유지, 언어 갱신
    const k = mergeRegistration(prev, { token: 'abc', locale: 'ko', app: 'signum' }, '2026-10-12T12:01:00.000Z');
    assert.equal(k.locale, 'ko');
    assert.equal(k.platform, 'ios');
    assert.deepEqual(k.preferences, { enabled: true, morning: false, closing: true });
  });
  t('등록 POST — 기기가 저장된 선호를 보내면 그 값으로(마스터 끔 포함) · 이상한 값은 무시', () => {
    const prev = { token: 'abc', platform: 'android', locale: 'ko', app: 'signum' as const, createdAt: '2026-09-01T00:00:00.000Z', preferences: { morning: true, closing: true } };
    const r = mergeRegistration(prev, { token: 'abc', app: 'signum', preferences: { enabled: false, morning: true, closing: true } }, '2026-10-12T12:00:00.000Z');
    assert.equal(r.preferences!.enabled, false);
    assert.equal(wantsPush(r, 'morning'), false);
    const bad = mergeRegistration(prev, { token: 'abc', app: 'signum', preferences: { enabled: 'no', morning: 0 } }, '2026-10-12T12:00:00.000Z');
    assert.deepEqual(bad.preferences, { enabled: true, morning: true, closing: true });
    assert.equal(sanitizePrefs('x'), null);
    assert.deepEqual(mergePrefs({ morning: false }, { closing: false }), { enabled: true, morning: false, closing: false });
    assert.deepEqual(parseRecord('{"a":1}'), { a: 1 });
    assert.equal(parseRecord('not json'), null);
  });

  console.log('━━━ 6. 계측·드라이런 ━━━');
  t('퍼널 닫힌 목록 — push_open·active · push_morning·push_closing·app', () => {
    for (const st of ['push_open', 'active']) assert.ok(isFunnelStage(st) && (FUNNEL_STAGES as readonly string[]).includes(st), st);
    for (const s of ['push_morning', 'push_closing', 'app']) assert.ok(isFunnelSrc(s) && (FUNNEL_SRCS as readonly string[]).includes(s), s);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mf = require('../scripts/mkt-funnel.js');
    assert.deepEqual(mf.STAGES, [...FUNNEL_STAGES]);
    assert.deepEqual(mf.SRCS, [...FUNNEL_SRCS]);
  });
  const ROUTE = fs.readFileSync(path.join(__dirname, '../src/app/api/cron/push/route.ts'), 'utf8');
  t('드라이런 블록은 보내지도(sendPushByType) 쓰지도(setInCache) 않고 먼저 돌아간다', () => {
    const a = ROUTE.indexOf('if (dry) {');
    const b = ROUTE.indexOf('return NextResponse.json({ ok: true, dry: true', a);
    assert.ok(a > 0 && b > a);
    const block = ROUTE.slice(a, b);
    assert.equal(/sendPushByType|setInCache|writeStats/.test(block), false);
    assert.ok(a < ROUTE.indexOf('await sendPushByType(type, { bodies })'), '실제 발송보다 앞');
    assert.ok(/searchParams\.get\('test'\) === '1' && searchParams\.get\('dry'\) !== '1'/.test(ROUTE), '?test=1&dry=1 은 보내지 않는다');
  });
  t('제목은 그대로 — 본문만 바꾼다(PUSH_CONTENT 제목 불변)', () => {
    const SEND = fs.readFileSync(path.join(__dirname, '../src/lib/push/send.ts'), 'utf8');
    for (const title of ["'🌅 모닝 브리프'", '\'🌅 Morning Brief\'', "'🌅 モーニングブリーフ'", "'📊 장마감 리포트'", "'📊 Closing Report'", "'📊 クロージングレポート'"]) {
      assert.ok(SEND.includes(`title: ${title}`), title);
    }
    assert.ok(/return typeof body === 'string' && body\.trim\(\) \? \{ title: base\.title, body \} : base;/.test(SEND));
    assert.ok(/if \(!wantsPush\(data, type\)\)/.test(SEND), '발송 계획이 선호를 지킨다');
  });
  t('푸시 탭·하루 활성 비콘은 부작용 없는 funnelBeacon 으로 — «내 종목» 시트 전송기를 새로 꽂지 않는다', () => {
    const LAYOUT = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/layout.tsx'), 'utf8');
    assert.equal(LAYOUT.includes("import('@/lib/app/funnel')"), false);
    assert.ok(LAYOUT.includes("trackFunnel('push_open'") && LAYOUT.includes("trackFunnel('active', { src: 'app' })"));
    const BEACON = fs.readFileSync(path.join(__dirname, '../src/lib/app/funnelBeacon.ts'), 'utf8');
    assert.equal(/setWatchlistAnalyticsTransport\(/.test(BEACON), false);
    assert.ok(/plat === 'android' && !FUNNEL_SEND_ANDROID/.test(BEACON), '안드로이드 앱 제외 규칙 유지');
  });
  t('통계 키 = push:stats:{type}:{ET날짜} · 60일', () => {
    assert.ok(ROUTE.includes('`push:stats:${type}:${day}`'));
    assert.ok(ROUTE.includes('60 * 60 * 24 * 60'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mp = require('../scripts/mkt-push.js');
    assert.deepEqual(mp.TYPES, ['morning', 'closing']);
  });

  console.log(`\n${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
