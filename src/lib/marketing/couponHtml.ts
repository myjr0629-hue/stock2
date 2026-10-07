import type { PreviewLang } from './linkPreview';
import { audienceLine, APPLE_CODE_LIMIT, ANDROID_POOL_SIZE } from './coupon';
import { IN_APP_TEXT, inAppHintHtml, playIntentUrl, playRedeemIntentUrl } from './androidInApp';
import { IOS_STAY_CHECK_MS } from './iosInApp';

/**
 * 스마트링크 «쿠폰 화면» — /app?from=<채널>&code=<우리 애플 맞춤 코드> 를 «폰»으로 열었을 때 (2026-10-05, 대표 «쿠폰 받는 느낌»).
 *
 * React 없이 서버 문자열 한 장(인라인 CSS·JS, 외부 요청은 앱 아이콘 6KB 하나) — desktopHandoff 처럼 빠르게.
 *   · 아이폰: 쿠폰 번호 = 그 채널의 애플 맞춤 코드 · 주 단추 = 애플 적용 주소(자동 적용 — 앱이 없으면 설치부터).
 *     맞춤 코드는 애플 규칙상 App Store «코드 사용» 칸에 손으로 넣을 수 없다 → 손입력 안내는 쓰지 않는다.
 *   · 안드로이드: «내 쿠폰 받기» → /api/coupon/claim 이 개인 일회용 Play 번호 1장을 준다 → 크게 보여 주고 복사·«① Play 스토어에서 적용»
 *     (play.google.com/redeem?code=…) + 손입력 경로(Play 스토어 → 결제 및 정기 결제 → 코드 사용).
 *     ★2026-10-06 «② 구독» 단계를 따로 적는다 — 대표 실기기: Play «코드 사용»에서 «적용»만 되고 PRO 가 안 켜졌다(콘솔 1/300 사용·주문 0건).
 *       구글 공식(developer.android.com/google/play/billing/promo): «After the user redeems the code, they still need to purchase the
 *       subscription with the code applied.» → 구독 화면이 안 나오면 앱 안 경로(설정 → 🎟 쿠폰 코드 입력 → 계속 → 구독)로. 적용해 둔 코드는
 *       앱 안 구매 때 자동 적용된다(RevenueCat google-play-offers 문서 «The code will then be applied when the user selects the subscription»).
 * 고지: «무료» 문장 안에 자동 갱신 가격(FTC «Free» 지침·한국 숨은 갱신 — 설계 §10.7-3). 애플 1개월 무료 · Play 30일 무료.
 * 숫자: 실제 한도만(애플 코드당 500 · 안드 서버 풀 200) · 날짜는 실제 만료(10/30). 남은 수·타이머는 쓰지 않는다.
 * 측정: 단추 누름은 /api/coupon/event 비콘(apply·play·copy·install) → clk:coupon:<from>:<ET날짜> 필드 «<기기>|tap:<단추>».
 *   화면 노출은 route 가 같은 키에 «<기기>|view:<사람 판정>»으로 센다.
 * ★2026-10-05 안드로이드 «앱 안 브라우저»(카톡·인스타·스레드 등 WebView — lib/marketing/androidInApp.ts): WebView 는 play.google.com 을
 *   Play «웹 페이지»로 열어 구글 로그인에서 사람이 떠난다 → «Play 스토어에서 적용»·«쿠폰 없이 앱만 설치하기»를 intent://(Play 스토어 앱)로 바꾸고,
 *   지금의 https 주소는 보조 «안 열리면 여기»(play_web·install_web)로, «⋮ → 다른 브라우저로 열기» 안내 한 줄을 더한다. 크롬 안드로이드 화면은 그대로.
 * 안전: route 가 반드시 no-store + Vary: User-Agent 로 내보낸다(previewResponseInit) — CDN 이 이 HTML 을 PC·봇에게 주면 안 된다.
 */

