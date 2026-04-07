
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs || 15000);
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-HQ/7.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { clearTimeout(to); try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', (e) => { clearTimeout(to); reject(e); });
  });
}

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const FMP_KEY = process.env.FMP_API_KEY || '';
const UNIVERSE = ["AA","AAAU","AAL","AAOI","AAPL","ABBV","ABNB","ABT","ACHR","ACI","ACN","ACWI","ACWX","ADBE","ADI","ADM","ADMA","ADP","ADT","ADTN","AEG","AEM","AEO","AEP","AES","AFRM","AG","AGI","AGNC","AGQ","AGRO","AHRT","AI","AIG","AKAM","AKR","ALAB","ALGN","ALHC","ALK","ALLY","ALM","AMAT","AMCR","AMD","AMDD","AMGN","AMPX","AMRZ","AMZN","ANET","ANSS","APA","APD","APH","APLD","APO","APP","AQN","AR","ARCC","ARDX","ARE","ARES","ARIS","ARKB","ARM","ARR","ARRY","AS","ASAN","ASHR","ASM","ASML","ASST","ASTS","ASX","ATAT","AU","AUGO","AVGO","AVTR","AWK","AXP","AXTA","AXTI","B","BA","BABA","BABX","BAC","BAM","BAX","BBJP","BBVA","BBWI","BBY","BCE","BCRX","BCS","BE","BEKE","BEN","BETA","BF.B","BHP","BIDU","BIIB","BIL","BILI","BIRK","BITB","BITI","BIV","BIZD","BKLN","BKNG","BKR","BLK","BLMN","BMNR","BMY","BN","BNDX","BNO","BP","BRK.B","BROS","BSV","BSX","BTC","BTCZ","BTDR","BTI","BTU","BULL","BVN","BW","BX","BZ","C","CAG","CALY","CARR","CAT","CCC","CCI","CCJ","CCL","CCUP","CDE","CDNS","CEG","CELH","CENX","CF","CFG","CG","CGAU","CGDV","CGGR","CHTR","CHWY","CHYM","CIEN","CIFR","CL","CLF","CLSK","CMCSA","CMG","CMPS","CNC","CNH","CNQ","CNR","COF","COHR","COIN","COLB","COMP","COP","COPX","CORN","CORZ","COST","COUR","CPB","CPER","CPNG","CPRT","CRCA","CRCG","CRCL","CRDO","CRGY","CRH","CRK","CRM","CRML","CRWD","CRWV","CSCO","CSGP","CSIQ","CSTM","CSX","CTAS","CTMX","CTRA","CTSH","CTVA","CUK","CVE","CVI","CVNA","CVS","CVX","CWAN","CWH","CX","CZR","D","DAL","DAR","DASH","DAWN","DB","DBRG","DCH","DD","DDOG","DE","DELL","DFAC","DHR","DHT","DIS","DJT","DKNG","DLO","DLR","DLTR","DOC","DOCN","DOCU","DOG","DOV","DOW","DPZ","DRI","DRVN","DT","DUK","DVN","DX","DXCM","DYN","DYNF","EA","EBAY","EC","ECL","EFV","EGO","EL","ELA","ELAN","EMB","EMBJ","EMLC","EMR","EMXC","ENB","ENPH","EOG","EOSE","EPD","EQIX","EQNR","EQR","EQT","EQX","ERAS","ERIC","ERY","ET","ETH","ETHA","ETHE","ETHT","ETHU","ETN","EW","EWA","EWC","EWG","EWH","EWT","EXC","EXE","EXK","EZU","F","FANG","FAST","FBTC","FCG","FCX","FDX","FE","FENY","FETH","FEZ","FHN","FIG","FIGR","FINV","FISV","FITB","FIVE","FLG","FLNC","FLO","FLR","FLY","FMC","FNB","FND","FNDE","FNDX","FNF","FORM","FOXA","FRMI","FRO","FRSH","FSK","FSLR","FSLY","FSM","FTI","FTNT","FTV","FUTU","FXN","GAP","GBDC","GD","GDX","GDXJ","GDXY","GE","GEHC","GEMI","GEN","GEV","GFI","GFS","GGLS","GILD","GIS","GLL","GLNG","GLW","GLXY","GM","GME","GO","GOOG","GOOGL","GOVT","GOVZ","GPGI","GPK","GPN","GPZ","GRDN","GRMN","GS","GSIT","GSK","GSLC","GT","GTLB","GTM","GUSH","HAFN","HAL","HBAN","HBM","HCA","HD","HDB","HE","HEFA","HGER","HIMS","HIMX","HL","HLN","HMY","HOG","HON","HOOD","HPE","HPQ","HSBC","HSIC","HST","HSY","HTFL","HUBS","HUM","HUN","HUT","HYMC","IAG","IBKR","IBM","IBN","IBRX","ICE","ICL","IDXX","IE","IEFA","IEI","IEMG","IEUR","IFF","IGIB","IGLB","IGLD","IGSB","IGV","ILF","ILMN","IMSR","INCY","INFQ","INFY","ING","INTC","INTU","INVH","IONQ","IOT","IP","IQV","IR","IREN","IREZ","ISRG","IT","ITB","ITOT","ITUB","ITW","IUSB","IUSV","IVW","IWD","IWF","IWR","IXUS","IYE","IYH","IYR","JAAA","JBS","JCI","JD","JETS","JHG","JHX","JNJ","JOBY","JPM","JPST","KBWB","KC","KDP","KEY","KGC","KHC","KIM","KKR","KLAC","KLAR","KMB","KMI","KO","KR","KSS","KTOS","KVUE","LAR","LBRT","LCID","LDOS","LI","LIN","LITE","LITX","LKQ","LLY","LMND","LMT","LNG","LOW","LRCX","LTRX","LULU","LUMN","LUNR","LUV","LVS","LWLG","LXU","LYB","LYFT","LYG","LYV","M","MA","MAR","MARA","MASI","MAT","MBLY","MCD","MCHP","MCO","MCW","MDB","MDLN","MDLZ","MDT","MELI","MEOH","MET","META","METC","METU","MFG","MGA","MGM","MNST","MO","MOS","MP","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSFU","MSI","MSTR","MT","MTB","MTCH","MTD","MU","MUB","MUFG","MUX","NAIL","NAT","NBIG","NBIS","NBIZ","NCLH","NDAQ","NDSN","NEE","NEM","NET","NEXT","NFLX","NG","NGD","NIO","NKE","NLY","NOC","NOG","NOK","NOV","NOW","NSC","NTLA","NTR","NTRS","NTSK","NU","NUE","NVAX","NVD","NVDA","NVDQ","NVO","NVS","NVTS","NWG","NXE","O","OBDC","OCUL","ODFL","OKE","OKLL","OKLO","OKTA","OMC","ON","ONDG","ONDS","ONON","OPEN","ORC","ORCL","ORCX","ORLA","ORLY","OSCR","OSS","OTIS","OUNZ","OVV","OWL","OXY","PAA","PAAS","PAGP","PANW","PARA","PATH","PAYX","PBF","PBI","PBR","PBR.A","PCAR","PCG","PCT","PDBC","PDD","PDYN","PEAK","PEG","PEP","PFE","PG","PGX","PHM","PHYS","PINS","PL","PLD","PLTD","PLTR","PM","PNC","POET","PONY","POOL","PPG","PPL","PPTA","PR","PRMB","PSA","PSKY","PSQ","PSX","PTC","PTEN","PTIR","PULS","PWR","PYPL","QBTS","QBTX","QCOM","QFIN","QQQI","QQQM","QS","QSR","QUAL","QUBT","QXO","RBLX","RBRK","RCAT","RDDT","RDW","REGN","RELX","RES","RF","RGTI","RIG","RIO","RIOT","RITM","RIVN","RKLB","RKLX","RKT","ROIV","ROK","ROKU","ROP","ROST","RRC","RSG","RSP","RTX","RUN","RWM","RYN","S","SA","SAIL","SAN","SAP","SATS","SBAC","SBET","SBIT","SBSW","SBUX","SCCO","SCHB","SCHE","SCHF","SCHG","SCHH","SCHI","SCHK","SCHO","SCHP","SCHV","SCHW","SCHX","SDOW","SDVY","SE","SEDG","SEI","SEM","SERV","SFM","SG","SGML","SGOL","SGOV","SH","SHEL","SHLS","SHO","SHOP","SHV","SHW","SIG","SIL","SILJ","SIVR","SJNK","SKE","SLB","SLVP","SM","SMCI","SMR","SNA","SNDK","SNOW","SNPS","SNXX","SNY","SO","SOC","SOFI","SONY","SOUN","SPAB","SPDN","SPDW","SPEM","SPG","SPHY","SPIB","SPLB","SPLV","SPMD","SPMO","SPOT","SPSB","SPSM","SPTI","SPTL","SPTM","SPXU","SPYD","SPYG","SPYI","SPYM","SPYV","SQ","SRE","SRLN","SRTY","SSL","SSRM","STAA","STE","STLA","STM","STNG","STT","STUB","STX","STZ","SU","SUNB","SUZ","SVM","SW","SWK","SWKS","SYF","SYK","SYM","SYY","T","TALK","TBIL","TCOM","TDG","TDOC","TE","TEAM","TECK","TEL","TEM","TER","TERN","TEVA","TFC","TGB","TGNA","TGT","TGTX","TIGR","TIP","TJX","TLRY","TMC","TME","TMO","TMUS","TNDM","TNGX","TOST","TPH","TRGP","TRIP","TROW","TROX","TRV","TSCO","TSDD","TSEM","TSLA","TSLG","TSLQ","TSLT","TSLZ","TSM","TSN","TT","TTD","TTE","TTWO","TU","TWLO","TWO","TXN","TYL","U","UAA","UAL","UAMY","UBER","UBS","UDOW","UEC","UGL","UGP","UL","UMAC","UMC","UNH","UNP","UPS","UPST","URA","URI","USAR","USAS","USB","USFR","USHY","USIG","USMV","UUUU","V","VALE","VCIT","VCLT","VCSH","VELO","VET","VEU","VFC","VG","VGIT","VGK","VGLT","VGSH","VIAV","VICI","VIST","VITL","VKTX","VLO","VLY","VMC","VNET","VNOM","VOD","VONV","VRSK","VRT","VRTX","VST","VT","VTEB","VTIP","VTR","VTRS","VTWO","VXUS","VZ","WBD","WBS","WDAY","WDC","WDS","WELL","WEN","WFC","WIX","WMB","WMG","WMT","WPM","WRD","WSC","WU","WULF","WVE","WY","XEL","XLC","XLG","XME","XOM","XP","XPEV","XRAY","XYZ","YANG","YEXT","YINN","YMM","YPF","Z","ZETA","ZS","ZSL","ZTO","ZTS"];
const UNIVERSE_500 = ["AA","AAAU","AAL","AAOI","AAPL","ABBV","ABNB","ABT","ACHR","ACI","ACN","ACWI","ACWX","ADBE","ADI","ADM","ADMA","ADP","ADT","ADTN","AEG","AEM","AEO","AEP","AES","AFRM","AG","AGI","AGNC","AGQ","AGRO","AHRT","AI","AIG","AKAM","AKR","ALAB","ALGN","ALHC","ALK","ALLY","ALM","AMAT","AMCR","AMD","AMDD","AMGN","AMPX","AMRZ","AMZN","ANET","ANSS","APA","APD","APH","APLD","APO","APP","AQN","AR","ARCC","ARDX","ARE","ARES","ARIS","ARKB","ARM","ARR","ARRY","AS","ASAN","ASHR","ASM","ASML","ASST","ASTS","ASX","ATAT","AU","AUGO","AVGO","AVTR","AWK","AXP","AXTA","AXTI","B","BA","BABA","BABX","BAC","BAM","BAX","BBJP","BBVA","BBWI","BBY","BCE","BCRX","BCS","BE","BEKE","BEN","BETA","BF.B","BHP","BIDU","BIIB","BIL","BILI","BIRK","BITB","BITI","BIV","BIZD","BKLN","BKNG","BKR","BLK","BLMN","BMNR","BMY","BN","BNDX","BNO","BP","BRK.B","BROS","BSV","BSX","BTC","BTCZ","BTDR","BTI","BTU","BULL","BVN","BW","BX","BZ","C","CAG","CALY","CARR","CAT","CCC","CCI","CCJ","CCL","CCUP","CDE","CDNS","CEG","CELH","CENX","CF","CFG","CG","CGAU","CGDV","CGGR","CHTR","CHWY","CHYM","CIEN","CIFR","CL","CLF","CLSK","CMCSA","CMG","CMPS","CNC","CNH","CNQ","CNR","COF","COHR","COIN","COLB","COMP","COP","COPX","CORN","CORZ","COST","COUR","CPB","CPER","CPNG","CPRT","CRCA","CRCG","CRCL","CRDO","CRGY","CRH","CRK","CRM","CRML","CRWD","CRWV","CSCO","CSGP","CSIQ","CSTM","CSX","CTAS","CTMX","CTRA","CTSH","CTVA","CUK","CVE","CVI","CVNA","CVS","CVX","CWAN","CWH","CX","CZR","D","DAL","DAR","DASH","DAWN","DB","DBRG","DCH","DD","DDOG","DE","DELL","DFAC","DHR","DHT","DIS","DJT","DKNG","DLO","DLR","DLTR","DOC","DOCN","DOCU","DOG","DOV","DOW","DPZ","DRI","DRVN","DT","DUK","DVN","DX","DXCM","DYN","DYNF","EA","EBAY","EC","ECL","EFV","EGO","EL","ELA","ELAN","EMB","EMBJ","EMLC","EMR","EMXC","ENB","ENPH","EOG","EOSE","EPD","EQIX","EQNR","EQR","EQT","EQX","ERAS","ERIC","ERY","ET","ETH","ETHA","ETHE","ETHT","ETHU","ETN","EW","EWA","EWC","EWG","EWH","EWT","EXC","EXE","EXK","EZU","F","FANG","FAST","FBTC","FCG","FCX","FDX","FE","FENY","FETH","FEZ","FHN","FIG","FIGR","FINV","FISV","FITB","FIVE","FLG","FLNC","FLO","FLR","FLY","FMC","FNB","FND","FNDE","FNDX","FNF","FORM","FOXA","FRMI","FRO","FRSH","FSK","FSLR","FSLY","FSM","FTI","FTNT","FTV","FUTU","FXN","GAP","GBDC","GD","GDX","GDXJ","GDXY","GE","GEHC","GEMI","GEN","GEV","GFI","GFS","GGLS","GILD","GIS","GLL","GLNG","GLW","GLXY","GM","GME","GO","GOOG","GOOGL","GOVT","GOVZ","GPGI","GPK","GPN","GPZ","GRDN","GRMN","GS","GSIT","GSK","GSLC","GT","GTLB","GTM","GUSH","HAFN","HAL","HBAN","HBM","HCA","HD","HDB","HE","HEFA","HGER","HIMS","HIMX","HL","HLN","HMY","HOG","HON","HOOD","HPE","HPQ","HSBC","HSIC","HST","HSY","HTFL","HUBS","HUM","HUN","HUT","HYMC","IAG","IBKR","IBM","IBN","IBRX","ICE","ICL","IDXX","IE","IEFA","IEI","IEMG","IEUR","IFF","IGIB","IGLB","IGLD","IGSB","IGV","ILF","ILMN","IMSR","INCY","INFQ","INFY","ING","INTC","INTU","INVH","IONQ","IOT","IP","IQV","IR","IREN","IREZ","ISRG","IT","ITB","ITOT","ITUB","ITW","IUSB","IUSV","IVW","IWD","IWF","IWR","IXUS","IYE","IYH","IYR","JAAA","JBS","JCI","JD","JETS","JHG","JHX","JNJ","JOBY","JPM","JPST","KBWB","KC","KDP","KEY","KGC","KHC","KIM","KKR","KLAC","KLAR","KMB","KMI","KO","KR","KSS","KTOS","KVUE","LAR","LBRT","LCID","LDOS","LI","LIN","LITE","LITX","LKQ","LLY","LMND","LMT","LNG","LOW","LRCX","LTRX","LULU","LUMN","LUNR","LUV","LVS","LWLG","LXU","LYB","LYFT","LYG","LYV","M","MA","MAR","MARA","MASI","MAT","MBLY","MCD","MCHP","MCO","MCW","MDB","MDLN","MDLZ","MDT","MELI","MEOH","MET","META","METC","METU","MFG","MGA","MGM","MNST","MO","MOS","MP","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSFU","MSI","MSTR","MT","MTB","MTCH","MTD","MU","MUB","MUFG","MUX","NAIL","NAT","NBIG","NBIS","NBIZ","NCLH","NDAQ","NDSN","NEE","NEM","NET","NEXT","NFLX","NG","NGD","NIO","NKE","NLY","NOC","NOG","NOK","NOV","NOW","NSC","NTLA","NTR","NTRS","NTSK","NU","NUE","NVAX","NVD","NVDA","NVDQ","NVO","NVS","NVTS","NWG","NXE","O","OBDC","OCUL","ODFL","OKE","OKLL","OKLO","OKTA","OMC","ON","ONDG","ONDS","ONON","OPEN","ORC","ORCL","ORCX","ORLA","ORLY","OSCR","OSS","OTIS","OUNZ","OVV","OWL","OXY","PAA","PAAS","PAGP","PANW","PARA","PATH","PAYX","PBF","PBI","PBR","PBR.A","PCAR","PCG","PCT","PDBC","PDD","PDYN","PEAK","PEG","PEP","PFE","PG","PGX","PHM","PHYS","PINS","PL","PLD","PLTD","PLTR","PM","PNC","POET","PONY","POOL","PPG","PPL","PPTA","PR","PRMB","PSA","PSKY","PSQ","PSX","PTC","PTEN","PTIR","PULS","PWR","PYPL","QBTS","QBTX","QCOM","QFIN","QQQI","QQQM","QS","QSR","QUAL","QUBT","QXO","RBLX","RBRK","RCAT","RDDT","RDW","REGN","RELX","RES","RF","RGTI","RIG","RIO","RIOT","RITM","RIVN","RKLB","RKLX","RKT","ROIV","ROK","ROKU","ROP","ROST","RRC","RSG","RSP","RTX","RUN","RWM","RYN","S","SA","SAIL","SAN","SAP","SATS","SBAC","SBET","SBIT","SBSW","SBUX","SCCO","SCHB","SCHE","SCHF","SCHG","SCHH","SCHI","SCHK","SCHO","SCHP","SCHV","SCHW","SCHX","SDOW","SDVY","SE","SEDG","SEI","SEM","SERV","SFM","SG","SGML","SGOL","SGOV","SH","SHEL","SHLS","SHO","SHOP","SHV","SHW","SIG","SIL","SILJ","SIVR","SJNK","SKE","SLB","SLVP","SM","SMCI","SMR","SNA","SNDK","SNOW","SNPS","SNXX","SNY","SO","SOC","SOFI","SONY","SOUN","SPAB","SPDN","SPDW","SPEM","SPG","SPHY","SPIB","SPLB","SPLV","SPMD","SPMO","SPOT","SPSB","SPSM","SPTI","SPTL","SPTM","SPXU","SPYD","SPYG","SPYI","SPYM","SPYV","SQ","SRE","SRLN","SRTY","SSL","SSRM","STAA","STE","STLA","STM","STNG","STT","STUB","STX","STZ","SU","SUNB","SUZ","SVM","SW","SWK","SWKS","SYF","SYK","SYM","SYY","T","TALK","TBIL","TCOM","TDG","TDOC","TE","TEAM","TECK","TEL","TEM","TER","TERN","TEVA","TFC","TGB","TGNA","TGT","TGTX","TIGR","TIP","TJX","TLRY","TMC","TME","TMO","TMUS","TNDM","TNGX","TOST","TPH","TRGP","TRIP","TROW","TROX","TRV","TSCO","TSDD","TSEM","TSLA","TSLG","TSLQ","TSLT","TSLZ","TSM","TSN","TT","TTD","TTE","TTWO","TU","TWLO","TWO","TXN","TYL","U","UAA","UAL","UAMY","UBER","UBS","UDOW","UEC","UGL","UGP","UL","UMAC","UMC","UNH","UNP","UPS","UPST","URA","URI","USAR","USAS","USB","USFR","USHY","USIG","USMV","UUUU","V","VALE","VCIT","VCLT","VCSH","VELO","VET","VEU","VFC","VG","VGIT","VGK","VGLT","VGSH","VIAV","VICI","VIST","VITL","VKTX","VLO","VLY","VMC","VNET","VNOM","VOD","VONV","VRSK","VRT","VRTX","VST","VT","VTEB","VTIP","VTR","VTRS","VTWO","VXUS","VZ","WBD","WBS","WDAY","WDC","WDS","WELL","WEN","WFC","WIX","WMB","WMG","WMT","WPM","WRD","WSC","WU","WULF","WVE","WY","XEL","XLC","XLG","XME","XOM","XP","XPEV","XRAY","XYZ","YANG","YEXT","YINN","YMM","YPF","Z","ZETA","ZS","ZSL","ZTO","ZTS"];
const GEX_TICKERS = ["AA","AAAU","AAL","AAOI","AAPL","ABBV","ABNB","ABT","ACHR","ACI","ACN","ACWI","ACWX","ADBE","ADI","ADM","ADMA","ADP","ADT","ADTN","AEG","AEM","AEO","AEP","AES","AFRM","AG","AGI","AGNC","AGQ","AGRO","AHRT","AI","AIG","AKAM","AKR","ALAB","ALGN","ALHC","ALK","ALLY","ALM","AMAT","AMCR","AMD","AMDD","AMGN","AMPX","AMRZ","AMZN","ANET","ANSS","APA","APD","APH","APLD","APO","APP","AQN","AR","ARCC","ARDX","ARE","ARES","ARIS","ARKB","ARM","ARR","ARRY","AS","ASAN","ASHR","ASM","ASML","ASST","ASTS","ASX","ATAT","AU","AUGO","AVGO","AVTR","AWK","AXP","AXTA","AXTI","B","BA","BABA","BABX","BAC","BAM","BAX","BBJP","BBVA","BBWI","BBY","BCE","BCRX","BCS","BE","BEKE","BEN","BETA","BF.B","BHP","BIDU","BIIB","BIL","BILI","BIRK","BITB","BITI","BIV","BIZD","BKLN","BKNG","BKR","BLK","BLMN","BMNR","BMY","BN","BNDX","BNO","BP","BRK.B","BROS","BSV","BSX","BTC","BTCZ","BTDR","BTI","BTU","BULL","BVN","BW","BX","BZ","C","CAG","CALY","CARR","CAT","CCC","CCI","CCJ","CCL","CCUP","CDE","CDNS","CEG","CELH","CENX","CF","CFG","CG","CGAU","CGDV","CGGR","CHTR","CHWY","CHYM","CIEN","CIFR","CL","CLF","CLSK","CMCSA","CMG","CMPS","CNC","CNH","CNQ","CNR","COF","COHR","COIN","COLB","COMP","COP","COPX","CORN","CORZ","COST","COUR","CPB","CPER","CPNG","CPRT","CRCA","CRCG","CRCL","CRDO","CRGY","CRH","CRK","CRM","CRML","CRWD","CRWV","CSCO","CSGP","CSIQ","CSTM","CSX","CTAS","CTMX","CTRA","CTSH","CTVA","CUK","CVE","CVI","CVNA","CVS","CVX","CWAN","CWH","CX","CZR","D","DAL","DAR","DASH","DAWN","DB","DBRG","DCH","DD","DDOG","DE","DELL","DFAC","DHR","DHT","DIS","DJT","DKNG","DLO","DLR","DLTR","DOC","DOCN","DOCU","DOG","DOV","DOW","DPZ","DRI","DRVN","DT","DUK","DVN","DX","DXCM","DYN","DYNF","EA","EBAY","EC","ECL","EFV","EGO","EL","ELA","ELAN","EMB","EMBJ","EMLC","EMR","EMXC","ENB","ENPH","EOG","EOSE","EPD","EQIX","EQNR","EQR","EQT","EQX","ERAS","ERIC","ERY","ET","ETH","ETHA","ETHE","ETHT","ETHU","ETN","EW","EWA","EWC","EWG","EWH","EWT","EXC","EXE","EXK","EZU","F","FANG","FAST","FBTC","FCG","FCX","FDX","FE","FENY","FETH","FEZ","FHN","FIG","FIGR","FINV","FISV","FITB","FIVE","FLG","FLNC","FLO","FLR","FLY","FMC","FNB","FND","FNDE","FNDX","FNF","FORM","FOXA","FRMI","FRO","FRSH","FSK","FSLR","FSLY","FSM","FTI","FTNT","FTV","FUTU","FXN","GAP","GBDC","GD","GDX","GDXJ","GDXY","GE","GEHC","GEMI","GEN","GEV","GFI","GFS","GGLS","GILD","GIS","GLL","GLNG","GLW","GLXY","GM","GME","GO","GOOG","GOOGL","GOVT","GOVZ","GPGI","GPK","GPN","GPZ","GRDN","GRMN","GS","GSIT","GSK","GSLC","GT","GTLB","GTM","GUSH","HAFN","HAL","HBAN","HBM","HCA","HD","HDB","HE","HEFA","HGER","HIMS","HIMX","HL","HLN","HMY","HOG","HON","HOOD","HPE","HPQ","HSBC","HSIC","HST","HSY","HTFL","HUBS","HUM","HUN","HUT","HYMC","IAG","IBKR","IBM","IBN","IBRX","ICE","ICL","IDXX","IE","IEFA","IEI","IEMG","IEUR","IFF","IGIB","IGLB","IGLD","IGSB","IGV","ILF","ILMN","IMSR","INCY","INFQ","INFY","ING","INTC","INTU","INVH","IONQ","IOT","IP","IQV","IR","IREN","IREZ","ISRG","IT","ITB","ITOT","ITUB","ITW","IUSB","IUSV","IVW","IWD","IWF","IWR","IXUS","IYE","IYH","IYR","JAAA","JBS","JCI","JD","JETS","JHG","JHX","JNJ","JOBY","JPM","JPST","KBWB","KC","KDP","KEY","KGC","KHC","KIM","KKR","KLAC","KLAR","KMB","KMI","KO","KR","KSS","KTOS","KVUE","LAR","LBRT","LCID","LDOS","LI","LIN","LITE","LITX","LKQ","LLY","LMND","LMT","LNG","LOW","LRCX","LTRX","LULU","LUMN","LUNR","LUV","LVS","LWLG","LXU","LYB","LYFT","LYG","LYV","M","MA","MAR","MARA","MASI","MAT","MBLY","MCD","MCHP","MCO","MCW","MDB","MDLN","MDLZ","MDT","MELI","MEOH","MET","META","METC","METU","MFG","MGA","MGM","MNST","MO","MOS","MP","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSFU","MSI","MSTR","MT","MTB","MTCH","MTD","MU","MUB","MUFG","MUX","NAIL","NAT","NBIG","NBIS","NBIZ","NCLH","NDAQ","NDSN","NEE","NEM","NET","NEXT","NFLX","NG","NGD","NIO","NKE","NLY","NOC","NOG","NOK","NOV","NOW","NSC","NTLA","NTR","NTRS","NTSK","NU","NUE","NVAX","NVD","NVDA","NVDQ","NVO","NVS","NVTS","NWG","NXE","O","OBDC","OCUL","ODFL","OKE","OKLL","OKLO","OKTA","OMC","ON","ONDG","ONDS","ONON","OPEN","ORC","ORCL","ORCX","ORLA","ORLY","OSCR","OSS","OTIS","OUNZ","OVV","OWL","OXY","PAA","PAAS","PAGP","PANW","PARA","PATH","PAYX","PBF","PBI","PBR","PBR.A","PCAR","PCG","PCT","PDBC","PDD","PDYN","PEAK","PEG","PEP","PFE","PG","PGX","PHM","PHYS","PINS","PL","PLD","PLTD","PLTR","PM","PNC","POET","PONY","POOL","PPG","PPL","PPTA","PR","PRMB","PSA","PSKY","PSQ","PSX","PTC","PTEN","PTIR","PULS","PWR","PYPL","QBTS","QBTX","QCOM","QFIN","QQQI","QQQM","QS","QSR","QUAL","QUBT","QXO","RBLX","RBRK","RCAT","RDDT","RDW","REGN","RELX","RES","RF","RGTI","RIG","RIO","RIOT","RITM","RIVN","RKLB","RKLX","RKT","ROIV","ROK","ROKU","ROP","ROST","RRC","RSG","RSP","RTX","RUN","RWM","RYN","S","SA","SAIL","SAN","SAP","SATS","SBAC","SBET","SBIT","SBSW","SBUX","SCCO","SCHB","SCHE","SCHF","SCHG","SCHH","SCHI","SCHK","SCHO","SCHP","SCHV","SCHW","SCHX","SDOW","SDVY","SE","SEDG","SEI","SEM","SERV","SFM","SG","SGML","SGOL","SGOV","SH","SHEL","SHLS","SHO","SHOP","SHV","SHW","SIG","SIL","SILJ","SIVR","SJNK","SKE","SLB","SLVP","SM","SMCI","SMR","SNA","SNDK","SNOW","SNPS","SNXX","SNY","SO","SOC","SOFI","SONY","SOUN","SPAB","SPDN","SPDW","SPEM","SPG","SPHY","SPIB","SPLB","SPLV","SPMD","SPMO","SPOT","SPSB","SPSM","SPTI","SPTL","SPTM","SPXU","SPYD","SPYG","SPYI","SPYM","SPYV","SQ","SRE","SRLN","SRTY","SSL","SSRM","STAA","STE","STLA","STM","STNG","STT","STUB","STX","STZ","SU","SUNB","SUZ","SVM","SW","SWK","SWKS","SYF","SYK","SYM","SYY","T","TALK","TBIL","TCOM","TDG","TDOC","TE","TEAM","TECK","TEL","TEM","TER","TERN","TEVA","TFC","TGB","TGNA","TGT","TGTX","TIGR","TIP","TJX","TLRY","TMC","TME","TMO","TMUS","TNDM","TNGX","TOST","TPH","TRGP","TRIP","TROW","TROX","TRV","TSCO","TSDD","TSEM","TSLA","TSLG","TSLQ","TSLT","TSLZ","TSM","TSN","TT","TTD","TTE","TTWO","TU","TWLO","TWO","TXN","TYL","U","UAA","UAL","UAMY","UBER","UBS","UDOW","UEC","UGL","UGP","UL","UMAC","UMC","UNH","UNP","UPS","UPST","URA","URI","USAR","USAS","USB","USFR","USHY","USIG","USMV","UUUU","V","VALE","VCIT","VCLT","VCSH","VELO","VET","VEU","VFC","VG","VGIT","VGK","VGLT","VGSH","VIAV","VICI","VIST","VITL","VKTX","VLO","VLY","VMC","VNET","VNOM","VOD","VONV","VRSK","VRT","VRTX","VST","VT","VTEB","VTIP","VTR","VTRS","VTWO","VXUS","VZ","WBD","WBS","WDAY","WDC","WDS","WELL","WEN","WFC","WIX","WMB","WMG","WMT","WPM","WRD","WSC","WU","WULF","WVE","WY","XEL","XLC","XLG","XME","XOM","XP","XPEV","XRAY","XYZ","YANG","YEXT","YINN","YMM","YPF","Z","ZETA","ZS","ZSL","ZTO","ZTS"];
const DETAIL_TICKERS = ["AA","AAAU","AAL","AAOI","AAPL","ABBV","ABNB","ABT","ACHR","ACI","ACN","ACWI","ACWX","ADBE","ADI","ADM","ADMA","ADP","ADT","ADTN","AEG","AEM","AEO","AEP","AES","AFRM","AG","AGI","AGNC","AGQ","AGRO","AHRT","AI","AIG","AKAM","AKR","ALAB","ALGN","ALHC","ALK","ALLY","ALM","AMAT","AMCR","AMD","AMDD","AMGN","AMPX","AMRZ","AMZN","ANET","ANSS","APA","APD","APH","APLD","APO","APP","AQN","AR","ARCC","ARDX","ARE","ARES","ARIS","ARKB","ARM","ARR","ARRY","AS","ASAN","ASHR","ASM","ASML","ASST","ASTS","ASX","ATAT","AU","AUGO","AVGO","AVTR","AWK","AXP","AXTA","AXTI","B","BA","BABA","BABX","BAC","BAM","BAX","BBJP","BBVA","BBWI","BBY","BCE","BCRX","BCS","BE","BEKE","BEN","BETA","BF.B","BHP","BIDU","BIIB","BIL","BILI","BIRK","BITB","BITI","BIV","BIZD","BKLN","BKNG","BKR","BLK","BLMN","BMNR","BMY","BN","BNDX","BNO","BP","BRK.B","BROS","BSV","BSX","BTC","BTCZ","BTDR","BTI","BTU","BULL","BVN","BW","BX","BZ","C","CAG","CALY","CARR","CAT","CCC","CCI","CCJ","CCL","CCUP","CDE","CDNS","CEG","CELH","CENX","CF","CFG","CG","CGAU","CGDV","CGGR","CHTR","CHWY","CHYM","CIEN","CIFR","CL","CLF","CLSK","CMCSA","CMG","CMPS","CNC","CNH","CNQ","CNR","COF","COHR","COIN","COLB","COMP","COP","COPX","CORN","CORZ","COST","COUR","CPB","CPER","CPNG","CPRT","CRCA","CRCG","CRCL","CRDO","CRGY","CRH","CRK","CRM","CRML","CRWD","CRWV","CSCO","CSGP","CSIQ","CSTM","CSX","CTAS","CTMX","CTRA","CTSH","CTVA","CUK","CVE","CVI","CVNA","CVS","CVX","CWAN","CWH","CX","CZR","D","DAL","DAR","DASH","DAWN","DB","DBRG","DCH","DD","DDOG","DE","DELL","DFAC","DHR","DHT","DIS","DJT","DKNG","DLO","DLR","DLTR","DOC","DOCN","DOCU","DOG","DOV","DOW","DPZ","DRI","DRVN","DT","DUK","DVN","DX","DXCM","DYN","DYNF","EA","EBAY","EC","ECL","EFV","EGO","EL","ELA","ELAN","EMB","EMBJ","EMLC","EMR","EMXC","ENB","ENPH","EOG","EOSE","EPD","EQIX","EQNR","EQR","EQT","EQX","ERAS","ERIC","ERY","ET","ETH","ETHA","ETHE","ETHT","ETHU","ETN","EW","EWA","EWC","EWG","EWH","EWT","EXC","EXE","EXK","EZU","F","FANG","FAST","FBTC","FCG","FCX","FDX","FE","FENY","FETH","FEZ","FHN","FIG","FIGR","FINV","FISV","FITB","FIVE","FLG","FLNC","FLO","FLR","FLY","FMC","FNB","FND","FNDE","FNDX","FNF","FORM","FOXA","FRMI","FRO","FRSH","FSK","FSLR","FSLY","FSM","FTI","FTNT","FTV","FUTU","FXN","GAP","GBDC","GD","GDX","GDXJ","GDXY","GE","GEHC","GEMI","GEN","GEV","GFI","GFS","GGLS","GILD","GIS","GLL","GLNG","GLW","GLXY","GM","GME","GO","GOOG","GOOGL","GOVT","GOVZ","GPGI","GPK","GPN","GPZ","GRDN","GRMN","GS","GSIT","GSK","GSLC","GT","GTLB","GTM","GUSH","HAFN","HAL","HBAN","HBM","HCA","HD","HDB","HE","HEFA","HGER","HIMS","HIMX","HL","HLN","HMY","HOG","HON","HOOD","HPE","HPQ","HSBC","HSIC","HST","HSY","HTFL","HUBS","HUM","HUN","HUT","HYMC","IAG","IBKR","IBM","IBN","IBRX","ICE","ICL","IDXX","IE","IEFA","IEI","IEMG","IEUR","IFF","IGIB","IGLB","IGLD","IGSB","IGV","ILF","ILMN","IMSR","INCY","INFQ","INFY","ING","INTC","INTU","INVH","IONQ","IOT","IP","IQV","IR","IREN","IREZ","ISRG","IT","ITB","ITOT","ITUB","ITW","IUSB","IUSV","IVW","IWD","IWF","IWR","IXUS","IYE","IYH","IYR","JAAA","JBS","JCI","JD","JETS","JHG","JHX","JNJ","JOBY","JPM","JPST","KBWB","KC","KDP","KEY","KGC","KHC","KIM","KKR","KLAC","KLAR","KMB","KMI","KO","KR","KSS","KTOS","KVUE","LAR","LBRT","LCID","LDOS","LI","LIN","LITE","LITX","LKQ","LLY","LMND","LMT","LNG","LOW","LRCX","LTRX","LULU","LUMN","LUNR","LUV","LVS","LWLG","LXU","LYB","LYFT","LYG","LYV","M","MA","MAR","MARA","MASI","MAT","MBLY","MCD","MCHP","MCO","MCW","MDB","MDLN","MDLZ","MDT","MELI","MEOH","MET","META","METC","METU","MFG","MGA","MGM","MNST","MO","MOS","MP","MPC","MPWR","MRK","MRNA","MRVL","MS","MSCI","MSFT","MSFU","MSI","MSTR","MT","MTB","MTCH","MTD","MU","MUB","MUFG","MUX","NAIL","NAT","NBIG","NBIS","NBIZ","NCLH","NDAQ","NDSN","NEE","NEM","NET","NEXT","NFLX","NG","NGD","NIO","NKE","NLY","NOC","NOG","NOK","NOV","NOW","NSC","NTLA","NTR","NTRS","NTSK","NU","NUE","NVAX","NVD","NVDA","NVDQ","NVO","NVS","NVTS","NWG","NXE","O","OBDC","OCUL","ODFL","OKE","OKLL","OKLO","OKTA","OMC","ON","ONDG","ONDS","ONON","OPEN","ORC","ORCL","ORCX","ORLA","ORLY","OSCR","OSS","OTIS","OUNZ","OVV","OWL","OXY","PAA","PAAS","PAGP","PANW","PARA","PATH","PAYX","PBF","PBI","PBR","PBR.A","PCAR","PCG","PCT","PDBC","PDD","PDYN","PEAK","PEG","PEP","PFE","PG","PGX","PHM","PHYS","PINS","PL","PLD","PLTD","PLTR","PM","PNC","POET","PONY","POOL","PPG","PPL","PPTA","PR","PRMB","PSA","PSKY","PSQ","PSX","PTC","PTEN","PTIR","PULS","PWR","PYPL","QBTS","QBTX","QCOM","QFIN","QQQI","QQQM","QS","QSR","QUAL","QUBT","QXO","RBLX","RBRK","RCAT","RDDT","RDW","REGN","RELX","RES","RF","RGTI","RIG","RIO","RIOT","RITM","RIVN","RKLB","RKLX","RKT","ROIV","ROK","ROKU","ROP","ROST","RRC","RSG","RSP","RTX","RUN","RWM","RYN","S","SA","SAIL","SAN","SAP","SATS","SBAC","SBET","SBIT","SBSW","SBUX","SCCO","SCHB","SCHE","SCHF","SCHG","SCHH","SCHI","SCHK","SCHO","SCHP","SCHV","SCHW","SCHX","SDOW","SDVY","SE","SEDG","SEI","SEM","SERV","SFM","SG","SGML","SGOL","SGOV","SH","SHEL","SHLS","SHO","SHOP","SHV","SHW","SIG","SIL","SILJ","SIVR","SJNK","SKE","SLB","SLVP","SM","SMCI","SMR","SNA","SNDK","SNOW","SNPS","SNXX","SNY","SO","SOC","SOFI","SONY","SOUN","SPAB","SPDN","SPDW","SPEM","SPG","SPHY","SPIB","SPLB","SPLV","SPMD","SPMO","SPOT","SPSB","SPSM","SPTI","SPTL","SPTM","SPXU","SPYD","SPYG","SPYI","SPYM","SPYV","SQ","SRE","SRLN","SRTY","SSL","SSRM","STAA","STE","STLA","STM","STNG","STT","STUB","STX","STZ","SU","SUNB","SUZ","SVM","SW","SWK","SWKS","SYF","SYK","SYM","SYY","T","TALK","TBIL","TCOM","TDG","TDOC","TE","TEAM","TECK","TEL","TEM","TER","TERN","TEVA","TFC","TGB","TGNA","TGT","TGTX","TIGR","TIP","TJX","TLRY","TMC","TME","TMO","TMUS","TNDM","TNGX","TOST","TPH","TRGP","TRIP","TROW","TROX","TRV","TSCO","TSDD","TSEM","TSLA","TSLG","TSLQ","TSLT","TSLZ","TSM","TSN","TT","TTD","TTE","TTWO","TU","TWLO","TWO","TXN","TYL","U","UAA","UAL","UAMY","UBER","UBS","UDOW","UEC","UGL","UGP","UL","UMAC","UMC","UNH","UNP","UPS","UPST","URA","URI","USAR","USAS","USB","USFR","USHY","USIG","USMV","UUUU","V","VALE","VCIT","VCLT","VCSH","VELO","VET","VEU","VFC","VG","VGIT","VGK","VGLT","VGSH","VIAV","VICI","VIST","VITL","VKTX","VLO","VLY","VMC","VNET","VNOM","VOD","VONV","VRSK","VRT","VRTX","VST","VT","VTEB","VTIP","VTR","VTRS","VTWO","VXUS","VZ","WBD","WBS","WDAY","WDC","WDS","WELL","WEN","WFC","WIX","WMB","WMG","WMT","WPM","WRD","WSC","WU","WULF","WVE","WY","XEL","XLC","XLG","XME","XOM","XP","XPEV","XRAY","XYZ","YANG","YEXT","YINN","YMM","YPF","Z","ZETA","ZS","ZSL","ZTO","ZTS"];

