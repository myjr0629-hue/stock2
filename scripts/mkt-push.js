#!/usr/bin/env node
/* ============================================================================
 * mkt-push — 푸시 발송·탭·하루 활성 기기 (2026-10-12, 브랜치 feat/push-ai-line)
 *
 * 사용: node scripts/mkt-push.js [일수=7] [--text] [--preview] [--json]
 *   --text     그날 나간 본문(ko/en/ja)까지 보여 준다
 *   --preview  프리뷰·로컬 배포가 쓴 퍼널 칸(fxp:)을 읽는다 — 검증용
 *   --json     표 대신 JSON 한 덩어리
 *
 * 읽는 키(쓰는 쪽)
 *   push:stats:{morning|closing}:{ET날짜}  발송 결과 객체 — src/app/api/cron/push/route.ts (실제 발송마다, TTL 60일)
 *       { targets, sent, fail, optedOut, pruned, byPlatform{ios,android}, byLocale{ko,en,ja}, active{seen1d,seen7d,new7d}, body{ko|en|ja:{ai,reason,text}} }
 *   fx:push_open:{push_morning|push_closing}:{플랫폼}:{ET날짜}   푸시를 눌러 연 횟수 — app-view/layout.tsx → /api/funnel-hit
 *   fx:active:app:{플랫폼}:{ET날짜}                              하루 활성 기기(기기마다 ET 하루 1회, 식별자 없음)
 * 전부 EC2 레디스(프록시 /mget, 읽기만). 날짜는 미국 동부.
 * ⚠ 안드로이드 «앱»은 탭·활성을 아직 보내지 않는다(Play 데이터 보안 선언 전 — src/lib/app/funnel.ts FUNNEL_SEND_ANDROID).
 *   그래서 탭률은 iOS 끼리만 나눈다(iOS 탭 ÷ iOS 발송 성공). 안드로이드 활성은 발송 때 센 «최근 1일 안에 앱을 연 푸시 기기»(seen1d)로 본다.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://52.23.98.13:8081'; // mkt-funnel.js · mkt-clicks.js 와 같은 EC2 레디스 프록시
const TYPES = ['morning', 'closing'];
const PLATS = ['ios', 'android', 'web'];
const LOCS = ['ko', 'en', 'ja'];
const etDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

function proxyKey() {
  let k = (process.env.EC2_REDIS_PROXY_KEY || '').trim();
  if (!k) {
    for (const f of [path.join(ROOT, '.env.local'), path.join(process.env.HOME || '', '.gemini/antigravity/scratch/stock2/.env.local')]) {
      try { k = (fs.readFileSync(f, 'utf8').match(/^EC2_REDIS_PROXY_KEY=(.+)$/m) || [])[1]?.trim() || ''; } catch { /* 없음 */ }
      if (k) break;
    }
  }
  if (!k) { console.error('EC2_REDIS_PROXY_KEY 가 없다(.env.local 또는 환경변수).'); process.exit(1); }
  return k;
}

