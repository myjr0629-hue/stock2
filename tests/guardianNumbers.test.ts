/**
 * 가디언 AI 문구 «글 속 시장 숫자 = 같은 화면 숫자» — src/lib/ai/guardianNumbers.ts · intelligenceNode 출구(repairVerdictTexts)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/guardianNumbers.test.ts
 *
 * 출발점(2026-10-04 운영 실측, 주말 값 고정): /api/debug/guardian 화면 값 나스닥 +0.98%·금 -0.95%·유가 -1.90%·RLSI 37.9 인데
 *   ko TACTICAL «나스닥 +0.94%·금 -0.72%·유가 -1.73%», ko·ja «RLSI 41점», en «RLSI 37» — 12행 중 4행 불일치.
 */
import assert from 'node:assert/strict';
import {
    checkGuardianLiterals, fillGuardianTokens, formatGNum, guardianNumbersGate, guardianNumsFromAiContext, guardianNumsFromMarket,
    guardianTokenRules, tokenizeGuardianLiterals,
} from '@/lib/ai/guardianNumbers';
import { cleanInsight } from '@/lib/ai/outputGate';
import { IntelligenceNode, _resetInsightStateForTest } from '@/services/guardian/intelligenceNode';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

// 운영 응답 data.market (10/4 08:5x KST 읽기) — 화면 값
const MARKET = {
    nqChangePercent: 0.9793403878350482, vix: 15.31, us10y: 5.28, dxy: 101.924,
    factors: {
        nasdaq100: { level: 31061.75, chgPct: 0.9793403878350482 }, vix: { level: 15.31 }, us10y: { level: 5.28, chgPct: 0.7634 },
        dxy: { level: 101.924 }, spx: { level: 7777.25, chgPct: 0.6894096323148627 }, gold: { level: 4162.3, chgPct: -0.9518596958808271 },
        oil: { level: 91.11, chgPct: -1.8951222138473187 },
    },
};
const NUMS = guardianNumsFromMarket(MARKET, 37.9);

// 운영에 실제로 나가던 글(ai_verdict 저장본)
const KO_DESC = '[현황] 나스닥 +0.94% 상승으로 기술주, 반도체, 사이버보안 섹터에 5일 누적 자금 유입이 지속되는 가운데, 헬스케어와 필수소비재에서는 동기간 자금이 빠져나가고 있다. 달러 강세(101.9), 금 약세(-0.72%), 유가 하락(-1.73%)이 맞물려 안전자산 선호에서 위험자산 선호로의 전환이 진행 중이다.\n[해석] 기관 수급(IFS)에서 기술주(XLK +28), 반도체(SMH +27), 사이버보안(HACK +20) 모두 강한 양수 신호를 보이고 있다.\n[전망] S&P 500이 옵션 저항선(7,850)과 지지선(7,450) 사이에서 움직이고 있으며, GEX -6(중립)과 스퀴즈 리스크 28%(중간)는 박스권 지속을 시사한다.';
const KO_REALITY = '약한 고용 지표가 금리 상승 압박을 완화하지 못한 가운데 미국 10년물 금리가 5.28%로 상승하며 성장주 밸류에이션 압박이 지속되고 있고, 이에 따라 나스닥은 소폭 상승했으나 금과 채권은 동반 약세를 기록했다. RLSI 41점의 취약한 시장 건강도와 GEX -6의 약한 감마 방어력은 좁은 기반 위에서 지수가 움직이고 있음을 시사하며, 실질금리 2.91%의 긴축적 환경이 성장주 압박을 지속하는 구조다.';
const EN_REALITY = "Index is rising but internal liquidity contradicts the surface strength: NASDAQ +0.94% and S&P 500 +0.68% mask RLSI at 37 points, signaling weak underlying capital participation below the 40-point threshold. The rally appears concentrated in large-cap names, evidenced by Fear and Greed at 31 and gold's -0.72% decline alongside rising Treasury yields at 5.28%.";
const JA_REALITY = '本日の市場は弱い雇用統計を受けた債券利回りの上昇が主導し、S&P 500が+0.68%で引けた一方、金が-0.72%、原油が-1.73%と下落した。米10年債が5.28%まで上昇し、ドル指数が101.9で堅調を保つ中、恐怖貪欲指数が31(fear)に留まる。RLSI 41点とRVOLの測定不可は市場の方向感の曖昧さを示唆し、債券利回りが5.30%を超えて上昇し続けるかが変数だ。';
const KO_GAMMA = '[평소와 다른 점] 딜러 감마가 최근 41거래일 중 상위 44% 수준으로 올라 있는데 GEX는 중립을 유지하고 있다.\n[이 판단이 깨지는 지점] 7,850을 넘으면 콜월이 무너지면서 같은 딜러가 반대로 팔기 시작하는 구간으로 바뀐다.';

