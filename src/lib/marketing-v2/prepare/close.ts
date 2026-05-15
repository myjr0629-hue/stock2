// ============================================================================
// Marketing V2 — Prepare: Market Close
// 장마감 브리핑 콘텐츠 사전 생성
// data.ts → AI → images.ts → store.ts → Redis
// ============================================================================

import { ContentPackage, ALL_LANGS, ALL_PLATFORMS, Lang } from '../core/types';
import { storeContentPackage, getETDate } from '../core/store';
import { captureImagesForSlot } from '../core/images';
import { buildHashtagMap } from '../core/hashtags';
import { DISCLAIMER, buildCta, applyCompliance } from '../core/compliance';
import { fetchMarketSnapshot, fetchGuardianVerdicts } from '../core/data';

export async function prepareClose(opts: { date?: string; dryRun?: boolean } = {}): Promise<ContentPackage> {
  const date = opts.date || getETDate();
  console.log(`[MktV2/Prepare/Close] Starting for ${date}...`);

  // 1. Collect data
  const [market, guardian] = await Promise.all([
    fetchMarketSnapshot(),
    fetchGuardianVerdicts(),
  ]);

  console.log(`[MktV2/Prepare/Close] Data: SPY=${market.spy}% VIX=${market.vix} GEX=${market.gexRegime}`);

  // 2. Build text for each language
  const text: ContentPackage['text'] = {};
  for (const lang of ALL_LANGS) {
    text[lang] = buildCloseText(lang, market, guardian, date);
  }

  // 3. Capture images (모든 지표 데이터 전달 — Pin 템플릿 포함)
  const images = await captureImagesForSlot('close', {
    spy: String(market.spy.toFixed(2)),
    qqq: String(market.qqq.toFixed(2)),
    dia: String(market.dia.toFixed(2)),
    vix: String(market.vix.toFixed(1)),
    gex: market.gexRegime,
    dp: String(market.darkPool.toFixed(1)),
    fgi: String(market.fearGreed),
    date,
  }, date, opts.dryRun);

  // 4. Build hashtags
  const hashtags = buildHashtagMap('close', ALL_LANGS, ALL_PLATFORMS);

  // 5. Assemble package
  const pkg: ContentPackage = {
    slot: 'close',
    date,
    preparedAt: new Date().toISOString(),
    images,
    text,
    metrics: {
      spy: market.spy,
      qqq: market.qqq,
      dia: market.dia,
      vix: market.vix,
      gexRegime: market.gexRegime,
      darkPool: market.darkPool,
      fearGreed: market.fearGreed,
      rlsi: guardian.rlsi,
    },
    hashtags,
  };

  // 6. Store
  await storeContentPackage(pkg);
  console.log(`[MktV2/Prepare/Close] ✅ Package stored (${Object.keys(images).length} imgs, ${Object.keys(text).length} langs)`);

  return pkg;
}

function buildCloseText(
  lang: Lang,
  market: Awaited<ReturnType<typeof fetchMarketSnapshot>>,
  guardian: Awaited<ReturnType<typeof fetchGuardianVerdicts>>,
  date: string,
) {
  const spyDir = market.spy >= 0 ? '+' : '';
  const vixLevel = market.vix > 25 ? 'elevated' : market.vix > 18 ? 'moderate' : 'low';

  const headlines: Record<Lang, string> = {
    en: `🏁 US Market Close — ${date}`,
    ko: `🏁 미국 장마감 브리핑 — ${date}`,
    ja: `🏁 米国市場クローズ — ${date}`,
  };

  const dataLines: Record<Lang, string> = {
    en: `📊 SPY ${spyDir}${market.spy.toFixed(2)}% | VIX ${market.vix.toFixed(1)} (${vixLevel})\n🔮 GEX Regime: ${market.gexRegime.toUpperCase()}\n🌊 Dark Pool: ${market.darkPool.toFixed(1)}%`,
    ko: `📊 SPY ${spyDir}${market.spy.toFixed(2)}% | VIX ${market.vix.toFixed(1)}\n🔮 GEX 레짐: ${market.gexRegime.toUpperCase()}\n🌊 다크풀: ${market.darkPool.toFixed(1)}%`,
    ja: `📊 SPY ${spyDir}${market.spy.toFixed(2)}% | VIX ${market.vix.toFixed(1)}\n🔮 GEXレジーム: ${market.gexRegime.toUpperCase()}\n🌊 ダークプール: ${market.darkPool.toFixed(1)}%`,
  };

  const insight = guardian[lang] || guardian.en || 'Market structure analysis in progress.';
  const cta = buildCta(lang, 'intel-guardian', 'close', 'twitter');

  return {
    headline: applyCompliance(headlines[lang]),
    data: applyCompliance(dataLines[lang]),
    insight: applyCompliance(insight.substring(0, 200)),
    full: applyCompliance(`${headlines[lang]}\n\n${dataLines[lang]}\n\n${insight}`),
    disclaimer: DISCLAIMER[lang],
    cta: cta.display,
    ctaFull: cta.full,
  };
}
