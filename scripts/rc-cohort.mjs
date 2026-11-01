#!/usr/bin/env node
/** Read-only, UTC cohort dates; requires existing Upstash env vars, never loads .env. */
import { pathToFileURL } from 'node:url';
import { Redis } from '@upstash/redis';
const PREFIX = 'rc:cohort:v1';
export function summarize(events, from, to, now = Date.now()) {
  const start = Date.parse(`${from}T00:00:00.000Z`), end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0, 10) !== from || new Date(end).toISOString().slice(0, 10) !== to || start >= end) throw new Error('Invalid UTC date range (FROM inclusive, TO exclusive)');
  const data = events.filter(e => e && e.environment === 'PRODUCTION');
  const starts = data.filter(e => e.type === 'INITIAL_PURCHASE' && e.period === 'TRIAL' && e.purchased != null && e.purchased >= start && e.purchased < end);
  const result = { denominator: starts.length, ended_on: 0, ended_off: 0, unresolved: 0, not_ended: 0, first_paid_renewal: 0, refund_signal: 0, retrial: 0, unlinked: 0 };
  for (const trial of starts) {
    const earlier = data.some(e => e !== trial && e.user === trial.user && e.type === 'INITIAL_PURCHASE' && e.period === 'TRIAL' && e.purchased != null && e.purchased < trial.purchased);
    if (earlier) result.retrial++;
    if (!trial.transaction || !trial.expires || trial.expires <= trial.purchased) { result.unlinked++; result.unresolved++; continue; }
    const nextTrial = data.filter(e => e.user === trial.user && e.transaction === trial.transaction && e.type === 'INITIAL_PURCHASE' && e.period === 'TRIAL' && e.purchased != null && e.purchased > trial.purchased).reduce((n, e) => Math.min(n, e.purchased), Infinity);
    const related = data.filter(e => e.user === trial.user && e.transaction === trial.transaction && (e.purchased == null || e.purchased < nextTrial));
    const paid = related.some(e => e.type === 'RENEWAL' && e.period === 'NORMAL' && e.purchased != null && e.purchased >= trial.expires && e.purchased < nextTrial);
    if (paid) result.first_paid_renewal++;
    if (related.some(e => e.reason === 'CUSTOMER_SUPPORT' && (e.type === 'CANCELLATION' || e.type === 'EXPIRATION'))) result.refund_signal++;
    if (trial.expires > now) { result.not_ended++; continue; }
    if (paid) { result.ended_on++; continue; }
    const terminal = related.some(e => e.type === 'EXPIRATION' && e.expires === trial.expires);
    if (!terminal) { result.unresolved++; continue; }
    const terminalOff = related.some(e => e.type === 'EXPIRATION' && e.expires === trial.expires && e.reason === 'UNSUBSCRIBE');
    const changes = related.filter(e => (e.type === 'CANCELLATION' || e.type === 'UNCANCELLATION') && e.at <= trial.expires && e.expires === trial.expires).sort((a, b) => b.at - a.at);
    if (terminalOff || (changes.length && changes[0].type === 'CANCELLATION' && changes[0].reason === 'UNSUBSCRIBE' && (!changes[1] || changes[0].at !== changes[1].at))) result.ended_off++;
    else result.unresolved++;
  }
  return result;
}
async function main() {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) throw new Error('Usage: node scripts/rc-cohort.mjs YYYY-MM-DD YYYY-MM-DD (UTC, end exclusive)');
  summarize([], from, to);
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis configuration missing');
  const redis = new Redis({url, token, retry: {retries: 0}, enableTelemetry: false, signal: () => AbortSignal.timeout(3000)});
  // Cap requests to the same endpoint below ten per minute, including SCAN.
  let lastRequest = 0;
  const read = async fn => { const wait = 6100 - (Date.now() - lastRequest); if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait)); lastRequest = Date.now(); return fn(); };
  let cursor = '0'; const keys = new Set();
  do { const page = await read(() => redis.scan(cursor, {match: `${PREFIX}:event:*`, count: 200})); cursor = String(page[0]); for (const key of page[1]) keys.add(key); } while (cursor !== '0');
  const events = []; let missing = 0; const list = [...keys];
  for (let i = 0; i < list.length; i += 200) {
    const values = await read(() => redis.mget(...list.slice(i, i + 200)));
    for (const event of values) { if (event && typeof event === 'object') events.push(event); else missing++; }
  }
  const result = summarize(events, from, to);
  console.log(JSON.stringify({ cohort_utc: {from_inclusive: from, to_exclusive: to}, observed_at_utc: new Date().toISOString(), ...result,
    notes: ['PRO 기능 사용 및 사용→갱신 전환율: 미측정', '종료 갱신 켬은 유료 갱신 증거가 있을 때만 확정; 그 외 근거 부족은 미확정', '환불 신호는 CUSTOMER_SUPPORT 사유의 대리 지표이며 확정 환불 건수가 아님', '재체험은 보존된 앞선 체험 기록이 있는 경우만 탐지', '가명 이벤트는 수신 후 120일 만료; 관측 기간 이전 기록·미수신·계정 이전·식별자 변경은 연결 불가', '읽는 동안 변경된 자료는 일관된 스냅샷이 아님; 웹훅 실패·누락은 별도 공급자 확인 필요'], missing_during_read: missing }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('조회 실패: 인자, 저장소 설정 및 연결을 확인하십시오.'); process.exitCode = 1; });
