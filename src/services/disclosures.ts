// Server-side service - do not use "use client"
// [8-K DISCLOSURES] Massive/Polygon 8-K disclosure events (open beta, daily refresh).
// Powers: Command badge, Intel key-stock strip, deep-analysis AI context,
// morning-brief "밤사이 주요 공시" line. Non-critical path: every consumer must
// degrade to "no section shown" when this returns empty (beta schema may change).

import { fetchMassive } from "@/services/massiveClient";
import { getFromCache, setInCache } from "@/services/redisClient";
import { SECTOR_MAP } from "@/services/universePolicy";
import { invokeJSON } from "@/app/api/undercurrent/shared";

export type DiscLocale = 'ko' | 'en' | 'ja';

export interface DisclosureEvent {
    date: string;               // filing_date YYYY-MM-DD
    accession: string;
    url: string;                // SEC filing url
    primary: string;            // primary_category
    tertiary: string;           // tertiary_category
    highImpact: boolean;
    label: Record<DiscLocale, string>;    // category label
    summary: Record<DiscLocale, string>;  // one-line AI summary of supporting_text
}

export interface TickerDisclosures {
    ticker: string;
    events: DisclosureEvent[];
    skipped?: 'etf';
}

// ETFs/indices never file 8-Ks — skip the vendor call entirely.
const ETF_SET = new Set<string>([
    ...Object.keys(SECTOR_MAP),
    'SPY', 'QQQ', 'DIA', 'IWM', 'TLT', 'GLD', 'SLV', 'USO', 'UNG', 'VXX',
    'SOXX', 'SMH', 'ARKK', 'EEM', 'EFA', 'HYG', 'LQD', 'XBI', 'KRE', 'GDX',
]);
export function isEtfTicker(t: string): boolean {
    return ETF_SET.has(t.toUpperCase()) || t.startsWith('^') || t.includes('=');
}

// Static labels for the primary categories (controlled vocabulary, taxonomy 1.0)
const PRIMARY_LABELS: Record<string, Record<DiscLocale, string>> = {
    leadership_and_governance: { ko: '리더십·지배구조', en: 'Leadership & Governance', ja: 'リーダーシップ・ガバナンス' },
    capital_and_financing: { ko: '자본·자금조달', en: 'Capital & Financing', ja: '資本・資金調達' },
    strategic_transactions: { ko: 'M&A·전략거래', en: 'Strategic Transactions', ja: 'M&A・戦略取引' },
    shareholder_activity: { ko: '주주활동', en: 'Shareholder Activity', ja: '株主活動' },
    regulatory_and_compliance: { ko: '규제·컴플라이언스', en: 'Regulatory & Compliance', ja: '規制・コンプライアンス' },
    operations_and_strategy: { ko: '사업·전략', en: 'Operations & Strategy', ja: '事業・戦略' },
    financial_performance: { ko: '실적·재무', en: 'Financial Performance', ja: '業績・財務' },
    financial_distress: { ko: '재무위험', en: 'Financial Distress', ja: '財務リスク' },
    securities_and_markets: { ko: '증권·상장', en: 'Securities & Markets', ja: '証券・上場' },
    legal_proceedings: { ko: '소송·법률', en: 'Legal Proceedings', ja: '訴訟・法務' },

    // ⚠️ [2026-09-04] SEC 8-K Item 코드로 복원할 때 생긴 분류가 **여기 없었다.**
    //   그래서 labelFor 가 prettify() 로 흘러가 세 언어 모두 영어를 만들어 냈다
    //   (한국어 화면에 «Results Of Operations» · «Governance»). 생산자와 소비자의
    //   이름이 어긋나면 에러 없이 영어가 나간다 — 조용히 틀리는 전형이다.
    results_of_operations: { ko: '실적 발표', en: 'Results of Operations', ja: '業績発表' },
    governance: { ko: '지배구조·임원', en: 'Governance', ja: 'ガバナンス・役員' },
    financial_obligations: { ko: '차입·채무', en: 'Financial Obligations', ja: '借入・債務' },
    capital_structure: { ko: '자본구조', en: 'Capital Structure', ja: '資本構成' },
    other_events: { ko: '기타 공시', en: 'Other Events', ja: 'その他開示' },
};

