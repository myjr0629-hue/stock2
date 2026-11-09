// ★2026-11-10 대표 «지표 설명은 있는데 왜? 라는 것의 스토리가 부족하다» — 11/9 나스닥 +2.6% 급등일 운영 글이
//   «FedWatch 78% → 공포·탐욕 31 → "위험 회피 속 쏠림"» 지표 나열이었다(급등일에 위험 회피를 원인처럼). 원인: WHY 모양 예시가 «위험 회피가 짙어져 … 쏠림» 고정 서사.
// 계약: WHY 한 문장 = (a) 재료(보도) → (b) 시장의 해석 → (c) 지표가 그 해석을 뒷받침/반박 · 지수 방향과 모순 금지 · 재료 미확인이면 정직하게 + 흐름으로 이유.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTacticalPrompt, checkTacticalOutput } from '@/lib/ai/tacticalPrompt';

let failed = 0;
const test = (name: string, fn: () => void) => { try { fn(); console.log('ok -', name); } catch (e) { failed++; console.error('FAIL -', name, e); } };
const { context } = JSON.parse(readFileSync('tests/fixtures/tactical-story/post-1030.json', 'utf8'));

// 11/9(월) 12:32 ET 장중 실입력(운영 라우트 가로채기, signum-work/2026-11-10/tactical-gpt/raw/inputs.json)의 재료 — 급등일 REG
const RALLY_NEWS = [
    '[NEWS PULSE; 2026-11-09T17:14:03.000Z; 12:14 ET] US stocks rally and recover more of last week\'s losses as oil prices swing lower',
    '[NEWS PULSE; 2026-11-09T17:04:55.000Z; 12:04 ET] Dow rallies 1,000 points, Nasdaq jumps 2% as stocks climb out of postelection slump',
];
const RALLY_FACTS = [
    { id: 'nasdaq', kind: 'spot', name: { ko: '나스닥 종합(현물)', en: 'Nasdaq Composite (cash)', ja: 'ナスダック総合(現物)' }, basis: { ko: '2026-11-09 정규장: 전 거래일 종가 대비', en: '2026-11-09 regular session vs previous close', ja: '2026-11-09 通常取引: 前営業日終値比' }, chgPct: 2.65, asOfET: '2026-11-09 12:31 ET', sessionDate: '2026-11-09' },
    { id: 'spx', kind: 'spot', name: { ko: 'S&P500(현물)', en: 'S&P 500 (cash)', ja: 'S&P500(現物)' }, basis: { ko: '2026-11-09 정규장: 전 거래일 종가 대비', en: '2026-11-09 regular session vs previous close', ja: '2026-11-09 通常取引: 前営業日終値比' }, chgPct: 2.32, asOfET: '2026-11-09 12:31 ET', sessionDate: '2026-11-09' },
];
const RALLY_DRIVERS = { fedwatch: { nextFomcHikePct: 78, nextFomcHoldPct: 22, nextFomcCutPct: 0 }, us10y: { levelPct: 4.88, changeBp: 3 }, us2y: { levelPct: 4.51 }, fearGreed: { score: 32, zone: 'fear' } };
const rally = (loc: 'ko' | 'en' | 'ja', over: Record<string, unknown> = {}) => buildTacticalPrompt({
    ...context, asOf: '2026-11-09T17:32:33.979Z', session: 'REG', marketNewsHeadlines: RALLY_NEWS, indexFacts: RALLY_FACTS, macroDrivers: RALLY_DRIVERS, ...over,
}, loc);
const whyBlock = (p: string) => p.slice(p.indexOf('2. WHY'), p.indexOf('3. SO WHAT'));

test('① 급등일 REG 프롬프트 — WHY 지시가 재료 → 해석 → 지표 확인/반박 순서(3개 언어 모두)', () => {
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const w = whyBlock(rally(loc));
        assert.match(w, /WHY \(ONE sentence — the heart of the story\)/);
        const a = w.indexOf('(a) TRIGGER'), b = w.indexOf('(b) READING'), c = w.indexOf('(c) CHECK');
        assert.ok(a > 0 && a < b && b < c, `${loc}: TRIGGER < READING < CHECK (${a},${b},${c})`);
        assert.match(w, /all inside that ONE sentence/, '세 고리를 한 문장 안에 — 나누면 WHY 지표 검사(why-drivers-required)가 떨어진다(Haiku 실측 8/9 탈락)');
        assert.match(w, /CONFIRM that reading/); assert.match(w, /CONTRADICT it/);
        assert.match(w, /Indicators are evidence inside the chain — never its subject, its opening or a list/);
        // 급등/급락 방향과 모순 금지
        assert.match(w, /DIRECTION: the chain must agree with the sign of INDEX_FACTS/);
        assert.match(w, /on a rising day never present fear, risk aversion or tightening worries as what drove the rise/);
        assert.match(w, /a fear reading on a rising day means sentiment has not caught up with prices/);
        // 재료 미확인 — 정직하게 + 흐름으로 이유(시각·날짜 없이)
        assert.match(w, /If no TODAY_NEWS report explains today's direction, open with/);
        // 기존 계약 유지(지어낸 변화·확률 표현·보도 인용)
        assert.match(w, /ONLY when TODAY_NEWS is empty AND MACRO_DRIVERS is null/);
        assert.match(w, /ONLY if hikePctOneWeekAgo is supplied/);
        assert.match(w, /cite it once with BOTH its date and its time exactly as one REPORT_TIMES entry gives them/);
    }
});

