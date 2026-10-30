/**
 * T35 (10/31 KST) 장중 Tactical «준비 중» 고정 재현 — 운영 10/30 실측 글·시각 그대로.
 *   ① 11:52 ET 생성 글의 NEXT «10/30(금) 12:00 ET Fed Daly 연설»은 생성 때 통과, 12:00 ET 이후 저장본 검사에서 claim-not-upcoming(정상 동작).
 *   ② 출구가 그 칸을 «준비 중»으로 바꾼 스냅샷을 EC2 워커가 30초마다 _workerTimestamp 만 새로 찍어 «신선»으로 남긴다
 *      → 예전엔 재계산(=재생성)이 없어 장중 내내 «준비 중». 고친 뒤: 스냅샷 계산 시각(timestamp)이 5분 넘으면 다시 계산한다.
 *   모델·Redis·코어는 메모리 모의 — 판정 함수와 실제 스냅샷 반환 경로(computeGuardianSnapshot)를 실행한다.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { checkTacticalStored } from '../src/lib/ai/tacticalPrompt';

// ① 운영 저장본(guardian:gemini:v3:reality:ko, updatedAt 2026-10-30T15:52:59Z)의 글과 같은 NEXT 문장
const stored = '지금 정규장에서 나스닥 종합은 전일 종가 대비 2.5%, S&P500은 1.6% 하락 중입니다. 오늘 시장 전체를 움직인 뚜렷한 재료는 확인되지 않았습니다. 시장 건강도(RLSI 32점)가 약해 반등을 받칠 힘이 부족하고, 옵션 포지션(GEX 27)은 중립 쪽이라 흔들림을 받쳐 주지도 키우지도 않습니다. 다음 분기점은 10/30(금) 12:00 ET(한국 01:00)에 예정된 Fed Daly 연설로, 금리 인하 기대가 늘면 주식에 우호적이고 줄면 부담이 커집니다.';
const prompt = (asOf: string) => `SESSION: REG\nTODAY_NEWS: []\nSCHEDULED_EVENTS: ${JSON.stringify(['[economic calendar; 2026-10-30 12:00 ET] Fed Daly (scheduled; not a released result)'])}\nAS_OF: ${asOf}`;
assert.deepEqual(checkTacticalStored(stored, prompt('2026-10-30T15:52:59Z')), [], '11:52 ET — 다가오는 일정이라 통과');
assert.deepEqual(checkTacticalStored(stored, prompt('2026-10-30T16:00:10Z')), ['schedule:claim-not-upcoming'], '12:00 ET 이후 — 지난 일정을 «다음»으로 내보내지 않는다(검사는 그대로 둔다)');

// ② 스냅샷 반환 경로
const MIN = 60_000;
const store = new Map<string, any>();
let session = 'REG';
let coreCalls = 0;
const mock = (id: string, exports: unknown) => {
    const filename = require.resolve(id);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
};
class OfflineRedis { async get(k: string) { return store.get(k) ?? null; } async set(k: string, v: string) { store.set(k, JSON.parse(v)); } }
mock('@upstash/redis', { Redis: OfflineRedis });
mock('../src/lib/sessionArchive', { readSessionArchive: async () => null, saveSessionArchive: async () => false });
for (const id of [
    '../src/services/guardian/sectorEngine', '../src/services/macroHubProvider', '../src/services/guardian/rvolEngine',
    '../src/services/massiveClient', '../src/services/guardian/gammaShieldEngine', '../src/services/guardian/breadthEngine',
    '../src/services/indexBreadth', 'next/server', '../src/lib/cache/staleLock',
]) mock(id, {});
mock('../src/services/guardian/rlsiEngine', { getMarketSession: () => session });
mock('../src/services/marketIndexBasis', { loadMarketIndexBasis: async () => null });
mock('../src/services/redisClient', { getFromCache: async (k: string) => store.get(k) ?? null, setInCache: async (k: string, v: any) => { store.set(k, v); return true; } });
// 재계산 진입 = 공유 코어 요청. 모의 코어는 없음(null) → 재계산은 «shared core unavailable» 로 끝난다(진입 여부만 센다).
mock('../src/services/guardian/guardianCore', { CORE_KEY: 'offline:core', getSharedCore: async () => { coreCalls++; return null; } });
const { GuardianDataHub: Hub, _resetGuardianHubStateForTest: resetHub, snapshotPlaceholderNeedsRecompute, PLACEHOLDER_RECOMPUTE_MS } =
    require('../src/services/guardian/unifiedDataStream') as typeof import('../src/services/guardian/unifiedDataStream');

const PENDING = '[진단] 최신 시장 분석을 준비하고 있습니다\n[결론] 잠시 후 자동으로 갱신됩니다';
const now = Date.parse('2026-10-30T17:12:20Z');
const iso = (at: number) => new Date(at).toISOString();
const snap = (reality: string, computedAt: number, sess = 'REG') => ({
    timestamp: iso(computedAt), _workerTimestamp: iso(now - 5_000), _source: 'ec2-worker',
    rlsi: { score: 35, session: sess }, sectors: [{ id: 'XLK' }],
    verdict: { title: 'TACTICAL INSIGHT', sentiment: 'NEUTRAL', description: '순환매 정상 글', gammaInsight: '감마 정상 글', realityInsight: reality },
});

assert.equal(PLACEHOLDER_RECOMPUTE_MS, 5 * MIN);
// 판정 함수
assert.equal(snapshotPlaceholderNeedsRecompute(snap(PENDING, now - 79 * MIN), 'REG', now), true, '운영 ko: 15:53Z 스냅샷이 17:12Z 에도 «준비 중»');
assert.equal(snapshotPlaceholderNeedsRecompute(snap(PENDING, now - 5 * MIN), 'REG', now), true, '정확히 5분');
assert.equal(snapshotPlaceholderNeedsRecompute(snap(PENDING, now - 5 * MIN + 1), 'REG', now), false, '5분 안 — 생성 실패가 이어져도 언어당 5분에 한 번');
assert.equal(snapshotPlaceholderNeedsRecompute(snap(stored, now - 79 * MIN), 'REG', now), false, '정상 글은 기존 그대로(워커 도장 기준 신선)');
for (const s of ['PRE', 'POST']) assert.equal(snapshotPlaceholderNeedsRecompute(snap(PENDING, now - 79 * MIN, s), s, now), true, `${s}`);
assert.equal(snapshotPlaceholderNeedsRecompute(snap(PENDING, now - 79 * MIN, 'CLOSED'), 'CLOSED', now), false, '장외는 모델을 부르지 않는 경로');
const gammaPending = { ...snap(stored, now - 79 * MIN), verdict: { ...snap(stored, 0).verdict, gammaInsight: '[변동성] 최신 옵션 구조 분석을 준비하고 있습니다\n[범위] 잠시 후 자동으로 갱신됩니다' } };
assert.equal(snapshotPlaceholderNeedsRecompute(gammaPending, 'REG', now), true, '감마 칸 대기 문구도 같은 이유로 굳는다');
assert.equal(snapshotPlaceholderNeedsRecompute({ verdict: { realityInsight: PENDING } }, 'REG', now), true, '계산 시각 모름 → 다시 계산');
assert.equal(snapshotPlaceholderNeedsRecompute(null, 'REG', now), false);

(async () => {
    const realNow = Date.now;
    Date.now = () => now;
    try {
        const call = async () => Hub.computeGuardianSnapshot(false, 'ko');   // 예외를 삼키지 않는다 — 던지면 시험 실패
        const run = async (s: any) => {
            store.clear(); resetHub(); coreCalls = 0;
            store.set('guardian:snapshot:ko', s);
            return call();
        };
        // 운영 재현: 워커 도장 5초 전(신선) + 79분 묵은 «준비 중» → 다시 계산해야 한다(예전엔 그대로 반환·재계산 0)
        const stale = snap(PENDING, now - 79 * MIN);
        const failed = await run(stale);
        assert.equal(coreCalls, 1, '«준비 중» 스냅샷 → 재계산 진입');
        // 관문 10310216 ① 재계산 실패(코어 없음 → 예외)여도 예전처럼 그 스냅샷을 준다(응답 회귀 0)
        assert.equal(failed, stale, '재계산 실패 → 기존 스냅샷 반환(던지지 않음)');
        // 관문 10310216 ② 실패로 timestamp 가 그대로여도 5분 안에는 다시 시도하지 않는다 — 같은 인스턴스
        store.delete(`guardian:snapshot:recompute:ko`);   // 20초 재계산 잠금과 무관하게
        assert.equal((await call()).verdict.realityInsight, PENDING);
        assert.equal(coreCalls, 1, '같은 인스턴스 5분 안 재시도 0');
        // 다른 인스턴스(메모리 없음)도 공유 키로 5분 안 재시도 0
        resetHub(); store.delete(`guardian:snapshot:recompute:ko`);
        assert.equal((await call()).verdict.realityInsight, PENDING);
        assert.equal(coreCalls, 1, '다른 인스턴스 5분 안 재시도 0');
        // 5분 뒤에는 다시 시도
        const realNow2 = Date.now; Date.now = () => now + 5 * MIN; resetHub(); store.delete(`guardian:snapshot:recompute:ko`);
        store.get('guardian:snapshot:ko')._workerTimestamp = iso(now + 5 * MIN - 5_000);   // 워커 도장은 계속 신선
        try { await call(); } finally { Date.now = realNow2; }
        assert.equal(coreCalls, 2, '5분 뒤 재시도 1회');
        // 정상 글 스냅샷은 기존처럼 그대로 반환(재계산 0 — 공급사 호출 증가 없음)
        const kept = await run(snap(stored, now - 79 * MIN));
        assert.equal(coreCalls, 0, '정상 글 → 재계산 없음');
        assert.equal(kept?.verdict.realityInsight, stored);
        // 방금(5분 안) 다시 계산했는데도 «준비 중»이면 그대로(5분 간격)
        const recent = await run(snap(PENDING, now - 2 * MIN));
        assert.equal(coreCalls, 0, '5분 안 → 재계산 없음');
        assert.equal(recent?.verdict.realityInsight, PENDING);
        console.log('통과 T35 장중 «준비 중» 고정: 지난 일정 탈락(검사 불변)·대기 문구 스냅샷 5분 재계산·실패 시 기존 스냅샷 반환·실패 후 5분 간격(인스턴스·공유)·정상 글/장외/5분 안 재계산 0');
    } finally { Date.now = realNow; }
})().catch((e) => { console.error(e); process.exit(1); });
