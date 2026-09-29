// 인앱 이벤트 이미지 합성 — 운영 실화면(hi-list-<loc>.png, 402pt@4) + 앱 하트(금색 #FBBF24/#F59E0B)
// 애플 규정(developer.apple.com/app-store/in-app-events): 카드 16:9(1920x1080~3840x2160) · 상세 9:16(1080x1920~2160x3840)
//   «글자·로고는 가능하면 넣지 말 것» · «테두리·그라디언트를 넣지 말 것(애플이 자동 적용)» → 단색 남색 바탕 + 앱 화면 + 하트 아이콘만.
// 사용: KINDS=card|detail|feature node scripts/compose-event-media.cjs <hi 캡처 폴더> <출력폴더> <로케일들> [변형 A|F]
//   2026-09-30 최종: 카드 A(하트 버튼 + 목록 카드) · 상세 F(하트 버튼 위 + 목록 카드) · feature = Play 1024x500(2배로 그려 줄인다)
const puppeteer = require('puppeteer');
const fs = require('fs'); const path = require('path');
const RAW = process.argv[2]; const OUT = process.argv[3];
const LOCS = (process.argv[4] || 'ko,en,ja').split(',');
const VARS = (process.argv[5] || 'A').split(',');
const BG = '#070C17';
const HEART = 'M12 19.85C10.14 18.18 5.9 14.56 4.07 11.12A4.4 4.4 0 1 1 12 7.33A4.4 4.4 0 1 1 19.93 11.12C18.1 14.56 13.86 18.18 12 19.85z';
const heartSvg = (px) => `<svg viewBox="3 4.2 18 16.2" width="${px}" height="${Math.round(px * 16.2 / 18)}" style="display:block"><path d="${HEART}" fill="#FBBF24" stroke="#F59E0B" stroke-width="0.9" stroke-linejoin="round"/></svg>`;
// 앱 헤더 하트 버튼(켜짐)과 같은 모양: 배경 rgba(251,191,36,.12) · 테두리 rgba(251,191,36,.35)
const heartBtn = (w, h) => `<div style="width:${w}px;height:${h}px;border-radius:${Math.round(h * 0.235)}px;background:rgba(251,191,36,.12);border:${Math.max(2, Math.round(h / 60))}px solid rgba(251,191,36,.35);display:flex;align-items:center;justify-content:center;box-sizing:border-box">${heartSvg(Math.round(h * 0.56))}</div>`;

// 원본(4px/pt)에서 pt 좌표 사각형을 잘라 CSS 크기로 놓는다
function crop(img, m, box, scaleCssPerPt, left, top, extraStyle = '') {
  const [x, y, w, h] = box; // pt
  const iw = m.imgW / 4 * scaleCssPerPt; // 전체 이미지의 CSS 폭
  return `<div style="position:absolute;left:${left}px;top:${top}px;width:${w * scaleCssPerPt}px;height:${h * scaleCssPerPt}px;overflow:hidden;${extraStyle}">
    <img src="${img}" style="position:absolute;left:${-x * scaleCssPerPt}px;top:${-y * scaleCssPerPt}px;width:${iw}px;max-width:none"/></div>`;
}

function cardHtml(loc, m, img, v) {
  const L = m.list; // pt
  const s = v === 'C' ? 1.95 : 1.62;           // CSS px per pt
  const box = [L.x - 3, L.y - 3, L.w + 6, Math.min(L.h + 6, (720 - 40) / s + 2)];  // 캔버스 바닥까지 — 중간에 잘린 선이 없게
  const cw = box[2] * s;
  let body = '';
  if (v === 'A') {
    body += `<div style="position:absolute;left:170px;top:118px">${heartBtn(270, 210)}</div>`;
    body += crop(img, m, box, s, 1280 - 120 - cw, 40);
  } else if (v === 'B') {
    body += `<div style="position:absolute;left:160px;top:120px">${heartSvg(250)}</div>`;
    body += crop(img, m, box, s, 1280 - 100 - cw, 40);
  } else { // C: 카드 중앙 크게 + 왼쪽 위 하트 배지
    const left = (1280 - cw) / 2;
    body += crop(img, m, box, s, left, 36);
    body += `<div style="position:absolute;left:${left - 70}px;top:6px">${heartBtn(128, 100)}</div>`;
  }
  return `<html><body style="margin:0;width:1280px;height:720px;background:${BG};position:relative;overflow:hidden">${body}</body></html>`;
}

function detailHtml(loc, m, img, v) {
  const L = m.list;
  let body = '';
  if (v === 'F') {
    const s = 680 / (L.w + 6);
    body += `<div style="position:absolute;left:${(720 - 190) / 2}px;top:78px">${heartBtn(190, 148)}</div>`;
    body += crop(img, m, [L.x - 3, L.y - 3, L.w + 6, (1280 - 290) / s + 2], s, 20, 290);
  } else { // E: 실제 화면 전체 — 맨 위(0pt)부터 전폭, 캔버스 끝까지(이음매 없음)
    const s = 720 / 402;
    body += crop(img, m, [0, 0, 402, 1280 / s + 1], s, 0, 0);
  }
  return `<html><body style="margin:0;width:720px;height:1280px;background:${BG};position:relative;overflow:hidden">${body}</body></html>`;
}

function featureHtml(loc, m, img) {
  // Play 대표 이미지(feature graphic) 1024x500 — 카드와 같은 구성(하트 버튼 + 목록 카드), 글자·로고 없음
  const L = m.list; const s = 1.18;
  const box = [L.x - 3, L.y - 3, L.w + 6, Math.min(L.h + 6, (500 - 30) / s + 2)];
  const cw = box[2] * s;
  let body = `<div style="position:absolute;left:150px;top:${(500 - 150) / 2 - 10}px">${heartBtn(196, 152)}</div>`;
  body += crop(img, m, box, s, 1024 - 110 - cw, 30);
  return `<html><body style="margin:0;width:1024px;height:500px;background:${BG};position:relative;overflow:hidden">${body}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  for (const loc of LOCS) {
    const imgPath = path.join(RAW, `hi-list-${loc}.png`);
    const m = JSON.parse(fs.readFileSync(imgPath.replace('.png', '.json'), 'utf8'));
    m.imgW = 1608;
    const img = 'file://' + imgPath;
    for (const v of VARS) {
      for (const kind of (process.env.KINDS || 'card,detail').split(',')) {
        const html = kind === 'card' ? cardHtml(loc, m, img, v) : kind === 'feature' ? featureHtml(loc, m, img) : detailHtml(loc, m, img, v);
        const htmlPath = path.join(OUT, `_${kind}-${v}-${loc}.html`);
        fs.writeFileSync(htmlPath, html);
        const page = await browser.newPage();
        const [w, h] = kind === 'card' ? [1280, 720] : kind === 'feature' ? [1024, 500] : [720, 1280];
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
        await page.goto('file://' + htmlPath, { waitUntil: 'load' });
        await new Promise((r) => setTimeout(r, 400));
        const out = path.join(OUT, `event-${kind}-${v}-${loc}.png`);
        await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
        await page.close();
        console.log('  ✓', path.basename(out));
      }
    }
  }
  await browser.close();
})();
