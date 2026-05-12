// ============================================================================
// Hashtag Engine — Platform × Content × Language 최적 태그 자동 선택
// X: 1~3 hashtags + $cashtags (클린, 스팸 방지)
// Instagram: 15 hashtags 3-Tier 믹스 (대형+중형+니치+히든)
// Bluesky: $cashtags + 2~3 hashtags
// Pinterest: SEO 키워드 (title/description 최적화)
// ============================================================================

export type ContentType = 'pulse' | 'morning' | 'education' | 'event' | 'midday' | 'weekly' | 'spotlight' | 'premarket' | 'intraday' | 'close';
export type Platform = 'twitter' | 'instagram' | 'threads' | 'bluesky' | 'pinterest';
export type Lang = 'en' | 'ko' | 'ja';

// ---------------------------------------------------------------------------
// $Cashtag support (X/Bluesky search tab auto-exposure)
// ---------------------------------------------------------------------------
const DEFAULT_CASHTAGS = ['$SPY', '$QQQ'];
const VIX_CASHTAG = '$VIX';

export function buildCashtags(tickers?: string[]): string[] {
  if (tickers?.length) {
    return tickers.map(t => `$${t.replace('$', '')}`);
  }
  return DEFAULT_CASHTAGS;
}

// ---------------------------------------------------------------------------
// X (Twitter) — 1~3 hashtags max (clean, no spam)
// ---------------------------------------------------------------------------
const X_TAGS: Record<ContentType, string[]> = {
  pulse:     ['#GEX'],
  morning:   ['#PreMarket'],
  education: ['#OptionsTrading'],
  event:     ['#OptionsFlow'],
  midday:    ['#MarketUpdate'],
  weekly:    ['#WeeklyRecap'],
  spotlight: ['#DarkPool'],
  premarket: ['#PreMarket', '#GEX'],
  intraday:  ['#MarketUpdate'],
  close:     ['#MarketClose'],
};

const X_EDUCATION_TOPIC_TAGS: Record<string, string[]> = {
  gex:           ['#GammaExposure', '#GEX'],
  dark_pool:     ['#DarkPool', '#SmartMoney'],
  iv_percentile: ['#ImpliedVolatility'],
  pcr:           ['#PutCallRatio'],
  max_pain:      ['#MaxPain', '#Options'],
  squeeze:       ['#GammaSqueeze'],
  iv_skew:       ['#IVSkew'],
  dex:           ['#DeltaExposure'],
};

// ---------------------------------------------------------------------------
// Instagram — 15 hashtags, 3-tier mix
// ---------------------------------------------------------------------------
const IG_TAGS_EN = {
  tier1: ['#finance', '#investing'],  // 1M+ posts
  tier2: ['#stockmarket', '#tradingstrategy', '#financialeducation', '#marketanalysis', '#optionstrading'],  // 100K~500K
  tier3: ['#gammaexposure', '#darkpooltrading', '#optionsflow', '#gexanalysis', '#marketstructure', '#institutionalflow', '#smartmoneyflow', '#vixtrading'],
  hidden: ['#tradingdata', '#equityresearch', '#quanttrading', '#derivativestrading', '#volatilitytrading'],
  brand: ['#signumhq'],
};

const IG_TAGS_KO = {
  tier1: ['#주식', '#투자'],
  tier2: ['#미국주식', '#해외주식', '#주식투자', '#트레이딩', '#미국옵션'],
  tier3: ['#옵션플로우', '#감마익스포저', '#다크풀', '#시장구조', '#기관급분석', '#GEX분석', '#VIX분석'],
  hidden: ['#옵션트레이딩', '#기관매매', '#퀀트분석'],
  brand: ['#시그넘에이치큐'],
};

const IG_TAGS_JA = {
  tier1: ['#株式投資', '#米国株'],
  tier2: ['#投資', '#トレード', '#オプション取引', '#マーケット分析'],
  tier3: ['#オプションフロー', '#ガンマエクスポージャー', '#ダークプール', '#市場構造分析'],
  hidden: ['#デリバティブ', '#機関投資家', '#定量分析'],
  brand: ['#SignumHQ'],
};

