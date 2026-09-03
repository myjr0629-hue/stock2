#!/usr/bin/env node
// ============================================================================
// make-linkedin-banner — 링크드인 프로필 배경(1584×396)을 브랜드 규격으로 만든다.
// ----------------------------------------------------------------------------
// 왜 스크립트인가:
//   링크드인 배너는 «데스크톱은 왼쪽 아래를 프로필 사진이 덮고, 모바일은 좌우를
//   잘라낸다». 그래서 손으로 자르면 매번 글자가 아바타에 먹힌다. 안전영역을
//   상수로 박아두고 가운데로 맞추면 두 화면에서 다 산다.
//
//   색·톤은 public/og-brand.png 와 같은 계열로 맞춘다(근청록 강조 + 근흑 남색).
//
// 사용: node scripts/make-linkedin-banner.js [출력경로]
// ============================================================================
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 1584;
const H = 396;

// 아바타가 덮는 영역(데스크톱) — 이 사각형 안에는 글자를 두지 않는다.
const AVATAR = { x: 92, y: 196, w: 260, h: 200 };

const INK = '#F4F8FF';
const MUTED = '#9FB3C8';
const CYAN = '#5FD0E8';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function grid() {
  let d = '';
  for (let x = 0; x <= W; x += 48) d += `M${x} 0V${H}`;
  for (let y = 0; y <= H; y += 48) d += `M0 ${y}H${W}`;
  return `<path d="${d}" stroke="#5FD0E8" stroke-opacity="0.045" stroke-width="1" fill="none"/>`;
}

// 오른쪽에 얇은 캔들 실루엣 — 브랜드 OG 와 같은 모티프, 글자를 안 가릴 만큼만.
function candles() {
  const seed = [38, 52, 44, 61, 55, 72, 66, 84, 77, 96, 88, 112, 104, 129];
  let out = '';
  seed.forEach((h, i) => {
    const x = 1120 + i * 32;
    const y = H - 40 - h;
    out += `<rect x="${x}" y="${y}" width="12" height="${h}" rx="2" fill="#5FD0E8" fill-opacity="${0.05 + (i % 3) * 0.015}"/>`;
    out += `<rect x="${x + 5}" y="${y - 12}" width="2" height="${h + 24}" fill="#5FD0E8" fill-opacity="0.05"/>`;
  });
  return out;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#04070E"/>
      <stop offset="55%" stop-color="#0A1526"/>
      <stop offset="100%" stop-color="#050D18"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#5FD0E8" stop-opacity="0"/>
      <stop offset="35%" stop-color="#5FD0E8" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#5FD0E8" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${grid()}
  ${candles()}

  <g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" text-anchor="middle">
    <text x="${W / 2}" y="96" fill="${CYAN}" font-size="21" font-weight="700" letter-spacing="7.5">SIGNUM HQ</text>
    <text x="${W / 2}" y="168" fill="${INK}" font-size="52" font-weight="700" letter-spacing="-0.6">${esc('What the institutions actually did today.')}</text>
    <text x="${W / 2}" y="214" fill="${MUTED}" font-size="24" font-weight="400">${esc('Options flow · Dark pool share · Gamma exposure · Max pain — 2,000+ US tickers')}</text>
  </g>

  <rect x="${W / 2 - 320}" y="250" width="640" height="2" fill="url(#rule)"/>

  <g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" text-anchor="middle">
    <text x="${W / 2}" y="300" fill="${INK}" font-size="22" font-weight="600" letter-spacing="0.4">${esc('SIGNUM HQ · Undercurrent · Why’d It Move?')}</text>
    <text x="${W / 2}" y="336" fill="${CYAN}" font-size="19" font-weight="500" letter-spacing="1.6">${esc('FREE ON iOS & ANDROID  ·  signumhq.com')}</text>
  </g>
</svg>`;

const out = process.argv[2] || path.join(process.cwd(), 'linkedin-banner.png');

// 안전영역 검사 — 글자 기준선이 아바타 사각형에 들어가면 만들지 않는다.
const baselines = [96, 168, 214, 300, 336];
const clash = baselines.filter((y) => y > AVATAR.y && y < AVATAR.y + AVATAR.h);
if (clash.length) {
  // 가운데 정렬이라 x 로는 안 겹치지만, 좌측 정렬로 바꿀 때를 위한 방어.
  console.warn(`⚠️  아바타 세로 구간과 겹치는 기준선: ${clash.join(', ')} (가운데 정렬이라 통과)`);
}

sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(out)
  .then((info) => {
    console.log(`✅ ${out}  ${info.width}×${info.height}  ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
  })
  .catch((e) => {
    console.error('✗', e.message);
    process.exit(1);
  });