// [v8] Upstash Redis REST — direct cache:analysis write from Lambda
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REDIS_TTL = 259200; // 3 days (same as analysisCache.ts)

async function redisSet(key, value, ttl) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return false;
  try {
    const body = JSON.stringify(['SET', key, JSON.stringify(value), 'EX', String(ttl || REDIS_TTL)]);
    const url = new URL(UPSTASH_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + UPSTASH_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
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

// Batch Redis pipeline (up to 20 commands at once)
async function redisPipeline(commands) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return 0;
  try {
    const body = JSON.stringify(commands);
    const url = new URL(UPSTASH_URL + '/pipeline');
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/pipeline',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + UPSTASH_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            // If any command is a GET, return parsed results for data retrieval
            const hasGet = commands.some(c => c[0] === 'GET');
            if (hasGet) {
              resolve(parsed.map(r => r.result));
            } else {
              resolve(commands.length);
            }
          } catch { resolve(commands.length); }
        });
      });
      req.on('error', () => resolve(0));
      req.setTimeout(5000, () => { req.destroy(); resolve(0); });
      req.write(body);
      req.end();
    });
  } catch { return 0; }
}

function getNextTradingDayET() {
  // Simple ET approximation: UTC - 4 (EDT) or UTC - 5 (EST)
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const isDST = month >= 3 && month <= 11; // Approximate DST
  const etOffset = isDST ? 4 : 5;
  const etHour = (now.getUTCHours() - etOffset + 24) % 24;
  const day = now.getUTCDay();
  
  let daysToAdd = 0;
  if (day === 6) daysToAdd = 2; // Saturday -> Monday
  else if (day === 0) daysToAdd = 1; // Sunday -> Monday
  
  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + daysToAdd);
  return target.toISOString().slice(0, 10);
}

