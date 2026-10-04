#!/usr/bin/env node
'use strict';
// 계정 건강 점검 — 공개 신호로 «자동 한 단계 하향»(scripts/lib/mkt-health.js)을 먹인다. 비로그인·읽기 전용. slot 이 3시간에 한 번 돌린다.
//  ① Bluesky 공개 API: 프로필 라벨(스팸·경고·정지류) · 도달 급감(최근 3일 글당 반응 ≤ 앞 14일의 20% — 앞 14일 글당 1.0 이상·최근 글 8편·앞 글 12편 이상일 때만. 표본이 작은 계정(팔로워 28)은 반응이 원래 들쭉날쭉해 4편 0건은 신호가 아니다 — 10/4 09시 실측 오탐을 보고 올림)
//  ② 발행 원장: 최근 7일 안에 한 채널의 note 에 «공개 미확인·삭제됨·필터 의심» 이 2건 이상 → 그 채널(계정묶음). 1건은 신호가 아니다(pub 때 사람이 적으면 pub 이 즉시 반응)
//  신호는 `mkt-plan.js fail <채널> --scan <사유>` 로 넘긴다(계정 묶음 매핑·분류·기록은 거기 한 곳). 이미 하향 중이면 기한을 밀지 않는다.
// 실패해도 slot 을 막지 않는다(항상 종료코드 0).
const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const LEDGER = process.env.MKT_LEDGER_PATH || path.join(ROOT, '.agent/marketing/PUBLISH-LEDGER.json');
const lines = []; const acts = [];
const flag = (ch, reason) => { const r = spawnSync(process.execPath, [path.join(__dirname, 'mkt-plan.js'), 'fail', ch, '--scan', reason], { encoding: 'utf8', timeout: 20000, env: process.env }); acts.push(String(r.stdout || r.stderr || '').trim().split('\n')[0]); };
(async () => {
  try {
    const J = async (u) => { const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
    const actor = 'signumhq.bsky.social';
    const p = await J('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=' + actor);
    const bad = (p.labels || []).map((l) => l.val).filter((v) => /^(spam|!warn|!hide|!takedown|!suspend|!filter|impersonation|scam|inauthentic|misleading)$/i.test(v));
    const f = await J('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=' + actor + '&limit=100&filter=posts_no_replies');
    const posts = (f.feed || []).filter((x) => !x.reason).map((x) => x.post); const now = Date.now();
    const age = (q) => now - Date.parse(q.record.createdAt); const eng = (q) => (q.likeCount || 0) + (q.repostCount || 0) + (q.replyCount || 0) + (q.quoteCount || 0);
    const rec = posts.filter((q) => age(q) >= 6 * 3600e3 && age(q) < 3 * 864e5); const base = posts.filter((q) => age(q) >= 3 * 864e5 && age(q) < 17 * 864e5);
    const m = (a) => (a.length ? a.reduce((s, q) => s + eng(q), 0) / a.length : null); const mr = m(rec), mb = m(base);
    lines.push(`bluesky 라벨 ${bad.length ? bad.join(',') : '없음'} · 글당 반응 최근3일 ${mr == null ? '-' : mr.toFixed(2)}(${rec.length}편) vs 앞14일 ${mb == null ? '-' : mb.toFixed(2)}(${base.length}편)`);
    if (bad.length) flag('bluesky', '프로필 라벨 ' + bad.join(',') + ' (스팸·경고 신호)');
    if (rec.length >= 8 && base.length >= 12 && mb >= 1.0 && mr <= mb * 0.2) flag('bluesky', `도달 급감 — 글당 반응 ${mr.toFixed(2)} ≤ 앞 14일 ${mb.toFixed(2)} 의 20%(최근 ${rec.length}편)`);
  } catch (e) { lines.push('bluesky 점검 실패(' + String(e.message).slice(0, 40) + ') — 신호 없음으로 둔다'); }
  try {
    const led = JSON.parse(fs.readFileSync(LEDGER, 'utf8')).entries; const cut = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10); const by = {};
    for (const e of led) { if (e.kst >= cut && /공개 미확인|삭제됨|필터 의심|removed by/i.test(e.note || '')) by[e.ch] = (by[e.ch] || 0) + 1; }
    for (const [ch, n] of Object.entries(by)) { lines.push(`${ch} 원장 7일 «공개 미확인·삭제» ${n}건` + (n >= 2 ? ' → 신호' : ' (2건 미만 — 신호 아님)')); if (n >= 2) flag(ch, `원장 노트 «공개 미확인·삭제됨» ${n}건/7일`); }
    if (!Object.keys(by).length) lines.push('원장 7일 «공개 미확인·삭제» 노트 없음');
  } catch { lines.push('원장 점검 실패'); }
  console.log(lines.concat(acts.filter(Boolean)).join('\n')); process.exit(0);
})().catch((e) => { console.log('건강 점검 오류: ' + String(e.message).slice(0, 60)); process.exit(0); });
