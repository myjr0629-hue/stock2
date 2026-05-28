// ============================================================================
// Marketing V2 — Prepare: Education
// Options trading 교육 콘텐츠 사전 생성
// ============================================================================

import { ContentPackage, ALL_LANGS, ALL_PLATFORMS, Lang } from '../core/types';
import { storeContentPackage, getETDate } from '../core/store';
import { captureCustomImage } from '../core/images';
import { buildHashtagMap, EDUCATION_PIN_TITLES } from '../core/hashtags';
import { DISCLAIMER, buildCta, applyCompliance } from '../core/compliance';

const TOPIC_IDS = ['gex', 'dark_pool', 'iv_percentile', 'pcr', 'max_pain'];

function getTodayTopic(date: string): string {
  const d = new Date(date);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  return TOPIC_IDS[dayOfYear % TOPIC_IDS.length];
}

const TOPICS: Record<string, Record<Lang, { title: string; body: string }>> = {
  gex: {
    en: { title: 'What is Gamma Exposure (GEX)?', body: 'Gamma Exposure measures how much market makers need to hedge as prices move. Positive GEX stabilizes; negative GEX amplifies volatility.' },
    ko: { title: '감마 익스포저(GEX)란?', body: 'GEX는 가격 변동 시 마켓메이커의 헤지 필요량을 측정합니다. 양수 GEX는 안정, 음수 GEX는 변동성을 증폭시킵니다.' },
    ja: { title: 'ガンマエクスポージャー(GEX)とは？', body: 'GEXは価格変動時のマーケットメーカーのヘッジ必要量を測定します。正のGEXは安定化、負のGEXはボラティリティを増幅します。' },
  },
  dark_pool: {
    en: { title: 'Dark Pool Activity Explained', body: 'Dark pools are private venues where institutions trade large blocks without impacting the public market. High dark pool volume often signals institutional accumulation.' },
    ko: { title: '다크풀 활동 분석', body: '다크풀은 기관 투자자가 공개 시장에 영향 없이 대량 거래하는 비공개 거래소입니다.' },
    ja: { title: 'ダークプール活動分析', body: 'ダークプールは機関投資家が公開市場に影響を与えずに大口取引する私設取引所です。' },
  },
  iv_percentile: {
    en: { title: 'IV Percentile — Volatility Context', body: 'IV Percentile ranks current implied volatility vs the past year. High = sell options, Low = buy options.' },
    ko: { title: 'IV 퍼센타일 — 변동성 맥락', body: 'IV 퍼센타일은 현재 내재 변동성의 1년 대비 위치를 보여줍니다.' },
    ja: { title: 'IVパーセンタイル — ボラティリティ', body: 'IVパーセンタイルは過去1年間と比較した現在のIVの位置を示します。' },
  },
  pcr: {
    en: { title: 'Put/Call Ratio Decoded', body: 'PCR compares put vs call volume. High PCR (>1.0) = bearish sentiment. Low (<0.7) = bullish. Extremes precede reversals.' },
    ko: { title: '풋/콜 비율 해독', body: '풋/콜 비율은 풋과 콜 거래량을 비교합니다. 높으면 약세, 낮으면 강세 심리입니다.' },
    ja: { title: 'プット/コールレシオ解読', body: 'PCRはプットとコールの取引量を比較します。高いと弱気、低いと強気を示します。' },
  },
  max_pain: {
    en: { title: 'Max Pain Theory', body: 'Max Pain is where option holders lose the most at expiry. MMs push price toward max pain before expiration.' },
    ko: { title: '맥스 페인 이론', body: '맥스 페인은 만기 시 옵션 보유자의 손실이 최대인 가격. MM이 만기 전 이 가격으로 유도합니다.' },
    ja: { title: 'マックスペイン理論', body: 'マックスペインは満期時にオプション保有者の損失が最大となる価格です。' },
  },
};

export async function prepareEducation(opts: { date?: string; dryRun?: boolean; topic?: string } = {}): Promise<ContentPackage> {
  const date = opts.date || getETDate();
  const topicId = opts.topic || getTodayTopic(date);
  console.log(`[MktV2/Prepare/Education] topic: ${topicId}, date: ${date}`);

  const topicContent = TOPICS[topicId] || TOPICS.gex;

  const text: ContentPackage['text'] = {};
  for (const lang of ALL_LANGS) {
    const t = topicContent[lang];
    // CTA: 클린 URL (UTM 파라미터 없이)
    const ctaLabels: Record<Lang, string> = {
      en: `📊 Full analysis → https://www.signumhq.com/how-it-works`,
      ko: `📊 전체 분석 보기 → https://www.signumhq.com/how-it-works`,
      ja: `📊 詳細分析 → https://www.signumhq.com/how-it-works`,
    };
    text[lang] = {
      headline: applyCompliance(`📚 ${t.title}`),
      data: applyCompliance(t.body),
      insight: '',
      full: applyCompliance(`📚 ${t.title}\n\n${t.body}`),
      disclaimer: DISCLAIMER[lang],
      cta: ctaLabels[lang],
      ctaFull: `https://www.signumhq.com/how-it-works`,
    };
  }

  const images: ContentPackage['images'] = {};
  // 이미지 캡처 (실패해도 텍스트만 발행 — 서비스 연속성 보장)
  const carouselSlides: string[] = [];
  try {
    // tweet/og용 이미지 (X, Threads, Bluesky) — 전용 16:9 education 템플릿
    const ogUrl = await captureCustomImage('education', 'tweet', { topic: topicId }, date, opts.dryRun);
    if (ogUrl) { images.tweet = ogUrl; images.og = ogUrl; }

    // IG Carousel: 5장 멀티 슬라이드 캡처
    for (let i = 1; i <= 5; i++) {
      const slideUrl = await captureCustomImage('education-carousel', 'carousel', { topic: topicId, slide: String(i) }, date, opts.dryRun);
      if (slideUrl) carouselSlides.push(slideUrl);
    }
    // 대표 이미지 (첫 장)
    if (carouselSlides.length > 0) images.carousel = carouselSlides[0];

    // Pinterest Pin
    const pinUrl = await captureCustomImage('education-pin', 'pin', { topic: topicId }, date, opts.dryRun);
    if (pinUrl) images.pin = pinUrl;
  } catch (err: any) {
    console.error(`[MktV2/Prepare/Education] ⚠️ Image capture failed — proceeding without images: ${err.message}`);
  }

  const hashtags = buildHashtagMap('education', ALL_LANGS, ALL_PLATFORMS);

  const pkg: ContentPackage = {
    slot: 'education',
    date,
    preparedAt: new Date().toISOString(),
    images, text, hashtags,
    carouselSlides: carouselSlides.length > 1 ? carouselSlides : undefined,
    metrics: { topicId, topicTitle: topicContent.en.title, pinTitle: EDUCATION_PIN_TITLES[topicId] || topicContent.en.title },
  };

  await storeContentPackage(pkg);
  console.log(`[MktV2/Prepare/Education] ✅ stored`);
  return pkg;
}
