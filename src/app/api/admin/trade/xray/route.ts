import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';
import { getUnifiedMetrics, getXsRow, getXsReport, expectFromScore, readStructure, verdictLabel, stanceFrom, CALIB_MIN_DAYS } from '@/lib/trade/fusion';
import { getFromCache, setInCache } from '@/services/redisClient';
import { callBedrock } from '@/services/bedrockClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Bedrock on the path

// POSITION X-RAY — the cold, engine-grounded read of every REAL holding:
// Toss cost basis/PnL × XS score & measured decile expectation × options
// structure, plus one batched Bedrock synthesis (factual, observation-only)
// cached per holdings-fingerprint per day so repeated views cost nothing.
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

interface HoldingIn { symbol?: string; name?: string; currency?: string; quantity?: string; lastPrice?: string; averagePurchasePrice?: string; marketValue?: { amount?: string }; profitLoss?: { rate?: string } }

export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;

  const holdings = await callToss({ path: '/api/v1/holdings' });
  const items = ((holdings.data as { result?: { items?: HoldingIn[] } })?.result?.items ?? [])
    .filter((h) => h.symbol && /^[A-Z]{1,6}(\.[A-Z])?$/.test(String(h.symbol)))
    .slice(0, 10);
  if (!items.length) {
    return NextResponse.json({ ok: holdings.status < 400, rows: [], ai: null, holdingsStatus: holdings.status });
  }

  const rep = await getXsReport();
  const rows = await Promise.all(items.map(async (h) => {
    const sym = String(h.symbol);
    const [metrics, xs] = await Promise.all([getUnifiedMetrics(sym), getXsRow(sym)]);
    const px = num(h.lastPrice) ?? metrics?.price ?? null;
    const struct = readStructure(px, metrics);
    const expect = expectFromScore(xs.score, rep);
    const plPct = num(h.profitLoss?.rate) != null ? Number(h.profitLoss!.rate) * 100 : null;
    const label = verdictLabel(xs.score, struct, expect);
    return {
      symbol: sym, name: h.name ?? null, currency: h.currency ?? 'USD',
      qty: num(h.quantity), px, avg: num(h.averagePurchasePrice),
      evalAmt: num(h.marketValue?.amount),
      plPct,
      xsScore: xs.score, expect, struct, label,
      stance: stanceFrom(label, plPct),
      metrics: metrics ? { squeeze: metrics.squeeze, darkPool: metrics.darkPool, shortVol: metrics.shortVol, pcr: metrics.pcr, iv: metrics.iv, netGex: metrics.netGex } : null,
    };
  }));

  // ── batched AI synthesis (observation-only), cached per fingerprint+day ──
  const day = new Date().toISOString().slice(0, 10);
  const fp = rows.map((r) => `${r.symbol}:${r.plPct?.toFixed(0)}:${r.xsScore ?? 'x'}`).join('|');
  const cacheKey = `trade:xray:v2:${day}:${createHash('sha1').update(fp).digest('hex').slice(0, 20)}`;
  let ai = await getFromCache<Record<string, { note: string }>>(cacheKey);
  if (!ai) {
    try {
      const BAND_KO: Record<string, string> = { STRONG_EDGE: '강한 우위', EDGE: '우위', NEUTRAL: '중립', AGAINST: '열위', STRONG_AGAINST: '강한 열위', NO_DATA: '데이터 없음' };
      const lines = rows.map((r) => {
        const parts = [
          `${r.symbol}: 손익 ${r.plPct?.toFixed(1) ?? '?'}%`,
          `엔진 판정 ${BAND_KO[r.label] ?? r.label}`,
          `XS점수 ${r.xsScore ?? '없음'}${r.expect ? ` (데실${r.expect.decile} 실측 3일알파 ${r.expect.adjF3}%·적중 ${r.expect.hit}%·표본 ${r.expect.days}일${r.expect.days < CALIB_MIN_DAYS ? '·15일 미만 미검증' : ''})` : ''}`,
          r.struct.maxPainGapPct != null ? `맥스페인 대비 ${r.struct.maxPainGapPct.toFixed(1)}%` : '',
          r.struct.flipSide ? `감마플립 ${r.struct.flipSide === 'above' ? '상단' : '하단'}` : '',
          r.metrics?.squeeze != null ? `스퀴즈 ${r.metrics.squeeze}` : '',
          r.metrics?.shortVol != null ? `숏볼륨 ${r.metrics.shortVol}%` : '',
          r.metrics?.darkPool != null ? `다크풀 ${r.metrics.darkPool}%` : '',
        ].filter(Boolean);
        return `- ${parts.join(' · ')}`;
      }).join('\n');
      const { text } = await callBedrock({
        system: `너는 SIGNUM 운영자 전용 판독기다. 각 보유 종목에 대해 제공된 수치만으로 단호한 2~3문장 판독을 쓴다.
절대 규칙: 제공된 숫자 외 어떤 숫자도 만들지 않는다. 데이터가 가리키는 방향을 얼버무리지 않는다 — 우위면 우위, 열위면 열위라고 명확히 말하고, 구조가 불리하면 무엇이 불리한지 짚는다. 근거 없는 낙관·공포 금지, 모든 문장은 제공된 수치에 근거.
'15일 미만 미검증' 표시가 붙은 실측치는 아직 신뢰 구간 밖이다 — 그 수치로 판정을 뒤집지 말고 '검증 축적 중'이라고 언급한 뒤 엔진 판정과 구조 지표 중심으로 판독한다.
출력은 STRICT JSON: {"SYMBOL":{"note":"..."}}. 한국어.`,
        userPrompt: `보유 종목 데이터:\n${lines}\n\nJSON으로만 답하라:`,
        maxTokens: 2000, temperature: 0.3, jsonPrefill: true, label: 'trade-xray',
      });
      ai = JSON.parse(text) as Record<string, { note: string }>;
      await setInCache(cacheKey, ai, 6 * 3600);
    } catch { ai = null; }
  }

  return NextResponse.json({ ok: true, rows, ai, engineDate: rep?.date ?? null });
}
