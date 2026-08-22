import type { MetadataRoute } from 'next';
import { publicBase } from '@/lib/net/publicBase';

// Programmatic sitemap. Starts with a curated set of high-search tickers for the
// /flow/[ticker] pages (expand later toward the full universe). Without this, Google
// had no way to discover these pages. `new Date()` is fine here (server route, not a
// workflow script). x-default + per-locale URLs help Google pick the right language.
const LOCALES = ['en', 'ko', 'ja'] as const;

// ⛔ 2026-08-20: '/wim' 이 빠져 있었다. 라이브 200 인데 sitemap 에 없어 3개 로케일 전부
//    검색엔진에 «존재하지 않는» 페이지였다. /app·/app-uc·/app-wim 은 404(리다이렉트 전용)라 넣지 않는다.
const STATIC_PATHS = ['', '/undercurrent', '/wim', '/how-it-works', '/pricing'];

// Curated high-search / high-attention, liquid + optioned US tickers (v2, ~165).
// All names that reliably have news + money data (avoids soft-404s). Expand toward
// the full universe later once indexing/traffic proves out.
const FLOW_TICKERS = [
  // mega / semis / tech
  'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'AVGO', 'ORCL',
  'CRM', 'ADBE', 'AMD', 'NFLX', 'INTC', 'QCOM', 'CSCO', 'TXN', 'IBM', 'MU',
  'AMAT', 'LRCX', 'KLAC', 'ADI', 'MRVL', 'ARM', 'SMCI', 'DELL', 'HPQ', 'PANW',
  'CRWD', 'SNOW', 'NOW', 'INTU', 'ANET', 'WDC', 'STX', 'ON', 'MCHP', 'NXPI',
  'ASML', 'TSM',
  // high-attention / growth / meme
  'PLTR', 'COIN', 'MARA', 'RIOT', 'MSTR', 'SOFI', 'HOOD', 'RIVN', 'LCID', 'NIO',
  'RBLX', 'U', 'DKNG', 'ABNB', 'UBER', 'LYFT', 'SHOP', 'PYPL', 'ROKU', 'PINS',
  'SNAP', 'DASH', 'AFRM', 'UPST', 'CVNA', 'GME', 'AMC', 'CHWY', 'F', 'GM',
  // financials
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'SCHW', 'BLK', 'V', 'MA', 'AXP', 'COF',
  // healthcare
  'LLY', 'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'TMO', 'ABT', 'BMY', 'MRNA',
  'AMGN', 'GILD', 'CVS', 'ISRG', 'VRTX', 'REGN',
  // consumer
  'WMT', 'COST', 'HD', 'LOW', 'NKE', 'SBUX', 'MCD', 'DIS', 'KO', 'PEP', 'PG',
  'TGT', 'CMG', 'LULU', 'BKNG',
  // energy / industrials
  'XOM', 'CVX', 'COP', 'OXY', 'SLB', 'BA', 'CAT', 'GE', 'HON', 'LMT', 'RTX',
  'DE', 'UPS', 'FDX', 'UNP',
  // clean / telecom / media / china / other
  'ENPH', 'FSLR', 'PLUG', 'CHPT', 'QS', 'T', 'VZ', 'TMUS', 'CMCSA', 'WBD',
  'BABA', 'JD', 'PDD', 'ZM', 'NET', 'DDOG', 'MDB',
  // ETFs (heavily optioned)
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'ARKK', 'SOXL', 'SOXX', 'SMH',
  'TQQQ', 'SQQQ', 'TLT', 'GLD', 'SLV', 'USO', 'XLE', 'XLF', 'XLK', 'XLV',

  // ── 2026-08-22 확장: 167 → 595 ────────────────────────────────────────
  // GSC 실데이터가 확장 조건을 충족시켰다. 28일 기준 색인 518페이지,
  // 그리고 상위 질의가 전부 «{티커} max pain / {티커} dark pool» 패턴이었다
  //   uso dark pool 75노출 · wdc max pain 10 · arm/mrvl max pain
  // 즉 수요는 입증됐는데 커버리지가 167개에 묶여 있었다.
  //
  // 위 주석의 «소프트404 금지» 원칙을 지키려고 후보 454개를 «전부 실제로 렌더해»
  // 검증했다(scripts/probe-flow-tickers.js). 통과 기준은 렌더된 지표값 3개 이상.
  //   → 428 통과 / 26 탈락(vals<=1 = 내용 빈약)
  // 표본 검증: EXC·PSX·ADP 모두 Price·Max pain·Call wall·Put floor·P/C·Squeeze 완비.
  //
  // ⚠️ 처음엔 title 의 '(divergence)' 유무로 판정했다가 378개를 잘못 버렸다.
  //    그건 «데이터 유무»가 아니라 «괴리 신호가 있을 때만» 붙는 표시였다.
  //    판정 기준을 세울 땐 가짜 티커(ZZZZ)와 대조해서 확인할 것.
  'A', 'AA', 'AAL', 'ACHR', 'ADM', 'ADP', 'ADSK', 'AEM', 'AEP', 'AFL',
  'AGG', 'AI', 'AIG', 'ALB', 'ALGN', 'ALK', 'ALL', 'ALLY', 'ALNY', 'AME',
  'AMP', 'AMT', 'APA', 'APD', 'ARE', 'ARKB', 'ARKF', 'ARKG', 'ARKQ', 'ARKW',
  'ARRY', 'ASTS', 'AU', 'AXON', 'AZO', 'BAX', 'BBAI', 'BDX', 'BE', 'BEKE',
  'BEN', 'BHP', 'BIDU', 'BIIB', 'BILI', 'BILL', 'BITO', 'BITX', 'BKR', 'BLDP',
  'BMBL', 'BND', 'BOIL', 'BP', 'BSX', 'BURL', 'BXP', 'CAG', 'CAH', 'CAKE',
  'CB', 'CBOE', 'CCI', 'CCL', 'CDNS', 'CF', 'CFG', 'CHD', 'CHRW', 'CHTR',
  'CI', 'CLF', 'CLX', 'CME', 'CMI', 'CNC', 'COMP', 'COPX', 'COR', 'COTY',
  'CPB', 'CRL', 'CSX', 'CZR', 'D', 'DAL', 'DD', 'DG', 'DLR', 'DLTR',
  'DOCU', 'DOV', 'DOW', 'DPZ', 'DRI', 'DUK', 'DUST', 'DVN', 'DVY', 'DXCM',
  'E', 'ECL', 'ED', 'EEM', 'EFA', 'EL', 'ELV', 'EMB', 'EMR', 'ENVX',
  'EOG', 'EQIX', 'EQNR', 'ES', 'ESS', 'ESTC', 'ETHE', 'ETN', 'EW', 'EWJ',
  'EWT', 'EWY', 'EWZ', 'EXC', 'EXPD', 'FANG', 'FAS', 'FAZ', 'FBTC', 'FCEL',
  'FCX', 'FIS', 'FISV', 'FITB', 'FMC', 'FOUR', 'FOX', 'FOXA', 'FTNT', 'FTV',
  'FUTU', 'FXI', 'GBTC', 'GD', 'GDX', 'GDXJ', 'GIS', 'GOLD', 'GPN', 'GRAB',
  'GTLB', 'H', 'HAL', 'HBAN', 'HDB', 'HIG', 'HII', 'HLT', 'HMC', 'HMY',
  'HRL', 'HST', 'HUBS', 'HUM', 'HWM', 'HYG', 'IBB', 'IBIT', 'IBN', 'ICE',
  'ICLN', 'IDXX', 'IEF', 'IEMG', 'IFF', 'IJH', 'IJR', 'ILMN', 'INCY', 'INDA',
  'INFY', 'INVH', 'IONQ', 'IQ', 'IR', 'IRM', 'ITB', 'ITW', 'IVV', 'IVZ',
  'IYR', 'JBHT', 'JBLU', 'JDST', 'JEPI', 'JEPQ', 'JNUG', 'JOBY', 'KB', 'KBE',
  'KEY', 'KGC', 'KIM', 'KMB', 'KMI', 'KOLD', 'KR', 'KRE', 'KWEB', 'L',
  'LABD', 'LABU', 'LDOS', 'LHX', 'LI', 'LIN', 'LIT', 'LQD', 'LSTR', 'LU',
  'LUNR', 'LUV', 'LVS', 'LYB', 'LYV', 'MAA', 'MAR', 'MCHI', 'MCK', 'MCO',
  'MDT', 'MDY', 'MELI', 'MET', 'MGM', 'MKC', 'MLM', 'MMM', 'MOS', 'MPC',
  'MSCI', 'MTB', 'MTCH', 'MTD', 'MUB', 'MUFG', 'NBIX', 'NCLH', 'NDAQ', 'NEE',
  'NEM', 'NOC', 'NSC', 'NTES', 'NTRS', 'NUE', 'NUGT', 'NWSA', 'NYT', 'O',
  'ODFL', 'OIH', 'OKE', 'OKTA', 'OPEN', 'ORLY', 'PALL', 'PATH', 'PAYX', 'PBR',
  'PBW', 'PCAR', 'PEG', 'PENN', 'PGR', 'PH', 'PLD', 'PNC', 'PPG', 'PPLT',
  'PRU', 'PSA', 'PSX', 'PZZA', 'QBTS', 'QQQM', 'QSR', 'QYLD', 'RCL', 'REG',
  'REMX', 'RF', 'RGTI', 'RIO', 'RJF', 'RKLB', 'RMD', 'ROK', 'ROST', 'RPD',
  'RSP', 'RUN', 'RYLD', 'S', 'SAIA', 'SBAC', 'SCCO', 'SCHD', 'SCHG', 'SCO',
  'SE', 'SEDG', 'SHAK', 'SHEL', 'SHG', 'SHLS', 'SHW', 'SHY', 'SIL', 'SIRI',
  'SJM', 'SMFG', 'SNPS', 'SO', 'SONY', 'SOUN', 'SPCE', 'SPG', 'SPGI', 'SPXL',
  'SPXS', 'SRE', 'SRPT', 'STE', 'STLD', 'STT', 'SVXY', 'SWK', 'SYF', 'SYK',
  'SYY', 'TAN', 'TBT', 'TCOM', 'TDG', 'TEAM', 'TECH', 'TENB', 'TFC', 'TIGR',
  'TIP', 'TJX', 'TM', 'TME', 'TMF', 'TMV', 'TNA', 'TOST', 'TREE', 'TRGP',
  'TROW', 'TRV', 'TSN', 'TTE', 'TTWO', 'TWLO', 'TXRH', 'TXT', 'TZA', 'UAL',
  'UCO', 'UDR', 'UNG', 'URA', 'URNM', 'USB', 'UVXY', 'VALE', 'VIXY', 'VLO',
  'VMC', 'VNQ', 'VOOG', 'VTR', 'VTV', 'VUG', 'VWO', 'VXX', 'VYM', 'WAT',
  'WDAY', 'WEC', 'WELL', 'WEN', 'WEX', 'WH', 'WING', 'WIT', 'WMB', 'WY',
  'WYNN', 'XBI', 'XEL', 'XHB', 'XLB', 'XLC', 'XLI', 'XLP', 'XLRE', 'XLU',
  'XLY', 'XOP', 'XPEV', 'XPO', 'XRT', 'XYL', 'XYLD', 'XYZ', 'YANG', 'YINN',
  'YMM', 'YUM', 'ZBH', 'ZG', 'ZION', 'ZS', 'ZTO', 'ZTS',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicBase();
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const loc of LOCALES) {
    for (const p of STATIC_PATHS) {
      entries.push({
        url: `${base}/${loc}${p}`,
        lastModified: now,
        changeFrequency: p === '' ? 'daily' : 'weekly',
        priority: p === '' ? 0.9 : 0.6,
      });
    }
    for (const t of FLOW_TICKERS) {
      entries.push({
        url: `${base}/${loc}/flow/${t}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
  }

  return entries;
}
