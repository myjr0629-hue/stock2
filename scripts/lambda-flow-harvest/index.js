/**
 * signum-flow-harvest Lambda v2.0
 * 
 * Flow 페이지 전용 warm — signum-data-harvest와 완전 독립
 * 
 * 저장 대상:
 *   1. polygon:snapshot:probe:{TICKER}  — Polygon 옵션 스냅샷 원본 (Vercel에서 계산용으로 사용)
 *   2. rt-metrics:{TICKER}              — Dark Pool %, Short Volume %, Block Trades, Bid-Ask
 *   3. cache:flow:unified:{TICKER}      — Flow 페이지 SSR용 통합 데이터
 *   4. darkpool:{TICKER}                — 다크풀 개별 거래 리스트
 *   5. DynamoDB signum-flow-history     — Tier 2 영구 fallback
 * 
 * 절대 원칙:
 *   - 옵션 스냅샷은 RAW 원본만 저장 — 계산/가공은 Vercel의 기존 코드가 수행
 *   - 데이터 구조 = 현재 Vercel API 반환 구조 100% 동일
 *   - signum-data-harvest 코드/데이터와 겹침 0
 *   - 가격(price) warm 금지
 * 
 * Polygon API 호출 (종목당):
 *   0. /v3/snapshot/options/{TICKER}    (옵션 스냅샷 probe + exact + pagination)
 *   1. /v3/trades/{TICKER}?limit=5000   (realtime-metrics용)
 *   2. /v3/quotes/{TICKER}?limit=1000   (Quote Rule 분류용)
 *   3. /stocks/v1/short-volume           (공매도 비율)
 *   4. /v3/trades/{TICKER}?limit=10000   (dark-pool-trades용)
 *   5. next_url follow                   (dark-pool page 2)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const __intrinio = require('./intrinio-adapter');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

const POLYGON_KEY = process.env.POLYGON_API_KEY || '';
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

// [COST OPT] EC2 ElastiCache Proxy — internal VPC writes (zero Upstash cost)
const EC2_PROXY_URL = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const EC2_PROXY_KEY = process.env.REDIS_PROXY_KEY || 'signum-redis-proxy-2026';
const http = require('http');

// TTLs matching Vercel API routes exactly (MARKET HOURS)
const RT_METRICS_TTL = 600;    // 10 min (realtime-metrics route L310)
const DARKPOOL_TTL = 300;      // 5 min (dark-pool-trades route L21)
const FLOW_UNIFIED_TTL = 300;  // 5 min (flow/unified route L13)
const OPTIONS_SNAPSHOT_TTL = 600; // 10 min (options snapshot raw cache)

// [FIX] Extended TTLs for off-hours/weekends — preserve last data until next market open
// Without this, data expires 10 min after market close and shows nothing overnight/weekends
const OFF_HOURS_TTL = 86400;   // 24 hours (weekday after-close)
const WEEKEND_TTL = 259200;    // 72 hours (Friday close → Monday open)

function getEffectiveTTL(baseTTL) {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const isDST = month >= 3 && month <= 11;
  const etOffset = isDST ? 4 : 5;
  const etHour = (now.getUTCHours() - etOffset + 24) % 24;
  const day = now.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat

  // Weekend: use 72h TTL (Fri close → Mon open)
  if (day === 0 || day === 6 || (day === 5 && etHour >= 20)) {
    return WEEKEND_TTL;
  }
  // After market close (20:00+ ET): use 24h TTL
  if (etHour >= 19) {
    return OFF_HOURS_TTL;
  }
  // During market hours: use normal short TTL
  return baseTTL;
}

// Dark Pool Exchange IDs (FINRA TRF/ADF = Dark Pool) — matches realtime-metrics route L12
const DARK_POOL_EXCHANGES = new Set([4, 15, 16, 19]);
// Dark Pool Condition Codes — matches dark-pool-trades route L18
const DARK_POOL_CONDITIONS = new Set([12, 41, 52]);
const BLOCK_TRADE_MIN = 10000; // FINRA standard

// Universe — injected by deploy script
const UNIVERSE = ["A","AA","AAAU","AAL","AAOI","AAON","AAOX","AAP","AAPL","ABBV","ABCB","ABCL","ABG","ABNB","ABSI","ABT","ACA","ACAD","ACGL","ACHC","ACHR","ACI","ACIW","ACLS","ACM","ACMR","ACN","ACVA","ACWI","ADBE","ADC","ADEA","ADI","ADM","ADMA","ADNT","ADP","ADPT","ADSK","ADT","ADTN","AEE","AEG","AEHR","AEIS","AEM","AEO","AEP","AER","AES","AESI","AFG","AFL","AFRM","AG","AGCO","AGI","AGNC","AGQ","AGX","AHR","AI","AIG","AIR","AIT","AIZ","AJG","AKAM","ALAB","ALB","ALC","ALG","ALGM","ALGN","ALGT","ALHC","ALK","ALKS","ALKT","ALL","ALLE","ALLY","ALM","ALMU","ALNY","ALSN","ALV","AM","AMAT","AMBA","AMC","AMCR","AMD","AMDD","AME","AMG","AMGN","AMH","AMKR","AMP","AMPX","AMR","AMRZ","AMSC","AMT","AMTM","AMZN","AN","ANAB","ANDE","ANET","ANF","ANNX","ANSS","AON","AOS","AOSL","APA","APD","APG","APGE","APH","APLD","APLE","APLS","APLX","APO","APP","APTV","AQN","AR","ARCB","ARCC","ARDX","ARE","ARES","ARKB","ARM","ARMG","ARMK","AROC","ARR","ARRY","ARW","ARWR","AS","ASAN","ASB","ASH","ASHR","ASM","ASML","ASND","ASO","ASST","ASTS","ASTX","ASX","ATEC","ATI","ATKR","ATMU","ATO","ATOM","ATR","ATRO","AU","AUB","AUGO","AUR","AVAV","AVB","AVEX","AVGO","AVL","AVT","AVTR","AVTX","AVY","AWI","AWK","AX","AXON","AXP","AXS","AXSM","AXTA","AXTI","AYI","AZN","AZO","AZTA","B","BA","BABA","BAC","BAH","BAI","BALL","BAM","BANC","BAND","BAP","BATRK","BAX","BB","BBAI","BBIO","BBWI","BBY","BC","BCC","BCE","BCO","BCRX","BCS","BDC","BDX","BE","BEAM","BEKE","BELFB","BEN","BEP","BEPC","BETA","BF.B","BFAM","BFH","BG","BHC","BHE","BHP","BIDU","BIIB","BIL","BILL","BIO","BIP","BIPC","BIRK","BITB","BIV","BIZD","BJ","BJRI","BK","BKD","BKH","BKLN","BKNG","BKR","BKSY","BL","BLBD","BLD","BLDP","BLDR","BLK","BLLN","BLMN","BLSH","BLZE","BMI","BMNR","BMO","BMRN","BMY","BN","BNDX","BNL","BNO","BNS","BOOT","BORR","BOX","BP","BPOP","BR","BRBR","BRK.B","BRKR","BRO","BROS","BRX","BRZE","BSV","BSX","BSY","BTBT","BTC","BTDR","BTE","BTG","BTI","BTSG","BTU","BUD","BUG","BULL","BURL","BW","BWA","BWX","BWXT","BX","BXP","BXSL","BYD","BYND","BYRN","BZAI","C","CACC","CACI","CAG","CAH","CAI","CAKE","CALM","CALY","CAMT","CAR","CARG","CARR","CART","CASY","CAT","CAVA","CB","CBOE","CBRE","CBRL","CBSH","CBT","CC","CCC","CCEP","CCI","CCJ","CCK","CCL","CDE","CDNS","CDW","CE","CECO","CEG","CELC","CELH","CENX","CERT","CEVA","CF","CFG","CFR","CG","CGDV","CGGR","CGNX","CHD","CHDN","CHE","CHEF","CHH","CHKP","CHRD","CHRW","CHTR","CHWY","CHYM","CI","CIBR","CIEN","CIFR","CINF","CL","CLBT","CLF","CLH","CLMT","CLS","CLSK","CLX","CM","CMC","CMCSA","CME","CMG","CMI","CMPX","CMS","CNA","CNC","CNH","CNI","CNK","CNM","CNO","CNP","CNQ","CNR","CNX","CNXC","COCO","COF","COGT","COHR","COHU","COIN","COKE","COLB","COLD","COLM","COMP","COMT","COO","COP","COPX","COR","CORD","CORN","CORT","CORZ","COST","COTY","COUR","CP","CPA","CPAY","CPB","CPNG","CPRI","CPRT","CPRX","CPT","CR","CRBG","CRC","CRCA","CRCD","CRCL","CRDO","CRGY","CRH","CRI","CRK","CRL","CRM","CRML","CRNX","CROX","CRS","CRSP","CRUS","CRWD","CRWU","CRWV","CSCO","CSGP","CSL","CSTM","CSW","CSX","CTAS","CTRA","CTRE","CTRI","CTSH","CTVA","CUBE","CUBI","CUK","CUZ","CVCO","CVE","CVI","CVLT","CVNA","CVS","CVX","CW","CWAN","CWEN","CWST","CWVX","CX","CXM","CXW","CYTK","CZR","D","DAL","DAR","DASH","DAVE","DB","DBRG","DBX","DCH","DCI","DD","DDOG","DE","DECK","DEI","DELL","DFAR","DFTX","DG","DGX","DGXX","DHI","DHR","DHT","DIA","DINO","DIOD","DIS","DJT","DK","DKNG","DKS","DLB","DLO","DLR","DLTR","DNLI","DNN","DNOW","DNTH","DOC","DOCN","DOCS","DOCU","DOG","DORM","DOV","DOW","DOX","DPZ","DRAM","DRI","DRS","DSGX","DT","DTE","DTM","DUK","DUOL","DVA","DVN","DX","DXC","DXCM","DY","DYNF","EA","EAT","EBAY","EBC","EC","ECG","ECL","ECVT","ED","EEFT","EFC","EFX","EG","EGO","EGP","EHC","EIX","EL","ELAN","ELF","ELS","ELV","EMB","EME","EMLC","EMN","EMR","EMXC","ENB","ENPH","ENR","ENS","ENSG","ENTG","ENVA","ENVX","EOG","EOSE","EPAM","EPD","EPR","EPRT","EQH","EQIX","EQNR","EQPT","EQR","EQT","EQX","ERAS","ERIC","ERIE","ERY","ES","ESAB","ESE","ESI","ESLT","ESNT","ESPR","ESS","ESTA","ESTC","ET","ETH","ETHA","ETHE","ETHT","ETHU","ETHW","ETN","ETR","ETSY","EVC","EVER","EVLV","EVR","EVRG","EW","EWBC","EWH","EWT","EWTX","EXC","EXE","EXEL","EXK","EXLS","EXP","EXPD","EXPE","EXR","EXTR","F","FAF","FANG","FAST","FBIN","FBND","FBTC","FCEL","FCFS","FCN","FCX","FDS","FDX","FE","FENY","FER","FERG","FETH","FFIV","FHB","FHI","FHN","FIBK","FICO","FIG","FIGR","FIGS","FIS","FISV","FITB","FIVE","FIVN","FIX","FLEX","FLG","FLNC","FLO","FLR","FLS","FLUT","FLY","FLYW","FN","FNB","FND","FNDX","FNF","FNV","FOLD","FORM","FOUR","FOX","FOXA","FPS","FR","FRMI","FRO","FROG","FRPT","FRSH","FRT","FSLR","FSLY","FSM","FSS","FTAI","FTI","FTNT","FTRE","FTS","FTV","FUBO","FULT","FUN","FWONK","G","GAP","GATX","GBCI","GBDC","GBTG","GCT","GD","GDDY","GDX","GDXJ","GDYN","GE","GEHC","GEN","GEO","GEV","GFF","GFI","GFL","GFS","GGG","GGLS","GH","GIL","GILD","GIS","GKOS","GL","GLBE","GLL","GLNG","GLOB","GLPI","GLW","GLXY","GM","GME","GMED","GNL","GNRC","GNTX","GNW","GO","GOLF","GOOG","GOOGL","GOVT","GPC","GPGI","GPI","GPK","GPN","GPOR","GPRE","GPRK","GRAB","GRAL","GRID","GRMN","GRNY","GS","GSAT","GSK","GSOL","GT","GTES","GTLB","GTLS","GTM","GTX","GVA","GWRE","GWW","GXO","H","HAE","HAL","HALO","HAS","HASI","HAYW","HBAN","HBM","HCA","HCC","HCI","HD","HDB","HE","HEI","HEI.A","HESM","HGV","HIG","HII","HIMS","HIMX","HIMZ","HIVE","HL","HLI","HLN","HLNE","HLT","HMY","HNGE","HNI","HNRG","HOG","HOMB","HON","HOOD","HP","HPE","HPQ","HQY","HR","HRB","HRI","HRL","HSIC","HST","HSY","HTGC","HTZ","HUBB","HUBS","HUM","HUN","HURN","HUT","HWC","HWM","HXL","HYMC","IAC","IAG","IBKR","IBM","IBN","IBP","IBRX","ICE","ICFI","ICHR","ICLR","IDA","IDCC","IDXX","IE","IEFA","IEMG","IESC","IEX","IFF","IFRX","IGSB","IGV","ILF","ILMN","IMO","IMSR","IMVT","INBX","INCY","INDV","INFQ","INFY","ING","INGM","INGR","INOD","INSM","INSP","INSW","INTC","INTR","INTU","INVH","IONQ","IONS","IOT","IOVA","IP","IPGP","IQV","IR","IRDM","IRE","IREN","IREX","IREZ","IRM","IRT","IRTC","ISRG","IT","ITGR","ITOT","ITRI","ITT","ITUB","ITW","IUSB","IVW","IVZ","IWM","IYR","J","JAAA","JAZZ","JBHT","JBL","JBLU","JBS","JBTM","JCI","JD","JEF","JETS","JHG","JHX","JJSF","JKHY","JLL","JNJ","JOBY","JPM","JPST","JXN","KAI","KALV","KBH","KBR","KD","KDP","KEEL","KEX","KEY","KEYS","KGC","KGS","KHC","KIM","KKR","KLAC","KLAR","KLIC","KMB","KMI","KMPR","KMT","KMX","KN","KNF","KNSA","KNSL","KNTK","KNX","KO","KOPN","KOS","KR","KRC","KRG","KRMN","KRYS","KSS","KTB","KTOS","KVUE","KVYO","KYIV","KYMR","L","LAC","LAD","LAES","LAMR","LAR","LASR","LAUR","LAZ","LBRDK","LBRT","LCID","LCII","LDOS","LEA","LECO","LEG","LEN","LEU","LEVI","LFUS","LGN","LGND","LH","LHX","LI","LII","LIN","LINE","LION","LITE","LITX","LIVN","LKQ","LLY","LLYVK","LMAT","LMB","LMND","LMT","LNC","LNG","LNT","LNTH","LOAR","LOGI","LOPE","LOW","LPLA","LPTH","LPX","LQDA","LRCX","LRN","LSCC","LSTR","LTH","LULU","LUMN","LUNR","LUV","LVS","LW","LWLG","LYB","LYFT","LYG","LYV","LZ","M","MA","MAA","MAC","MANH","MAR","MARA","MAS","MASI","MAT","MATX","MBC","MBLY","MC","MCD","MCHP","MCK","MCO","MCY","MD","MDB","MDGL","MDLN","MDLZ","MDT","MDU","MEDP","MELI","MEOH","MET","META","METU","MFC","MFG","MGA","MGM","MGNI","MGY","MHK","MIAX","MIDD","MIR","MIRM","MKC","MKSI","MKTX","MLI","MLM","MMM","MMS","MMSI","MNDY","MNKD","MNST","MO","MOD","MOG.A","MOH","MORN","MOS","MP","MPC","MPLX","MPWR","MRAM","MRCY","MRK","MRLN","MRNA","MRP","MRSH","MRVL","MRX","MS","MSA","MSCI","MSFT","MSFU","MSGS","MSI","MSM","MSTR","MT","MTB","MTCH","MTD","MTDR","MTG","MTH","MTN","MTRN","MTSI","MTZ","MU","MUB","MUFG","MUR","MUSA","MUX","MVLL","MWA","MXL","MYRG","MZTI","NAT","NAVN","NBIG","NBIS","NBIX","NBR","NCLH","NCNO","NDAQ","NDSN","NE","NEBX","NEE","NEM","NEO","NEOG","NET","NEU","NEXT","NFG","NFLX","NG","NHI","NI","NIO","NKE","NKTR","NLY","NNE","NNN","NOC","NOG","NOK","NOV","NOVT","NOW","NPO","NRG","NRGV","NSA","NSC","NSIT","NTAP","NTLA","NTNX","NTR","NTRA","NTRS","NTSK","NU","NUAI","NUE","NUVL","NVAX","NVD","NVDA","NVDQ","NVMI","NVO","NVST","NVT","NVTS","NWG","NWL","NWS","NWSA","NXE","NXPI","NXST","NXT","NYT","O","OBDC","OC","OCUL","ODFL","OGE","OGN","OGS","OHI","OII","OKE","OKLL","OKLO","OKTA","OLED","OLLI","OLN","OMC","OMF","ON","ONB","ONDS","ONON","ONTO","OPCH","OPEN","OPLN","ORA","ORC","ORCL","ORCX","ORI","ORKA","ORLA","ORLY","OSCR","OSIS","OSK","OSS","OTEX","OTIS","OUST","OUT","OVV","OWL","OXY","OZK","P","PAA","PAAS","PAG","PAGP","PAGS","PANW","PAR","PARA","PARR","PATH","PATK","PAYC","PAYX","PB","PBA","PBF","PBI","PBR","PBR.A","PCAR","PCG","PCOR","PCT","PCTY","PCVX","PD","PDBC","PDD","PEAK","PEB","PEG","PEGA","PEN","PENG","PENN","PEP","PFE","PFG","PFGC","PFSI","PG","PGR","PGX","PGY","PH","PHG","PHIN","PHM","PHR","PHYS","PI","PII","PINS","PIPR","PJT","PK","PKG","PL","PLAB","PLD","PLMR","PLNT","PLTD","PLTR","PLTU","PLUG","PLXS","PM","PMT","PNC","PNFP","PNR","PNW","PODD","POET","PONY","POOL","POR","POST","POWI","POWL","PPC","PPG","PPL","PPTA","PR","PRAX","PRGO","PRI","PRIM","PRKS","PRM","PRMB","PRU","PSA","PSIX","PSKY","PSMT","PSN","PSQ","PSX","PTC","PTCT","PTEN","PTGX","PTIR","PTON","PUMP","PURR","PVH","PVLA","PWR","PYPL","PZZA","Q","QBTS","QCOM","QDEL","QGEN","QLYS","QQQ","QQQI","QQQM","QRVO","QS","QSR","QUBT","QURE","QXO","R","RACE","RAL","RARE","RBA","RBC","RBLX","RBRK","RCAT","RCI","RCL","RCUS","RDDT","RDN","RDNT","RDW","REAL","REET","REG","REGN","RELX","RELY","REXR","REYN","RF","RGA","RGEN","RGLD","RGTI","RGTZ","RH","RHI","RHP","RIG","RIO","RIOT","RITM","RIVN","RJF","RKLB","RKLX","RKT","RL","RLAY","RLI","RLJ","RMBS","RMD","RNG","RNR","ROAD","ROG","ROIV","ROK","ROKU","ROL","ROP","ROST","RPD","RPM","RPRX","RR","RRC","RRR","RRX","RS","RSG","RSI","RSP","RTX","RUN","RUSHA","RVLV","RVMD","RVTY","RWM","RXO","RXRX","RY","RYAN","RYN","RYTM","RZLV","S","SAIA","SAIC","SAIL","SAM","SAN","SANM","SAP","SARO","SATL","SATS","SBAC","SBET","SBLK","SBRA","SBSW","SBUX","SCCO","SCHB","SCHE","SCHF","SCHG","SCHH","SCHI","SCHO","SCHP","SCHR","SCHV","SCHW","SCHX","SCI","SDOW","SE","SEDG","SEI","SEIC","SERV","SEZL","SF","SFM","SG","SGHC","SGI","SGML","SGOL","SGOV","SGRY","SH","SHAK","SHC","SHEL","SHLD","SHLS","SHO","SHOO","SHOP","SHV","SHW","SHYG","SIDU","SIG","SIGI","SII","SILA","SILJ","SIRI","SITE","SITM","SIVR","SJM","SJNK","SKT","SKY","SKYT","SLAB","SLB","SLDP","SLF","SLG","SLM","SLNO","SLP","SM","SMCI","SMCX","SMFG","SMG","SMMT","SMPL","SMR","SMTC","SMX","SN","SNA","SNAP","SNDK","SNDR","SNDX","SNEX","SNOW","SNPS","SNX","SNXX","SNY","SO","SOBO","SOFI","SOLS","SOLV","SON","SONY","SOUN","SPAB","SPB","SPCX","SPDN","SPDW","SPG","SPGI","SPHR","SPHY","SPIB","SPIR","SPLB","SPLV","SPMO","SPOT","SPSB","SPSM","SPTI","SPTL","SPXC","SPXU","SPY","SPYG","SPYI","SPYM","SPYV","SQ","SQM","SR","SRAD","SRE","SRLN","SRPT","SRRK","SSB","SSD","SSL","SSNC","SSRM","ST","STAA","STAG","STE","STEP","STLA","STLD","STM","STN","STNE","STNG","STRC","STRL","STT","STUB","STWD","STX","STZ","SU","SUI","SUN","SUNB","SUNC","SUPN","SUZ","SVM","SW","SWK","SWKS","SWX","SXT","SYF","SYK","SYM","SYNA","SYRE","SYY","T","TAC","TAK","TAL","TALO","TAP","TARS","TBIL","TBLA","TCBI","TD","TDC","TDG","TDOC","TDW","TDY","TE","TEAM","TECH","TECK","TEL","TEM","TENB","TER","TERN","TETH","TEVA","TEX","TFC","TFII","TFLO","TFX","TGB","TGT","TGTX","THC","THG","THO","THR","TIC","TIGO","TIGR","TIP","TJX","TKO","TKR","TLH","TLN","TLRY","TMC","TMDX","TME","TMHC","TMO","TMUS","TNC","TNDM","TNGX","TNL","TOL","TOST","TPC","TPG","TPH","TPL","TPR","TREX","TRGP","TRI","TRIN","TRIP","TRMB","TRMD","TROW","TROX","TRP","TRU","TRV","TSCO","TSDD","TSEM","TSL","TSLA","TSLG","TSLQ","TSLT","TSLX","TSLZ","TSM","TSN","TT","TTAN","TTC","TTD","TTE","TTEK","TTI","TTMI","TTWO","TU","TVTX","TW","TWLO","TWST","TXG","TXN","TXNM","TXRH","TXT","TYL","U","UAA","UAL","UAMY","UBER","UBS","UCTT","UDOW","UDR","UEC","UFPI","UFPT","UGI","UGL","UGP","UGRO","UHS","UL","ULCC","ULS","ULTA","UMAC","UMBF","UMC","UNF","UNH","UNIT","UNM","UNP","UPS","UPST","UPWK","URA","URBN","URGN","URI","USAR","USAS","USB","USFD","USFR","USHY","UTHR","UTI","UUUU","UWMC","V","VAC","VAL","VALE","VC","VCIT","VCLT","VCSH","VCTR","VCX","VCYT","VECO","VEEV","VERA","VET","VFC","VG","VGIT","VGK","VGNT","VGSH","VIAV","VICI","VICR","VIK","VIRT","VISN","VITL","VKTX","VLO","VLTO","VLY","VMC","VMI","VNET","VNO","VNOM","VNT","VOD","VOYA","VOYG","VRDN","VRNS","VRSK","VRSN","VRT","VRTX","VSAT","VSCO","VSEC","VSH","VSNT","VST","VT","VTEB","VTR","VTRS","VTWO","VVV","VVX","VXUS","VZ","W","WAB","WAL","WAT","WAY","WBD","WBS","WCC","WCN","WDAY","WDC","WEAT","WEC","WELL","WEN","WERN","WES","WEX","WFC","WFRD","WGS","WH","WHR","WING","WIX","WK","WLK","WM","WMB","WMG","WMS","WMT","WOLF","WPC","WPM","WRB","WRBY","WRD","WSC","WSM","WSO","WSR","WST","WT","WTFC","WTRG","WTS","WTTR","WTW","WU","WULF","WWD","WY","WYNN","XE","XEL","XENE","XIFR","XLC","XME","XMTR","XNDU","XOM","XOVR","XP","XPEV","XPO","XRAY","XYL","XYZ","YETI","YINN","YLD","YMM","YOU","YSS","YUM","YUMC","Z","ZBH","ZBRA","ZETA","ZG","ZIM","ZION","ZM","ZNTL","ZS","ZSL","ZTS","ZWS"];

// ──────────────────────────────────────────
// HTTP + Redis helpers (same pattern as signum-harvest)
// ──────────────────────────────────────────

async function httpsGet(url, timeoutMs) {
  // ── [2026-08-29] Intrinio 라우팅 ──────────────────────────────
  // Massive 계정이 약관 위반으로 차단(시세 403). 대응 가능한 요청은 Intrinio 로.
  // 뉴스(/v2/reference/news)는 어댑터가 undefined 를 돌려주므로 아래 기존 경로로 간다.
  // 정본: .agent/INTRINIO_MIGRATION.md
  //
  // ⚠️ [2026-08-30] 이 라우팅에 **타임아웃이 없었다.**
  //   아래 https.get 경로만 timeoutMs 로 보호되고, 이관 때 앞에 끼워 넣은
  //   이 호출은 무한정 매달릴 수 있었다. 그러면 배치의 Promise.all 이
  //   영원히 안 끝나고 Lambda 가 **900초 한도까지 타서 강제 종료**된다.
  //   실측(signum-harvest): [FlowWarm] 450/506 에서 멈춘 채
  //   Duration 900000.00 ms 로 매 실행이 죽었고, 그 뒤 단계인
  //   cache:analysis 쓰기까지 못 가서 분석 캐시가 **37시간** 묵었다.
  //   → 기존 경로와 같은 예산으로 감싼다.
  try {
    // 라우팅은 내부에서 **여러 번** 호출한다(옵션 체인 = 만기목록 1 + 체인 6).
    //   호출부의 단건 예산(8~12초)을 그대로 쓰면 정상 요청까지 죽는다
    //   (실측: 예산 12초로 걸었더니 GEX 99종목이 전부 ROUTE_TIMEOUT).
    //   무한 대기만 막으면 되므로 넉넉하되 **유한한** 상한을 준다.
    const __budget = Math.max(timeoutMs || 15000, 60000);
    const __routed = await Promise.race([
      __intrinio.routeMassiveUrl(url),
      new Promise((_, rj) => setTimeout(() => rj(new Error('ROUTE_TIMEOUT')), __budget)),
    ]);
    if (__routed !== undefined) return __routed;
  } catch (__e) {
    console.warn('[Intrinio] route fail:', __e && __e.message);
  }

  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs || 15000);
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-FLOW/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', (e) => { clearTimeout(to); reject(e); });
  });
}

// HTTP GET helper for EC2 proxy — /get·/mget 은 GET + 쿼리스트링이다.
// (POST 인 /set·/setnx·/mset 과 메서드가 다르다. 섞으면 라우트에 안 걸린다.)
function ec2ProxyGet(pathWithQuery, timeoutMs) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(EC2_PROXY_URL + pathWithQuery); } catch { return resolve(null); }
    const req = http.get({
      hostname: parsed.hostname,
      port: parsed.port || 8081,
      path: parsed.pathname + parsed.search,
      headers: { 'Authorization': 'Bearer ' + EC2_PROXY_KEY },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    const to = setTimeout(() => { req.destroy(); resolve(null); }, timeoutMs || 3000);
    req.on('error', () => { clearTimeout(to); resolve(null); });
    req.on('close', () => clearTimeout(to));
  });
}

// HTTP POST helper for EC2 proxy (HTTP, not HTTPS)
function ec2ProxyPost(path, body, timeoutMs) {
  return new Promise((resolve) => {
    const parsed = new URL(EC2_PROXY_URL + path);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 8081,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + EC2_PROXY_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const to = setTimeout(() => resolve(null), timeoutMs || 3000);
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(to);
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => { clearTimeout(to); resolve(null); });
    req.write(body);
    req.end();
  });
}

async function redisSet(key, value, ttl) {
  // 1st: EC2 Proxy /set (internal VPC, zero Upstash cost)
  try {
    const result = await ec2ProxyPost('/set', JSON.stringify({ key, value, ttl }), 3000);
    if (result && result.ok) return true;
  } catch {}

  // 2nd: Upstash fallback
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return false;
  try {
    const body = JSON.stringify(['SET', key, JSON.stringify(value), 'EX', String(ttl)]);
    const url = new URL(UPSTASH_URL);
    const options = {
      hostname: url.hostname, port: 443, path: '/', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + UPSTASH_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(true));
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => { req.destroy(); resolve(false); });
      req.write(body);
      req.end();
    });
  } catch { return false; }
}

// Redis GET — EC2 Proxy 우선, Upstash 폴백
//
// ⚠️ [2026-09-02 실측으로 발견 — 슬라이스 커서가 영원히 0 이던 원인]
//   redisSet 은 ① EC2 프록시 ② Upstash 순서로 «쓰는데», redisGet 은
//   Upstash 만 «읽고» 있었다. 프록시가 정상이면 커서는 프록시에 저장되고
//   읽기는 Upstash 를 보므로 항상 null → `Number(null)||0` → cursor=0.
//   결과: 매 실행이 슬라이스 0-119 만 돌아 2,001종목 중 앞 120개만
//   반복 수집됐다(샤드 4개 합쳐 실제 커버리지 480종목).
//   실측: flow-harvest:cursor:{all,0,1,2,3} 5개 전부 null.
//   → 쓰기와 읽기가 «같은 경로 순서»를 보게 맞춘다.
async function redisGet(key) {
  // 1st: EC2 Proxy (redisSet 의 1순위와 동일 저장소)
  //   ⚠️ 프록시의 /get 은 **GET + 쿼리스트링**이다(`GET /get?key=xxx`).
  //      /set·/setnx 처럼 POST 로 부르면 라우트에 안 걸린다 — 실물 확인함.
  //      응답은 `{ result: <값 | null> }` 이고 값은 이미 JSON.parse 된 상태다.
  try {
    const r = await ec2ProxyGet('/get?key=' + encodeURIComponent(key), 3000);
    if (r && r.result !== undefined && r.result !== null) return r.result;
  } catch { /* 프록시 실패 시 Upstash 로 */ }

  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const body = JSON.stringify(['GET', key]);
    const url = new URL(UPSTASH_URL);
    const options = {
      hostname: url.hostname, port: 443, path: '/', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + UPSTASH_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.result) {
              try { resolve(JSON.parse(parsed.result)); } catch { resolve(parsed.result); }
            } else { resolve(null); }
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(5000, () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });
  } catch { return null; }
}