test('② 모양 예시(FORMAT ONLY)도 같은 순서 — 보도 인용 → 해석 → 지표 · 옛 «위험 회피 속 쏠림» 고정 서사 제거', () => {
    const order: Record<'ko' | 'en' | 'ja', [RegExp, RegExp, RegExp]> = {
        ko: [/HH:MM ET 보도를 배경으로/, /받아들이는 모습/, /이 이를 뒷받침하지만/],
        en: [/HH:MM ET report on/, /the market is reading it as/, /backs that up, while/],
        ja: [/HH:MM ET の報道を背景に/, /と受け止めており/, /がそれを裏付ける一方/],
    };
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const w = whyBlock(rally(loc));
        const shape = w.slice(w.indexOf('Shape (FORMAT ONLY'));
        const idx = order[loc].map((re) => shape.search(re));
        assert.ok(idx.every((i) => i > 0) && idx[0] < idx[1] && idx[1] < idx[2], `${loc} shape order ${idx}`);
        assert.doesNotMatch(w, /위험 회피가 짙어져|money hid in|リスク回避が深まる中/);
    }
    // 재료가 입력에 있다 — 급등 원인 보도가 TODAY_NEWS 에 실린다(REG = 오늘 기사)
    const news = rally('ko').match(/^TODAY_NEWS: .*$/m)![0];
    assert.match(news, /postelection slump/); assert.match(news, /oil prices swing lower/);
});

test('③ 실모델 표본(11/9 장중, terra) — 재료→해석→지표 반박 한 문장이 운영 생성 검사를 통과 · 세 고리를 두 문장으로 나누면 검사가 막는다(검사는 그대로, 바뀐 건 지시)', () => {
    const p = rally('ko');
    const FIRST = '지금 정규장에서 나스닥 종합은 전 거래일 종가 대비 2.6%, S&P 500은 2.3% 상승 중입니다.';
    const story = '유가가 하락하는 가운데 미국 주식이 지난주 낙폭을 더 회복했다는 11/9(월) 12:14 ET 보도와 맞물려 시장은 유가 부담 완화에 안도하는 모습이지만, 공포·탐욕 지수 32는 공포 구간으로 심리가 가격을 아직 따라오지 못했음을 보여 줍니다.';
    const SO = '반등을 받칠 힘은 취약한데, 시장 건강도(RLSI 30.8)가 약하고 옵션 포지션(GEX +8)은 중립이라 흔들림을 완충하지도 증폭하지도 않습니다.';
    const NEXT = '다음 분기점은 S&P 500 옵션 지지선 6680으로, 아래에서는 딜러 헤지가 흔들림을 키우고 위에서는 완충합니다.';
    const r = checkTacticalOutput([FIRST, story, SO, NEXT].join(' '), 'ko', p).filter((x) => /why|cause|material|news-source|driver|four-sentences/.test(x));
    assert.deepEqual(r, [], r.join(','));
    // 표본 문장 안의 순서: 보도 인용 → 해석(안도) → 지표(공포·탐욕)
    const i = [story.indexOf('ET 보도'), story.indexOf('안도'), story.indexOf('공포·탐욕')];
    assert.ok(i[0] < i[1] && i[1] < i[2], String(i));
    // 세 고리를 두 문장으로 나누면 검사가 막는다(WHY 문장에 지표 숫자가 없다) — 프롬프트가 «한 문장 안»을 요구하는 이유
    const split = ['11/9(월) 12:14 ET 보도는 유가 하락 속 증시 반등을 전했고, 시장은 이를 안도 반등으로 받아들이는 모습입니다.', '다만 공포·탐욕 지수 32는 공포 구간에 머물러 심리가 아직 가격을 따라오지 못했음을 보여 줍니다.'];
    assert.ok(checkTacticalOutput([FIRST, ...split, SO, NEXT].join(' '), 'ko', p).includes('tactical:why-drivers-required'));
});

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('통과 tacticalStory1110');
