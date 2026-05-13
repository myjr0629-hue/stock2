// ============================================================================
// Hashtag Engine — Platform × Content × Language 최적 태그 자동 선택
// X: 1~3 hashtags + $cashtags (클린, 스팸 방지)
// Instagram: 15 hashtags 3-Tier 믹스 (대형+중형+니치+히든)
// Bluesky: $cashtags + 2~3 hashtags
// Pinterest: SEO 키워드 (title/description 최적화)
// ============================================================================

export type ContentType = 'pulse' | 'morning' | 'education' | 'event' | 'midday' | 'weekly' | 'spotlight' | 'premarket' | 'intraday' | 'close' | 'briefing' | 'spacex';
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
// ---------------------------------------------------------------------------
// X (Twitter) — 1~2 hashtags max (high-volume, spam-free)
// 2026 X algorithm: cashtags → SimClusters, hashtags → topic discovery
// Priority: highest daily search volume + direct relevance
// ---------------------------------------------------------------------------
const X_TAGS: Record<ContentType, string[]> = {
  pulse:     ['#Options', '#SP500'],
  morning:   ['#PreMarket', '#WallStreet'],
  education: ['#OptionsTrading', '#Trading'],
  event:     ['#Options', '#BreakingNews'],
  midday:    ['#StockMarket', '#Trading'],
  weekly:    ['#StockMarket', '#Investing'],
  spotlight: ['#DarkPool', '#SmartMoney'],
  premarket: ['#PreMarket', '#Futures'],
  intraday:  ['#DayTrading', '#Options'],
  close:     ['#StockMarket', '#SP500'],
  briefing:  ['#PreMarket', '#StockMarket'],
  spacex:    ['#SpaceXIPO', '#TSLA'],
};

// Localized X tags — use native language tags for higher discovery in each market
const X_TAGS_LOCALIZED: Record<Lang, Partial<Record<ContentType, string[]>>> = {
  ko: {
    close:     ['#미국주식', '#해외주식'],       // 2.1M / 1.5M on Korean fintwit
    morning:   ['#미국주식', '#프리마켓'],
    pulse:     ['#옵션거래', '#미국주식'],
    midday:    ['#미국주식', '#주식투자'],
    briefing:  ['#미국주식', '#프리마켓'],
    education: ['#주식공부', '#옵션거래'],
    spotlight: ['#다크풀', '#기관매매'],
    intraday:  ['#미국주식', '#데이트레이딩'],
  },
  ja: {
    close:     ['#米国株', '#株式投資'],          // 4M / 1.8M on Japanese fintwit
    morning:   ['#米国株', '#プレマーケット'],
    pulse:     ['#オプション取引', '#米国株'],
    midday:    ['#米国株', '#デイトレード'],
    briefing:  ['#米国株', '#プレマーケット'],
    education: ['#株式投資', '#オプション取引'],
    spotlight: ['#ダークプール', '#機関投資家'],
    intraday:  ['#米国株', '#デイトレード'],
  },
  en: {}, // Use default X_TAGS for English
};

const X_EDUCATION_TOPIC_TAGS: Record<string, string[]> = {
  gex:           ['#Options', '#Trading'],
  dark_pool:     ['#DarkPool', '#SmartMoney'],
  iv_percentile: ['#Options', '#Volatility'],
  pcr:           ['#Options', '#Trading'],
  max_pain:      ['#Options', '#StockMarket'],
  squeeze:       ['#ShortSqueeze', '#Trading'],
  iv_skew:       ['#Volatility', '#Options'],
  dex:           ['#Options', '#DayTrading'],
};

// ---------------------------------------------------------------------------
// Instagram — 15 hashtags, 3-tier volume mix
// Tier1: 5M+ posts (broad reach) | Tier2: 500K-5M (mid funnel) | Tier3: 50K-500K (niche authority)
// ---------------------------------------------------------------------------
const IG_TAGS_EN = {
  tier1: ['#trading', '#investing'],                    // 15M / 12M
  tier2: ['#stockmarket', '#daytrading', '#options', '#wallstreet', '#sp500'],  // 3.2M / 1.8M / 1.5M / 1.2M / 890K
  tier3: ['#optionsflow', '#darkpool', '#smartmoney', '#gammaexposure', '#marketstructure', '#institutionalflow'],  // 420K → 50K (niche)
  hidden: ['#optionstrading', '#volatility', '#tradingview', '#nasdaq'],   // discovery tags
  brand: ['#signumhq'],
};

