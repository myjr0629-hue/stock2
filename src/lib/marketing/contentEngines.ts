// ============================================================================
// Content Engines — 3종 콘텐츠 생성기
// A. Market Pulse   — 장 마감 후 데이터 팩트
// B. Structure Education — 핵심 개념 해설 (시간 독립)
// C. Event Spike    — 고래 감지/GEX 급변 (이벤트 드리븐)
// ============================================================================

import { applyCompliance, buildUtm, CTA, CTA_KO, CTA_JA } from './bufferClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MarketData {
  spy: number;       // SPY 변동률
  qqq: number;       // QQQ 변동률
  vix: number;       // VIX 값
  gexRegime: string; // positive | negative | neutral | transition
  darkPool?: number; // Dark Pool 비율
  pcr?: number;      // Put/Call Ratio
  maxPain?: number;  // Max Pain level
  callWall?: number; // Call Wall
  putFloor?: number; // Put Floor
}

export interface ContentOutput {
  en: { text: string; imageUrl: string; cta: keyof typeof CTA };
  ko: { text: string; imageUrl: string; cta: keyof typeof CTA_KO };
  ja: { text: string; imageUrl: string; cta: keyof typeof CTA_JA };
}

export interface EventData {
  ticker: string;
  type: 'whale' | 'gex_shift' | 'level_break' | 'unusual_volume';
  details: string;
  value?: number;
  premium?: number;
}

