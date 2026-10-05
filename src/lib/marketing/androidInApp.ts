import type { PreviewLang } from './linkPreview';
import { playRedeemUrl } from './coupon';
import { isOurNativeAppRequest, type NativeSignals } from '@/lib/native/nativeRootRedirect';

/**
 * 안드로이드 «앱 안 브라우저» → Play 스토어 «앱» 열기 (2026-10-05, 브랜치 fix/android-inapp-play)
 *
 * 왜:
 *   스마트링크 /app 은 안드로이드면 브라우저 종류와 상관없이 https://play.google.com/store/apps/details?…&referrer=… 로 302 했다.
 *   크롬은 그 주소를 Play 스토어 «앱»으로 넘겨 주지만, Threads·인스타그램·페이스북·카카오톡·네이버·라인 같은 «앱 안 브라우저»
 *   (시스템 WebView — UA 에 `; wv)`)는 Play «웹 페이지»에 머물 수 있다 → 그 페이지가 구글 로그인을 요구해 사람이 떠난다.
 *   실측(10/4~10/5): 안드로이드 사람 클릭 11건(거의 Threads 앱 안) → RevenueCat 안드 신규 0. 9월 말 크롬으로 열린 긱뉴스·IH 클릭은 설치로 이어졌다.
 *   ⚠ 같은 기간 안드 앱 1.3.1(9/30 출시)이 https://localhost 를 열어 «열리지 않는» 빌드였다(d61f11cae, 1.3.2 로 수리) — 신규 0 의 원인이 겹친다.
 *     이 수리의 효과는 RevenueCat 신규가 아니라 clk:inapp 의 «노출 → market 단추» 비율과 Play 획득 보고서(utm_source)로 따로 본다.
 *
 * 그래서 «앱 안 안드로이드»에만 302 대신 가벼운 서버 화면(androidInAppHtml)을 준다 — 크롬·삼성 인터넷·아이폰·PC·봇은 예전 그대로:
 *   주 단추   intent://details?id=…&referrer=…#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=<https Play>;end
 *             사용자가 «누른» 이동이라야 WebView 를 쥔 앱이 intent 를 Play 스토어 앱으로 넘긴다 → 자동 이동(JS)은 쓰지 않는다.
 *   보조 단추 지금의 https Play 주소(«안 열리면 여기»)
 *   안내 한 줄 «안 열리면 오른쪽 위 ⋮ → 다른 브라우저로 열기»
 *
 * 판정(순수 함수 isAndroidInAppBrowser): 안드로이드 UA + (WebView 표지 `; wv)` · 알려진 앱 안 표지 · X-Requested-With 패키지 이름).
 *   우리 앱 자신(sig_native=1 쿠키 · X-Requested-With/UA 의 com.signumhq.*)은 뺀다 — 미들웨어와 같은 isOurNativeAppRequest.
 *   크롬·삼성 인터넷·Custom Tabs(텔레그램·X 등이 쓰는 «진짜 크롬»)는 WebView 표지가 없어 예전처럼 302 다.
 *
 * 인코딩(시험 tests/androidInApp.test.ts 가 Intent.parseUri 규칙으로 고정):
 *   · data 부분(#Intent 앞)은 https 주소의 쿼리를 «글자 그대로» 옮긴다 → market://details?id=…&referrer=utm_source%3D…%26… (referrer 한 번 인코딩, https 와 같다)
 *   · S.browser_fallback_url 은 https 주소 «전체»를 한 번 더 인코딩한다 — Intent.parseUri 가 S.* 값을 Uri.decode 한 번 하므로
 *     fallback 안 referrer 의 %3D·%26 이 살아남는다(이중 인코딩: %253D·%2526). `;`·`#` 도 인코딩돼 intent 문법을 깨지 않는다.
 */

const PLAY_STORE_PACKAGE = 'com.android.vending';
const PLAY_DETAILS_PREFIX = 'https://play.google.com/store/apps/details?';

// ── 판정 ────────────────────────────────────────────────────────────────────