type Txt = {
  titleIos: string; titleAnd: string;
  limit: (n: number) => string; until: string;
  codeLabel: string; myCode: string;
  iosCta: string; iosHelp: string;
  freeIos: string; freeAnd: string;
  what: string; eligIos: string; eligAnd: string;
  andPre: string; andCta: string; andBusy: string;
  copy: string; copied: string; andApply: string; andManual: string;
  /** ② 구독 단계(2026-10-06) — 코드를 «적용»만 하면 PRO 가 안 켜진다: 구독 구매까지 해야 한다(구글 공식 «they still need to purchase the subscription») */
  andStep2: string; andStep2Help: string;
  again: string; cap: string; next: string; empty: string; emptySub: string; off: string; err: string;
  installOnly: string;
  /** 아이폰 «앱 안 브라우저»에서 적용을 눌렀는데 App Store 로 안 넘어갔을 때(2.5초 뒤에도 화면이 그대로)만 보이는 안내 — 2026-10-07 */
  iosStay: string;
};

const T: Record<PreviewLang, Txt> = {
  ko: {
    titleIos: '🎟 SIGNUM HQ PRO 1개월 무료 쿠폰',
    titleAnd: '🎟 SIGNUM HQ PRO 30일 무료 쿠폰',
    limit: (n) => `선착순 ${n.toLocaleString('en-US')}명`,
    until: '10/30까지',
    codeLabel: '쿠폰 번호',
    myCode: '내 쿠폰 번호',
    iosCta: '쿠폰 적용하고 무료로 시작',
    iosHelp: '앱이 없으면 설치부터 이어집니다',
    freeIos: '1개월 무료 뒤 월 ₩11,900 자동 갱신 · 언제든 해지',
    freeAnd: '30일 무료 뒤 월 ₩11,900 자동 갱신 · 언제든 해지',
    what: 'PRO = 광고 없음 + 내 종목 100개(무료 5개)',
    eligIos: '신규·구독 만료 회원 대상 · 해지는 App Store 구독 관리에서',
    eligAnd: '구글 결제 수단 필요 · 해지는 Play 스토어 → 결제 및 정기 결제에서',   // 구글 «A valid form of payment is required»(10/6)
    andPre: '버튼을 누르면 나만의 쿠폰 번호가 발급됩니다',
    andCta: '내 쿠폰 받기',
    andBusy: '발급 중…',
    copy: '복사',
    copied: '복사됨',
    andApply: '① Play 스토어에서 적용',
    andManual: 'Play 스토어 → 결제 및 정기 결제 → 코드 사용에 직접 입력해도 됩니다(그다음 ②)',
    andStep2: '② 이어서 «구독»을 눌러야 PRO가 시작됩니다 — 30일 안에 해지하면 0원',
    andStep2Help: '구독 화면이 안 나오면: SIGNUM HQ 앱 → 설정 → 🎟\u00a0쿠폰 코드 입력 → 계속 → «구독»',   // 🎟 가 줄 끝에 홀로 남지 않게(붙는 공백)
    again: '이미 받은 쿠폰입니다 — 같은 번호를 다시 보여 드립니다',
    cap: '오늘 몫 쿠폰이 모두 나갔습니다 — 내일 다시 와 주세요',
    next: '다음 발급',
    empty: '쿠폰이 모두 소진되었습니다',
    emptySub: '앱은 무료로 설치할 수 있습니다',
    off: '지금은 쿠폰을 발급할 수 없습니다',
    err: '잠시 후 다시 시도해 주세요',
    installOnly: '쿠폰 없이 앱만 설치하기',
    iosStay: '앱스토어가 안 열리면: 화면의 ⋯ 또는 나침반 아이콘 → «Safari로 열기»를 눌러 다시 시도해 주세요',
  },
  en: {
    titleIos: '🎟 SIGNUM HQ PRO 1-month free coupon',
    titleAnd: '🎟 SIGNUM HQ PRO 30-day free coupon',
    limit: (n) => `First ${n.toLocaleString('en-US')}`,
    until: 'Until Oct 30',
    codeLabel: 'Coupon code',
    myCode: 'Your coupon code',
    iosCta: 'Apply coupon & start free',
    iosHelp: 'No app yet? It installs first.',
    freeIos: '1 month free, then US$9.99/mo (regular price) — auto-renews, cancel anytime',
    freeAnd: '30 days free, then US$9.99/mo (regular price) — auto-renews, cancel anytime',
    what: 'PRO = no ads + 100-ticker watchlist (free: 5)',
    eligIos: 'New or lapsed subscribers · Cancel in App Store subscriptions',
    eligAnd: 'Google payment method required · Cancel in Play Store → Payments & subscriptions',
    andPre: 'Tap the button to get a coupon code just for you',
    andCta: 'Get my coupon',
    andBusy: 'Getting your code…',
    copy: 'Copy',
    copied: 'Copied',
    andApply: '① Apply in Play Store',
    andManual: 'Or type it in: Play Store → Payments & subscriptions → Redeem code (then step ②)',
    andStep2: '② Then tap “Subscribe” to start PRO — cancel within 30 days and pay nothing',
    andStep2Help: 'No subscribe screen? SIGNUM HQ app → Settings → 🎟\u00a0Redeem a code → Continue → “Subscribe”',
    again: 'You already got this coupon — here it is again',
    cap: 'Today’s coupons are all gone — come back tomorrow',
    next: 'Next batch',
    empty: 'All coupons have been claimed',
    emptySub: 'The app is still free to install',
    off: 'Coupons aren’t available right now',
    err: 'Something went wrong — please try again',
    installOnly: 'Just install the app (no coupon)',
    iosStay: 'App Store not opening? Tap ⋯ or the compass icon → “Open in Safari”, then try again',
  },
  ja: {
    titleIos: '🎟 SIGNUM HQ PRO 1か月無料クーポン',
    titleAnd: '🎟 SIGNUM HQ PRO 30日間無料クーポン',
    limit: (n) => `先着${n.toLocaleString('en-US')}名`,
    until: '10/30まで',
    codeLabel: 'クーポンコード',
    myCode: 'あなたのクーポンコード',
    iosCta: 'クーポンを適用して無料で始める',
    iosHelp: 'アプリがなければインストールから始まります',
    freeIos: '1か月無料、以降は月額¥1,280で自動更新・いつでも解約可',
    freeAnd: '30日間無料、以降は月額¥1,280で自動更新・いつでも解約可',
    what: 'PRO = 広告なし + マイ銘柄100件(無料は5件)',
    eligIos: '新規・期限切れの方が対象 · 解約はApp Storeのサブスクリプション管理から',
    eligAnd: 'Googleのお支払い方法が必要・解約はPlayストア → お支払いと定期購入から',
    andPre: 'ボタンを押すと、あなただけのクーポンコードが発行されます',
    andCta: '自分のクーポンを受け取る',
    andBusy: '発行中…',
    copy: 'コピー',
    copied: 'コピーしました',
    andApply: '① Playストアで適用',
    andManual: 'Playストア → お支払いと定期購入 → コードを利用 に直接入力してもOKです(そのあと②)',
    andStep2: '② 続けて「定期購入」を押すとPROが始まります — 30日以内に解約すれば0円',
    andStep2Help: '購入画面が出ない場合: SIGNUM HQアプリ → 設定 → 🎟\u00a0クーポンコードを使う → 続ける →「定期購入」',
    again: '受け取り済みのクーポンです — 同じコードを表示します',
    cap: '本日分のクーポンはすべて配布済みです — 明日またお越しください',
    next: '次回配布',
    empty: 'クーポンはすべて配布済みです',
    emptySub: 'アプリは無料でインストールできます',
    off: '現在クーポンを発行できません',
    err: 'しばらくしてからもう一度お試しください',
    installOnly: 'クーポンなしでアプリだけ入れる',
    iosStay: 'App Storeが開かない場合: 画面の ⋯ またはコンパスのアイコン →「Safariで開く」でもう一度お試しください',
  },
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
/**
 * 일본어는 띄어쓰기가 없어 «解/約可»·«ク/ーポン»처럼 단어 가운데서 접혔다(로컬 화면 확인 2026-10-05) —
 * 구두점(、・)까지를 한 덩어리(nowrap)로 묶고 그 사이(<wbr>)에서만 접히게. 한국어는 keep-all, 영어는 띄어쓰기로 충분하다.
 */
function phrases(lang: PreviewLang, s: string): string {
  if (lang !== 'ja') return esc(s);
  // 띄어쓰기는 그대로 접힘 자리로 두고, 낱말 안에서는 구두점 뒤에서만 접는다(한 덩어리가 화면보다 넓어지지 않게)
  return s.split(' ').map((w) => w.split(/(?<=[、・])/).map((p) => `<span class="nw">${esc(p)}</span>`).join('<wbr>')).join(' ');
}
/** 제목 — «🎟 SIGNUM HQ PRO» 뒤의 나머지(«1개월 무료 쿠폰»·«30日間無料クーポン»)는 한 덩어리로(접히면 통째로 다음 줄) */
function titleHtml(title: string): string {
  const i = title.indexOf('SIGNUM HQ PRO');
  if (i < 0) return esc(title);
  const cut = i + 'SIGNUM HQ PRO'.length;
  return `${esc(title.slice(0, cut))} <span class="nw">${esc(title.slice(cut).trim())}</span>`;
}
/** 스크립트 안 JSON — </script> 로 끊기지 않게 < 를 이스케이프 */
const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

/** 위 부제 한 줄 — «{채널} 독자 전용 · 선착순 N명 · 10/30까지»(채널을 모르면 앞 조각만 뺀다). 순수 함수. */
export function couponSubline(platform: 'ios' | 'android', lang: PreviewLang, fromTag: string | null, code: string): string {
  const t = T[lang];
  const parts = [audienceLine(fromTag, code, lang), t.limit(platform === 'ios' ? APPLE_CODE_LIMIT : ANDROID_POOL_SIZE), t.until];
  return parts.filter(Boolean).join(' · ');
}

const CSS = `:root{color-scheme:dark}
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100vh;background:#070b14;color:#e8edf7;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Hiragino Sans","Noto Sans KR","Noto Sans JP",sans-serif;-webkit-text-size-adjust:100%}
.wrap{max-width:440px;margin:0 auto;padding:22px 16px 36px}
.brand{display:flex;align-items:center;justify-content:center;gap:9px;margin:2px 0 18px;color:#aab6cc;font-weight:700;letter-spacing:.14em;font-size:12.5px}
.brand img{border-radius:8px;display:block}
.ticket{position:relative;background:linear-gradient(165deg,#fff3c4 0%,#fcd96a 42%,#f7b733 100%);color:#1c1405;border-radius:20px;padding:22px 20px 20px;box-shadow:0 18px 48px -20px rgba(251,191,36,.6)}
.t-title{margin:0;font-size:22px;line-height:1.28;font-weight:800;letter-spacing:-.01em}
.t-sub{margin:8px 0 0;font-size:13.5px;font-weight:600;color:rgba(28,20,5,.8)}
.perf{position:relative;margin:18px -20px 16px;border-top:2px dashed rgba(28,20,5,.3)}
.perf:before,.perf:after{content:"";position:absolute;top:-12px;width:22px;height:22px;border-radius:50%;background:#070b14}
.perf:before{left:-11px}.perf:after{right:-11px}
.t-label{margin:0;font-size:12px;font-weight:700;letter-spacing:.05em;color:rgba(28,20,5,.68)}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px}
.t-code{margin:0;min-width:0;font:800 clamp(17px,5.6vw,25px)/1.25 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.05em;word-break:break-all;-webkit-user-select:all;user-select:all}
.long{font-size:clamp(14px,5.1vw,21px);letter-spacing:.03em}
.tools{display:flex;margin-top:10px}
.mask{color:rgba(28,20,5,.34);letter-spacing:.12em}
.copy{flex:none;min-height:38px;padding:8px 13px;border:1.5px solid rgba(28,20,5,.55);border-radius:10px;background:transparent;color:#1c1405;font:700 13.5px/1 inherit;cursor:pointer}
.cta{display:block;width:100%;margin:18px 0 0;padding:15px 16px;border:0;border-radius:14px;background:#0b1220;color:#fde68a;text-align:center;text-decoration:none;font:800 16.5px/1.25 inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.cta:active{transform:translateY(1px)}.cta[disabled]{opacity:.62;cursor:default}
.cta:focus-visible,.copy:focus-visible,.alt a:focus-visible{outline:3px solid #22d3ee;outline-offset:2px}
.help{margin:10px 0 0;font-size:13px;color:rgba(28,20,5,.78);text-align:center}
.step2{margin:14px 0 0;padding:10px 12px;border-radius:12px;background:rgba(11,18,32,.09);font-size:14px;font-weight:800;line-height:1.45;text-align:center}
.note{margin:10px 0 0;font-size:12.5px;font-weight:600;color:rgba(28,20,5,.72);text-align:center}
.msg{margin:16px 0 0;padding:12px 12px;border-radius:12px;background:rgba(11,18,32,.09);font-weight:800;text-align:center}
.msg small{display:block;margin-top:4px;font-weight:600;color:rgba(28,20,5,.72)}
.free{margin:16px 0 0;padding-top:12px;border-top:1px solid rgba(28,20,5,.2);font-size:13.5px;font-weight:700;text-align:center}
.what{margin:18px 6px 0;font-size:13.5px;color:#cdd6e6;text-align:center}
.fine{margin:6px 6px 0;font-size:12px;color:#8f9bb1;text-align:center}
.alt{margin:18px 0 0;text-align:center;font-size:13px}.alt a{color:#9fb0cc;text-underline-offset:3px}
.cta2{display:block;margin:10px 0 0;padding:12px 14px;border:1.5px solid rgba(28,20,5,.55);border-radius:12px;color:#1c1405;text-align:center;text-decoration:none;font-weight:800;font-size:14.5px}
.dots{display:inline-block;min-width:1em;font-weight:900}
html[lang=ko] body{word-break:keep-all;overflow-wrap:anywhere}
html[lang=ja] body{line-break:strict}
.nw{white-space:nowrap}
[hidden]{display:none!important}`;

/** 단추 비콘 — 실패해도 이동을 막지 않는다(sendBeacon → keepalive fetch). */
const BEACON_JS = `function sgBeacon(ev){try{var u='/api/coupon/event?ev='+ev+(C.f?'&f='+encodeURIComponent(C.f):'');if(navigator.sendBeacon&&navigator.sendBeacon(u))return;fetch(u,{method:'POST',keepalive:true}).catch(function(){})}catch(e){}}`;
/** ★2026-10-06 선물 링크(from=gift)용 — 초대자 id(C.r)를 &r= 로 더 싣는다. 선물이 아닌 화면은 위 BEACON_JS 그대로(글자 하나 안 바뀐다). */
const BEACON_REF_JS = `function sgBeacon(ev){try{var u='/api/coupon/event?ev='+ev+(C.f?'&f='+encodeURIComponent(C.f):'')+(C.r?'&r='+encodeURIComponent(C.r):'');if(navigator.sendBeacon&&navigator.sendBeacon(u))return;fetch(u,{method:'POST',keepalive:true}).catch(function(){})}catch(e){}}`;

export function couponHtml(opts: {
  platform: 'ios' | 'android';
  lang: PreviewLang;
  fromTag: string | null;
  /** 링크의 애플 맞춤 코드(검증된 대문자·숫자) — 아이폰은 쿠폰 번호로 보여 주고, 안드로이드는 배정 기록의 출처로만 보낸다 */
  code: string;
  /** 아이폰 주 단추 — 애플 적용 주소 */
  appleRedeemUrl: string;
  /** 안드로이드 «쿠폰 없이 앱만 설치» — Play 설치(리퍼러·utm_content=code) */
  playInstallUrl: string;
  /** 안드로이드 «앱 안 브라우저»(WebView)면 true — Play 단추를 intent(주) + https(보조)로. 기본 false = 크롬 화면 그대로. */
  androidInApp?: boolean;
  /** 아이폰 «앱 안 브라우저»(WKWebView)면 true — 적용 단추를 누른 뒤 화면이 그대로면 «Safari 로 열기» 안내를 보이고 apply_stay 를 센다. 기본 false = 예전 화면과 «글자 그대로» 같다. */
  iosInApp?: boolean;
  /** iosInApp 이고 true 일 때만 «Safari 로 열기» 안내 줄을 화면에 둔다(COUPON_IOS_STAY_HINT=1). 기본 false = 화면엔 아무 변화 없이 apply_stay 만 센다. */
  iosStayHint?: boolean;
  /** ★2026-10-06 선물 링크(from=gift)의 익명 초대자 id(route 가 lib/gift 로 검증한 값) — 단추 비콘·«내 쿠폰 받기»에 실어 초대자별로 센다. 없으면 화면·스크립트 예전 그대로. */
  ref?: string | null;
}): string {
  const { platform, lang, fromTag, code } = opts;
  const ref = opts.ref || null;
  const beaconJs = ref ? BEACON_REF_JS : BEACON_JS;
  const t = T[lang];
  const ios = platform === 'ios';
  const iosIa = ios && opts.iosInApp === true;
  const iosHint = iosIa && opts.iosStayHint === true;
  const title = ios ? t.titleIos : t.titleAnd;
  const sub = couponSubline(platform, lang, fromTag, code);
  const free = ios ? t.freeIos : t.freeAnd;
  const head = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="theme-color" content="#070b14">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(`${sub} · ${free}`)}">
<meta property="og:image" content="https://www.signumhq.com/promo/redeem-card-${lang}.png">
<style>${CSS}</style></head><body><main class="wrap">
<header class="brand"><img src="/app-icons/signum-72.png" width="28" height="28" alt=""><span>SIGNUM HQ</span></header>
<section class="ticket" aria-labelledby="ct"${ios ? '' : ' data-platform="android"'}>
<h1 class="t-title" id="ct">${titleHtml(title)}</h1>
<p class="t-sub">${esc(sub)}</p>
<div class="perf" aria-hidden="true"></div>`;

  if (ios) {
    return `${head}
<p class="t-label">${esc(t.codeLabel)}</p>
<div class="row"><p class="t-code" id="code">${esc(code)}</p></div>
<a class="cta" id="go" href="${esc(opts.appleRedeemUrl)}">${esc(t.iosCta)}</a>
<p class="help">${phrases(lang, t.iosHelp)}</p>${iosHint ? `
<p class="help" id="stay" style="font-weight:800;color:#1c1405" hidden>${phrases(lang, t.iosStay)}</p>` : ''}
<p class="free">${phrases(lang, free)}</p>
</section>
<p class="what">${phrases(lang, t.what)}</p>
<p class="fine">${phrases(lang, t.eligIos)}</p>
</main><script>var C=${js(ref ? { f: fromTag || '', r: ref } : { f: fromTag || '' })};${beaconJs}
${iosIa
  ? `document.getElementById('go').addEventListener('click',function(){sgBeacon('apply');setTimeout(function(){if(!document.hidden){sgBeacon('apply_stay');${iosHint ? "var s=document.getElementById('stay');if(s)s.hidden=false" : ''}}},${IOS_STAY_CHECK_MS})});`
  : `document.getElementById('go').addEventListener('click',function(){sgBeacon('apply')});`}</script></body></html>`;
  }

  const strings = {
    cta: t.andCta, busy: t.andBusy, copy: t.copy, copied: t.copied, cap: t.cap, next: t.next,
    empty: t.empty, emptySub: t.emptySub, off: t.off, err: t.err,
  };
  // 앱 안 브라우저: 주 단추 = intent(Play 스토어 앱), 보조 = 지금의 https 주소. 번호는 누른 뒤에만 오므로 intent 는 «틀»을 싣고
  //   스크립트가 자리표시(대문자·숫자라 인코딩해도 그대로)를 번호로 바꾼다 — 서버 함수 playRedeemIntentUrl 과 같은 글자가 된다(시험 고정).
  const ia = opts.androidInApp === true;
  const ph = 'SGCODEPH';
  const iaT = IN_APP_TEXT[lang];
  return `${head}
<div id="pre">
<p class="t-label">${esc(t.myCode)}</p>
<div class="row"><p class="t-code mask" aria-hidden="true">•••• •••• •••• ••••</p></div>
<p class="help">${phrases(lang, t.andPre)}</p>
<button class="cta" id="claim" type="button">${esc(t.andCta)}</button>
</div>
<div id="got" hidden>
<p class="t-label">${esc(t.myCode)}</p>
<p class="t-code long" id="code"></p>
<div class="tools"><button class="copy" id="copy" type="button">${esc(t.copy)}</button></div>
<a class="cta" id="play" href="https://play.google.com/redeem">${esc(t.andApply)}</a>${ia ? `
<a class="cta2" id="playw" href="https://play.google.com/redeem">${esc(iaT.alt)}</a>` : ''}
<p class="step2" id="step2">${phrases(lang, t.andStep2)}</p>
<p class="help">${phrases(lang, t.andStep2Help)}</p>
<p class="help">${phrases(lang, t.andManual)}</p>${ia ? `
<p class="help">${inAppHintHtml(lang)}</p>` : ''}
<p class="note" id="again" hidden>${esc(t.again)}</p>
</div>
<div class="msg" id="msg" role="status" aria-live="polite" hidden></div>
<p class="free">${phrases(lang, free)}</p>
</section>
<p class="what">${phrases(lang, t.what)}</p>
<p class="fine">${phrases(lang, t.eligAnd)}</p>
<p class="alt"><a id="inst" href="${esc(ia ? playIntentUrl(opts.playInstallUrl) : opts.playInstallUrl)}">${esc(t.installOnly)}</a>${ia ? ` · <a id="instw" href="${esc(opts.playInstallUrl)}">${esc(iaT.alt)}</a>` : ''}</p>
</main><script>var C=${js({ f: fromTag || '', c: code, l: lang, t: strings, ...(ia ? { ri: playRedeemIntentUrl(ph), ph } : {}), ...(ref ? { r: ref } : {}) })};${beaconJs}
(function(){var $=function(i){return document.getElementById(i)},K='sg-coupon-play',RE=/^[A-Z0-9]{23}$/,b=$('claim');
function show(c,again){var w='https://play.google.com/redeem?code='+encodeURIComponent(c);$('pre').hidden=true;$('msg').hidden=true;$('code').textContent=c;$('play').href=C.ri?C.ri.split(C.ph).join(c):w;if($('playw'))$('playw').href=w;$('again').hidden=!again;$('got').hidden=false}
function say(a,s){var m=$('msg');m.textContent=a;if(s){var x=document.createElement('small');x.textContent=s;m.appendChild(x)}m.hidden=false}
function when(ms){try{return new Date(ms).toLocaleString(C.l==='ko'?'ko-KR':C.l==='ja'?'ja-JP':'en-US',{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'})}catch(e){return ''}}
try{var s=JSON.parse(localStorage.getItem(K)||'null');if(s&&RE.test(s.c)&&Date.now()-s.t<40*864e5)show(s.c,true)}catch(e){}
function reset(){b.disabled=false;b.textContent=C.t.cta}
b.addEventListener('click',function(){if(b.disabled)return;b.disabled=true;b.textContent=C.t.busy;
fetch('/api/coupon/claim',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-coupon':'1'},body:JSON.stringify(${ref ? '{from:C.f,code:C.c,l:C.l,ref:C.r}' : '{from:C.f,code:C.c,l:C.l}'})})
.then(function(r){return r.json().catch(function(){return {}})})
.then(function(j){j=j||{};
if(j.ok&&RE.test(j.code)){try{localStorage.setItem(K,JSON.stringify({c:j.code,t:Date.now()}))}catch(e){}show(j.code,!!j.again);return}
if(j.reason==='cap'){say(C.t.cap,j.resetAt?C.t.next+' · '+when(j.resetAt):'');$('pre').hidden=true;return}
if(j.reason==='empty'){say(C.t.empty,C.t.emptySub);$('pre').hidden=true;return}
if(j.reason==='off'){say(C.t.off);$('pre').hidden=true;return}
say(C.t.err);reset()})
.catch(function(){say(C.t.err);reset()})});
$('copy').addEventListener('click',function(){var v=$('code').textContent,btn=this,done=function(){btn.textContent=C.t.copied;setTimeout(function(){btn.textContent=C.t.copy},1600)};
sgBeacon('copy');
try{if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(v).then(done,fallback);return}}catch(e){}
fallback();
function fallback(){try{var a=document.createElement('textarea');a.value=v;a.setAttribute('readonly','');a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();a.setSelectionRange(0,99);document.execCommand('copy');document.body.removeChild(a);done()}catch(e){}}});
$('play').addEventListener('click',function(){sgBeacon('play')});
$('inst').addEventListener('click',function(){sgBeacon('install')});
if($('playw'))$('playw').addEventListener('click',function(){sgBeacon('play_web')});
if($('instw'))$('instw').addEventListener('click',function(){sgBeacon('install_web')});
})();</script></body></html>`;
}