// Batch Redis pipeline — EC2 Proxy /mset first, Upstash /pipeline fallback
async function redisPipeline(commands) {
  // Extract SET commands for EC2 /mset
  const setCommands = commands.filter(c => c[0] === 'SET');

  if (setCommands.length > 0) {
    try {
      const items = setCommands.map(c => {
        let value;
        try { value = JSON.parse(c[2]); } catch { value = c[2]; }
        const ttl = c.length >= 5 ? parseInt(c[4]) : undefined;
        return { key: c[1], value, ttl };
      });
      const result = await ec2ProxyPost('/mset', JSON.stringify({ items }), 5000);
      if (result && result.ok) return commands.length;
    } catch {}
  }

  // Fallback: Upstash pipeline
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return 0;
  try {
    const body = JSON.stringify(commands);
    const url = new URL(UPSTASH_URL + '/pipeline');
    const options = {
      hostname: url.hostname, port: 443, path: '/pipeline', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + UPSTASH_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(commands.length));
      });
      req.on('error', () => resolve(0));
      req.setTimeout(5000, () => { req.destroy(); resolve(0); });
      req.write(body);
      req.end();
    });
  } catch { return 0; }
}

// ──────────────────────────────────────────
// Exchange name helper — matches dark-pool-trades route L41-49
// ──────────────────────────────────────────
function getExchangeName(exchangeId) {
  switch (exchangeId) {
    case 4: return 'FINRA ADF';
    case 15: return 'FINRA TRF (NYSE)';
    case 16: return 'FINRA TRF (Nasdaq)';
    case 19: return 'FINRA ORF';
    default: return 'Exchange ' + exchangeId;
  }
}

