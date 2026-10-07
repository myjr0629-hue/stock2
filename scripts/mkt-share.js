#!/usr/bin/env node
/**
 * mkt-share — 공유 루프 퍼널 (2026-09-29, 브랜치 feat/share-loop)
 *
 *   탭(tap) → 보냄(sent) → 받은 사람이 엶(open) → 앱 받기 누름(click) → 스토어 이동(/app?from=share)
 *
 * 앞의 넷은 /api/share-hit 비콘이 EC2 레디스에만 쓴 `share:<e>:<표면>:<via>:<ET날짜>`,
 * 마지막은 기존 스마트링크 집계 `mkt:attr:hit:share:<ET날짜>`(+ /app 만 쓰는 기기 칸)다.
 * 읽기는 mkt-clicks.js 와 같은 EC2 프록시 /mget — Upstash 는 한 번도 안 부른다.
 *
 * 사용: node scripts/mkt-share.js [일수=7] [--probe]   (--probe = 프리뷰·로컬 검증 키 share:probe:*)
 * 주의: 날짜는 ET 다. via 는 «보낸 쪽» 플랫폼, 스토어 이동의 기기 칸은 «받은 쪽» 기기다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const BASE = 'http://52.23.98.13:8081';
const KEY = (fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^EC2_REDIS_PROXY_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) { console.error('.env.local 에 EC2_REDIS_PROXY_KEY 가 없다.'); process.exit(1); }

const days = Number(process.argv.find((a) => /^\d+$/.test(a)) || 7);
const NS = process.argv.includes('--probe') ? 'share:probe' : 'share';
const E = ['tap', 'sent', 'open', 'click'];
const S = ['ticker', 'rank', 'uc', 'wim', 'gift_set', 'gift_dash', 'gift_pop'];   // gift_* = «친구에게 PRO 1개월 선물»(2026-10-06)
const V = ['ios', 'android', 'web', 'na'];
const P = ['ios', 'android', 'desktop'];
const etDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
const dates = [...Array(days)].map((_, i) => etDay(new Date(Date.now() - i * 864e5)));

async function mget(keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 60) {            // URL 길이를 넘기지 않게 60개씩
    const part = keys.slice(i, i + 60);
    let res = null;
    for (let k = 0; k < 3 && !res; k++) {
      try {
        const r = await fetch(`${BASE}/mget?keys=${part.map(encodeURIComponent).join(',')}`, { headers: { Authorization: 'Bearer ' + KEY } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        res = (await r.json()).results;
      } catch { await new Promise((z) => setTimeout(z, 300 * (k + 1))); }
    }
    if (!res) { console.log('⛔ 일부를 못 쟀다 — 아래는 «하한»이다. 다시 돌릴 것.'); res = part.map(() => null); }
    out.push(...res.map((v) => Number(v) || 0));
  }
  return out;
}

(async () => {
  const keys = [];
  for (const d of dates) for (const e of E) for (const s of S) for (const v of V) keys.push(`${NS}:${e}:${s}:${v}:${d}`);
  const hitKeys = [];
  for (const d of dates) { hitKeys.push(`mkt:attr:hit:share:${d}`); for (const p of P) hitKeys.push(`mkt:attr:hit:share:${p}:${d}`); }
  const vals = await mget(keys);
  const hits = await mget(hitKeys);

  const at = (e, s, v) => dates.reduce((sum, d) => sum + vals[keys.indexOf(`${NS}:${e}:${s}:${v}:${d}`)], 0);
  console.log(`공유 퍼널 · 최근 ${days}일(ET ${dates[dates.length - 1]} ~ ${dates[0]}) · 키 ${NS}:*\n`);
  console.log('표면     via       탭   보냄   열림   앱받기');
  for (const s of S) for (const v of V) {
    const row = E.map((e) => at(e, s, v));
    if (row.every((x) => x === 0)) continue;
    console.log(`${s.padEnd(8)} ${v.padEnd(8)} ${row.map((x) => String(x).padStart(5)).join(' ')}`);
  }
  const tot = E.map((e) => S.reduce((a, s) => a + V.reduce((b, v) => b + at(e, s, v), 0), 0));
  console.log(`${'합계'.padEnd(15)} ${tot.map((x) => String(x).padStart(5)).join(' ')}`);

  const hitTotal = dates.reduce((a, d) => a + hits[hitKeys.indexOf(`mkt:attr:hit:share:${d}`)], 0);
  const byP = P.map((p) => dates.reduce((a, d) => a + hits[hitKeys.indexOf(`mkt:attr:hit:share:${p}:${d}`)], 0));
  console.log(`\n스토어 이동(from=share, /app·/app-uc·/app-wim 합): ${hitTotal}  — /app 기기별(받은 쪽): 아이폰 ${byP[0]} · 안드로이드 ${byP[1]} · PC ${byP[2]}`);
  console.log('일별 스토어 이동: ' + dates.map((d) => `${d.slice(5)} ${hits[hitKeys.indexOf(`mkt:attr:hit:share:${d}`)]}`).join(' · '));
})();
