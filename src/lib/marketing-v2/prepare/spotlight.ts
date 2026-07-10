// ============================================================================
// Marketing V2 — Prepare: Spotlight (종목 심층 분석)
// AI가 선별한 종목의 옵션플로우/다크풀 분석 → 3개 언어 → Redis
// ============================================================================

import { ContentPackage, ALL_LANGS, ALL_PLATFORMS, Lang } from '../core/types';
import { storeContentPackage, getETDate } from '../core/store';
import { captureImagesForSlot } from '../core/images';
import { buildHashtagMap } from '../core/hashtags';
import { DISCLAIMER, applyCompliance } from '../core/compliance';
import { fetchTickerData, fetchMarketSnapshot } from '../core/data';
import { getFromCache } from '@/services/redisClient';

// M7 + 핵심 종목 풀
const SPOTLIGHT_POOL = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'AMD', 'AVGO', 'PLTR'];

const COMPANY_MAP: Record<string, string> = {
  NVDA: 'NVIDIA Corp', TSLA: 'Tesla Inc', AAPL: 'Apple Inc',
  MSFT: 'Microsoft Corp', GOOGL: 'Alphabet Inc', META: 'Meta Platforms',
  AMZN: 'Amazon.com Inc', AMD: 'Advanced Micro Devices', AVGO: 'Broadcom Inc',
  PLTR: 'Palantir Technologies',
};

export async function prepareSpotlight(opts: { date?: string; dryRun?: boolean; ticker?: string } = {}): Promise<ContentPackage> {
  const date = opts.date || getETDate();
  console.log(`[MktV2/Prepare/Spotlight] Starting for ${date}...`);

  // 1. 종목 선택: 명시 > Redis dedup 기반 자동 선택
  const ticker = opts.ticker || await selectTicker(date);
  console.log(`[MktV2/Prepare/Spotlight] Selected ticker: ${ticker}`);

  // 2. 데이터 수집
  const [tickerData, market] = await Promise.all([
    fetchTickerData(ticker),
    fetchMarketSnapshot(),
  ]);

  console.log(`[MktV2/Prepare/Spotlight] ${ticker}: $${tickerData.price} (${tickerData.changePercent.toFixed(2)}%) SF=${tickerData.smartFlow} DP=${tickerData.darkPoolPercent.toFixed(1)}%`);

  // 3. AI 맞춤 분석 생성
  const aiInsight = await generateSpotlightInsight(ticker, tickerData, market);
  console.log(`[MktV2/Prepare/Spotlight] AI Insight: ${aiInsight.en ? 'OK' : 'FALLBACK'}`);

  // 4. Build text
  const text: ContentPackage['text'] = {};
  for (const lang of ALL_LANGS) {
    text[lang] = buildSpotlightText(lang, ticker, tickerData, market, date, aiInsight);
  }

  // 4. Build insight text for OG image
  const insightEN = tickerData.smartFlow >= 60
    ? `Sustained accumulation observed in $${ticker} across dark pool and options channels.`
    : tickerData.smartFlow <= 40
    ? `Distribution pattern detected in $${ticker} — institutional positioning shifting.`
    : `$${ticker} institutional flow at ${tickerData.darkPoolPercent.toFixed(1)}% dark pool activity with ${tickerData.gexRegime.toLowerCase()} GEX positioning.`;

  // 5. Capture OG images
  const images = await captureImagesForSlot('spotlight', {
    t: ticker,
    dp: String(tickerData.darkPoolPercent.toFixed(1)),
    whale: String(Math.round(tickerData.smartFlow)),
    gex: tickerData.gexRegime,
    price: String(tickerData.price.toFixed(2)),
    change: String(tickerData.changePercent.toFixed(2)),
    insight: insightEN,
  }, date, opts.dryRun);

  // 5. Hashtags (종목 cashtag 포함)
  const hashtags = buildHashtagMap('spotlight', ALL_LANGS, ALL_PLATFORMS, [ticker]);

  // 6. Mark as used (dedup)
  try {
    const { setInCache } = await import('@/services/redisClient');
    await setInCache(`mktv2:spotlight:used:${date}:${ticker}`, '1', 86400);
  } catch {}

  const pkg: ContentPackage = {
    slot: 'spotlight',
    date,
    preparedAt: new Date().toISOString(),
    images,
    text,
    metrics: {
      ticker,
      company: COMPANY_MAP[ticker] || ticker,
      price: tickerData.price,
      changePercent: tickerData.changePercent,
      darkPool: tickerData.darkPoolPercent,
      smartFlow: tickerData.smartFlow,
      gexRegime: tickerData.gexRegime,
      ivRank: tickerData.ivRank,
      marketGex: market.gexRegime,
    },
    hashtags,
  };

  await storeContentPackage(pkg);
  console.log(`[MktV2/Prepare/Spotlight] ✅ Package stored for $${ticker}`);
  return pkg;
}

