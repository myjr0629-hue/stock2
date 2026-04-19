
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

const FMP_KEY = process.env.FMP_API_KEY || '';
const UNIVERSE = ["AA","AAAU","AAL","AAOI","AAOX","AAPL","ABBV","ABNB","ABT","ACHC","ACHR","ACI","ACN","ACWI","ADBE","ADI","ADMA","ADP","ADPT","ADSK","ADT","ADTN","AEG","AEHR","AEM","AEO","AEP","AES","AESI","AFRM","AG","AGNC","AGQ","AI","AJG","AKAM","ALAB","ALK","ALM","AMAT","AMCR","AMD","AMDD","AMGN","AMH","AMKR","AMPX","AMZN","ANET","ANNX","ANSS","AON","APA","APD","APH","APLD","APLE","APLS","APLX","APO","APP","APTV","AQN","AR","ARCC","ARDX","ARE","ARES","ARKB","ARM","ARMG","ARR","ARRY","AS","ASAN","ASHR","ASM","ASML","ASST","ASTS","ASTX","ASX","AU","AVGO","AVL","AVTR","AWK","AXON","AXP","AXTA","AXTI","B","BA","BABA","BAC","BAI","BAM","BAX","BBWI","BBY","BCE","BCRX","BCS","BE","BEKE","BEN","BF.B","BHC","BHP","BIDU","BIIB","BIL","BITB","BIV","BIZD","BKLN","BKNG","BKR","BKSY","BLK","BMNR","BMY","BN","BNDX","BNO","BORR","BOX","BP","BRBR","BRK.B","BROS","BRX","BRZE","BSV","BSX","BSY","BTC","BTDR","BTI","BTU","BUD","BUG","BW","BWX","BX","BXSL","BYRN","C","CAG","CAI","CAR","CARR","CART","CAT","CC","CCI","CCJ","CCL","CDE","CDNS","CEG","CELH","CERT","CF","CFG","CG","CGDV","CGGR","CHTR","CHWY","CHYM","CIBR","CIEN","CIFR","CL","CLBT","CLF","CLS","CLSK","CMCSA","CME","CMG","CMPX","CNC","CNH","CNP","CNQ","COHR","COIN","COMP","COMT","COP","COPX","CORD","CORN","CORZ","COST","COUR","CP","CPB","CPNG","CPRI","CPRT","CRBG","CRCA","CRCD","CRCL","CRDO","CRGY","CRH","CRK","CRM","CRML","CRWD","CRWU","CRWV","CSCO","CSGP","CSX","CTAS","CTRA","CTSH","CUK","CVE","CVLT","CVNA","CVS","CVX","CWAN","CWVX","CX","CXM","D","DAL","DASH","DB","DBRG","DBX","DCH","DD","DDOG","DE","DELL","DFAR","DG","DHI","DHR","DHT","DIA","DIS","DJT","DKNG","DLR","DLTR","DNOW","DOC","DOCN","DOCS","DOCU","DOG","DOV","DOW","DPZ","DRAM","DT","DUK","DUOL","DVN","DX","DXC","DXCM","DYNF","EA","EBAY","EC","ECL","ECVT","EFX","EGO","EL","ELF","EMB","EMLC","EMR","EMXC","ENB","ENPH","ENVX","EOG","EOSE","EPD","EQH","EQIX","EQNR","EQR","EQT","EQX","ERAS","ERIC","ERY","ESTC","ET","ETH","ETHA","ETHE","ETHT","ETHU","ETHW","ETN","EVLV","EW","EWH","EWT","EXC","EXEL","EXK","EXLS","EXTR","F","FANG","FAST","FBND","FBTC","FCX","FDX","FENY","FETH","FHN","FIG","FIGR","FIS","FISV","FITB","FIVN","FLEX","FLG","FLNC","FLO","FLY","FNB","FNDX","FOLD","FOXA","FPS","FRO","FROG","FRSH","FSLR","FSLY","FSM","FTI","FTNT","FTV","FWONK","GAP","GBDC","GBTG","GD","GDX","GDXJ","GE","GEN","GEV","GFI","GFS","GGLS","GH","GILD","GIS","GLL","GLW","GLXY","GM","GME","GNW","GO","GOOG","GOOGL","GOVT","GPGI","GPK","GPN","GPRK","GRID","GRMN","GRNY","GS","GSK","GSOL","GT","GTLB","GTM","GWRE","HAL","HBAN","HBM","HCA","HD","HDB","HIMS","HIMX","HIMZ","HL","HLN","HMY","HOG","HON","HOOD","HPE","HPQ","HRL","HSIC","HST","HSY","HTZ","HUBS","HUM","HUT","HYMC","IAG","IBKR","IBM","IBN","IBRX","ICE","IDXX","IE","IEFA","IEMG","IFF","IGSB","IGV","ILF","ILMN","INCY","INDV","INFQ","INFY","ING","INTC","INTR","INTU","INVH","IONQ","IOT","IP","IQV","IR","IRE","IREN","IREX","IREZ","ISRG","IT","ITOT","ITUB","ITW","IUSB","IVW","IVZ","IWM","IYR","JAAA","JBS","JCI","JD","JETS","JHX","JNJ","JOBY","JPM","JPST","KD","KDP","KEY","KGC","KHC","KIM","KKR","KLAC","KLAR","KMB","KMI","KMX","KNX","KO","KR","KSS","KTOS","KVUE","KVYO","KYIV","LAR","LASR","LBRT","LCID","LDOS","LEN","LEVI","LGN","LI","LIN","LION","LITE","LITX","LLY","LMND","LMT","LNG","LOW","LPTH","LRCX","LULU","LUMN","LUNR","LUV","LVS","LWLG","LYB","LYFT","LYG","LYV","LZ","M","MA","MAR","MARA","MAT","MBLY","MCD","MCHP","MCO","MDB","MDLN","MDLZ","MDT","MELI","MEOH","MET","META","METU","MFG","MGM","MGY","MKC","MNDY","MNST","MO","MOS","MP","MPC","MPLX","MPWR","MRK","MRLN","MRNA","MRSH","MRVL","MS","MSCI","MSFT","MSFU","MSI","MSTR","MT","MTB","MTD","MU","MUB","MUFG","MVLL","NAT","NAVN","NBIG","NBIS","NCLH","NCNO","NDAQ","NDSN","NEBX","NEE","NEM","NEO","NEOG","NET","NEXT","NFLX","NG","NI","NIO","NKE","NLY","NOC","NOK","NOW","NSC","NTNX","NTRA","NTRS","NTSK","NU","NUE","NVAX","NVD","NVDA","NVDQ","NVO","NVTS","NWG","NXE","NXPI","O","OBDC","OCUL","ODFL","OGN","OKE","OKLL","OKLO","OKTA","OLN","OMC","ON","ONB","ONDS","ONON","ORC","ORCL","ORCX","ORLY","OSCR","OTEX","OTIS","OVV","OWL","OXY","PAA","PAAS","PAGS","PANW","PAR","PARA","PATH","PAYX","PBR","PBR.A","PCAR","PCG","PCOR","PCT","PD","PDBC","PDD","PEAK","PEG","PEP","PFE","PG","PGR","PGX","PGY","PHM","PHR","PHYS","PINS","PK","PL","PLD","PLTD","PLTR","PLTU","PM","PNC","POET","PONY","POOL","PPG","PPL","PR","PSA","PSKY","PSQ","PSX","PTC","PTEN","PTIR","PURR","PWR","PYPL","QBTS","QCOM","QQQ","QQQI","QQQM","QS","QUBT","QURE","QXO","RBLX","RBRK","RCAT","RDDT","RDW","REET","REGN","RELX","RF","RGTI","RGTZ","RHI","RIG","RIO","RIOT","RITM","RIVN","RKLB","RKLX","RKT","RLAY","RMBS","ROIV","ROK","ROKU","ROP","ROST","RPD","RRC","RSG","RSP","RTX","RUN","RWM","S","SAIL","SAN","SAP","SARO","SATL","SATS","SBAC","SBET","SBSW","SBUX","SCHB","SCHE","SCHF","SCHG","SCHH","SCHI","SCHO","SCHP","SCHR","SCHV","SCHW","SCHX","SDOW","SE","SEDG","SEI","SERV","SEZL","SG","SGML","SGOL","SGOV","SH","SHEL","SHLD","SHO","SHOP","SHV","SHW","SHYG","SILJ","SIVR","SJNK","SLB","SLNO","SM","SMCI","SMCX","SMFG","SMMT","SMPL","SMR","SMTC","SMX","SNA","SNDK","SNOW","SNPS","SNXX","SNY","SO","SOFI","SONY","SOUN","SPAB","SPDN","SPDW","SPG","SPHY","SPIB","SPIR","SPLB","SPLV","SPMO","SPSB","SPSM","SPTI","SPTL","SPXU","SPY","SPYG","SPYI","SPYM","SPYV","SQ","SQM","SRAD","SRE","SRLN","SSL","SSNC","SSRM","STAA","STE","STLA","STM","STNE","STRC","STT","STUB","STX","STZ","SU","SUNB","SUZ","SVM","SW","SWK","SWKS","SYK","SYM","SYY","T","TAK","TAL","TBIL","TDG","TDOC","TEAM","TECK","TEL","TEM","TENB","TER","TERN","TETH","TEVA","TFC","TFLO","TGB","TGT","TIGR","TIP","TJX","TLH","TLRY","TME","TMO","TMUS","TNGX","TOST","TPG","TPH","TRGP","TRIP","TROW","TROX","TRU","TRV","TSCO","TSDD","TSEM","TSL","TSLA","TSLG","TSLQ","TSLT","TSLZ","TSM","TT","TTD","TTE","TTI","TTMI","TTWO","TU","TWLO","TXN","TYL","U","UAA","UAL","UAMY","UBER","UBS","UDOW","UDR","UEC","UGL","UGP","UGRO","UL","UMAC","UMC","UNH","UNIT","UNP","UPS","UPST","UPWK","URA","URI","USAR","USAS","USB","USFR","USHY","UUUU","V","VALE","VCIT","VCLT","VCSH","VEEV","VERA","VFC","VG","VGIT","VGK","VGSH","VIAV","VICI","VISN","VITL","VKTX","VLO","VLY","VMC","VNET","VOD","VOYG","VRSK","VRT","VRTX","VSH","VST","VT","VTEB","VTR","VTRS","VTWO","VXUS","VZ","W","WBD","WDAY","WDC","WEAT","WELL","WEN","WFC","WIX","WMB","WMT","WOLF","WRD","WSR","WU","WULF","WY","XLC","XME","XOM","XOVR","XP","XPEV","XYZ","YINN","YLD","YMM","YSS","Z","ZETA","ZM","ZNTL","ZS","ZSL"];
const TABLE = 'signum-pattern-db';

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs || 15000);
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-FMP/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', (e) => { clearTimeout(to); reject(e); });
  });
}