const IG_TAGS_KO = {
  tier1: ['#주식', '#투자'],                              // 8M / 6M
  tier2: ['#미국주식', '#해외주식', '#주식투자', '#미국증시', '#나스닥'],  // 2.1M / 1.5M / 1.2M / 890K / 680K
  tier3: ['#옵션거래', '#다크풀', '#기관매매', '#시장분석', '#주식공부', '#미국선물', '#테슬라'],  // 320K → 50K
  hidden: ['#주식차트', '#단타', '#스윙트레이딩'],
  brand: ['#시그넘에이치큐'],
};

const IG_TAGS_JA = {
  tier1: ['#米国株', '#投資'],                            // 4M / 5M
  tier2: ['#株式投資', '#トレード', '#デイトレード', '#ウォール街', '#ナスダック'],  // 1.8M / 1.2M / 890K / 420K / 380K
  tier3: ['#オプション取引', '#ダークプール', '#機関投資家', '#市場分析', '#テスラ'],  // 220K → 50K
  hidden: ['#チャート分析', '#米国市場', '#投資家'],
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
// Bluesky — $cashtags + 2~3 hashtags (discovery-optimized)
// Bluesky 2026: hashtags drive feed discovery, higher volume = more reach
// ---------------------------------------------------------------------------
const BLUESKY_TAGS: Record<ContentType, string[]> = {
  pulse:     ['#Options', '#SP500'],
  morning:   ['#PreMarket', '#WallStreet'],
  education: ['#OptionsTrading', '#Trading'],
  event:     ['#BreakingNews', '#Options'],
  midday:    ['#StockMarket', '#DayTrading'],
  weekly:    ['#Investing', '#StockMarket'],
  spotlight: ['#DarkPool', '#SmartMoney'],
  premarket: ['#PreMarket', '#Futures'],
  intraday:  ['#DayTrading', '#Options'],
  close:     ['#SP500', '#StockMarket'],
  briefing:  ['#PreMarket', '#WallStreet'],
  spacex:    ['#SpaceXIPO', '#DarkPool'],
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
    titlePrefix: 'S&P 500 Options Flow Analysis',
    keywords: ['stock market today', 'S&P 500 analysis today', 'options flow analysis', 'dark pool activity today', 'how to read market structure'],
    hashtags: ['#SP500', '#Options', '#StockMarket', '#DarkPool', '#Trading', '#Investing', '#WallStreet', '#OptionsFlow', '#SignumHQ'],
  },
  morning: {
    titlePrefix: 'Pre-Market Movers Today',
    keywords: ['pre-market movers today', 'stock market outlook today', 'stocks to watch today', 'pre-market analysis', 'market opening predictions'],
    hashtags: ['#PreMarket', '#StockMarket', '#Trading', '#Investing', '#WallStreet', '#StocksToWatch', '#SignumHQ'],
  },
  education: {
    titlePrefix: 'Options Trading Guide',
    keywords: ['how to trade options for beginners', 'options trading explained', 'best options strategies 2026', 'how to read options flow'],
    hashtags: ['#OptionsTrading', '#Trading', '#Investing', '#StockMarket', '#TradingEducation', '#Options', '#SignumHQ'],
  },
  event: {
    titlePrefix: 'Unusual Options Activity Alert',
    keywords: ['unusual options activity today', 'smart money moves today', 'options flow alert', 'institutional trading activity'],
    hashtags: ['#Options', '#StockMarket', '#Trading', '#SmartMoney', '#WallStreet', '#SignumHQ'],
  },
  midday: {
    titlePrefix: 'Stock Market Today — Midday Update',
    keywords: ['stock market today live', 'midday market update', 'stocks moving today', 'intraday trading ideas'],
    hashtags: ['#StockMarket', '#Trading', '#DayTrading', '#Investing', '#SP500', '#SignumHQ'],
  },
  weekly: {
    titlePrefix: 'Weekly Stock Market Recap',
    keywords: ['stock market weekly recap', 'best performing stocks this week', 'weekly options flow review', 'market summary this week'],
    hashtags: ['#StockMarket', '#Investing', '#WeeklyRecap', '#Trading', '#SP500', '#SignumHQ'],
  },
  spotlight: {
    titlePrefix: 'Dark Pool Trading Activity',
    keywords: ['dark pool trading explained', 'institutional trading today', 'smart money flow today', 'how to track dark pool trades', 'best stocks to buy now'],
    hashtags: ['#DarkPool', '#SmartMoney', '#StockMarket', '#Trading', '#Investing', '#Options', '#WallStreet', '#SignumHQ'],
  },
  premarket: {
    titlePrefix: 'Pre-Market Analysis',
    keywords: ['pre-market analysis today', 'futures market today', 'stock market futures', 'pre-market trading strategy'],
    hashtags: ['#PreMarket', '#Futures', '#StockMarket', '#Trading', '#WallStreet', '#SignumHQ'],
  },
  intraday: {
    titlePrefix: 'Intraday Trading Ideas',
    keywords: ['day trading ideas today', 'intraday stock picks', 'best stocks for day trading', 'live market analysis'],
    hashtags: ['#DayTrading', '#Trading', '#StockMarket', '#Options', '#Investing', '#SignumHQ'],
  },
  close: {
    titlePrefix: 'Stock Market Close Today',
    keywords: ['stock market close today', 'market recap today', 'after hours trading', 'institutional positioning today'],
    hashtags: ['#StockMarket', '#SP500', '#Trading', '#Investing', '#MarketClose', '#WallStreet', '#SignumHQ'],
  },
  briefing: {
    titlePrefix: 'Morning Market Briefing — AI Analysis',
    keywords: ['morning market briefing today', 'stock market analysis AI', 'pre-market outlook', 'institutional sentiment today'],
    hashtags: ['#PreMarket', '#StockMarket', '#Investing', '#Trading', '#AI', '#WallStreet', '#SignumHQ'],
  },
  spacex: {
    titlePrefix: 'SpaceX IPO 2026',
    keywords: ['SpaceX IPO date 2026', 'SpaceX IPO how to buy', 'TSLA SpaceX connection', 'SpaceX S-1 filing', 'SpaceX valuation 2026', 'SpaceX dark pool data', 'how to invest in SpaceX before IPO'],
    hashtags: ['#SpaceXIPO', '#TSLA', '#SpaceX', '#IPO', '#DarkPool', '#SmartMoney', '#Investing', '#StockMarket', '#ElonMusk', '#SignumHQ'],
  },
};

