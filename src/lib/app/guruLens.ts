// ============================================================================
// 대가 렌즈 — 화면용 순수 함수·문구 (종목 화면 칩 · 렌즈 랭킹 화면이 같이 쓴다)
//
// ★ 숫자·부등호는 전부 API(규칙 판정 Check)에서 온다. 여기서는 «단위 표기»와 «단어»만 바꾼다.
// ★ 결측은 «0»이 아니다 — 집계 분모를 모르면 쓰지 않고, 통과 0 이면 «0종목» 대신 «가장 가까운 종목».
// ★ 문구는 «규칙 충족»만 — 추천·매수·목표가 표현 금지. 대가 이름 옆엔 «공개 기준을 우리가 해석».
// ============================================================================
import { LENS_IDS, type Check, type Evaluation, type LensDefinition, type LensId } from '../guruLens/types';
import { FREE_ROWS, type LockedLensRow } from '../guruLens/access';
export { FREE_ROWS } from '../guruLens/access';
export const isLockedLensRow = (row: LensRow | LockedLensRow): row is LockedLensRow => 'locked' in row;
export const isVisibleLensRow = (row: LensRow | LockedLensRow): row is LensRow => !isLockedLensRow(row);

export type Loc = 'ko' | 'en' | 'ja';
export const toLoc = (l: string | undefined): Loc => (l === 'ko' || l === 'ja' ? l : 'en');

export type HoldingBadge = {
    state: 'held' | 'not_held' | 'unknown' | 'not_applicable' | string;
    period: string | null;
};
export type MoneyBadge = { count: number; overlap: boolean; asOf: string | null };
export type EarningsBadge = {
    date: string | null;
    days: number | null;
    impliedMove: { impliedMovePct?: number | null } | null;
};
export type LensRow = Evaluation & {
    name?: string | null;
    badges: { own13f: HoldingBadge | null; money: MoneyBadge | null; earnings: EarningsBadge | null } | null;
};
export type LensList = {
    definition: LensDefinition;
    passCount: number;
    evaluatedCount: number;
    determinedCount: number | null;
    mode: 'passed' | 'closest';
    rows: (LensRow | LockedLensRow)[];
};
export type LensBody = {
    available: true;
    asOf: string;
    financialYear: number;
    universeCount: number;
    lenses: LensList[];
};
export type TickerLens = Omit<LensBody, 'lenses'> & {
    ticker: string; passedLenses: LensId[];
    lenses: (Omit<LensList, 'rows'> & { rows: (Omit<LensRow, 'score'> & { score?: number | null })[] })[];
};

const isLens = (x: unknown): x is LensId => typeof x === 'string' && (LENS_IDS as readonly string[]).includes(x);

/** 목록 응답 검증 — 하나라도 어긋나면 null(화면은 그 칸을 그리지 않는다). */
export function lensBody(body: unknown): LensBody | null {
    const b = body as LensBody | null;
    if (!b || b.available !== true || typeof b.asOf !== 'string' || !b.asOf ||
        !Number.isInteger(b.financialYear) || !Number.isInteger(b.universeCount) || b.universeCount <= 0 ||
        !Array.isArray(b.lenses)) return null;
    for (const l of b.lenses) {
        if (!isLens(l?.definition?.id) || !Array.isArray(l.rows) || !Number.isInteger(l.passCount) ||
            l.passCount < 0 || (l.mode !== 'passed' && l.mode !== 'closest')) return null;
        for (const [index, r] of l.rows.entries()) {
            if (!r || typeof r !== 'object') return null;
            if (isLockedLensRow(r)) {
                if (r.locked !== true || index < FREE_ROWS || r.rank !== index + 1 ||
                    Object.keys(r).some(k => k !== 'rank' && k !== 'locked')) return null;
            } else if (typeof r.ticker !== 'string' || typeof r.passed !== 'boolean' || !Array.isArray(r.checks)) return null;
        }
        // 통과 목록에 미통과 행이 섞이면(또는 그 반대) 응답 전체를 믿지 않는다.
        if (l.mode === 'passed' && (l.passCount === 0 || l.rows.filter(isVisibleLensRow).some(r => !r.passed))) return null;
        if (l.mode === 'closest' && (l.passCount !== 0 || l.rows.filter(isVisibleLensRow).some(r => r.passed))) return null;
    }
    return b;
}