exports.handler = async (event) => {
  const start = Date.now();
  const forceRun = event?.forceRun || false;
  const today = new Date().toISOString().slice(0, 10);

  // Market hours check (skip weekends + non-market hours unless forceRun)
  if (!forceRun) {
    const now = new Date();
    const day = now.getUTCDay();
    if (day === 0 || day === 6) {
      console.log('Weekend — skipping');
      return { statusCode: 200, body: JSON.stringify({ success: true, skipped: 'weekend' }) };
    }
  }

  if (!FMP_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'FMP_API_KEY not configured' }) };
  }

  console.log('signum-fmp v1.0 — ' + UNIVERSE.length + ' tickers, forceRun=' + forceRun);
  const results = { analyst: 0, earnings: 0, forward: 0 };

  // ═══════════════════════════════════════════
  // Step 1: FMP Analyst Grades + Price Target + Forward Estimates
  // 3 parallel API calls per ticker, batch 5, sleep 3s
  // Rate: 225 req/min (75% of 300 limit)
  // ═══════════════════════════════════════════
  const forwardMap = {};  // ticker → { eps, revenue, year }

  console.log('Step 1: FMP 3-API collection for ' + UNIVERSE.length + ' tickers...');
  for (let i = 0; i < UNIVERSE.length; i += 5) {
    const batch = UNIVERSE.slice(i, i + 5);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const [gradeData, targetData, forwardData] = await Promise.all([
          httpsGet('https://financialmodelingprep.com/stable/grades-consensus?symbol=' + ticker + '&apikey=' + FMP_KEY, 5000).catch(() => null),
          httpsGet('https://financialmodelingprep.com/stable/price-target-consensus?symbol=' + ticker + '&apikey=' + FMP_KEY, 5000).catch(() => null),
          httpsGet('https://financialmodelingprep.com/stable/analyst-estimates?symbol=' + ticker + '&period=annual&apikey=' + FMP_KEY, 5000).catch(() => null)
        ]);

        // ── Analyst Grade ──
        const grade = Array.isArray(gradeData) ? gradeData[0] : gradeData;

        // ── Price Target ──
        let priceTarget = null;
        if (Array.isArray(targetData) && targetData.length > 0) {
          const t = targetData[0];
          if (t.targetConsensus && t.targetHigh) {
            priceTarget = { targetHigh: t.targetHigh, targetLow: t.targetLow, targetConsensus: t.targetConsensus };
          }
        }

        // ── Forward Estimates ──
        if (Array.isArray(forwardData)) {
          const currentYearStr = new Date().toISOString().slice(0, 4);
          const nextYearData = [...forwardData].reverse().find(f => f.date && f.date.slice(0, 4) > currentYearStr);
          if (nextYearData && nextYearData.epsAvg !== undefined && nextYearData.revenueAvg) {
            forwardMap[ticker] = { eps: nextYearData.epsAvg, revenue: nextYearData.revenueAvg, year: nextYearData.date.slice(0, 4) };
          }
        }

        // ── Save ANALYST record ──
        if (grade && (grade.strongBuy || grade.buy || grade.hold)) {
          const total = (grade.strongBuy || 0) + (grade.buy || 0) + (grade.hold || 0) + (grade.sell || 0) + (grade.strongSell || 0);
          const bullishPct = total > 0 ? Math.round(((grade.strongBuy || 0) + (grade.buy || 0)) / total * 100) : 0;
          let consensus = grade.consensus || 'N/A';
          if (consensus === 'N/A' && total > 0) {
            const ws = ((grade.strongBuy || 0) * 5 + (grade.buy || 0) * 4 + (grade.hold || 0) * 3 + (grade.sell || 0) * 2 + (grade.strongSell || 0)) / total;
            consensus = ws >= 4.3 ? 'STRONG BUY' : ws >= 3.5 ? 'BUY' : ws >= 2.5 ? 'HOLD' : ws >= 1.7 ? 'SELL' : 'STRONG SELL';
          }
          const breakdown = { strongBuy: grade.strongBuy || 0, buy: grade.buy || 0, hold: grade.hold || 0, sell: grade.sell || 0, strongSell: grade.strongSell || 0 };
          await client.send(new PutCommand({
            TableName: TABLE,
            Item: { pattern: 'ANALYST:' + ticker, timestamp: Date.now(), consensus, totalAnalysts: total, bullishPct, breakdown, priceTarget }
          }));
          results.analyst++;
        }
      } catch {}
    }));
    // Sleep 3s per batch (5 tickers × 3 APIs = 15 calls) — 225 req/min safe
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('Step 1 done: analyst=' + results.analyst + '/' + UNIVERSE.length + ', forward=' + Object.keys(forwardMap).length);

  // ═══════════════════════════════════════════
  // Step 2: FMP Earnings Calendar
  // FMP returns max 4000 events per call → split into chunks
  // Past: 3 × 30-day chunks (for epsActual → surprise data)
  // Future: 1 × 180-day call (for next earnings date)
  // Total: 4 API calls (negligible vs Step 1's 3000 calls)
  // ═══════════════════════════════════════════
  const earningsMap = {};
  const surpriseMap = {}; // ticker → { actualEps, estimatedEps, surpriseEps, surprisePct, date }
  const tickerSet = new Set(UNIVERSE);

  // Helper: process earnings array
  function processEarnings(arr, todayStr) {
    for (const e of arr) {
      if (!tickerSet.has(e.symbol)) continue;
      const eventDate = new Date(e.date);
      if (eventDate >= new Date(todayStr)) {
        // Future event → next earnings date
        if (!earningsMap[e.symbol] || eventDate < new Date(earningsMap[e.symbol].date)) {
          earningsMap[e.symbol] = e;
        }
      } else {
        // Past event with actual EPS → earnings surprise (most recent wins)
        if (e.epsActual != null && e.epsEstimated != null) {
          if (!surpriseMap[e.symbol] || eventDate > new Date(surpriseMap[e.symbol].date)) {
            surpriseMap[e.symbol] = {
              actualEps: e.epsActual,
              estimatedEps: e.epsEstimated,
              surpriseEps: Number((e.epsActual - e.epsEstimated).toFixed(3)),
              surprisePct: e.epsEstimated !== 0
                ? Number(((e.epsActual - e.epsEstimated) / Math.abs(e.epsEstimated) * 100).toFixed(1))
                : 0,
              date: e.date
            };
          }
        }
      }
    }
  }

  try {
    let totalEvents = 0;
    // Past: 13 × 7-day chunks (91 days total)
    // FMP caps at 4000 results per call; 7-day windows stay well under (~2000)
    for (let chunk = 0; chunk < 13; chunk++) {
      const chunkEnd = new Date(Date.now() - chunk * 7 * 86400000);
      const chunkStart = new Date(Date.now() - (chunk + 1) * 7 * 86400000);
      const from = chunkStart.toISOString().slice(0, 10);
      const to = chunkEnd.toISOString().slice(0, 10);
      const data = await httpsGet('https://financialmodelingprep.com/stable/earnings-calendar?from=' + from + '&to=' + to + '&apikey=' + FMP_KEY, 15000).catch(() => []);
      const arr = Array.isArray(data) ? data : [];
      processEarnings(arr, today);
      totalEvents += arr.length;
    }
    // Future: 1 × 180 days (future data is sparser, 4000 limit is fine)
    const toDate = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    const futureData = await httpsGet('https://financialmodelingprep.com/stable/earnings-calendar?from=' + today + '&to=' + toDate + '&apikey=' + FMP_KEY, 15000).catch(() => []);
    const futureArr = Array.isArray(futureData) ? futureData : [];
    processEarnings(futureArr, today);
    totalEvents += futureArr.length;

    console.log('Step 2 done: ' + Object.keys(earningsMap).length + ' future, ' + Object.keys(surpriseMap).length + ' surprises from ' + totalEvents + ' events (4 API calls)');
  } catch (e) {
    console.log('Step 2 earnings calendar error: ' + e.message);
  }

  // ═══════════════════════════════════════════
  // Step 3: Save EARNINGS records for ALL tickers with forward data
  // This fixes the 830-ticker forwardEps gap:
  //   - earningsMap tickers: get nextDate + epsEstimate + forwardEps/Revenue
  //   - non-earningsMap tickers: get forwardEps/Revenue only (no nextDate)
  // Revision calculation (▲▼) for both groups
  // ═══════════════════════════════════════════
  console.log('Step 3: Saving EARNINGS records (forward + calendar)...');

  // Collect all tickers that need EARNINGS records
  const earningsTickers = new Set([
    ...Object.keys(earningsMap),
    ...Object.keys(forwardMap)
  ]);

  for (const ticker of earningsTickers) {
    try {
      const fw = forwardMap[ticker] || {};
      const cal = earningsMap[ticker] || null;

      // Skip if no data at all
      if (!fw.eps && !cal) continue;

      // Read previous EARNINGS record for revision calculation
      let revisionEps = null, revisionRev = null;
      let revisionDate = null, revRevisionDate = null;
      try {
        const oldRes = await client.send(new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'pattern = :p',
          ExpressionAttributeValues: { ':p': 'EARNINGS:' + ticker },
          Limit: 1, ScanIndexForward: false
        }));
        const oldData = oldRes.Items?.[0];

        // EPS revision
        if (oldData && fw.eps && oldData.forwardEps && Math.abs(fw.eps - oldData.forwardEps) > 0.001) {
          revisionEps = Number((fw.eps - oldData.forwardEps).toFixed(3));
          revisionDate = today;
        } else if (oldData && oldData.forwardEpsRevision != null && oldData.forwardEpsRevisionDate) {
          const ageDays = (new Date(today).getTime() - new Date(oldData.forwardEpsRevisionDate).getTime()) / 86400000;
          if (ageDays <= 4 && fw.eps === oldData.forwardEps) {
            revisionEps = oldData.forwardEpsRevision;
            revisionDate = oldData.forwardEpsRevisionDate;
          }
        }

        // Revenue revision
        if (oldData && fw.revenue && oldData.forwardRevenue && Math.abs(fw.revenue - oldData.forwardRevenue) > 100000) {
          revisionRev = fw.revenue - oldData.forwardRevenue;
          revRevisionDate = today;
        } else if (oldData && oldData.forwardRevRevision != null && oldData.forwardRevRevisionDate) {
          const revAgeDays = (new Date(today).getTime() - new Date(oldData.forwardRevRevisionDate).getTime()) / 86400000;
          if (revAgeDays <= 4 && fw.revenue === oldData.forwardRevenue) {
            revisionRev = oldData.forwardRevRevision;
            revRevisionDate = oldData.forwardRevRevisionDate;
          }
        }
      } catch {}

      // Build EARNINGS record
      const daysUntil = cal ? Math.ceil((new Date(cal.date).getTime() - new Date(today).getTime()) / 86400000) : null;
      const surp = surpriseMap[ticker] || null;
      const item = {
        pattern: 'EARNINGS:' + ticker,
        timestamp: Date.now(),
        // Earnings calendar fields (null if not in calendar)
        nextDate: cal ? cal.date : null,
        daysUntil: daysUntil,
        epsEstimate: cal ? (cal.epsEstimated || null) : null,
        quarter: null,
        year: null,
        hour: cal ? (cal.time || null) : null,
        // Forward fields (from analyst-estimates)
        forwardEps: fw.eps || null,
        forwardRevenue: fw.revenue || null,
        forwardYear: fw.year || null,
        // Revision fields
        forwardEpsRevision: revisionEps,
        forwardEpsRevisionDate: revisionDate,
        forwardRevRevision: revisionRev,
        forwardRevRevisionDate: revRevisionDate,
        // Earnings Surprise (most recent quarter)
        lastSurprise: surp,
      };

      await client.send(new PutCommand({ TableName: TABLE, Item: item })).catch(() => {});
      results.earnings++;
    } catch {}
  }

  results.forward = Object.keys(forwardMap).length;
  console.log('Step 3 done: earnings=' + results.earnings + ' (calendar=' + Object.keys(earningsMap).length + ', forward=' + results.forward + ')');

  const duration = Math.round((Date.now() - start) / 1000);
  console.log('signum-fmp completed in ' + duration + 's');
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, version: '1.0', duration, results })
  };
};