function buildInstagramHashtags(lang: Lang, contentType: ContentType): string {
  const tagSet = lang === 'ko' ? IG_TAGS_KO : lang === 'ja' ? IG_TAGS_JA : IG_TAGS_EN;

  // Pick: 2 tier1 + 4 tier2 + 6 tier3 + 2 hidden + 1 brand = 15
  const tags = [
    ...tagSet.tier1.slice(0, 2),
    ...tagSet.tier2.slice(0, 4),
    ...tagSet.tier3.slice(0, 6),
    ...tagSet.hidden.slice(0, 2),
    ...tagSet.brand,
  ];

  return tags.join(' ');
}

// ---------------------------------------------------------------------------
// Bluesky — $cashtags + 2~3 hashtags
// ---------------------------------------------------------------------------
const BLUESKY_TAGS: Record<ContentType, string[]> = {
  pulse:     ['#OptionsFlow', '#MarketStructure'],
  morning:   ['#PreMarket', '#GEX'],
  education: ['#GammaExposure', '#OptionsTrading'],
  event:     ['#OptionsFlow', '#GEX'],
  midday:    ['#MarketUpdate'],
  weekly:    ['#WeeklyRecap'],
  spotlight: ['#DarkPool', '#InstitutionalFlow'],
  premarket: ['#PreMarket', '#MarketStructure'],
  intraday:  ['#MarketUpdate', '#OptionsFlow'],
  close:     ['#MarketClose', '#MarketStructure'],
};

// ---------------------------------------------------------------------------
// Pinterest — SEO keywords for title/description
// ---------------------------------------------------------------------------
export interface PinterestSEO {
  titlePrefix: string;
  keywords: string[];
  hashtags: string[];
}

const PINTEREST_SEO: Record<ContentType, PinterestSEO> = {
  pulse: {
    titlePrefix: 'Market Structure Analysis',
    keywords: ['S&P 500 analysis', 'market close summary', 'options flow', 'GEX analysis', 'dark pool activity'],
    hashtags: ['#GammaExposure', '#OptionsFlow', '#StockMarket', '#MarketStructure', '#DarkPool', '#Trading', '#Investing', '#OptionsTrading', '#SignumHQ'],
  },
  morning: {
    titlePrefix: 'Pre-Market Brief',
    keywords: ['pre-market analysis', 'market outlook', 'stock market today', 'options structure'],
    hashtags: ['#PreMarket', '#StockMarket', '#Trading', '#Investing', '#OptionsFlow', '#MarketAnalysis', '#SignumHQ'],
  },
  education: {
    titlePrefix: 'Trading Education',
    keywords: ['options trading guide', 'how to trade options', 'market structure explained', 'institutional trading'],
    hashtags: ['#TradingEducation', '#OptionsTrading', '#StockMarket', '#Investing', '#FinancialLiteracy', '#SignumHQ'],
  },
  event: {
    titlePrefix: 'Market Alert',
    keywords: ['market alert', 'unusual options activity', 'GEX flip', 'volatility spike'],
    hashtags: ['#MarketAlert', '#OptionsFlow', '#StockMarket', '#Trading', '#SignumHQ'],
  },
  midday: {
    titlePrefix: 'Midday Market Update',
    keywords: ['midday market update', 'intraday analysis', 'live market data'],
    hashtags: ['#MarketUpdate', '#Trading', '#StockMarket', '#SignumHQ'],
  },
  weekly: {
    titlePrefix: 'Weekly Market Review',
    keywords: ['weekly market review', 'stock market recap', 'options flow weekly'],
    hashtags: ['#WeeklyRecap', '#StockMarket', '#Investing', '#MarketAnalysis', '#SignumHQ'],
  },
  spotlight: {
    titlePrefix: 'Institutional Flow Spotlight',
    keywords: ['dark pool activity', 'institutional trading', 'block trades', 'smart money flow', 'options analysis'],
    hashtags: ['#DarkPool', '#InstitutionalFlow', '#StockMarket', '#SmartMoney', '#OptionsFlow', '#Trading', '#SignumHQ'],
  },
  premarket: {
    titlePrefix: 'Pre-Market Structure',
    keywords: ['pre-market analysis', 'market structure', 'GEX analysis', 'options positioning'],
    hashtags: ['#PreMarket', '#MarketStructure', '#OptionsFlow', '#Trading', '#SignumHQ'],
  },
  intraday: {
    titlePrefix: 'Intraday Market Update',
    keywords: ['intraday analysis', 'live market data', 'options flow', 'dark pool'],
    hashtags: ['#MarketUpdate', '#OptionsFlow', '#Trading', '#StockMarket', '#SignumHQ'],
  },
  close: {
    titlePrefix: 'Market Close Summary',
    keywords: ['market close summary', 'daily recap', 'institutional positioning', 'options flow'],
    hashtags: ['#MarketClose', '#DailyRecap', '#StockMarket', '#OptionsFlow', '#SignumHQ'],
  },
};