// [STRUCTURE-SERVICE COMPAT] Find weekly expiration from available dates
function findWeeklyExp(expirations) {
  if (!expirations || expirations.length === 0) return '';
  const sorted = [...expirations].sort();
  
  // Calculate expected Friday
  const now = new Date();
  const day = now.getUTCDay();
  const month = now.getUTCMonth() + 1;
  const isDST = month >= 3 && month <= 11;
  const etOffset = isDST ? 4 : 5;
  const etHour = (now.getUTCHours() - etOffset + 24) % 24;
  
  let daysToFriday = (5 - day + 7) % 7;
  if (daysToFriday === 0 && etHour >= 16) daysToFriday = 7; // After market close
  
  const friday = new Date(now);
  friday.setUTCDate(friday.getUTCDate() + daysToFriday);
  const expectedWeekly = friday.toISOString().slice(0, 10);
  
  if (sorted.includes(expectedWeekly)) return expectedWeekly;
  
  // Fallback: first Friday expiration
  const fridayExp = sorted.find(exp => {
    const d = new Date(exp + 'T12:00:00');
    return d.getDay() === 5;
  });
  if (fridayExp) return fridayExp;
  
  // Fallback: first Thursday (holiday)
  const thursdayExp = sorted.find(exp => {
    const d = new Date(exp + 'T12:00:00');
    return d.getDay() === 4;
  });
  if (thursdayExp) return thursdayExp;
  
  return sorted[0]; // Ultimate fallback
}

// [STRUCTURE-SERVICE COMPAT] Get weekly expiration options only (not all expirations)
async function getWeeklyOptions(ticker) {
  const todayStr = getNextTradingDayET();
  
  // Phase 1: Get available expirations via reference API
  let availableExps = [];
  let targetExpiry = '';
  try {
    const refUrl = 'https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=' + ticker + '&expiration_date.gte=' + todayStr + '&order=asc&limit=1000&apiKey=' + POLYGON_KEY;
    const refData = await httpsGet(refUrl, 8000);
    if (refData && refData.results) {
      const exps = [...new Set(refData.results.map(c => c.expiration_date))].filter(Boolean).sort();
      availableExps = exps.slice(0, 10);
      targetExpiry = findWeeklyExp(exps);
    }
  } catch (e) { console.log('[OPTIONS] Reference API failed for ' + ticker + ': ' + e.message); }
  
  // Fallback: snapshot probe
  if (!targetExpiry) {
    try {
      const probeUrl = 'https://api.polygon.io/v3/snapshot/options/' + ticker + '?expiration_date.gte=' + todayStr + '&limit=250&sort=expiration_date&order=asc&apiKey=' + POLYGON_KEY;
      const probeData = await httpsGet(probeUrl, 8000);
      if (probeData && probeData.results) {
        const exps = [...new Set(probeData.results.map(c => c.details?.expiration_date || c.expiration_date))].filter(Boolean).sort();
        availableExps = exps.slice(0, 10);
        targetExpiry = findWeeklyExp(exps);
      }
    } catch (e) { console.log('[OPTIONS] Snapshot probe failed for ' + ticker + ': ' + e.message); }
  }
  
  if (!targetExpiry) targetExpiry = todayStr;
  
  // Phase 2: Fetch EXACT weekly expiration (much fewer contracts than all expirations)
  let allContracts = [];
  let pages = 0;
  let url = 'https://api.polygon.io/v3/snapshot/options/' + ticker + '?expiration_date=' + targetExpiry + '&limit=250&apiKey=' + POLYGON_KEY;
  while (url && pages < 10) {
    const data = await httpsGet(url, 10000);
    if (!data || !data.results) break;
    allContracts = allContracts.concat(data.results);
    url = data.next_url ? data.next_url + '&apiKey=' + POLYGON_KEY : null;
    pages++;
  }
  
  return { contracts: allContracts, expiration: targetExpiry, availableExps, pages };
}

// Legacy: fetch ALL options (kept for backward compat, used by non-structure flows)
async function getAllOptions(ticker) {
  let allResults = [];
  let url = 'https://api.polygon.io/v3/snapshot/options/' + ticker + '?limit=250&apiKey=' + POLYGON_KEY;
  let pages = 0;
  while (url && pages < 20) {
    const data = await httpsGet(url);
    if (data && data.results) allResults = allResults.concat(data.results);
    url = data && data.next_url ? data.next_url + '&apiKey=' + POLYGON_KEY : null;
    pages++;
  }
  return allResults;
}

async function batchWrite(tableName, items) {
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    try {
      await client.send(new BatchWriteCommand({
        RequestItems: { [tableName]: batch.map(item => ({ PutRequest: { Item: item } })) }
      }));
    } catch (e) {
      for (const item of batch) {
        await client.send(new PutCommand({ TableName: tableName, Item: item })).catch(() => {});
      }
    }
  }
}

// ====== RLSI Self-Calculation ======
function computeRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) { const d = closes[i]-closes[i-1]; if(d>0) gains+=d; else losses-=d; }
  let ag = gains/period, al = losses/period;
  for (let i = period+1; i < closes.length; i++) { const d = closes[i]-closes[i-1]; ag=(ag*(period-1)+(d>0?d:0))/period; al=(al*(period-1)+(d<0?-d:0))/period; }
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}

async function computeRlsi() {
  console.log('RLSI self-calculation...');
  try {
    const today = new Date().toISOString().slice(0,10);
    const ago = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
    const [spyAgg, iwmAgg, vixSnap] = await Promise.all([
      httpsGet('https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/'+ago+'/'+today+'?adjusted=true&sort=asc&limit=30&apiKey='+POLYGON_KEY),
      httpsGet('https://api.polygon.io/v2/aggs/ticker/IWM/range/1/day/'+ago+'/'+today+'?adjusted=true&sort=asc&limit=30&apiKey='+POLYGON_KEY),
      httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/VIX?apiKey='+POLYGON_KEY).catch(()=>null),
    ]);
    const sc = (spyAgg.results||[]).map(r=>r.c);
    const ic = (iwmAgg.results||[]).map(r=>r.c);
    const rsi = computeRSI(sc, 14);
    const mom = Math.round((rsi/100)*25);
    const s5 = sc.length>=5 ? (sc[sc.length-1]/sc[sc.length-6]-1)*100 : 0;
    const i5 = ic.length>=5 ? (ic[ic.length-1]/ic[ic.length-6]-1)*100 : 0;
    const part = Math.max(0, Math.min(25, Math.round(12.5+(i5-s5)*2.5)));
    const sma20 = sc.length>=20 ? sc.slice(-20).reduce((a,b)=>a+b,0)/20 : 0;
    const cur = sc[sc.length-1]||0;
    const trend = Math.max(0, Math.min(25, Math.round(12.5+((cur-sma20)/sma20)*100*5)));
    let vix = 20; try { const vd = vixSnap?.ticker; vix = vd?.lastTrade?.p || vd?.day?.c || 20; } catch {}
    const sent = Math.max(0, Math.min(25, Math.round(37.5-vix*0.75)));
    const rlsi = mom+part+trend+sent;
    const regime = rlsi>=70?'BULLISH':rlsi>=45?'NEUTRAL':'BEARISH';
    await client.send(new PutCommand({ TableName: 'signum-rlsi-history', Item: { pk:'MARKET', timestamp:Date.now(), rlsi, momentum:mom, participation:part, priceTrend:trend, sentiment:sent, regime, vix:Math.round(vix*100)/100, spyRsi:Math.round(rsi*100)/100, spyPrice:cur, sma20:Math.round(sma20*100)/100 }}));
    console.log('RLSI: '+rlsi+' ('+regime+')');
    return { rlsi, regime };
  } catch (e) { console.error('RLSI err:', e.message); return { error: e.message }; }
}

// ====== Alpha Score ======
function computeAlphaScore(priceData, gexData) {
  let s = 50;
  const c = priceData.changePct||0;
  if(c>3) s+=15; else if(c>1) s+=10; else if(c>0) s+=5; else if(c<-3) s-=15; else if(c<-1) s-=10; else if(c<0) s-=5;
  if(priceData.volume>50000000) s+=5; else if(priceData.volume>20000000) s+=3;
  if(gexData) { if(gexData.gammaRegime==='POSITIVE') s+=5; else if(gexData.gammaRegime==='NEGATIVE') s-=5; if(gexData.pcr<0.7) s+=5; else if(gexData.pcr>1.3) s-=5; }
  return Math.max(0, Math.min(100, Math.round(s)));
}

// ====== OMR (Options Market Regime) Calculator ======
function computeOMR(opts, price, gexData) {
  if (!opts || opts.length === 0 || !price) return null;
  const atmOpts = opts
    .filter(o => { const iv = o.greeks?.implied_volatility || 0; const strike = o.details?.strike_price || 0; return iv > 0 && strike > 0; })
    .sort((a, b) => Math.abs((a.details?.strike_price||0) - price) - Math.abs((b.details?.strike_price||0) - price))
    .slice(0, 4);
  const avgIV = atmOpts.length > 0 ? atmOpts.reduce((s, o) => s + (o.greeks?.implied_volatility||0), 0) / atmOpts.length : 0;
  const ivVal = Math.round(avgIV * 100);
  const otmPuts = opts.filter(o => o.details?.contract_type === 'put' && (o.details?.strike_price||0) < price && (o.greeks?.implied_volatility||0) > 0)
    .sort((a, b) => (b.details?.strike_price||0) - (a.details?.strike_price||0)).slice(0, 3);
  const otmCalls = opts.filter(o => o.details?.contract_type === 'call' && (o.details?.strike_price||0) > price && (o.greeks?.implied_volatility||0) > 0)
    .sort((a, b) => (a.details?.strike_price||0) - (b.details?.strike_price||0)).slice(0, 3);
  const avgPutIV = otmPuts.length > 0 ? otmPuts.reduce((s, o) => s + (o.greeks?.implied_volatility||0), 0) / otmPuts.length : 0;
  const avgCallIV = otmCalls.length > 0 ? otmCalls.reduce((s, o) => s + (o.greeks?.implied_volatility||0), 0) / otmCalls.length : 0;
  const skewVal = Math.round((avgPutIV - avgCallIV) * 100 * 10) / 10;
  const pcr = gexData.pcr || 0;
  let totalVol = 0, totalOI = 0;
  opts.forEach(o => { totalVol += (o.day?.volume||0); totalOI += (o.open_interest||0); });
  const uoaScore = totalOI > 0 ? Math.round((totalVol / totalOI) * 10) / 10 : 0;
  const opiVal = (gexData.tCOI||0) - (gexData.tPOI||0);
  const isLongGamma = gexData.gex >= 0;
  const ivLow = ivVal <= 30 ? 2 : ivVal <= 45 ? 1 : 0;
  const ivHigh = ivVal >= 60 ? 2 : ivVal >= 45 ? 1 : 0;
  const skewPut = skewVal >= 3 ? 2 : skewVal >= 1 ? 1 : 0;
  const skewCall = skewVal <= -3 ? 2 : skewVal <= -1 ? 1 : 0;
  const pcBullish = pcr > 0 && pcr < 0.7 ? 2 : pcr < 1.0 ? 1 : 0;
  const pcBearish = pcr >= 1.3 ? 2 : pcr >= 1.0 ? 1 : 0;
  const uoaHi = uoaScore >= 5 ? 2 : uoaScore >= 3 ? 1 : 0;
  const flowBullish = opiVal > 0 ? 1 : 0;
  const flowBearish = opiVal < 0 ? 1 : 0;
  const accumScore = ivLow + pcBullish + flowBullish + skewCall;
  const distScore = ivHigh + pcBearish + flowBearish + skewPut;
  const hedgeScore = ivHigh + skewPut * 2;
  const specScore = ivLow + uoaHi + skewCall;
  let regime = 'NEUTRAL', confidence = 30;
  if (hedgeScore >= 5) { regime = 'HEDGING'; confidence = Math.min(100, hedgeScore * 15); }
  else if (accumScore >= 5) { regime = 'ACCUMULATION'; confidence = Math.min(100, accumScore * 14); }
  else if (distScore >= 5) { regime = 'DISTRIBUTION'; confidence = Math.min(100, distScore * 14); }
  else if (specScore >= 5) { regime = 'SPECULATION'; confidence = Math.min(100, specScore * 15); }
  else {
    const scores = { ACCUMULATION: accumScore, DISTRIBUTION: distScore, HEDGING: hedgeScore, SPECULATION: specScore };
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] >= 3) { regime = sorted[0][0]; confidence = Math.min(100, sorted[0][1] * 14); }
  }
  return { regime, confidence, ivVal, skewVal, pcr: Math.round(pcr*100)/100, uoaScore, opiVal, isLongGamma };
}

