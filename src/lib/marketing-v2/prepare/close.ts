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

  // 1. Collect data — Market snapshot + Guardian TACTICAL INSIGHT
  const [market, guardian] = await Promise.all([
    fetchMarketSnapshot(),
    fetchGuardianVerdicts(),
  ]);

  console.log(`[MktV2/Prepare/Close] Data: SPY=${market.spy}% QQQ=${market.qqq}% DIA=${market.dia}% VIX=${market.vix} GEX=${market.gexRegime} RLSI=${guardian.rlsi}`);

  // 2. Build text for each language — Guardian AI 분석 기반
  const text: ContentPackage['text'] = {};
  for (const lang of ALL_LANGS) {
    text[lang] = buildCloseText(lang, market, guardian, date);
  }

  // 3. Capture images (실패해도 텍스트만 발행 — 서비스 연속성 보장)
  let images: Awaited<ReturnType<typeof captureImagesForSlot>> = {};
  try {
    images = await captureImagesForSlot('close', {
      spy: String(market.spy.toFixed(2)),
      qqq: String(market.qqq.toFixed(2)),
      dia: String(market.dia.toFixed(2)),
      vix: String(market.vix.toFixed(1)),
      gex: market.gexRegime,
      dp: String(market.darkPool.toFixed(1)),
      fgi: String(market.fearGreed),
      date,
    }, date, opts.dryRun);
  } catch (err: any) {
    console.error(`[MktV2/Prepare/Close] ⚠️ Image capture failed — proceeding without images: ${err.message}`);
  }

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
  const qqqDir = market.qqq >= 0 ? '+' : '';
  const diaDir = market.dia >= 0 ? '+' : '';

  // ── Guardian TACTICAL INSIGHT = 핵심 분석 자료 ──
  // guardian[lang] = AI가 생성한 RLSI/Rotation/Divergence 기반 분석
  // JA verdict가 없으면 KO → EN fallback
  const tacticalInsight = guardian[lang] || (lang === 'ja' ? guardian.ko : '') || guardian.en || '';

  // ── CTA: app-first funnel — /app smart link (?from= tag for install attribution) ──
  const ctaUrl = 'https://www.signumhq.com/app?from=close';

  // ── 헤드라인 (1줄) ──
  const headlines: Record<Lang, string> = {
    en: `🏁 US Market Close — ${date}`,
    ko: `🏁 미국 장마감 — ${date}`,
    ja: `🏁 米国市場クローズ — ${date}`,
  };

  // ── 데이터 라인 (간결) ──
  const dataLines: Record<Lang, string> = {
    en: `📊 SPY ${spyDir}${market.spy.toFixed(2)}% | QQQ ${qqqDir}${market.qqq.toFixed(2)}% | DOW ${diaDir}${market.dia.toFixed(2)}%\n🔮 VIX ${market.vix.toFixed(1)} | GEX ${market.gexRegime.toUpperCase()} | Dark Pool ${market.darkPool.toFixed(1)}%`,
    ko: `📊 SPY ${spyDir}${market.spy.toFixed(2)}% | QQQ ${qqqDir}${market.qqq.toFixed(2)}% | DOW ${diaDir}${market.dia.toFixed(2)}%\n🔮 VIX ${market.vix.toFixed(1)} | GEX ${market.gexRegime.toUpperCase()} | 다크풀 ${market.darkPool.toFixed(1)}%`,
    ja: `📊 SPY ${spyDir}${market.spy.toFixed(2)}% | QQQ ${qqqDir}${market.qqq.toFixed(2)}% | DOW ${diaDir}${market.dia.toFixed(2)}%\n🔮 VIX ${market.vix.toFixed(1)} | GEX ${market.gexRegime.toUpperCase()} | DP ${market.darkPool.toFixed(1)}%`,
  };

  // ── Tactical Verdict 요약 (핵심) ──
  const insightLabels: Record<Lang, string> = {
    en: '🎯 TACTICAL INSIGHT',
    ko: '🎯 전술적 인사이트',
    ja: '🎯 TACTICAL INSIGHT',
  };

  // ── CTA 라벨 (클린 URL) ──
  const ctaLabels: Record<Lang, string> = {
    en: `📱 Full analysis in the free app → ${ctaUrl}`,
    ko: `📱 무료 앱에서 전체 분석 → ${ctaUrl}`,
    ja: `📱 無料アプリで詳細分析 → ${ctaUrl}`,
  };

  // Threads: URL 없이 브랜드 멘션만 (Meta URL 차단 방지)
  const ctaThreads: Record<Lang, string> = {
    en: '📱 Full analysis in the free app → signumhq.com/app',
    ko: '📱 무료 앱에서 전체 분석 → signumhq.com/app',
    ja: '📱 無料アプリで詳細分析 → signumhq.com/app',
  };

  // RLSI 점수 표시
  const rlsiLine = guardian.rlsi > 0 ? `\nRLSI: ${guardian.rlsi.toFixed(0)}/100` : '';

  // 인사이트 본문 (최대 280자 내 맞춤)
  const insightBody = tacticalInsight ? `\n${insightLabels[lang]}\n${tacticalInsight.substring(0, 450)}` : '';

  return {
    headline: applyCompliance(headlines[lang]),
    data: applyCompliance(dataLines[lang]),
    insight: applyCompliance(tacticalInsight.substring(0, 450)),
    full: applyCompliance(`${headlines[lang]}\n\n${dataLines[lang]}${rlsiLine}${insightBody}`),
    disclaimer: DISCLAIMER[lang],
    cta: ctaLabels[lang],
    ctaFull: ctaUrl,
    ctaThreads: ctaThreads[lang],
  };
}
