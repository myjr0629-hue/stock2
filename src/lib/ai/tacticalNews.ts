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

/**
 * ★2026-10-31 대표 «Tactical 이 UC 보다 빈약 — 지표만 늘어놓고 시장의 현 상태를 스토리로 풀지 못한다»
 *   원인 ①: 위 거시 필터는 «연준·금리·관세» 같은 낱말이 있어야 통과해서, 그날 시장을 설명하는 장 마감 기사
 *   («Tech Selloff Wipes Out $1 Trillion In Value» · «S&P 500, Nasdaq End Third Straight Week Lower …» · «Stocks Edge Lower …»)가
 *   전부 빠지고 무관한 ETF 기사 하나만 남았다(10/30 장후 코어 뉴스 12건 중 1건 통과 → «재료 확인 안 됨»).
 *   Tactical 원인 재료에만 «시장 전체 움직임» 기사(지수·증시·기술주 주어 + 움직임 낱말)와 섹터 단위 기사를 더한다.
 *   개별 회사 기사(«Why Merck Stock Flew Higher» · «Okta Stock Can Find More Buyers as It Joins the S&P 500»)는 계속 뺀다.
 *   순환매(rotationPrompt)는 이 함수를 쓰지 않는다 — 기존 필터 그대로.
 */
const WRAP_SUBJECT = /\b(?:stocks|stock market|equities|equity (?:markets?|indexes|indices|futures)|Wall Street|S&P 500|S&P|Nasdaq(?: Composite| 100)?|Dow(?: Jones)?|Russell 2000|tech(?:nology)? (?:stocks|shares|sector|names)|tech|chip ?stocks|chipmakers|semiconductors|AI (?:stocks|trade|names|selloff|sell-off)|megacaps?|mega-cap|Magnificent Seven|Magnificent-7|growth stocks)\b/i;
const WRAP_MOVE = /\b(?:sell-?offs?|selloffs?|rout|slump\w*|tumbl\w*|plung\w*|sank|sink\w*|slid|slide|slides|sliding|fall|falls|fell|falling|drops?|dropped|dropping|lower|declin\w*|loss|losses|losing|rall(?:y|ies|ied|ying)|surg\w*|jump\w*|gain\w*|higher|rebound\w*|soar\w*|retreat\w*|wipes? out|erase[sd]?|worst (?:day|week|month)|best (?:day|week|month)|record (?:high|low)s?)\b/i;
/** «Why Merck Stock …» · «Okta Stock Can …» · «Arm Holdings shares fell …» — 대문자 회사 이름이 «Stock/Shares» 를 앞에서 꾸미는 개별 기사 */
const COMPANY_LED = /^(?:Why\s+|How\s+)?(?:[A-Z][\w&.'-]*\s+){1,4}(?:stock|shares)\b/i;
const MARKET_LEAD = /^(?:Why\s+|How\s+)?(?:US|U\.S\.|American|Global|Tech|Technology|Chip|AI|Wall)\b/i;
/** 회사 이름이 «Stock/Shares» 를 앞에서 이끄는 개별 기사인가(«Reddit shares plunged …» · «Why Merck Stock …») */
export function isCompanyLedTitle(title: string): boolean {
    const lead = title.match(COMPANY_LED);
    return !!lead && !MARKET_LEAD.test(lead[0]);
}
const SECTOR_WIDE_TITLE = /\b(?:sectors?|rotation|defensives?|cyclicals?|utilities|semiconductors?|chip ?stocks|chipmakers|tech (?:stocks|selling|shares|sector)|technology (?:stocks|shares|sector)|AI (?:stocks|trade|buildout|investment|spending|bubble|infrastructure)|cybersecurity|energy (?:stocks|shares)|bank (?:stocks|shares)|financials|small[- ]caps?|growth stocks|value stocks|mega-?caps?|Magnificent Seven)\b/i;
export function isTacticalCauseHeadline(line: string): boolean {
    if (isMarketWideHeadline(line)) return true;
    const title = line.replace(/^\[[^\]]*\]\s*/, '').split(' — ')[0];
    const wrap = WRAP_SUBJECT.test(title) && WRAP_MOVE.test(title);
    if (!wrap && !SECTOR_WIDE_TITLE.test(title)) return false;
    // 회사 이름이 문장을 이끄는 기사는 지수 이름이 있어도 개별 기사다(«Okta Stock … Joins the S&P 500»)
    return !isCompanyLedTitle(title);
}
export const filterTacticalCauseHeadlines = (lines: readonly string[]): string[] => lines.filter(isTacticalCauseHeadline);
