import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { getUnifiedMetrics, getXsRow, getXsReport, expectFromScore, readStructure, verdictLabel } from '@/lib/trade/fusion';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Per-symbol SIGNUM VERDICT: XS score + factor z's + full options/flow metrics
// + the engine's MEASURED expectation for this score decile + a transparent
// rule-based label. No AI on this hot path (that lives in /xray).
export async function GET(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  const symbol = (req.nextUrl.searchParams.get('symbol') || '').toUpperCase().trim();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) {
    return NextResponse.json({ ok: false, error: '심볼 형식 오류' }, { status: 400 });
  }
  const pxParam = Number(req.nextUrl.searchParams.get('px'));
  const livePx = Number.isFinite(pxParam) && pxParam > 0 ? pxParam : null;

  const [metrics, xs, rep] = await Promise.all([
    getUnifiedMetrics(symbol),
    getXsRow(symbol),
    getXsReport(),
  ]);
  const struct = readStructure(livePx, metrics);
  const expect = expectFromScore(xs.score, rep);
  const label = verdictLabel(xs.score, struct, expect);

  return NextResponse.json({
    ok: true, symbol,
    xs: { score: xs.score, date: xs.date, z: xs.z },
    expect,        // { decile, adjF3, hit, days } — 실측 보정테이블
    metrics,       // 옵션·플로우 전지표
    struct,        // 구조 판독 (거리·플래그)
    label,         // EDGE / NEUTRAL / AGAINST / NO_DATA (규칙 기반, 설명가능)
    engineDate: rep?.date ?? null,
  });
}
