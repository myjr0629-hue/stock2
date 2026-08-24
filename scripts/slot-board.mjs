#!/usr/bin/env node
// ============================================================================
// slot-board — 「하루 3편」 슬롯이 어디가 비었는지 «보여준다»
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-24 대표 지시) — 「스케쥴 잘 기억해서 빈 슬롯에 넣도록해」
//   내가 기억으로 슬롯을 관리하다가 이미 두 번 틀렸다:
//     · 테스트2 를 테스트1 27분 뒤에 올렸다 (자기잠식 z=3.02 를 내가 재놓고 어겼다)
//     · ET 04:36 새벽에 올렸다
//   ⇒ 기억이 아니라 «표» 를 본다. 올리기 전에 이걸 먼저 돌린다.
//
// ── 슬롯 (대표 지시 2026-08-24) ──────────────────────────────────────────────
//   하루 3편. 마지막은 19시. 중간 전에도 하나.
//   🇯🇵 JST 10:00 / 14:00 / 19:00
//   🇺🇸 ET  09:00 / 13:00 / 19:00
//     ⛔ 미국 시각의 근거: ET 06~12 14편 중앙 86 (최고작 3편 전부 여기) ·
//        12~18 5편 중앙 42 · 18~24 6편 중앙 40 · 00~06 2편 중앙 18
//        ⇒ 09시가 최고 구간. 13·19 시는 대표 지시(3편 구조)를 따른 배치이고 «미검증» 이다.
//
// 사용: node scripts/slot-board.mjs [일수=3]
// ============================================================================
import { readFileSync } from 'node:fs';

const DAYS = +(process.argv[2] || 3);
const env = readFileSync('.env.local', 'utf8');
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim() || null;

const CH = [
  { key: 'jp', label: '🇯🇵 일본', tz: 'Asia/Tokyo', zone: 'JST', off: 9, slots: [10, 14, 19], rt: g('YT_JP_REFRESH_TOKEN') },
  { key: 'hq', label: '🇺🇸 미국', tz: 'America/New_York', zone: 'ET', off: -4, slots: [9, 13, 19], rt: g('YT_REFRESH_TOKEN') },
];

const tokenFor = async (rt) => (await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'), refresh_token: rt, grant_type: 'refresh_token' }),
})).json()).access_token;

/** 그 채널 현지시각의 'YYYY-MM-DD HH' */
const localOf = (iso, tz) => {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(d);
  const v = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return { d: `${v.year}-${v.month}-${v.day}`, h: +v.hour };
};

for (const c of CH) {
  if (!c.rt) { console.log(`\n  ${c.label}: 토큰 없음`); continue; }
  const H = { Authorization: `Bearer ${await tokenFor(c.rt)}` };
  const me = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: H })).json();
  const up = me.items[0].contentDetails.relatedPlaylists.uploads;
  const pl = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=30`, { headers: H })).json();
  const ids = pl.items.map((x) => x.contentDetails.videoId);
  const vs = (await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,statistics&id=${ids.join(',')}`, { headers: H })).json()).items || [];

  // 이미 «자리를 차지한» 것: 공개된 것은 publishedAt, 예약은 publishAt
  const taken = new Map();
  for (const v of vs) {
    const at = v.status.publishAt || (v.status.privacyStatus === 'public' ? v.snippet.publishedAt : null);
    if (!at) continue;
    const { d, h } = localOf(at, c.tz);
    (taken.get(d) || taken.set(d, []).get(d)).push({ h, t: v.snippet.title, id: v.id,
      views: +(v.statistics?.viewCount || 0), sched: !!v.status.publishAt });
  }

  const now = new Date();
  console.log(`\n  ${c.label} — 슬롯 ${c.slots.map((s) => String(s).padStart(2, '0') + ':00').join(' / ')} ${c.zone}`);
  for (let i = 0; i < DAYS; i++) {
    const day = new Date(now.getTime() + i * 864e5);
    const { d } = localOf(day.toISOString(), c.tz);
    const rows = taken.get(d) || [];
    const line = c.slots.map((s) => {
      // ±90분 안에 있으면 그 슬롯을 차지한 것으로 본다
      const hit = rows.find((r) => Math.abs(r.h - s) <= 1);
      if (!hit) return `${String(s).padStart(2, '0')}시 ⬜ 비었다`;
      return `${String(s).padStart(2, '0')}시 ${hit.sched ? '⏳' : '✅'} ${hit.t.slice(0, 16)}${hit.sched ? '' : ` (${hit.views})`}`;
    });
    const extra = rows.filter((r) => !c.slots.some((s) => Math.abs(r.h - s) <= 1));
    console.log(`   ${d}  ` + line.join('  |  '));
    for (const e of extra) console.log(`              ↳ 슬롯 밖 ${String(e.h).padStart(2, '0')}시 ${e.t.slice(0, 30)}`);
  }
}
console.log('\n  ⬜ 비었다 · ⏳ 예약됨 · ✅ 게시됨');
console.log('  ⚠️ 13시·19시 슬롯은 대표 지시로 정한 것이고 우리 실측 근거는 없다 (미검증).');