/** /mget 을 120개씩 — 못 읽은 묶음은 null 로 두고 «못 쟀다»를 따로 센다(0 과 구분) */
async function mget(keys, KEY, miss) {
  const out = [];
  for (let i = 0; i < keys.length; i += 120) {
    const chunk = keys.slice(i, i + 120);
    let res = null;
    for (let t = 0; t < 3 && !res; t++) {
      try {
        const r = await fetch(`${BASE}/mget?keys=${chunk.map(encodeURIComponent).join(',')}`, { headers: { Authorization: 'Bearer ' + KEY }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (Array.isArray(j?.results) && j.results.length === chunk.length) res = j.results;
      } catch { await new Promise((z) => setTimeout(z, 300 * (t + 1))); }
    }
    if (!res) { miss.n += chunk.length; res = chunk.map(() => null); }
    out.push(...res);
  }
  return out;
}

const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—');
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const obj = (v) => { if (!v) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return typeof v === 'object' ? v : null; };

async function main() {
  const args = process.argv.slice(2);
  const DAYS = Math.max(1, Math.min(60, Number(args.find((a) => /^\d+$/.test(a)) || 7)));
  const SHOW_TEXT = args.includes('--text');
  const PREVIEW = args.includes('--preview');
  const AS_JSON = args.includes('--json');
  const KEY = proxyKey();
  const ns = PREVIEW ? 'fxp' : 'fx';
  const dates = [...Array(DAYS)].map((_, i) => etDay(new Date(Date.now() - i * 864e5)));
  const miss = { n: 0 };

  const statKeys = []; for (const d of dates) for (const t of TYPES) statKeys.push([`push:stats:${t}:${d}`, d, t]);
  const tapKeys = []; for (const d of dates) for (const t of TYPES) for (const p of PLATS) tapKeys.push([`${ns}:push_open:push_${t}:${p}:${d}`, d, t, p]);
  const actKeys = []; for (const d of dates) for (const p of PLATS) actKeys.push([`${ns}:active:app:${p}:${d}`, d, p]);
  const [statVals, tapVals, actVals] = [
    await mget(statKeys.map((k) => k[0]), KEY, miss),
    await mget(tapKeys.map((k) => k[0]), KEY, miss),
    await mget(actKeys.map((k) => k[0]), KEY, miss),
  ];

  const rows = {}; // date → type → {...}
  statKeys.forEach(([, d, t], i) => { ((rows[d] ||= {})[t] ||= {}).stats = obj(statVals[i]); });
  tapKeys.forEach(([, d, t, p], i) => { (((rows[d] ||= {})[t] ||= {}).taps ||= {})[p] = Number(tapVals[i]) || 0; });
  const active = {}; actKeys.forEach(([, d, p], i) => { (active[d] ||= {})[p] = Number(actVals[i]) || 0; });

  if (AS_JSON) { console.log(JSON.stringify({ dates, rows, active, unread: miss.n }, null, 2)); return; }

  console.log(`\n── 푸시 발송·탭 (최근 ${DAYS}일 · ET ${dates[dates.length - 1]} ~ ${dates[0]}${PREVIEW ? ' · 탭은 프리뷰 칸' : ''}) ──`);
  console.log(pad('ET날짜', 12) + pad('종류', 9) + lpad('대상', 6) + lpad('성공', 6) + lpad('실패', 6) + lpad('끔', 5) + lpad('iOS성공', 8) + lpad('안드성공', 8) + lpad('iOS탭', 7) + lpad('iOS탭률', 9) + '  본문(ko/en/ja)');
  let any = false;
  for (const d of dates) for (const t of TYPES) {
    const r = rows[d]?.[t] || {};
    const s = r.stats;
    const taps = r.taps || {};
    const tapIos = taps.ios || 0;
    if (!s && !tapIos && !taps.android && !taps.web) continue;
    any = true;
    const body = s?.body ? LOCS.map((l) => (s.body[l]?.ai ? 'AI' : `정적(${s.body[l]?.reason || '?'})`)).join(' / ') : '—';
    const iosSent = s?.byPlatform?.ios?.sent ?? 0;
    console.log(pad(d, 12) + pad(t === 'morning' ? '모닝' : '마감', 9)
      + lpad(s ? s.targets : '—', 6) + lpad(s ? s.sent : '—', 6) + lpad(s ? s.fail : '—', 6) + lpad(s ? s.optedOut : '—', 5)
      + lpad(s ? iosSent : '—', 8) + lpad(s ? (s.byPlatform?.android?.sent ?? 0) : '—', 8)
      + lpad(tapIos, 7) + lpad(s ? pct(tapIos, iosSent) : '—', 9) + '  ' + body);
    if (SHOW_TEXT && s?.body) for (const l of LOCS) console.log(' '.repeat(21) + `${l}: ${s.body[l]?.text || ''}`);
  }
  if (!any) console.log('(기록 없음 — 2026-10-12 배포 뒤 첫 실제 발송부터 쌓인다)');

  console.log('\n── 하루 활성 기기 ──');
  console.log(pad('ET날짜', 12) + lpad('iOS앱', 7) + lpad('웹뷰기타', 9) + lpad('│ 발송때 1일내 앱연 푸시기기 iOS', 30) + lpad('안드', 6) + lpad('7일내 iOS', 10) + lpad('안드', 6) + lpad('신규7일', 8));
  for (const d of dates) {
    const a = active[d] || {};
    const s = rows[d]?.morning?.stats || rows[d]?.closing?.stats;
    const ac = s?.active;
    if (!a.ios && !a.web && !a.android && !ac) continue;
    console.log(pad(d, 12) + lpad(a.ios || 0, 7) + lpad((a.web || 0) + (a.android || 0), 9)
      + lpad(ac ? ac.seen1d?.ios ?? 0 : '—', 30) + lpad(ac ? ac.seen1d?.android ?? 0 : '—', 6)
      + lpad(ac ? ac.seen7d?.ios ?? 0 : '—', 10) + lpad(ac ? ac.seen7d?.android ?? 0 : '—', 6)
      + lpad(ac ? (ac.new7d?.ios ?? 0) + (ac.new7d?.android ?? 0) : '—', 8));
  }
  console.log('  ※ iOS앱 = 앱이 하루 1회 보낸 «active»(식별자 없음). 발송때 수치 = 등록 POST 의 lastSeenAt(2026-10-12부터 기록) — 첫 7일은 쌓이는 중.');
  if (miss.n) console.log(`\n⚠ 못 읽은 키 ${miss.n}개(프록시 오류) — 0 이 아니라 «모름»`);
}

if (require.main === module) main().catch((e) => { console.error(e?.message || e); process.exit(1); });
module.exports = { TYPES, PLATS };
