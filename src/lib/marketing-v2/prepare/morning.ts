// ============================================================================
// Marketing V2 — Prepare: Morning Briefing
// 모닝 브리핑 콘텐츠 사전 생성
// ============================================================================

import { ContentPackage, ALL_LANGS, ALL_PLATFORMS, Lang } from '../core/types';
import { storeContentPackage, getETDate } from '../core/store';
import { captureImagesForSlot } from '../core/images';
import { buildHashtagMap } from '../core/hashtags';
import { DISCLAIMER, buildCta, applyCompliance } from '../core/compliance';
import { fetchMarketSnapshot, fetchGuardianVerdicts } from '../core/data';

export async function prepareMorning(opts: { date?: string; dryRun?: boolean } = {}): Promise<ContentPackage> {
  const date = opts.date || getETDate();
  console.log(`[MktV2/Prepare/Morning] Starting for ${date}...`);

  const [market, guardian] = await Promise.all([
    fetchMarketSnapshot(),
    fetchGuardianVerdicts(),
  ]);

  console.log(`[MktV2/Prepare/Morning] Data: SPY=${market.spy}% VIX=${market.vix} GEX=${market.gexRegime}`);

  // Build text
  const text: ContentPackage['text'] = {};
  for (const lang of ALL_LANGS) {
    text[lang] = buildMorningText(lang, market, guardian, date);
  }

  // Capture images
  const images = await captureImagesForSlot('morning', {
    spy: String(market.spy.toFixed(2)),
    vix: String(market.vix.toFixed(1)),
    gex: market.gexRegime,
    dp: String(market.darkPool.toFixed(1)),
    date,
    insight: guardian.en?.substring(0, 80) || '',
  }, date, opts.dryRun);

  // Hashtags
  const hashtags = buildHashtagMap('morning', ALL_LANGS, ALL_PLATFORMS);

  const pkg: ContentPackage = {
    slot: 'morning',
    date,
    preparedAt: new Date().toISOString(),
    images,
    text,
    metrics: {
      spy: market.spy, vix: market.vix, gexRegime: market.gexRegime,
      darkPool: market.darkPool, rlsi: guardian.rlsi, fearGreed: market.fearGreed,
    },
    hashtags,
  };

  await storeContentPackage(pkg);
  console.log(`[MktV2/Prepare/Morning] ✅ Package stored`);
  return pkg;
}

function buildMorningText(
  lang: Lang,
  market: Awaited<ReturnType<typeof fetchMarketSnapshot>>,
  guardian: Awaited<ReturnType<typeof fetchGuardianVerdicts>>,
  date: string,
) {
  const spyDir = market.spy >= 0 ? '+' : '';

  const headlines: Record<Lang, string> = {
    en: `🌅 Morning Briefing — ${date}`,
    ko: `🌅 모닝 브리핑 — ${date}`,
    ja: `🌅 モーニングブリーフィング — ${date}`,
  };

  const dataLines: Record<Lang, string> = {
    en: `📊 SPY ${spyDir}${market.spy.toFixed(2)}% | VIX ${market.vix.toFixed(1)}\n🔮 GEX: ${market.gexRegime.toUpperCase()} | 🌊 DP: ${market.darkPool.toFixed(1)}%`,
    ko: `📊 SPY ${spyDir}${market.spy.toFixed(2)}% | VIX ${market.vix.toFixed(1)}\n🔮 GEX: ${market.gexRegime.toUpperCase()} | 🌊 다크풀: ${market.darkPool.toFixed(1)}%`,
    ja: `📊 SPY ${spyDir}${market.spy.toFixed(2)}% | VIX ${market.vix.toFixed(1)}\n🔮 GEX: ${market.gexRegime.toUpperCase()} | 🌊 DP: ${market.darkPool.toFixed(1)}%`,
  };

  // Guardian TACTICAL INSIGHT — JA 없으면 KO → EN fallback
  const insight = guardian[lang] || (lang === 'ja' ? guardian.ko : '') || guardian.en || '';

  // 클린 CTA URL (UTM 없음)
  const ctaUrl = 'https://www.signumhq.com/intel-guardian';
  const ctaLabels: Record<Lang, string> = {
    en: `📊 Full analysis → ${ctaUrl}`,
    ko: `📊 전체 분석 보기 → ${ctaUrl}`,
    ja: `📊 詳細分析 → ${ctaUrl}`,
  };

  // Threads용 (URL 없이)
  const ctaThreads: Record<Lang, string> = {
    en: '📊 Full analysis → signumhq.com/intel-guardian',
    ko: '📊 전체 분석 보기 → signumhq.com/intel-guardian',
    ja: '📊 詳細分析 → signumhq.com/intel-guardian',
  };

  return {
    headline: applyCompliance(headlines[lang]),
    data: applyCompliance(dataLines[lang]),
    insight: applyCompliance(insight.substring(0, 250)),
    full: applyCompliance(`${headlines[lang]}\n\n${dataLines[lang]}\n\n🎯 ${insight}`),
    disclaimer: DISCLAIMER[lang],
    cta: ctaLabels[lang],
    ctaFull: ctaUrl,
    ctaThreads: ctaThreads[lang],
  };
}