// ── 종목 자동 선택 (Redis dedup 기반 라운드로빈) ──
async function selectTicker(date: string): Promise<string> {
  for (const ticker of SPOTLIGHT_POOL) {
    try {
      const used = await getFromCache(`mktv2:spotlight:used:${date}:${ticker}`);
      if (!used) return ticker;
    } catch {}
  }
  // 모두 소진 시 랜덤
  return SPOTLIGHT_POOL[Math.floor(Date.now() / 1000) % SPOTLIGHT_POOL.length];
}

// ── AI 맞춤 분석 생성 (Bedrock Haiku) ──
interface AiInsight { en: string; ko: string; ja: string; }

async function generateSpotlightInsight(
  ticker: string,
  data: Awaited<ReturnType<typeof fetchTickerData>>,
  market: Awaited<ReturnType<typeof fetchMarketSnapshot>>,
): Promise<AiInsight> {
  const empty: AiInsight = { en: '', ko: '', ja: '' };
  try {
    const { callBedrock, MODELS } = await import('@/services/bedrockClient');
    const changeDir = data.changePercent >= 0 ? '+' : '';
    const flowLabel = data.smartFlow >= 60 ? 'accumulation' : data.smartFlow <= 40 ? 'distribution' : 'neutral';

    const prompt = `You are an institutional equity analyst. Analyze $${ticker} using ONLY the data below.

DATA:
- Price: $${data.price.toFixed(2)} (${changeDir}${data.changePercent.toFixed(2)}%)
- Smart Flow (institutional directional index): ${Math.round(data.smartFlow)}/100 → ${flowLabel}
- Dark Pool Activity: ${data.darkPoolPercent.toFixed(1)}%
- GEX Regime: ${data.gexRegime} (dealer gamma positioning)
- IV Rank: ${data.ivRank} (implied volatility percentile)
- Market-wide GEX: ${market.gexRegime}
- VIX: ${market.vix.toFixed(1)}

RULES:
1. Observation only — NO predictions, NO financial advice
2. Connect the dots: How do SF + DP + GEX interact for this specific stock?
3. Each language: 2-3 sentences, STANDALONE, conversational but institutional grade
4. Output ONLY valid JSON

Output: {"en":"English 2-3 sentences","ko":"한국어 2-3문장","ja":"日本語2-3文"}`;

    const result = await callBedrock({
      modelId: MODELS.HAIKU_35,
      system: 'You are a Bloomberg-tier institutional equity analyst. Output JSON only.',
      userPrompt: prompt,
      maxTokens: 800,
      temperature: 0.3,
      timeoutMs: 25000,
      jsonPrefill: true,
      label: `MktV2-Spotlight-${ticker}`,
    });

    const enM = result.text.match(/"en"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const koM = result.text.match(/"ko"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const jaM = result.text.match(/"ja"\s*:\s*"((?:[^"\\]|\\.)*)"/);

    return {
      en: enM ? enM[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : '',
      ko: koM ? koM[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : '',
      ja: jaM ? jaM[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : '',
    };
  } catch (err) {
    console.error(`[MktV2/Spotlight] AI insight failed for ${ticker}:`, err);
    return empty;
  }
}

function buildSpotlightText(
  lang: Lang,
  ticker: string,
  data: Awaited<ReturnType<typeof fetchTickerData>>,
  market: Awaited<ReturnType<typeof fetchMarketSnapshot>>,
  date: string,
  aiInsight: AiInsight = { en: '', ko: '', ja: '' },
) {
  const changeDir = data.changePercent >= 0 ? '+' : '';
  const company = COMPANY_MAP[ticker] || ticker;
  const flowLabel = data.smartFlow >= 60 ? 'STRONG' : data.smartFlow <= 40 ? 'WEAK' : 'NEUTRAL';

  const headlines: Record<Lang, string> = {
    en: `🔬 $${ticker} — Institutional Flow Analysis`,
    ko: `🔬 $${ticker} — 기관 흐름 분석`,
    ja: `🔬 $${ticker} — 機関フロー分析`,
  };

  const dataLines: Record<Lang, string> = {
    en: `💰 ${company}\n$${data.price.toFixed(2)} (${changeDir}${data.changePercent.toFixed(2)}%)\n\n📊 Smart Flow: ${Math.round(data.smartFlow)} (${flowLabel})\n🌊 Dark Pool: ${data.darkPoolPercent.toFixed(1)}%\n🔮 GEX: ${data.gexRegime.toUpperCase()} | IV Rank: ${data.ivRank}`,
    ko: `💰 ${company}\n$${data.price.toFixed(2)} (${changeDir}${data.changePercent.toFixed(2)}%)\n\n📊 스마트 플로우: ${Math.round(data.smartFlow)} (${flowLabel})\n🌊 다크풀: ${data.darkPoolPercent.toFixed(1)}%\n🔮 GEX: ${data.gexRegime.toUpperCase()} | IV 순위: ${data.ivRank}`,
    ja: `💰 ${company}\n$${data.price.toFixed(2)} (${changeDir}${data.changePercent.toFixed(2)}%)\n\n📊 スマートフロー: ${Math.round(data.smartFlow)} (${flowLabel})\n🌊 ダークプール: ${data.darkPoolPercent.toFixed(1)}%\n🔮 GEX: ${data.gexRegime.toUpperCase()} | IV ランク: ${data.ivRank}`,
  };

  // AI 분석 우선, fallback으로 GEX 기반 템플릿
  const fallback: Record<Lang, string> = {
    en: data.smartFlow >= 60
      ? `Institutional activity in $${ticker} shows concentrated call-side positioning with elevated dark pool volume. Market-wide GEX is ${market.gexRegime}.`
      : `$${ticker} institutional flow shows mixed signals. Dark pool activity at ${data.darkPoolPercent.toFixed(1)}% with ${data.gexRegime} GEX positioning.`,
    ko: data.smartFlow >= 60
      ? `$${ticker} 기관 활동이 콜 사이드에 집중되며 다크풀 거래량이 상승했습니다. 시장 전체 GEX는 ${market.gexRegime}입니다.`
      : `$${ticker} 기관 흐름에서 혼재된 신호가 관찰됩니다. 다크풀 ${data.darkPoolPercent.toFixed(1)}%, GEX ${data.gexRegime} 포지셔닝.`,
    ja: data.smartFlow >= 60
      ? `$${ticker}の機関活動はコールサイドに集中し、ダークプール取引量が上昇しています。市場全体のGEXは${market.gexRegime}。`
      : `$${ticker}の機関フローは混在シグナル。ダークプール${data.darkPoolPercent.toFixed(1)}%、GEX ${data.gexRegime}ポジショニング。`,
  };

  const insight = aiInsight[lang] || (lang === 'ja' ? aiInsight.ko : '') || fallback[lang];

  // CTA: app-first funnel — /app smart link (?from= tag for install attribution)
  const ctaUrl = 'https://www.signumhq.com/app?from=spotlight';
  const ctaLabels: Record<Lang, string> = {
    en: `📱 Track $${ticker} in the free app → ${ctaUrl}`,
    ko: `📱 무료 앱에서 $${ticker} 추적 → ${ctaUrl}`,
    ja: `📱 無料アプリで$${ticker}を追跡 → ${ctaUrl}`,
  };

  return {
    headline: applyCompliance(headlines[lang]),
    data: applyCompliance(dataLines[lang]),
    insight: applyCompliance(insight),
    full: applyCompliance(`${headlines[lang]}\n\n${dataLines[lang]}\n\n🎯 ${insight}`),
    disclaimer: DISCLAIMER[lang],
    cta: ctaLabels[lang],
    ctaFull: ctaUrl,
  };
}
