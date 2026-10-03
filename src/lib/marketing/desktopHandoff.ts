import { COPY, type PreviewLang } from './linkPreview';

/**
 * 데스크톱 → 폰 «넘겨주기» 페이지.
 *
 * ★2026-09-23 실측이 만든 파일이다.
 *   9/22 배포한 기기별 집계(`mkt:attr:hit:<태그>:<기기>:<날짜>`)로 이틀치 83클릭을 쪼갰더니
 *   **데스크톱 67 · iOS 15 · 안드로이드 1 — 81% 가 PC** 였다. 블루스카이 26/28, IndieHackers·note·
 *   Medium·OKKY·X 는 «전부» PC 였다. 폰으로 오는 건 자사 웹(home) 뿐이었다(13/16 이 아이폰).
 *
 *   그런데 `/app` 은 PC 에게도 `apps.apple.com` 으로 302 를 보내고 있었다. PC 에서는 그 페이지에서
 *   **폰에 설치할 방법이 없다.** 「클릭 882 → Play 등록정보 11 → 설치 7」의 기계적 원인이 이것이다 —
 *   발행을 늘려도 설치가 늘지 않았던 이유.
 *
 *   그래서 PC 에는 스토어 대신 이 페이지를 보여준다: 폰 카메라로 찍을 QR + 스토어 버튼 2개.
 *   QR 안의 주소는 `…/app?from=<원래 태그>&via=qr` 이라 폰에서 열리면 «원래 채널»로 집계되고,
 *   QR 로 넘어온 것은 `mkt:attr:qr:<태그>:<날짜>` 로 따로 센다(넘겨주기가 먹히는지 잴 수 있게).
 *
 * ★2026-10-04 단순화 — QR·«폰으로 보내기»를 지웠다(숨김이 아니라 삭제).
 *   측정 키가 판정했다: 12일(9/22~10/3) mkt:attr:qr:* 합계 1 · mkt:attr:send:* 합계 0. 그리고 PC 클릭의 대부분은 사람이 아니었다
 *   (home PC 31 중 사람 브라우저 2, home_hero PC 114 중 2 — GROWTH-EFFECT-RESEARCH-2026-10-04 §4).
 *   iOS 설치의 82% 는 App Store «검색»에서 나온다 → 아이폰 사용자에게는 «App Store 에서 SIGNUM HQ 검색» 안내 한 줄,
 *   안드로이드에는 Play 웹 «설치»(PC 에서 눌러 내 폰에 원격 설치, utm_medium=pc_play) 버튼 하나만 둔다.
 *   예전 QR·보내기 링크로 폰에서 들어오는 요청(via=qr|send)은 /app 이 여전히 따로 센다(이미 퍼진 링크 대비).
 *
 * 안전: 이 응답은 사람(PC)에게만 간다. 미리보기 봇은 라우트 앞단에서 이미 갈라진다.
 *       반드시 `no-store` + `Vary: User-Agent` 로 내보낸다 — CDN 이 이 HTML 을 캐시해 «폰»에게 주면
 *       폰 사용자가 스토어로 못 간다(2026-09-20 봇 HTML 캐시 사고와 같은 구조, §bot-branch-html-gets-cached-for-humans).
 */

const SITE = 'https://www.signumhq.com';

