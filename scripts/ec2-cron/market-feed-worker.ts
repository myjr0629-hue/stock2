/**
 * EC2 크론 워커 — market-feed (2026-10-20, Vercel 크론 → EC2 이전 1단계)
 *
 * 하는 일: Vercel 의 /api/cron/market-feed 가 매분 하던 일(야후 17종목·CNN 공포탐욕 수집 → Redis 기록 · VIX 급변 감지)을
 *   **같은 함수(src/services/jobs/marketFeedJob.ts)·같은 Redis 키·같은 TTL** 로 EC2 에서 직접 한다. Vercel 라우트를 HTTP 로 부르지 않는다.
 *
 * 나아진 점: 30초 간격(매분 :07·:37) — Vercel 크론(매분 1회)보다 값이 두 배 자주 새로워진다.
 *   VIX 급변 비교(vix:prev_change)는 예전처럼 «1분에 한 번»(마지막 비교 뒤 55초 이상일 때)만 한다 — 감지 민감도 불변, 회차가 밀려도 빠지지 않는다.
 *
 * 안전: 한 회차가 끝나기 전 다음 회차는 겹쳐 돌지 않는다(건너뛰고 기록). 쓰기 뒤 주 저장소(ElastiCache)에서 다시 읽어
 *   같은 updatedAt 인지 확인된 키만 «성공»으로 친다. 성공 표식 cron:ec2:success:market-feed 를 남기면 Vercel 라우트가
 *   건너뛰고, 표식이 120초 넘게 없으면 Vercel 이 예전처럼 다시 일한다(src/lib/cron/ec2Handoff.ts).
 *   야후가 많이 실패하면(≥8) 10분간 1분 간격으로 늦춘다.
 *
 * 빌드·배포: bash scripts/ec2-cron/deploy.sh (esbuild 단일 파일 → /opt/signum-cron/market-feed-worker.js, PM2 «cron-market-feed», Node 20)
 * 로그: 오류·경고 /opt/signum-cron/logs/pm2-error.log(20MB 상한) · 회차 기록 /opt/signum-cron/logs/market-feed-YYYY-MM-DD.jsonl (3일 보관)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMarketFeed, SYMBOLS } from '@/services/jobs/marketFeedJob';
import { getAuthoritativeCache, setAuthoritativeCache } from '@/services/redisClient';
import { ec2MarkerKey, type Ec2SuccessMarker } from '@/lib/cron/ec2Handoff';
import { createEdgeFetch } from '@/lib/cron/yahooEdge';

// ★ [2026-10-31] EC2 의 DNS 가 주는 야후 미국 접속점은 선물·SOX 를 수십 분 늙은 값으로 준다(src/lib/cron/yahooEdge.ts 실측).
//   이 프로세스의 fetch 를 감싸 query1.finance.yahoo.com 차트 요청만 «DNS·대안 접속점»에 동시에 묻고 심볼마다 더 새롭고 유효한 응답을 쓴다
//   (둘 다 실패·판정 불가면 DNS 결과 그대로). 수집 함수 본문은 그대로.
const yahooEdge = createEdgeFetch(globalThis.fetch.bind(globalThis), { log: (m) => console.warn(m) });
globalThis.fetch = yahooEdge.fetch as typeof fetch;

const JOB = 'market-feed';
const VERSION = process.env.CRON_BUILD || 'dev';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';
const LOG_DIR = process.env.CRON_LOG_DIR || '/opt/signum-cron/logs';
const OFFSETS_SEC = [7, 37];           // 매분 :07·:37 — Vercel 크론(실측 매분 :40~:05 에 기록)과 겹치지 않게
const VIX_CHECK_SEC = 7;               // 늦춤 모드에서 도는 회차(:07)
const VIX_EVERY_MS = 55_000;           // VIX 급변 비교는 «마지막 비교 뒤 55초 이상»일 때 — 회차가 밀려도 1분에 한 번은 한다
const SLOW_FAIL_THRESHOLD = 8;         // 야후 실패가 이만큼이면
const SLOW_FOR_MS = 10 * 60_000;       //   10분간 :07 회차만 돈다
const MARKER_TTL_SEC = 600;
const LOG_KEEP_DAYS = 3;

let running = false;
let stopping = false;
let slowUntil = 0;
let consecutiveZero = 0;
let ticks = 0;
let lastVixAt = 0;

function logLine(obj: Record<string, unknown>) {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        const day = new Date().toISOString().slice(0, 10);
        fs.appendFileSync(path.join(LOG_DIR, `${JOB}-${day}.jsonl`), JSON.stringify(obj) + '\n');
    } catch (e: any) {
        console.error(`[cron-${JOB}] 로그 기록 실패: ${e?.message}`);
    }
}

function pruneLogs() {
    try {
        const cutoff = Date.now() - LOG_KEEP_DAYS * 86_400_000;
        for (const f of fs.readdirSync(LOG_DIR)) {
            const m = f.match(/-(\d{4}-\d{2}-\d{2})\.jsonl$/);
            if (m && Date.parse(m[1]) < cutoff) fs.unlinkSync(path.join(LOG_DIR, f));
        }
        // PM2 오류 로그(-e)는 회전 모듈이 없어 상한을 둔다(20MB 넘으면 비움). 표준 출력은 /dev/null — 회차 기록은 jsonl 에 있다.
        const errLog = path.join(LOG_DIR, 'pm2-error.log');
        if (fs.existsSync(errLog) && fs.statSync(errLog).size > 20 * 1024 * 1024) fs.truncateSync(errLog, 0);
    } catch { /* 없으면 그만 */ }
}

