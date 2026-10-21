import { createElement as h } from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { promoExpiryDate } from '@/lib/marketing/promoExpiry';
import { APPLE_CODE_LIMIT, promoCodeLimit } from '@/lib/marketing/promoLimit';

export const runtime = 'nodejs';

/**
 * 기존 카드(public/promo/redeem-card-*.png)의 노란 배지에서 «숫자»(한도·날짜)만 다시 쓴다.
 * 배지의 라벨 글자(iPhone·선착순·명·까지 등)·구분자·카드의 나머지 픽셀은 원본 이미지를 잘라 그대로 쓴다.
 * 숫자는 원본 배지와 같은 글꼴(Noto Sans 라틴, 굵기·크기·색을 원본 픽셀과 맞춘 값)으로 그린다 — 2026-10-21
 *   (예전 판은 기본 글꼴·가로 0.65배 압축이라 «5,000»·«12/30»이 주변 글자보다 가늘고 작았다).
 * 숫자가 길어진 만큼(500→5,000) 뒤의 원본 조각과 배지 오른쪽 끝이 함께 밀린다 — 배지 왼쪽·위·아래·다른 요소는 그대로.
 * 아래 좌표는 원본 PNG 의 픽셀 실측(글자 잉크 구간·배지 위/아래 끝)이다.
 */
type Badge = {
  top: number; height: number;          // 배지 노란 영역 행 범위(원본 실측)
  x0: number; numDx: number;            // 숫자 상자 시작 = 원본 숫자 잉크 바로 앞
  midFrom: number; midTo: number;       // 숫자와 날짜 사이 원본 조각(라벨·구분자)
  tailFrom: number; tailTo: number;     // 날짜 뒤 원본 조각(라벨) + 배지 오른쪽 끝
  weight: 700 | 800; fontSize: number; letterSpacing: number; dy: number;
};
const BADGE: Record<'ko' | 'en' | 'ja', Badge> = {
  ko: { top: 88, height: 41, x0: 222, numDx: 2, midFrom: 264, midTo: 302, tailFrom: 358, tailTo: 415, weight: 700, fontSize: 21, letterSpacing: 0, dy: -2 },
  en: { top: 88, height: 44, x0: 218, numDx: 2, midFrom: 263, midTo: 338, tailFrom: 411, tailTo: 430, weight: 800, fontSize: 23, letterSpacing: 0.5, dy: -2 },
  ja: { top: 88, height: 47, x0: 222, numDx: 1, midFrom: 272, midTo: 319, tailFrom: 396, tailTo: 458, weight: 800, fontSize: 26, letterSpacing: 0.5, dy: -2 },
};
const INK = 'rgb(26,19,6)';        // 원본 배지 글자색(실측)
const BADGE_BG = '#fbbf24';        // 원본 배지 노랑(실측 251,191,36)

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
  const b = BADGE[l];
  const font = await readFile(join(process.cwd(), 'public', 'promo', 'fonts', `promo-badge-${b.weight}.ttf`));
  const src = `data:image/png;base64,${original.toString('base64')}`;
  // 원본 카드의 [from, to) 가로 구간을 배지 높이만큼 잘라 그대로 붙인다.
  const crop = (from: number, to: number) => h('div', {
    style: { display: 'flex', position: 'relative', width: to - from, height: b.height, overflow: 'hidden', flexShrink: 0 },
  }, h('img', { src, width: 1200, height: 675, style: { position: 'absolute', left: -from, top: -b.top } }));
  const text = (value: string, marginLeft = 0) => h('div', {
    style: {
      display: 'flex', flexShrink: 0, height: b.height, marginTop: b.dy, marginLeft, alignItems: 'center', whiteSpace: 'nowrap',
      fontFamily: 'Badge', fontWeight: b.weight, fontSize: b.fontSize, letterSpacing: b.letterSpacing, color: INK,
    },
  }, value);
  const original500 = APPLE_CODE_LIMIT.toLocaleString('en-US');
  return new ImageResponse(h('div', {
    style: { display: 'flex', width: 1200, height: 675, position: 'relative' },
  },
  h('img', { src, width: 1200, height: 675 }),
  h('div', {
    style: { display: 'flex', position: 'absolute', left: b.x0, top: b.top, height: b.height, background: BADGE_BG, alignItems: 'flex-start' },
  },
  text(limitChanged ? limit.toLocaleString('en-US') : original500, b.numDx),
  crop(b.midFrom, b.midTo),
  text(date),
  crop(b.tailFrom, b.tailTo))),
  { width: 1200, height: 675, headers, fonts: [{ name: 'Badge', data: font, weight: b.weight, style: 'normal' }] });
}
