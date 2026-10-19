import { Company, Check, Evaluation, LensDefinition, LensId, LensResult, LENS_IDS, Field } from './types';

const definitions: Array<[LensId, string, 'value' | 'factor', string, string | null, string, string]> = [
    [
        'moat_compounder',
        '해자 복리형',
        'value',
        '워런 버핏, The Essays of Warren Buffett',
        null,
        'ROE·흑자·부채·FCF를 계량화. 금융업은 순이익을 현금흐름 대용으로 사용.',
        '3년 평균 오너어닝 대용 / 시총 내림차순',
    ],
    [
        'wonderful_fair',
        '위대한 기업·적정 가격형',
        'value',
        '찰리 멍거, Poor Charlie’s Almanack',
        null,
        '공개 기준 해석. 정성 판단 생략, ROIC 세율 21%·PER 35 상한은 SIGNUM 설정.',
        '4년 평균 ROIC 대용 내림차순',
    ],
    [
        'defensive_value',
        '방어적 가치 7원칙',
        'value',
        '벤저민 그레이엄, The Intelligent Investor',
        '14',
        '규모 $2B, 배당은 확보 가능한 12년으로 축약. 원전 전체 재현 아님.',
        '7항목 충족 수 + 자산가치 여유(최대 0.1) 내림차순',
    ],
    [
        'garp',
        '성장 대비 저평가 PEG형',
        'value',
        '피터 린치, One Up on Wall Street',
        '13',
        'EPS 성장 대신 순이익 3·5년 성장 평균. 성장 10~50%, 부채/자본 0.8 상한.',
        '(성장률% + 배당수익률%) / PER 내림차순',
    ],
    [
        'quality_growth',
        '성장 품질형',
        'value',
        '필립 피셔, Common Stocks and Uncommon Profits',
        '3',
        '15가지 정성 질문의 계량 대용. 경영진·경쟁력 판단 생략.',
        '매출 5년 CAGR × 영업이익률 내림차순',
    ],
    [
        'max_pessimism',
        '최대 비관 역발상형',
        'value',
        '존 템플턴 관련: The Templeton Touch',
        null,
        '공개 기준 해석. 저평가·52주 낙폭을 비관의 대용으로 사용.',
        '저PER·낙폭 후보 백분위 평균 내림차순',
    ],
    [
        'roc_ey',
        '자본수익률·이익수익률형',
        'factor',
        '조엘 그린블라트, The Little Book That Beats the Market',
        null,
        '시총 $500M 이상, 금융·유틸리티·부동산 제외. 순운전자본은 0 하한, EV는 장기부채 사용.',
        'ROC 순위 + EBIT/EV 순위 오름차순',
    ],
    [
        'financial_strength',
        '재무건전성 F점수형',
        'factor',
        '조셉 피오트로스키, Value Investing: The Use of Historical Financial Statement Information',
        null,
        '논문 9점 중 8점 이상 + PBR 하위 20%. 부채가 양년 모두 0이면 해당 항목 충족.',
        'F점수 - PBR/100 내림차순',
    ],
    [
        'low_psr_momentum',
        '저PSR 모멘텀형',
        'factor',
        '제임스 오쇼네시, What Works on Wall Street',
        null,
        '시총 $200M·PSR 1.5 미만·EPS 증가 필터. 원전 복합전략의 일부.',
        '12개월 주가 변화 내림차순',
    ],
    [
        'quality_multifactor',
        '퀄리티 멀티팩터형',
        'factor',
        '클리프 아스네스 외, Quality Minus Junk',
        null,
        '섹터 내 품질 백분위 평균≥0.7·베타<1.1·부채 감소·양의 모멘텀. 품질/가치/모멘텀 40/30/30은 SIGNUM 변형.',
        '후보군 품질/가치/모멘텀 백분위 가중합 내림차순',
    ],
];
// Explicit failed-row ordering: lower PER is closer to the <=15 gate. Other
// lenses retain their higher-is-better raw/composite metric. Passing percentile
// and negated rank-sum scores remain descending independently of this policy.
const closestSort: Record<LensId, LensDefinition['closestSort']> = {
    moat_compounder: { metric: '오너어닝 수익률 대용', direction: 'desc' },
    wonderful_fair: { metric: '4년 ROIC 대용', direction: 'desc' },
    defensive_value: { metric: '7항목 충족 수 + 자산가치 여유', direction: 'desc' },
    garp: { metric: '(성장+배당)/PER', direction: 'desc' },
    quality_growth: { metric: '매출 5년 CAGR × 영업이익률', direction: 'desc' },
    max_pessimism: { metric: '5년 평균 PER', direction: 'asc' },
    roc_ey: { metric: 'ROC', direction: 'desc' },
    financial_strength: { metric: 'F점수 - PBR/100', direction: 'desc' },
    low_psr_momentum: { metric: '12개월 주가 변화', direction: 'desc' },
    quality_multifactor: { metric: '섹터 품질 백분위', direction: 'desc' },
};
export const LENSES: LensDefinition[] = definitions.map(
    ([id, name, category, book, chapter, interpretation, sort]) => ({
        id,
        name,
        category,
        source: { book, chapter },
        interpretation,
        sort,
        closestSort: closestSort[id],
    }),
);
export const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const avg = (xs: Array<number | null>) =>
    xs.length && xs.every(num) ? xs.reduce<number>((s, x) => s + x!, 0) / xs.length : null;
