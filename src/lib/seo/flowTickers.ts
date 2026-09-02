// ============================================================================
// flowTickers — /flow/[ticker] 로 «공개»되는 티커 목록. 단일 진실원천.
// ----------------------------------------------------------------------------
// 여기 있는 티커는 세 곳이 동시에 쓴다.
//   ① sitemap.ts        검색엔진에 URL 제출
//   ② /[locale]/tickers 허브 페이지 (내부 링크로 크롤·가중치 전달)
//   ③ /flow/[ticker]    같은 섹션의 «다른 티커» 상호링크
//
// ⚠️ 여기 추가하기 전에 반드시 프로덕션에서 렌더 검증할 것
//    (scripts/probe-flow-tickers.js — 렌더된 지표값 3개 이상이면 통과).
//    데이터 없는 티커는 소프트404가 되어 도메인 전체 평가를 깎는다.
// ============================================================================

// Curated high-search / high-attention, liquid + optioned US tickers (v2, ~165).
// All names that reliably have news + money data (avoids soft-404s). Expand toward
// the full universe later once indexing/traffic proves out.
export const FLOW_TICKERS = [
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

  // ── 2026-08-30 확장: 595 → 1195 ─────────────────────
  // 왜 지금 늘리나: 다크풀(FINRA)이 **전 종목**에 붙으면서 모든 페이지가
  //   지표 3개(장외 비중·물량 배수·공매도 비중)를 더 갖게 됐다. 예전에
  //   «내용 빈약»으로 탈락했던 티커가 이제 충분한 페이지가 된다.
  //
  // 검증: 후보 601개를 **전부 실제 렌더**해서 확인했다
  //   (scripts/probe-flow-expand.js). 통과 기준을 3 → 5 로 올렸다 —
  //   다크풀이 3개를 더 주므로 옛 기준은 너무 헐거워졌기 때문이다.
  //   후보는 «FINRA 커버 + 일 거래대금 상위»에서 뽑았다(잡주 제외).
  'SNDK', 'SPCX', 'IREN', 'LITE', 'NBIS', 'SGOV', 'SOXS', 'APP', 'PCG', 'SKHY',
  'GEV', 'IGV', 'COHR', 'CRWV', 'DRAM', 'CRCL', 'BMNR', 'NU', 'SOLS', 'ETHA',
  'VEEV', 'VRT', 'SUNB', 'CBRS', 'GLDM', 'ACN', 'GLW', 'MPWR', 'RBRK', 'TER',
  'NVDL', 'ULTA', 'IAU', 'VCIT', 'ALAB', 'SPOT', 'PM', 'HPE', 'IEFA', 'ESI',
  'DKS', 'KEYS', 'B', 'TSLL', 'SNXX', 'APH', 'BIL', 'MUU', 'GAP', 'DHR',
  'NOK', 'QID', 'AAOI', 'HL', 'MDLZ', 'URI', 'AGQ', 'TEM', 'VGIT', 'VEA',
  'CLS', 'ONDS', 'FIG', 'SGI', 'FIX', 'SPYM', 'BOXX', 'PWR', 'KHC', 'EIX',
  'SCHP', 'CDE', 'SAP', 'VGSH', 'APLD', 'CIEN', 'ACM', 'CEG', 'AXTI', 'FNGR',
  'IQV', 'JAAA', 'CIFR', 'AZN', 'IQMM', 'SU', 'IAUM', 'GDXU', 'OKLO', 'EBAY',
  'WULF', 'GNRC', 'TPR', 'PURR', 'VTEB', 'USHY', 'WM', 'NVD', 'VXUS', 'UGL',
  'BBY', 'HIMS', 'RDDT', 'VST', 'CCJ', 'HCA', 'TYL', 'RVMD', 'HONA', 'ENTG',
  'MO', 'SMTC', 'ACGL', 'IWF', 'UMC', 'WPM', 'NVO', 'PULS', 'BNY', 'PAAS',
  'CNQ', 'JCI', 'KORU', 'SNDQ', 'LNG', 'VGT', 'SPDN', 'STM', 'UPRO', 'MKSI',
  'CARR', 'JPST', 'SHV', 'MTZ', 'HUT', 'SMR', 'BX', 'VCLT', 'ANF', 'CTSH',
  'CASY', 'QLD', 'GWRE', 'TT', 'IWD', 'SPDW', 'RKT', 'DT', 'CRH', 'EXPE',
  'VCSH', 'SWKS', 'RWM', 'PSLV', 'CYTK', 'BNTX', 'RSG', 'VMRK', 'AG', 'JBL',
  'AJG', 'FLUT', 'FNV', 'ROIV', 'P', 'FN', 'APO', 'FAST', 'MAGS', 'UL',
  'ASX', 'GH', 'ONTO', 'JAZZ', 'MTSI', 'TSCO', 'ENB', 'AIA', 'CNP', 'BUD',
  'ZETA', 'TEL', 'NTAP', 'MRSH', 'AKAM', 'SGOL', 'NVT', 'DY', 'EME', 'MP',
  'CTAS', 'CL', 'SCHO', 'RRX', 'NTRA', 'GFI', 'VIK', 'MVLL', 'KDP', 'AWK',
  'KKR', 'IGLB', 'USFR', 'CTVA', 'STZ', 'HNGE', 'TSEM', 'SH', 'MOD', 'FROG',
  'PHYS', 'ZSL', 'VT', 'ASST', 'AMKR', 'SILJ', 'SN', 'GOVT', 'OTIS', 'MNST',
  'FIVE', 'ACWI', 'ITOT', 'MSI', 'CDW', 'Q', 'NRG', 'ROP', 'NTNX', 'AON',
  'SPXU', 'ATI', 'INSM', 'CLSK', 'DOCN', 'EFV', 'USAR', 'BTI', 'PAAA', 'VBIL',
  'PSQ', 'FNGU', 'FERG', 'WSM', 'KVUE', 'DECK', 'FLEX', 'BINC', 'TECK', 'STRL',
  'CBRE', 'CPRT', 'EFX', 'GRMN', 'AGNC', 'BTG', 'PNR', 'FDS', 'HQY', 'ETHU',
  'SCHF', 'MSTU', 'USIG', 'DHI', 'TD', 'IBKR', 'APTV', 'KNX', 'BMO', 'RMBS',
  'MINT', 'ZBRA', 'LPLA', 'CPNG', 'BAP', 'VRSN', 'LEN', 'MTUM', 'RVTY', 'TLN',
  'RIG', 'NVTS', 'MDLN', 'XME', 'GDDY', 'EQT', 'CELH', 'CORZ', 'RY', 'DFCF',
  'SCHX', 'ECHO', 'SPMO', 'GLL', 'GWW', 'BWET', 'TWST', 'IGSB', 'PR', 'MOH',
  'PPL', 'MSTZ', 'SPCH', 'WWD', 'SW', 'W', 'FTAI', 'EQX', 'IOT', 'DAR',
  'QNRX', 'SITM', 'ALLE', 'VISN', 'IGIB', 'MSFU', 'CRS', 'TSLG', 'CW', 'EXE',
  'JNK', 'AEHR', 'GEN', 'STRC', 'IDEV', 'AUR', 'SCHB', 'BG', 'FICO', 'RL',
  'VRSK', 'VIG', 'DINO', 'OWL', 'ARGX', 'NVS', 'RGLD', 'MBB', 'TTD', 'HALO',
  'IVW', 'SSO', 'AVAV', 'AEIS', 'GSK', 'BZ', 'SDS', 'NVMI', 'GFL', 'SPTL',
  'IXN', 'AGX', 'KLAR', 'QUAL', 'FPS', 'WCC', 'PTC', 'WST', 'SIVR', 'SUI',
  'AS', 'CHYM', 'AGI', 'AAAU', 'BNDX', 'PL', 'AIT', 'SM', 'BULL', 'NVDX',
  'USMV', 'TTMI', 'CHKP', 'OSCR', 'IEI', 'MSTX', 'CVE', 'ARES', 'VO', 'BKLN',
  'ITA', 'DGX', 'CIBR', 'AVEM', 'TRMB', 'CM', 'AVUV', 'BOX', 'SPYG', 'ETR',
  'JKHY', 'LH', 'IWR', 'NVR', 'PODD', 'BN', 'HEI', 'REET', 'AMZU', 'CMS',
  'GFS', 'BBJP', 'METU', 'BBIO', 'HSY', 'CGDV', 'FRO', 'IWB', 'IUSB', 'LII',
  'HBM', 'UNF', 'TXG', 'IWO', 'RGEN', 'ONON', 'USFD', 'UNM', 'LEU', 'CONL',
  'GEHC', 'MDGL', 'UMAC', 'CNH', 'GGG', 'SPIB', 'EAT', 'EXK', 'EPAM', 'KEEL',
  'EGO', 'BTDR', 'OVV', 'QQQI', 'WCN', 'FLOT', 'CSGP', 'WAB', 'LNT', 'THC',
  'IP', 'MUSA', 'AVY', 'UTHR', 'NTR', 'AUGO', 'PHM', 'IAG', 'DAVE', 'SHAZ',
  'BSV', 'LSCC', 'MKTX', 'BNS', 'BR', 'AMCR', 'VEU', 'URBN', 'TTAN', 'RACE',
  'CSL', 'BWXT', 'ASHR', 'FFIV', 'VGK', 'HSBC', 'SANM', 'BROS', 'BBWI', 'STIP',
  'PBF', 'SLS', 'CP', 'TRI', 'STLA', 'ELF', 'WSO', 'ETSY', 'VTIP', 'EMBJ',
  'SAN', 'VGLT', 'AGCO', 'MANH', 'VICR', 'ELS', 'UEC', 'IXUS', 'PTEN', 'ONC',
  'GDXD', 'QXO', 'CACI', 'WK', 'IRE', 'NI', 'VSAT', 'SOXQ', 'AER', 'HUBB',
  'ETH', 'BJ', 'OMC', 'LTH', 'SPLB', 'TPG', 'BTC', 'KVYO', 'CHAI', 'TRU',
  'TE', 'IT', 'VSH', 'BB', 'CCEP', 'TOL', 'RPM', 'DTE', 'TKO', 'VLTO',
  'PLTD', 'FLR', 'EWA', 'TECL', 'VSXY', 'MYRG', 'CLH', 'WTRG', 'EVRG', 'TDY',
  'EXR', 'AEE', 'VTWO', 'INDV', 'LNTH', 'TLH', 'AMRZ', 'COKE', 'TEVA', 'SYRE',
  'NLY', 'INFQ', 'UVIX', 'PAYC', 'VICI', 'IONS', 'AEMD', 'MEDP', 'SBS', 'FNDX',
  'FHN', 'GLXY', 'BLDR', 'PFGC', 'UI', 'ITUB', 'AVLV', 'NDSN', 'FTI', 'FORM',
  'BMNU', 'BSOL', 'EMXC', 'BRKR', 'SSPC', 'VOYA', 'DYNF', 'DBX', 'ICSH', 'AOS',
  'RELY', 'VMI', 'PSKY', 'ARWR', 'DTM', 'SBSW', 'MKL', 'OLLI', 'SCHH', 'FE',
  'ET', 'GLPI', 'EHC', 'ARMK', 'WTW', 'EXLS', 'SAIC', 'JHX', 'RDW', 'AAPD',
  'EMLC', 'DLB', 'ABVX', 'GGLL', 'CART', 'CORT', 'VFLO', 'RPRX', 'DNN', 'FLS',

  // ══════════════════════════════════════════════════════════════
  // [2026-09-02] 수집 유니버스 전체로 확장 (+1033).
  //   sitemap.ts 주석이 원래 «expand later toward the full universe» 라고
  //   적어 두었던 그 확장이다. 2,001종목을 모으면서 페이지는 1,195개뿐이었다.
  //
  //   ⚠️ 검사기(probe-flow-tickers)가 처음엔 1,034개 중 74개만 통과시켰다.
  //      판정이 <title> 의 "(divergence)" 유무였는데, 그건 그 종목에 실제로
  //      다이버전스가 있을 때만 붙는 «조건부» 문구다. 페이지 품질과 무관하다.
  //      실측: ACAD 115KB·실데이터 값 102개인데 그 이유로 탈락했다.
  //      판정을 «제목에 티커 + 본문 60KB 이상 + 값 20개 이상» 으로 바꾸니
  //      1,033/1,034 통과. 즉 960개가 오탐이었다.
  // ══════════════════════════════════════════════════════════════
  'AAON', 'AAOX', 'AAP', 'ABCB', 'ABCL', 'ABG', 'ABSI', 'ACA', 'ACAD', 'ACHC',
  'ACI', 'ACIW', 'ACLS', 'ACMR', 'ACVA', 'ADC', 'ADEA', 'ADMA', 'ADNT', 'ADPT',
  'ADT', 'ADTN', 'AEG', 'AEO', 'AES', 'AESI', 'AFG', 'AHR', 'AIR', 'AIZ',
  'ALC', 'ALG', 'ALGM', 'ALGT', 'ALHC', 'ALKS', 'ALKT', 'ALM', 'ALMU', 'ALSN',
  'ALV', 'AM', 'AMBA', 'AMDD', 'AMG', 'AMH', 'AMPX', 'AMR', 'AMSC', 'AMTM',
  'AN', 'ANAB', 'ANDE', 'ANNX', 'ANSS', 'AOSL', 'APG', 'APGE', 'APLE', 'APLS',
  'APLX', 'AQN', 'AR', 'ARCB', 'ARCC', 'ARDX', 'ARMG', 'AROC', 'ARR', 'ARW',
  'ASAN', 'ASB', 'ASH', 'ASM', 'ASND', 'ASO', 'ASTX', 'ATEC', 'ATKR', 'ATMU',
  'ATO', 'ATOM', 'ATR', 'ATRO', 'AUB', 'AVB', 'AVEX', 'AVL', 'AVT', 'AVTR',
  'AVTX', 'AWI', 'AX', 'AXS', 'AXSM', 'AXTA', 'AYI', 'AZTA', 'BAH', 'BAI',
  'BALL', 'BAM', 'BANC', 'BAND', 'BATRK', 'BC', 'BCC', 'BCE', 'BCO', 'BCRX',
  'BCS', 'BDC', 'BEAM', 'BELFB', 'BEP', 'BEPC', 'BETA', 'BF.B', 'BFAM', 'BFH',
  'BHC', 'BHE', 'BIO', 'BIP', 'BIPC', 'BIRK', 'BITB', 'BIV', 'BIZD', 'BJRI',
  'BK', 'BKD', 'BKH', 'BKSY', 'BL', 'BLBD', 'BLD', 'BLLN', 'BLMN', 'BLSH',
  'BLZE', 'BMI', 'BMRN', 'BNL', 'BNO', 'BOOT', 'BORR', 'BPOP', 'BRBR', 'BRK.B',
  'BRO', 'BRX', 'BRZE', 'BSY', 'BTBT', 'BTE', 'BTSG', 'BTU', 'BUG', 'BW',
  'BWA', 'BWX', 'BXSL', 'BYD', 'BYND', 'BYRN', 'BZAI', 'CACC', 'CAI', 'CALM',
  'CALY', 'CAMT', 'CAR', 'CARG', 'CAVA', 'CBRL', 'CBSH', 'CBT', 'CC', 'CCC',
  'CCK', 'CE', 'CECO', 'CELC', 'CENX', 'CERT', 'CEVA', 'CFR', 'CG', 'CGGR',
  'CGNX', 'CHDN', 'CHE', 'CHEF', 'CHH', 'CHRD', 'CINF', 'CLBT', 'CLMT', 'CMC',
  'CMPX', 'CNA', 'CNI', 'CNK', 'CNM', 'CNO', 'CNR', 'CNX', 'CNXC', 'COCO',
  'COGT', 'COHU', 'COLB', 'COLD', 'COLM', 'COMT', 'COO', 'CORD', 'CORN', 'COUR',
  'CPA', 'CPAY', 'CPRI', 'CPRX', 'CPT', 'CR', 'CRBG', 'CRC', 'CRCA', 'CRCD',
  'CRDO', 'CRGY', 'CRI', 'CRK', 'CRML', 'CRNX', 'CROX', 'CRSP', 'CRUS', 'CRWU',
  'CSTM', 'CSW', 'CTRA', 'CTRE', 'CTRI', 'CUBE', 'CUBI', 'CUK', 'CUZ', 'CVCO',
  'CVI', 'CVLT', 'CWAN', 'CWEN', 'CWST', 'CWVX', 'CX', 'CXM', 'CXW', 'DB',
  'DBRG', 'DCH', 'DCI', 'DEI', 'DFAR', 'DFTX', 'DGXX', 'DHT', 'DIOD', 'DJT',
  'DK', 'DLO', 'DNLI', 'DNOW', 'DNTH', 'DOC', 'DOCS', 'DOG', 'DORM', 'DOX',
  'DRS', 'DSGX', 'DUOL', 'DVA', 'DX', 'DXC', 'EA', 'EBC', 'EC', 'ECG',
  'ECVT', 'EEFT', 'EFC', 'EG', 'EGP', 'ELAN', 'EMN', 'ENR', 'ENS', 'ENSG',
  'ENVA', 'EOSE', 'EPD', 'EPR', 'EPRT', 'EQH', 'EQPT', 'EQR', 'ERAS', 'ERIC',
  'ERIE', 'ERY', 'ESAB', 'ESE', 'ESLT', 'ESNT', 'ESPR', 'ESTA', 'ETHT', 'ETHW',
  'EVC', 'EVER', 'EVLV', 'EVR', 'EWBC', 'EWH', 'EWTX', 'EXEL', 'EXP', 'EXTR',
  'FAF', 'FBIN', 'FBND', 'FCFS', 'FCN', 'FENY', 'FER', 'FETH', 'FHB', 'FHI',
  'FIBK', 'FIGR', 'FIGS', 'FIVN', 'FLG', 'FLNC', 'FLO', 'FLY', 'FLYW', 'FNB',
  'FND', 'FNF', 'FOLD', 'FR', 'FRMI', 'FRPT', 'FRSH', 'FRT', 'FSLY', 'FSM',
  'FSS', 'FTRE', 'FTS', 'FUBO', 'FULT', 'FUN', 'FWONK', 'G', 'GATX', 'GBCI',
  'GBDC', 'GBTG', 'GCT', 'GDYN', 'GEO', 'GFF', 'GGLS', 'GIL', 'GKOS', 'GL',
  'GLBE', 'GLNG', 'GLOB', 'GMED', 'GNL', 'GNTX', 'GNW', 'GO', 'GOLF', 'GPC',
  'GPGI', 'GPI', 'GPK', 'GPOR', 'GPRE', 'GPRK', 'GRAL', 'GRID', 'GRNY', 'GSAT',
  'GSOL', 'GT', 'GTES', 'GTLS', 'GTM', 'GTX', 'GVA', 'GXO', 'HAE', 'HAS',
  'HASI', 'HAYW', 'HCC', 'HCI', 'HE', 'HEI.A', 'HESM', 'HGV', 'HIMX', 'HIMZ',
  'HIVE', 'HLI', 'HLN', 'HLNE', 'HNI', 'HNRG', 'HOG', 'HOMB', 'HP', 'HR',
  'HRB', 'HRI', 'HSIC', 'HTGC', 'HTZ', 'HUN', 'HURN', 'HWC', 'HXL', 'HYMC',
  'IAC', 'IBP', 'IBRX', 'ICFI', 'ICHR', 'ICLR', 'IDA', 'IDCC', 'IE', 'IESC',
  'IEX', 'IFRX', 'ILF', 'IMO', 'IMSR', 'IMVT', 'INBX', 'ING', 'INGM', 'INGR',
  'INOD', 'INSP', 'INSW', 'INTR', 'IOVA', 'IPGP', 'IRDM', 'IREX', 'IREZ', 'IRT',
  'IRTC', 'ITGR', 'ITRI', 'ITT', 'J', 'JBS', 'JBTM', 'JEF', 'JETS', 'JHG',
  'JJSF', 'JLL', 'JXN', 'KAI', 'KALV', 'KBH', 'KBR', 'KD', 'KEX', 'KGS',
  'KLIC', 'KMPR', 'KMT', 'KMX', 'KN', 'KNF', 'KNSA', 'KNSL', 'KNTK', 'KOPN',
  'KOS', 'KRC', 'KRG', 'KRMN', 'KRYS', 'KSS', 'KTB', 'KTOS', 'KYIV', 'KYMR',
  'LAC', 'LAD', 'LAES', 'LAMR', 'LAR', 'LASR', 'LAUR', 'LAZ', 'LBRDK', 'LBRT',
  'LCII', 'LEA', 'LECO', 'LEG', 'LEVI', 'LFUS', 'LGN', 'LGND', 'LINE', 'LION',
  'LITX', 'LIVN', 'LKQ', 'LLYVK', 'LMAT', 'LMB', 'LMND', 'LNC', 'LOAR', 'LOGI',
  'LOPE', 'LPTH', 'LPX', 'LQDA', 'LRN', 'LUMN', 'LW', 'LWLG', 'LYG', 'LZ',
  'M', 'MAC', 'MAS', 'MASI', 'MAT', 'MATX', 'MBC', 'MBLY', 'MC', 'MCY',
  'MD', 'MDU', 'MEOH', 'MFC', 'MFG', 'MGA', 'MGNI', 'MGY', 'MHK', 'MIAX',
  'MIDD', 'MIR', 'MIRM', 'MLI', 'MMS', 'MMSI', 'MNDY', 'MNKD', 'MOG.A', 'MORN',
  'MPLX', 'MRAM', 'MRCY', 'MRLN', 'MRP', 'MRX', 'MSA', 'MSGS', 'MSM', 'MT',
  'MTDR', 'MTG', 'MTH', 'MTN', 'MTRN', 'MUR', 'MUX', 'MWA', 'MXL', 'MZTI',
  'NAT', 'NAVN', 'NBIG', 'NBR', 'NCNO', 'NE', 'NEBX', 'NEO', 'NEOG', 'NEU',
  'NEXT', 'NFG', 'NG', 'NHI', 'NKTR', 'NNE', 'NNN', 'NOG', 'NOV', 'NOVT',
  'NPO', 'NRGV', 'NSA', 'NSIT', 'NTLA', 'NTSK', 'NUAI', 'NUVL', 'NVAX', 'NVDQ',
  'NVST', 'NWG', 'NWL', 'NWS', 'NXE', 'NXST', 'NXT', 'OBDC', 'OC', 'OCUL',
  'OGE', 'OGN', 'OGS', 'OHI', 'OII', 'OKLL', 'OLED', 'OLN', 'OMF', 'ONB',
  'OPCH', 'OPLN', 'ORA', 'ORC', 'ORCX', 'ORI', 'ORKA', 'ORLA', 'OSIS', 'OSK',
  'OSS', 'OTEX', 'OUST', 'OUT', 'OZK', 'PAA', 'PAG', 'PAGP', 'PAGS', 'PAR',
  'PARA', 'PARR', 'PATK', 'PB', 'PBA', 'PBI', 'PBR.A', 'PCOR', 'PCT', 'PCTY',
  'PCVX', 'PD', 'PDBC', 'PEAK', 'PEB', 'PEGA', 'PEN', 'PENG', 'PFG', 'PFSI',
  'PGX', 'PGY', 'PHG', 'PHIN', 'PHR', 'PI', 'PII', 'PIPR', 'PJT', 'PK',
  'PKG', 'PLAB', 'PLMR', 'PLNT', 'PLTU', 'PLXS', 'PMT', 'PNFP', 'PNW', 'POET',
  'PONY', 'POOL', 'POR', 'POST', 'POWI', 'POWL', 'PPC', 'PPTA', 'PRAX', 'PRGO',
  'PRI', 'PRIM', 'PRKS', 'PRM', 'PRMB', 'PSIX', 'PSMT', 'PSN', 'PTCT', 'PTGX',
  'PTIR', 'PTON', 'PUMP', 'PVH', 'PVLA', 'QDEL', 'QGEN', 'QLYS', 'QRVO', 'QUBT',
  'QURE', 'R', 'RAL', 'RARE', 'RBA', 'RBC', 'RCAT', 'RCI', 'RCUS', 'RDN',
  'RDNT', 'REAL', 'RELX', 'REXR', 'REYN', 'RGA', 'RGTZ', 'RH', 'RHI', 'RHP',
  'RITM', 'RKLX', 'RLAY', 'RLI', 'RLJ', 'RNG', 'RNR', 'ROAD', 'ROG', 'ROL',
  'RR', 'RRC', 'RRR', 'RS', 'RSI', 'RUSHA', 'RVLV', 'RXO', 'RXRX', 'RYAN',
  'RYN', 'RYTM', 'RZLV', 'SAIL', 'SAM', 'SARO', 'SATL', 'SATS', 'SBET', 'SBLK',
  'SBRA', 'SCHE', 'SCHI', 'SCHR', 'SCHV', 'SCI', 'SDOW', 'SEI', 'SEIC', 'SERV',
  'SEZL', 'SF', 'SFM', 'SG', 'SGHC', 'SGML', 'SGRY', 'SHC', 'SHLD', 'SHO',
  'SHOO', 'SHYG', 'SIDU', 'SIG', 'SIGI', 'SII', 'SILA', 'SITE', 'SJNK', 'SKT',
  'SKY', 'SKYT', 'SLAB', 'SLDP', 'SLF', 'SLG', 'SLM', 'SLP', 'SMCX', 'SMG',
  'SMMT', 'SMPL', 'SMX', 'SNA', 'SNDR', 'SNDX', 'SNEX', 'SNX', 'SNY', 'SOBO',
  'SOLV', 'SON', 'SPAB', 'SPB', 'SPHR', 'SPHY', 'SPIR', 'SPLV', 'SPSB', 'SPSM',
  'SPTI', 'SPXC', 'SPYI', 'SPYV', 'SQ', 'SQM', 'SR', 'SRAD', 'SRLN', 'SRRK',
  'SSB', 'SSD', 'SSL', 'SSNC', 'SSRM', 'ST', 'STAA', 'STAG', 'STEP', 'STN',
  'STNE', 'STNG', 'STUB', 'STWD', 'SUN', 'SUNC', 'SUPN', 'SUZ', 'SVM', 'SWX',
  'SXT', 'SYM', 'SYNA', 'TAC', 'TAK', 'TAL', 'TALO', 'TAP', 'TARS', 'TBIL',
  'TBLA', 'TCBI', 'TDC', 'TDOC', 'TDW', 'TERN', 'TETH', 'TEX', 'TFII', 'TFLO',
  'TFX', 'TGB', 'TGTX', 'THG', 'THO', 'THR', 'TIC', 'TIGO', 'TKR', 'TLRY',
  'TMC', 'TMDX', 'TMHC', 'TNC', 'TNDM', 'TNGX', 'TNL', 'TPC', 'TPH', 'TPL',
  'TREX', 'TRIN', 'TRIP', 'TRMD', 'TROX', 'TRP', 'TSDD', 'TSL', 'TSLQ', 'TSLT',
  'TSLX', 'TSLZ', 'TTC', 'TTEK', 'TTI', 'TU', 'TVTX', 'TW', 'TXNM', 'UAA',
  'UAMY', 'UBS', 'UCTT', 'UDOW', 'UFPI', 'UFPT', 'UGI', 'UGP', 'UGRO', 'UHS',
  'ULCC', 'ULS', 'UMBF', 'UNIT', 'UPWK', 'URGN', 'USAS', 'UTI', 'UUUU', 'UWMC',
  'VAC', 'VAL', 'VC', 'VCTR', 'VCX', 'VCYT', 'VECO', 'VERA', 'VET', 'VFC',
  'VG', 'VGNT', 'VIAV', 'VIRT', 'VITL', 'VKTX', 'VLY', 'VNET', 'VNO', 'VNOM',
  'VNT', 'VOD', 'VOYG', 'VRDN', 'VRNS', 'VSCO', 'VSEC', 'VSNT', 'VTRS', 'VVV',
  'VVX', 'WAL', 'WAY', 'WBS', 'WEAT', 'WERN', 'WES', 'WFRD', 'WGS', 'WHR',
  'WIX', 'WLK', 'WMG', 'WMS', 'WOLF', 'WPC', 'WRB', 'WRBY', 'WRD', 'WSC',
  'WSR', 'WT', 'WTFC', 'WTS', 'WTTR', 'WU', 'XE', 'XENE', 'XIFR', 'XMTR',
  'XNDU', 'XOVR', 'XP', 'XRAY', 'YETI', 'YLD', 'YOU', 'YSS', 'YUMC', 'Z',
  'ZIM', 'ZNTL', 'ZWS',
];
