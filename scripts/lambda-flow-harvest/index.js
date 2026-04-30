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
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
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
const UNIVERSE = ["AA","AAAU","AAL","AAOI","AAPL","ABBV","ABNB","ABT","ACHR","ACI","ACN","ACWI","ACWX","ADBE","ADI","ADM","ADMA","ADP","ADT","ADTN","AEG","AEM","AEO","AEP","AES","AFRM","AG","AGI","AGNC","AGQ","AGRO","AHRT","AI","AIG","AKAM","AKR","ALAB","ALGN","ALHC","ALK","ALLY","ALM","AMAT","AMCR","AMD","AMDD","AMGN","AMPX","AMRZ","AMZN","ANET","ANSS","APA","APD","APH","APLD","APO","APP","AQN","AR","ARCC","ARDX","ARE","ARES","ARIS","ARKB","ARM","ARR","ARRY","AS","ASAN","ASHR","ASM","ASML","ASST","ASTS","ASX","ATAT","AU","AUGO","AVGO","AVTR","AWK","AXP","AXTA","AXTI","B","BA","BABA","BABX","BAC","BAM","BAX","BBJP","BBVA","BBWI","BBY","BCE","BCRX","BCS","BE","BEKE","BEN","BETA","BF.B","BHP","BIDU","BIIB","BIL","BILI","BIRK","BITB","BITI","BIV","BIZD","BKLN","BKNG","BKR","BLK","BLMN","BMNR","BMY","BN","BNDX","BNO","BP","BRK.B","BROS","BSV","BSX","BTC","BTCZ","BTDR","BTI","BTU","BULL","BVN","BW","BX","BZ","C","CAG","CALY","CARR","CAT","CCC","CCI","CCJ","CCL","CCUP","CDE","CDNS","CEG","CELH","CENX","CF","CFG","CG","CGAU","CGDV","CGGR","CHTR","CHWY","CHYM","CIEN","CIFR","CL","CLF","CLSK","CMCSA","CMG","CMPS","CNC","CNH","CNQ","CNR","COF","COHR","COIN","COLB","COMP","COP","COPX","CORN","CORZ","COST","COUR","CPB","CPER","CPNG","CPRT","CRCA","CRCG","CRCL","CRDO","CRGY","CRH","CRK","CRM","CRML","CRWD","CRWV","CSCO","CSGP","CSIQ","CSTM","CSX","CTAS","CTMX","CTRA","CTSH","CTVA","CUK","CVE","CVI","CVNA","CVS","CVX","CWAN","CWH","CX","CZR","D","DAL","DAR","DASH","DAWN","DB","DBRG","DCH","DD","DDOG","DE","DELL","DFAC","DHR","DHT","DIS","DJT","DKNG","DLO","DLR","DLTR","DOC","DOCN","DOCU","DOG","DOV","DOW","DPZ","DRI","DRVN","DT","DUK","DVN","DX","DXCM","DYN","DYNF","EA","EBAY","EC","ECL","EFV","EGO","EL","ELA","ELAN","EMB","EMBJ","EMLC","EMR","EMXC","ENB","ENPH","EOG","EOSE","EPD","EQIX","EQNR","EQR","EQT","EQX","ERAS","ERIC","ERY","ET","ETH","ETHA","ETHE","ETHT","ETHU","ETN","EW","EWA","EWC","EWG","EWH","EWT","EXC","EXE","EXK","EZU","F","FANG","FAST","FBTC","FCG","FCX","FDX","FE","FENY","FETH","FEZ","FHN","FIG","FIGR","FINV","FISV","FITB","FIVE","FLG","FLNC","FLO","FLR","FLY","FMC","FNB","FND","FNDE","FNDX","FNF","FORM","FOXA","FRMI","FRO","FRSH","FSK","FSLR","FSLY","FSM","FTI","FTNT","FTV","FUTU","FXN","GAP","GBDC","GD","GDX","GDXJ","GDXY","GE","GEHC","GEMI","GEN","GEV","GFI","GFS","GGLS","GILD","GIS","GLL","GLNG","GLW","GLXY","GM","GME","GO","GOOG","GOOGL","GOVT","GOVZ","GPGI","GPK","GPN","GPZ","GRDN","GRMN","GS","GSIT","GSK","GSLC","GT","GTLB","GTM","GUSH","HAFN","HAL","HBAN","HBM","HCA","HD","HDB","HE","HEFA","HGER","HIMS","HIMX","HL","HLN","HMY","HOG","HON","HOOD","HPE","HPQ","HSBC","HSIC","HST","HSY","HTFL","HUBS","HUM","HUN","HUT","HYMC","IAG","IBKR","IBM","IBN","IBRX","ICE","ICL","IDXX","IE","IEFA","IEI","IEMG","IEUR","IFF","IGIB","IGLB","IGLD","IGSB","IGV","ILF","ILMN","IMSR","INCY","INFQ","INFY","ING","INTC","INTU","INVH","IONQ","IOT","IP","IQV","IR","IREN","IREZ","ISRG","IT","ITB","ITOT","ITUB","ITW","IUSB","IUSV","IVW","IWD","IWF","IWR","IXUS","IYE","IYH","IYR","JAAA","JBS","JCI","JD","JETS","JHG","JHX","JNJ","JOBY","JPM","JPST","KBWB","KC","KDP","KEY","KGC","KHC","KIM","KKR","KLAC","KLAR","KMB","KMI","KO","KR","KSS","KTOS","KVUE","LAR","LBRT","LCID","LDOS","LI","LIN","LITE","LITX","LKQ","LLY","LMND","LMT","LNG","LOW","LRCX","LTRX","LULU","LUMN","LUNR","LUV","LVS","LWLG","LXU","LYB","LYFT","LYG","LYV","M","MA","MAR","MARA","MASI","MAT","MBLY","MCD","MCHP","MCO","MCW","MDB","MDLN","MDLZ","MDT","MELI","MEOH","MET","META","METC","METU","MFG","MGA","MGM","MNST","MO","MOS","MP","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSFU","MSI","MSTR","MT","MTB","MTCH","MTD","MU","MUB","MUFG","MUX","NAIL","NAT","NBIG","NBIS","NBIZ","NCLH","NDAQ","NDSN","NEE","NEM","NET","NEXT","NFLX","NG","NGD","NIO","NKE","NLY","NOC","NOG","NOK","NOV","NOW","NSC","NTLA","NTR","NTRS","NTSK","NU","NUE","NVAX","NVD","NVDA","NVDQ","NVO","NVS","NVTS","NWG","NXE","O","OBDC","OCUL","ODFL","OKE","OKLL","OKLO","OKTA","OMC","ON","ONDG","ONDS","ONON","OPEN","ORC","ORCL","ORCX","ORLA","ORLY","OSCR","OSS","OTIS","OUNZ","OVV","OWL","OXY","PAA","PAAS","PAGP","PANW","PARA","PATH","PAYX","PBF","PBI","PBR","PBR.A","PCAR","PCG","PCT","PDBC","PDD","PDYN","PEAK","PEG","PEP","PFE","PG","PGX","PHM","PHYS","PINS","PL","PLD","PLTD","PLTR","PM","PNC","POET","PONY","POOL","PPG","PPL","PPTA","PR","PRMB","PSA","PSKY","PSQ","PSX","PTC","PTEN","PTIR","PULS","PWR","PYPL","QBTS","QBTX","QCOM","QFIN","QQQI","QQQM","QS","QSR","QUAL","QUBT","QXO","RBLX","RBRK","RCAT","RDDT","RDW","REGN","RELX","RES","RF","RGTI","RIG","RIO","RIOT","RITM","RIVN","RKLB","RKLX","RKT","ROIV","ROK","ROKU","ROP","ROST","RRC","RSG","RSP","RTX","RUN","RWM","RYN","S","SA","SAIL","SAN","SAP","SATS","SBAC","SBET","SBIT","SBSW","SBUX","SCCO","SCHB","SCHE","SCHF","SCHG","SCHH","SCHI","SCHK","SCHO","SCHP","SCHV","SCHW","SCHX","SDOW","SDVY","SE","SEDG","SEI","SEM","SERV","SFM","SG","SGML","SGOL","SGOV","SH","SHEL","SHLS","SHO","SHOP","SHV","SHW","SIG","SIL","SILJ","SIVR","SJNK","SKE","SLB","SLVP","SM","SMCI","SMR","SNA","SNDK","SNOW","SNPS","SNXX","SNY","SO","SOC","SOFI","SONY","SOUN","SPAB","SPDN","SPDW","SPEM","SPG","SPHY","SPIB","SPLB","SPLV","SPMD","SPMO","SPOT","SPSB","SPSM","SPTI","SPTL","SPTM","SPXU","SPYD","SPYG","SPYI","SPYM","SPYV","SQ","SRE","SRLN","SRTY","SSL","SSRM","STAA","STE","STLA","STM","STNG","STT","STUB","STX","STZ","SU","SUNB","SUZ","SVM","SW","SWK","SWKS","SYF","SYK","SYM","SYY","T","TALK","TBIL","TCOM","TDG","TDOC","TE","TEAM","TECK","TEL","TEM","TER","TERN","TEVA","TFC","TGB","TGNA","TGT","TGTX","TIGR","TIP","TJX","TLRY","TMC","TME","TMO","TMUS","TNDM","TNGX","TOST","TPH","TRGP","TRIP","TROW","TROX","TRV","TSCO","TSDD","TSEM","TSLA","TSLG","TSLQ","TSLT","TSLZ","TSM","TSN","TT","TTD","TTE","TTWO","TU","TWLO","TWO","TXN","TYL","U","UAA","UAL","UAMY","UBER","UBS","UDOW","UEC","UGL","UGP","UL","UMAC","UMC","UNH","UNP","UPS","UPST","URA","URI","USAR","USAS","USB","USFR","USHY","USIG","USMV","UUUU","V","VALE","VCIT","VCLT","VCSH","VELO","VET","VEU","VFC","VG","VGIT","VGK","VGLT","VGSH","VIAV","VICI","VIST","VITL","VKTX","VLO","VLY","VMC","VNET","VNOM","VOD","VONV","VRSK","VRT","VRTX","VST","VT","VTEB","VTIP","VTR","VTRS","VTWO","VXUS","VZ","WBD","WBS","WDAY","WDC","WDS","WELL","WEN","WFC","WIX","WMB","WMG","WMT","WPM","WRD","WSC","WU","WULF","WVE","WY","XEL","XLC","XLG","XME","XOM","XP","XPEV","XRAY","XYZ","YANG","YEXT","YINN","YMM","YPF","Z","ZETA","ZS","ZSL","ZTO","ZTS"];

