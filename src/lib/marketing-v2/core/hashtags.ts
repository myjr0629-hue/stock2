// ============================================================================
// Marketing V2 — Hashtag Registry
// 플랫폼 × 콘텐츠 × 언어별 해시태그를 단일 파일에서 관리
// 기존 hashtagEngine.ts의 데이터를 V2 구조에 맞게 통합
// ============================================================================

import { Platform, Lang, ContentSlot } from './types';

// ── $Cashtag 빌더 ──
export function buildCashtags(tickers?: string[]): string {
  if (tickers?.length) return tickers.map(t => `$${t.replace('$', '')}`).join(' ');
  return '$SPY $QQQ';
}

// ── X (Twitter) ──
const X_TAGS: Record<ContentSlot, string[]> = {
  morning:   ['#PreMarket', '#WallStreet'],
  close:     ['#StockMarket', '#SP500'],
  spacex:    ['#SpaceXIPO', '#TSLA'],
  education: ['#OptionsTrading', '#Trading'],
  pulse:     ['#Options', '#SP500'],
  spotlight: ['#DarkPool', '#SmartMoney'],
  event:     ['#Options', '#BreakingNews'],
};

const X_TAGS_KO: Record<ContentSlot, string[]> = {
  morning:   ['#미국주식', '#프리마켓', '#해외주식'],
  close:     ['#나스닥', '#미국주식', '#해외주식'],
  spacex:    ['#스페이스X', '#테슬라', '#미국주식'],
  education: ['#주식공부', '#옵션거래', '#미국주식'],
  pulse:     ['#미국증시', '#옵션거래', '#미국주식'],
  spotlight: ['#다크풀', '#기관매매', '#미국주식'],
  event:     ['#미국주식', '#긴급속보', '#나스닥'],
};

const X_TAGS_JA: Record<ContentSlot, string[]> = {
  morning:   ['#米国株', '#プレマーケット', '#ナスダック'],
  close:     ['#ナスダック', '#米国株', '#株式投資'],
  spacex:    ['#SpaceX', '#テスラ', '#米国株'],
  education: ['#株式投資', '#オプション取引', '#米国株'],
  pulse:     ['#米国市場', '#オプション取引', '#米国株'],
  spotlight: ['#ダークプール', '#機関投資家', '#米国株'],
  event:     ['#米国株', '#速報', '#ナスダック'],
};

// ── Bluesky ──
const BSKY_TAGS: Record<ContentSlot, string[]> = {
  morning:   ['#PreMarket', '#WallStreet'],
  close:     ['#SP500', '#StockMarket'],
  spacex:    ['#SpaceXIPO', '#DarkPool'],
  education: ['#OptionsTrading', '#Trading'],
  pulse:     ['#Options', '#SP500'],
  spotlight: ['#DarkPool', '#SmartMoney'],
  event:     ['#BreakingNews', '#Options'],
};

// ── Instagram — 15 hashtags 3-tier ──
const IG_TAGS: Record<Lang, string> = {
  en: '#trading #investing #stockmarket #daytrading #options #wallstreet #sp500 #optionsflow #darkpool #smartmoney #gammaexposure #marketstructure #optionstrading #volatility #signumhq',
  ko: '#주식 #투자 #미국주식 #해외주식 #주식투자 #미국증시 #나스닥 #옵션거래 #다크풀 #기관매매 #시장분석 #주식공부 #미국선물 #주식차트 #시그넘에이치큐',
  ja: '#米国株 #投資 #株式投資 #トレード #デイトレード #ウォール街 #ナスダック #オプション取引 #ダークプール #機関投資家 #市場分析 #チャート分析 #米国市場 #投資家 #SignumHQ',
};

// ── Threads ──
const THREADS_TAGS: Record<Lang, string> = {
  en: '$SPY $QQQ #stockmarket #options #darkpool',
  ko: '#미국주식 #나스닥 #해외주식 #옵션거래',
  ja: '#米国株 #ナスダック #株式投資 #投資',
};