function formatTimeET(timestamp) {
  const date = new Date(timestamp / 1000000);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'America/New_York'
  });
}

// Binary search for nearest quote — matches both Vercel routes exactly
function findNearestQuote(quotes, targetTs) {
  if (quotes.length === 0) return null;
  let lo = 0, hi = quotes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midTs = BigInt(quotes[mid].sip_timestamp);
    if (midTs < targetTs) lo = mid + 1;
    else hi = mid;
  }
  let best = lo;
  if (lo > 0) {
    const diffLo = targetTs - BigInt(quotes[lo - 1].sip_timestamp);
    const diffHi = BigInt(quotes[lo].sip_timestamp) - targetTs;
    if ((diffLo < BigInt(0) ? -diffLo : diffLo) < (diffHi < BigInt(0) ? -diffHi : diffHi)) {
      best = lo - 1;
    }
  }
  return quotes[best];
}

// ──────────────────────────────────────────
// Step 0: Options Snapshot Raw Cache
// Fetches Polygon options snapshot (probe 35 DTE + exact weekly) and stores RAW in Redis.
// Vercel's CentralDataHub._fetchOptionsChain() & structureService check this cache first.
// ALL calculation logic stays in Vercel — Lambda only caches the raw API response.
// ──────────────────────────────────────────
async function fetchOptionsSnapshotRaw(ticker) {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 35);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    // Phase 1: Probe — same params as CentralDataHub._fetchOptionsChain L416-422
    const probeUrl = 'https://api.polygon.io/v3/snapshot/options/' + ticker
      + '?limit=250&expiration_date.gte=' + todayStr
      + '&expiration_date.lte=' + maxDateStr
      + '&sort=expiration_date&order=asc'
      + '&apiKey=' + POLYGON_KEY;

    let probeResults = [];
    let url = probeUrl;
    let pages = 0;
    while (url && pages < 20) {
      const data = await httpsGet(url, 12000).catch(() => null);
      if (!data || !data.results) break;
      probeResults = probeResults.concat(data.results);
      url = data.next_url ? (data.next_url + (data.next_url.includes('apiKey') ? '' : '&apiKey=' + POLYGON_KEY)) : null;
      pages++;
    }

    if (probeResults.length === 0) return false;

    // Find weekly expiry — same logic as findWeeklyExpirationSync in holidayCache.ts
    const expirations = [...new Set(probeResults.map(c => c.details?.expiration_date).filter(Boolean))].sort();
    let weeklyExpiry = expirations[0] || '';
    // Find first Friday
    const fridayExp = expirations.find(exp => new Date(exp + 'T12:00:00').getDay() === 5);
    if (fridayExp) weeklyExpiry = fridayExp;
    else {
      // Find first Thursday (holiday-shifted week)
      const thursdayExp = expirations.find(exp => new Date(exp + 'T12:00:00').getDay() === 4);
      if (thursdayExp) weeklyExpiry = thursdayExp;
    }

    // Phase 2: Exact weekly — same as CentralDataHub L448-454
    let exactResults = [];
    if (weeklyExpiry) {
      let exactUrl = 'https://api.polygon.io/v3/snapshot/options/' + ticker
        + '?limit=250&expiration_date=' + weeklyExpiry
        + '&apiKey=' + POLYGON_KEY;
      let exactPages = 0;
      while (exactUrl && exactPages < 20) {
        const data = await httpsGet(exactUrl, 12000).catch(() => null);
        if (!data || !data.results) break;
        exactResults = exactResults.concat(data.results);
        exactUrl = data.next_url ? (data.next_url + (data.next_url.includes('apiKey') ? '' : '&apiKey=' + POLYGON_KEY)) : null;
        exactPages++;
      }
    }

    // [COST OPT] Slim contract — keep ONLY fields used by Vercel's structureService + centralDataHub
    // Full field mapping verified by scripts/test_field_extraction.js (7 tickers, 100% calculation match)
    // structureService: details.strike_price, contract_type, expiration_date, open_interest,
    //   greeks.gamma, greeks.implied_volatility, implied_volatility, day.volume/v,
    //   last_trade.price/p, last_quote.midpoint, day.close, day.previous_close, details.close_price/prev_close
    // centralDataHub: same fields + details.contract_type for MaxPain/callWall/putFloor
    function slimContract(c) {
      return {
        details: {
          strike_price: c.details?.strike_price,
          contract_type: c.details?.contract_type,
          expiration_date: c.details?.expiration_date,
          close_price: c.details?.close_price,
          prev_close: c.details?.prev_close,
        },
        strike_price: c.strike_price,
        contract_type: c.contract_type,
        open_interest: c.open_interest,
        implied_volatility: c.implied_volatility,
        greeks: c.greeks ? {
          gamma: c.greeks.gamma,
          implied_volatility: c.greeks.implied_volatility,
        } : undefined,
        day: c.day ? {
          volume: c.day.volume,
          v: c.day.v,
          close: c.day.close,
          previous_close: c.day.previous_close,
        } : undefined,
        last_trade: c.last_trade ? {
          price: c.last_trade.price,
          p: c.last_trade.p,
        } : undefined,
        last_quote: c.last_quote ? {
          midpoint: c.last_quote.midpoint,
        } : undefined,
      };
    }

    // Store SLIMMED in Redis — Vercel reads this and does ALL calculations
    // [COST OPT] ~70% size reduction (verified: 1214KB→356KB for NVDA)
    const cachePayload = {
      probeResults: probeResults.map(slimContract),
      exactResults: exactResults.map(slimContract),
      expirations,      // available expiration dates
      weeklyExpiry,     // detected weekly expiration
      _ts: Date.now(),
      _ticker: ticker,
      _source: 'lambda-flow-harvest',
    };

    await redisSet('polygon:snapshot:probe:' + ticker, cachePayload, getEffectiveTTL(OPTIONS_SNAPSHOT_TTL));

    return true;
  } catch (e) {
    console.log('[flow-harvest] options-snapshot err ' + ticker + ': ' + e.message);
    return false;
  }
}