// ---------------------------------------------------------------------------
// A. Market Pulse Engine
// 장 마감 후 1회, 데이터 팩트 중심
// ---------------------------------------------------------------------------
export function generateMarketPulse(data: MarketData): ContentOutput {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
  const imageParams = `type=pulse&spy=${data.spy}&qqq=${data.qqq}&vix=${data.vix}&gex=${data.gexRegime}`;

  // English
  const enText = [
    `📊 Market Close — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    '',
    `SPY ${fmt(data.spy)} | QQQ ${fmt(data.qqq)} | VIX ${data.vix.toFixed(1)}`,
    `GEX Regime: ${gexDescription(data.gexRegime, 'en')}`,
    data.darkPool != null ? `Dark Pool Activity: ${data.darkPool.toFixed(1)}%` : '',
    data.pcr != null ? `P/C Ratio: ${data.pcr.toFixed(2)}` : '',
    '',
    `Data-driven context. No financial advice.`,
  ].filter(Boolean).join('\n');

  // Korean
  const koText = [
    `📊 장 마감 요약 — ${new Date().toLocaleDateString('ko-KR')}`,
    '',
    `SPY ${fmt(data.spy)} | QQQ ${fmt(data.qqq)} | VIX ${data.vix.toFixed(1)}`,
    `GEX 레짐: ${gexDescription(data.gexRegime, 'ko')}`,
    data.darkPool != null ? `다크풀 활동: ${data.darkPool.toFixed(1)}%` : '',
    data.pcr != null ? `풋/콜 비율: ${data.pcr.toFixed(2)}` : '',
    '',
    `데이터 기반 시장 구조 분석. 투자 조언이 아닙니다.`,
  ].filter(Boolean).join('\n');

  // Japanese
  const jaText = [
    `📊 引け後サマリー — ${new Date().toLocaleDateString('ja-JP')}`,
    '',
    `SPY ${fmt(data.spy)} | QQQ ${fmt(data.qqq)} | VIX ${data.vix.toFixed(1)}`,
    `GEXレジーム: ${gexDescription(data.gexRegime, 'ja')}`,
    data.darkPool != null ? `ダークプール活動: ${data.darkPool.toFixed(1)}%` : '',
    data.pcr != null ? `P/Cレシオ: ${data.pcr.toFixed(2)}` : '',
    '',
    `データに基づく市場構造分析。投資助言ではありません。`,
  ].filter(Boolean).join('\n');

  return {
    en: { text: applyCompliance(enText), imageUrl: `${baseUrl}/api/og/market?${imageParams}&lang=en`, cta: 'liveStructure' },
    ko: { text: applyCompliance(koText), imageUrl: `${baseUrl}/api/og/market?${imageParams}&lang=ko`, cta: 'liveStructure' },
    ja: { text: applyCompliance(jaText), imageUrl: `${baseUrl}/api/og/market?${imageParams}&lang=ja`, cta: 'liveStructure' },
  };
}

// ---------------------------------------------------------------------------
// B. Structure Education Engine
// 주 2-3회, 핵심 개념 해설
// ---------------------------------------------------------------------------

const EDUCATION_TOPICS = [
  {
    id: 'gex',
    en: {
      title: '🎓 What is GEX?',
      body: `Gamma Exposure (GEX) measures how much market makers need to hedge.\n\nWhen GEX is positive, dealers buy dips and sell rips — creating a "gravitational pull" toward key levels.\n\nWhen GEX is negative, dealers amplify moves — fueling sharp rallies or sell-offs.\n\nUnderstanding GEX helps you anticipate volatility regimes.`,
    },
    ko: {
      title: '🎓 GEX(감마 익스포저)란?',
      body: `감마 익스포저(GEX)는 마켓메이커의 헤지 필요량을 측정합니다.\n\nGEX가 양수이면 딜러가 하락 시 매수, 상승 시 매도 → 핵심 레벨로 끌어당기는 "중력 효과".\n\nGEX가 음수이면 딜러가 움직임을 증폭 → 급등이나 급락을 유발.\n\nGEX를 이해하면 변동성 국면을 예측할 수 있습니다.`,
    },
    ja: {
      title: '🎓 GEX（ガンマエクスポージャー）とは？',
      body: `ガンマエクスポージャー（GEX）はマーケットメーカーのヘッジ必要量を測定します。\n\nGEXがプラスの場合、ディーラーは下落時に買い・上昇時に売り → キーレベルへの「重力効果」。\n\nGEXがマイナスの場合、ディーラーは動きを増幅 → 急騰・急落を促進。\n\nGEXを理解することで、ボラティリティレジームを予測できます。`,
    },
  },
  {
    id: 'dark_pool',
    en: {
      title: '🏦 Dark Pool Activity Explained',
      body: `Dark pools are private trading venues where institutional investors trade large blocks without impacting public markets.\n\nHigh dark pool activity often indicates institutional positioning before major moves.\n\nWe track dark pool prints as a percentage of total volume to gauge institutional sentiment.`,
    },
    ko: {
      title: '🏦 다크풀 활동이란?',
      body: `다크풀은 기관 투자자들이 공개 시장에 영향을 주지 않고 대량 거래하는 비공개 거래소입니다.\n\n높은 다크풀 활동은 주요 움직임 전 기관의 포지셔닝을 나타내는 경우가 많습니다.\n\n전체 거래량 대비 다크풀 거래 비율을 추적하여 기관 센티먼트를 파악합니다.`,
    },
    ja: {
      title: '🏦 ダークプール活動とは？',
      body: `ダークプールは、機関投資家が公開市場に影響を与えずに大口取引を行う非公開取引所です。\n\n高いダークプール活動は、大きな動きの前に機関がポジショニングしていることを示すことが多いです。\n\n総出来高に対するダークプール取引の比率を追跡し、機関センチメントを把握します。`,
    },
  },
  {
    id: 'iv_percentile',
    en: {
      title: '📈 IV Percentile — Volatility in Context',
      body: `Implied Volatility (IV) Percentile tells you how current IV compares to its historical range.\n\n90th percentile: IV is higher than 90% of the past year — options are expensive.\n10th percentile: IV is lower than 90% of the past year — options are cheap.\n\nThis context helps traders assess whether premiums are relatively high or low.`,
    },
    ko: {
      title: '📈 IV 퍼센타일 — 맥락 속 변동성',
      body: `내재변동성(IV) 퍼센타일은 현재 IV가 과거 범위에서 어디에 위치하는지 보여줍니다.\n\n90번째 퍼센타일: 지난 1년 중 90%보다 높은 IV — 옵션이 비싼 상태.\n10번째 퍼센타일: 지난 1년 중 90%보다 낮은 IV — 옵션이 저렴한 상태.\n\n이 맥락은 프리미엄의 상대적 수준을 평가하는 데 도움이 됩니다.`,
    },
    ja: {
      title: '📈 IVパーセンタイル — 文脈でみるボラティリティ',
      body: `インプライドボラティリティ（IV）パーセンタイルは、現在のIVが過去のレンジのどこに位置するかを示します。\n\n90パーセンタイル：過去1年の90%より高い → オプションが割高。\n10パーセンタイル：過去1年の90%より低い → オプションが割安。\n\nこの文脈はプレミアムの相対的水準を判断するのに役立ちます。`,
    },
  },
  {
    id: 'pcr',
    en: {
      title: '⚖️ Put/Call Ratio — Market Hedging Gauge',
      body: `The Put/Call Ratio (PCR) measures how many put options are traded relative to calls.\n\nPCR > 1.0: More puts being purchased — market participants are hedging or positioning for downside.\nPCR < 0.7: More calls — participants are positioned for upside.\n\nExtreme readings often coincide with market turning points.`,
    },
    ko: {
      title: '⚖️ 풋/콜 비율 — 시장 헤지 지표',
      body: `풋/콜 비율(PCR)은 콜 대비 풋 옵션 거래량을 측정합니다.\n\nPCR > 1.0: 풋 매수가 많음 — 시장 참여자들이 하락에 대비하거나 헤지 중.\nPCR < 0.7: 콜이 많음 — 참여자들이 상승에 포지셔닝.\n\n극단적 수치는 시장 전환점과 일치하는 경우가 많습니다.`,
    },
    ja: {
      title: '⚖️ プット/コール比率 — 市場ヘッジゲージ',
      body: `プット/コール比率（PCR）は、コール対比プットオプションの取引量を測定します。\n\nPCR > 1.0：プット購入が多い → 参加者が下落に備えてヘッジ中。\nPCR < 0.7：コールが多い → 参加者が上昇にポジショニング。\n\n極端な数値は市場の転換点と一致することが多いです。`,
    },
  },
  {
    id: 'max_pain',
    en: {
      title: '🎯 Max Pain & Key Levels',
      body: `Max Pain is the strike price where option buyers would lose the most money at expiration.\n\nCallWall: The strike with the highest call open interest — acts as resistance.\nPutFloor: The strike with the highest put open interest — acts as support.\n\nThese levels create a "gravitational range" where price tends to gravitate toward expiration.`,
    },
    ko: {
      title: '🎯 맥스 페인과 핵심 레벨',
      body: `맥스 페인은 만기 시 옵션 매수자가 가장 많은 손실을 보는 행사가입니다.\n\n콜 월: 콜 미결제약정이 가장 많은 행사가 — 저항선 역할.\n풋 플로어: 풋 미결제약정이 가장 많은 행사가 — 지지선 역할.\n\n이 레벨들은 만기까지 가격이 끌려가는 "중력 범위"를 형성합니다.`,
    },
    ja: {
      title: '🎯 マックスペインとキーレベル',
      body: `マックスペインは、満期時にオプション買い手が最も損失を被る行使価格です。\n\nコールウォール：コール建玉が最も多い行使価格 → レジスタンスとして機能。\nプットフロア：プット建玉が最も多い行使価格 → サポートとして機能。\n\nこれらのレベルは、満期に向けて価格が引き寄せられる「重力レンジ」を形成します。`,
    },
  },
];

/**
 * Get education content for a specific topic or random
 */
export function generateEducationContent(topicId?: string): ContentOutput {
  const topic = topicId
    ? EDUCATION_TOPICS.find(t => t.id === topicId) || EDUCATION_TOPICS[0]
    : EDUCATION_TOPICS[Math.floor(Math.random() * EDUCATION_TOPICS.length)];

  return {
    en: {
      text: applyCompliance(`${topic.en.title}\n\n${topic.en.body}`),
      imageUrl: '', // Education posts use text-only format
      cta: 'trackLevels',
    },
    ko: {
      text: applyCompliance(`${topic.ko.title}\n\n${topic.ko.body}`),
      imageUrl: '',
      cta: 'trackLevels',
    },
    ja: {
      text: applyCompliance(`${topic.ja.title}\n\n${topic.ja.body}`),
      imageUrl: '',
      cta: 'trackLevels',
    },
  };
}

/**
 * Get all education topic IDs
 */
export function getEducationTopicIds(): string[] {
  return EDUCATION_TOPICS.map(t => t.id);
}

// ---------------------------------------------------------------------------
// C. Event Spike Engine
// 고래 감지, GEX 급변 시 트리거
// ---------------------------------------------------------------------------
export function generateEventSpike(event: EventData, marketData?: Partial<MarketData>): ContentOutput {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';

  const typeLabels = {
    en: { whale: '🐋 Whale Alert', gex_shift: '⚡ GEX Shift', level_break: '🚨 Level Break', unusual_volume: '📊 Unusual Volume' },
    ko: { whale: '🐋 고래 감지', gex_shift: '⚡ GEX 전환', level_break: '🚨 레벨 이탈', unusual_volume: '📊 이상 거래량' },
    ja: { whale: '🐋 ホエールアラート', gex_shift: '⚡ GEXシフト', level_break: '🚨 レベルブレイク', unusual_volume: '📊 異常出来高' },
  };

  const imageParams = `type=event&ticker=${event.ticker}&event=${encodeURIComponent(event.details)}&spy=${marketData?.spy || 0}&qqq=${marketData?.qqq || 0}&vix=${marketData?.vix || 0}&gex=${marketData?.gexRegime || 'neutral'}`;

  // English
  const enText = [
    `${typeLabels.en[event.type]} — $${event.ticker}`,
    '',
    event.details,
    event.premium ? `Premium: $${(event.premium / 1000000).toFixed(1)}M` : '',
    '',
    `Context and live market structure on SIGNUM HQ.`,
  ].filter(Boolean).join('\n');

  // Korean
  const koText = [
    `${typeLabels.ko[event.type]} — $${event.ticker}`,
    '',
    event.details,
    event.premium ? `프리미엄: $${(event.premium / 1000000).toFixed(1)}M` : '',
    '',
    `실시간 시장 구조 분석은 SIGNUM HQ에서 확인하세요.`,
  ].filter(Boolean).join('\n');

  // Japanese
  const jaText = [
    `${typeLabels.ja[event.type]} — $${event.ticker}`,
    '',
    event.details,
    event.premium ? `プレミアム: $${(event.premium / 1000000).toFixed(1)}M` : '',
    '',
    `リアルタイム市場構造分析はSIGNUM HQで。`,
  ].filter(Boolean).join('\n');

  return {
    en: { text: applyCompliance(enText), imageUrl: `${baseUrl}/api/og/market?${imageParams}&lang=en`, cta: 'liveStructure' },
    ko: { text: applyCompliance(koText), imageUrl: `${baseUrl}/api/og/market?${imageParams}&lang=ko`, cta: 'liveStructure' },
    ja: { text: applyCompliance(jaText), imageUrl: `${baseUrl}/api/og/market?${imageParams}&lang=ja`, cta: 'liveStructure' },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

function gexDescription(gex: string, lang: string): string {
  const descriptions: Record<string, Record<string, string>> = {
    positive: {
      en: 'POSITIVE — Dealer hedging dampens volatility, supporting mean-reversion.',
      ko: '포지티브 — 딜러 헤지가 변동성을 억제, 평균회귀 지지.',
      ja: 'ポジティブ — ディーラーヘッジがボラティリティを抑制、平均回帰を支持。',
    },
    negative: {
      en: 'NEGATIVE — Dealer hedging amplifies moves, historically associated with range expansion.',
      ko: '네거티브 — 딜러 헤지가 움직임을 증폭, 변동폭 확대와 관련.',
      ja: 'ネガティブ — ディーラーヘッジが動きを増幅、レンジ拡大と関連。',
    },
    neutral: {
      en: 'NEUTRAL — Balanced positioning.',
      ko: '뉴트럴 — 균형 잡힌 포지셔닝.',
      ja: 'ニュートラル — 均衡ポジショニング。',
    },
    transition: {
      en: 'TRANSITION — Regime shifting, often coincides with increased intraday volatility.',
      ko: '트랜지션 — 레짐 전환 중, 장중 변동성 확대와 관련.',
      ja: 'トランジション — レジーム移行中、日中ボラティリティ拡大と関連。',
    },
  };

  return descriptions[gex.toLowerCase()]?.[lang] || gex.toUpperCase();
}