// ====== Step 1: Prices ======
async function harvestPrices() {
  console.log('Step 1: Price snapshot ' + UNIVERSE.length + ' tickers...');
  const today = new Date().toISOString().slice(0,10);
  const snap = await httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey='+POLYGON_KEY);
  const all = snap?.tickers || [];
  const items = [], priceMap = {}, snapshotMap = {};
  const us = new Set(UNIVERSE);
  // Also include UNIVERSE_500 tickers in priceMap for unified cache
  const all500 = new Set(UNIVERSE_500);
  for (const t of all) {
    if (!us.has(t.ticker) && !all500.has(t.ticker)) continue;
    const p = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0;
    const ch = t.todaysChangePerc || 0;
    priceMap[t.ticker] = p;
    snapshotMap[t.ticker] = { changePct:ch, volume:t.day?.v||0, price:p, vwap:t.day?.vw||0 };
    if (us.has(t.ticker)) {
      items.push({ ticker:t.ticker, date:today, qualityTier:'LIVE', changePct:Math.round(ch*100)/100, open:t.day?.o||0, high:t.day?.h||0, low:t.day?.l||0, close:t.day?.c||p, volume:t.day?.v||0, vwap:t.day?.vw||0, gex:0, pcr:0, alphaScore:0 });
    }
  }
  // [REMOVED] alpha-history 저장 제거 — Context Score는 Vercel cron이 장마감 시점에 저장 (SSR_V46 덮어쓰기 방지)
  console.log('Prices: '+items.length+'/'+UNIVERSE.length+' (priceMap has '+Object.keys(priceMap).length+' tickers)');
  return { count:items.length, priceMap, snapshotMap };
}

// ====== Step 2: GEX (structureService-compatible) ======
async function harvestGex(priceMap) {
  console.log('Step 2: GEX (structureService mode) '+GEX_TICKERS.length+' tickers...');
  const ts = Date.now();
  const gexMap = {};
  const optionsCache = {};
  let ok = 0;
  for (let i = 0; i < GEX_TICKERS.length; i += 10) {
    const batch = GEX_TICKERS.slice(i, i+10);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const price = priceMap[ticker]; if(!price) return;
        
        // [STRUCTURE-SERVICE] Use weekly options only (not all expirations)
        const weeklyResult = await getWeeklyOptions(ticker);
        const opts = weeklyResult.contracts;
        const expiration = weeklyResult.expiration;
        const availableExps = weeklyResult.availableExps;
        if (!opts.length) return;
        
        optionsCache[ticker] = { opts, price, expiration, availableExps };
        
        // Parse contracts (matching structureService L336-354)
        const cleanContracts = [];
        let totalCallOI = 0, totalPutOI = 0;
        const strikesSet = new Set();
        const callsMap = new Map(), putsMap = new Map();
        
        for (const c of opts) {
          const k = c.details?.strike_price || c.strike_price || 0;
          const type = (c.details?.contract_type || c.contract_type || 'call').toLowerCase();
          const oi = c.open_interest;
          strikesSet.add(k);
          if (oi !== undefined && oi !== null) {
            cleanContracts.push({ ...c, k, type, oi });
            if (type === 'call') totalCallOI += oi;
            else totalPutOI += oi;
          }
          const val = typeof oi === 'number' ? oi : 0;
          if (type === 'call') callsMap.set(k, (callsMap.get(k) || 0) + val);
          else putsMap.set(k, (putsMap.get(k) || 0) + val);
        }
        
        const pcr = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : 0;
        const sortedStrikes = [...strikesSet].sort((a, b) => a - b);
        
        // ── GEX calculation (structureService L385-440) ──
        const gexByStrike = new Map();
        let gammaCount = 0;
        const ATM_RANGE = 0.15;
        const atmMin = price * (1 - ATM_RANGE);
        const atmMax = price * (1 + ATM_RANGE);
        
        let gammaFlipLevel = null;
        let gammaFlipType = 'NO_DATA';
        let gammaFlipCrossings = [];
        
        cleanContracts.forEach(c => {
          const g = c.greeks?.gamma;
          if (typeof g === 'number' && isFinite(g) && g !== 0) {
            const dir = c.type === 'call' ? -1 : 1;
            const gex = g * c.oi * 100 * dir;
            gexByStrike.set(c.k, (gexByStrike.get(c.k) || 0) + gex);
            gammaCount++;
          }
        });
        
        if (gammaCount > 0) {
          const strikesWithGex = [...gexByStrike.entries()].sort((a, b) => a[0] - b[0]);
          let cumulativeGex = 0;
          const allCrossings = [];
          const atmNearZero = [];
          let finalCumulativeGex = 0;
          
          for (let ii = 0; ii < strikesWithGex.length; ii++) {
            const [strike, gexAtStrike] = strikesWithGex[ii];
            const prevGex = cumulativeGex;
            cumulativeGex += gexAtStrike;
            finalCumulativeGex = cumulativeGex;
            if (ii > 0) {
              if ((prevGex < 0 && cumulativeGex >= 0) || (prevGex > 0 && cumulativeGex <= 0)) {
                allCrossings.push(strike);
              }
            }
            if (strike >= atmMin && strike <= atmMax) {
              atmNearZero.push({ strike, absGex: Math.abs(cumulativeGex) });
            }
          }
          
          gammaFlipCrossings = [...allCrossings];
          const atmCrossings = allCrossings.filter(s => s >= atmMin && s <= atmMax);
          if (atmCrossings.length > 0) {
            gammaFlipLevel = atmCrossings.reduce((closest, strike) =>
              Math.abs(strike - price) < Math.abs(closest - price) ? strike : closest
            );
            gammaFlipType = 'EXACT';
          } else if (atmNearZero.length > 0) {
            atmNearZero.sort((a, b) => a.absGex - b.absGex);
            gammaFlipLevel = atmNearZero[0].strike;
            gammaFlipType = 'NEAR_ZERO';
          } else {
            gammaFlipLevel = null;
            gammaFlipType = finalCumulativeGex > 0 ? 'ALL_LONG' : 'ALL_SHORT';
          }
        }
        
        // ── Max Pain (structureService L442-458) ──
        let maxPain = null;
        if (cleanContracts.length > 0) {
          let minLoss = Infinity;
          const distinctStrikes = [...new Set(cleanContracts.map(c => c.k))].sort((a, b) => a - b);
          distinctStrikes.forEach(testStrike => {
            let loss = 0;
            cleanContracts.forEach(c => {
              if (c.type === 'call' && testStrike > c.k) loss += (testStrike - c.k) * c.oi;
              else if (c.type === 'put' && testStrike < c.k) loss += (c.k - testStrike) * c.oi;
            });
            if (loss < minLoss) { minLoss = loss; maxPain = testStrike; }
          });
        }
        
        // ── Net GEX (structureService L460-503) ──
        let netGex = 0;
        let callWall = null, putFloor = null;
        let maxCallOi = -1, maxPutOi = -1;
        let callPremiumVol = 0, putPremiumVol = 0;
        const maxResist = price * 1.20;
        const minSupport = price * 0.80;
        
        cleanContracts.forEach(c => {
          const g = c.greeks?.gamma;
          if (typeof g === 'number' && isFinite(g)) {
            const dir = c.type === 'call' ? -1 : 1;
            netGex += g * c.oi * 100 * dir * price;
            gammaCount++;
          }
          // callWall: max OI call within +20% (structureService L478-483)
          if (c.type === 'call' && c.k > price && c.k <= maxResist && c.oi > maxCallOi) {
            maxCallOi = c.oi; callWall = c.k;
          }
          // putFloor: max OI put within -20% (structureService L484-487)
          if (c.type === 'put' && c.k < price && c.k >= minSupport && c.oi > maxPutOi) {
            maxPutOi = c.oi; putFloor = c.k;
          }
          // Net Premium (structureService L488-496)
          const vol = c.day?.volume || c.day?.v || 0;
          const lastPrice = c.last_trade?.price || c.last_trade?.p || c.last_quote?.midpoint || 0;
          if (vol > 0 && lastPrice > 0) {
            if (c.type === 'call') callPremiumVol += vol * lastPrice * 100;
            else putPremiumVol += vol * lastPrice * 100;
          }
        });
        
        const netPremium = Math.round(callPremiumVol - putPremiumVol);
        const gammaCoverage = cleanContracts.length > 0 ? gammaCount / cleanContracts.length : 0;
        const gexConfidence = gammaCoverage >= 0.80 ? 'HIGH' : gammaCoverage >= 0.60 ? 'MEDIUM' : 'LOW';
        const gammaRegime = netGex > 0 ? 'POSITIVE' : netGex < 0 ? 'NEGATIVE' : 'NEUTRAL';
        
        // ── ATM IV (structureService L677-741) ──
        let atmIv = null;
        if (price > 0 && cleanContracts.length > 0) {
          const ivStrikes = [...new Set(cleanContracts.map(c => c.k))].filter(Boolean).sort((a, b) => a - b);
          const atmStrike = ivStrikes.reduce((closest, strike) =>
            Math.abs(strike - price) < Math.abs(closest - price) ? strike : closest
          );
          const extractIv = (c) => {
            const raw = c?.implied_volatility || c?.greeks?.implied_volatility || c?.iv;
            return typeof raw === 'number' && raw > 0 ? (raw > 1 ? raw : raw * 100) : null;
          };
          const callIv = extractIv(cleanContracts.find(c => c.k === atmStrike && c.type === 'call'));
          const putIv = extractIv(cleanContracts.find(c => c.k === atmStrike && c.type === 'put'));
          if (callIv !== null && putIv !== null) {
            const spread = Math.abs(callIv - putIv);
            atmIv = Math.round(spread > 40 ? Math.min(callIv, putIv) : (callIv + putIv) / 2);
          } else {
            const fallback = callIv || putIv;
            atmIv = fallback !== null ? Math.round(fallback) : null;
          }
        }
        
        // ── Gamma Concentration (structureService L584-598) ──
        const priceRange5 = price * 0.05;
        const nearPriceOI = cleanContracts.reduce((sum, c) => {
          if (Math.abs(c.k - price) <= priceRange5) return sum + c.oi;
          return sum;
        }, 0);
        const totalOI = totalCallOI + totalPutOI;
        const gammaConcentration = totalOI > 0 ? Math.round((nearPriceOI / totalOI) * 100) : 0;
        
        // ── DTE (structureService L572-580) ──
        const todayStr = new Date().toISOString().slice(0, 10);
        const targetParts = expiration.split('-').map(Number);
        const todayParts = todayStr.split('-').map(Number);
        const targetDate = new Date(targetParts[0], targetParts[1] - 1, targetParts[2]);
        const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
        const zeroDteImpact = Math.max(0, Math.round((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        // ── Squeeze Score (structureService L600-665) ──
        let squeezeScore = 0;
        const isShortGamma = netGex < 0;
        if (isShortGamma) {
          squeezeScore += Math.min(35, Math.round(Math.abs(netGex) / 10_000_000));
        } else if (netGex > 0) {
          squeezeScore += Math.min(10, Math.round(Math.abs(netGex) / 100_000_000));
        }
        if (gammaConcentration >= 70) squeezeScore += 20;
        else if (gammaConcentration >= 50) squeezeScore += 15;
        else if (gammaConcentration >= 30) squeezeScore += 8;
        if (zeroDteImpact === 0) squeezeScore += 20;
        else if (zeroDteImpact === 1) squeezeScore += 15;
        else if (zeroDteImpact <= 3) squeezeScore += 10;
        else if (zeroDteImpact <= 5) squeezeScore += 5;
        if (atmIv !== null) {
          if (atmIv >= 60) squeezeScore += 15;
          else if (atmIv >= 45) squeezeScore += 10;
          else if (atmIv >= 30) squeezeScore += 5;
        }
        if (pcr <= 0.4 || pcr >= 1.8) squeezeScore += 10;
        else if (pcr <= 0.6 || pcr >= 1.5) squeezeScore += 5;
        squeezeScore = Math.min(100, Math.max(0, squeezeScore));
        
        // Store results (structureService-compatible format)
        gexMap[ticker] = {
          gex: netGex, pcr, gammaRegime, callWall, putFloor, maxPain,
          flipLevel: gammaFlipLevel, gammaFlipType,
          totalContracts: opts.length, totalCallOI, totalPutOI,
          expiration, atmIv, squeezeScore, gexConfidence,
          gammaConcentration, netPremium, gammaCoverage
        };
        
        // Write to signum-gex-history (now with structureService values)
        await client.send(new PutCommand({ TableName:'signum-gex-history', Item:{
          ticker, timestamp:ts, gex:Math.round(netGex), flipLevel:gammaFlipLevel,
          callWall, putFloor, maxPain, price, gammaRegime,
          totalContracts:opts.length, totalCallOI, totalPutOI,
          pcr: Math.round(pcr*100)/100, expiration, squeezeScore, atmIv
        }}));
        
        // Write to signum-flow-history
        await client.send(new PutCommand({ TableName:'signum-flow-history', Item:{
          ticker, timestamp:ts, compositeScore:squeezeScore,
          opi:totalCallOI-totalPutOI, whaleScore:0, dex:0,
          ivSkew:0, squeezeProbability:squeezeScore,
          smartMoneyScore:0, totalCallOI, totalPutOI,
          pcr:Math.round(pcr*100)/100
        }})).catch(()=>{});
        
        // OMR calculation (reuse opts)
        try {
          const omr = computeOMR(opts, price, { gex: netGex, pcr, tCOI: totalCallOI, tPOI: totalPutOI });
          if (omr) {
            await client.send(new PutCommand({ TableName:'signum-omr-history', Item:{
              ticker, timestamp:ts, regime:omr.regime, confidence:omr.confidence,
              ivVal:omr.ivVal, skewVal:omr.skewVal, pcr:omr.pcr,
              uoaScore:omr.uoaScore, opiVal:omr.opiVal,
              isLongGamma:omr.isLongGamma, closePrice:price
            }}));
          }
        } catch(omrErr) { console.log('OMR err '+ticker+': '+omrErr.message); }
        
        ok++;
      } catch {}
    }));
  }
  console.log('GEX (structureService): '+ok+'/'+GEX_TICKERS.length);
  return { gexMap, optionsCache };
}

// ====== Step 3: SMA 50/200 for ALL tickers ======
async function harvestSMA(priceMap) {
  console.log('Step 3: SMA 50/200...');
  const today = new Date().toISOString().slice(0,10);
  const tickers = Object.keys(priceMap);
  const smaMap = {}; // Store for unified cache
  const items = [];
  for (let i = 0; i < tickers.length; i += 10) {
    const batch = tickers.slice(i, i+10);
    const results = await Promise.all(batch.map(async (ticker) => {
      try {
        const [s50, s200] = await Promise.all([
          httpsGet('https://api.polygon.io/v1/indicators/sma/'+ticker+'?timespan=day&adjusted=true&window=50&series_type=close&limit=2&apiKey='+POLYGON_KEY, 8000),
          httpsGet('https://api.polygon.io/v1/indicators/sma/'+ticker+'?timespan=day&adjusted=true&window=200&series_type=close&limit=2&apiKey='+POLYGON_KEY, 8000),
        ]);
        const sma50 = s50?.results?.values?.[0]?.value || null;
        const sma200 = s200?.results?.values?.[0]?.value || null;
        const prevSma50 = s50?.results?.values?.[1]?.value || sma50;
        const prevSma200 = s200?.results?.values?.[1]?.value || sma200;
        let cross = 'NONE', crossType = '';
        if (sma50 && sma200) {
          const dist = ((sma50-sma200)/sma200)*100;
          if (sma50 > sma200) { cross = 'GOLDEN'; crossType = prevSma50 <= prevSma200 ? 'NEW' : Math.abs(dist) < 0.5 ? 'TIGHT' : 'EST'; }
          else { cross = 'DEAD'; crossType = prevSma50 >= prevSma200 ? 'NEW' : Math.abs(dist) < 0.5 ? 'TIGHT' : 'EST'; }
        }
        const distance = sma50 && sma200 ? Math.round(((sma50-sma200)/sma200)*10000)/100 : 0;
        const isImminent = sma50 && sma200 ? Math.abs(((sma50-sma200)/sma200)*100) < 0.5 : false;
        smaMap[ticker] = { sma50: sma50?Math.round(sma50*100)/100:null, sma200: sma200?Math.round(sma200*100)/100:null, cross, crossType, distance, isImminent };
        return { ticker, sma50: sma50?Math.round(sma50*100)/100:null, sma200: sma200?Math.round(sma200*100)/100:null, cross, crossType };
      } catch { return { ticker, sma50:null, sma200:null, cross:'NONE', crossType:'' }; }
    }));
    for (const r of results) {
      items.push({ ticker:r.ticker, date:today, sma50:r.sma50, sma200:r.sma200, cross:r.cross, crossType:r.crossType, close:priceMap[r.ticker]||0, changePct:0, open:0, high:0, low:0, volume:0, vwap:0, gex:0, pcr:0, alphaScore:0, qualityTier:'SMA' });
    }
  }
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i+25);
    for (const item of batch) {
      try {
        const existing = await client.send(new QueryCommand({ TableName:'signum-alpha-history', KeyConditionExpression:'ticker=:tk AND #d=:d', ExpressionAttributeValues:{':tk':item.ticker,':d':item.date}, ExpressionAttributeNames:{'#d':'date'}, Limit:1 }));
        const merged = { ...(existing.Items?.[0]||{}), sma50:item.sma50, sma200:item.sma200, cross:item.cross, crossType:item.crossType };
        await client.send(new PutCommand({ TableName:'signum-alpha-history', Item:merged }));
      } catch {}
    }
  }
  const withSMA = items.filter(i => i.sma50 && i.sma200).length;
  console.log('SMA: '+withSMA+'/'+items.length+' with both SMA50+200');
  return { smaCount: withSMA, smaMap };
}

