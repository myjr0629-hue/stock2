// ============================================================================
// Marketing V2 — Prepare: SpaceX Spotlight
// SpaceX IPO 뉴스 + TSLA 데이터 → 3개국어 콘텐츠 → Redis
// ============================================================================

import { ContentPackage, ALL_LANGS, ALL_PLATFORMS, Lang } from '../core/types';
import { storeContentPackage, getETDate } from '../core/store';
import { captureImagesForSlot } from '../core/images';
import { buildHashtagMap } from '../core/hashtags';
import { DISCLAIMER, buildCta, applyCompliance } from '../core/compliance';
import { fetchSpaceXNews, fetchTickerData } from '../core/data';

export async function prepareSpacex(opts: { date?: string; dryRun?: boolean } = {}): Promise<ContentPackage> {
  const date = opts.date || getETDate();
  console.log(`[MktV2/Prepare/SpaceX] Starting for ${date}...`);

  const [news, tsla] = await Promise.all([
    fetchSpaceXNews(),
    fetchTickerData('TSLA'),
  ]);

  console.log(`[MktV2/Prepare/SpaceX] News: "${news.headline}" (${news.source}) | TSLA: $${tsla.price} ${tsla.changePercent.toFixed(2)}%`);

  // Build text
  const text: ContentPackage['text'] = {};
  for (const lang of ALL_LANGS) {
    text[lang] = buildSpacexText(lang, news, tsla, date);
  }

  // Capture images (실패해도 텍스트만 발행 — 서비스 연속성 보장)
  let images: Awaited<ReturnType<typeof captureImagesForSlot>> = {};
  try {
    images = await captureImagesForSlot('spacex', {
      dp: String(tsla.darkPoolPercent.toFixed(1)),
      whale: String(tsla.smartFlow),
      gex: tsla.gexRegime,
      price: String(tsla.price.toFixed(2)),
      change: String(tsla.changePercent.toFixed(2)),
      date,
    }, date, opts.dryRun);
  } catch (err: any) {
    console.error(`[MktV2/Prepare/SpaceX] ⚠️ Image capture failed — proceeding without images: ${err.message}`);
  }

  // Hashtags
  const hashtags = buildHashtagMap('spacex', ALL_LANGS, ALL_PLATFORMS, ['TSLA']);

  const pkg: ContentPackage = {
    slot: 'spacex',
    date,
    preparedAt: new Date().toISOString(),
    images,
    text,
    metrics: {
      headline: news.headline,
      source: news.source,
      tslaPrice: tsla.price,
      tslaChange: tsla.changePercent,
      tslaDarkPool: tsla.darkPoolPercent,
      tslaSmartFlow: tsla.smartFlow,
    },
    hashtags,
  };

  await storeContentPackage(pkg);
  console.log(`[MktV2/Prepare/SpaceX] ✅ Package stored`);
  return pkg;
}

function buildSpacexText(
  lang: Lang,
  news: Awaited<ReturnType<typeof fetchSpaceXNews>>,
  tsla: Awaited<ReturnType<typeof fetchTickerData>>,
  date: string,
) {
  const changeDir = tsla.changePercent >= 0 ? '+' : '';
  const newsText = news[lang] || news.en;
  // Extract first sentence for short platforms
  const firstSentence = newsText.split(/(?<=[.。!！?？])\s+/)[0] || newsText;

  const headlines: Record<Lang, string> = {
    en: `🚀 SpaceX Update`,
    ko: `🚀 SpaceX 업데이트`,
    ja: `🚀 SpaceX アップデート`,
  };

  // KO/JA: 번역된 뉴스 첫 문장 사용, EN: 원문 headline
  const newsHeadline = lang === 'en' ? news.headline : firstSentence;

  const dataLines: Record<Lang, string> = {
    en: `📰 ${news.headline}\n📊 TSLA $${tsla.price.toFixed(2)} (${changeDir}${tsla.changePercent.toFixed(2)}%) | DP ${tsla.darkPoolPercent.toFixed(1)}%`,
    ko: `📰 ${newsHeadline}\n📊 TSLA $${tsla.price.toFixed(2)} (${changeDir}${tsla.changePercent.toFixed(2)}%) | 다크풀 ${tsla.darkPoolPercent.toFixed(1)}%`,
    ja: `📰 ${newsHeadline}\n📊 TSLA $${tsla.price.toFixed(2)} (${changeDir}${tsla.changePercent.toFixed(2)}%) | DP ${tsla.darkPoolPercent.toFixed(1)}%`,
  };

  // CTA: app-first funnel — /app smart link (?from= tag for install attribution)
  const ctaUrl = 'https://www.signumhq.com/app?from=spacex';
  const ctaLabels: Record<Lang, string> = {
    en: `📱 Full analysis in the free app → ${ctaUrl}`,
    ko: `📱 무료 앱에서 전체 분석 → ${ctaUrl}`,
    ja: `📱 無料アプリで詳細分析 → ${ctaUrl}`,
  };

  // insight: 번역된 본문에서 추가 내용
  const insightText = newsText.length > firstSentence.length
    ? newsText.substring(firstSentence.length).trim().substring(0, 200)
    : '';

  return {
    headline: applyCompliance(headlines[lang]),
    data: applyCompliance(dataLines[lang]),
    insight: applyCompliance(insightText || firstSentence.substring(0, 200)),
    full: applyCompliance(`${headlines[lang]}\n\n${dataLines[lang]}\n\n${newsText}`),
    disclaimer: DISCLAIMER[lang],
    cta: ctaLabels[lang],
    ctaFull: ctaUrl,
  };
}