// ──────────────────────────────────────────
// Step 1: Realtime Metrics — matches /api/flow/realtime-metrics EXACTLY
// Returns { metrics, quotes } so dark pool can reuse quotes (save 1 API call per ticker)
// ──────────────────────────────────────────
async function fetchRealtimeMetrics(ticker) {
  // ══════════════════════════════════════════════════════════════
  // [2026-08-29] 다크풀/공매도 수집 중단 — Massive 차단
  //   /v3/trades·/v3/quotes 는 HTTP 200 이지만 status:"DELAYED" 로 19시간 전 데이터,
  //   short-volume 은 date "2024-02-06"(2년 전)을 준다.
  //   이 Lambda 가 그 값으로 계산한 darkPool 을 signum-flow-history(DynamoDB)에
  //   15분마다 새 타임스탬프로 기록해, Vercel 의 나이 검사마저 무력화시키고 있었다.
  //   (command/unified 가 _source: flow-history-recovery 로 63.8%/93.2% 를 노출)
  //   → 소스 자체를 끊는다. ENABLE_MASSIVE_TICKS=1 로만 복구.
  // ══════════════════════════════════════════════════════════════
  if (process.env.ENABLE_MASSIVE_TICKS !== '1') return null;

  try {
    // Parallel: trades 5K + quotes 1K + short-volume (matches Vercel route L51-54, L223)
    const [tradesRes, quotesRes, shortRes] = await Promise.all([
      httpsGet('https://api.polygon.io/v3/trades/' + ticker + '?limit=5000&apiKey=' + POLYGON_KEY, 12000),
      httpsGet('https://api.polygon.io/v3/quotes/' + ticker + '?limit=1000&order=desc&apiKey=' + POLYGON_KEY, 8000),
      httpsGet('https://api.polygon.io/stocks/v1/short-volume?ticker=' + ticker + '&limit=1&apiKey=' + POLYGON_KEY, 8000),
    ]);

    const trades = tradesRes?.results || [];
    if (trades.length === 0) return { metrics: null, quotes: [] };

    // Parse quotes for Quote Rule — sort ascending by timestamp for binary search (matches L70-74)
    const quotesRaw = quotesRes?.results || [];
    const quotes = quotesRaw.sort((a, b) => {
      const ta = BigInt(a.sip_timestamp);
      const tb = BigInt(b.sip_timestamp);
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    let totalVolume = 0, darkPoolVolume = 0, blockTrades = 0, blockVolume = 0;
    let largestTrade = { size: 0, price: 0 };
    let dpBuyVol = 0, dpSellVol = 0, dpNeutralVol = 0;
    let dpBuyVal = 0, dpSellVal = 0;

    for (const trade of trades) {
      const size = trade.size || 0;
      const price = trade.price || 0;
      const exchangeId = trade.exchange;
      totalVolume += size;

      if (DARK_POOL_EXCHANGES.has(exchangeId)) {
        darkPoolVolume += size;
        // Quote Rule classification (matches L122-134)
        if (quotes.length > 0) {
          const bestQ = findNearestQuote(quotes, BigInt(trade.sip_timestamp));
          if (bestQ && bestQ.bid_price > 0 && bestQ.ask_price > 0) {
            const mid = (bestQ.bid_price + bestQ.ask_price) / 2;
            if (price >= bestQ.ask_price) { dpBuyVol += size; dpBuyVal += size * price; }
            else if (price <= bestQ.bid_price) { dpSellVol += size; dpSellVal += size * price; }
            else if (price > mid) { dpBuyVol += size; dpBuyVal += size * price; }
            else if (price < mid) { dpSellVol += size; dpSellVal += size * price; }
            else { dpNeutralVol += size; }
          } else { dpNeutralVol += size; }
        }
      }

      if (size >= BLOCK_TRADE_MIN || (size * price) >= 200000) { blockTrades++; blockVolume += size; }
      if (size > largestTrade.size) { largestTrade = { size, price }; }
    }

    const darkPoolPercent = totalVolume > 0 ? (darkPoolVolume / totalVolume) * 100 : 0;
    const avgTradeSize = trades.length > 0 ? totalVolume / trades.length : 0;
    const dpTotal = dpBuyVol + dpSellVol + dpNeutralVol;
    const buyPct = dpTotal > 0 ? Math.round((dpBuyVol / dpTotal) * 1000) / 10 : 0;
    const sellPct = dpTotal > 0 ? Math.round((dpSellVol / dpTotal) * 1000) / 10 : 0;

    // Bid-Ask from latest quote (matches L182-217)
    let bidAsk = null;
    if (quotesRaw.length > 0) {
      const latestQ = quotesRaw[0]; // already desc order
      const bid = latestQ.bid_price || 0;
      const ask = latestQ.ask_price || 0;
      const spread = ask - bid;
      let spreadLabel = '보통';
      if (spread <= 0.01) spreadLabel = '매우 타이트';
      else if (spread <= 0.05) spreadLabel = '타이트';
      else if (spread <= 0.20) spreadLabel = '보통';
      else spreadLabel = '넓음';
      bidAsk = { spread: Math.round(spread * 100) / 100, bid, ask, label: spreadLabel };
    }

    // Short Volume (matches L220-249)
    let shortVolume = null;
    const svResult = shortRes?.results?.[0];
    if (svResult) {
      const sv = svResult.short_volume || 0;
      const tv = svResult.total_volume || 1;
      shortVolume = {
        percent: Math.round((sv / tv) * 1000) / 10,
        volume: sv,
        totalVolume: tv,
      };
    }

    // Build response — EXACTLY matches Vercel buildResponse() L252-286
    return {
      metrics: {
        ticker,
        timestamp: new Date().toISOString(),
        _ts: Date.now(),
        darkPool: {
          percent: Math.round(darkPoolPercent * 10) / 10,
          volume: darkPoolVolume,
          totalVolume,
          buyPct, sellPct,
          buyVolume: dpBuyVol, sellVolume: dpSellVol,
          buyVwap: dpBuyVol > 0 ? Math.round((dpBuyVal / dpBuyVol) * 100) / 100 : 0,
          sellVwap: dpSellVol > 0 ? Math.round((dpSellVal / dpSellVol) * 100) / 100 : 0,
          netBuyValue: Math.round(dpBuyVal - dpSellVal),
        },
        blockTrade: {
          count: blockTrades,
          volume: blockVolume,
          largestTrade,
        },
        bidAsk,
        shortVolume,
      },
      quotes, // return for reuse by dark pool
    };
  } catch (e) {
    console.log('[flow-harvest] rt-metrics err ' + ticker + ': ' + e.message);
    return { metrics: null, quotes: [] };
  }
}

// ──────────────────────────────────────────
// Step 2: Dark Pool Trades — matches /api/flow/dark-pool-trades EXACTLY
// ──────────────────────────────────────────
async function fetchDarkPoolTrades(ticker, quotes) {
  // [2026-08-29] 위와 동일 — Massive 틱 차단으로 수집 중단
  if (process.env.ENABLE_MASSIVE_TICKS !== '1') return null;

  try {
    // Fetch trades 10K desc (matches Vercel L124-126)
    const tradesRes = await httpsGet('https://api.polygon.io/v3/trades/' + ticker + '?limit=10000&order=desc&apiKey=' + POLYGON_KEY, 12000);
    const trades1 = tradesRes?.results || [];

    const rawBlockTrades = [];
    const stats = { totalDarkPoolVolume: 0, totalDarkPoolValue: 0, totalVolume: 0 };

    function processTradesPage(trades) {
      for (const trade of trades) {
        const exchangeId = trade.exchange;
        const conditions = trade.conditions || [];
        const size = trade.size || 0;
        const price = trade.price || 0;
        stats.totalVolume += size;

        const isDarkExchange = DARK_POOL_EXCHANGES.has(exchangeId);
        const hasDarkCondition = conditions.some(c => DARK_POOL_CONDITIONS.has(c));

        if (isDarkExchange || hasDarkCondition) {
          stats.totalDarkPoolVolume += size;
          stats.totalDarkPoolValue += size * price;
          // [FIX] Align with Vercel SEC Threshold: ≥10,000 shares OR ≥$200,000 premium
          if (size >= BLOCK_TRADE_MIN || (size * price) >= 200000) {
            rawBlockTrades.push({ trade, exchangeId, conditions, size, price });
          }
        }
      }
    }

    processTradesPage(trades1);
    let tradesScanned = trades1.length;

    // Page 2: follow next_url (matches Vercel L178-191)
    if (tradesRes?.next_url) {
      try {
        const data2 = await httpsGet(tradesRes.next_url + '&apiKey=' + POLYGON_KEY, 10000);
        if (data2?.results) {
          processTradesPage(data2.results);
          tradesScanned += data2.results.length;
        }
      } catch {}
    }

    // Classify block trades using Quote Rule (matches Vercel L193-206)
    const items = rawBlockTrades.map(({ trade, exchangeId, conditions, size, price }) => {
      let side = 'NEUTRAL';
      if (quotes && quotes.length > 0) {
        const bestQ = findNearestQuote(quotes, BigInt(trade.sip_timestamp));
        if (bestQ && bestQ.bid_price > 0 && bestQ.ask_price > 0) {
          const mid = (bestQ.bid_price + bestQ.ask_price) / 2;
          if (price >= bestQ.ask_price) side = 'BUY';
          else if (price <= bestQ.bid_price) side = 'SELL';
          else if (price > mid) side = 'BUY';
          else if (price < mid) side = 'SELL';
        }
      }
      return {
        id: 'dp-' + trade.sip_timestamp + '-' + size,
        price, size,
        timestamp: trade.sip_timestamp,
        timeET: formatTimeET(trade.sip_timestamp),
        exchange: exchangeId,
        exchangeName: getExchangeName(exchangeId),
        premium: size * price,
        conditions,
        isBlock: true,
        side,
        type: 'DARK_POOL',
      };
    });

    items.sort((a, b) => b.timestamp - a.timestamp);
    const topItems = items.slice(0, 50); // default limit

    // Build response — EXACTLY matches Vercel L211-224
    return {
      ticker,
      timestamp: new Date().toISOString(),
      _ts: Date.now(),
      totalDarkPoolVolume: stats.totalDarkPoolVolume,
      totalDarkPoolValue: Math.round(stats.totalDarkPoolValue),
      totalVolume: stats.totalVolume,
      darkPoolPercent: stats.totalVolume > 0
        ? Math.round((stats.totalDarkPoolVolume / stats.totalVolume) * 1000) / 10
        : 0,
      tradeCount: items.length,
      tradesScanned,
      items: topItems,
    };
  } catch (e) {
    console.log('[flow-harvest] darkpool err ' + ticker + ': ' + e.message);
    return null;
  }
}

// ──────────────────────────────────────────
// Per-ticker harvest: fetch all flow data and save to Redis
// ──────────────────────────────────────────
async function harvestTicker(ticker) {
  try {
    // Step 0: Options Snapshot Raw Cache (Polygon → Redis raw)
    // Vercel reads this and skips slow Polygon direct calls
    const snapshotOk = await fetchOptionsSnapshotRaw(ticker);

    // Step 1: Realtime Metrics (trades 5K + quotes 1K + short-volume) — 3 API calls
    //
    // ⚠️ [2026-08-29] 이 세 엔드포인트(/v3/trades · /v3/quotes · short-volume)는
    //    Intrinio 스타트업 플랜에 **없다**. 어댑터가 빈 결과를 돌려주므로
    //    rtMetrics 는 항상 null 이다.
    //    예전 코드는 여기서 `return ok:false` 로 **종목 전체를 포기**했고,
    //    그 결과 2,001종목 전건 실패 + `cache:flow:unified` 가 하나도 안 써져
    //    Flow 페이지 SSR 이 매번 캐시 미스가 됐다(실측).
    //    다크풀이 없다고 옵션 구조까지 버릴 이유는 없다 → **가능한 것만 쓴다.**
    // ⚠️ fetchRealtimeMetrics 는 실패 시 객체가 아니라 **null** 을 돌려준다.
    //    바로 구조분해하면 TypeError 가 나고 catch 가 삼켜 «조용한 전건 실패»가 된다.
    const rtRes = (await fetchRealtimeMetrics(ticker)) || {};
    const rtMetrics = rtRes.metrics || null;
    const quotes = rtRes.quotes || null;
    const degraded = !rtMetrics;
    // 옵션 스냅샷조차 못 받았으면 그때는 쓸 게 없다
    if (degraded && !snapshotOk) return { ticker, ok: false, reason: 'no-data' };

    // Step 2: Dark Pool Trades (trades 10K + next_url) — reuse quotes from Step 1
    const darkPool = await fetchDarkPoolTrades(ticker, quotes);

    // Step 3: Build cache:flow:unified — EXACTLY matches Vercel /api/flow/unified L52-59
    const flowUnified = {
      liveQuote: null,    // Flow 페이지는 별도 SWR로 가격 호출 — 가격 warm 금지
      whaleTrades: null,  // Client will fetch independently (Progressive Loading)
      darkPoolTrades: darkPool ? darkPool.items : [],
      darkPoolStats: darkPool ? {
        totalDarkPoolVolume: darkPool.totalDarkPoolVolume,
        totalVolume: darkPool.totalVolume,
        darkPoolPercent: darkPool.darkPoolPercent,
        tradesScanned: darkPool.tradesScanned,
      } : null,
      realtimeMetrics: rtMetrics || { darkPool: null, shortVolume: null, bidAsk: null, blockTrade: null },
      timestamp: Date.now(),
      _source: degraded ? 'lambda-flow-harvest:degraded' : 'lambda-flow-harvest',
      // 다크풀/공매도 계열이 «없음»인지 «0»인지 소비처가 구분할 수 있게 명시
      _unavailable: degraded ? ['darkPool', 'shortVolume', 'blockTrade', 'bidAsk'] : undefined,
    };

    // Step 4: Save to Redis — pipeline for efficiency
    // [V3.0 HYBRID FIX] REMOVED blind pushes for 'rt-metrics' and 'darkpool' to stop Upstash CPU/Cost bleeding.
    // These ephemeral live ticks are now handled exclusively via Vercel On-Demand SWR caching.
    // Preserved: cache:flow:unified (Required for UI structure)
    const commands = [
      ['SET', 'cache:flow:unified:' + ticker, JSON.stringify(flowUnified), 'EX', String(getEffectiveTTL(FLOW_UNIFIED_TTL))],
    ];
    await redisPipeline(commands);

    // Step 5: Save to DynamoDB (Tier 2 fallback)
    //
    // ⚠️ degraded(다크풀/공매도 미제공) 상태에서는 **쓰지 않는다.**
    //    두 가지 이유가 있다.
    //    ① rtMetrics 가 null 인데 `rtMetrics.darkPool?.` 처럼 앞쪽에 가드가 없어
    //       TypeError 가 났고, catch 가 삼켜 «조용한 전건 실패»로 보였다.
    //    ② 더 중요한 이유: 여기에 0 을 **새 타임스탬프로** 쓰면
    //       signum-flow-history(3천만 건)가 «방금 갱신된 0» 으로 덮인다.
    //       그건 예전에 다크풀 stale 값이 되살아나 나이 검사까지 무력화시켰던
    //       바로 그 경로다. 없는 데이터는 «0» 이 아니라 «없음» 이어야 한다.
    if (rtMetrics) {
      await client.send(new PutCommand({
        TableName: 'signum-flow-history',
        Item: {
          ticker,
          timestamp: Date.now(),
          darkPoolPercent: rtMetrics.darkPool?.percent || 0,
          shortVolPercent: rtMetrics.shortVolume?.percent || 0,
          blockTradeCount: rtMetrics.blockTrade?.count || 0,
          buyPct: rtMetrics.darkPool?.buyPct || 0,
          sellPct: rtMetrics.darkPool?.sellPct || 0,
          _source: 'lambda-flow-harvest',
        }
      })).catch(() => {});
    }

    return { ticker, ok: true };
  } catch (e) {
    return { ticker, ok: false, reason: e.message };
  }
}

// ──────────────────────────────────────────
// Distributed Lock — prevent concurrent executions
// Redis key expires after 900s (matches Lambda timeout) as safety net
// ──────────────────────────────────────────
// LOCK_KEY is now per-shard (set in handler based on event.shard)
let LOCK_KEY = 'flow-harvest:lock';
// ⚠️ 락 TTL 은 «실제 실행 시간»에 맞춰야 한다. 900s 로 두면 한 번 비정상
//    종료했을 때 5분 스케줄이 3사이클(15분) 통째로 막힌다.
//    슬라이스 도입으로 한 실행이 4분 예산 안에서 끝나므로 그에 맞춘다.
const LOCK_TTL = Number(process.env.FLOW_LOCK_TTL || 330); // seconds

async function acquireLock() {
  // Try EC2 proxy first (uses SET NX EX pattern)
  try {
    const lockValue = Date.now().toString();
    const result = await ec2ProxyPost('/setnx', JSON.stringify({ key: LOCK_KEY, value: lockValue, ttl: LOCK_TTL }), 3000);
    if (result && result.ok) return true;
    if (result && result.exists) return false; // another instance holds the lock
  } catch {}

  // Fallback: Upstash SET NX EX
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return true; // no Redis = allow run (safe default)
  try {
    const body = JSON.stringify(['SET', LOCK_KEY, Date.now().toString(), 'NX', 'EX', String(LOCK_TTL)]);
    const url = new URL(UPSTASH_URL);
    const options = {
      hostname: url.hostname, port: 443, path: '/', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + UPSTASH_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.result === 'OK'); // 'OK' = acquired, null = already locked
          } catch { resolve(true); }
        });
      });
      req.on('error', () => resolve(true)); // on error, allow run (safe default)
      req.setTimeout(3000, () => { req.destroy(); resolve(true); });
      req.write(body);
      req.end();
    });
  } catch { return true; }
}