/** 종목 역조회 응답 — 칩 숫자는 «응답 안에서 실제로 통과한 행»과 passedLenses 가 일치할 때만 믿는다. */
export function tickerLens(body: unknown, ticker: string): TickerLens | null {
    const b = body as TickerLens | null;
    if (!b || b.available !== true || b.ticker !== ticker || typeof b.asOf !== 'string' || !b.asOf ||
        !Array.isArray(b.passedLenses) || !Array.isArray(b.lenses) || !b.passedLenses.every(isLens)) return null;
    for (const id of LENS_IDS) {
        const row = b.lenses.find(l => l?.definition?.id === id)?.rows?.find(r => r?.ticker === ticker);
        if (!row || typeof row.passed !== 'boolean' || !Array.isArray(row.checks) ||
            row.passed !== b.passedLenses.includes(id)) return null;
    }
    return b;
}

/** 칩은 «통과 1개 이상»일 때만 — 0·결측이면 칩 자체를 그리지 않는다. */
export function chipCount(t: TickerLens | null): number | null {
    return t && t.passedLenses.length > 0 ? t.passedLenses.length : null;
}

/** «집계 n/495» — 분모를 아는 경우에만. 모르면 null(문구 생략). */
export function coverageText(l: Pick<LensList, 'determinedCount'>, universe: number, loc: Loc): string | null {
    const n = l.determinedCount;
    if (n === null || n === undefined || !Number.isInteger(n) || n < 0 || n > universe) return null;
    return T[loc].coverage(n, universe);
}

/** 렌즈 카드 머리 한 줄 — 통과 0 은 숫자를 쓰지 않는다(«0종목» 금지 · 결측과 구별 불가). */
export function headline(l: Pick<LensList, 'passCount' | 'mode'>, loc: Loc): string {
    return l.mode === 'passed' && l.passCount > 0 ? T[loc].passed(l.passCount) : T[loc].closest;
}

// ── «왜 걸렸나» — 렌즈마다 핵심 Check 2개(값·기준 모두 API 값) ──────────────────
const WHY: Record<LensId, string[]> = {
    moat_compounder: ['ROE 평균', 'ROE 기준 충족 연수'],
    wonderful_fair: ['ROE 기준 충족 연수', 'PER'],
    defensive_value: ['3년 평균 PER', '배당 지급 연수'],
    garp: ['순이익 성장률', 'PEG'],
    quality_growth: ['매출 5년 CAGR', '영업이익률'],
    max_pessimism: ['5년 평균 PER', '52주 고점 대비'],
    roc_ey: ['ROC', 'EBIT/EV'],
    financial_strength: ['PBR'],
    low_psr_momentum: ['PSR', 'EPS 변화'],
    quality_multifactor: ['섹터 품질 백분위', '12-1개월 모멘텀'],
};
/** 비율(0.15 = 15%)로 저장되는 Check — 값과 기준의 소수를 함께 % 로 바꾼다. */
const RATIO = new Set(['ROE 평균', 'ROC', '순이익 성장률', '매출 5년 CAGR', '영업이익률', '52주 고점 대비', 'EBIT/EV',
    '섹터 품질 백분위', '12-1개월 모멘텀']);
