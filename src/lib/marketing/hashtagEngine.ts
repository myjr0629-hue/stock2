// ============================================================================
// Hashtag Engine — Platform × Content × Language 최적 태그 자동 선택
// X: 1~3 hashtags + $cashtags (클린, 스팸 방지)
// Instagram: 15 hashtags 3-Tier 믹스 (대형+중형+니치+히든)
// Bluesky: $cashtags + 2~3 hashtags
// Pinterest: SEO 키워드 (title/description 최적화)
// ============================================================================

export type ContentType = 'pulse' | 'morning' | 'education' | 'event' | 'midday' | 'weekly';
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
  pulse:     ['#OptionsFlow', '#MarketStructure'],
  morning:   ['#PreMarket', '#GEX'],
  education: ['#GammaExposure', '#OptionsTrading'],
  event:     ['#OptionsFlow'],
  midday:    [],  // clean, no tags
  weekly:    ['#WeeklyRecap', '#MarketStructure'],
};

const X_EDUCATION_TOPIC_TAGS: Record<string, string[]> = {
  gex:           ['#GammaExposure', '#GEX', '#OptionsTrading'],
  dark_pool:     ['#DarkPool', '#InstitutionalFlow', '#SmartMoney'],
  iv_percentile: ['#ImpliedVolatility', '#OptionsTrading'],
  pcr:           ['#PutCallRatio', '#MarketSentiment'],
  max_pain:      ['#MaxPain', '#OptionsExpiration'],
  squeeze:       ['#GammaSqueeze', '#ShortSqueeze'],
  iv_skew:       ['#IVSkew', '#Volatility'],
  dex:           ['#DeltaExposure', '#OptionsFlow'],
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
      return [...cashtags, ...hashtags].join(' ');
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

  let title: string;
  if (contentType === 'education' && educationTopic) {
    title = PINTEREST_TOPIC_TITLES[educationTopic] || `${seo.titlePrefix} ${year}`;
  } else if (contentType === 'pulse' && date) {
    const gexStr = gexRegime ? ` — GEX ${gexRegime.toUpperCase()}` : '';
    const spyStr = spyChange != null ? ` — SPY ${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}%` : '';
    title = `S&P 500 Market Structure Analysis${spyStr}${gexStr} — ${date}`;
  } else {
    title = `${seo.titlePrefix} — ${date || year}`;
  }

  const description = [
    `${seo.keywords.join(', ')}.`,
    'See live GEX data, dark pool activity, and AI-powered market structure analysis at SIGNUM HQ.',
    'Free institutional-grade options flow dashboard with real-time data.',
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
    ? '*본 정보는 데이터 분석을 위한 참고 자료이며, 투자 권유가 아닙니다.'
    : lang === 'ja'
    ? '*本情報はデータ分析の参考資料であり、投資勧誘ではありません。'
    : '*Data-driven context. Not financial advice.';

  return `\n\n💾 ${lang === 'ko' ? '이 포스트를 저장해서 나중에 다시 확인하세요' : lang === 'ja' ? 'このポストを保存して後で確認しましょう' : 'Save this post for later reference'}\n📊 ${lang === 'ko' ? '전체 분석' : lang === 'ja' ? '全分析' : 'Full analysis'} → Link in bio\n\n${disclaimer}\n.\n.\n.\n.\n.\n${hashtags}`;
}
