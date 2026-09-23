#!/usr/bin/env node
/* reddit-edit — 내 레딧 댓글을 «로그인된 페이지 안의 사이트 API(/api/editusertext)»로 고치고 반영을 확인한다.
 * ★2026-09-23: 마이크론 댓글에 9/22(화)를 «Monday» 로 적은 것을 정정하며 만들었다. 판정·사실이 틀리면 즉시 고친다.
 * 사용: /tmp/ego/reddit-edit.json = {"id":"t1_xxx","post":"<글 id>","cid":"<댓글 id>","file":"/tmp/ego/fixed.txt"} → ego-browser nodejs < scripts/reddit-edit.mjs
 * ⚠ 확인 문구(«Tuesday...»)는 이번 정정용이다 — 다른 수정에서는 확인 조건을 그 수정에 맞게 바꾼다. */
// 레딧 댓글 수정 — 로그인된 페이지 안에서 사이트 API(/api/editusertext)를 부른다(쿠키·modhash 는 페이지 밖으로 안 나간다)
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync('/tmp/ego/reddit-edit.json', 'utf8'));
const text = fs.readFileSync(T.file, 'utf8').trim();
if (/https?:\/\//.test(text)) { console.log('⛔ 링크 금지'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
const page = await L.findPage(ts, /reddit\.com/, null);
if (!/reddit\.com/.test(await page.url())) { try { await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' }); } catch {} await L.wait(5000); }
const r = await page.evaluate(async (a) => {
  const me = await (await fetch('/api/me.json')).json();
  const mh = me?.data?.modhash; if (!mh) return { err: 'no modhash' };
  const body = new URLSearchParams({ thing_id: a.id, text: a.text, api_type: 'json', uh: mh });
  const res = await fetch('/api/editusertext', { method: 'POST', body, headers: { 'X-Modhash': mh } });
  const j = await res.json().catch(() => null);
  return { status: res.status, errors: j?.json?.errors || null };
}, { id: T.id, text });
console.log('수정 응답:', JSON.stringify(r));
const v = await page.evaluate(async (a) => { const j = await (await fetch(`/comments/${a.post}/comment/${a.cid}/.json`)).json(); const c = j?.[1]?.data?.children?.[0]?.data; return { body: (c?.body || ''), removed: c?.removed_by_category || null }; }, T);
console.log('확인:', v.body.trim() === text ? '✅ 수정 반영(본문 일치)' : '⛔ 본문이 다르다', v.removed || '');
