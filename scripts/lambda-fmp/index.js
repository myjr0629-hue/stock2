
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

const FMP_KEY = process.env.FMP_API_KEY || '';
const UNIVERSE = ["A","AA","AAAU","AAL","AAOI","AAON","AAOX","AAP","AAPL","ABBV","ABCB","ABCL","ABG","ABNB","ABSI","ABT","ACA","ACAD","ACGL","ACHC","ACHR","ACI","ACIW","ACLS","ACM","ACMR","ACN","ACVA","ACWI","ADBE","ADC","ADEA","ADI","ADM","ADMA","ADNT","ADP","ADPT","ADSK","ADT","ADTN","AEE","AEG","AEHR","AEIS","AEM","AEO","AEP","AER","AES","AESI","AFG","AFL","AFRM","AG","AGCO","AGI","AGNC","AGQ","AGX","AHR","AI","AIG","AIR","AIT","AIZ","AJG","AKAM","ALAB","ALB","ALC","ALG","ALGM","ALGN","ALGT","ALHC","ALK","ALKS","ALKT","ALL","ALLE","ALLY","ALM","ALMU","ALNY","ALSN","ALV","AM","AMAT","AMBA","AMC","AMCR","AMD","AMDD","AME","AMG","AMGN","AMH","AMKR","AMP","AMPX","AMR","AMRZ","AMSC","AMT","AMTM","AMZN","AN","ANAB","ANDE","ANET","ANF","ANNX","ANSS","AON","AOS","AOSL","APA","APD","APG","APGE","APH","APLD","APLE","APLS","APLX","APO","APP","APTV","AQN","AR","ARCB","ARCC","ARDX","ARE","ARES","ARKB","ARM","ARMG","ARMK","AROC","ARR","ARRY","ARW","ARWR","AS","ASAN","ASB","ASH","ASHR","ASM","ASML","ASND","ASO","ASST","ASTS","ASTX","ASX","ATEC","ATI","ATKR","ATMU","ATO","ATOM","ATR","ATRO","AU","AUB","AUGO","AUR","AVAV","AVB","AVEX","AVGO","AVL","AVT","AVTR","AVTX","AVY","AWI","AWK","AX","AXON","AXP","AXS","AXSM","AXTA","AXTI","AYI","AZN","AZO","AZTA","B","BA","BABA","BAC","BAH","BAI","BALL","BAM","BANC","BAND","BAP","BATRK","BAX","BB","BBAI","BBIO","BBWI","BBY","BC","BCC","BCE","BCO","BCRX","BCS","BDC","BDX","BE","BEAM","BEKE","BELFB","BEN","BEP","BEPC","BETA","BF.B","BFAM","BFH","BG","BHC","BHE","BHP","BIDU","BIIB","BIL","BILL","BIO","BIP","BIPC","BIRK","BITB","BIV","BIZD","BJ","BJRI","BK","BKD","BKH","BKLN","BKNG","BKR","BKSY","BL","BLBD","BLD","BLDP","BLDR","BLK","BLLN","BLMN","BLSH","BLZE","BMI","BMNR","BMO","BMRN","BMY","BN","BNDX","BNL","BNO","BNS","BOOT","BORR","BOX","BP","BPOP","BR","BRBR","BRK.B","BRKR","BRO","BROS","BRX","BRZE","BSV","BSX","BSY","BTBT","BTC","BTDR","BTE","BTG","BTI","BTSG","BTU","BUD","BUG","BULL","BURL","BW","BWA","BWX","BWXT","BX","BXP","BXSL","BYD","BYND","BYRN","BZAI","C","CACC","CACI","CAG","CAH","CAI","CAKE","CALM","CALY","CAMT","CAR","CARG","CARR","CART","CASY","CAT","CAVA","CB","CBOE","CBRE","CBRL","CBSH","CBT","CC","CCC","CCEP","CCI","CCJ","CCK","CCL","CDE","CDNS","CDW","CE","CECO","CEG","CELC","CELH","CENX","CERT","CEVA","CF","CFG","CFR","CG","CGDV","CGGR","CGNX","CHD","CHDN","CHE","CHEF","CHH","CHKP","CHRD","CHRW","CHTR","CHWY","CHYM","CI","CIBR","CIEN","CIFR","CINF","CL","CLBT","CLF","CLH","CLMT","CLS","CLSK","CLX","CM","CMC","CMCSA","CME","CMG","CMI","CMPX","CMS","CNA","CNC","CNH","CNI","CNK","CNM","CNO","CNP","CNQ","CNR","CNX","CNXC","COCO","COF","COGT","COHR","COHU","COIN","COKE","COLB","COLD","COLM","COMP","COMT","COO","COP","COPX","COR","CORD","CORN","CORT","CORZ","COST","COTY","COUR","CP","CPA","CPAY","CPB","CPNG","CPRI","CPRT","CPRX","CPT","CR","CRBG","CRC","CRCA","CRCD","CRCL","CRDO","CRGY","CRH","CRI","CRK","CRL","CRM","CRML","CRNX","CROX","CRS","CRSP","CRUS","CRWD","CRWU","CRWV","CSCO","CSGP","CSL","CSTM","CSW","CSX","CTAS","CTRA","CTRE","CTRI","CTSH","CTVA","CUBE","CUBI","CUK","CUZ","CVCO","CVE","CVI","CVLT","CVNA","CVS","CVX","CW","CWAN","CWEN","CWST","CWVX","CX","CXM","CXW","CYTK","CZR","D","DAL","DAR","DASH","DAVE","DB","DBRG","DBX","DCH","DCI","DD","DDOG","DE","DECK","DEI","DELL","DFAR","DFTX","DG","DGX","DGXX","DHI","DHR","DHT","DIA","DINO","DIOD","DIS","DJT","DK","DKNG","DKS","DLB","DLO","DLR","DLTR","DNLI","DNN","DNOW","DNTH","DOC","DOCN","DOCS","DOCU","DOG","DORM","DOV","DOW","DOX","DPZ","DRAM","DRI","DRS","DSGX","DT","DTE","DTM","DUK","DUOL","DVA","DVN","DX","DXC","DXCM","DY","DYNF","EA","EAT","EBAY","EBC","EC","ECG","ECL","ECVT","ED","EEFT","EFC","EFX","EG","EGO","EGP","EHC","EIX","EL","ELAN","ELF","ELS","ELV","EMB","EME","EMLC","EMN","EMR","EMXC","ENB","ENPH","ENR","ENS","ENSG","ENTG","ENVA","ENVX","EOG","EOSE","EPAM","EPD","EPR","EPRT","EQH","EQIX","EQNR","EQPT","EQR","EQT","EQX","ERAS","ERIC","ERIE","ERY","ES","ESAB","ESE","ESI","ESLT","ESNT","ESPR","ESS","ESTA","ESTC","ET","ETH","ETHA","ETHE","ETHT","ETHU","ETHW","ETN","ETR","ETSY","EVC","EVER","EVLV","EVR","EVRG","EW","EWBC","EWH","EWT","EWTX","EXC","EXE","EXEL","EXK","EXLS","EXP","EXPD","EXPE","EXR","EXTR","F","FAF","FANG","FAST","FBIN","FBND","FBTC","FCEL","FCFS","FCN","FCX","FDS","FDX","FE","FENY","FER","FERG","FETH","FFIV","FHB","FHI","FHN","FIBK","FICO","FIG","FIGR","FIGS","FIS","FISV","FITB","FIVE","FIVN","FIX","FLEX","FLG","FLNC","FLO","FLR","FLS","FLUT","FLY","FLYW","FN","FNB","FND","FNDX","FNF","FNV","FOLD","FORM","FOUR","FOX","FOXA","FPS","FR","FRMI","FRO","FROG","FRPT","FRSH","FRT","FSLR","FSLY","FSM","FSS","FTAI","FTI","FTNT","FTRE","FTS","FTV","FUBO","FULT","FUN","FWONK","G","GAP","GATX","GBCI","GBDC","GBTG","GCT","GD","GDDY","GDX","GDXJ","GDYN","GE","GEHC","GEN","GEO","GEV","GFF","GFI","GFL","GFS","GGG","GGLS","GH","GIL","GILD","GIS","GKOS","GL","GLBE","GLL","GLNG","GLOB","GLPI","GLW","GLXY","GM","GME","GMED","GNL","GNRC","GNTX","GNW","GO","GOLF","GOOG","GOOGL","GOVT","GPC","GPGI","GPI","GPK","GPN","GPOR","GPRE","GPRK","GRAB","GRAL","GRID","GRMN","GRNY","GS","GSAT","GSK","GSOL","GT","GTES","GTLB","GTLS","GTM","GTX","GVA","GWRE","GWW","GXO","H","HAE","HAL","HALO","HAS","HASI","HAYW","HBAN","HBM","HCA","HCC","HCI","HD","HDB","HE","HEI","HEI.A","HESM","HGV","HIG","HII","HIMS","HIMX","HIMZ","HIVE","HL","HLI","HLN","HLNE","HLT","HMY","HNGE","HNI","HNRG","HOG","HOMB","HON","HOOD","HP","HPE","HPQ","HQY","HR","HRB","HRI","HRL","HSIC","HST","HSY","HTGC","HTZ","HUBB","HUBS","HUM","HUN","HURN","HUT","HWC","HWM","HXL","HYMC","IAC","IAG","IBKR","IBM","IBN","IBP","IBRX","ICE","ICFI","ICHR","ICLR","IDA","IDCC","IDXX","IE","IEFA","IEMG","IESC","IEX","IFF","IFRX","IGSB","IGV","ILF","ILMN","IMO","IMSR","IMVT","INBX","INCY","INDV","INFQ","INFY","ING","INGM","INGR","INOD","INSM","INSP","INSW","INTC","INTR","INTU","INVH","IONQ","IONS","IOT","IOVA","IP","IPGP","IQV","IR","IRDM","IRE","IREN","IREX","IREZ","IRM","IRT","IRTC","ISRG","IT","ITGR","ITOT","ITRI","ITT","ITUB","ITW","IUSB","IVW","IVZ","IWM","IYR","J","JAAA","JAZZ","JBHT","JBL","JBLU","JBS","JBTM","JCI","JD","JEF","JETS","JHG","JHX","JJSF","JKHY","JLL","JNJ","JOBY","JPM","JPST","JXN","KAI","KALV","KBH","KBR","KD","KDP","KEEL","KEX","KEY","KEYS","KGC","KGS","KHC","KIM","KKR","KLAC","KLAR","KLIC","KMB","KMI","KMPR","KMT","KMX","KN","KNF","KNSA","KNSL","KNTK","KNX","KO","KOPN","KOS","KR","KRC","KRG","KRMN","KRYS","KSS","KTB","KTOS","KVUE","KVYO","KYIV","KYMR","L","LAC","LAD","LAES","LAMR","LAR","LASR","LAUR","LAZ","LBRDK","LBRT","LCID","LCII","LDOS","LEA","LECO","LEG","LEN","LEU","LEVI","LFUS","LGN","LGND","LH","LHX","LI","LII","LIN","LINE","LION","LITE","LITX","LIVN","LKQ","LLY","LLYVK","LMAT","LMB","LMND","LMT","LNC","LNG","LNT","LNTH","LOAR","LOGI","LOPE","LOW","LPLA","LPTH","LPX","LQDA","LRCX","LRN","LSCC","LSTR","LTH","LULU","LUMN","LUNR","LUV","LVS","LW","LWLG","LYB","LYFT","LYG","LYV","LZ","M","MA","MAA","MAC","MANH","MAR","MARA","MAS","MASI","MAT","MATX","MBC","MBLY","MC","MCD","MCHP","MCK","MCO","MCY","MD","MDB","MDGL","MDLN","MDLZ","MDT","MDU","MEDP","MELI","MEOH","MET","META","METU","MFC","MFG","MGA","MGM","MGNI","MGY","MHK","MIAX","MIDD","MIR","MIRM","MKC","MKSI","MKTX","MLI","MLM","MMM","MMS","MMSI","MNDY","MNKD","MNST","MO","MOD","MOG.A","MOH","MORN","MOS","MP","MPC","MPLX","MPWR","MRAM","MRCY","MRK","MRLN","MRNA","MRP","MRSH","MRVL","MRX","MS","MSA","MSCI","MSFT","MSFU","MSGS","MSI","MSM","MSTR","MT","MTB","MTCH","MTD","MTDR","MTG","MTH","MTN","MTRN","MTSI","MTZ","MU","MUB","MUFG","MUR","MUSA","MUX","MVLL","MWA","MXL","MYRG","MZTI","NAT","NAVN","NBIG","NBIS","NBIX","NBR","NCLH","NCNO","NDAQ","NDSN","NE","NEBX","NEE","NEM","NEO","NEOG","NET","NEU","NEXT","NFG","NFLX","NG","NHI","NI","NIO","NKE","NKTR","NLY","NNE","NNN","NOC","NOG","NOK","NOV","NOVT","NOW","NPO","NRG","NRGV","NSA","NSC","NSIT","NTAP","NTLA","NTNX","NTR","NTRA","NTRS","NTSK","NU","NUAI","NUE","NUVL","NVAX","NVD","NVDA","NVDQ","NVMI","NVO","NVST","NVT","NVTS","NWG","NWL","NWS","NWSA","NXE","NXPI","NXST","NXT","NYT","O","OBDC","OC","OCUL","ODFL","OGE","OGN","OGS","OHI","OII","OKE","OKLL","OKLO","OKTA","OLED","OLLI","OLN","OMC","OMF","ON","ONB","ONDS","ONON","ONTO","OPCH","OPEN","OPLN","ORA","ORC","ORCL","ORCX","ORI","ORKA","ORLA","ORLY","OSCR","OSIS","OSK","OSS","OTEX","OTIS","OUST","OUT","OVV","OWL","OXY","OZK","P","PAA","PAAS","PAG","PAGP","PAGS","PANW","PAR","PARA","PARR","PATH","PATK","PAYC","PAYX","PB","PBA","PBF","PBI","PBR","PBR.A","PCAR","PCG","PCOR","PCT","PCTY","PCVX","PD","PDBC","PDD","PEAK","PEB","PEG","PEGA","PEN","PENG","PENN","PEP","PFE","PFG","PFGC","PFSI","PG","PGR","PGX","PGY","PH","PHG","PHIN","PHM","PHR","PHYS","PI","PII","PINS","PIPR","PJT","PK","PKG","PL","PLAB","PLD","PLMR","PLNT","PLTD","PLTR","PLTU","PLUG","PLXS","PM","PMT","PNC","PNFP","PNR","PNW","PODD","POET","PONY","POOL","POR","POST","POWI","POWL","PPC","PPG","PPL","PPTA","PR","PRAX","PRGO","PRI","PRIM","PRKS","PRM","PRMB","PRU","PSA","PSIX","PSKY","PSMT","PSN","PSQ","PSX","PTC","PTCT","PTEN","PTGX","PTIR","PTON","PUMP","PURR","PVH","PVLA","PWR","PYPL","PZZA","Q","QBTS","QCOM","QDEL","QGEN","QLYS","QQQ","QQQI","QQQM","QRVO","QS","QSR","QUBT","QURE","QXO","R","RACE","RAL","RARE","RBA","RBC","RBLX","RBRK","RCAT","RCI","RCL","RCUS","RDDT","RDN","RDNT","RDW","REAL","REET","REG","REGN","RELX","RELY","REXR","REYN","RF","RGA","RGEN","RGLD","RGTI","RGTZ","RH","RHI","RHP","RIG","RIO","RIOT","RITM","RIVN","RJF","RKLB","RKLX","RKT","RL","RLAY","RLI","RLJ","RMBS","RMD","RNG","RNR","ROAD","ROG","ROIV","ROK","ROKU","ROL","ROP","ROST","RPD","RPM","RPRX","RR","RRC","RRR","RRX","RS","RSG","RSI","RSP","RTX","RUN","RUSHA","RVLV","RVMD","RVTY","RWM","RXO","RXRX","RY","RYAN","RYN","RYTM","RZLV","S","SAIA","SAIC","SAIL","SAM","SAN","SANM","SAP","SARO","SATL","SATS","SBAC","SBET","SBLK","SBRA","SBSW","SBUX","SCCO","SCHB","SCHE","SCHF","SCHG","SCHH","SCHI","SCHO","SCHP","SCHR","SCHV","SCHW","SCHX","SCI","SDOW","SE","SEDG","SEI","SEIC","SERV","SEZL","SF","SFM","SG","SGHC","SGI","SGML","SGOL","SGOV","SGRY","SH","SHAK","SHC","SHEL","SHLD","SHLS","SHO","SHOO","SHOP","SHV","SHW","SHYG","SIDU","SIG","SIGI","SII","SILA","SILJ","SIRI","SITE","SITM","SIVR","SJM","SJNK","SKT","SKY","SKYT","SLAB","SLB","SLDP","SLF","SLG","SLM","SLNO","SLP","SM","SMCI","SMCX","SMFG","SMG","SMMT","SMPL","SMR","SMTC","SMX","SN","SNA","SNAP","SNDK","SNDR","SNDX","SNEX","SNOW","SNPS","SNX","SNXX","SNY","SO","SOBO","SOFI","SOLS","SOLV","SON","SONY","SOUN","SPAB","SPB","SPCX","SPDN","SPDW","SPG","SPGI","SPHR","SPHY","SPIB","SPIR","SPLB","SPLV","SPMO","SPOT","SPSB","SPSM","SPTI","SPTL","SPXC","SPXU","SPY","SPYG","SPYI","SPYM","SPYV","SQ","SQM","SR","SRAD","SRE","SRLN","SRPT","SRRK","SSB","SSD","SSL","SSNC","SSRM","ST","STAA","STAG","STE","STEP","STLA","STLD","STM","STN","STNE","STNG","STRC","STRL","STT","STUB","STWD","STX","STZ","SU","SUI","SUN","SUNB","SUNC","SUPN","SUZ","SVM","SW","SWK","SWKS","SWX","SXT","SYF","SYK","SYM","SYNA","SYRE","SYY","T","TAC","TAK","TAL","TALO","TAP","TARS","TBIL","TBLA","TCBI","TD","TDC","TDG","TDOC","TDW","TDY","TE","TEAM","TECH","TECK","TEL","TEM","TENB","TER","TERN","TETH","TEVA","TEX","TFC","TFII","TFLO","TFX","TGB","TGT","TGTX","THC","THG","THO","THR","TIC","TIGO","TIGR","TIP","TJX","TKO","TKR","TLH","TLN","TLRY","TMC","TMDX","TME","TMHC","TMO","TMUS","TNC","TNDM","TNGX","TNL","TOL","TOST","TPC","TPG","TPH","TPL","TPR","TREX","TRGP","TRI","TRIN","TRIP","TRMB","TRMD","TROW","TROX","TRP","TRU","TRV","TSCO","TSDD","TSEM","TSL","TSLA","TSLG","TSLQ","TSLT","TSLX","TSLZ","TSM","TSN","TT","TTAN","TTC","TTD","TTE","TTEK","TTI","TTMI","TTWO","TU","TVTX","TW","TWLO","TWST","TXG","TXN","TXNM","TXRH","TXT","TYL","U","UAA","UAL","UAMY","UBER","UBS","UCTT","UDOW","UDR","UEC","UFPI","UFPT","UGI","UGL","UGP","UGRO","UHS","UL","ULCC","ULS","ULTA","UMAC","UMBF","UMC","UNF","UNH","UNIT","UNM","UNP","UPS","UPST","UPWK","URA","URBN","URGN","URI","USAR","USAS","USB","USFD","USFR","USHY","UTHR","UTI","UUUU","UWMC","V","VAC","VAL","VALE","VC","VCIT","VCLT","VCSH","VCTR","VCX","VCYT","VECO","VEEV","VERA","VET","VFC","VG","VGIT","VGK","VGNT","VGSH","VIAV","VICI","VICR","VIK","VIRT","VISN","VITL","VKTX","VLO","VLTO","VLY","VMC","VMI","VNET","VNO","VNOM","VNT","VOD","VOYA","VOYG","VRDN","VRNS","VRSK","VRSN","VRT","VRTX","VSAT","VSCO","VSEC","VSH","VSNT","VST","VT","VTEB","VTR","VTRS","VTWO","VVV","VVX","VXUS","VZ","W","WAB","WAL","WAT","WAY","WBD","WBS","WCC","WCN","WDAY","WDC","WEAT","WEC","WELL","WEN","WERN","WES","WEX","WFC","WFRD","WGS","WH","WHR","WING","WIX","WK","WLK","WM","WMB","WMG","WMS","WMT","WOLF","WPC","WPM","WRB","WRBY","WRD","WSC","WSM","WSO","WSR","WST","WT","WTFC","WTRG","WTS","WTTR","WTW","WU","WULF","WWD","WY","WYNN","XE","XEL","XENE","XIFR","XLC","XME","XMTR","XNDU","XOM","XOVR","XP","XPEV","XPO","XRAY","XYL","XYZ","YETI","YINN","YLD","YMM","YOU","YSS","YUM","YUMC","Z","ZBH","ZBRA","ZETA","ZG","ZIM","ZION","ZM","ZNTL","ZS","ZSL","ZTS","ZWS"];
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
            // Current fiscal year = the year immediately before the forward year — the base for
            // forward-vs-current YoY growth. null if that year's estimate isn't available.
            const baseYearStr = String(Number(nextYearData.date.slice(0, 4)) - 1);
            const currentYearData = forwardData.find(f => f.date && f.date.slice(0, 4) === baseYearStr);
            forwardMap[ticker] = {
              eps: nextYearData.epsAvg,
              revenue: nextYearData.revenueAvg,
              year: nextYearData.date.slice(0, 4),
              currentEps: (currentYearData && currentYearData.epsAvg !== undefined) ? currentYearData.epsAvg : null,
              currentRevenue: (currentYearData && currentYearData.revenueAvg) ? currentYearData.revenueAvg : null,
            };
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
  // Step 2: FMP Earnings Calendar (1 API call)
  // ═══════════════════════════════════════════
  const earningsMap = {};
  try {
    const toDate = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    const earningsAll = await httpsGet('https://financialmodelingprep.com/stable/earnings-calendar?from=' + today + '&to=' + toDate + '&apikey=' + FMP_KEY, 15000);
    const earningsArr = Array.isArray(earningsAll) ? earningsAll : [];
    const tickerSet = new Set(UNIVERSE);
    for (const e of earningsArr) {
      if (!tickerSet.has(e.symbol)) continue;
      if (!earningsMap[e.symbol] || new Date(e.date) < new Date(earningsMap[e.symbol].date)) {
        earningsMap[e.symbol] = e;
      }
    }
    console.log('Step 2 done: ' + Object.keys(earningsMap).length + ' tickers with upcoming earnings from ' + earningsArr.length + ' events');
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
      const item = {
        pattern: 'EARNINGS:' + ticker,
        timestamp: Date.now(),
        // Earnings calendar fields (null if not in calendar)
        nextDate: cal ? cal.date : null,
        daysUntil: daysUntil,
        epsEstimate: cal ? (cal.epsEstimated || null) : null,
        quarter: null,
        year: null,
        hour: null,
        // Forward fields (from analyst-estimates)
        forwardEps: fw.eps || null,
        forwardRevenue: fw.revenue || null,
        forwardYear: fw.year || null,
        // Current-FY estimate (base for forward-vs-current YoY growth)
        currentEps: (fw.currentEps != null) ? fw.currentEps : null,
        currentRevenue: (fw.currentRevenue != null) ? fw.currentRevenue : null,
        // Revision fields
        forwardEpsRevision: revisionEps,
        forwardEpsRevisionDate: revisionDate,
        forwardRevRevision: revisionRev,
        forwardRevRevisionDate: revRevisionDate,
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
