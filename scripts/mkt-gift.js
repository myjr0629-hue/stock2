#!/usr/bin/env node
/* ============================================================================
 * mkt-gift — «친구에게 PRO 1개월 선물» 퍼널 (2026-10-06, 브랜치 feat/gift-pro)
 *
 *   앱 안 입구(탭 → 보냄) → 받은 사람의 클릭(사람 판정) → 쿠폰 화면 노출 → 단추(적용·복사·Play) / 안드 «내 쿠폰 받기»(청구)
 *   그리고 «초대자별»(익명 id) 클릭·단추·청구.
 *
 * 읽는 키(전부 EC2 레디스 — Upstash 명령 0, mkt-clicks-human.js·mkt-share.js 와 같은 프록시 get·mget):
 *   share:<tap|sent>:<gift_set|gift_dash>:<via>:<ET날짜>      앱 입구(설정 카드 gift_set · 대시보드 단추 gift_dash), via = 보낸 쪽 플랫폼
 *   clk:sg|code|coupon:gift:<ET날짜>                          태그(from=gift) 합계 — 사람 판정은 «<기기>|human»
 *   clk:gift:<ref 첫 글자>:<ET날짜>                           초대자별 — 필드 «<ref>|<기기>|human|tap:<단추>|claim:<결과>» (lib/gift/giftClick.ts)
 *   mkt:attr:hit:gift:<ET날짜> · mkt:attr:code:gift:<ET날짜>  원시 클릭(봇 포함)
 * 사용: node scripts/mkt-gift.js [일수=3] [--probe]   (--probe = 프리뷰·로컬 시험 키 clkp:* · share:probe:*)
 * 주의: 날짜는 ET. ref 는 기기 로컬 랜덤 id 라 사람과 연결되지 않는다 — «초대자 수»는 «사람 클릭이 있었던 서로 다른 id» 수다.
 *   from=gift 는 이 기능이 운영에 반영되기 전엔 0 이 정상이다. 반영 직전 시험 클릭은 .agent/marketing/clicks-contamination.json 에 있다면 뺀다.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://52.23.98.13:8081';
const KEY = (fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^EC2_REDIS_PROXY_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) { console.error('.env.local 에 EC2_REDIS_PROXY_KEY 가 없다.'); process.exit(1); }

const days = Number(process.argv.find((a) => /^\d+$/.test(a)) || 3);
const PROBE = process.argv.includes('--probe');
const CLK = PROBE ? 'clkp' : 'clk';
const SHARE = PROBE ? 'share:probe' : 'share';
const etDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dates = [...Array(days)].map((_, i) => etDay(new Date(Date.now() - i * 864e5)));
const BUCKETS = [...'abcdefghijklmnopqrstuvwxyz0123456789'];   // 초대자 id 첫 글자(lib/gift/gift.ts GIFT_REF_RE)
const SURF = ['gift_set', 'gift_dash', 'gift_pop'];   // gift_pop = 앱 내 1회 안내(10/8)
const VIAS = ['ios', 'android', 'web', 'na'];

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
    out.push(...res);
  }
  return out;
}
const num = (v) => Number(v) || 0;
const obj = (v) => {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string') { try { const j = JSON.parse(v); return j && typeof j === 'object' ? j : {}; } catch { return {}; } }
  return {};
};
const sum = (o, re) => Object.entries(o).reduce((a, [f, n]) => a + (re.test(f) ? num(n) : 0), 0);

(async () => {
  const keys = [];
  for (const d of dates) {
    for (const e of ['open', 'tap', 'sent']) for (const s of SURF) for (const v of VIAS) keys.push(`${SHARE}:${e}:${s}:${v}:${d}`);
    for (const a of ['sg', 'code', 'coupon']) keys.push(`${CLK}:${a}:gift:${d}`);
    keys.push(`mkt:attr:hit:gift:${d}`, `mkt:attr:code:gift:${d}`);
    for (const b of BUCKETS) keys.push(`${CLK}:gift:${b}:${d}`);
  }
  const vals = await mget(keys);
  const at = (k) => vals[keys.indexOf(k)];

  console.log(`선물 퍼널 · 최근 ${days}일(ET ${dates[dates.length - 1]} ~ ${dates[0]}) · 키 ${CLK}:* ${SHARE}:*${PROBE ? '  ← 시험 키(--probe)' : ''}\n`);

  // 1) 앱 안 입구
  console.log('① 앱 안 입구(보낸 쪽)          띄움     탭   보냄   ← 띄움 = gift_pop(1회 안내)만');
  for (const s of SURF) for (const v of VIAS) {
    const tap = dates.reduce((a, d) => a + num(at(`${SHARE}:tap:${s}:${v}:${d}`)), 0);
    const sent = dates.reduce((a, d) => a + num(at(`${SHARE}:sent:${s}:${v}:${d}`)), 0);
    const open = dates.reduce((a, d) => a + num(at(`${SHARE}:open:${s}:${v}:${d}`)), 0);
    if (open || tap || sent) console.log(`   ${s.padEnd(10)} ${v.padEnd(8)} ${String(open).padStart(6)} ${String(tap).padStart(6)} ${String(sent).padStart(6)}`);
  }

  // 2) 받은 쪽 — 태그(from=gift) 합계, 날짜별
  console.log('\n② 받은 쪽(from=gift 합계, 사람 판정 기준)');
  console.log('   일자        사람클릭(아이폰·안드·PC)   쿠폰화면   단추(적용·복사·Play·설치)   청구(new·again·cap·empty·err)   원시클릭');
  const tot = { human: 0, view: 0, tap: 0, claim: 0 };
  for (const d of dates) {
    const sg = obj(at(`${CLK}:sg:gift:${d}`)); const cp = obj(at(`${CLK}:coupon:gift:${d}`));
    const h = (dev) => num(sg[`${dev}|human`]);
    const human = h('ios') + h('android') + h('desktop');
    const view = sum(cp, /\|view:human$/);
    const tap = (k) => sum(cp, new RegExp(`\\|tap:${k}$`));
    const claim = (k) => sum(cp, new RegExp(`\\|claim:${k}$`));
    const taps = ['apply', 'copy', 'play', 'install'].map(tap);
    const claims = ['new', 'again', 'cap', 'empty', 'err'].map(claim);
    tot.human += human; tot.view += view; tot.tap += taps[0]; tot.claim += claims[0];
    console.log(`   ${d}  ${String(human).padStart(4)} (${h('ios')}·${h('android')}·${h('desktop')})        ${String(view).padStart(5)}      ${taps.join('·').padEnd(18)}      ${claims.join('·').padEnd(14)}      ${num(at(`mkt:attr:hit:gift:${d}`))}`);
  }
  console.log(`   합계        사람 ${tot.human} → 쿠폰 화면 ${tot.view} → 적용 단추 ${tot.tap} / 개인 번호 배정 ${tot.claim}`);

  // 3) 초대자별
  const refs = {};
  for (const d of dates) for (const b of BUCKETS) {
    const blob = obj(at(`${CLK}:gift:${b}:${d}`));
    for (const [f, n] of Object.entries(blob)) {
      const [ref, dev, kind] = f.split('|');
      if (!ref || !kind) continue;
      const r = (refs[ref] = refs[ref] || { human: 0, ios: 0, android: 0, desktop: 0, apply: 0, claim: 0, other: 0 });
      if (kind === 'human') { r.human += num(n); r[dev] = (r[dev] || 0) + num(n); }
      else if (kind === 'tap:apply') r.apply += num(n);
      else if (kind === 'claim:new') r.claim += num(n);
      else r.other += num(n);
    }
  }
  const list = Object.entries(refs).sort((a, b) => b[1].human - a[1].human || b[1].apply + b[1].claim - (a[1].apply + a[1].claim));
  const converted = list.filter(([, r]) => r.apply + r.claim > 0).length;
  console.log(`\n③ 초대자별(익명 id) — 사람 클릭이 있었던 id ${list.length}개 · 그중 친구가 적용/배정까지 간 id ${converted}개`);
  if (list.length) console.log('   id            사람클릭(아이폰·안드·PC)   적용   배정');
  for (const [ref, r] of list.slice(0, 15)) console.log(`   ${ref.padEnd(13)} ${String(r.human).padStart(4)} (${r.ios}·${r.android}·${r.desktop})            ${String(r.apply).padStart(4)}   ${String(r.claim).padStart(4)}`);
  if (list.length > 15) console.log(`   … 외 ${list.length - 15}개`);
  console.log('\n   초대자 한 명이 만든 사람 클릭이 1이면 «친구 1명이 열어 봤다»는 뜻이다. 적용 단추·개인 번호 배정은 «쿠폰을 받으러 갔다»까지다 — 실제 PRO 체험은 애플·RevenueCat 에서 본다.');
})();