/** 세부 코드 — 한 줄 설명에 쓴다. 없으면 상위 분류만 쓴다. */
const TERTIARY_LABELS: Record<string, Record<DiscLocale, string>> = {
    earnings: { ko: '분기 실적과 재무상태를 발표했습니다.', en: 'Announced quarterly results and financial condition.', ja: '四半期業績と財務状況を発表しました。' },
    ceo_cfo_change: { ko: '이사·경영진의 선임 또는 사임이 있었습니다.', en: 'Directors or officers were appointed or departed.', ja: '取締役・役員の選任または退任がありました。' },
    bylaws: { ko: '정관 또는 내규를 변경했습니다.', en: 'Amended articles of incorporation or bylaws.', ja: '定款または内規を変更しました。' },
    shareholder_vote: { ko: '주주총회 안건 표결 결과를 제출했습니다.', en: 'Submitted matters to a shareholder vote.', ja: '株主総会の議案採決結果を提出しました。' },
    material_agreement: { ko: '중요한 계약을 체결했습니다.', en: 'Entered into a material definitive agreement.', ja: '重要な契約を締結しました。' },
    agreement_termination: { ko: '중요한 계약이 종료됐습니다.', en: 'Terminated a material definitive agreement.', ja: '重要な契約が終了しました。' },
    acquisition: { ko: '자산의 인수 또는 처분을 완료했습니다.', en: 'Completed an acquisition or disposition of assets.', ja: '資産の取得または処分を完了しました。' },
    debt_issuance: { ko: '직접적인 금융 채무가 발생했습니다.', en: 'Created a direct financial obligation.', ja: '直接的な金融債務が発生しました。' },
    equity_issuance: { ko: '미등록 주식을 발행했습니다.', en: 'Made unregistered sales of equity securities.', ja: '未登録株式を発行しました。' },
    rights_modification: { ko: '주주 권리를 중대하게 변경했습니다.', en: 'Materially modified security holder rights.', ja: '株主の権利を重大に変更しました。' },
    auditor_change: { ko: '감사인을 변경했습니다.', en: "Changed the registrant's certifying accountant.", ja: '監査人を変更しました。' },
    restatement: { ko: '기존 재무제표를 신뢰할 수 없다고 밝혔습니다.', en: 'Announced non-reliance on previously issued financials.', ja: '過去の財務諸表が信頼できないと表明しました。' },
    restructuring: { ko: '사업 철수·구조조정 비용이 발생했습니다.', en: 'Incurred exit or disposal costs.', ja: '事業撤退・リストラ費用が発生しました。' },
    impairment: { ko: '중대한 자산 손상을 인식했습니다.', en: 'Recognized material impairments.', ja: '重大な資産減損を認識しました。' },
    delisting: { ko: '상장 규정 미충족 또는 상장폐지 통지를 받았습니다.', en: 'Received a delisting or listing-rule notice.', ja: '上場規則の不充足または上場廃止の通知を受けました。' },
    bankruptcy: { ko: '파산 또는 법정관리 절차에 들어갔습니다.', en: 'Entered bankruptcy or receivership.', ja: '破産または法定管理手続きに入りました。' },
    control_change: { ko: '지배권이 변경됐습니다.', en: 'Reported a change in control.', ja: '支配権が変更されました。' },
    acceleration: { ko: '채무 조기상환 사유가 발생했습니다.', en: 'Triggered acceleration of a financial obligation.', ja: '債務の期限前弁済事由が発生しました。' },
    reg_fd: { ko: '공정공시 규정에 따라 자료를 공개했습니다.', en: 'Disclosed information under Regulation FD.', ja: '公正開示規則に基づき資料を公開しました。' },
    exhibits: { ko: '재무제표와 첨부서류를 제출했습니다.', en: 'Filed financial statements and exhibits.', ja: '財務諸表と添付書類を提出しました。' },
};

/** SEC 원문에 섞여 오는 HTML 엔티티를 사람이 읽는 글자로 되돌린다. */
function decodeEntities(s: string): string {
    return String(s || '')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ').trim();
}

