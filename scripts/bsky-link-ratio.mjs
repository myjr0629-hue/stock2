#!/usr/bin/env node
// ============================================================================
// bsky-link-ratio — 우리 블루스키 «본글» 중 링크가 있는 글의 비율을 센다(읽기 전용 · 공개 API · 브라우저 없음).
//
// 규칙: 링크 있는 글 비율 «블루스키 절반 이하»(growth/FREQUENCY-CAPS-2026-10-04.md §2 · 지시서 4)·«링크 비율: 블루스키 절반 이하»).
// 만든 이유(2026-10-05 03시 회차 — 도구의 신호): 10/5 KST 블루스키 본글 3편(00:43·01:43·02:44)이 전부 링크 글이었는데,
//   slot 은 «간격 대기»만 보여 주고 링크 비율은 보여 주지 않았다 — 규칙이 문서에만 있고 도구가 모르면 회차마다 «눈으로 세야» 한다(MISTAKES #49).
//   원장 note 에 «링크 있음/없음»을 적는 방식은 쓰는 사람이 빠뜨린다 → «공개된 실제 본문»(링크 facet·외부 임베드·본문 http)을 읽어 센다.
//
// 사용: node scripts/bsky-link-ratio.mjs [--hours=24] [--quiet]
//   · 원장(PUBLISH-LEDGER.json)에서 bluesky 계정 묶음(mkt-plan.js ACCOUNTS.bluesky_acct.members — 소스에서 «읽어» 쓴다·복사 안 함) 본글의 최근 N시간 글을 고른다
//   · 공개 API(public.api.bsky.app getPosts)로 본문을 읽어 링크 글 수를 센다(읽지 못한 글은 «미확인»으로 따로 센다 — 링크 없음으로 치지 않는다)
//   · 결과 /tmp/ego/bsky-link-ratio.json — mkt-plan.js slot 의 «실행» 줄이 «🔗 링크 글 a/b — 다음 글은 링크 없이» 로 보여 준다
// 종료 코드: 0 = 계산됨(초과 여부와 무관) · 1 = 원장·API 실패
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : d; };
const HOURS = Number(arg('--hours', 24));
const QUIET = process.argv.includes('--quiet');
const OUT = '/tmp/ego/bsky-link-ratio.json';
const API = 'https://public.api.bsky.app/xrpc/';

// 계정 묶음 = mkt-plan.js 소스에서 읽는다(복사하면 새 하위 채널을 넣을 때 어긋난다 — MISTAKES #55)
let members = ['bluesky', 'bluesky_buildinpublic', 'bluesky_pin', 'bluesky_pt'];
try {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/mkt-plan.js'), 'utf8');
  const m = src.match(/bluesky_acct:\s*\{[^}]*?members:\s*\[([^\]]*)\]/);
  if (m) { const got = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]); if (got.length) members = got; }
} catch {}

let entries;
try { entries = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/PUBLISH-LEDGER.json'), 'utf8')).entries || []; }
catch (e) { console.error('원장 읽기 실패:', String(e.message).slice(0, 100)); process.exit(1); }
const since = Date.now() - HOURS * 3600e3;
const posts = entries.filter((e) => members.includes(e.ch) && Date.parse(e.at) >= since && /bsky\.app\/profile\/[^/]+\/post\/[a-z0-9]+/i.test(e.url || ''));

const getJson = async (u) => { const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u.slice(0, 80)); return r.json(); };
const didCache = {};
const didOf = async (h) => { if (h.startsWith('did:')) return h; if (!didCache[h]) didCache[h] = (await getJson(API + 'com.atproto.identity.resolveHandle?handle=' + encodeURIComponent(h))).did; return didCache[h]; };

const items = [];
try {
  const uris = [];
  for (const e of posts) {
    const m = e.url.match(/bsky\.app\/profile\/([^/]+)\/post\/([a-z0-9]+)/i);
    uris.push({ e, uri: `at://${await didOf(m[1])}/app.bsky.feed.post/${m[2]}` });
  }
  const byUri = {};
  for (let i = 0; i < uris.length; i += 20) {
    const chunk = uris.slice(i, i + 20);
    const j = await getJson(API + 'app.bsky.feed.getPosts?' + chunk.map((c) => 'uris=' + encodeURIComponent(c.uri)).join('&'));
    for (const p of j.posts || []) byUri[p.uri] = p;
  }
  for (const { e, uri } of uris) {
    const p = byUri[uri];
    if (!p) { items.push({ at: e.at, ch: e.ch, url: e.url, link: null }); continue; } // 못 읽음 = 미확인(링크 없음으로 세지 않는다)
    const rec = p.record || {};
    const facet = (rec.facets || []).some((f) => (f.features || []).some((x) => String(x.$type || '').endsWith('#link')));
    const ext = JSON.stringify(rec.embed || {}).includes('app.bsky.embed.external');
    const txt = /https?:\/\//i.test(rec.text || '');
    items.push({ at: e.at, ch: e.ch, url: e.url, link: facet || ext || txt });
  }
} catch (e) { console.error('API 실패:', String(e.message).slice(0, 140)); process.exit(1); }

items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const known = items.filter((x) => x.link !== null);
const total = known.length; const withLink = known.filter((x) => x.link).length;
const over = withLink * 2 > total;                       // 이미 절반 초과
const nextLinkOk = (withLink + 1) * 2 <= (total + 1);    // 다음 글에 링크를 넣어도 절반 이하
const res = { at: new Date().toISOString(), hours: HOURS, members, total, withLink, unread: items.length - total, over, nextLinkOk, items: items.map((x) => ({ at: x.at, ch: x.ch, link: x.link, url: x.url.slice(-22) })) };
// 캐시는 «기본 24시간 창»만 쓴다 — 시험용 좁은 창(--hours=1)이 slot 이 읽는 공유 캐시를 덮어쓰면 표시가 틀어진다(10/5 03:18 실제로 «1/1» 로 덮였다).
const WRITE_CACHE = HOURS === 24;
if (WRITE_CACHE) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); }
if (!QUIET) {
  const kstStr = (t) => new Date(Date.parse(t) + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
  console.log(`블루스키 본글 링크 비율(최근 ${HOURS}h · ${members.join('·')}): 링크 글 ${withLink}/${total}` + (total ? ` (${Math.round((withLink / total) * 100)}%)` : '') + (res.unread ? ` · 읽지 못함 ${res.unread}` : ''));
  for (const x of items) console.log('  ' + kstStr(x.at) + ' KST ' + x.ch.padEnd(22) + (x.link === null ? '? 미확인' : x.link ? '🔗 링크' : '— 링크 없음'));
  if (!WRITE_CACHE) console.log('(참고: --hours≠24 라 slot 캐시는 갱신하지 않았다)');
  console.log(!total ? '→ 글 없음' : over ? '⚠ 절반 초과 — 다음 글은 «링크 없는 순수 가치 글»(앱명만)로 비율을 낮춘다' : nextLinkOk ? '✅ 다음 글에 링크를 넣어도 절반 이하' : '△ 지금은 절반 이하지만 다음 글에 링크를 넣으면 초과 — 링크 없는 글을 권장');
}