const PINTEREST_TOPIC_TITLES: Record<string, string> = {
  gex: 'What is Gamma Exposure (GEX)? Options Trading Guide',
  dark_pool: 'Dark Pool Activity Explained — How Institutions Trade',
  smart_flow: 'Smart Money Flow Index — Tracking Institutional Direction',
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
      // Use localized tags when available, fallback to English
      const localTags = X_TAGS_LOCALIZED[lang]?.[contentType];
      const hashtags = localTags
        || (contentType === 'education' && educationTopic
          ? (X_EDUCATION_TOPIC_TAGS[educationTopic] || X_TAGS.education)
          : (X_TAGS[contentType] || []));
      const limitedHashtags = hashtags.slice(0, 2);
      return [...cashtags, ...limitedHashtags].join(' ');
    }

    case 'instagram':
      return buildInstagramHashtags(lang, contentType);

    case 'threads': {
      // $cashtags + IG-style hashtags (3~5 total tags)
      const cashtags = buildCashtags(tickers);
      const igTags = lang === 'ko' ? IG_TAGS_KO : lang === 'ja' ? IG_TAGS_JA : IG_TAGS_EN;
      return [...cashtags, ...igTags.tier2.slice(0, 2), ...igTags.tier3.slice(0, 1)].join(' ');
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

  // --- Description: Pinterest max 500 chars (Buffer enforced) ---
  const textParts = [
    contentType === 'education'
      ? `Learn how institutional traders use ${educationTopic === 'gex' ? 'gamma exposure (GEX)' : educationTopic === 'dark_pool' ? 'dark pool data' : educationTopic === 'smart_flow' ? 'smart money flow analysis' : 'options flow analysis'} to gain an edge.`
      : `Comprehensive ${seo.keywords[0]} with options flow, gamma exposure, and dark pool data.`,
    `This ${contentType === 'education' ? 'guide' : 'analysis'} breaks down market structure using institutional-grade metrics most retail traders never see.`,
    '',
    `📌 Save this pin for your next trading session.`,
    `📊 See live data at SIGNUM HQ — free institutional dashboard.`,
    '',
    'Not financial advice. Data-driven context only.',
  ].join(' ');

  const hashtagStr = seo.hashtags.join(' ');
  let description: string;
  if ((textParts + ' ' + hashtagStr).length <= 500) {
    description = `${textParts} ${hashtagStr}`;
  } else if (textParts.length <= 500) {
    // Fit as many hashtags as possible
    const remaining = 500 - textParts.length - 1;
    const tags = hashtagStr.substring(0, remaining);
    description = `${textParts} ${tags}`.trim();
  } else {
    description = textParts.substring(0, 497) + '...';
  }

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
