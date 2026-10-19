/**
 * EC2 크론 이전(market-feed) 시험 (2026-10-20)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/ec2CronHandoff.test.ts
 *
 * 고정하는 것
 *  1) 넘김 판정(decideHandoff) — 표식 없음·깨짐·낡음·미래 시각이면 «실행», 신선·실패 0 이면 «건너뜀», 일부 실패면 «그것만», 대부분 실패면 «전부»
 *  2) 스위치(CRON_EC2_JOBS) — 미설정=기본(market-feed) · off/none/0/빈칸=끔 · 목록
 *  3) 저장 계약 — 야후 17종목의 키·순서, TTL 600, F&G·vix:prev_change 키, 수집 함수 본문이 라우트에서 옮긴 그대로
 *  4) 라우트 — 건너뜀 판정이 무거운 실행부 import 보다 먼저, 부분 실행은 실패 항목만, 표식 키 이름이 워커·라우트 같음
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decideHandoff, ec2JobsFromEnv, ec2MarkerKey, DEFAULT_EC2_JOBS } from '../src/lib/cron/ec2Handoff';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const NOW = Date.parse('2026-10-20T14:00:00Z');
const MAX = 120_000;

console.log('1) 넘김 판정');
t('표식 없음 → 실행', () => assert.equal(decideHandoff(null, NOW, MAX, 6).action, 'run'));
t('표식이 객체 아님 → 실행', () => assert.equal(decideHandoff('x', NOW, MAX, 6).action, 'run'));
t('at 없음·NaN → 실행', () => {
    assert.equal(decideHandoff({}, NOW, MAX, 6).action, 'run');
    assert.equal(decideHandoff({ at: NaN }, NOW, MAX, 6).action, 'run');
    assert.equal(decideHandoff({ at: '2026-10-20' }, NOW, MAX, 6).action, 'run');
});
t('낡음(120초 초과) → 실행', () => {
    const d = decideHandoff({ at: NOW - 121_000, failed: [] }, NOW, MAX, 6);
    assert.equal(d.action, 'run'); assert.equal(d.reason, 'stale-marker');
});
t('경계(정확히 120초) → 건너뜀', () => assert.equal(decideHandoff({ at: NOW - 120_000, failed: [] }, NOW, MAX, 6).action, 'skip'));
t('미래 시각(1분 넘게) → 실행 · 약간 앞선 시계(30초)는 허용', () => {
    assert.equal(decideHandoff({ at: NOW + 61_000, failed: [] }, NOW, MAX, 6).action, 'run');
    const d = decideHandoff({ at: NOW + 30_000, failed: [] }, NOW, MAX, 6);
    assert.equal(d.action, 'skip'); assert.equal((d as any).ageSec, 0);
});
t('신선·실패 0 → 건너뜀(나이 초)', () => {
    const d = decideHandoff({ at: NOW - 31_000, failed: [] }, NOW, MAX, 6);
    assert.deepEqual(d, { action: 'skip', reason: 'ec2-fresh', ageSec: 31 });
});
t('failed 필드 없음 = 실패 0 으로 본다', () => assert.equal(decideHandoff({ at: NOW - 1000 }, NOW, MAX, 6).action, 'skip'));
t('일부 실패 → 그것만(문자열 아닌 항목은 버림)', () => {
    const d = decideHandoff({ at: NOW - 5000, failed: ['^VIX', 'F&G', 3, ''] }, NOW, MAX, 6);
    assert.equal(d.action, 'partial'); assert.deepEqual((d as any).only, ['^VIX', 'F&G']);
});
t('대부분 실패(상한 초과) → 전부 실행', () => {
    const d = decideHandoff({ at: NOW - 5000, failed: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, NOW, MAX, 6);
    assert.equal(d.action, 'run'); assert.equal(d.reason, 'ec2-mostly-failed');
});

console.log('2) 스위치');
t('미설정 → 기본 목록(market-feed)', () => {
    assert.deepEqual([...ec2JobsFromEnv(undefined)], [...DEFAULT_EC2_JOBS]);
    assert.ok(ec2JobsFromEnv(undefined).has('market-feed'));
});
t('끄기 값들', () => { for (const v of ['', ' ', 'off', 'OFF', 'none', '0', 'false']) assert.equal(ec2JobsFromEnv(v).size, 0, v); });
t('목록', () => assert.deepEqual([...ec2JobsFromEnv(' market-feed , signum-warm ')], ['market-feed', 'signum-warm']));
t('표식 키', () => assert.equal(ec2MarkerKey('market-feed'), 'cron:ec2:success:market-feed'));

console.log('3) 저장 계약');
const job = read('src/services/jobs/marketFeedJob.ts');
t('야후 17종목·순서·키', () => {
    const syms = [...job.matchAll(/\{ yahoo: '([^']+)',\s*key: YAHOO_CACHE_KEYS\.(\w+)/g)].map((m) => `${m[1]}>${m[2]}`);
    assert.deepEqual(syms, ['^VIX>VIX', '^VIX3M>VIX3M', 'NQ=F>NQ', '^TNX>TNX', 'ES=F>SPX', 'BTC-USD>BTC', 'GC=F>GOLD', 'TLT>TLT', 'CL=F>OIL',
        'RTY=F>RUT', '^SOX>SOX', 'KRW=X>USDKRW', 'JPY=X>USDJPY', 'DX-Y.NYB>DXY', '^IXIC>IDX_NASDAQ', '^DJI>IDX_DOW', '^GSPC>IDX_SPX']);
});
t('TTL 600 — 시세·F&G·vix:prev_change', () => {
    assert.match(job, /setInCache\(key, quote, 600\)/);
    assert.match(job, /setInCache\('cnn:feargreed', \{[\s\S]*?\}, 600\)/);
    assert.match(job, /setInCache\('vix:prev_change', \{ changePct: vixData\.changePct \}, 600\)/);
});
t('lastChangeAt 이어받기 규칙 유지', () => {
    assert.match(job, /prevPrice === null\)[\s\S]*?quote\.lastChangeAt = quote\.updatedAt/);
    assert.match(job, /quote\.lastChangeAt = prev\?\.lastChangeAt/);
});
t('수집 함수 본문은 옛 라우트(git origin/main)와 한 글자도 다르지 않다', () => {
    let old = '';
    try { old = require('node:child_process').execSync('git show fd91c7ba9:src/app/api/cron/market-feed/route.ts', { cwd: ROOT, encoding: 'utf8' }); } catch { console.log('    (git 기록 없음 — 건너뜀)'); return; }
    const cut = (s: string, a: RegExp, b: RegExp) => { const i = s.search(a); const j = s.search(b); return s.slice(i, j); };
    const oldBody = cut(old, /async function fetchOneQuote/, /export async function GET/);
    const newBody = cut(job, /export async function fetchOneQuote/, /export const FEAR_GREED_ID/).replace(/^export async function/gm, 'async function');
    assert.equal(newBody.trim(), oldBody.trim());
});

console.log('4) 라우트·워커 배선');
const route = read('src/app/api/cron/market-feed/route.ts');
const worker = read('scripts/ec2-cron/market-feed-worker.ts');
t('라우트: 넘김 판정 → 건너뜀 반환이 실행부 import 보다 앞', () => {
    const iCheck = route.indexOf("checkEc2Handoff('market-feed')");
    const iSkip = route.indexOf("skipped: 'ec2'");
    const iImport = route.indexOf("import('@/services/jobs/marketFeedJob')");
    assert.ok(iCheck > 0 && iSkip > iCheck && iImport > iSkip);
    assert.doesNotMatch(route, /^import .*marketFeedJob/m, '실행부를 정적 import 하면 건너뛸 때도 무거운 모듈을 싣는다');
});
t('라우트: 부분 실행은 실패 항목만·F&G·VIX 비교도 그에 맞춤', () => {
    assert.match(route, /only: handoff\.only\.filter\(\(s\) => s !== FEAR_GREED_ID\)/);
    assert.match(route, /fearGreed: handoff\.only\.includes\(FEAR_GREED_ID\)/);
    assert.match(route, /vixCheck: handoff\.only\.includes\('\^VIX'\)/);
});
t('워커: 같은 표식 키·주 저장소 쓰기·다시 읽기 확인', () => {
    assert.match(worker, /setAuthoritativeCache\(ec2MarkerKey\(JOB\)/);
    assert.match(worker, /verifyRead: \(key\) => getAuthoritativeCache\(key\)/);
    assert.match(worker, /const JOB = 'market-feed'/);
});
t('워커: VIX 비교는 1분에 한 번(:07)', () => assert.match(worker, /vixCheck: sec === VIX_CHECK_SEC/));
t('워커: Vercel 라우트를 HTTP 로 부르지 않는다', () => assert.doesNotMatch(worker.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /\/api\//));

console.log(`\n${n}건 통과`);
