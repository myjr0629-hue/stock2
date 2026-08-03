// ============================================================================
// /api/guardian/breaking — 오늘의 급변동 속보 (앱 가디언 화면이 읽는다)
// ----------------------------------------------------------------------------
// 감지는 /api/cron/breaking-detect 가 하고 Redis에 쌓는다. 여기는 읽기 전용.
//
// 🅢 섀도 모드에서는 «빈 배열»을 준다.
//   감지기는 이미 돌지만 사용자에게는 아무것도 안 보인다 — 그게 섀도의 정의다.
//   ?debug=1(+CRON_SECRET)로만 섀도 항목까지 본다. 대표 검증용.
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { etDate } from '@/services/breaking/sigmaEngine';
import { FEED_KEY, HEARTBEAT_KEY, type BreakingItem, type BreakingHeartbeat } from '@/services/breaking/types';
import { detectForSymbol } from '@/services/breaking/detectMove';
import { buildWhyContext, buildWhyText, buildHeadline } from '@/services/breaking/whyBuilder';
import type { Locale } from '@/services/breaking/whyBuilder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('locale') || 'en').slice(0, 2);
  const loc: Locale = raw === 'ko' ? 'ko' : raw === 'ja' ? 'ja' : 'en';

  // 디버그 열람은 크론 시크릿을 요구한다 — 섀도 데이터가 공개로 새면 안 된다.
  const debug = searchParams.get('debug') === '1'
    && !!process.env.CRON_SECRET
    && searchParams.get('secret') === process.env.CRON_SECRET;

  // ── ?preview=1 — 소유자 검증용 통로 ─────────────────────────────────────
  // 실제 이벤트는 며칠에 한 번 뜨므로, 그걸 기다려서는 카드 UI를 검증할 수 없다.
  // 그렇다고 «가짜 데이터»를 넣으면 검증한 게 아니다(가짜는 언제나 예쁘게 나온다).
  // → 진짜 종목의 «진짜 현재 데이터»를 같은 파이프라인에 태우되, σ 게이트만 건너뛴다.
  //   즉 여기 나오는 숫자는 전부 실측이고, 다만 «알릴 만큼 크지 않은» 움직임이다.
  //   카드가 이 파라미터를 붙이는 일은 없으므로 일반 사용자에게는 절대 노출되지 않는다.
  if (searchParams.get('preview') === '1') {
    const sym = (searchParams.get('symbol') || 'SPY').toUpperCase().slice(0, 6);
    const sig = await detectForSymbol(sym).catch(() => null)
      ?? await previewSignal(sym).catch(() => null);
    if (!sig) return NextResponse.json({ items: [], preview: true, reason: 'no-data' });
    const ctx = await buildWhyContext(sig, loc);
    return NextResponse.json({
      items: [{
        id: `preview-${sym}`, symbol: sig.symbol, kind: sig.kind,
        changePct: +sig.changePct.toFixed(2),
        priorPct: sig.priorPct != null ? +sig.priorPct.toFixed(2) : null,
        sigmaMult: +sig.sigmaMult.toFixed(2), volumeMult: +sig.volumeMult.toFixed(2),
        dayChangePct: +sig.dayChangePct.toFixed(2), price: sig.price, atET: sig.atET,
        headline: buildHeadline(sig, loc), why: buildWhyText(sig, ctx, loc),
        confidence: ctx.confidence, news: ctx.news, calendar: ctx.calendar,
        mode: 'preview',
      }],
      preview: true, count: 1,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const today = etDate();
  const [feed, heartbeat] = await Promise.all([
    getFromCache<BreakingItem[]>(FEED_KEY(today)).then((v) => v ?? []),
    getFromCache<BreakingHeartbeat>(HEARTBEAT_KEY),
  ]);

  // 섀도 항목은 일반 요청에 노출하지 않는다.
  const visible = debug ? feed : feed.filter((f) => f.mode === 'live');

  const items = visible
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((f) => ({
      id: f.id,
      symbol: f.signal.symbol,
      kind: f.signal.kind,
      changePct: +f.signal.changePct.toFixed(2),
      priorPct: f.signal.priorPct != null ? +f.signal.priorPct.toFixed(2) : null,
      sigmaMult: +f.signal.sigmaMult.toFixed(2),
      volumeMult: +f.signal.volumeMult.toFixed(2),
      dayChangePct: +f.signal.dayChangePct.toFixed(2),
      price: f.signal.price,
      atET: f.signal.atET,
      headline: f.copy[loc]?.headline ?? f.copy.en.headline,
      why: f.copy[loc]?.why ?? f.copy.en.why,
      confidence: f.context[loc]?.confidence ?? 'NONE',
      news: (f.context[loc] ?? f.context.en).news,
      calendar: (f.context[loc] ?? f.context.en).calendar,
      mode: f.mode,
    }));

  return NextResponse.json(
    {
      items, date: today, count: items.length,
      // 생존 신호만. 감지 내용은 담기지 않는다.
      detector: heartbeat
        ? { lastRunISO: heartbeat.atISO, scanned: heartbeat.scanned, regularSession: heartbeat.regularSession }
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** preview 전용 — σ 게이트를 건너뛰고 «지금 실제 움직임»을 그대로 신호로 만든다. */
async function previewSignal(symbol: string) {
  const { detectForSymbolRaw } = await import('@/services/breaking/detectMove');
  return detectForSymbolRaw(symbol);
}
