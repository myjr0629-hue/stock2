#!/usr/bin/env node
/**
 * 읽기 전용 선물 일별 집계(KST, 40일). .env 파일을 읽지 않는다.
 * 사용: node scripts/gift-funnel.js [--days=7] [--end=YYYY-MM-DD] [--probe] [--json]
 *       node scripts/gift-funnel.js --help
 * 연결은 운영 세션이 환경으로 제공한다(값을 인자/파일/출력에 넣지 말 것):
 * UPSTASH_REDIS_REST_URL 또는 KV_REST_API_URL
 * UPSTASH_REDIS_REST_READ_ONLY_TOKEN 또는 KV_REST_API_READ_ONLY_TOKEN
 * 서버에는 HGETALL만 보낸다. SCAN·쓰기·예약·배정 API 호출 없음.
 * 빈 날짜는 missing(미관측)으로 표시한다. 고유 인원·실제 전달·스토어 등록 완료 지표가 아니다.
 */
'use strict';
const { validEvent, kstDay, funnelKey } = require('../src/lib/giftShare/funnel.cjs');
const STAGES = ['visible', 'tap', 'payload', 'sheet', 'copy', 'cancel', 'failed', 'gate', 'issue', 'open', 'redeem', 'claim'];
function options(args) {
  const opts = { days: 7, end: kstDay(), probe: false, json: false, help: false };
  for (const arg of args) {
    if (arg === '--help') opts.help = true;
    else if (arg === '--probe') opts.probe = true;
    else if (arg === '--json') opts.json = true;
    else if (/^--days=\d+$/.test(arg)) opts.days = Number(arg.slice(7));
    else if (/^--end=\d{4}-\d{2}-\d{2}$/.test(arg)) opts.end = arg.slice(6);
    else throw new Error('사용법 오류: --help 참고');
  }
  if (opts.days < 1 || opts.days > 40 || !Number.isFinite(Date.parse(opts.end)) || new Date(opts.end).toISOString().slice(0, 10) !== opts.end) throw new Error('날짜/일수 오류(1~40일)');
  return opts;
}
function decode(day, raw) {
  if (!Array.isArray(raw) || raw.length % 2) throw new Error('집계 응답 형식 오류');
  const breakdown = [];
  const totals = Object.fromEntries(STAGES.map(s => [s, 0]));
  for (let i = 0; i < raw.length; i += 2) {
    const parts = typeof raw[i] === 'string' ? raw[i].split('|') : [];
    if (parts.length !== 4 || !validEvent(...parts)) continue; // 임의 필드·식별자는 출력하지 않는다
    const count = Number(raw[i + 1]);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('집계 숫자 형식 오류');
    const [stage, surface, platform, detail] = parts;
    totals[stage] += count;
    breakdown.push({ stage, surface, platform, detail, count });
  }
  return { day, status: breakdown.length ? 'ok' : 'missing', totals: breakdown.length ? totals : null, breakdown };
}
async function readDays(opts, env = process.env, request = fetch) {
  const endpoint = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN || env.KV_REST_API_READ_ONLY_TOKEN;
  if (!endpoint || !token) throw new Error('환경에 URL과 읽기 전용 토큰이 필요함(.env 자동 로드 없음)');
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('저장소 URL 형식 오류'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('HTTPS 저장소 URL만 허용');
  const end = Date.parse(opts.end);
  const result = [];
  for (let i = 0; i < opts.days; i++) {
    const day = new Date(end - i * 86400000).toISOString().slice(0, 10);
    const response = await request(url.href, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(['HGETALL', funnelKey(day, !opts.probe)]), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('집계 조회 실패');
    const body = await response.json();
    if (body.error) throw new Error('집계 조회 실패');
    result.push(decode(day, body.result));
  }
  return result;
}
async function main(args = process.argv.slice(2)) {
  const opts = options(args);
  if (opts.help) { console.log('node scripts/gift-funnel.js [--days=7] [--end=YYYY-MM-DD] [--probe] [--json]\nKST · 40일 · HGETALL 전용 · 환경의 읽기 전용 토큰 사용 · .env 읽기 없음'); return; }
  const days = await readDays(opts);
  if (opts.json) console.log(JSON.stringify({ timezone: 'Asia/Seoul', namespace: opts.probe ? 'preview' : 'production', days }, null, 2));
  else {
    console.log('KST 일별 이벤트 수(고유 인원/전달/스토어 등록 완료 아님). missing = 미관측.');
    console.table(days.map(d => ({ day: d.day, status: d.status, ...(d.totals || {}) })));
    for (const d of days) {
      console.log(d.day);
      console.table(d.breakdown);
    }
  }
}
module.exports = { options, decode, readDays };
if (require.main === module) main().catch(() => { console.error('선물 집계 실패: 인자·읽기 전용 환경·연결 상태를 확인하세요.'); process.exitCode = 1; });