// ====== Step 4: Analyst(FMP) + Earnings(Finnhub) + Fundamentals + Related — ALL 509 tickers ======
async function harvestDetails() {
  console.log('Step 4: Details for ALL '+UNIVERSE_500.length+' tickers (FMP analyst + Finnhub earnings + Polygon fund/related)...');
  const today = new Date().toISOString().slice(0,10);
  let analystOk = 0, earningsOk = 0;
  const detailsMap = {};
  
  // === 4a: FMP Analyst Grades — ALL tickers (no rate limit issues) ===
  if (FMP_KEY) {
    for (let i = 0; i < UNIVERSE_500.length; i += 10) {
      const batch = UNIVERSE_500.slice(i, i+10);
      await Promise.all(batch.map(async (ticker) => {
        detailsMap[ticker] = detailsMap[ticker] || {};
        try {
          const data = await httpsGet('https://financialmodelingprep.com/stable/grades-consensus?symbol='+ticker+'&apikey='+FMP_KEY, 5000);
          const grade = Array.isArray(data) ? data[0] : data;
          if (grade && (grade.strongBuy || grade.buy || grade.hold)) {
            const total = (grade.strongBuy||0)+(grade.buy||0)+(grade.hold||0)+(grade.sell||0)+(grade.strongSell||0);
            const bullishPct = total > 0 ? Math.round(((grade.strongBuy||0)+(grade.buy||0))/total*100) : 0;
            let consensus = grade.consensus || 'N/A';
            if (consensus === 'N/A' && total > 0) {
              const ws = ((grade.strongBuy||0)*5+(grade.buy||0)*4+(grade.hold||0)*3+(grade.sell||0)*2+(grade.strongSell||0))/total;
              consensus = ws>=4.3?'STRONG BUY':ws>=3.5?'BUY':ws>=2.5?'HOLD':ws>=1.7?'SELL':'STRONG SELL';
            }
            detailsMap[ticker].analyst = { ticker, consensus, totalAnalysts:total, bullishPct, breakdown:{ strongBuy:grade.strongBuy||0, buy:grade.buy||0, hold:grade.hold||0, sell:grade.sell||0, strongSell:grade.strongSell||0 } };
            await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'ANALYST:'+ticker, timestamp:Date.now(), consensus, totalAnalysts:total, bullishPct, breakdown:detailsMap[ticker].analyst.breakdown }}));
            analystOk++;
          }
        } catch {}
      }));
    }
    console.log('FMP Analyst: '+analystOk+'/'+UNIVERSE_500.length);
  }
  
  // === 4b: FMP Earnings Calendar — 1 API call for ALL tickers (no rate limit) ===
  if (FMP_KEY) {
    try {
      const toDate = new Date(Date.now()+180*86400000).toISOString().slice(0,10);
      const earningsAll = await httpsGet('https://financialmodelingprep.com/stable/earnings-calendar?from='+today+'&to='+toDate+'&apikey='+FMP_KEY, 15000);
      const earningsArr = Array.isArray(earningsAll) ? earningsAll : [];
      const tickerSet = new Set(UNIVERSE_500);
      // Group by symbol, keep only the nearest future date per ticker
      const earningsMap = {};
      for (const e of earningsArr) {
        if (!tickerSet.has(e.symbol)) continue;
        if (!earningsMap[e.symbol] || new Date(e.date) < new Date(earningsMap[e.symbol].date)) {
          earningsMap[e.symbol] = e;
        }
      }
      for (const [ticker, e] of Object.entries(earningsMap)) {
        detailsMap[ticker] = detailsMap[ticker] || {};
        const daysUntil = Math.ceil((new Date(e.date).getTime()-new Date(today).getTime())/(86400000));
        const daysLabel = daysUntil <= 0 ? 'today' : 'D-'+daysUntil;
        detailsMap[ticker].earnings = { ticker, nextEarningsDate:e.date, daysUntilEarnings:daysUntil, daysLabel, hasData:true, epsEstimate:e.epsEstimated||null, quarter:null, year:null, hour:null };
        await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'EARNINGS:'+ticker, timestamp:Date.now(), nextDate:e.date, daysUntil, epsEstimate:e.epsEstimated||null, quarter:null, year:null, hour:null }})).catch(()=>{});
        earningsOk++;
      }
      console.log('FMP Earnings: '+earningsOk+'/'+Object.keys(earningsMap).length+' matched from '+earningsArr.length+' total events');
    } catch (e) { console.log('FMP Earnings err: '+e.message); }
  }
  
  // === 4c: Polygon Fundamentals — Reference + Financial Ratios + vX Financials ===
  // Fetches 3 APIs per ticker: reference (name/sector), ratios (PE/DE/ROE), vX financials (revenue/margin)
  let fundOk = 0;
  for (let i = 0; i < UNIVERSE_500.length; i += 5) {
    const batch = UNIVERSE_500.slice(i, i+5);
    await Promise.all(batch.map(async (ticker) => {
      try {
        // Parallel fetch: reference + financial ratios + vX financials
        const [refData, ratiosData, vxData] = await Promise.all([
          httpsGet('https://api.polygon.io/v3/reference/tickers/'+ticker+'?apiKey='+POLYGON_KEY, 5000).catch(() => null),
          httpsGet('https://api.polygon.io/stocks/financials/v1/ratios?ticker='+ticker+'&limit=1&apiKey='+POLYGON_KEY, 5000).catch(() => null),
          httpsGet('https://api.polygon.io/vX/reference/financials?ticker='+ticker+'&limit=5&timeframe=quarterly&order=desc&sort=period_of_report_date&apiKey='+POLYGON_KEY, 5000).catch(() => null),
        ]);
        
        const r = refData?.results;
        detailsMap[ticker] = detailsMap[ticker] || {};
        
        // --- Financial Ratios ---
        const ratios = ratiosData?.results?.[0] || {};
        const pe = ratios.price_to_earnings ?? null;
        const de = ratios.debt_to_equity ?? null;
        const roe = ratios.return_on_equity ?? null;
        const pb = ratios.price_to_book ?? null;
        const ps = ratios.price_to_sales ?? null;
        const fcfRaw = ratios.free_cash_flow ?? null;
        const mktCap = ratios.market_cap ?? (r?.market_cap || null);
        let fcfYield = null;
        if (fcfRaw !== null && mktCap !== null && mktCap > 0) fcfYield = (fcfRaw / mktCap) * 100;
        
        // --- vX Financials (revenue growth, net margin) ---
        const vxResults = vxData?.results || [];
        let revenueGrowth = null, netMargin = null;
        if (vxResults.length >= 1) {
          const latest = vxResults[0]?.financials?.income_statement;
          if (latest) {
            const revLatest = latest.revenues?.value || 0;
            const netIncome = latest.net_income_loss?.value || 0;
            if (revLatest > 0) netMargin = (netIncome / revLatest) * 100;
          }
          if (latest && vxResults.length >= 2) {
            const revLatest = latest.revenues?.value || 0;
            let revPrev = 0;
            const preferredIdx = vxResults.length >= 5 ? 4 : vxResults.length - 1;
            for (let j = preferredIdx; j >= 1; j--) {
              const val = vxResults[j]?.financials?.income_statement?.revenues?.value;
              if (val && val > 0) { revPrev = val; break; }
            }
            if (revPrev > 0 && revLatest > 0) revenueGrowth = ((revLatest - revPrev) / Math.abs(revPrev)) * 100;
          }
        }
        
        // --- Score Calculation ---
        let score = 0;
        const breakdown = {};
        if (pe !== null && pe > 0) { const s = pe<15?20:pe<25?16:pe<35?12:pe<50?8:4; score+=s; breakdown.pe = {value:pe.toFixed(1),score:s,label:'P/E'}; } else { breakdown.pe = {value:pe!==null?pe.toFixed(1):'N/A',score:0,label:'P/E'}; }
        if (de !== null) { const s = de<0.3?20:de<0.6?16:de<1.0?12:de<2.0?8:4; score+=s; breakdown.de = {value:de.toFixed(2),score:s,label:'D/E'}; } else { breakdown.de = {value:'N/A',score:0,label:'D/E'}; }
        if (fcfYield !== null) { const s = fcfYield>8?20:fcfYield>5?16:fcfYield>3?12:fcfYield>1?8:4; score+=s; breakdown.fcf = {value:fcfYield.toFixed(1)+'%',score:s,label:'FCF'}; } else { breakdown.fcf = {value:'N/A',score:0,label:'FCF'}; }
        if (revenueGrowth !== null) { const s = revenueGrowth>50?20:revenueGrowth>25?16:revenueGrowth>10?12:revenueGrowth>0?8:4; score+=s; breakdown.rev = {value:(revenueGrowth>0?'+':'')+revenueGrowth.toFixed(0)+'%',score:s,label:'Rev'}; } else { breakdown.rev = {value:'N/A',score:0,label:'Rev'}; }
        if (netMargin !== null) { const s = netMargin>30?20:netMargin>20?16:netMargin>10?12:netMargin>0?8:4; score+=s; breakdown.margin = {value:netMargin.toFixed(1)+'%',score:s,label:'Margin'}; } else { breakdown.margin = {value:'N/A',score:0,label:'Margin'}; }
        
        const hasAnyData = Object.values(breakdown).some(b => b.score > 0);
        let grade, finalScore;
        if (!hasAnyData) { grade = 'NO_DATA'; finalScore = null; }
        else { finalScore = score; grade = score>=80?'A':score>=70?'A-':score>=60?'B+':score>=50?'B':score>=40?'C+':score>=30?'C':score>=20?'D':'F'; }
        
        detailsMap[ticker].fundamentals = {
          ticker, name: r?.name||ticker, marketCap: r?.market_cap||mktCap, sector: r?.sic_description||null,
          description: r?.description?.slice(0,500)||null, exchange: r?.primary_exchange||null,
          score: finalScore, grade,
          pe: pe!==null ? Math.round(pe*10)/10 : null,
          de: de!==null ? Math.round(de*100)/100 : null,
          roe: roe!==null ? Math.round(roe*1000)/10 : null,
          revenueGrowth: revenueGrowth!==null ? Math.round(revenueGrowth*10)/10 : null,
          netMargin: netMargin!==null ? Math.round(netMargin*10)/10 : null,
          fcfYield: fcfYield!==null ? Math.round(fcfYield*10)/10 : null,
          pb: pb!==null ? Math.round(pb*10)/10 : null,
          ps: ps!==null ? Math.round(ps*10)/10 : null,
          breakdown,
        };
        if (r) {
          detailsMap[ticker].overview = { name:r.name||ticker, sector:r.sic_description||null, sectorEN:r.sic_description||null, description:r.description?.slice(0,300)||null, descriptionEN:r.description?.slice(0,300)||null, marketCap:r.market_cap||null, exchange:r.primary_exchange||null };
        }
        await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'FUND:'+ticker, timestamp:Date.now(), name:r?.name||ticker, marketCap:r?.market_cap||null, sector:r?.sic_description||null, exchange:r?.primary_exchange||null, description:r?.description?.slice(0,500)||null, score:finalScore, grade, pe:pe!==null?Math.round(pe*10)/10:null, de:de!==null?Math.round(de*100)/100:null, roe:roe!==null?Math.round(roe*1000)/10:null, revenueGrowth:revenueGrowth!==null?Math.round(revenueGrowth*10)/10:null, netMargin:netMargin!==null?Math.round(netMargin*10)/10:null, fcfYield:fcfYield!==null?Math.round(fcfYield*10)/10:null, pb:pb!==null?Math.round(pb*10)/10:null, ps:ps!==null?Math.round(ps*10)/10:null, breakdown }}));
        fundOk++;
      } catch {}
    }));
  }
  
  // === 4d: Polygon Related Companies — ALL tickers (no rate limit) ===
  let relOk = 0;
  for (let i = 0; i < UNIVERSE_500.length; i += 10) {
    const batch = UNIVERSE_500.slice(i, i+10);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const data = await httpsGet('https://api.polygon.io/v1/related-companies/'+ticker+'?apiKey='+POLYGON_KEY, 5000);
        const rels = data?.results || [];
        if (rels.length > 0) {
          detailsMap[ticker] = detailsMap[ticker] || {};
          const relTickers = rels.slice(0,10).map(r => r.ticker);
          detailsMap[ticker].related = { ticker, count:relTickers.length, topRelated:relTickers.slice(0,4).map(t=>({ticker:t,price:0,change:0,logo:null})), relatedTickers:relTickers, allTickers:relTickers };
          await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'RELATED:'+ticker, timestamp:Date.now(), tickers: relTickers }}));
          relOk++;
        }
      } catch {}
    }));
  }
  
  console.log('Details: analyst='+analystOk+' earnings='+earningsOk+' fund='+fundOk+' related='+relOk);
  
  // === 4e: Polygon Short Interest + Float (SI%) — daily batch ===
  // [FIX 2026-04-07] settlement_date.gte + /stocks/vX/float for accurate SI%
  let siOk = 0;
  for (let i = 0; i < UNIVERSE_500.length; i += 10) {
    const batch = UNIVERSE_500.slice(i, i+10);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const [siData, floatData] = await Promise.all([
          httpsGet('https://api.polygon.io/stocks/v1/short-interest?ticker='+ticker+'&settlement_date.gte=2024-01-01&limit=2&order=desc&sort=settlement_date&apiKey='+POLYGON_KEY, 8000).catch(()=>null),
          httpsGet('https://api.polygon.io/stocks/vX/float?ticker='+ticker+'&apiKey='+POLYGON_KEY, 8000).catch(()=>null),
        ]);
        const siResults = siData?.results || [];
        // Sort desc by settlement_date (API may not respect order param consistently)
        siResults.sort((a,b) => (b.settlement_date||'').localeCompare(a.settlement_date||''));
        const floatShares = floatData?.results?.[0]?.free_float || 0;
        if (siResults.length > 0 && floatShares > 0) {
          const siPercent = Math.round((siResults[0].short_interest / floatShares) * 1000) / 10;
          const daysToCover = siResults[0].days_to_cover || 0;
          let siChange = 0;
          if (siResults.length >= 2) {
            const prevSi = Math.round((siResults[1].short_interest / floatShares) * 1000) / 10;
            siChange = Math.round((siPercent - prevSi) * 10) / 10;
          }
          await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'SI:'+ticker, timestamp:Date.now(), siPercent, daysToCover, siChange, floatShares, shortInterest:siResults[0].short_interest, settlementDate:siResults[0].settlement_date||null }})).catch(()=>{});
          siOk++;
        }
      } catch {}
    }));
  }
  console.log('SI%: '+siOk+'/'+UNIVERSE_500.length);
  
  return { analyst:analystOk, earnings:earningsOk, fundamentals:fundOk, related:relOk, si:siOk, detailsMap };
}

// ====== Step 5: Update Alpha Scores (merge GEX into prices) ======
async function updateAlphaScores(snapshotMap, gexMap) {
  const today = new Date().toISOString().slice(0,10);
  const items = [];
  for (const [ticker, pd] of Object.entries(snapshotMap)) {
    const alpha = computeAlphaScore(pd, gexMap[ticker]||null);
    items.push({ ticker, date:today, changePct:Math.round(pd.changePct*100)/100, open:0,high:0,low:0, close:pd.price, volume:pd.volume, vwap:0, gex:gexMap[ticker]?gexMap[ticker].gex:0, pcr:gexMap[ticker]?gexMap[ticker].pcr:0, alphaScore:alpha, qualityTier:gexMap[ticker]?'FULL':'PRICE_ONLY' });
  }
  // [REMOVED] alpha-history 저장 제거 — Context Score는 Vercel cron 전담 (장마감 1회 저장)
  console.log('Alpha: '+items.length+' scores (DynamoDB write skipped — Vercel cron handles SSR_V46)');
  return items.length;
}

// ====== Step 5.5: RSI + Daily Bars (sparkline, return3d, relVol) ======
// Same Polygon endpoints as Vercel watchlistBatchService.getStockDataLight()
async function harvestRsiAndDailyBars(universe) {
  console.log('Step 5.5: RSI + Daily Bars for ' + universe.length + ' tickers...');
  const rsiMap = {};
  const dailyBarsMap = {};
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 25 * 86400000).toISOString().slice(0, 10); // 25 days for sparkline(20) + return3d(4)
  
  for (let i = 0; i < universe.length; i += 50) {
    const batch = universe.slice(i, i + 50);
    await Promise.all(batch.map(async (ticker) => {
      // RSI: /v1/indicators/rsi/{ticker}?timespan=day&window=14&limit=1
      try {
        const rsiUrl = 'https://api.polygon.io/v1/indicators/rsi/' + ticker + '?timespan=day&window=14&limit=1&apiKey=' + POLYGON_KEY;
        const rsiData = await httpsGet(rsiUrl, 5000);
        if (rsiData?.results?.values?.[0]?.value) {
          rsiMap[ticker] = Math.round(rsiData.results.values[0].value * 100) / 100;
        }
      } catch {}
      
      // Daily Bars: /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}
      try {
        const aggUrl = 'https://api.polygon.io/v2/aggs/ticker/' + ticker + '/range/1/day/' + fromDate + '/' + to + '?limit=30&adjusted=true&sort=asc&apiKey=' + POLYGON_KEY;
        const aggData = await httpsGet(aggUrl, 5000);
        if (aggData?.results?.length > 0) {
          dailyBarsMap[ticker] = aggData.results.map(r => ({ close: r.c, volume: r.v || 0 }));
        }
      } catch {}
    }));
  }
  
  console.log('RSI: ' + Object.keys(rsiMap).length + ', DailyBars: ' + Object.keys(dailyBarsMap).length);
  return { rsiMap, dailyBarsMap };
}

