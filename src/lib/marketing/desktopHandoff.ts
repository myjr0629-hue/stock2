import QRCode from 'qrcode';
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
 * 안전: 이 응답은 사람(PC)에게만 간다. 미리보기 봇은 라우트 앞단에서 이미 갈라진다.
 *       반드시 `no-store` + `Vary: User-Agent` 로 내보낸다 — CDN 이 이 HTML 을 캐시해 «폰»에게 주면
 *       폰 사용자가 스토어로 못 간다(2026-09-20 봇 HTML 캐시 사고와 같은 구조, §bot-branch-html-gets-cached-for-humans).
 */

const SITE = 'https://www.signumhq.com';

type Txt = {
  h1: string; sub: string; scan: string; or: string; ios: string; android: string; note: string;
  // 2026-09-30 — PC→폰 원격 설치(안드로이드)·«폰으로 보내기»(아이폰 등)
  andTitle: string; andBtn: string; andHelp: string; sendTitle: string; sendText: string; mail: string;
};
const T: Record<PreviewLang, Txt> = {
  en: {
    h1: 'Get SIGNUM HQ on your phone',
    sub: 'It is a phone app — point your phone camera at the code.',
    scan: 'Opens the App Store or Google Play automatically.',
    or: 'or open the store directly',
    ios: 'iPhone · Mac: App Store',
    android: 'Google Play',
    note: 'Free on iOS & Android · no account needed',
    andTitle: 'Android phone?',
    andBtn: 'Install from Google Play',
    andHelp: 'On this computer, click Install and pick your phone — it installs straight to your phone (same Google account).',
    sendTitle: 'Send the link to your phone',
    sendText: 'SIGNUM HQ — options flow, max pain & dark pool app for US stocks',
    mail: 'Email',
  },
  ko: {
    h1: 'SIGNUM HQ 를 폰에 설치하세요',
    sub: '휴대폰 앱입니다 — 폰 카메라로 이 코드를 비춰 주세요.',
    scan: 'App Store 또는 Google Play 가 자동으로 열립니다.',
    or: '또는 스토어를 바로 열기',
    ios: '아이폰·맥: App Store',
    android: 'Google Play',
    note: 'iOS·Android 무료 · 가입 없이 바로',
    andTitle: '안드로이드 폰이라면',
    andBtn: 'Google Play 에서 설치',
    andHelp: '이 PC 에서 [설치]를 누르고 내 휴대폰을 고르면 폰에 바로 설치됩니다(같은 Google 계정).',
    sendTitle: '링크를 폰으로 보내기',
    sendText: 'SIGNUM HQ — 미국주식 옵션 플로우·맥스페인·다크풀 앱',
    mail: '메일',
  },
  ja: {
    h1: 'SIGNUM HQ をスマホに入れる',
    sub: 'スマホ用アプリです — スマホのカメラでこのコードを読み取ってください。',
    scan: 'App Store または Google Play が自動で開きます。',
    or: 'またはストアを直接開く',
    ios: 'iPhone・Mac:App Store',
    android: 'Google Play',
    note: 'iOS・Android 無料・登録不要',
    andTitle: 'Androidスマホなら',
    andBtn: 'Google Playでインストール',
    andHelp: 'このPCで[インストール]を押してスマホを選ぶと、スマホに直接インストールされます(同じGoogleアカウント)。',
    sendTitle: 'リンクをスマホに送る',
    sendText: 'SIGNUM HQ — 米国株のオプションフロー・マックスペイン・ダークプールアプリ',
    mail: 'メール',
  },
};

/**
 * «폰으로 보내기» 링크 — 공유 URL 만 넘긴다(개인정보를 받지 않는다). 폰에서 열면 /app 이 via=send 로 따로 센다.
 *   메신저 «나에게»: WhatsApp «Message yourself» · Telegram «Saved Messages» · LINE «Keep» — 사용자가 받는 사람을 고른다.
 *   카카오 «나와의 채팅»은 SDK 키가 필요해 2차. 일본은 LINE 을 맨 앞에.
 */