/** 안드로이드 시스템 WebView 공통 표지 — `(Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv)` */
const WEBVIEW_RE = /;\s*wv\)/;
/** WebView 표지를 지운 앱 대비 — 알려진 앱 안 브라우저 표지(있으면 앱 안). Line/·BAND/ 는 버전 숫자까지 봐서 다른 낱말과 안 겹치게. */
const IN_APP_TOKEN_RE = /\bBarcelona\b|\bInstagram\b|FBAN\/|FBAV\/|FB_IAB|FB4A|KAKAOTALK|KAKAOSTORY|NAVER\(inapp|\bLine\/\d|DaumApps|\bBAND\/\d|everytimeApp|musical_ly|BytedanceWebview|TwitterAndroid|LinkedInApp|Telegram-Android|MicroMessenger/i;
/** X-Requested-With 의 «패키지 이름» 모양(WebView 가 자기 앱 패키지를 싣는다 — 최신 WebView 는 안 보낼 수 있어 보조 표지) */
const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;
/** 진짜 브라우저 패키지(이 이름이 헤더로 와도 WebView 앱 안으로 보지 않는다) */
const BROWSER_PACKAGE_RE = /^(com\.android\.chrome|com\.chrome\.|com\.sec\.android\.app\.sbrowser)/i;

/** 안드로이드 «앱 안 브라우저»(사람이 다른 앱 안에서 링크를 연 WebView)인가 — 순수 함수. 우리 앱 자신은 false. */
export function isAndroidInAppBrowser(s: NativeSignals): boolean {
  const ua = s.userAgent || '';
  if (!/android/i.test(ua)) return false;
  if (isOurNativeAppRequest(s)) return false;
  if (WEBVIEW_RE.test(ua) || IN_APP_TOKEN_RE.test(ua)) return true;
  const pkg = (s.requestedWith || '').trim();
  return PACKAGE_RE.test(pkg) && !BROWSER_PACKAGE_RE.test(pkg);
}

/** 어느 앱 안인가 — 측정 필드용 닫힌 목록(필드가 무한히 늘지 않게). UA 표지 먼저, 없으면 X-Requested-With 패키지. */
export type InAppFamily =
  | 'threads' | 'instagram' | 'facebook' | 'kakao' | 'naver' | 'line' | 'daum' | 'band' | 'x' | 'telegram' | 'tiktok' | 'other';
const FAMILIES: ReadonlyArray<readonly [RegExp, InAppFamily]> = [
  [/\bBarcelona\b|com\.instagram\.barcelona/i, 'threads'],   // 스레드는 인스타그램보다 먼저(패키지가 com.instagram.barcelona)
  [/\bInstagram\b|com\.instagram\./i, 'instagram'],
  [/FBAN\/|FBAV\/|FB_IAB|FB4A|com\.facebook\./i, 'facebook'],
  [/KAKAOTALK|KAKAOSTORY|com\.kakao\./i, 'kakao'],
  [/\bBAND\/\d|com\.nhn\.android\.band/i, 'band'],           // 밴드는 네이버보다 먼저(패키지가 com.nhn.*)
  [/NAVER\(inapp|com\.nhn\.|com\.naver\./i, 'naver'],
  [/\bLine\/\d|jp\.naver\.line/i, 'line'],
  [/DaumApps|net\.daum\./i, 'daum'],
  [/TwitterAndroid|com\.twitter\./i, 'x'],
  [/Telegram-Android|org\.telegram\./i, 'telegram'],
  [/musical_ly|BytedanceWebview|com\.zhiliaoapp\.|com\.ss\.android\./i, 'tiktok'],
];
export function inAppFamily(ua: string, requestedWith?: string | null): InAppFamily {
  const s = `${ua} ${(requestedWith || '').trim()}`;
  return FAMILIES.find(([re]) => re.test(s))?.[1] ?? 'other';
}

/**
 * 앱 안 화면 «노출» 집계 필드(clk:inapp:<from>:<ET날짜>) — 순수 함수.
 *   «android|view:<사람 판정>» + «android|app:<앱>» (+ 코드 링크면 «android|code», 쿠폰 화면이면 «android|coupon»).
 *   단추 탭은 /api/inapp/event 가 «android|tap:<market|web>» 로 같은 키에 더한다(쿠폰 화면 단추는 clk:coupon 의 tap:*).
 * @param firstClickField clickFields(...)[0] — 예: «android|human»·«android|nometa»
 */
export function inAppViewFields(firstClickField: string | undefined, family: InAppFamily, kind: 'link' | 'code' | 'coupon'): string[] {
  const out = [(firstClickField || 'android|human').replace('|', '|view:'), `android|app:${family}`];
  if (kind !== 'link') out.push(`android|${kind}`);
  return out;
}

/** 앱 안 화면 단추 — 닫힌 목록. market = Play 스토어 앱(intent) · web = https Play 주소(보조) */
export const IN_APP_TAPS = ['market', 'web'] as const;
export type InAppTap = (typeof IN_APP_TAPS)[number];
export const isInAppTap = (x: unknown): x is InAppTap => typeof x === 'string' && (IN_APP_TAPS as readonly string[]).includes(x);

// ── intent 주소 ─────────────────────────────────────────────────────────────

/**
 * https Play 상세 주소 → Play 스토어 «앱»을 여는 intent 주소. 쿼리(id·referrer·listing)는 글자 그대로 옮긴다.
 * 우리 Play 상세 주소 모양이 아니면 원본 그대로 돌려준다(링크가 깨지지 않게).
 */
export function playIntentUrl(httpsPlayUrl: string): string {
  if (!httpsPlayUrl.startsWith(PLAY_DETAILS_PREFIX) || httpsPlayUrl.includes('#')) return httpsPlayUrl;
  const query = httpsPlayUrl.slice(PLAY_DETAILS_PREFIX.length);
  return `intent://details?${query}#Intent;scheme=market;package=${PLAY_STORE_PACKAGE};S.browser_fallback_url=${encodeURIComponent(httpsPlayUrl)};end`;
}

/** Play «코드 사용» 주소(https://play.google.com/redeem?code=…)를 Play 스토어 앱으로 여는 intent 주소. fallback = 같은 https 주소. */
export function playRedeemIntentUrl(code: string): string {
  const web = playRedeemUrl(code);
  return `intent://${web.slice('https://'.length)}#Intent;scheme=https;package=${PLAY_STORE_PACKAGE};S.browser_fallback_url=${encodeURIComponent(web)};end`;
}

// ── 화면 ────────────────────────────────────────────────────────────────────

type Txt = { title: string; tagline: string; note: string; cta: string; alt: string; hintPre: string; hintPost: string };
/** 쿠폰 화면(couponHtml)의 앱 안 단추·안내도 같은 글을 쓴다 */
export const IN_APP_TEXT: Record<PreviewLang, Txt> = {
  ko: {
    title: 'SIGNUM HQ 앱 설치',
    tagline: '미국 시장 전체를 무료 앱 하나로',
    note: '가입 없이 바로',
    cta: 'Play 스토어에서 열기',
    alt: '안 열리면 여기',
    hintPre: '안 열리면 오른쪽 위',
    hintPost: '다른 브라우저로 열기',
  },
  ja: {
    title: 'SIGNUM HQ アプリをインストール',
    tagline: '米国市場のすべてを、無料アプリひとつで',
    note: '登録不要',
    cta: 'Playストアで開く',
    alt: '開かない場合はこちら',
    hintPre: '開かない場合は右上の',
    hintPost: '他のブラウザで開く',
  },
  en: {
    title: 'Get the SIGNUM HQ app',
    tagline: 'The whole US market in one free app',
    note: 'No account needed',
    cta: 'Open in Play Store',
    alt: 'Not opening? Tap here',
    hintPre: 'Still not opening? Top right',
    hintPost: 'Open in browser',
  },
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
/** 스크립트 안 JSON — </script> 로 끊기지 않게 < 를 이스케이프 */
const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

/** «안 열리면 오른쪽 위 ⋮ → 다른 브라우저로 열기» — 조각마다 한 덩어리(일본어가 낱말 가운데서 접히지 않게) */
export function inAppHintHtml(lang: PreviewLang): string {
  const t = IN_APP_TEXT[lang];
  return `<span class="nw">${esc(t.hintPre)}</span> <span class="nw"><b class="dots">⋮</b> →</span> <span class="nw">${esc(t.hintPost)}</span>`;
}

const CSS = `:root{color-scheme:dark}
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100vh;background:#070b14;color:#e8edf7;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Apple SD Gothic Neo","Noto Sans KR","Hiragino Sans","Noto Sans JP",sans-serif;-webkit-text-size-adjust:100%}
.wrap{max-width:440px;margin:0 auto;padding:30px 16px 40px}
.brand{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 22px;color:#aab6cc;font-weight:700;letter-spacing:.14em;font-size:13px}
.brand img{border-radius:9px;display:block}
h1{margin:0;font-size:23px;line-height:1.3;font-weight:800;text-align:center;letter-spacing:-.01em}
.sub{margin:8px 0 0;font-size:15px;color:#cdd6e6;text-align:center}
.note{margin:2px 0 0;font-size:13px;color:#8f9bb1;text-align:center}
.cta{display:flex;align-items:center;justify-content:center;min-height:62px;margin:28px 0 0;padding:16px;border-radius:16px;background:linear-gradient(165deg,#fff3c4 0%,#fcd96a 45%,#f7b733 100%);color:#1c1405;text-align:center;text-decoration:none;font-weight:800;font-size:18px;line-height:1.25;-webkit-tap-highlight-color:transparent;box-shadow:0 14px 36px -18px rgba(251,191,36,.7)}
.cta:active{transform:translateY(1px)}
.alt{display:block;margin:12px 0 0;padding:14px 16px;border:1.5px solid #34425a;border-radius:14px;color:#e8edf7;text-align:center;text-decoration:none;font-weight:700;font-size:15px}
.hint{margin:18px 6px 0;font-size:13.5px;color:#9fb0cc;text-align:center}
.hint.on{color:#fde68a;font-weight:700}
.dots{display:inline-block;min-width:1em;font-weight:900}
.cta:focus-visible,.alt:focus-visible{outline:3px solid #22d3ee;outline-offset:2px}
html[lang=ko] body{word-break:keep-all;overflow-wrap:anywhere}
html[lang=ja] body{line-break:strict}
.nw{white-space:nowrap}`;

/** 단추 비콘 — 실패해도 이동을 막지 않는다(sendBeacon → keepalive fetch). 쿠폰 화면 비콘과 같은 모양, 주소만 /api/inapp/event. */
const BEACON_JS = `function sgBeacon(ev){try{var u='/api/inapp/event?ev='+ev+(C.f?'&f='+encodeURIComponent(C.f):'');if(navigator.sendBeacon&&navigator.sendBeacon(u))return;fetch(u,{method:'POST',keepalive:true}).catch(function(){})}catch(e){}}`;

/**
 * 앱 안 안드로이드 화면 — React 없이 서버 문자열 한 장(인라인 CSS·JS, 외부 요청은 앱 아이콘 6KB 하나).
 * route 가 반드시 no-store + Vary: User-Agent(previewResponseInit)로 내보낸다 — CDN 이 이 HTML 을 크롬·아이폰·PC 에게 주면 안 된다.
 * @param playUrl 지금의 https Play 주소(리퍼러 포함) — 보조 단추 그대로, 주 단추는 이것으로 만든 intent
 */
export function androidInAppHtml(opts: { lang: PreviewLang; fromTag: string | null; playUrl: string }): string {
  const { lang, fromTag, playUrl } = opts;
  const t = IN_APP_TEXT[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="theme-color" content="#070b14">
<title>${esc(t.title)}</title>
<style>${CSS}</style></head><body><main class="wrap">
<header class="brand"><img src="/app-icons/signum-72.png" width="36" height="36" alt=""><span>SIGNUM HQ</span></header>
<h1>${esc(t.title)}</h1>
<p class="sub">${esc(t.tagline)}</p>
<p class="note">${esc(t.note)}</p>
<a class="cta" id="open" href="${esc(playIntentUrl(playUrl))}">${esc(t.cta)}</a>
<a class="alt" id="web" href="${esc(playUrl)}">${esc(t.alt)}</a>
<p class="hint" id="hint">${inAppHintHtml(lang)}</p>
</main><script>var C=${js({ f: fromTag || '' })};${BEACON_JS}
(function(){var $=function(i){return document.getElementById(i)},h=$('hint');
$('open').addEventListener('click',function(){sgBeacon('market');setTimeout(function(){if(!document.hidden)h.className='hint on'},2500)});
$('web').addEventListener('click',function(){sgBeacon('web')});
})();</script></body></html>`;
}