(async () => {
    await t('화면 값 = market 필드(나스닥·S&P·금·유가·VIX·DXY·10년물·RLSI)', () => {
        assert.deepEqual(Object.keys(NUMS).sort(), ['DXY', 'GOLD_CHG', 'NDX_CHG', 'OIL_CHG', 'RLSI', 'SPX_CHG', 'US10Y', 'VIX']);
        assert.equal(formatGNum('NDX_CHG', NUMS.NDX_CHG!), '+0.98%');
        assert.equal(formatGNum('GOLD_CHG', NUMS.GOLD_CHG!), '-0.95%');
        assert.equal(formatGNum('RLSI', 37.9), '38');
        assert.equal(formatGNum('US10Y', 5.28), '5.28%');
        // 생성 재료(IntelligenceContext)도 같은 값으로 읽힌다
        const ai = guardianNumsFromAiContext({ nasdaqChange: MARKET.nqChangePercent, spxChangePct: 0.6894, goldChangePct: -0.95, oilChangePct: -1.9, vix: 15.31, dxy: 101.924, us10y: 5.28, rlsiScore: 37.9 });
        assert.equal(formatGNum('NDX_CHG', ai.NDX_CHG!), '+0.98%');
    });

    await t('운영 ko TACTICAL — 나스닥·금·유가 세 숫자가 걸린다(달러 101.9·옵션 가격대·GEX·스퀴즈 %는 통과)', () => {
        const bad = checkGuardianLiterals(KO_DESC, NUMS);
        assert.deepEqual(bad.map((b) => b.split(':')[1]).sort(), ['GOLD_CHG', 'NDX_CHG', 'OIL_CHG'], bad.join(' | '));
    });
    await t('운영 ko·ja «RLSI 41점»은 걸리고, 10년물 5.28%·달러 101.9·S&P +0.68%(실제 0.689)·문턱 «5.30%を超えて»는 통과', () => {
        assert.deepEqual(checkGuardianLiterals(KO_REALITY, NUMS), ['literal:RLSI:41≠38']);
        const ja = checkGuardianLiterals(JA_REALITY, NUMS).map((b) => b.split(':')[1]).sort();
        assert.deepEqual(ja, ['GOLD_CHG', 'OIL_CHG', 'RLSI']);
    });
    await t('운영 en — «RLSI at 37»(실제 37.9, ±1)은 통과, 나스닥 +0.94%·금 -0.72% 는 걸린다', () => {
        const bad = checkGuardianLiterals(EN_REALITY, NUMS).map((b) => b.split(':')[1]).sort();
        assert.deepEqual(bad, ['GOLD_CHG', 'NDX_CHG']);
    });
    await t('숫자 지표가 없는 감마 글(41거래일·44%·7,850)은 통과', () => {
        assert.deepEqual(checkGuardianLiterals(KO_GAMMA, NUMS), []);
    });

    await t('반올림 표기 허용 — «약 1%»·«1.0%»·«0.98%»·«RLSI 38»·«37.9» / 틀린 반올림 «0.9%»·틀린 방향은 걸린다', () => {
        for (const ok of ['나스닥은 약 1% 상승했다.', '나스닥 1.0% 상승', 'Nasdaq rose 0.98% on the day', '나스닥 +0.97% 상승', 'RLSI 38점', 'RLSI 37.9', 'VIX 15.3 수준', 'VIX 15', '미국 10년물 5.3%']) {
            assert.deepEqual(checkGuardianLiterals(ok, NUMS), [], ok);
        }
        for (const bad of ['나스닥 0.9% 상승', '나스닥 0.98% 하락', 'NASDAQ -0.98%', 'RLSI 40점', 'VIX 17.2', '금 -0.72%']) {
            assert.equal(checkGuardianLiterals(bad, NUMS).length, 1, bad);
        }
    });
    await t('문턱·가정 문장과 다른 낱말은 대조하지 않는다(금리·자금·지금, «RLSI가 45점을 넘으면», «VIX rises above 20»)', () => {
        for (const s of ['RLSI가 45점을 넘으면 구조가 바뀐다', 'VIX가 20을 넘으면', 'if VIX rises above 20', '금리가 5.28%로 올랐다', '자금 유입 +2.1%', '지금 섹터 +3.2%', '나스닥은 상승했고, 금은 -0.95% 내렸다', '나스닥 5일 누적 +2.1%']) {
            assert.deepEqual(checkGuardianLiterals(s, NUMS), [], s);
        }
    });

    await t('자리표 채움 — 화면 표기 그대로, «{NDX_CHG}%» 겹 % 없음, 모르는·값 없는 자리표는 실패', () => {
        const f = fillGuardianTokens('[현황] 나스닥 {NDX_CHG} 상승, 금 {GOLD_CHG}%, RLSI {RLSI}점, 10년물 {US10Y}', NUMS);
        assert.ok(f.ok, f.reasons.join(','));
        assert.equal(f.text, '[현황] 나스닥 +0.98% 상승, 금 -0.95%, RLSI 38점, 10년물 5.28%');
        assert.ok(!fillGuardianTokens('나스닥 {FOO}', NUMS).ok);
        assert.ok(!fillGuardianTokens('S&P {SPX_CHG}', { NDX_CHG: 1 }).ok);
    });
    await t('낡은 서술 — 생성 때 +0.30% → 지금 -0.40%(방향 반대)·RLSI 47(중립) → 38(취약)이면 실패, +0.94 → +0.98 은 통과', () => {
        assert.ok(!fillGuardianTokens('나스닥 {NDX_CHG} 상승', { NDX_CHG: -0.4 }, { NDX_CHG: 0.3 }).ok);
        assert.ok(!fillGuardianTokens('RLSI {RLSI}점', { RLSI: 38 }, { RLSI: 47 }).ok);
        assert.ok(fillGuardianTokens('나스닥 {NDX_CHG} 상승', NUMS, { NDX_CHG: 0.94 }).ok);
    });
    await t('모델이 숫자를 직접 써도 생성 재료와 같은 값이면 자리표로 — 채우면 원문, 다른 값·부호 없는 변동률은 그대로', () => {
        const raw = '나스닥 +0.98% 상승, RLSI 38점, 금 약세(-0.95%), 10년물 5.28%, 유가 -1.73%, 나스닥 0.98% 상승';
        const tpl = tokenizeGuardianLiterals(raw, NUMS);
        assert.equal(tpl, '나스닥 {NDX_CHG} 상승, RLSI {RLSI}점, 금 약세({GOLD_CHG}), 10년물 {US10Y}, 유가 -1.73%, 나스닥 0.98% 상승');
        // 값이 움직인 뒤 출구: 자리표는 새 값으로, 박힌 유가 -1.73% 는 대조에서 걸린다
        const g = guardianNumbersGate(tpl, { ...NUMS, NDX_CHG: 1.05 }, NUMS);
        assert.ok(g.text.startsWith('나스닥 +1.05% 상승, RLSI 38점, 금 약세(-0.95%)'), g.text);
        assert.deepEqual(g.reasons.map((r) => r.split(':')[1]).sort(), ['NDX_CHG', 'OIL_CHG']); // 박힌 «0.98% 상승»·«-1.73%»
    });
    await t('정리기(cleanInsight)는 자리표를 건드리지 않는다 · 프롬프트 규칙은 값 있는 지표만', () => {
        assert.ok(cleanInsight('[현황] 나스닥 {NDX_CHG} 상승', { labels: ['현황', '해석', '전망'] }).includes('{NDX_CHG}'));
        const r = guardianTokenRules('ko', { NDX_CHG: 0.98, RLSI: 38 });
        assert.ok(r.includes('{NDX_CHG}') && r.includes('{RLSI}') && !r.includes('{GOLD_CHG}'));
    });

    // ── 출구(intelligenceNode.repairVerdictTexts) — Redis·AWS 없이(대체 경로 = 고정 안내 문구) ──
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL; delete process.env.AWS_ACCESS_KEY_ID;
    _resetInsightStateForTest();
    await t('출구: 운영 ko 판정 — 숫자가 틀린 TACTICAL·RLSI 칸은 교체, 감마 칸은 그대로', async () => {
        const v = { title: 'TACTICAL INSIGHT', sentiment: 'NEUTRAL', description: KO_DESC, realityInsight: KO_REALITY, gammaInsight: KO_GAMMA };
        const r = await IntelligenceNode.repairVerdictTexts(v, 'ko', 'test', NUMS);
        assert.deepEqual(r.repaired.sort(), ['description', 'realityInsight']);
        assert.ok(!r.verdict.description.includes('+0.94%') && !r.verdict.realityInsight!.includes('41점'));
        assert.equal(r.verdict.gammaInsight, KO_GAMMA);
    });
    await t('출구: 자리표 원본이 있는 판정은 그 응답의 화면 값으로 채운다(장중 값 → 마감 값)', async () => {
        const tpl = '[현황] 나스닥 {NDX_CHG} 상승 속에 금 {GOLD_CHG}, 유가 {OIL_CHG}로 위험자산 선호가 이어졌다.\n[해석] RLSI {RLSI}점의 취약한 체력 위에서 대형주 중심 상승이다.\n[전망] 10년물 {US10Y} 수준의 금리가 변수다.';
        const basis = { NDX_CHG: 0.94, GOLD_CHG: -0.72, OIL_CHG: -1.73, RLSI: 41, US10Y: 5.27 };
        const v = { title: 'T', sentiment: 'NEUTRAL', description: 'stale', num: { tpl: { description: tpl }, basis: { description: basis } } };
        const r = await IntelligenceNode.repairVerdictTexts(v, 'ko', 'test', NUMS);
        assert.deepEqual(r.repaired, []);
        assert.equal(r.verdict.description, '[현황] 나스닥 +0.98% 상승 속에 금 -0.95%, 유가 -1.90%로 위험자산 선호가 이어졌다.\n[해석] RLSI 38점의 취약한 체력 위에서 대형주 중심 상승이다.\n[전망] 10년물 5.28% 수준의 금리가 변수다.');
        assert.equal(r.verdict.num?.tpl?.description, tpl);
        // 언어가 달라도 같은 화면 값 — en 판정도 같은 숫자
        const en = await IntelligenceNode.repairVerdictTexts({ title: 'T', sentiment: 'NEUTRAL', description: 'x', num: { tpl: { description: '[Status] NASDAQ {NDX_CHG} with RLSI at {RLSI}.\n[Interpretation] Narrow rally.\n[Outlook] Rates matter.' }, basis: { description: { NDX_CHG: 0.9, RLSI: 37 } } } }, 'en', 'test', NUMS);
        assert.ok(en.verdict.description.includes('NASDAQ +0.98% with RLSI at 38'), en.verdict.description);
    });
    await t('출구: 방향이 뒤집힌 자리표 글(생성 때 +0.30% → 지금 -0.40%)은 교체', async () => {
        const v = { title: 'T', sentiment: 'NEUTRAL', description: 'x', num: { tpl: { description: '[현황] 나스닥 {NDX_CHG} 상승세가 이어졌다.\n[해석] 성장주 중심.\n[전망] 금리가 변수다.' }, basis: { description: { NDX_CHG: 0.3 } } } };
        const r = await IntelligenceNode.repairVerdictTexts(v, 'ko', 'test', { ...NUMS, NDX_CHG: -0.4 });
        assert.deepEqual(r.repaired, ['description']);
        assert.ok(!r.verdict.description.includes('상승세'));
    });

    console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
