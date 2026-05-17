// ============================================================================
// Marketing V2 — Prepare: Pulse (실시간 시장 현황)
// Redis 시세 + Guardian AI 분석 → ContentPackage → 8채널 동시 발행용
// ============================================================================

import { ContentPackage, ALL_LANGS, ALL_PLATFORMS, Lang } from '../core/types';
import { storeContentPackage, getETDate } from '../core/store';
import { captureImagesForSlot } from '../core/images';
import { buildHashtagMap } from '../core/hashtags';
import { DISCLAIMER, applyCompliance } from '../core/compliance';
import { fetchMarketSnapshot, fetchGuardianVerdicts } from '../core/data';

export async function preparePulse(opts: { date?: string; dryRun?: boolean } = {}): Promise<ContentPackage> {
  const date = opts.date || getETDate();
  console.log(`[MktV2/Prepare/Pulse] Starting for ${date}...`);

  const [market, guardian] = await Promise.all([
    fetchMarketSnapshot(),
    fetchGuardianVerdicts(),
  ]);

  console.log(`[MktV2/Prepare/Pulse] Data: SPY=${market.spy}% VIX=${market.vix} GEX=${market.gexRegime} DP=${market.darkPool}%`);
  console.log(`[MktV2/Prepare/Pulse] Guardian: EN=${guardian.en?.substring(0, 50)}... KO=${guardian.ko?.substring(0, 30)}...`);

  // Build text per language
  const text: ContentPackage['text'] = {};
  for (const lang of ALL_LANGS) {
    text[lang] = buildPulseText(lang, market, guardian, date);
  }

  // Capture OG images
  const images = await captureImagesForSlot('pulse', {
    spy: String(market.spy.toFixed(2)),
    vix: String(market.vix.toFixed(1)),
    gex: market.gexRegime,
    dp: String(market.darkPool.toFixed(1)),
    date,
  }, date, opts.dryRun);

  // Hashtags
  const hashtags = buildHashtagMap('pulse', ALL_LANGS, ALL_PLATFORMS);

  const pkg: ContentPackage = {
    slot: 'pulse',
    date,
    preparedAt: new Date().toISOString(),
    images,
    text,
    metrics: {
      spy: market.spy,
      qqq: market.qqq,
      vix: market.vix,
      gexRegime: market.gexRegime,
      darkPool: market.darkPool,
      fearGreed: market.fearGreed,
      spyPrice: market.spyPrice,
    },
    hashtags,
  };

  await storeContentPackage(pkg);
  console.log(`[MktV2/Prepare/Pulse] ✅ Package stored`);
  return pkg;
}

function buildPulseText(
  lang: Lang,
  market: Awaited<ReturnType<typeof fetchMarketSnapshot>>,
  guardian: Awaited<ReturnType<typeof fetchGuardianVerdicts>>,
  date: string,
) {
  const spyDir = market.spy >= 0 ? '+' : '';
  const qqqDir = market.qqq >= 0 ? '+' : '';
  const vixLevel = market.vix >= 25 ? 'ELEVATED' : market.vix >= 20 ? 'CAUTION' : 'CALM';

  const headlines: Record<Lang, string> = {
    en: `📊 Market Pulse — ${date}`,
    ko: `📊 마켓 펄스 — ${date}`,
    ja: `📊 マーケットパルス — ${date}`,
  };

  const dataLines: Record<Lang, string> = {
    en: `S&P 500 ${spyDir}${market.spy.toFixed(2)}% | NASDAQ ${qqqDir}${market.qqq.toFixed(2)}%\n🔮 GEX: ${market.gexRegime.toUpperCase()} | VIX ${market.vix.toFixed(1)} (${vixLevel})\n🌊 Dark Pool: ${market.darkPool.toFixed(1)}%`,
    ko: `S&P 500 ${spyDir}${market.spy.toFixed(2)}% | 나스닥 ${qqqDir}${market.qqq.toFixed(2)}%\n🔮 GEX: ${market.gexRegime.toUpperCase()} | VIX ${market.vix.toFixed(1)} (${vixLevel})\n🌊 다크풀: ${market.darkPool.toFixed(1)}%`,
    ja: `S&P 500 ${spyDir}${market.spy.toFixed(2)}% | NASDAQ ${qqqDir}${market.qqq.toFixed(2)}%\n🔮 GEX: ${market.gexRegime.toUpperCase()} | VIX ${market.vix.toFixed(1)} (${vixLevel})\n🌊 ダークプール: ${market.darkPool.toFixed(1)}%`,
  };

  // Guardian TACTICAL INSIGHT — JA 없으면 KO → EN fallback
  const guardianInsight = guardian[lang] || (lang === 'ja' ? guardian.ko : '') || guardian.en || '';

  // GEX 기반 fallback (Guardian이 비어있을 때만)
  const gexFallback: Record<Lang, string> = {
    en: market.gexRegime === 'positive'
      ? 'Dealer positioning may dampen volatility and support mean reversion.'
      : 'Dealer positioning may amplify moves. Elevated caution observed.',
    ko: market.gexRegime === 'positive'
      ? '딜러 포지셔닝이 변동성을 억제하고 평균회귀를 지지할 수 있는 구간입니다.'
      : '딜러 포지셔닝이 움직임을 증폭시킬 수 있습니다. 주의 관찰 구간.',
    ja: market.gexRegime === 'positive'
      ? 'ディーラーポジションがボラティリティを抑制し、平均回帰を支える可能性があります。'
      : 'ディーラーポジションが動きを増幅する可能性。注意観察区間。',
  };

  const insight = guardianInsight || gexFallback[lang];

  // 클린 CTA URL
  const ctaUrl = 'https://www.signumhq.com/intel-guardian';
  const ctaLabels: Record<Lang, string> = {
    en: `📊 Full analysis → ${ctaUrl}`,
    ko: `📊 전체 분석 보기 → ${ctaUrl}`,
    ja: `📊 詳細分析 → ${ctaUrl}`,
  };

  return {
    headline: applyCompliance(headlines[lang]),
    data: applyCompliance(dataLines[lang]),
    insight: applyCompliance(insight.substring(0, 450)),
    full: applyCompliance(`${headlines[lang]}\n\n${dataLines[lang]}\n\n🎯 ${insight}`),
    disclaimer: DISCLAIMER[lang],
    cta: ctaLabels[lang],
    ctaFull: ctaUrl,
  };
}