// ── Pinterest — SEO 최적화 ──
const PIN_TAGS: Record<ContentSlot, string> = {
  morning:   '#PreMarket #StockMarket #Trading #Investing #WallStreet #StocksToWatch #SignumHQ',
  close:     '#StockMarket #SP500 #Trading #Investing #MarketClose #WallStreet #SignumHQ',
  spacex:    '#SpaceXIPO #TSLA #SpaceX #IPO #DarkPool #SmartMoney #Investing #StockMarket #ElonMusk #SignumHQ',
  education: '#OptionsTrading #Trading #Investing #StockMarket #TradingEducation #Options #SignumHQ',
  pulse:     '#SP500 #Options #StockMarket #DarkPool #Trading #Investing #WallStreet #OptionsFlow #SignumHQ',
  spotlight: '#DarkPool #SmartMoney #StockMarket #Trading #Investing #Options #WallStreet #SignumHQ',
  event:     '#Options #StockMarket #Trading #SmartMoney #WallStreet #SignumHQ',
};

// ── Pinterest SEO 제목 ──
export const PINTEREST_TITLES: Record<ContentSlot, string> = {
  morning:   'Pre-Market Movers Today — Options Structure Analysis',
  close:     'Stock Market Close Today — Institutional Recap',
  spacex:    'SpaceX IPO 2026 — Latest Dark Pool Intelligence',
  education: 'Options Trading Guide — Institutional Strategy',
  pulse:     'S&P 500 Options Flow Analysis — Market Structure',
  spotlight: 'Dark Pool Trading Activity — Smart Money Flow',
  event:     'Unusual Options Activity Alert — Institutional Flow',
};

export const EDUCATION_PIN_TITLES: Record<string, string> = {
  gex:           'What is Gamma Exposure (GEX)? Options Trading Guide',
  dark_pool:     'Dark Pool Activity Explained — How Institutions Trade',
  smart_flow:    'Smart Money Flow Index — Tracking Institutional Direction',
  iv_percentile: 'IV Percentile Guide — Understanding Implied Volatility',
  pcr:           'Put/Call Ratio Explained — Market Sentiment Indicator',
  max_pain:      'Max Pain Theory — How Options Expiration Affects Stock Prices',
};

// ── Public API ──

/**
 * 플랫폼 × 콘텐츠 × 언어에 맞는 해시태그 문자열 반환
 */
export function getHashtagsForPlatform(
  platform: Platform,
  slot: ContentSlot,
  lang: Lang,
  tickers?: string[],
): string {
  switch (platform) {
    case 'twitter': {
      if (lang === 'ko') return (X_TAGS_KO[slot] || X_TAGS_KO.close).slice(0, 3).join(' ');
      if (lang === 'ja') return (X_TAGS_JA[slot] || X_TAGS_JA.close).slice(0, 3).join(' ');
      const cash = buildCashtags(tickers);
      const tags = (X_TAGS[slot] || X_TAGS.close).slice(0, 2).join(' ');
      return `${cash} ${tags}`;
    }
    case 'bluesky': {
      const cash = buildCashtags(tickers);
      const tags = (BSKY_TAGS[slot] || BSKY_TAGS.close).join(' ');
      return `${cash} ${tags}`;
    }
    case 'instagram':
      return IG_TAGS[lang] || IG_TAGS.en;
    case 'threads':
      return THREADS_TAGS[lang] || THREADS_TAGS.en;
    case 'pinterest':
      return PIN_TAGS[slot] || PIN_TAGS.pulse;
    case 'telegram':
      return ''; // Telegram은 해시태그 불필요
    default:
      return '';
  }
}

/**
 * ContentPackage용 해시태그 맵 생성
 * Prepare 단계에서 호출 → pkg.hashtags에 저장
 */
export function buildHashtagMap(
  slot: ContentSlot,
  langs: Lang[],
  platforms: Platform[],
  tickers?: string[],
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const lang of langs) {
    result[lang] = {};
    for (const platform of platforms) {
      const tags = getHashtagsForPlatform(platform, slot, lang, tickers);
      if (tags) result[lang][platform] = tags;
    }
  }
  return result;
}
