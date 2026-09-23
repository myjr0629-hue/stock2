#!/usr/bin/env node
/* ============================================================================
 * mastodon-post — 마스토돈에 «클릭 없이» 글을 올리고, 스스로 공개 검증한다.
 *
 * ★2026-09-23 만든 이유:
 *   웹 작성기를 손으로 몰면 «이미지 설명(ALT)» 칸을 두 번 연속 못 찾았다(ALT 배지 → 모달 → textarea 가
 *   렌더 타이밍마다 달랐다). 마스토돈은 ALT 없는 이미지를 문화적으로 싫어한다 — 도달·평판 손실.
 *   그런데 로그인된 웹 페이지에는 그 사이트 자신의 API 토큰이 들어 있다(initial-state.meta.access_token).
 *   → reddit-comment.mjs 와 같은 방식: **로그인된 페이지 «안에서» 그 사이트 API 를 부른다.**
 *     토큰은 페이지 밖으로 꺼내지 않는다(콘솔에도 안 찍는다).
 *   실측: 이 방식으로 이미 올라간 두 글에 ALT 를 붙였다(HTTP 200, 링크·본문 그대로).
 *
 * 사용(ego 런타임은 env·argv 를 못 받는다 → 작업 파일로 넘긴다):
 *   cat > /tmp/ego/mastodon-task.json <<'J'
 *   {"text_file":"/tmp/ego/m.txt","url":"https://signumhq.com/app?from=mastodon",
 *    "image":"/abs/path.png","alt":"이미지 설명(필수)","lang":"en"}
 *   J
 *   ego-browser nodejs < scripts/mastodon-post.mjs
 *
 * 안전선(스크립트가 강제한다):
 *   · ALT 없이 이미지를 올리지 않는다 · 500자(링크 23자 환산) 초과 거부 · 스마트링크(?from=mastodon) 필수
 *   · 게시 후 «로그인 없이» 공개 API 로 다시 읽어 본문·이미지·ALT·링크를 확인한다. 확인 못 하면 실패로 끝낸다.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;

const TASK = '/tmp/ego/mastodon-task.json';
let task;
try { task = JSON.parse(fs.readFileSync(TASK, 'utf8')); } catch { console.log('작업 파일이 없다:', TASK); process.exit(1); }
const body = fs.readFileSync(task.text_file, 'utf8').trim();
const url = String(task.url || '').trim();
if (!/signumhq\.com\/app(-uc|-wim)?\?from=mastodon/.test(url)) { console.log('⛔ 스마트링크(?from=mastodon)가 아니다'); process.exit(1); }
if (task.image && !String(task.alt || '').trim()) { console.log('⛔ ALT 없이 이미지를 올리지 않는다'); process.exit(1); }
const status = body + '\n\n' + url;
const counted = body.length + 2 + 23;                 // 마스토돈은 URL 을 23자로 센다
if (counted > 500) { console.log(`⛔ ${counted}/500 — 줄여야 한다`); process.exit(1); }
const b64 = task.image ? fs.readFileSync(task.image).toString('base64') : null;
if (b64 && b64.length > 12_000_000) { console.log('⛔ 이미지가 너무 크다 — sips -Z 1400 으로 줄일 것'); process.exit(1); }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await takeOverTaskSpace(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /mastodon/, null);
try { await page.goto('https://mastodon.social/home', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(7000);

const res = await page.evaluate(async (cfg) => {
  const st = JSON.parse(document.getElementById('initial-state')?.textContent || '{}');
  const tok = st?.meta?.access_token;
  if (!tok) return { err: '로그인 토큰 없음 — 대표 로그인 필요' };
  const H = { Authorization: 'Bearer ' + tok };
  let mediaIds = [];
  if (cfg.b64) {
    const bin = atob(cfg.b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const fd = new FormData();
    fd.append('file', new Blob([arr], { type: 'image/png' }), 'signum.png');
    fd.append('description', cfg.alt);
    const m = await fetch('/api/v2/media', { method: 'POST', headers: H, body: fd });
    const mj = await m.json();
    if (!mj.id) return { err: '미디어 업로드 실패 HTTP ' + m.status };
    // v2 는 비동기 처리(202) — url 이 생길 때까지 기다린다
    for (let i = 0; i < 20 && !mj.url; i++) {
      await new Promise((z) => setTimeout(z, 1500));
      const g = await (await fetch('/api/v1/media/' + mj.id, { headers: H })).json();
      if (g.url) { mj.url = g.url; break; }
    }
    mediaIds = [mj.id];
  }
  const p = await fetch('/api/v1/statuses', {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json', 'Idempotency-Key': cfg.key },
    body: JSON.stringify({ status: cfg.status, media_ids: mediaIds, visibility: 'public', language: cfg.lang || 'en' }),
  });
  const pj = await p.json();
  return { http: p.status, id: pj.id || null, url: pj.url || null, err: pj.error || null };
}, { b64, alt: task.alt || '', status, lang: task.lang || 'en', key: 'signum-' + Date.now() });

if (!res.id) { console.log('⛔ 게시 실패:', JSON.stringify(res)); process.exit(1); }
console.log('게시 응답:', res.http, res.url);

// ── 공개 검증(로그인 없이) ── 200 은 «게시됨»이 아니다
await L.wait(3000);
const pub = await (await fetch(`https://mastodon.social/api/v1/statuses/${res.id}`)).json();
const m = pub.media_attachments || [];
const ok = {
  text: (pub.content || '').replace(/<[^>]*>/g, ' ').includes(body.split('\n')[0].slice(0, 30)),
  link: /signumhq\.com\/app[^"]*from=mastodon/.test(pub.content || ''),
  image: task.image ? m.length === 1 : true,
  alt: task.image ? !!(m[0] && m[0].description) : true,
};
console.log('공개 검증:', JSON.stringify(ok));
if (!Object.values(ok).every(Boolean)) { console.log('⛔ 공개 페이지에서 확인 실패 — «발행했다»고 적지 않는다'); process.exit(1); }
console.log('\n✅ 게시·검증 완료:', pub.url);
console.log('다음: node scripts/mkt-plan.js pub mastodon "' + pub.url + '"');
