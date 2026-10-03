/**
 * 종목 딥 분석 «글 속 가격 = 그 종목 재료 가격» — src/lib/ai/deepNumbers.ts (표면 1 flowNumbers 검사 이식, 2026-10-04 예방 수리)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/deepNumbers.test.ts
 */
import assert from 'node:assert/strict';
import { basisFromDeepSnapshot, checkDeepAnalysis, deepTextsFor } from '@/lib/ai/deepNumbers';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
// 앱 cmd 가 보내는 snapshot 모양(가격은 10/3 종가)
const NVDA_SNAP = {
    price: 233.95, session: 'CLOSED',
    structure: { callWall: 235, putFloor: 220, maxPain: 227.5, gammaFlipLevel: 235, pcRatio: 0.81, squeezeScore: 28 },
    sma: { cross: 'GOLDEN', sma50: 212.4, sma200: 181.7, trendPhase: 'UP' },
    technicals: { adx: 24, bb: { upper: 241.2, lower: 214.8 } },
    analyst: { targetMean: 265 },
};
const B = basisFromDeepSnapshot('nvda', NVDA_SNAP);
const OK = {
    currentState: { ko: 'NVDA 는 콜월 $235 바로 아래($233.95)에서 마감했다.', en: 'NVDA closed at $233.95, just under the $235 call wall.', ja: 'NVDAはコールウォール$235の直下($233.95)で引けた。' },
    sections: [
        { title: { ko: '옵션', en: 'Options', ja: 'オプション' }, content: { ko: '풋 플로어 $220(6.0% 거리)와 맥스페인 $227.5 사이. 50일선 $212.4 위.', en: 'Between the $220 put floor (6.0% away) and $227.5 max pain; above the 50-day at $212.4.', ja: 'プットフロア$220(6.0%下)とマックスペイン$227.5の間。50日線$212.4の上。' } },
    ],
    keyInsight: { ko: '볼린저 상단 $241.2 가 다음 저항이다.', en: 'The upper Bollinger band at $241.2 is the next resistance.', ja: 'ボリンジャー上限$241.2が次の抵抗。' },
    newsSummary: { headlines: [{ title: 'Nvidia stock hits $999 in fake headline' }] },
};
t('재료 기준 — 핵심 수준 + 재료 속 현재가 0.3~3배 숫자(SMA·볼린저·목표가)', () => {
    assert.equal(B.ticker, 'NVDA'); assert.equal(B.callWall, 235); assert.equal(B.gammaFlip, 235);
    for (const v of [212.4, 181.7, 241.2, 214.8, 265]) assert.ok(B.extras.includes(v), String(v));
    assert.ok(!B.extras.includes(24) && !B.extras.includes(0.81));
});
t('{ko,en,ja} 칸만 모은다(뉴스 제목은 원문이라 제외)', () => {
    const en = deepTextsFor(OK, 'en');
    assert.ok(en.includes('$241.2') && en.includes('Between the $220') && !en.includes('$999'));
});
t('맞는 3개 국어 글은 통과', () => {
    const r = checkDeepAnalysis(OK, B);
    assert.ok(r.ok, r.reasons.join(' | '));
});
t('다른 종목 값으로 쓴 글(AAPL $340/$330/$333.69)은 3개 국어 모두 걸린다', () => {
    const bad = JSON.parse(JSON.stringify(OK).replace(/\$235/g, '$340').replace(/\$220/g, '$330').replace(/\$233\.95/g, '$333.69'));
    const r = checkDeepAnalysis(bad, B);
    assert.ok(!r.ok);
    assert.deepEqual(r.badLocales, ['ko', 'en', 'ja']);
});
t('거리 % 가 어느 수준과도 안 맞으면 걸리고(6.0%→1.25%), 반올림(«약 6%»)은 통과', () => {
    const wrong = JSON.parse(JSON.stringify(OK).replace('(6.0% away)', '(1.25% away)'));
    assert.deepEqual(checkDeepAnalysis(wrong, B).badLocales, ['en']);
    const rounded = JSON.parse(JSON.stringify(OK).replace('(6.0% away)', '(about 6% away)'));
    assert.ok(checkDeepAnalysis(rounded, B).ok);
});
t('대체 문구(기본 관측문)·$수준 없는 글은 통과', () => {
    const fb = { currentState: { ko: 'NEUTRAL — 분석 데이터 업데이트 대기 중', en: 'NEUTRAL — Analysis update pending', ja: 'NEUTRAL — 分析データ更新待ち' }, sections: [] };
    assert.ok(checkDeepAnalysis(fb, B).ok);
});
console.log(`\n${n} passed`);