const PINTEREST_TOPIC_TITLES: Record<string, string> = {
  gex: 'What is Gamma Exposure (GEX)? Options Trading Guide',
  dark_pool: 'Dark Pool Activity Explained — How Institutions Trade',
  iv_percentile: 'IV Percentile Guide — Understanding Implied Volatility',
  pcr: 'Put/Call Ratio Explained — Market Sentiment Indicator',
  max_pain: 'Max Pain Theory — How Options Expiration Affects Stock Prices',
  squeeze: 'Gamma Squeeze Mechanics — How Short Squeezes Work',
  iv_skew: 'IV Skew Explained — Reading the Fear Gauge',
  dex: 'Delta Exposure (DEX) — Advanced Options Flow Analysis',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get cashtags and hashtags SEPARATELY for X (Twitter).
 * 2026 X algorithm: Cashtags in the FIRST LINE help SimClusters matching.
 * Hashtags go at the END (max 2, or omitted entirely for cleaner look).
 */
export function getTwitterTagsSplit(opts: {
  contentType: ContentType;
  tickers?: string[];
  educationTopic?: string;
}): { cashtags: string; hashtags: string } {
  const { contentType, tickers, educationTopic } = opts;
  const cashtags = buildCashtags(tickers).join(' ');
  const rawHashtags = contentType === 'education' && educationTopic
    ? (X_EDUCATION_TOPIC_TAGS[educationTopic] || X_TAGS.education)
    : (X_TAGS[contentType] || []);
  // Max 2 hashtags for X (spam avoidance)
  const hashtags = rawHashtags.slice(0, 2).join(' ');
  return { cashtags, hashtags };
}

/**
 * Get hashtags for a specific platform + content type + language
 */
export function getHashtags(opts: {
  platform: Platform;
  contentType: ContentType;
  lang?: Lang;
  tickers?: string[];
  educationTopic?: string;
  date?: string;
}): string {
  const { platform, contentType, lang = 'en', tickers, educationTopic, date } = opts;

  switch (platform) {
    case 'twitter': {
      const cashtags = buildCashtags(tickers);
      const hashtags = contentType === 'education' && educationTopic
        ? (X_EDUCATION_TOPIC_TAGS[educationTopic] || X_TAGS.education)
        : (X_TAGS[contentType] || []);
      // 2026 X algorithm: max 2 hashtags to avoid spam detection
      const limitedHashtags = hashtags.slice(0, 2);
      return [...cashtags, ...limitedHashtags].join(' ');
    }

    case 'instagram':
      return buildInstagramHashtags(lang, contentType);

    case 'threads': {
      // Same as Instagram but fewer (3~5)
      const igTags = lang === 'ko' ? IG_TAGS_KO : lang === 'ja' ? IG_TAGS_JA : IG_TAGS_EN;
      return [...igTags.tier2.slice(0, 3), ...igTags.tier3.slice(0, 2)].join(' ');
    }

    case 'bluesky': {
      const cashtags = buildCashtags(tickers);
      const hashtags = BLUESKY_TAGS[contentType] || [];
      return [...cashtags, ...hashtags].join(' ');
    }

    case 'pinterest':
      return (PINTEREST_SEO[contentType]?.hashtags || []).join(' ');

    default:
      return '';
  }
}

/**
 * Get Pinterest SEO metadata
 */
export function getPinterestSEO(opts: {
  contentType: ContentType;
  educationTopic?: string;
  date?: string;
  spyChange?: number;
  gexRegime?: string;
}): { title: string; description: string } {
  const { contentType, educationTopic, date, spyChange, gexRegime } = opts;
  const seo = PINTEREST_SEO[contentType] || PINTEREST_SEO.pulse;
  const year = new Date().getFullYear();

  // --- Title: 40~100 chars, primary keyword front-loaded ---
  let title: string;
  if (contentType === 'education' && educationTopic) {
    title = PINTEREST_TOPIC_TITLES[educationTopic] || `${seo.titlePrefix}: Institutional Options Guide (${year})`;
  } else if (contentType === 'pulse' && date) {
    const gexStr = gexRegime ? ` — GEX ${gexRegime.toUpperCase()}` : '';
    const spyStr = spyChange != null ? ` — SPY ${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}%` : '';
    title = `S&P 500 Market Structure Analysis${spyStr}${gexStr} — ${date}`;
  } else if (contentType === 'morning') {
    title = `Pre-Market Options Structure Brief: What Smart Money Is Watching (${date || year})`;
  } else if (contentType === 'event') {
    title = `Options Flow Alert: Unusual Institutional Activity Detected (${date || year})`;
  } else {
    title = `${seo.titlePrefix}: Options & Market Structure Analysis — ${date || year}`;
  }

  // --- Description: 150~400 chars, natural keyword integration + CTA ---
  // Pinterest 2026: front-load primary keyword in first sentence, 2-3 related phrases naturally
  const description = [
    contentType === 'education'
      ? `Learn how institutional traders use ${educationTopic === 'gex' ? 'gamma exposure (GEX)' : educationTopic === 'dark_pool' ? 'dark pool data' : 'options flow analysis'} to gain an edge.`
      : `Comprehensive ${seo.keywords[0]} with options flow, gamma exposure, and dark pool data.`,
    `This ${contentType === 'education' ? 'guide' : 'analysis'} breaks down market structure using institutional-grade metrics most retail traders never see.`,
    '',
    `📌 Save this pin for your next trading session.`,
    `📊 See live data at SIGNUM HQ — free institutional dashboard.`,
    '',
    'Not financial advice. Data-driven context only.',
    '',
    seo.hashtags.join(' '),
  ].join(' ');

  return { title, description };
}

/**
 * Build Instagram caption footer with hidden hashtags
 */
export function buildInstagramFooter(lang: Lang, contentType: ContentType): string {
  const hashtags = buildInstagramHashtags(lang, contentType);
  const disclaimer = lang === 'ko'
    ? '*본 정보는 투자 권유가 아닌 데이터 분석 참고 자료입니다.'
    : lang === 'ja'
    ? '*投資助言ではありません。データ分析の参考資料です。'
    : '*Not financial advice. Data-driven context only.';

  // 2026 IG algorithm: saves + DM shares are #1 ranking signals
  const saveCta = lang === 'ko'
    ? '📌 장 오픈 전에 다시 볼 수 있게 저장하세요'
    : lang === 'ja'
    ? '📌 寄り前にもう一度確認できるよう保存してください'
    : '📌 Save this for market open';
  const shareCta = lang === 'ko'
    ? '↗️ 트레이딩 파트너에게 공유하세요'
    : lang === 'ja'
    ? '↗️ トレーディングパートナーに共有してください'
    : '↗️ Share with your trading partner';
  const analysisCta = lang === 'ko'
    ? '📊 전체 분석 → 프로필 링크'
    : lang === 'ja'
    ? '📊 全分析 → プロフィールリンク'
    : '📊 Full analysis → Link in bio';

  return `\n\n${saveCta}\n${shareCta}\n${analysisCta}\n\n${disclaimer}\n.\n.\n.\n.\n.\n${hashtags}`;
}
