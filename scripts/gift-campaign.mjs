#!/usr/bin/env node
// 공개 캠페인 스위치·현황(2026-11-01). 비밀값은 이미 주입된 환경에서만 읽으며 .env 파일은 열지 않는다. 코드 번호는 읽지도 출력하지도 않는다.
// 사용:
//   node scripts/gift-campaign.mjs --id weekend-1101                                  정의만 출력(외부 접근 0)
//   node scripts/gift-campaign.mjs --id weekend-1101 --status --target production      스위치·오늘/전체 배정 수·채널별 배정·유효 재고 수(읽기 전용)
//   node scripts/gift-campaign.mjs --id weekend-1101 --on  --apply --target production  켜기(스위치 키 = "1", 마감 하루 뒤 자동 만료)
//   node scripts/gift-campaign.mjs --id weekend-1101 --off --apply --target production  끄기(새 배정 0 · 이미 받은 코드 복구는 계속)
// 연결: UPSTASH_REDIS_REST_URL|KV_REST_API_URL + (현황) *_READ_ONLY_TOKEN 우선 · (켜기/끄기) UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN
import { createRequire } from 'node:module';
import { Redis } from '@upstash/redis';
const require = createRequire(import.meta.url);
const { GIFT_CAMPAIGNS } = require('../src/lib/giftShare/campaigns.cjs');

const kstDay = (ms = Date.now()) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--id', '--status', '--on', '--off', '--apply', '--target']);
  for (const a of args.filter(s => s.startsWith('--'))) if (!allowed.has(a)) throw new Error('알 수 없는 인자');
  const value = k => args[args.indexOf(k) + 1];
  const id = args.includes('--id') ? value('--id') : '';
  const c = Object.prototype.hasOwnProperty.call(GIFT_CAMPAIGNS, id) ? GIFT_CAMPAIGNS[id] : null;
  if (!c) throw new Error('캠페인 id 가 목록(src/lib/giftShare/campaigns.cjs)에 없다');
  const on = args.includes('--on'), off = args.includes('--off'), status = args.includes('--status');
  if (on && off) throw new Error('--on 과 --off 는 함께 쓸 수 없다');
  console.log(`캠페인 ${c.id}: 하루 iOS ${c.day.ios}·안드 ${c.day.android} · 전체 iOS ${c.total.ios}·안드 ${c.total.android} · 선물 몫 iOS ${c.reserve.ios}·안드 ${c.reserve.android} · IP 하루 ${c.ipDay} · 마감 ${new Date(c.endsAt).toISOString()}`);
  if (!on && !off && !status) return;
  const target = args.includes('--target') ? value('--target') : '';
  if (target !== 'production' && target !== 'preview') throw new Error('--target production|preview 필요');
  if ((on || off) && !args.includes('--apply')) { console.log(`드라이런: ${target} 에서 ${on ? '켜기' : '끄기'} 예정 — 실제 반영은 --apply`); return; }
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const write = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const read = process.env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN || write;
  const token = on || off ? write : read;
  if (!url || !token) throw new Error('연결 환경변수 없음');
  const r = new Redis({ url, token, automaticDeserialization: false, enableTelemetry: false, retry: { retries: 0 }, signal: () => AbortSignal.timeout(5000) });
  const p = target === 'production' ? 'promo:gift:v1' : 'promo:pv:gift:v1';
  const k = `${p}:camp:${c.id}`;
  if (on) {
    if (Date.now() >= c.endsAt) throw new Error('이미 마감된 캠페인');
    await r.set(`${k}:on`, '1', { ex: Math.ceil((c.endsAt - Date.now()) / 1000) + 86400 });
    console.log('켜짐 반영');
  }
  if (off) { await r.del(`${k}:on`); console.log('꺼짐 반영'); }
  const now = Date.now(), day = kstDay(now);
  const sw = await r.get(`${k}:on`);
  console.log(`스위치: ${sw === '1' ? '켜짐' : '꺼짐'} · 오늘(KST ${day})`);
  for (const os of ['ios', 'android']) {
    const [today, total] = await Promise.all([r.get(`${k}:day:${day}:${os}`), r.get(`${k}:total:${os}`)]);
    const batches = await r.zrange(`${p}:batches:${os}`, now + 1, '+inf', { byScore: true });
    let valid = 0;
    for (const b of batches) {
      const meta = await r.get(`${p}:batch:${b}`);
      let m = null; try { m = JSON.parse(meta); } catch { /* 형식 오류 묶음은 세지 않는다 */ }
      if (m && m.os === os && m.expiresAt > now) valid += Number(await r.llen(`${p}:pool:${os}:${b}`)) || 0;
    }
    console.log(`  ${os}: 오늘 배정 ${Number(today) || 0}/${c.day[os]} · 전체 ${Number(total) || 0}/${c.total[os]} · 유효 재고(선물과 공유) ${valid}장 (캠페인은 ${c.reserve[os]}장 이하에서 멈춤)`);
  }
  // automaticDeserialization:false 이면 hgetall 이 [필드, 값, …] 평평한 배열로 온다(11/1 실측) — 객체로 바꿔 센다.
  const raw = await r.hgetall(`${k}:from:${day}`);
  const from = Array.isArray(raw) ? Object.fromEntries(raw.flatMap((v, i) => i % 2 ? [] : [[v, raw[i + 1]]])) : raw;
  const rows = Object.entries(from || {}).filter(([f]) => /^[a-z0-9_]{1,24}\|(ios|android)$/.test(f)).sort((a, b) => Number(b[1]) - Number(a[1]));
  console.log(`  오늘 채널별 배정: ${rows.length ? rows.map(([f, n]) => `${f} ${n}`).join(' · ') : '없음'}`);
}
main().catch(e => { console.error(`캠페인 처리 실패: ${e && e.message ? e.message : '오류'} (값은 출력하지 않습니다)`); process.exitCode = 1; });
