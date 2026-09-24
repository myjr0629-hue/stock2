#!/usr/bin/env node
/* ============================================================================
 * bsky-pin — 우리 블루스키 프로필의 «고정 게시물»을 바꾼다(프로필 레코드의 pinnedPost).
 *
 * ★2026-09-25 신설: 블루스키 답글(bluesky_reply)은 링크가 없어서, 큰 계정 스레드에서 우리를 본 사람의
 *   유일한 길은 «프로필»이다. 그런데 프로필에 고정 게시물이 없었다(공개 API getProfile.pinnedPost = None).
 *   → 앱이 무엇을 보여 주는지 한 장으로 설명한 글(링크 from=bluesky_pin)을 맨 위에 고정한다.
 * 사용: node scripts/bsky-pin.mjs <게시물 at-uri>        (고정)
 *       node scripts/bsky-pin.mjs --check                (현재 고정 게시물만 출력)
 * 인증: .env.local 의 BLUESKY_HANDLE / BLUESKY_APP_PASSWORD (bsky-publish.mjs 와 같은 앱 비밀번호, API 로만 쓴다)
 * 검증: 공개 API app.bsky.actor.getProfile 의 pinnedPost.uri 가 방금 넣은 값인지 본다.
 * ========================================================================== */
import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env.local') });
const PDS = 'https://bsky.social';
const PUB = 'https://public.api.bsky.app';
const handle = process.env.BLUESKY_HANDLE;

const pub = async (actor) => (await fetch(`${PUB}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`)).json();
const arg = process.argv[2];
if (!arg || arg === '--check') { const p = await pub(handle); console.log('pinnedPost:', JSON.stringify(p.pinnedPost || null)); process.exit(0); }
if (!/^at:\/\/did:plc:[a-z0-9]+\/app\.bsky\.feed\.post\/[a-z0-9]+$/.test(arg)) { console.log('⛔ 게시물 at-uri 가 아니다'); process.exit(1); }

const sres = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: handle, password: process.env.BLUESKY_APP_PASSWORD }) });
if (!sres.ok) { console.log('⛔ 세션 실패', sres.status); process.exit(1); }
const s = await sres.json();
if (!arg.includes(s.did)) { console.log('⛔ 우리 계정의 게시물이 아니다'); process.exit(1); }
const auth = { Authorization: `Bearer ${s.accessJwt}` };
// 고정할 게시물의 cid(공개 API 로 확인 — 존재하는 글만 고정한다)
const th = await (await fetch(`${PUB}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(arg)}&depth=0`)).json();
const cid = th?.thread?.post?.cid;
if (!cid) { console.log('⛔ 게시물을 찾지 못했다'); process.exit(1); }
// 프로필 레코드를 읽어 pinnedPost 만 바꿔 되쓴다(다른 칸은 그대로) — swapRecord 로 동시 수정 충돌 방지
const gr = await fetch(`${PDS}/xrpc/com.atproto.repo.getRecord?repo=${s.did}&collection=app.bsky.actor.profile&rkey=self`, { headers: auth });
const rec = gr.ok ? await gr.json() : null;
const value = { ...(rec?.value || { $type: 'app.bsky.actor.profile' }), pinnedPost: { uri: arg, cid } };
const body = { repo: s.did, collection: 'app.bsky.actor.profile', rkey: 'self', record: value };
if (rec?.cid) body.swapRecord = rec.cid;
const pr = await fetch(`${PDS}/xrpc/com.atproto.repo.putRecord`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
if (!pr.ok) { console.log('⛔ 프로필 저장 실패', pr.status, (await pr.text()).slice(0, 200)); process.exit(1); }
// 공개 확인(반영이 늦을 수 있어 몇 번 본다)
for (let i = 0; i < 6; i++) {
  const p = await pub(handle);
  if (p?.pinnedPost?.uri === arg) { console.log('✅ 고정 확인(공개 API):', arg); process.exit(0); }
  await new Promise((r) => setTimeout(r, 2000));
}
console.log('⚠ 저장은 됐지만 공개 API 에 아직 안 보인다 — 잠시 뒤 --check');