// ──────────────────────────────────────────
// HTTP + Redis helpers (same pattern as signum-harvest)
// ──────────────────────────────────────────

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs || 15000);
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-FLOW/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', (e) => { clearTimeout(to); reject(e); });
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

// Redis GET via Upstash REST API
async function redisGet(key) {
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
    const { metrics: rtMetrics, quotes } = await fetchRealtimeMetrics(ticker);
    if (!rtMetrics) return { ticker, ok: false, reason: 'no-data' };

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
      _source: 'lambda-flow-harvest',
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

    return { ticker, ok: true };
  } catch (e) {
    return { ticker, ok: false, reason: e.message };
  }
}

// ──────────────────────────────────────────
// Distributed Lock — prevent concurrent executions
// Redis key expires after 900s (matches Lambda timeout) as safety net
// ──────────────────────────────────────────
const LOCK_KEY = 'flow-harvest:lock';
const LOCK_TTL = 900; // seconds — matches Lambda timeout

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
  console.log('[flow-harvest] Starting — ' + UNIVERSE.length + ' tickers' + (forceRun ? ' (FORCE)' : ''));

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
      // 주말: 토요일 20:00에 1회 실행 (Fri close 데이터 refresh)
      // 그 외에는 스킵 (72h TTL로 보존 중)
      console.log('[flow-harvest] Weekend — skipping (data preserved with 72h TTL)');
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'weekend-preserved' }) };
    }

    if (!isWeekend && isAfterHours) {
      // 평일 장마감 후: 21:00 이후 스킵 (20:00 실행에서 24h TTL로 보존)
      console.log('[flow-harvest] After hours (ET: ' + etHour + ') — skipping (data preserved with 24h TTL)');
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'after-hours-preserved', etHour }) };
    }

    if (!isWeekend && etHour < 8) {
      console.log('[flow-harvest] Pre-market (ET: ' + etHour + ') — skipping');
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'pre-market', etHour }) };
    }
  }

  // [CONCURRENCY GUARD] Prevent overlapping executions
  // If another instance is still running, skip this invocation
  if (!forceRun) {
    const lockAcquired = await acquireLock();
    if (!lockAcquired) {
      console.log('[flow-harvest] SKIPPED — another instance is still running (lock exists)');
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'concurrent-lock' }) };
    }
    console.log('[flow-harvest] Lock acquired — proceeding with harvest');
  }

  // Process in batches of 10 (same concurrency as signum-harvest)
  let ok = 0, fail = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < UNIVERSE.length; i += BATCH_SIZE) {
    const batch = UNIVERSE.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(t => harvestTicker(t)));
    for (const r of results) {
      if (r.ok) ok++;
      else fail++;
    }
    // Progress log every 100 tickers
    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= UNIVERSE.length) {
      console.log('[flow-harvest] Progress: ' + (i + BATCH_SIZE) + '/' + UNIVERSE.length + ' (ok=' + ok + ' fail=' + fail + ')');
    }
  }

  const duration = Math.round((Date.now() - start) / 1000);
  console.log('[flow-harvest] Universe complete: ' + ok + '/' + UNIVERSE.length + ' in ' + duration + 's (fail=' + fail + ')');

  // ── DEMAND-DRIVEN DYNAMIC UNIVERSE ──
  // Process non-universe tickers that users queried during this market session.
  // Vercel registers them in Redis 'flow:dynamic-universe' list.
  // This block is completely independent — universe data is ALREADY saved above.
  let dynamicOk = 0, dynamicFail = 0;
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

  const totalDuration = Math.round((Date.now() - start) / 1000);
  console.log('[flow-harvest] Total complete: ' + (ok + dynamicOk) + ' ok in ' + totalDuration + 's');

  // [CONCURRENCY GUARD] Release lock so next invocation can proceed
  await releaseLock();
  console.log('[flow-harvest] Lock released');

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      version: '2.2',
      tickers: UNIVERSE.length,
      ok, fail, duration,
      dynamic: { count: dynamicOk + dynamicFail, ok: dynamicOk, fail: dynamicFail },
      totalDuration,
      timestamp: new Date().toISOString(),
    })
  };
};
