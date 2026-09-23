#!/usr/bin/env node
/* ============================================================================
 * session-audit — «우리가 관리하는 모든 플랫폼»의 로그인이 살아 있는지 한 번에 잰다.
 *
 * ★2026-09-21 대표 지시로 만들었다: 「로그인이 해제되지 않게 전부 로그인은 잘 들어가면서
 *   관리해 우리 관리하는 모든 플랫폼이」.
 *
 * 왜 스크립트인가 — 세션은 «조용히» 끊긴다:
 *   · 애플 광고 콘솔이 끊긴 것을 이틀 뒤에야 알았고, 그동안 지출을 한 번도 못 봤다.
 *   · 갤럭시 스토어·애드몹도 지금 끊겨 있는데 아무 경보가 없었다.
 *   끊긴 것을 «발행하려는 순간»에 알게 되면 그 사이클을 통째로 버린다.
 *   그래서 매 사이클 0단계에서 이걸 돌려 «미리» 안다.
 *
 * 그리고 방문 자체가 «갱신»이다 — 대부분의 사이트는 접속할 때 세션 쿠키를 늘려 준다.
 * 이 훑기는 점검이면서 동시에 «세션 연장»이다. 그래서 전부를 돈다(빠른 것만 고르지 않는다).
 *
 * 사용:  export PATH="/Applications/ego lite.app/.../Helpers:$PATH"
 *        ego-browser nodejs < scripts/session-audit.mjs
 *        ego-browser nodejs < scripts/session-audit.mjs --only=store   (그룹만)
 *
 * 결과: .agent/marketing/SESSION-STATE.json  (끊긴 곳은 여기서 티켓으로 올라간다)
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const { writeFileSync } = await import('node:fs');

// group: publish(발행) · store(스토어/콘솔) · money(수익·광고)
// out:  이 «정규식이 첫 화면 앞부분에» 잡히면 로그아웃으로 본다
// need: 이 문자열이 있으면 로그인으로 확정한다(없어도 out 이 아니면 «아마 로그인»)
const SITES = [
  // ── 발행 채널 ────────────────────────────────────────────────
  ['x',           'publish', 'https://x.com/home',                    /Sign in|Create account/i, 'What’s happening|무슨 일이'],
  ['bluesky',     'publish', 'https://bsky.app/',                     /Sign in|Create account/i, '둘러보기|Following|팔로우'],
  ['medium',      'publish', 'https://medium.com/',                   /Get started|Sign in/i,    'Write|Stories|Stats'],
  ['reddit',      'publish', 'https://www.reddit.com/',               /Log In$/i,                '게시물 만들기|Create Post|사용자 메뉴'],
  ['note_jp',     'publish', 'https://note.com/',                     /ログイン|会員登録/,        '投稿|フォロー中'],
  ['quora',       'publish', 'https://www.quora.com/',                /Sign up|Login/i,          'Spaces|Notifications|Answer'],
  ['indiehackers','publish', 'https://www.indiehackers.com/',         /Log in|Sign up/i,         'Starting Up|Products DB'],
  ['linkedin',    'publish', 'https://www.linkedin.com/feed/',        /Sign in|Join now/i,       '인맥|피드|Feed'],
  ['threads',     'publish', 'https://www.threads.com/',              /로그인|Log in/i,           '프로필|인사이트|게시'],
  ['instagram',   'publish', 'https://www.instagram.com/',            /로그인$|Log in$/i,         '팔로우|스토리|Reels'],
  ['pinterest',   'publish', 'https://www.pinterest.com/business/hub/', /로그인|Log in/i,         'SIGNUM|비즈니스 허브'],
  ['okky',        'publish', 'https://okky.kr/',                      /로그인/,                   'user menu|사용자|OKKY'],
  ['naver',       'publish', 'https://www.naver.com/',                /NAVER 로그인|로그인 하세요/, '메일|카페|블로그'],
  ['brunch',      'publish', 'https://brunch.co.kr/',                 /시작하기$/,                '작가신청|작가의 서랍|글쓰기'],
  // 2026-09-23 수리: /manage 는 로그인 상태에서도 «권한이 없»/«로그인» 문구가 섞여 «끊김» 오판을 냈다 → 첫 화면으로 본다
  ['tistory',     'publish', 'https://www.tistory.com/',              /^\s*로그인\s*$/,           '글쓰기|내 블로그'],
  ['geeknews',    'publish', 'https://news.hada.io/',                 /로그인/,                   'signumhq|글등록'],
  ['github',      'publish', 'https://github.com/',                   /Sign in|Sign up/i,        'Dashboard|Top repositories'],
  // ── 스토어·콘솔 ──────────────────────────────────────────────
  ['asc',         'store',   'https://appstoreconnect.apple.com/apps', /Apple Account|Sign In/i, 'SIGNUM|Xcode Cloud|앱'],
  ['play_console','store',   'https://play.google.com/console/developers', /Sign in/i,          'Signum HQ|developer'],
  ['samsung',     'store',   'https://seller.samsungapps.com/main/sellerMain.as', /로그인 회원가입/, '애플리케이션|대시보드'],
  ['uptodown',    'store',   'https://uptodown.dev/apps',             /Log in|Sign in/i,         'Apps|Organization'],
  // ── 돈이 오가는 곳 ───────────────────────────────────────────
  ['apple_ads',   'money',   'https://app-ads.apple.com/cm/app/23872040/report', /idmsa|Apple Account/i, '캠페인|Campaign'],
];

/**
 * ⛔ 여기에 절대 넣지 않는 곳 — 열어 봐야 얻을 게 없고 «사고 자리»인 곳.
 *
 * · admob (apps.admob.com) — 애드몹은 **대표 개인 구글 계정**이다.
 *   이 브라우저의 구글 세션은 회사 계정(contact@signumhq.com)이라, 주소로 들어가면
 *   매번 `admob.google.com/signup` 즉 **「새 애드몹 계정 만들기」** 화면에 떨어진다.
 *   ①정보는 0 이고 ②「Start using AdMob」을 잘못 누르면 회사 계정으로 계정이 하나 더 생긴다.
 *   2026-09-22 대표 지적(「왜 자꾸 애드몹은 들어가는데」)으로 목록에서 제거.
 *   애드몹 수치가 필요하면 **대표 개인 계정 화면에서** 본다. 여기서 자동으로 열지 않는다.
 */
