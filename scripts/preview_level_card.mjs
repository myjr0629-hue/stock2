// Local preview render of the level card at 1200×630 (NO deploy).
// Usage: node scripts/preview_level_card.mjs
import { ImageResponse } from 'next/dist/server/og/image-response.js';
import React from 'react';
import { writeFileSync } from 'node:fs';

const h = React.createElement;
const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-eunhoon-Documents-Project-recipt/e3916ef6-b660-4de4-b6f7-94aa054b6e09/scratchpad/nvda_card_630.png';

const C = {
  bg: '#06090f', ticker: '#F4F1E8', brand: '#8791A6', label: '#8B92A5',
  value: '#D2D8E4', line: '#222A3B', gold: '#E7C25A', goldLine: '#D4AF37',
  gap: '#59627A', foot: '#48515F',
};

const ROWS = [
  { label: 'CALL WALL', display: '220', n: 220, hi: false },
  { label: 'LAST', display: '207.83', n: 207.83, hi: true },
  { label: 'GAMMA FLIP', display: '205', n: 205, hi: false },
  { label: 'MAX PAIN', display: '200', n: 200, hi: false },
  { label: 'PUT FLOOR', display: '180', n: 180, hi: false },
];
const price = 207.83;
const gapStr = (lv) => { const g = ((lv - price) / price) * 100; return `${g >= 0 ? '+' : '-'}${Math.abs(g).toFixed(1)}%`; };

async function loadFonts() {
  const [regular, bold] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then(r => r.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then(r => r.arrayBuffer()),
  ]);
  return [
    { name: 'Inter', data: regular, weight: 400, style: 'normal' },
    { name: 'Inter', data: bold, weight: 700, style: 'normal' },
  ];
}
async function logoUri() {
  const res = await fetch('https://signumhq.com/icons/icon-192x192.png');
  return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
}

const logo = await logoUri();

const rowEl = (r, i) => h('div', {
  key: i,
  style: {
    display: 'flex', alignItems: 'center', gap: '22px', padding: '9px 16px', borderRadius: '10px',
    ...(r.hi ? { backgroundImage: 'linear-gradient(90deg, rgba(231,194,90,0.16), rgba(231,194,90,0.05) 55%, transparent)' } : {}),
  },
}, [
  h('span', { key: 'l', style: { display: 'flex', width: '188px', color: r.hi ? C.gold : C.label, fontSize: '21px', fontWeight: r.hi ? 700 : 500, letterSpacing: '2px' } }, r.label),
  h('div', { key: 'ln', style: { display: 'flex', flex: 1, height: '1px', borderTop: `${r.hi ? 3 : 1.5}px solid ${r.hi ? C.goldLine : C.line}` } }),
  h('span', { key: 'g', style: { display: 'flex', width: '76px', justifyContent: 'flex-end', color: C.gap, fontSize: '17px' } }, r.hi ? '' : gapStr(r.n)),
  h('span', { key: 'v', style: { display: 'flex', width: '160px', justifyContent: 'flex-end', color: r.hi ? C.gold : C.value, fontSize: r.hi ? '46px' : '30px', fontWeight: r.hi ? 800 : 500 } }, r.display),
]);

const el = h('div', {
  style: {
    width: '1200px', height: '630px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    backgroundColor: C.bg,
    backgroundImage: 'radial-gradient(ellipse 90% 70% at 82% 8%, rgba(231,194,90,0.11), transparent 55%), radial-gradient(ellipse 70% 60% at 8% 96%, rgba(34,211,238,0.06), transparent 55%)',
    padding: '44px 72px', fontFamily: 'Inter, sans-serif', position: 'relative',
  },
}, [
  h('div', { key: 'grid', style: { position: 'absolute', top: '0', left: '0', right: '0', bottom: '0', display: 'flex', backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '64px 64px' } }),
  h('div', { key: 'hd', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' } }, [
    h('div', { key: 'hl', style: { display: 'flex', alignItems: 'center', gap: '16px' } }, [
      h('div', { key: 'lg', style: { display: 'flex', width: '46px', height: '46px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' } },
        h('img', { src: logo, width: 30, height: 30, style: { objectFit: 'contain' } })),
      h('span', { key: 'tk', style: { color: C.ticker, fontSize: '46px', fontWeight: 700, letterSpacing: '1px' } }, '$NVDA'),
    ]),
    h('div', { key: 'hr', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } }, [
      h('span', { key: 'b', style: { color: C.brand, fontSize: '18px', fontWeight: 700, letterSpacing: '4px' } }, 'SIGNUM HQ'),
      h('span', { key: 'd', style: { color: C.foot, fontSize: '15px', letterSpacing: '1px', marginTop: '5px' } }, '2026-07-14'),
    ]),
  ]),
  h('div', { key: 'ld', style: { display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' } }, ROWS.map(rowEl)),
  h('div', { key: 'ft', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' } }, [
    h('span', { key: 'n', style: { color: C.foot, fontSize: '17px' } }, 'Live options levels · not investment advice'),
    h('span', { key: 's', style: { color: C.brand, fontSize: '17px', letterSpacing: '1px' } }, 'signumhq.com'),
  ]),
]);

const img = new ImageResponse(el, { width: 1200, height: 630, fonts: await loadFonts() });
writeFileSync(OUT, Buffer.from(await img.arrayBuffer()));
console.log('wrote', OUT);
