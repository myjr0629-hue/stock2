#!/usr/bin/env node
// ============================================================================
// bsky-publish — 브라우저 없이 Bluesky 에 올린다.
//
// ★2026-09-21 만든 이유: 대표가 브라우저(작업공간)를 쓰는 동안 발행이 4사이클 연속 멈췄다.
//   그런데 저장소에는 이미 `src/lib/marketing-console/bluesky.ts` 의 `bskyPost()` 가 있고
//   (관리자 API 라우트가 그걸 쓴다), 그 라우트만 «관리자 세션»을 요구할 뿐
//   **라이브러리 함수 자체는 세션도 브라우저도 필요 없다.** 그 함수를 로컬에서 직접 부른다.
//   → Bluesky 는 우리 클릭 1위 채널이다(3일 14 · 21일 45). 이 경로가 열리면
//     최소한 한 채널은 브라우저 상태와 무관해진다.
//
// 필요한 것: .env.local 에 두 줄. **앱 비밀번호는 계정 비밀번호가 아니다**
//   (bsky.app → Settings → App Passwords 에서 발급, 언제든 폐기 가능).
//     BLUESKY_HANDLE=signumhq.bsky.social
//     BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
//   값은 대표가 직접 파일에 넣는다 — 나는 값을 보지 않고 존재 여부만 확인한다.
//
// 사용:
//   node scripts/bsky-publish.mjs --check                     상태만 확인(발행 안 함)
//   node scripts/bsky-publish.mjs --file <원고.md>            원고의 「## 본문」 블록을 발행
//   node scripts/bsky-publish.mjs --text "..." [--image <url>]
//   node scripts/bsky-publish.mjs --text-file <본문.txt> --image-file <16:9 카드.png> --alt "이미지 설명"
// ============================================================================

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import dotenv from 'dotenv';

const ROOT = resolve(import.meta.dirname, '..');
dotenv.config({ path: join(ROOT, '.env.local') });
dotenv.config({ path: join(ROOT, '.env') });

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const has = (k) => argv.includes(k);

/** TS 모듈을 그대로 부를 수 없으므로 esbuild 로 한 번 번들해서 import 한다. */
async function loadBluesky() {
  const dir = mkdtempSync(join(tmpdir(), 'bsky-'));
  const out = join(dir, 'bluesky.mjs');
  await build({
    entryPoints: [join(ROOT, 'src/lib/marketing-console/bluesky.ts')],
    bundle: true, format: 'esm', platform: 'node', target: 'node20',
    outfile: out, logLevel: 'silent',
  });
  return import(pathToFileURL(out).href);
}

/** 원고 파일에서 「## 본문」 이후 다음 「## 」 전까지를 꺼낸다. */
function bodyFromDraft(path) {
  const s = readFileSync(path, 'utf8');
  // ⚠️ `m` 플래그를 쓰면 `$` 가 «줄 끝»이라 첫 줄에서 끊긴다(처음에 그렇게 짜서 0자가 나왔다).
  //    멀티라인 없이 «문자열 끝»으로 닫는다.
  const m = s.match(/##\s*본문[^\n]*\n([\s\S]*?)(?:\n##\s|$)/);
  if (!m) throw new Error('원고에서 「## 본문」 블록을 찾지 못했다');
  return m[1].trim();
}

const M = await loadBluesky();

if (has('--check') || (!arg('--text') && !arg('--file') && !arg('--text-file'))) {
  const configured = M.blueskyConfigured();
  console.log('설정됨:', configured ? '✅' : '❌  (.env.local 에 BLUESKY_HANDLE / BLUESKY_APP_PASSWORD 필요)');
  if (configured) {
    const st = await M.bskyStatus();
    console.log('연결:', st.connected ? `✅ ${st.handle}` : '❌ 인증 실패 — 앱 비밀번호를 다시 발급해 주세요');
  }
  process.exit(configured ? 0 : 1);
}

const text = arg('--text') || (arg('--text-file') ? readFileSync(arg('--text-file'), 'utf8').trim() : bodyFromDraft(arg('--file')));
// ★2026-09-23 --image-file <로컬 경로> — bskyPost 는 «URL»로만 이미지를 받는다(Node fetch 는 file: 를 못 연다).
//   이 프로세스 안에 127.0.0.1 임시 서버를 띄워 그 주소를 넘기고, 발행이 끝나면 닫는다.
//   ⚠ bskyPost 는 aspectRatio 를 1200×675 로 고정해 보낸다 → 이미지는 반드시 16:9 카드(make-x-card.py)로 만든다.
//     세로 앱 화면을 그대로 넣으면 피드에서 비율이 틀어진다.
let image = arg('--image') || undefined;
let server = null;
if (arg('--image-file')) {
  const http = await import('node:http');
  const buf = readFileSync(arg('--image-file'));
  server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'image/png' }); r.end(buf); });
  await new Promise((z) => server.listen(0, '127.0.0.1', z));
  image = `http://127.0.0.1:${server.address().port}/card.png`;
}
const alt = arg('--alt') || undefined;

if (text.length > 300) {
  console.error(`본문 ${text.length}자 — Bluesky 한도 300자를 넘는다. 줄이고 다시 실행한다.`);
  process.exit(1);
}
console.log(`본문 ${text.length}자 / 300${image ? ' · 이미지 ' + image : ''}`);

const res = await M.bskyPost(text, image, alt);
if (server) server.close();
if (!res.ok) { console.error('발행 실패:', res.error); process.exit(1); }

// at://did:plc:xxx/app.bsky.feed.post/<rkey> → 공개 URL
const rkey = (res.uri || '').split('/').pop();
const handle = process.env.BLUESKY_HANDLE;
console.log('발행 완료:', res.uri, res.withImage ? '(이미지 포함)' : '(텍스트만)');
if (rkey && handle) console.log('공개 URL:', `https://bsky.app/profile/${handle}/post/${rkey}`);
console.log('\n다음: node scripts/mkt-plan.js pub bluesky <공개 URL>  + 공개 페이지에서 본문·링크 검증');
