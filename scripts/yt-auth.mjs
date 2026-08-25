#!/usr/bin/env node
// ============================================================================
// yt-auth — 유튜브 OAuth 1회 인증 → «리프레시 토큰»을 .env.local 에 저장
// ----------------------------------------------------------------------------
// 왜 필요한가: API 키만으로는 «남의 눈에 보이는 것»까지만 읽는다.
//   우리가 진짜로 봐야 하는 것은 «평균 조회율·지속률·트래픽 소스» 인데
//   그건 YouTube Analytics API 이고 채널 소유자 인증(OAuth)이 있어야 열린다.
//   지금은 대표가 스튜디오 화면을 보고 불러주는 것을 받아적고 있다 — 그걸 없앤다.
//
// 요구 스코프
//   yt-analytics.readonly  ← 평균 조회율·지속률·트래픽 소스 (핵심)
//   youtube.readonly       ← 영상 목록·메타
//   youtube.force-ssl      ← 자막 «트랙 목록» 조회 (captions.list 가 이걸 요구한다)
//
// 사전 준비 (Google Cloud, 1회)
//   ① API 라이브러리에서 «YouTube Analytics API» 사용 설정
//   ② 사용자 인증 정보 → OAuth 클라이언트 ID → 유형 «데스크톱 앱»
//   ③ OAuth 동의 화면 → 게시 상태 «프로덕션»
//      (테스트 모드면 리프레시 토큰이 «7일»만에 만료된다 — 매주 다시 해야 한다)
//   ④ .env.local 에 YT_CLIENT_ID= / YT_CLIENT_SECRET= 추가
//
// 실행:  node scripts/yt-auth.mjs
// ============================================================================

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFile } from 'node:child_process';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');

const CLIENT_ID = pick('YT_CLIENT_ID');
const CLIENT_SECRET = pick('YT_CLIENT_SECRET');
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('.env.local 에 YT_CLIENT_ID / YT_CLIENT_SECRET 이 없다.');
  console.error('Google Cloud → 사용자 인증 정보 → OAuth 클라이언트 ID → «데스크톱 앱» 으로 만들어 넣는다.');
  process.exit(1);
}

// ⛔ 어느 채널에 붙일 것인가 (2026-08-21)
//   같은 구글 계정에 채널이 둘이다. 동의 화면에서 «채널을 고르는» 단계가 있는데,
//   여기서 잘못 고르면 일본 슬롯에 SIGNUM HQ 토큰이 저장되고,
//   그 뒤로 «일본어 영상이 영어 채널에 올라간다». 조용히 일어난다.
//   ⇒ 아래에서 토큰이 실제로 어느 채널 것인지 확인하고, 다르면 저장하지 않는다.
const AS = (process.argv.find((a) => a.startsWith('--as=')) || '--as=hq').slice(5).toLowerCase();
const TARGET = { hq: { key: 'YT_REFRESH_TOKEN',    id: 'UCcJYwdMx4ijXGJHxZ3-deVg', name: 'SIGNUM HQ' },
                 jp: { key: 'YT_JP_REFRESH_TOKEN', id: 'UCVLHMbVtpc3QOpSXDdeNE7A', name: 'SIGNUM ウォール街のマックスペイン' },
                 kr: { key: 'YT_KR_REFRESH_TOKEN', id: 'UCfJcKtlwA4ZeyMV4idwoGug', name: '시그넘 KR' } }[AS];
if (!TARGET) { console.error('사용: node scripts/yt-auth.mjs [--as=hq|--as=jp|--as=kr]'); process.exit(1); }

