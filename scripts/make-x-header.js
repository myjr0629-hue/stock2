// ============================================================================
// make-x-header — X 프로필 헤더(1500×500)를 앱과 같은 톤으로 만든다.
// ----------------------------------------------------------------------------
// 왜: 답글이 Premium+ 로 상단에 노출돼도, 프로필이 회색 기본값이면 방문자가
//     «무엇을 주는 계정인지» 3초 안에 못 본다. 2026-08-26 @signumhq_jp 팔로워 3명.
//
// 레이아웃 주의(실측 규칙):
//   · 아바타가 «좌하단»을 원형으로 덮는다 → 왼쪽 아래 260px 사각은 비워 둔다.
//   · 모바일은 위아래를 잘라낸다 → 핵심은 세로 중앙 60% 안에.
//
// 사용: node scripts/make-x-header.js <ja|en|ko>
// ============================================================================
const puppeteer = require('puppeteer');
const path = require('path');
const OUT = process.env.X_HEADER_OUT || path.join(process.env.HOME, 'Desktop', 'X 이미지 2026-08-26');

const COPY = {
  ja: { lead: '米国株の“裏側”を、毎営業日。',
        chips: ['オプションフロー', 'ダークプール', 'ガンマ (GEX)', 'マックスペイン'],
        foot: '完全無料 · 登録不要 · App Store / Google Play' },
  en: { lead: 'What the money did, every session.',
        chips: ['Options flow', 'Dark pool', 'Gamma (GEX)', 'Max pain'],
        foot: 'Free · No account · App Store / Google Play' },
  ko: { lead: '미국장 “뒤쪽”을, 매 거래일.',
        chips: ['옵션 플로우', '다크풀', '감마 (GEX)', '맥스페인'],
        foot: '완전 무료 · 가입 없음 · App Store / Google Play' },
};

(async () => {
  const loc = process.argv[2] || 'ja';
  const c = COPY[loc];
  if (!c) { console.error('ja | en | ko'); process.exit(1); }

  const html = `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1500px;height:500px;overflow:hidden;
       font-family:"Hiragino Sans","Noto Sans JP","Apple SD Gothic Neo",-apple-system,sans-serif;
       background:radial-gradient(1200px 600px at 78% 18%,#123a5e 0%,#0a1a2e 45%,#050a14 100%);
       color:#eaf2ff;position:relative}
  /* 아바타가 앉는 좌하단은 비워 둔다 */
  .wrap{position:absolute;left:300px;top:0;right:64px;height:500px;
        display:flex;flex-direction:column;justify-content:center;gap:26px}
  .lead{font-size:52px;font-weight:800;letter-spacing:-0.02em;line-height:1.18;
        text-shadow:0 2px 24px rgba(0,0,0,.45)}
  .chips{display:flex;gap:12px;flex-wrap:wrap}
  .chip{border:1px solid rgba(120,200,255,.34);background:rgba(18,58,94,.42);
        border-radius:999px;padding:11px 20px;font-size:23px;font-weight:700;color:#bfe2ff;
        white-space:nowrap}
  .foot{display:flex;align-items:baseline;gap:16px}
  .url{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:29px;font-weight:700;color:#7fd4ff}
  .sub{font-size:20px;color:#94aec9}
  .glow{position:absolute;right:-160px;top:-160px;width:620px;height:620px;border-radius:50%;
        background:radial-gradient(circle,rgba(64,166,255,.20),transparent 62%)}
  </style><div class="glow"></div><div class="wrap">
    <div class="lead">${c.lead}</div>
    <div class="chips">${c.chips.map((x) => `<span class="chip">${x}</span>`).join('')}</div>
    <div class="foot"><span class="url">signumhq.com/app</span><span class="sub">${c.foot}</span></div>
  </div>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 500, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const out = path.join(OUT, `x-header-${loc}.png`);
  await page.screenshot({ path: out });
  await browser.close();
  console.log(out);
})();
