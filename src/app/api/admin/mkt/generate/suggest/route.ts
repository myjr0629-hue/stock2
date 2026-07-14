import { NextResponse } from 'next/server';
import { requireMktAdmin, ST_TICKERS, marketSession } from '@/lib/marketing-console/mkt';
import { fetchStructure, extractLevels } from '@/lib/marketing-console/xScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// AUTO-PICK the most post-worthy ticker right now: scan a watchlist, score by
// how notable the options structure is (max-pain gap % + gamma-flip proximity).
// The bigger the divergence, the more "the chart doesn't show it" a post lands.
export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  const scored = await Promise.all(
    ST_TICKERS.map(async (ticker) => {
      const s = await fetchStructure(ticker);
      const lv = extractLevels(s);
      if (!lv || typeof lv.price !== 'number' || lv.price <= 0) return null;
      const price = lv.price;
      const maxPainGap = typeof lv.maxPain === 'number' ? Math.abs(price - lv.maxPain) / price : 0;
      const flipGap = typeof lv.gammaFlip === 'number' ? Math.abs(price - lv.gammaFlip) / price : 0;
      // Notability: a large max-pain gap is the strongest hook; flip proximity adds tension.
      const notability = maxPainGap * 100 + (flipGap < 0.01 ? 3 : 0);
      const reason =
        maxPainGap >= 0.03
          ? `맥스페인과 ${(maxPainGap * 100).toFixed(1)}% 괴리`
          : flipGap < 0.01
            ? '감마 플립 바로 위/아래 (긴장)'
            : '구조 안정';
      return { ticker, levels: lv, notability, reason };
    })
  );

  const ranked = scored
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.notability - a.notability);

  return NextResponse.json({
    ok: true,
    session: marketSession(),
    best: ranked[0] || null,
    ranked: ranked.slice(0, 6).map((r) => ({ ticker: r.ticker, reason: r.reason, notability: Math.round(r.notability * 10) / 10 })),
  });
}