async function releaseLock() {
  try { await redisSet(LOCK_KEY, '', 1); } catch {} // expire immediately
}

// ──────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────
exports.handler = async (event) => {
  const start = Date.now();
  const forceRun = event?.forceRun || event?.test || false;

  // ── SHARD CONFIGURATION ──
  // EventBridge passes {"shard": 0..3} to split the universe across 4 Lambda instances.
  // If no shard is specified (legacy/forceRun), process the entire universe (backward compatible).
  const TOTAL_SHARDS = 4;
  const shardIndex = (typeof event?.shard === 'number') ? event.shard : null;
  const isSharded = shardIndex !== null && shardIndex >= 0 && shardIndex < TOTAL_SHARDS;

  let myUniverse;
  if (isSharded) {
    const perShard = Math.ceil(UNIVERSE.length / TOTAL_SHARDS);
    const startIdx = shardIndex * perShard;
    const endIdx = Math.min(startIdx + perShard, UNIVERSE.length);
    myUniverse = UNIVERSE.slice(startIdx, endIdx);
    LOCK_KEY = 'flow-harvest:lock:shard-' + shardIndex;
    console.log('[flow-harvest] Shard ' + shardIndex + '/' + TOTAL_SHARDS + ': tickers ' + startIdx + '-' + (endIdx - 1) + ' (' + myUniverse.length + ' tickers)' + (forceRun ? ' (FORCE)' : ''));
  } else {
    myUniverse = UNIVERSE;
    LOCK_KEY = 'flow-harvest:lock';
    console.log('[flow-harvest] Starting — ' + UNIVERSE.length + ' tickers (no shard)' + (forceRun ? ' (FORCE)' : ''));
  }

  // Market hours check
  // [FIX] 장외시간/주말에도 마지막 데이터를 보존하기 위해:
  //   - 첫 장외 실행(20:00 ET): 정상 실행 + 긴 TTL (24h/72h)
  //   - 이후 장외 실행: 스킵 (데이터 이미 보존됨)
  //   - forceRun: 항상 실행
  if (!forceRun) {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const isDST = month >= 3 && month <= 11;
    const etOffset = isDST ? 4 : 5;
    const etHour = (now.getUTCHours() - etOffset + 24) % 24;
    const day = now.getUTCDay();

    const isWeekend = day === 0 || day === 6;
    const isAfterHours = etHour < 8 || etHour >= 21; // 21:00 이후만 스킵 (20:00 실행은 허용)

    if (isWeekend && etHour !== 20) {
      console.log('[flow-harvest] Weekend — skipping (data preserved with 72h TTL)');
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'weekend-preserved' }) };
    }

    if (!isWeekend && isAfterHours) {
      console.log('[flow-harvest] After hours (ET: ' + etHour + ') — skipping (data preserved with 24h TTL)');
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'after-hours-preserved', etHour }) };
    }

    if (!isWeekend && etHour < 8) {
      console.log('[flow-harvest] Pre-market (ET: ' + etHour + ') — skipping');
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'pre-market', etHour }) };
    }
  }

  // [CONCURRENCY GUARD] Prevent overlapping executions (per-shard lock)
  if (!forceRun) {
    const lockAcquired = await acquireLock();
    if (!lockAcquired) {
      console.log('[flow-harvest] SKIPPED — another instance is still running (lock: ' + LOCK_KEY + ')');
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'concurrent-lock', shard: shardIndex }) };
    }
    console.log('[flow-harvest] Lock acquired (' + LOCK_KEY + ') — proceeding with harvest');
  }

  // ── [2026-08-29] 처리량을 API 예산에 맞춘다 ──────────────────────
  //
  // 예전 구조는 Massive 한도 기준이었다. 실측: 2,001종목 × 동시 10 ×
  // 종목당 약 7콜을 31초에 쏟아부어 **분당 2만 콜 이상** — Intrinio 스로틀에
  // 걸려 전건 실패했다. 어댑터에 토큰버킷을 넣었지만, 그것만으로는
  // 한 번에 못 끝내고 15분 Lambda 한도에서 잘린다.
  //
  // 그래서 **매 실행마다 유니버스의 일부만** 처리하고 다음 실행이 이어받는다.
  // 커서는 Redis 에 두어 실행 간에 회전한다 — 시간이 지나면 전 종목이 덮인다.
  // SLICE 는 «시간 예산 안에 들어갈 수 있는 최대치»여야 한다. 작게 잡으면
  //   예산이 남아도 조기 종료해 회전이 느려진다(120은 4분 예산의 절반도 안 썼다).
  //   동시성 30 실측 69종목/분 × 4분 = 276 → 여유 두고 300.
  const SLICE = Number(process.env.FLOW_SLICE_SIZE || 300);
  const TIME_BUDGET_MS = Number(process.env.FLOW_TIME_BUDGET_MS || 4 * 60 * 1000);
  const CURSOR_KEY = 'flow-harvest:cursor:' + (shardIndex == null ? 'all' : shardIndex);

  let cursor = 0;
  try {
    const raw = await redisGet(CURSOR_KEY);
    cursor = Number(raw) || 0;
  } catch { /* 커서 없으면 0 부터 */ }
  if (cursor >= myUniverse.length) cursor = 0;

  const sliceEnd = Math.min(cursor + SLICE, myUniverse.length);
  const workUniverse = myUniverse.slice(cursor, sliceEnd);
  const nextCursor = sliceEnd >= myUniverse.length ? 0 : sliceEnd;
  console.log('[flow-harvest] 슬라이스 ' + cursor + '-' + (sliceEnd - 1) + ' / ' + myUniverse.length +
    ' (' + workUniverse.length + '종목, 예산 ' + Math.round(TIME_BUDGET_MS / 1000) + 's)');

  // Process in batches of 10
  let ok = 0, fail = 0;
  // ⚠️ 실패 사유를 버리지 않는다. 예전에는 `reason` 을 만들어 놓고 아무 데도
  //    남기지 않아, 2,001종목 전건 실패인데 로그에 «fail=2001» 한 줄뿐이었다.
  //    원인이 스로틀인지 TypeError 인지 구분할 수 없어 진단이 몇 시간 늦어졌다.
  const failReasons = new Map();
  const noteFail = (r) => {
    const k = String(r || 'unknown').slice(0, 90);
    failReasons.set(k, (failReasons.get(k) || 0) + 1);
  };
  // ⚠️ [2026-09-02 실측] 병목은 Intrinio 가 아니라 **여기였다**.
  //   이관 때 BATCH_SIZE=10 으로 잡아두고 «Intrinio 예산에 맞췄다»고 적었으나
  //   실제로 잰 기록은 없었다. 재보니:
  //     동시성 10 → 22종목/분 · 144콜/분   (계약 한도 2,000콜/분 중 7% 만 사용)
  //     동시성 30 → 69종목/분 · 486콜/분   (3.1배)
  //   종목당 콜 = 만기 1 + 체인 6 = 7. 4샤드 동시 실행이므로
  //   486 × 4 = 1,944콜/분 < 2,000 (계약 한도). 아래 레이트리미터가 안전판.
  //   결과: 전 종목 회전이 25분 → 10분.
  const BATCH_SIZE = Number(process.env.FLOW_BATCH_SIZE || 30);
  const deadline = Date.now() + TIME_BUDGET_MS;
  let stoppedAt = null;

  for (let i = 0; i < workUniverse.length; i += BATCH_SIZE) {
    if (Date.now() > deadline) {
      stoppedAt = cursor + i;
      console.log('[flow-harvest] 시간 예산 소진 — ' + i + '종목 처리 후 중단');
      break;
    }
    const batch = workUniverse.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(t => harvestTicker(t)));
    for (const r of results) {
      if (r.ok) ok++;
      else { fail++; noteFail(r.reason); }
    }
    // Progress log every 100 tickers
    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= myUniverse.length) {
      const prefix = isSharded ? '[shard-' + shardIndex + ']' : '[flow-harvest]';
      console.log(prefix + ' Progress: ' + (i + BATCH_SIZE) + '/' + myUniverse.length + ' (ok=' + ok + ' fail=' + fail + ')');
    }
  }

  if (failReasons.size) {
    const top = [...failReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log('[flow-harvest] 실패 사유 상위: ' + top.map(([r, n]) => `${r}×${n}`).join(' | '));
  }

  // 다음 실행이 이어받을 위치를 기록 (중단됐으면 그 지점부터)
  try {
    await redisSet(CURSOR_KEY, String(stoppedAt != null ? stoppedAt : nextCursor), 24 * 3600);
  } catch (e) { console.warn('[flow-harvest] 커서 저장 실패:', e && e.message); }

  const duration = Math.round((Date.now() - start) / 1000);
  const logPrefix = isSharded ? '[shard-' + shardIndex + ']' : '[flow-harvest]';
  console.log(logPrefix + ' Universe complete: ' + ok + '/' + myUniverse.length + ' in ' + duration + 's (fail=' + fail + ')');

  // ── DEMAND-DRIVEN DYNAMIC UNIVERSE ──
  // Only the last shard (or non-sharded mode) processes dynamic universe.
  // This prevents duplicate processing across shards.
  let dynamicOk = 0, dynamicFail = 0;
  const isLastShard = !isSharded || shardIndex === TOTAL_SHARDS - 1;
  if (isLastShard) {
    try {
      const dynamicList = await redisGet('flow:dynamic-universe');
      if (dynamicList && Array.isArray(dynamicList) && dynamicList.length > 0) {
        // Filter out any tickers already in UNIVERSE (safety)
        const universeSet = new Set(UNIVERSE);
        const dynamicTickers = dynamicList.filter(t => !universeSet.has(t));

        if (dynamicTickers.length > 0) {
          console.log('[flow-harvest] Dynamic universe: ' + dynamicTickers.length + ' tickers: ' + dynamicTickers.join(', '));

          for (let i = 0; i < dynamicTickers.length; i += BATCH_SIZE) {
            const batch = dynamicTickers.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(t => harvestTicker(t)));
            for (const r of results) {
              if (r.ok) dynamicOk++;
              else dynamicFail++;
            }
          }
          console.log('[flow-harvest] Dynamic complete: ' + dynamicOk + '/' + dynamicTickers.length + ' (fail=' + dynamicFail + ')');
        }
      }
    } catch (e) {
      // Dynamic universe failure NEVER affects fixed universe
      console.log('[flow-harvest] Dynamic universe error (non-critical): ' + (e.message || e));
    }
  }

  const totalDuration = Math.round((Date.now() - start) / 1000);
  console.log('[flow-harvest] Total complete: ' + (ok + dynamicOk) + ' ok in ' + totalDuration + 's');

  // [CONCURRENCY GUARD] Release lock so next invocation can proceed
  await releaseLock();
  console.log('[flow-harvest] Lock released');

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      version: '3.0-shard',
      shard: shardIndex,
      totalShards: isSharded ? TOTAL_SHARDS : 1,
      tickers: myUniverse.length,
      totalUniverse: UNIVERSE.length,
      ok, fail, duration,
      dynamic: { count: dynamicOk + dynamicFail, ok: dynamicOk, fail: dynamicFail },
      totalDuration,
      timestamp: new Date().toISOString(),
    })
  };
};