async function tick(sec: number): Promise<boolean> {
    if (running) {
        console.warn(`[cron-${JOB}] 이전 회차가 아직 진행 중 — :${sec} 회차 건너뜀`);
        logLine({ t: new Date().toISOString(), skip: 'overlap', sec });
        return false;
    }
    if (Date.now() < slowUntil && sec !== VIX_CHECK_SEC) return false;
    running = true;
    ticks++;
    const t0 = Date.now();
    try {
        const doVix = Date.now() - lastVixAt >= VIX_EVERY_MS;
        if (doVix) lastVixAt = Date.now();
        const r = await runMarketFeed({
            newsBaseUrl: SITE,
            vixCheck: doVix,
            verifyRead: (key) => getAuthoritativeCache(key),
        });
        const tookMs = Date.now() - t0;
        const yahooFails = r.failed.filter((f) => f !== 'F&G').length;
        if (yahooFails >= SLOW_FAIL_THRESHOLD) {
            slowUntil = Date.now() + SLOW_FOR_MS;
            console.warn(`[cron-${JOB}] 야후 실패 ${yahooFails}/${SYMBOLS.length} — 10분간 1분 간격으로 늦춤`);
        }
        let markerOk = false;
        if (r.ok > 0) {
            consecutiveZero = 0;
            const marker: Ec2SuccessMarker = { at: Date.now(), okCount: r.ok, failed: r.failed, host: os.hostname(), version: VERSION, tookMs };
            markerOk = await setAuthoritativeCache(ec2MarkerKey(JOB), marker, MARKER_TTL_SEC);
        } else {
            consecutiveZero++;
            console.error(`[cron-${JOB}] 성공 0건(연속 ${consecutiveZero}) — 표식을 남기지 않는다(Vercel 이 이어받는다)`);
        }
        if (tookMs > 20_000) console.warn(`[cron-${JOB}] 회차가 느리다: ${tookMs}ms`);
        logLine({ t: new Date().toISOString(), sec, tookMs, ok: r.ok, fail: r.fail, failed: r.failed, vix: doVix, vixTriggered: r.vixTriggered, markerOk, edgePicks: yahooEdge.state.picks, edgeAlts: yahooEdge.state.alts, edgeAltCalls: yahooEdge.state.altCalls, edgeAltWins: yahooEdge.state.altWins, edgeAltSlow: yahooEdge.state.altSlow, edgeAllPausedUntil: yahooEdge.state.allPausedUntil, results: r.results });
        return markerOk;
    } catch (e: any) {
        consecutiveZero++;
        console.error(`[cron-${JOB}] 회차 예외: ${e?.stack || e}`);
        logLine({ t: new Date().toISOString(), sec, error: String(e?.message || e) });
        return false;
    } finally {
        running = false;
    }
}

function scheduleNext() {
    if (stopping) return;
    const now = Date.now();
    const msInMin = now % 60_000;
    let next = Infinity; let nextSec = OFFSETS_SEC[0];
    for (const s of OFFSETS_SEC) {
        const at = s * 1000;
        const delta = at > msInMin + 50 ? at - msInMin : 60_000 - msInMin + at;
        if (delta < next) { next = delta; nextSec = s; }
    }
    setTimeout(() => {
        void tick(nextSec);
        if (ticks % 120 === 0) pruneLogs();
        scheduleNext();
    }, next);
}

function shutdown(sig: string) {
    stopping = true;
    console.log(`[cron-${JOB}] ${sig} — 진행 중 회차를 기다렸다가 종료`);
    const t0 = Date.now();
    const wait = () => (!running || Date.now() - t0 > 15_000 ? process.exit(0) : setTimeout(wait, 200));
    wait();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => console.error(`[cron-${JOB}] unhandledRejection`, e));

console.log(`[cron-${JOB}] 시작 v=${VERSION} node=${process.version} site=${SITE} 간격=:${OFFSETS_SEC.join('·:')}`);
if (process.argv.includes('--once')) {
    // 배포 직후 1회 시험 실행용(쓰기 포함 — 운영 크론과 같은 일)
    tick(VIX_CHECK_SEC).then((okDone) => process.exit(okDone ? 0 : 1));
} else {
    pruneLogs();
    scheduleNext();
}