const LABEL: Record<Loc, Record<string, string>> = {
    ko: {},
    en: {
        'ROE 평균': 'Avg ROE', 'ROE 기준 충족 연수': 'Years meeting ROE bar', 'PER': 'P/E', '3년 평균 PER': '3-yr avg P/E',
        '배당 지급 연수': 'Years of dividends', '순이익 성장률': 'Net income growth', 'PEG': 'PEG',
        '매출 5년 CAGR': 'Revenue 5-yr CAGR', '영업이익률': 'Operating margin', '5년 평균 PER': '5-yr avg P/E',
        '52주 고점 대비': 'From 52-wk high', 'ROC': 'ROC', 'EBIT/EV': 'EBIT/EV', 'PBR': 'P/B', 'PSR': 'P/S',
        'EPS 변화': 'EPS change', '섹터 품질 백분위': 'Sector quality pctile', '12-1개월 모멘텀': '12-1 mo momentum',
        'F점수': 'F-score',
    },
    ja: {
        'ROE 평균': '平均ROE', 'ROE 기준 충족 연수': 'ROE基準を満たした年数', 'PER': 'PER', '3년 평균 PER': '3年平均PER',
        '배당 지급 연수': '配当支払年数', '순이익 성장률': '純利益成長率', 'PEG': 'PEG',
        '매출 5년 CAGR': '売上5年CAGR', '영업이익률': '営業利益率', '5년 평균 PER': '5年平均PER',
        '52주 고점 대비': '52週高値比', 'ROC': 'ROC', 'EBIT/EV': 'EBIT/EV', 'PBR': 'PBR', 'PSR': 'PSR',
        'EPS 변화': 'EPS変化', '섹터 품질 백분위': 'セクター内品質百分位', '12-1개월 모멘텀': '12-1か月モメンタム',
        'F점수': 'Fスコア',
    },
};
/** 기준 문자열 속 «단어»만 바꾼다(숫자·부등호는 그대로). 긴 말부터. */
const RULE_WORDS: Record<Loc, Array<[string, string]>> = {
    ko: [],
    en: [['2개 이상 관측', '≥2 observed'], ['·3년 전 이상', ' · ≥ 3 yrs ago'], ['축약', 'abridged'],
        [' 또는 ', ' or '], ['성장', 'growth'], ['배당', 'div'], ['하위', 'bottom '], ['0<PER', '0<P/E'], ['/PER', ' ÷ P/E']],
    ja: [['2개 이상 관측', '2項目以上観測'], ['·3년 전 이상', '・3年前以上'], ['축약', '短縮'],
        [' 또는 ', ' または '], ['성장', '成長'], ['배당', '配当'], ['하위', '下位']],
};
const pct = (v: number) => `${Number((v * 100).toFixed(1))}%`;
const plain = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Number(v.toFixed(2)).toString());
/** 비율 Check 의 기준 속 소수(절댓값 ≤ 1.5, 소수점 포함)만 % 로. «≥8/10 (15%)» 같은 정수·% 는 건드리지 않는다.
 * 기준 속 괄호 주석은 «, 주석»으로 펴서 바깥 괄호와 겹치지 않게 한다(«≥8/10 (15%)» → «≥8/10, 15%»). */
export function ruleText(c: Pick<Check, 'id' | 'rule'>, loc: Loc): string {
    let r = c.rule;
    if (RATIO.has(c.id)) r = r.replace(/-?\d+\.\d+/g, m => (Math.abs(Number(m)) <= 1.5 ? pct(Number(m)) : m));
    r = r.replace(/\s*\(([^()]*)\)$/, ', $1');
    for (const [from, to] of RULE_WORDS[loc]) r = r.split(from).join(to);
    return r;
}
export function valueText(c: Pick<Check, 'id' | 'value'>): string | null {
    const v = c.value;
    if (v === null || typeof v !== 'number' || !Number.isFinite(v)) return null;
    return RATIO.has(c.id) ? pct(v) : plain(v);
}
/** «왜 걸렸나» 한 줄 — 값이 없는 Check 는 빼고, 하나도 없으면 null(줄을 안 그린다). */
export function whyLine(id: LensId, row: Pick<Evaluation, 'checks' | 'reason' | 'passed' | 'inputsComplete'>, loc: Loc): string | null {
    // 미통과인데 원입력이 다 있지 않은 행의 수치는 결측에서 만든 집계일 수 있다(«배당 지급 연수 0»·«F점수 0/9»).
    // 결측 ≠ 0 — 그런 행은 수치를 한 글자도 쓰지 않는다.
    if (!row.passed && row.inputsComplete !== true) return null;
    const parts: string[] = [];
    if (id === 'financial_strength') {
        const f = row.reason.match(/^F점수 (\d\/9);/)?.[1];
        if (f) parts.push(`${LABEL[loc]['F점수'] ?? 'F점수'} ${f}`);
    }
    for (const key of WHY[id]) {
        const c = row.checks.find(x => x.id === key);
        const v = c ? valueText(c) : null;
        if (!c || v === null) continue;
        // 미충족 Check(«가장 가까운 종목» 행)는 ✕ 로 구별한다 — 충족처럼 읽히지 않게.
        parts.push(`${c.passed ? '' : '✕ '}${LABEL[loc][key] ?? key} ${v} (${ruleText(c, loc)})`);
    }
    return parts.length ? parts.join(' · ') : null;
}