type Txt = {
  h1: string; lead: string; note: string;
  andTitle: string; andBtn: string; andHelp: string;
  iosTitle: string; iosText: string;
};
const T: Record<PreviewLang, Txt> = {
  en: {
    h1: 'Get SIGNUM HQ on your phone',
    lead: 'SIGNUM HQ is a phone app.',
    note: 'Free on iOS & Android · no account needed',
    andTitle: 'Android phone?',
    andBtn: 'Install from Google Play',
    andHelp: 'On this computer, click Install and pick your phone — it installs straight to your phone (same Google account).',
    iosTitle: 'iPhone?',
    iosText: 'Open the App Store on your iPhone and search for',
  },
  ko: {
    h1: 'SIGNUM HQ 를 폰에 설치하세요',
    lead: 'SIGNUM HQ 는 휴대폰 앱입니다.',
    note: 'iOS·Android 무료 · 가입 없이 바로',
    andTitle: '안드로이드 폰이라면',
    andBtn: 'Google Play 에서 설치',
    andHelp: '이 PC 에서 [설치]를 누르고 내 휴대폰을 고르면 폰에 바로 설치됩니다(같은 Google 계정).',
    iosTitle: '아이폰이라면',
    iosText: '아이폰에서 App Store 를 열고 이렇게 검색하세요',
  },
  ja: {
    h1: 'SIGNUM HQ をスマホに入れる',
    lead: 'SIGNUM HQ はスマホ用アプリです。',
    note: 'iOS・Android 無料・登録不要',
    andTitle: 'Androidスマホなら',
    andBtn: 'Google Playでインストール',
    andHelp: 'このPCで[インストール]を押してスマホを選ぶと、スマホに直接インストールされます(同じGoogleアカウント)。',
    iosTitle: 'iPhoneなら',
    iosText: 'iPhoneでApp Storeを開いて、こう検索してください',
  },
};

/** App Store 에서 검색할 이름 — 스토어 표시 이름의 앞부분(«SIGNUM HQ: …»). */
export const APP_SEARCH_NAME = 'SIGNUM HQ';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export async function desktopHandoffHtml(opts: {
  fromTag: string | null;
  lang: PreviewLang;
  playStoreUrl: string;
}): Promise<string> {
  const { lang, playStoreUrl } = opts;
  const t = T[lang];
  const copy = COPY.signum[lang];
  const card = `${SITE}/promo/card-app-${lang}.png`;

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(t.h1)}</title>
<meta property="og:title" content="${esc(copy.title)}"><meta property="og:image" content="${card}">
<style>
:root{--ink:#0b1220;--sub:#51607a;--line:#e3e8f0;--bg:#f5f7fb;--card:#ffffff;--accent:#1f6feb}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Hiragino Sans",sans-serif}
main{max-width:980px;margin:0 auto;padding:48px 24px;display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:40px;align-items:center}
h1{font-size:30px;line-height:1.2;margin:0 0 10px;letter-spacing:-.01em}
.sub{color:var(--sub);margin:0 0 22px}
.shot{width:100%;border-radius:14px;border:1px solid var(--line);display:block}
.panel{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px}
.lead{margin:0;font-weight:600;text-align:center}
.sec{border-top:1px solid var(--line);margin-top:18px;padding-top:16px}
.sec h2{font-size:14px;margin:0 0 8px}
.primary{display:block;text-align:center;padding:12px 14px;border-radius:10px;background:var(--ink);color:#fff;text-decoration:none;font-weight:700}
.primary:hover,.primary:focus-visible{background:var(--accent);outline:none}
.help{font-size:12.5px;color:var(--sub);margin:8px 0 0}
.search{margin:0;font-size:13.5px;color:var(--sub)}
.name{display:block;margin-top:8px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);font-weight:700;font-size:17px;text-align:center;user-select:all}
.note{font-size:13px;color:var(--sub);margin:16px 0 0;text-align:center}
@media (max-width:760px){main{grid-template-columns:1fr;padding:28px 16px}}
</style></head><body><main>
<section><h1>${esc(t.h1)}</h1><p class="sub">${esc(copy.desc)}</p>
<img class="shot" src="${card}" alt="${esc(copy.title)}" width="1200" height="675"></section>
<aside class="panel" aria-label="${esc(t.h1)}">
<p class="lead">${esc(t.lead)}</p>
<div class="sec"><h2>${esc(t.andTitle)}</h2>
<a class="primary" href="${esc(playStoreUrl)}" target="_blank" rel="noopener">${esc(t.andBtn)}</a>
<p class="help">${esc(t.andHelp)}</p></div>
<div class="sec"><h2>${esc(t.iosTitle)}</h2>
<p class="search">${esc(t.iosText)}</p>
<span class="name">${esc(APP_SEARCH_NAME)}</span></div>
<p class="note">${esc(t.note)}</p>
</aside></main></body></html>`;
}
