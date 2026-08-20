#!/usr/bin/env node
// yt-reschedule — 이미 올린 영상의 «예약 시각»만 바꾸거나 예약을 «해제»한다
//   해제: node scripts/yt-reschedule.mjs <videoId> off
//   변경: node scripts/yt-reschedule.mjs <videoId> "2026-08-21 16:00"
// ⛔ 영상 파일 자체는 교체할 수 없다(유튜브 사양). 내용이 바뀌면 새로 올려야 한다.
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
const g = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const [, , id, when] = process.argv;
if (!id || !when) { console.error('사용: yt-reschedule <videoId> <"YYYY-MM-DD HH:MM" KST | off>'); process.exit(1); }
const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: g('YT_CLIENT_ID'), client_secret: g('YT_CLIENT_SECRET'),
    refresh_token: g('YT_REFRESH_TOKEN'), grant_type: 'refresh_token' }) });
const { access_token } = await r.json();
const cur = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${id}`,
  { headers: { Authorization: `Bearer ${access_token}` } })).json();
const st = cur.items?.[0]?.status;
if (!st) { console.error('영상을 못 찾았다'); process.exit(1); }
const body = { id, status: { privacyStatus: 'private', selfDeclaredMadeForKids: false, license: st.license, embeddable: st.embeddable } };
if (when !== 'off') {
  const m = when.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) { console.error('시각 형식은 "YYYY-MM-DD HH:MM" (KST)'); process.exit(1); }
  const [, Y, M, D, h, mi] = m.map(Number);
  const h24 = h;
  if (h24 >= 22 || h24 < 1) { console.error(`⛔ KST ${h24}시는 실측상 최악 구간(d-0.15, n=578). 거부한다`); process.exit(1); }
  body.status.publishAt = new Date(Date.UTC(Y, M - 1, D, h - 9, mi, 0)).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
const up = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', { method: 'PUT',
  headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const j = await up.json();
if (!up.ok) { console.error('실패', JSON.stringify(j).slice(0, 300)); process.exit(1); }
console.log(`  ${id} → ${j.status.privacyStatus}${j.status.publishAt ? ' · 예약 ' + j.status.publishAt : ' · 예약 해제(수동 공개 대기)'}`);