// ── 배지 3종(값이 있는 것만) ─────────────────────────────────────────────────
export function badgeTexts(id: LensId, b: LensRow['badges'], loc: Loc): string[] {
    if (!b) return [];
    const t = T[loc], out: string[] = [];
    const h = b.own13f, fund = FUND[id]?.[loc];
    if (fund && h && h.period && (h.state === 'held' || h.state === 'not_held'))
        out.push(t.holding(fund, h.state === 'held', md(h.period)));
    const m = b.money;
    if (m && m.overlap && Number.isInteger(m.count) && m.count >= 2) out.push(t.money(m.count, m.asOf ? md(m.asOf) : null));
    const e = b.earnings;
    if (e && e.date && typeof e.days === 'number' && e.days >= 0 && e.days <= 35) {
        const mv = e.impliedMove?.impliedMovePct;
        out.push(t.earnings(e.days, typeof mv === 'number' && Number.isFinite(mv) && mv > 0 ? Number(mv.toFixed(1)) : null));
    }
    return out;
}
/** 2026-10-16 → 10/16 (날짜 문자열이 아니면 그대로) */
export const md = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : d);

export const lensesHref = (locale: string, lens?: LensId) =>
    `/${locale}/app-view/lenses${lens ? `?lens=${lens}` : ''}`;

/** 대가 이름(공개 기준의 출처) — 해석 주체는 SIGNUM 이다. */
export const GURU: Record<LensId, Record<Loc, string>> = {
    moat_compounder: { ko: '워런 버핏', en: 'Warren Buffett', ja: 'ウォーレン・バフェット' },
    wonderful_fair: { ko: '찰리 멍거', en: 'Charlie Munger', ja: 'チャーリー・マンガー' },
    defensive_value: { ko: '벤저민 그레이엄', en: 'Benjamin Graham', ja: 'ベンジャミン・グレアム' },
    garp: { ko: '피터 린치', en: 'Peter Lynch', ja: 'ピーター・リンチ' },
    quality_growth: { ko: '필립 피셔', en: 'Philip Fisher', ja: 'フィリップ・フィッシャー' },
    max_pessimism: { ko: '존 템플턴', en: 'John Templeton', ja: 'ジョン・テンプルトン' },
    roc_ey: { ko: '조엘 그린블라트', en: 'Joel Greenblatt', ja: 'ジョエル・グリーンブラット' },
    financial_strength: { ko: '조셉 피오트로스키', en: 'Joseph Piotroski', ja: 'ジョセフ・ピオトロスキー' },
    low_psr_momentum: { ko: '제임스 오쇼너시', en: "James O'Shaughnessy", ja: 'ジェームズ・オショーネシー' },
    quality_multifactor: { ko: '클리프 아스네스', en: 'Cliff Asness', ja: 'クリフ・アスネス' },
};
export const LENS_NAME: Record<LensId, Record<Loc, string>> = {
    moat_compounder: { ko: '해자 복리형', en: 'Moat compounder', ja: '堀のある複利型' },
    wonderful_fair: { ko: '위대한 기업·적정 가격형', en: 'Great business, fair price', ja: '優良企業・適正価格型' },
    defensive_value: { ko: '방어적 가치 7원칙', en: 'Defensive value, 7 rules', ja: '守りのバリュー7原則' },
    garp: { ko: '성장 대비 저평가(PEG)형', en: 'Growth at a reasonable price', ja: '成長対比割安(PEG)型' },
    quality_growth: { ko: '성장 품질형', en: 'Quality growth', ja: '成長品質型' },
    max_pessimism: { ko: '최대 비관 역발상형', en: 'Maximum pessimism', ja: '最大悲観・逆張り型' },
    roc_ey: { ko: '자본수익률·이익수익률형', en: 'Return on capital + earnings yield', ja: '資本収益率・益回り型' },
    financial_strength: { ko: '재무건전성 F점수형', en: 'Financial strength F-score', ja: '財務健全性Fスコア型' },
    low_psr_momentum: { ko: '저PSR 모멘텀형', en: 'Low P/S momentum', ja: '低PSRモメンタム型' },
    quality_multifactor: { ko: '퀄리티 멀티팩터형', en: 'Quality multifactor', ja: 'クオリティ複合ファクター型' },
};
/** 13F «말과 행동» — 백엔드 badges.ts fundCik 와 같은 5곳만(나머지 렌즈는 배지 없음). */
const FUND: Partial<Record<LensId, Record<Loc, string>>> = {
    moat_compounder: { ko: '버크셔', en: 'Berkshire', ja: 'バークシャー' },
    wonderful_fair: { ko: '데일리 저널', en: 'Daily Journal', ja: 'デイリー・ジャーナル' },
    roc_ey: { ko: '고담', en: 'Gotham', ja: 'ゴッサム' },
    low_psr_momentum: { ko: '오쇼너시 운용', en: "O'Shaughnessy AM", ja: 'オショーネシー運用' },
    quality_multifactor: { ko: 'AQR', en: 'AQR', ja: 'AQR' },
};