function prettify(cat: string): string {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function labelFor(primary: string): Record<DiscLocale, string> {
    return PRIMARY_LABELS[primary] || { ko: prettify(primary), en: prettify(primary), ja: prettify(primary) };
}

// 2026-08-30: Polygon 분류가 사라져 SEC 8-K Item 코드로 복원했다.
//   그때 생긴 새 분류(governance)와 tertiary(auditor_change·restatement 등)를 반영한다.
const HIGH_IMPACT_PRIMARY = new Set(['strategic_transactions', 'financial_distress']);
const HIGH_IMPACT_TERTIARY_RE = /ceo_|cfo_|bankruptcy|merger|acquisition|delisting|going_private|restructuring|impairment|restatement|auditor_change|control_change|acceleration|material_agreement/;

function isHighImpact(primary: string, secondary: string, tertiary: string): boolean {
    if (HIGH_IMPACT_PRIMARY.has(primary)) return true;
    if (primary === 'leadership_and_governance' && secondary === 'executive_leadership') return true;
    return HIGH_IMPACT_TERTIARY_RE.test(tertiary || '');
}

function daysAgoISO(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

// One Haiku call per ticker fetch (result cached 12h alongside the events).
// Returns per-event one-line summaries in all three locales; on failure the
// caller falls back to the trimmed English excerpt.
async function summarize(
    events: { i: number; category: string; text: string }[],
    ticker?: string,
): Promise<Record<number, Record<DiscLocale, string>> | null> {
    if (events.length === 0) return {};
    try {
        /**
         * ⚠️ 실측 오역 2건(MU 8-K, 2026-08-31):
         *   · "Micron" → 「미크론」   (관용 표기는 「마이크론」)
         *   · "President" → 「대통령」 (기업 직책이므로 「사장」)
         * 회사명·직책은 자유 번역 대상이 아니다. 규칙을 명시한다.
         */
        const sys = [
            'You summarize SEC 8-K disclosure excerpts for a premium market-intelligence app.',
            'For each event write ONE short factual sentence (max 90 chars) in Korean, English and Japanese.',
            'No opinions, no advice, keep numbers exact.',
            '',
            'NAMES AND TITLES — these are not free translation:',
            '- Company names: use the conventional rendering financial media already use in that language',
            '  (Micron → 마이크론 / マイクロン, Nvidia → 엔비디아 / エヌビディア, Broadcom → 브로드컴 / ブロードコム).',
            '  Never invent a phonetic spelling. If unsure, keep the English name as-is.',
            '- Corporate titles are BUSINESS roles, never political or scientific:',
            '  President → 사장 / 社長  (NEVER 대통령 or 大統領)',
            '  Chief Executive Officer → 최고경영자(CEO) / 最高経営責任者(CEO)',
            '  Chairman → 회장 / 会長 ,  Director → 이사 / 取締役 ,  Officer → 임원 / 執行役員',
            '- Person names: standard transliteration; keep the English spelling if it is not established.',
            '',
            'Return ONLY JSON: {"events":[{"i":0,"ko":"...","en":"...","ja":"..."}]}',
        ].join('\n');
        // 티커를 함께 준다 — 어느 회사인지 알아야 이름을 관용 표기로 쓴다
        const user = JSON.stringify(ticker ? { ticker, events } : { events });
        const out = await invokeJSON(sys, user);
        const map: Record<number, Record<DiscLocale, string>> = {};
        for (const e of (out?.events || [])) {
            if (typeof e?.i === 'number' && e.ko && e.en && e.ja) {
                map[e.i] = { ko: String(e.ko), en: String(e.en), ja: String(e.ja) };
            }
        }
        return map;
    } catch {
        return null;
    }
}

// ── Per-ticker disclosures (Command / Intel / deep-analysis) ──
export async function getTickerDisclosures(ticker: string, days: number = 90): Promise<TickerDisclosures> {
    const T = ticker.toUpperCase();
    if (isEtfTicker(T)) return { ticker: T, events: [], skipped: 'etf' };

    // ⚠️ 요약 «문구»가 바뀌면 버전을 올린다. 안 올리면 캐시에 남은 옛 오역
    //    (「미크론」·「대통령으로 임명」)이 계속 나간다.
    //    v2 = 회사명·직책 번역 규칙 추가 2026-08-31
    // v3 = 라벨·요약 현지화 수정 (2026-09-04) — 옛 페이로드엔 영어가 굳어 있다
    const cacheKey = `disclosures:v3:${T}`;
    try {
        const cached = await getFromCache<TickerDisclosures>(cacheKey);
        if (cached && Array.isArray(cached.events)) return cached;
    } catch { /* fall through */ }

    let result: TickerDisclosures = { ticker: T, events: [] };
    try {
        const res = await fetchMassive('/stocks/filings/8-K/vX/disclosures', {
            tickers: T,
            'filing_date.gte': daysAgoISO(days),
            sort: 'filing_date.desc',
            limit: '10',
        });
        const rows = (res?.results || []).filter((r: any) => r?.filing_date && r?.primary_category);

        // Cap at 2 rows per accession (one filing can yield many rows), 5 total
        const perAccession: Record<string, number> = {};
        const picked: any[] = [];
        for (const r of rows) {
            const acc = r.accession_number || r.filing_date;
            perAccession[acc] = (perAccession[acc] || 0) + 1;
            if (perAccession[acc] <= 2) picked.push(r);
            if (picked.length >= 5) break;
        }

        const aiInput = picked.map((r: any, i: number) => ({
            i,
            category: `${r.primary_category}/${r.tertiary_category || ''}`,
            text: String(r.supporting_text || '').slice(0, 400),
        }));
        const summaries = await summarize(aiInput, T);

        result = {
            ticker: T,
            events: picked.map((r: any, i: number) => {
                // ⚠️ [2026-09-04] 예전엔 AI 요약이 실패하면 **SEC 원문 영어**를 세 언어에
                //   똑같이 넣었다. 한국어 화면에 「Item 2.02 Results of Operations and
                //   Financial Condition. On August 6, 2026, Twilio Inc. (the &#8220;...」
                //   이 그대로 떴다(HTML 엔티티까지). 번역이 없으면 «영어를 흘리는» 대신
                //   **분류에서 만든 정확한 한 줄**을 쓴다 — 짧지만 그 언어로 맞는 말이다.
                const rawEn = decodeEntities(String(r.supporting_text || '')).slice(0, 160);
                const tl = TERTIARY_LABELS[r.tertiary_category || ''];
                const pl = labelFor(r.primary_category);
                const fb: Record<DiscLocale, string> = tl
                    ? { ko: tl.ko, en: tl.en, ja: tl.ja }
                    : { ko: `${pl.ko} 관련 공시입니다.`, en: rawEn || pl.en, ja: `${pl.ja}に関する開示です。` };
                const ai = summaries?.[i];
                const okAi = (v: any, loc: DiscLocale) => typeof v?.[loc] === 'string' && v[loc].trim().length > 0
                    // 영어 원문이 ko/ja 자리에 그대로 들어온 경우를 거른다
                    && !(loc !== 'en' && v[loc] === v.en);
                const s: Record<DiscLocale, string> = {
                    ko: okAi(ai, 'ko') ? decodeEntities(ai!.ko) : fb.ko,
                    en: okAi(ai, 'en') ? decodeEntities(ai!.en) : (rawEn || fb.en),
                    ja: okAi(ai, 'ja') ? decodeEntities(ai!.ja) : fb.ja,
                };
                return {
                    date: r.filing_date,
                    accession: r.accession_number || '',
                    url: r.filing_url || '',
                    primary: r.primary_category,
                    tertiary: r.tertiary_category || '',
                    highImpact: isHighImpact(r.primary_category, r.secondary_category || '', r.tertiary_category || ''),
                    label: labelFor(r.primary_category),
                    summary: s,
                };
            }),
        };
    } catch (e: any) {
        console.warn(`[Disclosures] fetch failed for ${T}: ${e?.message}`);
        return { ticker: T, events: [] }; // NOT cached — retry next request
    }

    try { await setInCache(cacheKey, result, 12 * 60 * 60); } catch { /* non-critical */ }
    return result;
}

// ── Market-wide overnight disclosures (morning brief) ──
// High-impact events from our coverage universe over the last N days.
export async function getOvernightHighlights(days: number = 3): Promise<{ ticker: string; date: string; primary: string; tertiary: string; text: string }[]> {
    const cacheKey = 'disclosures:market:v1';
    try {
        const cached = await getFromCache<any[]>(cacheKey);
        if (Array.isArray(cached)) return cached;
    } catch { /* fall through */ }

    let highlights: { ticker: string; date: string; primary: string; tertiary: string; text: string }[] = [];
    try {
        const universe = new Set(Object.values(SECTOR_MAP).flatMap(s => s.tickers));
        const res = await fetchMassive('/stocks/filings/8-K/vX/disclosures', {
            'filing_date.gte': daysAgoISO(days),
            sort: 'filing_date.desc',
            limit: '1000',
        });
        const rows = (res?.results || []).filter((r: any) =>
            (r?.tickers || []).some((t: string) => universe.has(t)) &&
            isHighImpact(r.primary_category, r.secondary_category || '', r.tertiary_category || '')
        );
        const seen = new Set<string>();
        for (const r of rows) {
            const t = (r.tickers || []).find((x: string) => universe.has(x));
            if (!t || seen.has(t)) continue;
            seen.add(t);
            highlights.push({
                ticker: t,
                date: r.filing_date,
                primary: r.primary_category,
                tertiary: r.tertiary_category || '',
                text: String(r.supporting_text || '').slice(0, 200),
            });
            if (highlights.length >= 2) break;
        }
    } catch (e: any) {
        console.warn(`[Disclosures] overnight fetch failed: ${e?.message}`);
        return [];
    }

    try { await setInCache(cacheKey, highlights, 3 * 60 * 60); } catch { /* non-critical */ }
    return highlights;
}