// ====== [v7 NEW] Step 6: Build Unified Cache ======
// Combines ALL data from Steps 1-5.5 into complete unified objects
// Saves to signum-unified-cache for instant Vercel reads
async function buildUnifiedCache(priceMap, gexMap, optionsCache, smaMap, detailsMap, snapshotMap, rsiMap, dailyBarsMap) {
  console.log('Step 6: Building unified cache for '+UNIVERSE_500.length+' tickers...');
  let ok = 0, partial = 0;
  const redisBatch = []; // [v8] Collect Redis cache:analysis commands
  
  // [v8] Pre-fetch darkPool + blockTrades from flow-harvest Redis (rt-metrics:{TICKER})
  const darkPoolMap = {};
  const blockTradesMap = {};
  for (let i = 0; i < UNIVERSE_500.length; i += 20) {
    const dpBatch = UNIVERSE_500.slice(i, i + 20);
    try {
      const getCmds = dpBatch.map(t => ['GET', 'rt-metrics:' + t]);
      const results = await redisPipeline(getCmds);
      if (Array.isArray(results)) {
        results.forEach((r, idx) => {
          if (r) {
            try {
              const parsed = typeof r === 'string' ? JSON.parse(r) : r;
              darkPoolMap[dpBatch[idx]] = parsed?.darkPool?.percent || 0;
              blockTradesMap[dpBatch[idx]] = parsed?.blockTrade?.count || 0;
            } catch { darkPoolMap[dpBatch[idx]] = 0; blockTradesMap[dpBatch[idx]] = 0; }
          }
        });
      }
    } catch {}
  }
  console.log('DarkPool pre-fetch: ' + Object.keys(darkPoolMap).length + ' tickers');
  
  for (let i = 0; i < UNIVERSE_500.length; i += 10) {
    const batch = UNIVERSE_500.slice(i, i+10);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const price = priceMap[ticker];
        if (!price) return; // No price data = skip
        
        const gd = gexMap[ticker] || null;
        const sm = smaMap[ticker] || null;
        const dt = detailsMap[ticker] || {};
        const optData = optionsCache[ticker] || null;
        
        // === Build structure field (structureService-compatible from gexMap) ===
        let structure = null;
        if (gd) {
          structure = {
            options_status: 'OK',
            netGex: Math.round(gd.gex),
            maxPain: gd.maxPain,
            pcRatio: Math.round(gd.pcr*100)/100,
            levels: { callWall: gd.callWall, putFloor: gd.putFloor },
            gammaFlipLevel: gd.flipLevel,
            gammaFlipType: gd.gammaFlipType || 'NO_DATA',
            gammaRegime: gd.gammaRegime,
            totalContracts: gd.totalContracts,
            totalCallOI: gd.totalCallOI,
            totalPutOI: gd.totalPutOI,
            underlyingPrice: price,
            expiration: gd.expiration || null,
            atmIv: gd.atmIv || null,
            squeezeScore: gd.squeezeScore || 0,
            gexConfidence: gd.gexConfidence || 'LOW',
            gammaConcentration: gd.gammaConcentration || 0,
            netPremium: gd.netPremium || 0,
            gammaCoverage: gd.gammaCoverage || 0,
            validation: { confidence: gd.gexConfidence || 'LOW', source: 'lambda-v7-structureService' },
          };
        }
        
        // === Build SMA/Trend Phase ===
        let sma = null;
        if (sm && sm.sma50 && sm.sma200) {
          sma = {
            ticker, cross: sm.cross, crossType: sm.crossType,
            sma50: sm.sma50, sma200: sm.sma200,
            distance: sm.distance, isImminent: sm.isImminent,
            phase: sm.cross === 'GOLDEN' ? 'BULLISH' : sm.cross === 'DEAD' ? 'BEARISH' : 'NEUTRAL',
            label: '',
          };
        }
        
        // === Build volatility regime (from GEX + options data, or basic from SMA) ===
        let volatility = null;
        if (gd) {
          const netGex = gd.gex || 0;
          const isShortGamma = netGex < 0;
          const gammaFlip = gd.flipLevel || 0;
          const flipDistance = gammaFlip > 0 && price > 0 ? ((price - gammaFlip) / gammaFlip) * 100 : 0;
          // [STRUCTURE-SERVICE] Use ATM IV from gexMap (already structureService-compatible)
          let atmIv = gd.atmIv || 0;
          // [FIX] POST market: Polygon returns IV=0 for all options after close.
          // Preserve the last known IV from DynamoDB instead of overwriting with 0.
          if (atmIv === 0) {
            try {
              const existing = await client.send(new GetCommand({ TableName: 'signum-unified-cache', Key: { pk: ticker } }));
              const cachedIv = existing.Item?.data?.volatility?.iv;
              if (cachedIv && cachedIv > 0) {
                atmIv = cachedIv;
              }
            } catch {}
          }
          // Regime calculation
          let regimeScore = 0;
          if (isShortGamma) regimeScore += Math.min(30, Math.abs(netGex)/1000000*3);
          if (atmIv > 50) regimeScore += 20; else if (atmIv > 35) regimeScore += 12; else if (atmIv > 25) regimeScore += 6;
          const flipDist = Math.abs(flipDistance);
          if (flipDist < 1) regimeScore += 15; else if (flipDist < 3) regimeScore += 10; else if (flipDist < 5) regimeScore += 5;
          regimeScore = Math.min(100, regimeScore);
          const regime = regimeScore >= 75 ? 'ERUPTING' : regimeScore >= 50 ? 'LOADED' : regimeScore >= 25 ? 'COILING' : 'CALM';
          volatility = {
            regime, regimeScore: Math.round(regimeScore), gex:Math.round(netGex),
            gexLabel:isShortGamma?'SHORT':'LONG', iv:atmIv,
            flipDistance:Math.round(flipDistance*10)/10, flipLevel:gammaFlip,
            isAboveFlip:flipDistance>0,
            squeezeScore: gd.squeezeScore || 0,
            squeezeRisk: (gd.squeezeScore || 0) >= 70 ? 'EXTREME' : (gd.squeezeScore || 0) >= 45 ? 'HIGH' : (gd.squeezeScore || 0) >= 20 ? 'MEDIUM' : 'LOW',
            gammaConcentration: gd.gammaConcentration || 0,
            gammaConcentrationLabel: (gd.gammaConcentration || 0) >= 70 ? 'STICKY' : (gd.gammaConcentration || 0) >= 40 ? 'NORMAL' : 'LOOSE',
          };
        } else {
          // Non-GEX tickers or extended hours: preserve existing volatility entirely
          // Do NOT create a new object with gex=0 — use what's already in DynamoDB
          volatility = null; // Will be filled by prevVolatility below
        }
        
        // === Build squeeze (short volume only per cycle + cached SI% from daily detail) ===
        let squeeze = null;
        try {
          const svData = await httpsGet('https://api.polygon.io/stocks/v1/short-volume?ticker='+ticker+'&limit=1&apiKey='+POLYGON_KEY, 5000).catch(()=>null);
          const svResult = svData?.results?.[0];
          const shortVol = svResult?.short_volume || 0;
          const totalVol = svResult?.total_volume || 1;
          const shortVolPct = Math.round((shortVol/totalVol)*1000)/10;
          // Read cached SI% from daily detail (signum-pattern-db)
          let siPercent = 0, daysToCover = 0, siChange = 0;
          try {
            const siRes = await client.send(new QueryCommand({ TableName:'signum-pattern-db', KeyConditionExpression:'pattern=:p', ExpressionAttributeValues:{':p':'SI:'+ticker}, Limit:1, ScanIndexForward:false }));
            const siCached = siRes.Items?.[0];
            if (siCached) {
              siPercent = siCached.siPercent || 0;
              daysToCover = siCached.daysToCover || 0;
              siChange = siCached.siChange || 0;
            }
          } catch {}
          // [FIX] If pattern-db has no SI data, preserve existing unified-cache squeeze values
          // This prevents OnDemand-fetched accurate SI% from being overwritten with 0
          if (siPercent === 0) {
            try {
              const existingSq = await client.send(new GetCommand({ TableName:'signum-unified-cache', Key:{pk:ticker} }));
              const cachedSqueeze = existingSq.Item?.data?.squeeze;
              if (cachedSqueeze && cachedSqueeze.siPercent > 0) {
                siPercent = cachedSqueeze.siPercent;
                daysToCover = cachedSqueeze.daysToCover || daysToCover;
                siChange = cachedSqueeze.siChange || siChange;
              }
            } catch {}
          }
          let riskScore = 0;
          if (siPercent >= 20) riskScore += 40; else if (siPercent >= 10) riskScore += 25; else if (siPercent >= 5) riskScore += 10;
          if (shortVolPct >= 50) riskScore += 20; else if (shortVolPct >= 40) riskScore += 10;
          if (daysToCover >= 7) riskScore += 15; else if (daysToCover >= 3) riskScore += 10;
          if (siChange > 2) riskScore += 15; else if (siChange > 0) riskScore += 5;
          riskScore = Math.min(100, riskScore);
          const status = riskScore >= 70 ? 'CRITICAL' : riskScore >= 45 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';
          squeeze = { ticker, siPercent, daysToCover, siChange, shortVolPercent:shortVolPct, riskScore, status };
        } catch {}
        
        // === Build institutional (simplified — dark pool % from snapshot) ===
        let institutional = null;
        // For GEX tickers, we have options data to derive basic institutional signals
        // Full dark pool analysis requires 50K+ trades — too heavy for Lambda
        // Provide basic structure; warm-command can optionally supplement
        institutional = { darkPool: { percent: 0 }, blockTrade: { count: 0, volume: 0 }, shortVolume: squeeze ? { percent: squeeze.shortVolPercent } : null };
        
        // === Preserve existing data from DynamoDB if current run doesn't have it ===
        // Prevents extended-hours cron from wiping out regular-hours data
        // [FIX 2026-04-07] Also preserve fundamentals/analyst/earnings/related when current run returns null
        let prevSma = null, prevStructure = null, prevVolatility = null;
        let prevFundamentals = null, prevAnalyst = null, prevEarnings = null, prevRelated = null;
        const needsPreserve = !sma || !structure || !gd || !dt.fundamentals?.score || !dt.analyst || !dt.earnings || !dt.related;
        if (needsPreserve) {
          try {
            const existing = await client.send(new GetCommand({ TableName:'signum-unified-cache', Key:{pk:ticker} }));
            if (existing.Item?.data) {
              if (!sma && existing.Item.data.sma) prevSma = existing.Item.data.sma;
              if (!structure && existing.Item.data.structure) prevStructure = existing.Item.data.structure;
              // CRITICAL: Preserve volatility when no fresh GEX data (extended hours)
              // Prevents overwriting accurate regular-hours data with gex=0, regimeScore=0
              if (!gd && existing.Item.data.volatility) prevVolatility = existing.Item.data.volatility;
              // Preserve fundamentals when current run failed (score=null → keep previous good data)
              if ((!dt.fundamentals || dt.fundamentals.score === null) && existing.Item.data.fundamentals?.score !== null) {
                prevFundamentals = existing.Item.data.fundamentals;
              }
              if (!dt.analyst && existing.Item.data.analyst) prevAnalyst = existing.Item.data.analyst;
              if (!dt.earnings && existing.Item.data.earnings) prevEarnings = existing.Item.data.earnings;
              if (!dt.related && existing.Item.data.related) prevRelated = existing.Item.data.related;
            }
          } catch {}
        }
        
        // === Assemble unified data ===
        // Use current data if valid, otherwise fall back to preserved DynamoDB data
        const effectiveFundamentals = (dt.fundamentals && dt.fundamentals.score !== null) ? dt.fundamentals : (prevFundamentals || dt.fundamentals || null);
        const data = {
          timestamp: Date.now(),
          structure: structure || prevStructure,
          analyst: dt.analyst || prevAnalyst || null,
          fundamentals: effectiveFundamentals,
          earnings: dt.earnings || prevEarnings || null,
          sma: sma || prevSma,
          related: dt.related || prevRelated || null,
          volatility: volatility || prevVolatility,
          squeeze,
          institutional,
        };
        
        // Count filled fields
        const FIELDS = ['structure','analyst','fundamentals','earnings','sma','related','squeeze','volatility','institutional'];
        const filled = FIELDS.filter(f => data[f]).length;
        
        // Only save if we have at least some data (structure or 3+ fields)
        if (structure || filled >= 3) {
          await client.send(new PutCommand({
            TableName: 'signum-unified-cache',
            Item: {
              pk: ticker,
              data: data,
              locale: 'en',
              timestamp: Date.now(),
              updatedAt: new Date().toISOString(),
              fieldCount: filled,
              version: 'v8-structureService',
            },
          }));
          if (filled >= 7) ok++; else partial++;
          
          // [v8] Build cache:analysis entry for Redis (matching AnalysisCacheEntry type)
          if (structure) {
            // --- Compute REAL alpha score ---
            const snap = snapshotMap?.[ticker] || {};
            const alphaRaw = computeAlphaScore(snap, gd || null);
            const alphaGrade = alphaRaw >= 80 ? 'S' : alphaRaw >= 65 ? 'A' : alphaRaw >= 50 ? 'B' : alphaRaw >= 35 ? 'C' : 'D';
            const alphaAction = alphaRaw >= 65 ? 'BUY' : alphaRaw >= 50 ? 'HOLD' : alphaRaw >= 35 ? 'WATCH' : 'AVOID';
            const alphaTriggers = [];
            if (snap.changePct > 3) alphaTriggers.push('MOMENTUM_SURGE');
            if (snap.changePct < -3) alphaTriggers.push('SELL_PRESSURE');
            if (gd?.gammaRegime === 'POSITIVE') alphaTriggers.push('LONG_GAMMA');
            if (gd?.gammaRegime === 'NEGATIVE') alphaTriggers.push('SHORT_GAMMA');
            if (gd?.pcr > 1.3) alphaTriggers.push('HIGH_PCR');
            if (gd?.pcr < 0.7) alphaTriggers.push('LOW_PCR');
            if (snap.volume > 50000000) alphaTriggers.push('HIGH_VOLUME');
            
            // --- Compute ivSkew from callWall/putFloor (matching frontend computeIVSkew) ---
            const cw = structure.levels?.callWall || 0;
            const pf = structure.levels?.putFloor || 0;
            const ivSkew = (cw > 0 && pf > 0 && price > 0) ? Math.round((cw - pf) / price * 10000) / 100 : null;
            
            // --- Compute impliedMovePct from callWall-putFloor spread ---
            const impliedMovePct = (cw > 0 && pf > 0 && price > 0) ? Math.round((cw - pf) / price * 10000) / 100 : null;
            
            // --- Compute REAL vwapDist ---
            const snapVwap = snap.vwap || 0;
            const vwapDist = snapVwap > 0 ? Math.round(((price - snapVwap) / snapVwap) * 10000) / 100 : null;
            
            // --- Read darkPoolPct from pre-fetched darkPoolMap ---
            let darkPoolPct = darkPoolMap[ticker] || 0;
            
            const analysisEntry = {
              ticker,
              timestamp: Date.now(),
              alphaSnapshot: {
                score: alphaRaw,
                grade: alphaGrade,
                action: alphaAction,
                actionKR: alphaAction === 'BUY' ? '매수' : alphaAction === 'HOLD' ? '관망' : alphaAction === 'WATCH' ? '주의' : '회피',
                confidence: Math.min(100, Math.max(0, Math.abs(alphaRaw - 50) * 2)),
                triggers: alphaTriggers,
                engineVersion: 'lambda-v8',
                capturedAt: new Date().toISOString(),
              },
              rsi: rsiMap?.[ticker] ?? null,
              return3d: (() => { const db = dailyBarsMap?.[ticker]; if (!db || db.length < 4) return null; const r = db.slice(-4); return Math.round(((r[r.length-1].close - r[0].close) / r[0].close) * 10000) / 100; })(),
              sparkline: dailyBarsMap?.[ticker]?.slice(-20).map(d => d.close) || [],
              relVol: (() => { const db = dailyBarsMap?.[ticker]; if (!db || db.length < 2) return null; const lv = db[db.length-1].volume; const pv = db[db.length-2].volume; return pv > 0 ? Math.round((lv/pv)*100)/100 : null; })(),
              expiration: structure.expiration || null,
              maxPain: structure.maxPain || null,
              gex: structure.netGex || null,
              gexM: structure.netGex ? Math.round(structure.netGex / 1000000 * 10) / 10 : null,
              pcr: structure.pcRatio || null,
              callWall: structure.levels?.callWall || null,
              putFloor: structure.levels?.putFloor || null,
              gammaFlipLevel: structure.gammaFlipLevel || null,
              squeezeScore: structure.squeezeScore || null,
              iv: structure.atmIv || null,
              whaleIndex: (() => {
                // Composite Whale Index: GEX(25%) + DarkPool(25%) + BlockTrades(25%) + NetPremium(25%)
                let score = 0;
                // 1. GEX component (0-25): higher abs GEX = more institutional hedging
                const absGex = Math.abs(structure.netGex || 0);
                if (absGex > 50000000) score += 25;
                else if (absGex > 10000000) score += 20;
                else if (absGex > 1000000) score += 15;
                else if (absGex > 100000) score += 8;
                // 2. DarkPool component (0-25): higher DP% = more institutional trading
                const dp = darkPoolPct || 0;
                if (dp >= 60) score += 25;
                else if (dp >= 45) score += 20;
                else if (dp >= 30) score += 12;
                else if (dp > 0) score += 5;
                // 3. BlockTrades component (0-25): more blocks = whale activity
                const bt = blockTradesMap[ticker] || 0;
                if (bt >= 10) score += 25;
                else if (bt >= 5) score += 20;
                else if (bt >= 2) score += 15;
                else if (bt >= 1) score += 8;
                // 4. NetPremium component (0-25): larger abs premium flow = institutional conviction
                const absNp = Math.abs(structure.netPremium || 0);
                if (absNp > 10000000) score += 25;
                else if (absNp > 5000000) score += 20;
                else if (absNp > 1000000) score += 15;
                else if (absNp > 100000) score += 8;
                return Math.min(100, score);
              })(),
              whaleConfidence: (() => {
                const dp = darkPoolPct || 0;
                const bt = blockTradesMap[ticker] || 0;
                const absNp = Math.abs(structure.netPremium || 0);
                // HIGH: multiple strong signals, MED: some signals, LOW: weak
                let signals = 0;
                if (dp >= 50) signals++;
                if (bt >= 3) signals++;
                if (absNp > 5000000) signals++;
                if (Math.abs(structure.netGex || 0) > 10000000) signals++;
                return signals >= 3 ? 'HIGH' : signals >= 2 ? 'MED' : signals >= 1 ? 'LOW' : 'NONE';
              })(),
              darkPoolPct: darkPoolPct,
              netPremium: structure.netPremium || null,
              vwapDist: vwapDist,
              volume: snap.volume || null,
              ivSkew: ivSkew,
              impliedMovePct: impliedMovePct,
              // [FIX] V3.1 dashboard fields — previously missing from Lambda cache
              vwap: snap.vw || null,  // Polygon snapshot VWAP (day.vw)
              // Volume PCR: use OI-based callVol/putVol from gexMap (volume data not available in Lambda)
              volumePcr: structure.totalCallOI > 0 ? Math.round((structure.totalPutOI / structure.totalCallOI) * 1000) / 1000 : (structure.pcRatio || null),
              volumePcrCallVol: structure.totalCallOI || null,
              volumePcrPutVol: structure.totalPutOI || null,
            };
            redisBatch.push(['SET', 'cache:analysis:' + ticker, JSON.stringify(analysisEntry), 'EX', String(REDIS_TTL)]);
          }
          
          // [v8] Also write cache:command:unified:{TICKER} — full 9-field data for Command/Ticker pages
          // This replaces the dead warm-command cron (DynamoDB→Redis sync)
          const commandEntry = { ...data, timestamp: Date.now() };
          redisBatch.push(['SET', 'cache:command:unified:' + ticker, JSON.stringify(commandEntry), 'EX', String(REDIS_TTL)]);
        }
      } catch (e) {
        console.log('Unified err '+ticker+': '+(e.message||e));
      }
    }));
  }
  
  // [v8] Flush Redis pipeline (batches of 20)
  let redisOk = 0;
  if (redisBatch.length > 0) {
    console.log('Writing ' + redisBatch.length + ' Redis entries (cache:analysis + cache:command:unified)...');
    for (let i = 0; i < redisBatch.length; i += 20) {
      const batch = redisBatch.slice(i, i + 20);
      const written = await redisPipeline(batch);
      redisOk += written;
    }
    console.log('Redis: ' + redisOk + '/' + redisBatch.length + ' entries written (analysis+command)');
  }
  
  console.log('Unified Cache: '+ok+' complete, '+partial+' partial, total='+(ok+partial)+'/'+UNIVERSE_500.length+', redis='+redisOk);
  return { complete: ok, partial, redisWritten: redisOk };
}