const SCOPES = [
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' ');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (err) {
    res.end(`<h2 style="font-family:sans-serif">인증 거부됨: ${err}</h2>`);
    console.error('✗ 사용자가 거부했거나 오류:', err);
    server.close(); process.exit(1);
  }
  if (!code) { res.end('...'); return; }

  const body = new URLSearchParams({
    code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    redirect_uri: `http://127.0.0.1:${port}`, grant_type: 'authorization_code',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const tok = await r.json();

  if (!tok.refresh_token) {
    res.end('<h2 style="font-family:sans-serif">리프레시 토큰을 못 받았습니다. 터미널을 확인하세요.</h2>');
    console.error('✗ refresh_token 없음:', JSON.stringify(tok).slice(0, 300));
    console.error('  → 이미 승인한 앱이면 https://myaccount.google.com/permissions 에서 액세스를 제거하고 다시 실행한다.');
    server.close(); process.exit(1);
  }

  // ⛔ 이 토큰이 «정말로» 그 채널 것인지 먼저 묻는다. 아니면 저장하지 않는다.
  const who = await (await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
  const ch = who.items?.[0];
  if (!ch) {
    res.end('<h2 style="font-family:sans-serif">채널을 확인하지 못했습니다.</h2>');
    console.error('✗ channels?mine=true 응답에 채널이 없다:', JSON.stringify(who).slice(0, 300));
    server.close(); process.exit(1);
  }
  console.log(`\n  받은 토큰의 채널: ${ch.snippet.title}  (${ch.id})`);
  if (ch.id !== TARGET.id) {
    res.end(`<h2 style="font-family:sans-serif">채널이 다릅니다 — 저장하지 않았습니다.<br>받은 것: ${ch.snippet.title}<br>필요한 것: ${TARGET.name}</h2>`);
    console.error(`\n  ✗ «${TARGET.name}» 을 골라야 하는데 «${ch.snippet.title}» 이 왔다. 저장하지 않았다.`);
    console.error('    https://myaccount.google.com/permissions 에서 액세스를 제거하고 다시 실행한 뒤,');
    console.error('    동의 화면에서 «채널 선택» 단계를 놓치지 말 것.');
    server.close(); process.exit(1);
  }

  // .env.local 에 저장 (있으면 교체)
  const KEY = TARGET.key;
  let cur = readFileSync('.env.local', 'utf8');
  if (new RegExp(`^${KEY}=`, 'm').test(cur)) {
    writeFileSync('.env.local', cur.replace(new RegExp(`^${KEY}=.*$`, 'm'), `${KEY}=${tok.refresh_token}`));
  } else {
    appendFileSync('.env.local', `\n${KEY}=${tok.refresh_token}\n`);
  }

  res.end('<h2 style="font-family:sans-serif">인증 완료. 이 창을 닫고 터미널로 돌아가세요.</h2>');
  console.log(`\n  ✔ ${TARGET.name} 토큰을 저장했다 (${TARGET.key})`);
  console.log(AS === 'jp' ? '  다음: SIGNUM_YT=jp node scripts/yt-channel-setup.mjs\n'
                        : '  다음: node scripts/yt-stats.mjs\n');
  server.close(); setTimeout(() => process.exit(0), 200);
});

let port;
server.listen(8765, '127.0.0.1', () => {
  port = server.address().port;
  const auth = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `http://127.0.0.1:${port}`,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent select_account',            // 항상 refresh_token 을 받도록 강제
  });
  console.log(`\n  대상 채널: ${TARGET.name}`);
  console.log('  브라우저가 열립니다. 계정을 고르고 «허용» 하세요.');
  console.log('  ⛔ 계정 다음 «채널 선택» 화면에서 반드시 위 채널을 고르세요.');
  console.log('  (「Google에서 확인하지 않은 앱」 경고가 뜨면 → 고급 → 안전하지 않은 페이지로 이동)');
  console.log(`\n  안 열리면 이 주소를 직접 붙여넣으세요:\n  ${auth}\n`);
  // ⛔ 윈도우 `cmd /c start URL` 은 «&» 를 명령 구분자로 잘라먹는다.
  //    그러면 client_id 뒤가 통째로 날아가 «response_type 없음» 400 이 난다 (실측).
  //    rundll32 는 셸 파싱을 거치지 않아 URL 이 그대로 전달된다.
  if (!process.env.NO_OPEN) execFile('rundll32', ['url.dll,FileProtocolHandler', auth], () => {});
});
