/**
 * IV 랭크 — 재는 값이 IV30(30일 고정 만기)으로 바뀐 뒤의 창·«수집 중» 시험 — src/lib/ivRank.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/ivRank.iv30.test.ts
 *
 * 픽스처 = signum-gex-history 행 모양(수집 15분 간격 · 정규장 13:32~20:47Z 하루 30행 · 주말에도 같은 시각에 돈다).
 *   옛 행 = atmIv 만(가장 가까운 만기) · 새 행 = atmIv + iv30 + iv30Def('cm30-v1') — 수집 Lambda harvest_lambda/iv30.js 와 같은 표식.
 *   만기 점프 실측(10/2 금 마감 체인): SPY atmIv 7.55(월 10/5 1일물) vs 같은 체인 IV30 12.94.
 */
import assert from 'node:assert/strict';
import {
    ivRankFromHistory, IV_RANK_WINDOW, IV30_DEF, ivRankCollectingText, ivRankNotProvidedText, ivRankIsCollecting,
} from '../src/lib/ivRank';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

/** 수집 시각 — 끝(가장 최근)부터 거꾸로 15분 간격, 정규장 창(13:32~20:47Z)만. 주말 포함(운영과 같다). */
function runTimes(endMs: number, count: number): number[] {
    const out: number[] = [];
    let ms = endMs;
    while (out.length < count) {
        const d = new Date(ms);
        const m = d.getUTCHours() * 60 + d.getUTCMinutes();
        if (m >= 13 * 60 + 30 && m <= 21 * 60) out.push(ms);
        ms -= 15 * 60_000;
    }
    return out; // 내림차순
}
const END = Date.parse('2026-10-16T20:47:00Z'); // 금 16:47 ET
const NOW = END + 5 * 60_000;

/** rows: 최근 newCount 행은 새 정의(IV30), 그 앞은 옛 행. ivAt(i) = i 번째(최근=0) 행의 값 */
function rows(total: number, newCount: number, ivAt: (i: number) => number | null, atmAt: (i: number) => number = () => 20) {
    return runTimes(END, total).map((ts, i) => (i < newCount
        ? { timestamp: ts, atmIv: atmAt(i), iv30: ivAt(i) ?? undefined, iv30Def: IV30_DEF }
        : { timestamp: ts, atmIv: atmAt(i) }));
}

t('배포 직후 — 창(200행) 중 새 정의 행이 50개면 «수집 중»(옛 atmIv 값으로 백분위를 내지 않는다)', () => {
    const r = ivRankFromHistory(rows(200, 50, (i) => 13 + (i % 7) * 0.1), { nowMs: NOW });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, 'collecting');
    assert.equal(r.collectingRows, 50);
    assert.equal(r.currentIv, 13); // 가장 최근 IV30 — 수준은 보인다
});

t('창이 차면(200행 전부 새 정의) 자동으로 값 — IV30 으로 계산하고 atmIv(만기 점프)는 무시', () => {
    // atmIv 는 최근 행만 7.55(다음 주 1일물로 넘어감 → 옛 정의라면 0%), IV30 은 13~15 사이에서 움직인다
    const iv = (i: number) => 13 + ((i * 37) % 20) / 10;
    const r = ivRankFromHistory(rows(200, 200, iv, (i) => (i < 30 ? 7.55 : 18)), { nowMs: NOW });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.currentIv, 13);
    assert.ok(r.percentile === 0); // 13.0 은 실제로 창의 최솟값(픽스처) — 값이 IV30 에서 나왔는지
    const r2 = ivRankFromHistory(rows(200, 200, (i) => (i === 0 ? 14.6 : iv(i))), { nowMs: NOW });
    assert.ok(r2.ok && r2.percentile > 50 && r2.percentile < 100);
});

t('새로 수집 목록에 든 종목(행 30개, 전부 새 정의) — «수집 중»(이력이 없는 «미제공»과 구분)', () => {
    const r = ivRankFromHistory(rows(30, 30, () => 20.9), { nowMs: NOW });
    assert.ok(!r.ok && r.reason === 'collecting' && r.collectingRows === 30);
});

t('수집 목록 밖(마지막 행에 표식 없음) → 미제공(insufficient) · 이력 0 → 미제공', () => {
    const r = ivRankFromHistory(rows(200, 0, () => null), { nowMs: NOW });
    assert.ok(!r.ok && r.reason === 'insufficient');
    const r0 = ivRankFromHistory([], { nowMs: NOW });
    assert.ok(!r0.ok && r0.reason === 'insufficient');
});

t('낡은 창(마지막 행 4일 넘음)은 새 정의 행이어도 stale(미제공)', () => {
    const r = ivRankFromHistory(rows(200, 200, () => 15), { nowMs: END + 5 * 86_400_000 });
    assert.ok(!r.ok && r.reason === 'stale');
});

t('창은 찼는데 IV30 값이 거의 없다(원천 실패 행) → insufficient-iv(미제공) — 영원히 «수집 중»에 갇히지 않는다', () => {
    const r = ivRankFromHistory(rows(200, 200, (i) => (i < 3 ? 15 + i : null)), { nowMs: NOW });
    assert.ok(!r.ok && r.reason === 'insufficient-iv');
});

t('같은 세션·같은 값(주말·같은 EOD 체인 반복)은 표본 하나 — 새 정의에도 그대로', () => {
    // 하루(30행) 안에서 값 3개가 돈다(장중 현재가가 움직여 ATM 보간점이 바뀜) → 표본 ≈ 날짜 수 × 3, 원시 200
    const r = ivRankFromHistory(rows(200, 200, (i) => 13 + Math.floor(i / 30) * 0.5 + (i % 3) * 0.01), { nowMs: NOW });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.rawIvRows, 200);
    assert.ok(r.sampleSize >= 10 && r.sampleSize <= 24, `표본 ${r.sampleSize}`);
});

t('창 크기 그대로 200', () => assert.equal(IV_RANK_WINDOW, 200));

t('글자 — 수집 중(ko·en·ja)·미제공과 다르다 · 응답 판정', () => {
    assert.equal(ivRankCollectingText('ko'), '수집 중');
    assert.equal(ivRankCollectingText('en'), 'Collecting');
    assert.equal(ivRankCollectingText('ja'), '収集中');
    assert.equal(ivRankCollectingText(undefined), 'Collecting');
    assert.notEqual(ivRankCollectingText('ko'), ivRankNotProvidedText('ko'));
    assert.equal(ivRankIsCollecting({ percentile: null, _source: 'dynamodb-collecting' }), true);
    assert.equal(ivRankIsCollecting({ percentile: null, _source: 'dynamodb-insufficient' }), false);
    assert.equal(ivRankIsCollecting({ percentile: 40, _source: 'dynamodb-true-percentile' }), false);
    assert.equal(ivRankIsCollecting(null), false);
});

console.log(`\n${n} passed`);