const NEVER_VISIT = ['admob (개인 계정 — 주소로 열면 «신규 가입» 화면이 뜬다)'];

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
const rows = SITES.filter((s) => !only || s[1] === only);

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts;
try { ts = await takeOverTaskSpace(sp.id); } catch { try { await claimTaskSpace(sp.id); ts = await taskSpace(sp.id); } catch { console.log('작업공간을 못 잡았다 — 대표가 쓰는 중일 수 있다'); process.exit(1); } }
await L.cleanupPages(ts, 1);
const page = await L.findPage(ts, /./, null);

const result = { at: new Date().toISOString(), ok: [], dead: [], unsure: [] };
for (const [name, group, url, outRe, needStr] of rows) {
  let r;
  try {
    try { await page.goto(url, { waitUntil: 'domcontentloaded' }); } catch { /* 무거운 콘솔은 타임아웃 뒤에도 그려진다 */ }
    await L.wait(group === 'money' || group === 'store' ? 13000 : 8000);
    r = await page.evaluate((cfg) => {
      const t = (document.body.innerText || '').replace(/\s+/g, ' ');
      return { url: location.href, head: t.slice(0, 220), hasNeed: new RegExp(cfg.need).test(t.slice(0, 2000)) };
    }, { need: needStr });
  } catch (e) { r = { url: '', head: 'ERR ' + String(e.message).slice(0, 60), hasNeed: false }; }

  const bouncedToLogin = /idmsa|accounts\.google\.com\/signin|signIn\.as|\/login|signup/i.test(r.url);
  const out = bouncedToLogin || outRe.test(r.head.slice(0, 300));
  const state = out ? 'dead' : (r.hasNeed ? 'ok' : 'unsure');
  result[state].push({ name, group, url: r.url.slice(0, 80), head: r.head.slice(0, 90) });
  console.log((state === 'ok' ? '✅' : state === 'dead' ? '❌' : '❓') + ' ' + name.padEnd(13) + '[' + group + '] ' + r.url.slice(0, 64));
}

const P = '/Users/eunhoon/.gemini/antigravity/scratch/stock2/.agent/marketing/SESSION-STATE.json';
writeFileSync(P, JSON.stringify(result, null, 2) + '\n');
console.log('\n살아 있음 ' + result.ok.length + ' · 끊김 ' + result.dead.length + ' · 판정불가 ' + result.unsure.length);
if (result.dead.length) {
  console.log('\n❌ 끊긴 곳 — 대표 로그인 1회가 필요하다(비밀번호는 내가 다루지 않는다):');
  result.dead.forEach((d) => console.log('   · ' + d.name + '  ' + d.url));
}
if (result.unsure.length) {
  console.log('\n❓ 판정불가 — 로그인 표식은 없지만 로그인 화면도 아니다. 눈으로 한 번 볼 것:');
  result.unsure.forEach((d) => console.log('   · ' + d.name + '  ' + d.head.slice(0, 60)));
}
console.log('\n기록: .agent/marketing/SESSION-STATE.json');
console.log('· 의도적으로 열지 않는 곳: ' + NEVER_VISIT.join(' · '));