export const T = {
    ko: {
        chip: (n: number) => `통과 렌즈 ${n}`,
        chipAria: (n: number) => `대가 렌즈 ${n}개 규칙 충족 — 이유 보기`,
        title: '대가 렌즈',
        sub: 'S&P 500 · 주 1회 계산',
        basis: (asOf: string, fy: number) => `가격 ${asOf} · 재무 ${fy}년 기준`,
        interpreted: (g: string) => `${g} 공개 기준을 우리가 해석`,
        passed: (n: number) => `규칙 충족 ${n}종목`,
        closest: '가장 가까운 종목 · 규칙 미충족',
        coverage: (n: number, u: number) => `집계 ${n}/${u}`,
        why: '왜 걸렸나',
        more: '렌즈별 순위 보기',
        holding: (f: string, held: boolean, d: string) => `13F ${f} ${held ? '보유' : '미보유'} · ${d}`,
        money: (n: number, d: string | null) => `돈 신호 ${n}/4 겹침${d ? ` · ${d}` : ''}`,
        earnings: (days: number, mv: number | null) => `실적 D-${days}${mv !== null ? ` · ±${mv}%` : ''}`,
        lockTitle: '4~10위 · Pro',
        lockSub: 'Pro 에서 렌즈마다 10위까지 볼 수 있습니다',
        none: '아직 발행된 집계가 없습니다',
        loading: '불러오는 중',
        back: '뒤로',
    },
    en: {
        chip: (n: number) => `Lenses passed ${n}`,
        chipAria: (n: number) => `Meets ${n} investor-lens rule sets — see why`,
        title: 'Investor Lenses',
        sub: 'S&P 500 · recalculated weekly',
        basis: (asOf: string, fy: number) => `Prices ${asOf} · financials FY${fy}`,
        interpreted: (g: string) => `Our reading of ${g}'s public criteria`,
        passed: (n: number) => `${n} ${n === 1 ? 'stock meets' : 'stocks meet'} the rules`,
        closest: 'Closest stocks · rules not met',
        coverage: (n: number, u: number) => `${n}/${u} evaluated`,
        why: 'Why it matched',
        more: 'See rankings by lens',
        holding: (f: string, held: boolean, d: string) => `13F ${f} ${held ? 'holds' : 'does not hold'} · ${d}`,
        money: (n: number, d: string | null) => `${n}/4 money signals overlap${d ? ` · ${d}` : ''}`,
        earnings: (days: number, mv: number | null) => `Earnings D-${days}${mv !== null ? ` · ±${mv}%` : ''}`,
        lockTitle: 'Ranks 4–10 · Pro',
        lockSub: 'Pro shows the top 10 for every lens',
        none: 'No published calculation yet',
        loading: 'Loading',
        back: 'Back',
    },
    ja: {
        chip: (n: number) => `通過レンズ ${n}`,
        chipAria: (n: number) => `投資家レンズ ${n}個の基準を満たす — 理由を見る`,
        title: '投資家レンズ',
        sub: 'S&P 500 · 週1回計算',
        basis: (asOf: string, fy: number) => `株価 ${asOf} · 財務 ${fy}年度`,
        interpreted: (g: string) => `${g}の公開基準を当社が解釈`,
        passed: (n: number) => `基準を満たす ${n}銘柄`,
        closest: '最も近い銘柄 · 基準未達',
        coverage: (n: number, u: number) => `集計 ${n}/${u}`,
        why: '該当した理由',
        more: 'レンズ別ランキングを見る',
        holding: (f: string, held: boolean, d: string) => `13F ${f} ${held ? '保有' : '非保有'} · ${d}`,
        money: (n: number, d: string | null) => `資金シグナル ${n}/4 重複${d ? ` · ${d}` : ''}`,
        earnings: (days: number, mv: number | null) => `決算 D-${days}${mv !== null ? ` · ±${mv}%` : ''}`,
        lockTitle: '4〜10位 · Pro',
        lockSub: 'Pro ならレンズごとに10位まで表示',
        none: 'まだ公開された集計はありません',
        loading: '読み込み中',
        back: '戻る',
    },
} as const;