exports.handler = async (event) => {
  const start = Date.now();
  console.log('SIGNUM Harvest Lambda v8.0 — FMP Earnings + SI% Restore — ' + new Date().toISOString());
  
  // ══════════════════════════════════════════════════════════════
  // ON-DEMAND MODE: Fetch a single non-universe ticker
  // Triggered by: Lambda Function URL or direct invoke
  // Input: event.onDemandTicker OR event.queryStringParameters.ticker
  // Output: unified data saved to signum-unified-cache DynamoDB
  // ══════════════════════════════════════════════════════════════
  const onDemandTicker = event.onDemandTicker 
    || event.queryStringParameters?.ticker 
    || (event.body ? JSON.parse(event.body).ticker : null);
  
  if (onDemandTicker) {
    const ticker = onDemandTicker.toUpperCase().trim();
    console.log('[ON-DEMAND] Fetching ' + ticker + '...');
    
    try {
      // 1. Price snapshot
      const snapRes = await httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/' + ticker + '?apiKey=' + POLYGON_KEY, 8000);
      const snap = snapRes?.ticker;
      const price = snap?.lastTrade?.p || snap?.day?.c || snap?.prevDay?.c || 0;
      if (!price) {
        return { statusCode: 404, body: JSON.stringify({ error: 'No price data for ' + ticker }) };
      }
      const changePct = snap?.todaysChangePerc || 0;
      const volume = snap?.day?.v || 0;
      
      // 2. Options (GEX/structure) — structureService-compatible
      let structure = null, gexData = null, opts = [];
      try {
        const weeklyResult = await getWeeklyOptions(ticker);
        opts = weeklyResult.contracts;
        const expiration = weeklyResult.expiration;
        if (opts.length > 0) {
          // Parse contracts
          const cleanContracts = [];
          let totalCallOI = 0, totalPutOI = 0;
          for (const c of opts) {
            const k = c.details?.strike_price || c.strike_price || 0;
            const type = (c.details?.contract_type || c.contract_type || 'call').toLowerCase();
            const oi = c.open_interest;
            if (oi !== undefined && oi !== null) {
              cleanContracts.push({ ...c, k, type, oi });
              if (type === 'call') totalCallOI += oi;
              else totalPutOI += oi;
            }
          }
          const pcr = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : 0;
          
          // Net GEX with ±20% callWall/putFloor
          let netGex = 0, callWall = null, putFloor = null;
          let maxCallOi = -1, maxPutOi = -1, gammaCount = 0;
          const maxResist = price * 1.20;
          const minSupport = price * 0.80;
          let callPremiumVol = 0, putPremiumVol = 0;
          
          cleanContracts.forEach(c => {
            const g = c.greeks?.gamma;
            if (typeof g === 'number' && isFinite(g)) {
              netGex += g * c.oi * 100 * (c.type === 'call' ? -1 : 1) * price;
              gammaCount++;
            }
            if (c.type === 'call' && c.k > price && c.k <= maxResist && c.oi > maxCallOi) { maxCallOi = c.oi; callWall = c.k; }
            if (c.type === 'put' && c.k < price && c.k >= minSupport && c.oi > maxPutOi) { maxPutOi = c.oi; putFloor = c.k; }
            const vol = c.day?.volume || c.day?.v || 0;
            const lp = c.last_trade?.price || c.last_trade?.p || 0;
            if (vol > 0 && lp > 0) { if (c.type === 'call') callPremiumVol += vol * lp * 100; else putPremiumVol += vol * lp * 100; }
          });
          
          // Max Pain
          let maxPain = null, minLoss = Infinity;
          const distinctStrikes = [...new Set(cleanContracts.map(c => c.k))].sort((a, b) => a - b);
          distinctStrikes.forEach(ts => {
            let loss = 0;
            cleanContracts.forEach(c => {
              if (c.type === 'call' && ts > c.k) loss += (ts - c.k) * c.oi;
              else if (c.type === 'put' && ts < c.k) loss += (c.k - ts) * c.oi;
            });
            if (loss < minLoss) { minLoss = loss; maxPain = ts; }
          });
          
          // Gamma Flip (crossover search)
          const gexByStrike = new Map();
          cleanContracts.forEach(c => {
            const g = c.greeks?.gamma;
            if (typeof g === 'number' && isFinite(g) && g !== 0) {
              gexByStrike.set(c.k, (gexByStrike.get(c.k) || 0) + g * c.oi * 100 * (c.type === 'call' ? -1 : 1));
            }
          });
          let gammaFlipLevel = null;
          if (gexByStrike.size > 0) {
            const strikesGex = [...gexByStrike.entries()].sort((a, b) => a[0] - b[0]);
            let cum = 0;
            const crossings = [];
            for (let j = 0; j < strikesGex.length; j++) {
              const prev = cum;
              cum += strikesGex[j][1];
              if (j > 0 && ((prev < 0 && cum >= 0) || (prev > 0 && cum <= 0))) crossings.push(strikesGex[j][0]);
            }
            const atmRange = price * 0.15;
            const atmCrossings = crossings.filter(s => Math.abs(s - price) <= atmRange);
            if (atmCrossings.length > 0) gammaFlipLevel = atmCrossings.reduce((c, s) => Math.abs(s - price) < Math.abs(c - price) ? s : c);
          }
          
          // ATM IV
          let atmIv = null;
          if (cleanContracts.length > 0) {
            const ivStrikes = [...new Set(cleanContracts.map(c => c.k))].sort((a, b) => a - b);
            const atmStrike = ivStrikes.reduce((cl, s) => Math.abs(s - price) < Math.abs(cl - price) ? s : cl);
            const getIv = (c) => { const r = c?.implied_volatility || c?.greeks?.implied_volatility; return typeof r === 'number' && r > 0 ? (r > 1 ? r : r * 100) : null; };
            const cIv = getIv(cleanContracts.find(c => c.k === atmStrike && c.type === 'call'));
            const pIv = getIv(cleanContracts.find(c => c.k === atmStrike && c.type === 'put'));
            if (cIv !== null && pIv !== null) { const sp = Math.abs(cIv - pIv); atmIv = Math.round(sp > 40 ? Math.min(cIv, pIv) : (cIv + pIv) / 2); }
            else atmIv = cIv !== null ? Math.round(cIv) : (pIv !== null ? Math.round(pIv) : null);
          }
          
          const gammaCoverage = cleanContracts.length > 0 ? gammaCount / cleanContracts.length : 0;
          const gexConfidence = gammaCoverage >= 0.80 ? 'HIGH' : gammaCoverage >= 0.60 ? 'MEDIUM' : 'LOW';
          const gammaRegime = netGex > 0 ? 'POSITIVE' : netGex < 0 ? 'NEGATIVE' : 'NEUTRAL';
          
          gexData = { gex: netGex, pcr, gammaRegime, callWall, putFloor, maxPain, flipLevel: gammaFlipLevel, totalContracts: opts.length, totalCallOI, totalPutOI, expiration };
          
          // Squeeze Score (basic version for on-demand)
          let squeezeScore = 0;
          if (netGex < 0) squeezeScore += Math.min(35, Math.round(Math.abs(netGex) / 10000000));
          if (pcr <= 0.4 || pcr >= 1.8) squeezeScore += 10;
          else if (pcr <= 0.6 || pcr >= 1.5) squeezeScore += 5;
          if (atmIv !== null && atmIv >= 60) squeezeScore += 15;
          else if (atmIv !== null && atmIv >= 45) squeezeScore += 10;
          squeezeScore = Math.min(100, squeezeScore);
          
          structure = {
            options_status: 'OK', netGex: Math.round(netGex), maxPain,
            pcRatio: pcr, levels: { callWall, putFloor },
            gammaFlipLevel, gammaRegime, totalContracts: opts.length,
            totalCallOI, totalPutOI, underlyingPrice: price,
            expiration, atmIv, gexConfidence, squeezeScore,
            netPremium: Math.round(callPremiumVol - putPremiumVol),
            validation: { confidence: gexConfidence, source: 'lambda-ondemand-structureService' },
          };
        }
      } catch (e) { console.log('[ON-DEMAND] Options err: ' + e.message); }
      
      // 3. Fundamentals (full scoring: reference + ratios + vX financials)
      let fundamentals = null, overview = null;
      try {
        const [refData, ratiosData, vxData] = await Promise.all([
          httpsGet('https://api.polygon.io/v3/reference/tickers/' + ticker + '?apiKey=' + POLYGON_KEY, 5000).catch(() => null),
          httpsGet('https://api.polygon.io/stocks/financials/v1/ratios?ticker=' + ticker + '&limit=1&apiKey=' + POLYGON_KEY, 5000).catch(() => null),
          httpsGet('https://api.polygon.io/vX/reference/financials?ticker=' + ticker + '&limit=5&timeframe=quarterly&order=desc&sort=period_of_report_date&apiKey=' + POLYGON_KEY, 5000).catch(() => null),
        ]);
        const r = refData?.results;
        const ratios = ratiosData?.results?.[0] || {};
        const pe = ratios.price_to_earnings ?? null;
        const de = ratios.debt_to_equity ?? null;
        const roe = ratios.return_on_equity ?? null;
        const pb = ratios.price_to_book ?? null;
        const ps = ratios.price_to_sales ?? null;
        const fcfRaw = ratios.free_cash_flow ?? null;
        const mktCap = ratios.market_cap ?? (r?.market_cap || null);
        let fcfYield = null;
        if (fcfRaw !== null && mktCap !== null && mktCap > 0) fcfYield = (fcfRaw / mktCap) * 100;
        const vxResults = vxData?.results || [];
        let revenueGrowth = null, netMargin = null;
        if (vxResults.length >= 1) {
          const latest = vxResults[0]?.financials?.income_statement;
          if (latest) { const revL = latest.revenues?.value||0, ni = latest.net_income_loss?.value||0; if(revL>0) netMargin=(ni/revL)*100; }
          if (latest && vxResults.length >= 2) {
            const revL = latest.revenues?.value || 0;
            let revP = 0; const pi = vxResults.length >= 5 ? 4 : vxResults.length - 1;
            for (let j = pi; j >= 1; j--) { const v = vxResults[j]?.financials?.income_statement?.revenues?.value; if(v && v > 0){revP=v;break;} }
            if (revP > 0 && revL > 0) revenueGrowth = ((revL - revP) / Math.abs(revP)) * 100;
          }
        }
        let score = 0; const breakdown = {};
        if (pe !== null && pe > 0) { const s=pe<15?20:pe<25?16:pe<35?12:pe<50?8:4; score+=s; breakdown.pe={value:pe.toFixed(1),score:s,label:'P/E'}; } else { breakdown.pe={value:pe!==null?pe.toFixed(1):'N/A',score:0,label:'P/E'}; }
        if (de !== null) { const s=de<0.3?20:de<0.6?16:de<1.0?12:de<2.0?8:4; score+=s; breakdown.de={value:de.toFixed(2),score:s,label:'D/E'}; } else { breakdown.de={value:'N/A',score:0,label:'D/E'}; }
        if (fcfYield !== null) { const s=fcfYield>8?20:fcfYield>5?16:fcfYield>3?12:fcfYield>1?8:4; score+=s; breakdown.fcf={value:fcfYield.toFixed(1)+'%',score:s,label:'FCF'}; } else { breakdown.fcf={value:'N/A',score:0,label:'FCF'}; }
        if (revenueGrowth !== null) { const s=revenueGrowth>50?20:revenueGrowth>25?16:revenueGrowth>10?12:revenueGrowth>0?8:4; score+=s; breakdown.rev={value:(revenueGrowth>0?'+':'')+revenueGrowth.toFixed(0)+'%',score:s,label:'Rev'}; } else { breakdown.rev={value:'N/A',score:0,label:'Rev'}; }
        if (netMargin !== null) { const s=netMargin>30?20:netMargin>20?16:netMargin>10?12:netMargin>0?8:4; score+=s; breakdown.margin={value:netMargin.toFixed(1)+'%',score:s,label:'Margin'}; } else { breakdown.margin={value:'N/A',score:0,label:'Margin'}; }
        const hasAnyData = Object.values(breakdown).some(b => b.score > 0);
        let grade, finalScore;
        if (!hasAnyData) { grade='NO_DATA'; finalScore=null; } else { finalScore=score; grade=score>=80?'A':score>=70?'A-':score>=60?'B+':score>=50?'B':score>=40?'C+':score>=30?'C':score>=20?'D':'F'; }
        fundamentals = { ticker, name:r?.name||ticker, marketCap:r?.market_cap||mktCap, sector:r?.sic_description||null, description:r?.description?.slice(0,500)||null, exchange:r?.primary_exchange||null, score:finalScore, grade, pe:pe!==null?Math.round(pe*10)/10:null, de:de!==null?Math.round(de*100)/100:null, roe:roe!==null?Math.round(roe*1000)/10:null, revenueGrowth:revenueGrowth!==null?Math.round(revenueGrowth*10)/10:null, netMargin:netMargin!==null?Math.round(netMargin*10)/10:null, fcfYield:fcfYield!==null?Math.round(fcfYield*10)/10:null, pb:pb!==null?Math.round(pb*10)/10:null, ps:ps!==null?Math.round(ps*10)/10:null, breakdown };
        if (r) { overview = { name:r.name||ticker, sector:r.sic_description||null, sectorEN:r.sic_description||null, description:r.description?.slice(0,300)||null, descriptionEN:r.description?.slice(0,300)||null, marketCap:r.market_cap||null, exchange:r.primary_exchange||null }; }
      } catch {}
      
      // 4. Analyst (FMP)
      let analyst = null;
      if (FMP_KEY) {
        try {
          const data = await httpsGet('https://financialmodelingprep.com/stable/grades-consensus?symbol='+ticker+'&apikey='+FMP_KEY, 5000);
          const grade = Array.isArray(data) ? data[0] : data;
          if (grade && (grade.strongBuy || grade.buy || grade.hold)) {
            const total = (grade.strongBuy||0)+(grade.buy||0)+(grade.hold||0)+(grade.sell||0)+(grade.strongSell||0);
            const bullishPct = total > 0 ? Math.round(((grade.strongBuy||0)+(grade.buy||0))/total*100) : 0;
            let consensus = grade.consensus || 'N/A';
            if (consensus === 'N/A' && total > 0) {
              const ws = ((grade.strongBuy||0)*5+(grade.buy||0)*4+(grade.hold||0)*3+(grade.sell||0)*2+(grade.strongSell||0))/total;
              consensus = ws>=4.3?'STRONG BUY':ws>=3.5?'BUY':ws>=2.5?'HOLD':ws>=1.7?'SELL':'STRONG SELL';
            }
            analyst = { ticker, consensus, totalAnalysts:total, bullishPct, breakdown:{ strongBuy:grade.strongBuy||0, buy:grade.buy||0, hold:grade.hold||0, sell:grade.sell||0, strongSell:grade.strongSell||0 } };
          }
        } catch {}
      }
      
      // 5. Earnings (DynamoDB cache first, then FMP fallback)
      let earnings = null;
      try {
        // Try DynamoDB pattern-db first (cached by scheduled harvest)
        const earningsRes = await client.send(new QueryCommand({ TableName:'signum-pattern-db', KeyConditionExpression:'pattern=:p', ExpressionAttributeValues:{':p':'EARNINGS:'+ticker}, Limit:1, ScanIndexForward:false })).catch(()=>({Items:[]}));
        const cached = earningsRes.Items?.[0];
        if (cached?.nextDate) {
          const today = new Date().toISOString().slice(0,10);
          const daysUntil = Math.ceil((new Date(cached.nextDate).getTime()-new Date(today).getTime())/86400000);
          earnings = { ticker, nextEarningsDate:cached.nextDate, daysUntilEarnings:daysUntil, daysLabel:daysUntil<=0?'today':'D-'+daysUntil, hasData:true, epsEstimate:cached.epsEstimate||null };
        }
        // If no cached data, fetch from FMP (90-day window = much smaller response)
        if (!earnings && FMP_KEY) {
          const today = new Date().toISOString().slice(0,10);
          const toDate = new Date(Date.now()+90*86400000).toISOString().slice(0,10);
          const earningsAll = await httpsGet('https://financialmodelingprep.com/stable/earnings-calendar?from='+today+'&to='+toDate+'&apikey='+FMP_KEY, 10000);
          const events = Array.isArray(earningsAll) ? earningsAll.filter(e => e.symbol === ticker) : [];
          if (events.length > 0) {
            const next = events.sort((a,b) => new Date(a.date).getTime()-new Date(b.date).getTime())[0];
            const daysUntil = Math.ceil((new Date(next.date).getTime()-new Date(today).getTime())/(86400000));
            earnings = { ticker, nextEarningsDate:next.date, daysUntilEarnings:daysUntil, daysLabel:daysUntil<=0?'today':'D-'+daysUntil, hasData:true, epsEstimate:next.epsEstimated||null };
            // Cache for future use
            await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'EARNINGS:'+ticker, timestamp:Date.now(), nextDate:next.date, daysUntil, epsEstimate:next.epsEstimated||null }})).catch(()=>{});
          }
        }
      } catch {}
      
      // 6. SMA
      let sma = null;
      try {
        const [s50, s200] = await Promise.all([
          httpsGet('https://api.polygon.io/v1/indicators/sma/'+ticker+'?timespan=day&adjusted=true&window=50&series_type=close&limit=1&apiKey='+POLYGON_KEY, 5000),
          httpsGet('https://api.polygon.io/v1/indicators/sma/'+ticker+'?timespan=day&adjusted=true&window=200&series_type=close&limit=1&apiKey='+POLYGON_KEY, 5000),
        ]);
        const sma50 = s50?.results?.values?.[0]?.value || null;
        const sma200 = s200?.results?.values?.[0]?.value || null;
        if (sma50 && sma200) {
          const cross = sma50 > sma200 ? 'GOLDEN' : 'DEAD';
          const distance = Math.round(((sma50-sma200)/sma200)*10000)/100;
          sma = { ticker, cross, crossType:'EST', sma50:Math.round(sma50*100)/100, sma200:Math.round(sma200*100)/100, distance, isImminent:Math.abs(distance)<0.5, phase:cross==='GOLDEN'?'BULLISH':'BEARISH' };
        }
      } catch {}
      
      // 7. Related Companies (Polygon)
      let related = null;
      try {
        const relData = await httpsGet('https://api.polygon.io/v1/related-companies/'+ticker+'?apiKey='+POLYGON_KEY, 5000);
        const rels = relData?.results || [];
        if (rels.length > 0) {
          const relTickers = rels.slice(0,10).map(r => r.ticker);
          related = { ticker, count:relTickers.length, topRelated:relTickers.slice(0,4).map(t=>({ticker:t,price:0,change:0,logo:null})), relatedTickers:relTickers, allTickers:relTickers };
        }
      } catch {}
      
      // 8. Volatility (derived from GEX or basic)
      let volatility = null;
      // [STRUCTURE-SERVICE] Use ATM IV already calculated in structure
      let atmIv = (structure && structure.atmIv) ? structure.atmIv : 0;
      // [FIX] POST market: Polygon returns IV=0. Preserve last known IV from DynamoDB.
      if (atmIv === 0) {
        try {
          const existing = await client.send(new GetCommand({ TableName: 'signum-unified-cache', Key: { pk: ticker } }));
          const cachedIv = existing.Item?.data?.volatility?.iv;
          if (cachedIv && cachedIv > 0) atmIv = cachedIv;
        } catch {}
      }
      if (gexData) {
        const netGex = gexData.gex || 0;
        const isShortGamma = netGex < 0;
        const flipDist = gexData.flipLevel && price > 0 ? ((price - gexData.flipLevel) / gexData.flipLevel) * 100 : 0;
        let regimeScore = 0;
        if (isShortGamma) regimeScore += Math.min(30, Math.abs(netGex)/1000000*3);
        if (Math.abs(flipDist) < 1) regimeScore += 15; else if (Math.abs(flipDist) < 3) regimeScore += 10;
        if (atmIv > 50) regimeScore += 20; else if (atmIv > 35) regimeScore += 12; else if (atmIv > 25) regimeScore += 6;
        regimeScore = Math.min(100, regimeScore);
        const regime = regimeScore >= 75 ? 'ERUPTING' : regimeScore >= 50 ? 'LOADED' : regimeScore >= 25 ? 'COILING' : 'CALM';
        volatility = { regime, regimeScore:Math.round(regimeScore), gex:Math.round(netGex), gexLabel:isShortGamma?'SHORT':'LONG', iv:atmIv, flipDistance:Math.round(flipDist*10)/10, flipLevel:gexData.flipLevel||0, isAboveFlip:flipDist>0, squeezeScore:0, squeezeRisk:'LOW', gammaConcentration:0, gammaConcentrationLabel:'NORMAL' };
      } else {
        // Non-GEX: still calculate regimeScore from IV
        let regimeScore = 0;
        if (atmIv > 50) regimeScore += 20; else if (atmIv > 35) regimeScore += 12; else if (atmIv > 25) regimeScore += 6;
        regimeScore = Math.min(100, regimeScore);
        const regime = regimeScore >= 75 ? 'ERUPTING' : regimeScore >= 50 ? 'LOADED' : regimeScore >= 25 ? 'COILING' : 'CALM';
        volatility = { regime, regimeScore, gex:0, gexLabel:'N/A', iv:atmIv, flipDistance:0, flipLevel:0, isAboveFlip:false, squeezeScore:0, squeezeRisk:'LOW', gammaConcentration:0, gammaConcentrationLabel:'NORMAL' };
      }
      
      // 9. Short Squeeze (Polygon short volume + short interest + float)
      // [FIX 2026-04-07] settlement_date.gte + /stocks/vX/float (matching Step 4e fix)
      let squeeze = null;
      try {
        const [svData, siData2, floatData2] = await Promise.all([
          httpsGet('https://api.polygon.io/stocks/v1/short-volume?ticker='+ticker+'&limit=1&apiKey='+POLYGON_KEY, 8000).catch(()=>null),
          httpsGet('https://api.polygon.io/stocks/v1/short-interest?ticker='+ticker+'&settlement_date.gte=2024-01-01&limit=2&order=desc&sort=settlement_date&apiKey='+POLYGON_KEY, 8000).catch(()=>null),
          httpsGet('https://api.polygon.io/stocks/vX/float?ticker='+ticker+'&apiKey='+POLYGON_KEY, 8000).catch(()=>null),
        ]);
        const svResult = svData?.results?.[0];
        const shortVol = svResult?.short_volume || 0;
        const totalVol = svResult?.total_volume || 1;
        const shortVolPct = Math.round((shortVol/totalVol)*1000)/10;
        let siPercent = 0, daysToCover = 0, siChange = 0;
        const siResults2 = (siData2?.results || []).sort((a,b) => (b.settlement_date||'').localeCompare(a.settlement_date||''));
        const floatShares2 = floatData2?.results?.[0]?.free_float || 0;
        if (siResults2.length > 0 && floatShares2 > 0) {
          siPercent = Math.round((siResults2[0].short_interest / floatShares2) * 1000) / 10;
          daysToCover = siResults2[0].days_to_cover || 0;
          if (siResults2.length >= 2) {
            const prevSi = Math.round((siResults2[1].short_interest / floatShares2) * 1000) / 10;
            siChange = Math.round((siPercent - prevSi) * 10) / 10;
          }
        }
        let riskScore = 0;
        if (siPercent >= 20) riskScore += 40; else if (siPercent >= 10) riskScore += 25; else if (siPercent >= 5) riskScore += 10;
        if (shortVolPct >= 50) riskScore += 20; else if (shortVolPct >= 40) riskScore += 10;
        if (daysToCover >= 7) riskScore += 15; else if (daysToCover >= 3) riskScore += 10;
        if (siChange > 2) riskScore += 15; else if (siChange > 0) riskScore += 5;
        riskScore = Math.min(100, riskScore);
        const status = riskScore >= 70 ? 'CRITICAL' : riskScore >= 45 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';
        squeeze = { ticker, siPercent, daysToCover, siChange, shortVolPercent:shortVolPct, riskScore, status, floatShares:floatShares2, settlementDate:siResults2[0]?.settlement_date||null };
      } catch {}
      
      // 10. Institutional (basic structure)
      const institutional = { darkPool:{percent:0}, blockTrade:{count:0,volume:0}, shortVolume:squeeze?{percent:squeeze.shortVolPercent}:null };
      
      // 11. Save to DynamoDB (signum-unified-cache)
      const data = { timestamp:Date.now(), structure, analyst, fundamentals, earnings, sma, related, volatility, squeeze, institutional };
      const FIELDS = ['structure','analyst','fundamentals','earnings','sma'];
      const filled = FIELDS.filter(f => data[f]).length;
      
      await client.send(new PutCommand({
        TableName: 'signum-unified-cache',
        Item: { pk:ticker, data, locale:'en', timestamp:Date.now(), updatedAt:new Date().toISOString(), fieldCount:filled, version:'v7-ondemand' },
      }));
      
      // Also save overview separately
      if (overview) {
        await client.send(new PutCommand({
          TableName: 'signum-unified-cache',
          Item: { pk:ticker+':overview', data:overview, locale:'en', timestamp:Date.now(), updatedAt:new Date().toISOString(), version:'v7-ondemand' },
        })).catch(() => {});
      }
      
      // [v8] Write to Redis: cache:command:unified + cache:analysis
      if (structure) {
        // cache:command:unified — full 9-field data for Command/Ticker pages
        await redisSet('cache:command:unified:' + ticker, data, REDIS_TTL).catch(() => {});
        // cache:analysis — analysis summary for Dashboard/Watchlist/Portfolio
        const analysisEntry = {
          ticker, timestamp: Date.now(),
          alphaSnapshot: { score: 0, grade: 'N/A', action: 'HOLD', confidence: 0, triggers: [], engineVersion: 'lambda-v8-ondemand', capturedAt: new Date().toISOString() },
          rsi: null, return3d: null, sparkline: [], relVol: null,
          expiration: structure.expiration || null,
          maxPain: structure.maxPain || null,
          gex: structure.netGex || null,
          gexM: structure.netGex ? Math.round(structure.netGex / 1000000 * 10) / 10 : null,
          pcr: structure.pcRatio || null,
          callWall: structure.levels?.callWall || null,
          putFloor: structure.levels?.putFloor || null,
          gammaFlipLevel: structure.gammaFlipLevel || null,
          squeezeScore: structure.squeezeScore || null,
          iv: structure.atmIv || null,
          whaleIndex: 0, whaleConfidence: 'NONE',
          darkPoolPct: 0, netPremium: structure.netPremium || null,
          vwapDist: null, volume: null, ivSkew: null, impliedMovePct: null,
        };
        await redisSet('cache:analysis:' + ticker, analysisEntry, REDIS_TTL).catch(() => {});
      }
      
      const duration = Date.now() - start;
      console.log('[ON-DEMAND] ' + ticker + ' saved: ' + filled + '/5 fields + Redis in ' + duration + 'ms');
      
      return { 
        statusCode: 200, 
        body: JSON.stringify({ 
          success: true, ticker, fields: filled, duration,
          hasStructure: !!structure, hasFundamentals: !!fundamentals, 
          hasAnalyst: !!analyst, hasEarnings: !!earnings, hasSma: !!sma,
          price, changePct: Math.round(changePct*100)/100,
        }) 
      };
    } catch (e) {
      console.error('[ON-DEMAND] Error for ' + ticker + ':', e.message);
      return { statusCode: 500, body: JSON.stringify({ error: e.message, ticker }) };
    }
  }
  
  // ══════════════════════════════════════════════════════════════
  // SCHEDULED MODE: Original v7 harvest (unchanged)
  // ══════════════════════════════════════════════════════════════
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const utcMin = hour*60+minute;
  const day = new Date().getUTCDay(); // 0=Sun, 6=Sat
  const isWeekend = (day === 0 || day === 6);
  const isExtended = (utcMin >= 8*60) || (utcMin <= 1*60);
  const isRegular = (utcMin >= 13*60+30 && utcMin <= 21*60);
  const forceRun = event && event.forceRun;
  
  // Weekend: skip everything — preserve Friday's data as-is
  if (isWeekend) {
    console.log('Weekend (day='+day+') — skipping all steps to preserve Friday data');
    return { statusCode:200, body:JSON.stringify({ skipped:true, reason:'Weekend - Friday data preserved', day }) };
  }
  
  if (!isExtended && !forceRun) {
    return { statusCode:200, body:JSON.stringify({ skipped:true, reason:'Markets closed', utcHour:hour }) };
  }
  const results = {};
  
  // Always: Prices + RLSI
  const { count, priceMap, snapshotMap } = await harvestPrices();
  results.prices = count;
  results.rlsi = await computeRlsi();
  
  // Regular hours: GEX + Alpha + SMA + Unified Cache
  let gexMap = {}, optionsCache = {}, smaMap = {};
  if (isRegular || forceRun) {
    const gexResult = await harvestGex(priceMap);
    gexMap = gexResult.gexMap;
    optionsCache = gexResult.optionsCache;
    results.gex = Object.keys(gexMap).length;
    results.alpha = await updateAlphaScores(snapshotMap, gexMap);
    const smaResult = await harvestSMA(priceMap);
    results.sma = smaResult.smaCount;
    smaMap = smaResult.smaMap;
  } else {
    results.gex = 'SKIP:extended';
    results.sma = 'SKIP:extended';
  }
  
  // Daily details: run once at 14:30 UTC (market open + 1hr) or forceRun
  let detailsMap = {};
  const isDailyDetailTime = (utcMin >= 14*60+25 && utcMin <= 14*60+35);
  if (isDailyDetailTime || forceRun) {
    const detailResult = await harvestDetails();
    results.details = { analyst: detailResult.analyst, earnings: detailResult.earnings, fundamentals: detailResult.fundamentals, related: detailResult.related };
    detailsMap = detailResult.detailsMap;
  } else {
    results.details = 'SKIP:not_daily_window';
    // Load existing details from DynamoDB for unified cache
    // pattern-db has composite key: pattern(HASH) + timestamp(RANGE)
    // Must use QueryCommand (not GetCommand) with Limit=1, ScanIndexForward=false for latest
    for (let bi = 0; bi < UNIVERSE_500.length; bi += 10) {
      const batch2 = UNIVERSE_500.slice(bi, bi+10);
      await Promise.all(batch2.map(async (ticker) => {
        try {
          const q = (prefix) => client.send(new QueryCommand({ TableName:'signum-pattern-db', KeyConditionExpression:'pattern=:p', ExpressionAttributeValues:{':p':prefix+ticker}, Limit:1, ScanIndexForward:false }));
          const [analystRes, earningsRes, fundRes, relRes] = await Promise.all([q('ANALYST:'), q('EARNINGS:'), q('FUND:'), q('RELATED:')]);
          detailsMap[ticker] = {};
          const a = analystRes.Items?.[0];
          if (a) {
            detailsMap[ticker].analyst = { ticker, consensus:a.consensus, totalAnalysts:a.totalAnalysts, bullishPct:a.bullishPct, breakdown:a.breakdown };
          }
          const e = earningsRes.Items?.[0];
          if (e) {
            const today2 = new Date().toISOString().slice(0,10);
            const daysUntil = e.nextDate ? Math.ceil((new Date(e.nextDate).getTime()-new Date(today2).getTime())/86400000) : 0;
            detailsMap[ticker].earnings = { ticker, nextEarningsDate:e.nextDate, daysUntilEarnings:daysUntil, daysLabel:daysUntil<=0?'today':'D-'+daysUntil, hasData:true, epsEstimate:e.epsEstimate, quarter:e.quarter, year:e.year };
          }
          const f = fundRes.Items?.[0];
          if (f) {
            detailsMap[ticker].fundamentals = { ticker, name:f.name||ticker, marketCap:f.marketCap, sector:f.sector, description:f.description?.slice(0,500)||null, exchange:f.exchange||null, score:f.score??null, grade:f.grade||null, pe:f.pe??null, de:f.de??null, roe:f.roe??null, revenueGrowth:f.revenueGrowth??null, netMargin:f.netMargin??null, fcfYield:f.fcfYield??null, pb:f.pb??null, ps:f.ps??null, breakdown:f.breakdown||null };
            detailsMap[ticker].overview = { name:f.name||ticker, sector:f.sector, sectorEN:f.sector, description:f.description?.slice(0,300), descriptionEN:f.description?.slice(0,300), marketCap:f.marketCap, exchange:f.exchange };
          }
          const rel = relRes.Items?.[0];
          if (rel?.tickers) {
            const tks = rel.tickers;
            detailsMap[ticker].related = { ticker, count:tks.length, topRelated:tks.slice(0,4).map(t=>({ticker:t,price:0,change:0,logo:null})), relatedTickers:tks, allTickers:tks };
          }
        } catch {}
      }));
    }
  }
  
  // [v8] Step 5.5: RSI + Daily Bars (sparkline, return3d, relVol)
  let rsiMap = {}, dailyBarsMap = {};
  if (isRegular || forceRun) {
    const rsiResult = await harvestRsiAndDailyBars(UNIVERSE_500);
    rsiMap = rsiResult.rsiMap;
    dailyBarsMap = rsiResult.dailyBarsMap;
  }
  
  // [v7] Step 6: Build Unified Cache — ALWAYS run (regular + extended)
  if (isRegular || forceRun) {
    results.unified = await buildUnifiedCache(priceMap, gexMap, optionsCache, smaMap, detailsMap, snapshotMap, rsiMap, dailyBarsMap);
  } else {
    // Extended hours: still build unified cache with whatever data we have
    results.unified = await buildUnifiedCache(priceMap, {}, {}, smaMap, detailsMap, snapshotMap, rsiMap, dailyBarsMap);
  }
  
  const duration = Math.round((Date.now()-start)/1000);
  console.log('Done in '+duration+'s');
  return { statusCode:200, body:JSON.stringify({ success:true, version:'7.0', timestamp:new Date().toISOString(), duration, results }) };
};
