import { createElement as h } from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { promoExpiryDate } from '@/lib/marketing/promoExpiry';
import { APPLE_CODE_LIMIT, promoCodeLimit } from '@/lib/marketing/promoLimit';

export const runtime = 'nodejs';

/** 기존 카드의 날짜·한도 숫자 영역만 교체한다. 배지·라벨·배치·나머지 원본 픽셀은 그대로 쓴다. */
const DATE_BOX = {
  ko: { left: 302, top: 95, width: 58, height: 26, fontSize: 22 },
  en: { left: 338, top: 96, width: 75, height: 26, fontSize: 23 },
  ja: { left: 318, top: 96, width: 78, height: 29, fontSize: 26 },
};
// 원본 500의 자리 안에 숫자 전체를 맞춘다. 명/名·구분자·날짜는 이동하지 않는다.
const LIMIT_BOX = {
  ko: { left: 224, top: 95, width: 40, height: 26, fontSize: 22 },
  en: { left: 219, top: 96, width: 43, height: 26, fontSize: 23 },
  ja: { left: 224, top: 96, width: 49, height: 29, fontSize: 26 },
};

export async function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get('l');
  const l = lang === 'ko' || lang === 'ja' ? lang : 'en';
  const code = request.nextUrl.searchParams.get('code');
  const date = promoExpiryDate(code, l);
  const limit = promoCodeLimit(code);
  const dateChanged = date !== promoExpiryDate(null, l);
  const limitChanged = limit !== APPLE_CODE_LIMIT;
  const original = await readFile(join(process.cwd(), 'public', 'promo', `redeem-card-${l}.png`));
  const headers = { 'cache-control': 'public, max-age=3600, s-maxage=86400' };
  if (!dateChanged && !limitChanged) {
    return new Response(new Uint8Array(original), { headers: { ...headers, 'content-type': 'image/png' } });
  }
  const { fontSize, ...box } = DATE_BOX[l];
  const { fontSize: limitFontSize, ...limitBox } = LIMIT_BOX[l];
  return new ImageResponse(h('div', {
    style: { display: 'flex', width: 1200, height: 675, position: 'relative' },
  },
  h('img', { src: `data:image/png;base64,${original.toString('base64')}`, width: 1200, height: 675 }),
  dateChanged && h('div', { style: {
    display: 'flex', position: 'absolute', ...box, background: '#fbbf24', color: '#111827',
    fontSize, fontWeight: 700, lineHeight: 1, alignItems: 'center', whiteSpace: 'nowrap',
    textShadow: '0.6px 0 #111827, -0.6px 0 #111827, 0 0.6px #111827, 0 -0.6px #111827',
  } }, date),
  limitChanged && h('div', { style: {
    display: 'flex', position: 'absolute', ...limitBox, background: '#fbbf24', color: '#111827',
    fontSize: limitFontSize, fontWeight: 700, lineHeight: 1, alignItems: 'center', whiteSpace: 'nowrap',
    textShadow: '0.6px 0 #111827, -0.6px 0 #111827, 0 0.6px #111827, 0 -0.6px #111827',
  } }, h('div', { style: {
    display: 'flex', flexShrink: 0, transform: 'scaleX(0.65)', transformOrigin: 'left center',
  } }, limit.toLocaleString('en-US')))), { width: 1200, height: 675, headers });
}
