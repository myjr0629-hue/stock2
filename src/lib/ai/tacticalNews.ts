/** 시장 전체 원인에 쓸 수 있는 제목만. 종목별 근거(cachedEvidence/stockNews)는 변경하지 않는다. */
export function isMarketWideHeadline(line: string): boolean {
    // 공급사 이름·ISO·설명 문구에서 거시 단어를 주워 개별 기사를 통과시키지 않는다.
    const title = line.replace(/^\[[^\]]*\]\s*/, '').split(' — ')[0];
    const macro = /\b(?:Fed|FOMC|Federal Reserve|Powell|Treasury|inflation|CPI|PPI|PCE|payrolls?|unemployment|jobless|tariffs?|geopolit\w*|war|OPEC|crude|oil|dollar|DXY|PMI|ISM|GDP)\b|interest rates?|bond yields?|jobs report|retail sales|연준|금리|물가|고용|관세|지정학|유가|달러|米連邦準備|金利|物価|雇用|関税|原油/i;
    const mega = /\b(?:AAPL|MSFT|NVDA|AMZN|GOOGL|GOOG|META|TSLA|Apple|Microsoft|Nvidia|Amazon|Alphabet|Google|Meta|Tesla)\b|Meta Platforms|애플|마이크로소프트|엔비디아|아마존|알파벳|테슬라|アップル|マイクロソフト|エヌビディア|アマゾン|テスラ/i;
    const sector = /(?:semiconductor|banking|banks|technology sector|energy sector|retail sector|반도체|은행업|기술주|에너지업종|半導体|銀行業).*(?:earnings|results|실적|決算)|(?:earnings|results|실적|決算).*(?:sector|industry|업종|業界)/i;
    // 개별 기업 주가·판매 기사에 금리/유가가 부수적으로 등장해도 시장 전체 원인으로 승격하지 않는다.
    const companyStory = /^[^:]{1,70}\b(?:shares?|stock|quarterly (?:sales|earnings)|car sales)\b|(?:주가|판매량|株価|販売台数)/i;
    if (!mega.test(title) && !sector.test(title) && companyStory.test(title)
        && !/stock market|stocks|equities|wall street|S&P|Nasdaq|증시|주식시장|株式市場/i.test(title)) return false;
    return macro.test(title) || mega.test(title) || sector.test(title);
}
export const filterMarketHeadlines = (lines: readonly string[]): string[] => lines.filter(isMarketWideHeadline);
