/**
 * 크로스섹터 브리프 입력의 «지수 ETF 옵션 구조 레벨» — src/lib/ai/crossSectorLevels.ts (+ Lambda 판 scripts/lambda-cross-sector/indexLevels.js)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/crossSectorLevels.test.ts
 * 출발점(10/11): 입력에 지수 지지·저항이 없어 keyLevels 가 [VIX3M 17.77] 한 칸·빈 배열 → 웹 범위 바 소멸·앱 칩 1개.
 * 고정 자료: tests/fixtures/crossSectorLevels.stored.json = 운영 structure:v2:{SPY,QQQ,IWM} 저장본(10/9 금요일 마감 판본, 행사가는 기준가 ±30% 로 줄임).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { indexLevelRow, indexLevelRowFromStored, buildLevelsBlock, levelsPromptSection, reconcileLabeledLevels, anchorKeyLevels, finalizeCrossSectorKeyLevels, INDEX_LEVEL_MAX_AGE_MS } from '@/lib/ai/crossSectorLevels';
import { orderKeyLevels, sanitizeServedBrief, KEYLEVELS_SCHEMA_EXAMPLE, KEYLEVELS_REQUIREMENT, isGroundedLevel } from '@/lib/ai/keyLevels';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const STORED: Record<string, any> = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/crossSectorLevels.stored.json'), 'utf8'));
const NOW = STORED.SPY.timestamp + 60 * 60 * 1000;   // 금요일 마감 판본 + 1시간
const MACRO = 'VIX: 14.84 (-3.70%) | VIX3M: 17.77 (-1.71%) | VIX/VIX3M Ratio: 0.835 (CONTANGO ✓) | S&P500: 7812 (+0.59%) | NASDAQ: 27366 (+0.64%) | DOW: 51655 (+0.83%) | US10Y: 5.24% (+1bp) | Gold: 4216 (+1.43%)';
const rowsAt = (now = NOW) => ['SPY', 'QQQ', 'IWM'].map((tk) => indexLevelRowFromStored(tk, STORED[tk], now)).filter((r): r is NonNullable<typeof r> => !!r);

t('운영 저장본 3종 → 행: SPY Put Floor 625 · Call Wall 785 · Max Pain 768 · Gamma Flip 786 (기준가 778.43, 체인 10/9)', () => {
    const rows = rowsAt();
    assert.equal(rows.length, 3);
    const spy = rows.find((r) => r.ticker === 'SPY')!;
    assert.deepEqual({ p: spy.putFloor, c: spy.callWall, m: spy.maxPain, g: spy.gammaFlip, s: spy.spot, e: spy.expiration, d: spy.chainDate }, { p: 625, c: 785, m: 768, g: 786, s: 778.43, e: '2026-10-16', d: '2026-10-09' });
    const qqq = rows.find((r) => r.ticker === 'QQQ')!;
    assert.deepEqual({ p: qqq.putFloor, c: qqq.callWall, m: qqq.maxPain, g: qqq.gammaFlip, d: qqq.chainDate }, { p: 700, c: 760, m: 731, g: 760, d: null });
    const iwm = rows.find((r) => r.ticker === 'IWM')!;
    assert.deepEqual({ p: iwm.putFloor, c: iwm.callWall, m: iwm.maxPain, g: iwm.gammaFlip }, { p: 275, c: 285, m: 285, g: null });   // 감마플립 교차 없음(ALL_LONG) → 정의상 없음
});
t('프롬프트 블록: 가격·기준 날짜·만기·네 레벨(Put Floor → Call Wall → Max Pain → Gamma Flip), 지수 포인트로 바꾸지 말라는 단서', () => {
    const { block, ground } = buildLevelsBlock(rowsAt());
    const lines = block.split('\n');
    assert.match(lines[0], /^## Index ETF Options Structure Levels .*NOT index points.*never convert or rescale/);
    assert.equal(lines[1], '- SPY (price 778.43; open interest as of 2026-10-09; expiry 2026-10-16): Put Floor: 625 | Call Wall: 785 | Max Pain: 768 | Gamma Flip: 786');
    assert.match(lines[2], /^- QQQ \(price 751\.36; computed 2026-10-10; expiry 2026-10-16\): Put Floor: 700 \| Call Wall: 760 \| Max Pain: 731 \| Gamma Flip: 760$/);
    assert.equal(lines[3], '- IWM (price 278.92; computed 2026-10-10; expiry 2026-10-16): Put Floor: 275 | Call Wall: 285 | Max Pain: 285');
    assert.equal(ground.split('\n')[0], 'SPY Put Floor: 625 | SPY Call Wall: 785 | SPY Max Pain: 768 | SPY Gamma Flip: 786');
    assert.equal(/778\.43|2026/.test(ground), false);   // 날짜·기준가의 숫자는 «수준»의 근거가 아니다
    assert.equal(levelsPromptSection(''), '');
    assert.equal(levelsPromptSection(block), `\n${block}`);
    assert.deepEqual(buildLevelsBlock([]), { block: '', ground: '' });
});
t('쓸 수 없는 판본은 행이 되지 않는다: 96시간 초과 · 기준가 없음 · 계산 실패 · 네 값 모두 없음', () => {
    assert.equal(indexLevelRowFromStored('SPY', STORED.SPY, STORED.SPY.timestamp + INDEX_LEVEL_MAX_AGE_MS + 1000), null);
    assert.ok(indexLevelRowFromStored('SPY', STORED.SPY, STORED.SPY.timestamp + INDEX_LEVEL_MAX_AGE_MS - 1000));
    assert.equal(indexLevelRowFromStored('SPY', { ...STORED.SPY, data: { ...STORED.SPY.data, underlyingPrice: null } }, NOW), null);
    assert.equal(indexLevelRowFromStored('SPY', { ...STORED.SPY, data: { ...STORED.SPY.data, options_status: 'NO_MARKET' } }, NOW), null);
    assert.equal(indexLevelRowFromStored('SPY', null, NOW), null);
    assert.equal(indexLevelRow('SPY', { maxPain: null, callWall: null, putFloor: null, pinZone: null, gammaFlipLevel: null, levelsExpiration: null, levelsChainDate: null, levelsSource: 'structure', levelsSpot: 778 } as any, NOW), null);
});
t('정의 게이트(한 문과 같은 규칙): 현재가 아래의 콜월·위의 풋플로어·±15% 밖 감마플립은 행에서 빠진다', () => {
    const bad = { ...STORED.SPY, data: { ...STORED.SPY.data, levels: { callWall: 700, putFloor: 800, pinZone: 768 }, gammaFlipLevel: 900, gammaFlipType: 'EXACT' } };
    const r = indexLevelRowFromStored('SPY', bad, NOW)!;
    assert.equal(r.callWall, null); assert.equal(r.putFloor, null); assert.equal(r.gammaFlip, null);
    assert.equal(r.maxPain, 768);
});

// ── 출구: 모델이 쓴 keyLevels 를 입력과 맞춘다 ─────────────────────────────────────────────────────────────
const mk = (kl: any[]) => ({ outlook: { bias: 'NEUTRAL', keyLevels: kl } });
t('출구: 모델이 Call Wall 을 먼저 써도 Put Floor → Call Wall 순서, 입력에 없는 S&P 지지·저항은 제거, VIX3M 은 유지', () => {
    const s: any = mk([{ label: 'SPY Call Wall', value: '785' }, { label: 'S&P 500 Support', value: '7,750' }, { label: 'SPY Put Floor', value: '625' }, { label: 'VIX3M', value: '17.77' }]);
    const r = finalizeCrossSectorKeyLevels(s, MACRO, rowsAt());
    assert.deepEqual(s.outlook.keyLevels, [{ label: 'SPY Put Floor', value: '625' }, { label: 'SPY Call Wall', value: '785' }, { label: 'VIX3M', value: '17.77' }]);
    assert.deepEqual(r, { dropped: 1, added: 0 });
});
t('출구: 모델이 빈 배열·필드 없음을 줬어도 입력에 SPY 짝이 있으면 범위 바 두 칸을 «입력의 값 그대로» 채운다', () => {
    const a: any = mk([]);
    assert.deepEqual(finalizeCrossSectorKeyLevels(a, MACRO, rowsAt()), { dropped: 0, added: 2 });
    assert.deepEqual(a.outlook.keyLevels, [{ label: 'SPY Put Floor', value: '625' }, { label: 'SPY Call Wall', value: '785' }]);
    const b: any = { outlook: { bias: 'NEUTRAL' } };
    finalizeCrossSectorKeyLevels(b, MACRO, rowsAt());
    assert.equal(b.outlook.keyLevels.length, 2);
});
t('출구: 한쪽만 쓴 경우 빠진 쪽을 채운다(라벨·값은 입력 그대로)', () => {
    const s: any = mk([{ label: 'SPY Max Pain', value: '768' }, { label: 'SPY Call Wall', value: '785' }]);
    const r = finalizeCrossSectorKeyLevels(s, MACRO, rowsAt());
    assert.deepEqual(s.outlook.keyLevels.map((x: any) => `${x.label}=${x.value}`), ['SPY Put Floor=625', 'SPY Call Wall=785', 'SPY Max Pain=768']);
    assert.equal(r.added, 1);
});
t('출구: 라벨↔값 불일치(숫자는 입력에 있지만 다른 레벨의 값)는 제거하고 올바른 값으로 채운다', () => {
    const s: any = mk([{ label: 'SPY Put Floor', value: '785' }, { label: 'SPY Call Wall', value: '785' }, { label: 'QQQ Max Pain', value: '768' }]);
    // 785 는 입력에 있으니 필터는 통과하지만 Put Floor 의 값이 아니다 / 768 은 SPY 의 Max Pain 이지 QQQ 의 것이 아니다
    assert.equal(isGroundedLevel({ label: 'x', value: '785' }, `${MACRO}\nSPY Call Wall: 785`), true);
    const r = finalizeCrossSectorKeyLevels(s, MACRO, rowsAt());
    assert.deepEqual(s.outlook.keyLevels, [{ label: 'SPY Put Floor', value: '625' }, { label: 'SPY Call Wall', value: '785' }]);
    assert.deepEqual(r, { dropped: 2, added: 1 });
});
t('출구: 입력에 없는 수준 0 — 이전 운영 저장본(10/9)의 지어낸 4칸은 전부 제거되고 입력 속 레벨로 채워진다', () => {
    const s: any = mk([{ label: 'S&P 500 Support', value: '7,750' }, { label: 'S&P 500 Resistance', value: '7,900' }, { label: 'US10Y Critical Level', value: '5.30%' }, { label: 'VIX Threshold', value: '17.0' }]);
    const rows = rowsAt();
    finalizeCrossSectorKeyLevels(s, MACRO, rows);
    const { ground } = buildLevelsBlock(rows);
    assert.ok(s.outlook.keyLevels.length >= 2);
    for (const l of s.outlook.keyLevels) assert.equal(isGroundedLevel(l, `${MACRO}\n${ground}`), true, `${l.label}=${l.value}`);
    assert.equal(s.outlook.keyLevels.some((l: any) => /7,750|7,900|5\.30|17\.0$/.test(l.value)), false);
});
t('출구: 레벨 입력이 없으면 예전 규칙 그대로(VIX3M 만 남고 지어내지 않는다) · outlook 없으면 무시', () => {
    const s: any = mk([{ label: 'S&P 500 Support', value: '7,750' }, { label: 'VIX3M', value: '17.77' }]);
    assert.deepEqual(finalizeCrossSectorKeyLevels(s, MACRO, []), { dropped: 1, added: 0 });
    assert.deepEqual(s.outlook.keyLevels, [{ label: 'VIX3M', value: '17.77' }]);
    assert.deepEqual(finalizeCrossSectorKeyLevels({}, MACRO, rowsAt()), { dropped: 0, added: 0 });
    assert.deepEqual(finalizeCrossSectorKeyLevels(null, MACRO, rowsAt()), { dropped: 0, added: 0 });
});
t('SPY 에 짝이 없으면 다음 ETF(QQQ)가 범위 바 닻', () => {
    const rows = rowsAt().map((r) => (r.ticker === 'SPY' ? { ...r, callWall: null } : r));
    const s: any = mk([]);
    finalizeCrossSectorKeyLevels(s, MACRO, rows);
    assert.deepEqual(s.outlook.keyLevels, [{ label: 'QQQ Put Floor', value: '700' }, { label: 'QQQ Call Wall', value: '760' }]);
});
t('orderKeyLevels: 중복 제거 · 최대 4칸 · 짝이 없으면 순서 유지', () => {
    const l = [{ label: 'SPY Max Pain', value: '768' }, { label: 'VIX3M', value: '17.77' }, { label: 'SPY Max Pain', value: '768' }];
    assert.deepEqual(orderKeyLevels(l), [{ label: 'SPY Max Pain', value: '768' }, { label: 'VIX3M', value: '17.77' }]);
    const five = [1, 2, 3, 4, 5].map((i) => ({ label: `SPY Max Pain ${i}`, value: String(i) }));
    assert.equal(orderKeyLevels(five).length, 4);
});
t('reconcile/anchor 단독 동작', () => {
    const rows = rowsAt();
    const r = reconcileLabeledLevels([{ label: 'SPY Gamma Flip', value: '786' }, { label: 'SPY Gamma Flip', value: '785' }, { label: 'TSLA Call Wall', value: '785' }, { label: 'VIX3M', value: '17.77' }], rows);
    assert.deepEqual(r.kept.map((x) => x.label), ['SPY Gamma Flip', 'VIX3M']);
    assert.equal(r.dropped.length, 2);
    assert.deepEqual(anchorKeyLevels([], []), { levels: [], added: 0 });
});

// ── 서빙 출구: 저장본에 입력 근거 줄(levelsSnapshot)이 같이 있으면 실제 레벨은 남는다 ─────────────────────────────
t('sanitizeServedBrief: levelsSnapshot 이 있으면 SPY 레벨이 살고, 없는 옛 저장본은 예전 규칙(제거)', () => {
    const { ground } = buildLevelsBlock(rowsAt());
    const kl = [{ label: 'SPY Put Floor', value: '625' }, { label: 'SPY Call Wall', value: '785' }, { label: 'VIX3M', value: '17.77' }, { label: 'S&P 500 Support', value: '7,750' }];
    const withSnap: any = { structured: { outlook: { keyLevels: kl } }, macroSnapshot: MACRO, levelsSnapshot: ground };
    const r = sanitizeServedBrief(withSnap);
    assert.equal(r.dropped, 1);
    assert.deepEqual(r.brief.structured.outlook.keyLevels.map((x: any) => x.label), ['SPY Put Floor', 'SPY Call Wall', 'VIX3M']);
    const old: any = { structured: { outlook: { keyLevels: kl } }, macroSnapshot: MACRO };
    const r2 = sanitizeServedBrief(old);
    assert.deepEqual(r2.brief.structured.outlook.keyLevels.map((x: any) => x.label), ['VIX3M']);
});

// ── Lambda 판(CommonJS)과 같은 결과 ───────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LAMBDA = require('../scripts/lambda-cross-sector/indexLevels');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LKL = require('../scripts/lambda-cross-sector/keyLevels');
t('Lambda 판: 같은 저장본에서 같은 행·같은 프롬프트 블록(글자까지)·같은 근거 줄', () => {
    const tsRows = rowsAt();
    const lamRows = LAMBDA.TICKERS.map((tk: string) => LAMBDA.rowFromStored(tk, STORED[tk], NOW)).filter(Boolean);
    assert.deepEqual(lamRows, tsRows);
    assert.deepEqual(LAMBDA.buildLevelsBlock(lamRows), buildLevelsBlock(tsRows));
    assert.equal(LAMBDA.levelsPromptSection(buildLevelsBlock(tsRows).block), levelsPromptSection(buildLevelsBlock(tsRows).block));
    // JSON 문자열로 와도(EC2 프록시) 같다
    assert.deepEqual(LAMBDA.rowFromStored('SPY', JSON.stringify(STORED.SPY), NOW), tsRows[0]);
});
t('Lambda 판: 정의 게이트·만료·계산 실패도 TS 판과 같은 결론', () => {
    const cases: any[] = [
        [{ ...STORED.SPY, data: { ...STORED.SPY.data, levels: { callWall: 700, putFloor: 800, pinZone: 768 }, gammaFlipLevel: 900, gammaFlipType: 'EXACT' } }, NOW],
        [{ ...STORED.SPY, data: { ...STORED.SPY.data, gammaFlipLevel: 786.5, gammaFlipType: 'NEAR_ZERO' } }, NOW],      // 교차점 아님 → 없음
        [{ ...STORED.SPY, data: { ...STORED.SPY.data, gammaFlipLevel: 790, gammaFlipType: 'EXACT' } }, NOW],             // 분포상 교차점 아님 → 없음
        [STORED.SPY, STORED.SPY.timestamp + INDEX_LEVEL_MAX_AGE_MS + 1000],
        [{ ...STORED.SPY, data: { ...STORED.SPY.data, underlyingPrice: null } }, NOW],
        [{ ...STORED.SPY, data: { ...STORED.SPY.data, options_status: 'NO_MARKET' } }, NOW],
        [{ ...STORED.QQQ, data: { ...STORED.QQQ.data, maxPain: 100 } }, NOW],                                              // ±35% 밖 맥스페인 → 없음
        [STORED.IWM, NOW], [null, NOW],
    ];
    for (const [stored, now] of cases) {
        const ts = indexLevelRowFromStored('SPY', stored, now);
        const lam = LAMBDA.rowFromStored('SPY', stored, now);
        assert.deepEqual(lam, ts, JSON.stringify({ ts, lam }));
    }
});
t('Lambda 판: 출구 결과가 TS 판과 같다(모델 출력 모의 7종)', () => {
    const rows = rowsAt();
    const outs: any[][] = [
        [{ label: 'SPY Call Wall', value: '785' }, { label: 'S&P 500 Support', value: '7,750' }, { label: 'SPY Put Floor', value: '625' }, { label: 'VIX3M', value: '17.77' }],
        [], [{ label: 'SPY Max Pain', value: '768' }, { label: 'SPY Call Wall', value: '785' }],
        [{ label: 'SPY Put Floor', value: '785' }, { label: 'SPY Call Wall', value: '785' }, { label: 'QQQ Max Pain', value: '768' }],
        [{ label: 'S&P 500 Support', value: '7,750' }, { label: 'S&P 500 Resistance', value: '7,900' }, { label: 'US10Y Critical Level', value: '5.30%' }, { label: 'VIX Threshold', value: '17.0' }],
        [{ label: 'VIX3M', value: '17.77' }], [{ label: 'QQQ Gamma Flip', value: '760' }, { label: 'IWM Call Wall', value: '285' }, { label: 'IWM Put Floor', value: '275' }],
    ];
    for (const kl of outs) {
        for (const r of [rows, []]) {
            const a: any = mk(JSON.parse(JSON.stringify(kl))), b: any = mk(JSON.parse(JSON.stringify(kl)));
            const ra = finalizeCrossSectorKeyLevels(a, MACRO, r as any), rb = LAMBDA.finalizeCrossSectorKeyLevels(b, MACRO, r);
            assert.deepEqual(rb, ra); assert.deepEqual(b.outlook.keyLevels, a.outlook.keyLevels, JSON.stringify(kl));
        }
    }
    assert.deepEqual(LKL.orderKeyLevels([{ label: 'SPY Call Wall', value: '785' }, { label: 'SPY Put Floor', value: '625' }]).map((x: any) => x.label), ['SPY Put Floor', 'SPY Call Wall']);
});
t('프롬프트 문구: Lambda 판 = TS 판 · 레벨 블록 이름이 요구문에 있다 · 지어낸 예시 수는 없다', () => {
    assert.equal(LKL.SCHEMA_EXAMPLE, KEYLEVELS_SCHEMA_EXAMPLE);
    assert.equal(LKL.REQUIREMENT, KEYLEVELS_REQUIREMENT);
    assert.ok(KEYLEVELS_REQUIREMENT.includes('Index ETF Options Structure Levels'));
    assert.equal(/5,800|6,200|25,000|20\.0/.test(KEYLEVELS_SCHEMA_EXAMPLE + KEYLEVELS_REQUIREMENT), false);
});

console.log(`\n${n} passed`);