export function sendLinks(lang: PreviewLang, fromTag: string | null): { key: string; label: string; href: string }[] {
  const t = T[lang];
  const url = `${SITE}/app?from=${encodeURIComponent(fromTag || 'desktop')}&via=send${lang !== 'en' ? `&l=${lang}` : ''}`;
  const msg = `${t.sendText}\n${url}`;
  const enc = encodeURIComponent;
  const all = {
    mail: { key: 'mail', label: t.mail, href: `mailto:?subject=${enc('SIGNUM HQ')}&body=${enc(msg)}` },
    wa: { key: 'wa', label: 'WhatsApp', href: `https://wa.me/?text=${enc(msg)}` },
    tg: { key: 'tg', label: 'Telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(t.sendText)}` },
    line: { key: 'line', label: 'LINE', href: `https://line.me/R/share?text=${enc(msg)}` },
  };
  const order = lang === 'ja' ? ['line', 'mail', 'wa', 'tg'] : ['mail', 'wa', 'tg', 'line'];
  return order.map((k) => all[k as keyof typeof all]);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export async function desktopHandoffHtml(opts: {
  fromTag: string | null;
  lang: PreviewLang;
  appStoreUrl: string;
  playStoreUrl: string;
}): Promise<string> {
  const { fromTag, lang, appStoreUrl, playStoreUrl } = opts;
  const t = T[lang];
  const copy = COPY.signum[lang];
  const tag = fromTag || 'desktop';
  const scanUrl = `${SITE}/app?from=${encodeURIComponent(tag)}&via=qr${lang !== 'en' ? `&l=${lang}` : ''}`;
  const svg = await QRCode.toString(scanUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1220', light: '#ffffff' } });
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
.panel{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;text-align:center}
.qr{width:236px;height:236px;margin:0 auto 14px}.qr svg{width:100%;height:100%}
.scan{font-size:13px;color:var(--sub);margin:0 0 18px}
.or{font-size:12px;color:var(--sub);margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em}
.btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btns a{flex:1 1 130px;padding:11px 14px;border-radius:10px;border:1px solid var(--line);color:var(--ink);text-decoration:none;font-weight:600}
.btns a:hover,.btns a:focus-visible{border-color:var(--accent);outline:none}
.note{font-size:13px;color:var(--sub);margin-top:16px}
.sec{border-top:1px solid var(--line);margin-top:18px;padding-top:16px;text-align:left}
.sec h2{font-size:14px;margin:0 0 8px}
.primary{display:block;text-align:center;padding:12px 14px;border-radius:10px;background:var(--ink);color:#fff;text-decoration:none;font-weight:700}
.primary:hover,.primary:focus-visible{background:var(--accent);outline:none}
.help{font-size:12.5px;color:var(--sub);margin:8px 0 0}
.send{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.send a{padding:9px 6px;border-radius:10px;border:1px solid var(--line);color:var(--ink);text-decoration:none;font-weight:600;font-size:13px;text-align:center}
.send a:hover,.send a:focus-visible{border-color:var(--accent);outline:none}
.small{display:block;margin-top:14px;font-size:13px;color:var(--sub)}.small a{color:var(--accent)}
@media (max-width:760px){main{grid-template-columns:1fr;padding:28px 16px}}
</style></head><body><main>
<section><h1>${esc(t.h1)}</h1><p class="sub">${esc(copy.desc)}</p>
<img class="shot" src="${card}" alt="${esc(copy.title)}" width="1200" height="675"></section>
<aside class="panel" aria-label="${esc(t.sub)}">
<p style="margin:0 0 14px;font-weight:600">${esc(t.sub)}</p>
<div class="qr" role="img" aria-label="QR code">${svg}</div>
<p class="scan">${esc(t.scan)}</p>
<div class="sec"><h2>${esc(t.andTitle)}</h2>
<a class="primary" href="${esc(playStoreUrl)}" target="_blank" rel="noopener">${esc(t.andBtn)}</a>
<p class="help">${esc(t.andHelp)}</p></div>
<div class="sec"><h2>${esc(t.sendTitle)}</h2>
<div class="send">${sendLinks(lang, fromTag).map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener" data-k="${l.key}">${esc(l.label)}</a>`).join('')}</div></div>
<span class="small"><a href="${esc(appStoreUrl)}">${esc(t.ios)}</a></span>
<p class="note">${esc(t.note)}</p>
</aside></main></body></html>`;
}