const ratio = (a: number | null, b: number | null) => (num(a) && num(b) && b > 0 ? a / b : null);
const cagr = (a: number | null, b: number | null, n: number) =>
    num(a) && num(b) && a > 0 && b > 0 ? (b / a) ** (1 / n) - 1 : null;
const years = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const fmt = (x: number | null) => (num(x) ? Number(x.toFixed(4)).toString() : '자료 없음');
const rank = (v: number | null, xs: Array<number | null>) => {
    const valid = xs.filter(num);
    return num(v) && valid.length
        ? valid.length === 1
            ? 0.5
            : valid.filter((x) => x < v).length / (valid.length - 1)
        : null;
};
function metrics(r: Company) {
    const y = r.year,
        g = (f: Field, yr = y) => r[f][yr] ?? null;
    const mcap = num(r.shares) && r.shares > 0 && num(r.price) && r.price > 0 ? r.price * r.shares : null;
    const roe = (yr: number) => {
        const e = g('eq', yr),
            p = g('eq', yr - 1);
        return ratio(g('ni', yr), num(e) && e > 0 ? (num(p) && p > 0 ? (e + p) / 2 : e) : null);
    };
    const roes = years(y - 9, y).map(roe),
        validRoes = roes.filter(num);
    const fcf = (yr: number) => {
        const o = g('ocf', yr),
            c = g('capex', yr);
        return num(o) && num(c) ? o - c : null;
    };
    const lev = (yr: number) => {
        const a = g('assets', yr),
            l = g('liab', yr),
            e = g('eq', yr);
        return ratio(l ?? (num(a) && num(e) ? a - e : null), a);
    };
    const ni = g('ni'),
        debt = g('ltd'),
        cash = g('cash'),
        eq = g('eq');
    const pe = ratio(mcap, ni),
        pb = ratio(mcap, eq),
        ps = ratio(mcap, g('rev'));
    const ev = num(mcap) && num(debt) && num(cash) ? mcap + debt - cash : null;
    const cap =
        num(g('ca')) && num(g('cl')) && num(g('ppe')) && num(cash)
            ? Math.max(g('ca')! - cash - g('cl')!, 0) + g('ppe')!
            : null;
    return {
        y,
        g,
        mcap,
        roe,
        roes,
        validRoes,
        fcf,
        lev,
        ni,
        debt,
        cash,
        eq,
        pe,
        pb,
        ps,
        ev,
        roc: ratio(g('oi'), cap),
        ey: ratio(g('oi'), ev),
    };
}
export function evaluateLenses(companies: Company[]): Record<LensId, LensResult> {
    const ms = new Map(companies.map((r) => [r.ticker, metrics(r)]));
    const pbValues = [...ms.values()]
        .map((m) => m.pb)
        .filter(num)
        .sort((a, b) => a - b);
    const pbCut = pbValues.length ? pbValues[Math.floor(pbValues.length * 0.2)] : null;
    const output = {} as Record<LensId, LensResult>;
    for (const def of LENSES) {
        const rows: Evaluation[] = companies.map((r) => {
            const m = ms.get(r.ticker)!,
                { y, g } = m;
            const checks: Check[] = [];
            const check = (id: string, v: number | null, rule: string, ok: (v: number) => boolean) => {
                checks.push({
                    id,
                    value: num(v) ? v : null,
                    rule,
                    passed: num(v) && ok(v),
                    reason: `${id} ${fmt(v)} (${rule})`,
                });
            };
            const flag = (id: string, ok: boolean, rule: string) =>
                check(id, ok ? 1 : 0, rule, (v) => v === 1);
            flag('자료 정합', r.issues.length === 0, r.issues.join(', ') || '정상');
            check('시총 USD', m.mcap, '>0', (v) => v > 0);
            let score: number | null = null;
            const count = (f: Field, n: number, pred: (v: number) => boolean) =>
                years(y - n + 1, y)
                    .map((yr) => g(f, yr))
                    .filter((v) => num(v) && pred(v)).length;
            if (def.id === 'moat_compounder' || def.id === 'wonderful_fair') {
                const wonderful = def.id === 'wonderful_fair';
                check('ROE 관측 연수', m.validRoes.length, '≥9/10', (v) => v >= 9);
                check(
                    'ROE 기준 충족 연수',
                    m.validRoes.filter((v) => v >= (wonderful ? 0.2 : 0.15)).length,
                    `≥8/10 (${wonderful ? 20 : 15}%)`,
                    (v) => v >= 8,
                );
                if (!wonderful) {
                    check('ROE 평균', avg(m.validRoes), '≥0.15', (v) => v >= 0.15);
                    check(
                        '흑자 연수',
                        count('ni', 10, (v) => v > 0),
                        '=10',
                        (v) => v === 10,
                    );
                    if (r.sector !== 'Financials') {
                        check('장기부채/순이익', ratio(m.debt, m.ni), '≤3', (v) => v <= 3);
                        check(
                            '양의 FCF 연수',
                            years(y - 9, y)
                                .map(m.fcf)
                                .filter((v) => num(v) && v > 0).length,
                            '≥8/10',
                            (v) => v >= 8,
                        );
                    }
                    score = ratio(
                        avg(
                            years(y - 2, y).map((yr) =>
                                r.sector === 'Financials' ? g('ni', yr) : m.fcf(yr),
                            ),
                        ),
                        m.mcap,
                    );
                    check('오너어닝 수익률 대용', score, '>0', (v) => v > 0);
                } else {
                    flag('업종', r.sector !== 'Financials', '금융업 제외');
                    const start = num(g('rev', y - 10)) ? y - 10 : y - 9;
                    check(
                        `매출 ${y - start}년 CAGR`,
                        cagr(g('rev', start), g('rev'), y - start),
                        '≥0.05',
                        (v) => v >= 0.05,
                    );
                    const gm = ratio(g('gp'), g('rev'));
                    check(
                        num(gm) ? '총이익률' : '영업이익률',
                        gm ?? ratio(g('oi'), g('rev')),
                        num(gm) ? '≥0.40' : '≥0.20',
                        (v) => v >= (num(gm) ? 0.4 : 0.2),
                    );
                    check('PER', m.pe, '0<PER≤35', (v) => v > 0 && v <= 35);
                    const roics = years(y - 3, y).map((yr) => {
                        const e = g('eq', yr),
                            d = g('ltd', yr),
                            oi = g('oi', yr);
                        return ratio(num(oi) ? oi * 0.79 : null, num(e) && num(d) ? e + d : null);
                    });
                    score = avg(roics);
                    check('4년 ROIC 대용', score, '4년 관측', () => true);
                }
            } else if (def.id === 'defensive_value') {
                flag('업종', !['Financials', 'Real Estate'].includes(r.sector), '금융·부동산 제외');
                const start = checks.length;
                check('규모 매출 USD', g('rev'), '≥2000000000', (v) => v >= 2e9);
                flag(
                    '재무상태',
                    r.sector === 'Utilities'
                        ? num(m.debt) && num(m.eq) && m.eq > 0 && m.debt <= 2 * m.eq
                        : num(g('ca')) &&
                              num(g('cl')) &&
                              g('cl')! > 0 &&
                              g('ca')! / g('cl')! >= 2 &&
                              num(m.debt) &&
                              m.debt <= g('ca')! - g('cl')!,
                    '유동비율≥2·장기부채≤순유동자산 (유틸리티: 부채≤자본×2)',
                );
                check(
                    '흑자 연수',
                    count('ni', 10, (v) => v > 0),
                    '=10',
                    (v) => v === 10,
                );
                check(
                    '배당 지급 연수',
                    years(y - 11, y).filter((yr) => (g('divpaid', yr) ?? g('dps', yr) ?? 0) > 0).length,
                    '=12 (축약)',
                    (v) => v === 12,
                );
                const newer = avg(years(y - 2, y).map((yr) => g('ni', yr))),
                    older = avg(years(y - 11, y - 9).map((yr) => g('ni', yr)));
                check('3년 평균이익 성장배수', ratio(newer, older), '≥1.33', (v) => v >= 1.33);
                const pe3 = ratio(m.mcap, newer);
                check('3년 평균 PER', pe3, '0<PER≤15', (v) => v > 0 && v <= 15);
                flag(
                    '자산가치',
                    num(m.pb) && (m.pb <= 1.5 || (num(pe3) && pe3 * m.pb <= 22.5)),
                    'PBR≤1.5 또는 PER×PBR≤22.5',
                );
                const n = checks.slice(start).filter((c) => c.passed).length;
                const margin =
                    num(newer) && newer > 0 && num(m.eq) && m.eq > 0 && num(m.mcap) && m.mcap > 0
                        ? Math.sqrt(22.5 * newer * m.eq) / m.mcap - 1
                        : null;
                score = n + (num(margin) ? Math.max(-1, Math.min(1, margin)) * 0.1 : -0.5);
            } else if (def.id === 'garp') {
                flag('업종', r.sector !== 'Financials', '금융업 제외');
                const growth = avg([cagr(g('ni', y - 5), m.ni, 5), cagr(g('ni', y - 3), m.ni, 3)]);
                check('순이익 성장률', growth, '0.10~0.50', (v) => v >= 0.1 && v <= 0.5);
                check('장기부채/자본', ratio(m.debt, m.eq), '≤0.8', (v) => v <= 0.8);
                const dy = ratio(g('divpaid'), m.mcap);
                score = num(growth) && num(dy) && num(m.pe) ? ((growth + dy) * 100) / m.pe : null;
                const peg = num(growth) && growth > 0 && num(m.pe) ? m.pe / (growth * 100) : null;
                check(
                    'PEG',
                    peg,
                    'PEG≤1 또는 (성장+배당)/PER≥1.5',
                    (v) => v <= 1 || (num(score) && score >= 1.5),
                );
                check('(성장+배당)/PER', score, '관측', () => true);
            } else if (def.id === 'quality_growth') {
                const ups = years(y - 9, y).filter(
                    (yr) => num(g('rev', yr)) && num(g('rev', yr - 1)) && g('rev', yr)! > g('rev', yr - 1)!,
                ).length;
                check('매출 증가 연수', ups, '≥8/10', (v) => v >= 8);
                const gr = cagr(g('rev', y - 5), g('rev'), 5),
                    om = ratio(g('oi'), g('rev')),
                    old = ratio(g('oi', y - 3), g('rev', y - 3));
                check('매출 5년 CAGR', gr, '≥0.10', (v) => v >= 0.1);
                check('영업이익률', om, '≥0.15·3년 전 이상', (v) => v >= 0.15 && num(old) && v >= old);
                check('가중주식수 변화', ratio(g('wsh'), g('wsh', y - 3)), '≤1.03', (v) => v <= 1.03);
                score = num(gr) && num(om) ? gr * om : null;
            } else if (def.id === 'max_pessimism') {
                check(
                    '흑자 연수',
                    count('ni', 5, (v) => v > 0),
                    '≥4/5',
                    (v) => v >= 4,
                );
                const pe5 = ratio(m.mcap, avg(years(y - 4, y).map((yr) => g('ni', yr))));
                check('5년 평균 PER', pe5, '0<PER≤15', (v) => v > 0 && v <= 15);
                check('52주 고점 대비', r.offHigh, '≤-0.25', (v) => v <= -0.25);
                score = pe5;
            } else if (def.id === 'roc_ey') {
                flag(
                    '업종',
                    !['Financials', 'Utilities', 'Real Estate'].includes(r.sector),
                    '금융·유틸리티·부동산 제외',
                );
                check('규모 시총 USD', m.mcap, '≥500000000', (v) => v >= 5e8);
                check('ROC', m.roc, '>0', (v) => v > 0);
                check('EBIT/EV', m.ey, '>0', (v) => v > 0);
                score = m.roc;
            } else if (def.id === 'financial_strength') {
                check('PBR', m.pb, `하위20% ≤${fmt(pbCut)}`, (v) => num(pbCut) && v <= pbCut);
                const pts: Array<[string, number | null, string, (v: number) => boolean]> = [
                    ['순이익', m.ni, '>0', (v) => v > 0],
                    ['영업CF', g('ocf'), '>0', (v) => v > 0],
                    [
                        'ROA 증가',
                        ratio(m.ni, g('assets', y - 1)),
                        '전년 초자산 기준 ROA 초과',
                        (v) => {
                            const p = ratio(g('ni', y - 1), g('assets', y - 2));
                            return num(p) && v > p;
                        },
                    ],
                    [
                        '영업CF-순이익',
                        num(g('ocf')) && num(m.ni) ? g('ocf')! - m.ni : null,
                        '>0',
                        (v) => v > 0,
                    ],
                    [
                        '장기부채/자산',
                        ratio(m.debt, g('assets')),
                        '전년 미만 또는 양년 부채 0',
                        (v) => {
                            const p = ratio(g('ltd', y - 1), g('assets', y - 1));
                            return num(p) && (v < p || (v === 0 && p === 0));
                        },
                    ],
                    [
                        '유동비율',
                        ratio(g('ca'), g('cl')),
                        '전년 초과',
                        (v) => {
                            const p = ratio(g('ca', y - 1), g('cl', y - 1));
                            return num(p) && v > p;
                        },
                    ],
                    [
                        '가중주식수',
                        g('wsh'),
                        '전년 이하',
                        (v) => num(g('wsh', y - 1)) && v <= g('wsh', y - 1)!,
                    ],
                    [
                        '총이익률',
                        ratio(g('gp'), g('rev')),
                        '전년 초과',
                        (v) => {
                            const p = ratio(g('gp', y - 1), g('rev', y - 1));
                            return num(p) && v > p;
                        },
                    ],
                    [
                        '자산회전율',
                        ratio(g('rev'), g('assets', y - 1)),
                        '전년 초과',
                        (v) => {
                            const p = ratio(g('rev', y - 1), g('assets', y - 2));
                            return num(p) && v > p;
                        },
                    ],
                ];
                const start = checks.length;
                pts.forEach((p) => check(...p));
                const f = checks.slice(start).filter((c) => c.passed).length;
                // Individual point failures are evidence, not mandatory gates: 8/9 is a pass.
                const gates = checks.slice(0, start).every((c) => c.passed);
                score = num(m.pb) ? f - m.pb / 100 : null;
                const passed = gates && f >= 8;
                return {
                    ticker: r.ticker,
                    passed,
                    score,
                    checks,
                    reason:
                        `F점수 ${f}/9; ` +
                        checks.map((c) => `${c.passed ? '충족' : '미달'}: ${c.reason}`).join('; '),
                };
            } else if (def.id === 'low_psr_momentum') {
                check('규모 시총 USD', m.mcap, '≥200000000', (v) => v >= 2e8);
                check('PSR', m.ps, '<1.5', (v) => v < 1.5);
                check(
                    'EPS 변화',
                    num(g('eps')) && num(g('eps', y - 1)) ? g('eps')! - g('eps', y - 1)! : null,
                    '>0',
                    (v) => v > 0,
                );
                check('12개월 주가 변화', r.ret12m, '관측', () => true);
                score = r.ret12m;
            } else {
                const sector = companies.filter((c) => c.sector === r.sector).map((c) => ms.get(c.ticker)!);
                const qparts = [
                    rank(
                        ratio(g('gp'), g('assets')),
                        sector.map((s) => ratio(s.g('gp'), s.g('assets'))),
                    ),
                    rank(
                        m.roe(y),
                        sector.map((s) => s.roe(y)),
                    ),
                    rank(
                        ratio(g('ocf'), m.ni),
                        sector.map((s) => ratio(s.g('ocf'), s.ni)),
                    ),
                ].filter(num);
                const q = qparts.length >= 2 ? avg(qparts) : null;
                check('섹터 품질 백분위', q, '≥0.70 (2개 이상 관측)', (v) => v >= 0.7);
                check('베타', r.beta, '<1.1', (v) => v < 1.1);
                const lev = m.lev(y),
                    prev = m.lev(y - 1);
                check('총부채/자산 변화', num(lev) && num(prev) ? lev - prev : null, '<0', (v) => v < 0);
                check('12-1개월 모멘텀', r.mom12_1, '>0', (v) => v > 0);
                const ebitda = num(g('oi')) && num(g('da')) ? g('oi')! + g('da')! : null;
                check('EV/EBITDA', ratio(m.ev, ebitda), '>0', (v) => v > 0);
                score = q;
            }
            return {
                ticker: r.ticker,
                passed: checks.every((c) => c.passed) && num(score),
                score,
                checks,
                reason: checks.map((c) => `${c.passed ? '충족' : '미달'}: ${c.reason}`).join('; '),
            };
        });
        const passed = rows.filter((r) => r.passed);
        if (def.id === 'roc_ey') {
            const roc = [...passed].sort(
                (a, b) => ms.get(b.ticker)!.roc! - ms.get(a.ticker)!.roc! || a.ticker.localeCompare(b.ticker),
            );
            const ey = [...passed].sort(
                (a, b) => ms.get(b.ticker)!.ey! - ms.get(a.ticker)!.ey! || a.ticker.localeCompare(b.ticker),
            );
            passed.forEach((r) => {
                const rr = roc.indexOf(r) + 1,
                    er = ey.indexOf(r) + 1;
                r.score = -(rr + er);
                r.reason += `; ROC 순위 ${rr}, EY 순위 ${er}, 순위합 ${rr + er}`;
            });
        }
        if (def.id === 'max_pessimism')
            passed.forEach((r) => {
                const p = rank(
                    -r.checks.find((c) => c.id === '5년 평균 PER')!.value!,
                    passed.map((c) => -c.checks.find((v) => v.id === '5년 평균 PER')!.value!),
                );
                const d = rank(
                    -companies.find((c) => c.ticker === r.ticker)!.offHigh!,
                    passed.map((c) => -companies.find((v) => v.ticker === c.ticker)!.offHigh!),
                );
                r.score = avg([p, d]);
            });
        if (def.id === 'quality_multifactor') {
            const quality = passed.map((r) => r.score),
                value = passed.map((r) => -r.checks.find((c) => c.id === 'EV/EBITDA')!.value!),
                mom = passed.map((r) => companies.find((c) => c.ticker === r.ticker)!.mom12_1);
            const scores = passed.map(
                (r, i) =>
                    0.4 * rank(r.score, quality)! + 0.3 * rank(value[i], value)! + 0.3 * rank(mom[i], mom)!,
            );
            passed.forEach((r, i) => (r.score = scores[i]));
        }
        rows.sort((a, b) => {
            if (a.passed !== b.passed) return Number(b.passed) - Number(a.passed);
            // Missing metrics must be last in BOTH directions; never substitute 0.
            if (num(a.score) !== num(b.score)) return num(a.score) ? -1 : 1;
            const direction = a.passed || def.closestSort.direction === 'desc' ? -1 : 1;
            return (num(a.score) && num(b.score) ? direction * (a.score - b.score) : 0) ||
                a.ticker.localeCompare(b.ticker);
        });
        output[def.id] = { definition: def, passCount: passed.length, rows };
    }
    return output;
}
export const isLensId = (s: string): s is LensId => (LENS_IDS as readonly string[]).includes(s);
