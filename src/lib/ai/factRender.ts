import { FACT_RENDERER_VERSION, type Fact, type FactLocale } from './factContract';
import { validateFactPlan, type FactPlanIssue } from './factPlan';

const locales = ['ko', 'en', 'ja'] as const;
const fmt = (n: number, digits = 2) => (Object.is(n, -0) ? 0 : n).toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: true,
});
/** Signed magnitude/direction are rounded together, so -0.001% cannot say "fell 0.00%". */
const rounded = (n: number) => { const v = Number(Math.abs(n).toFixed(2)); return v === 0 ? 0 : Math.sign(n) * v; };
const dateLabel = (date: string, loc: FactLocale) => `${date} (${new Intl.DateTimeFormat(
    loc === 'ko' ? 'ko-KR' : loc === 'ja' ? 'ja-JP' : 'en-US', { weekday: 'long', timeZone: 'America/New_York' },
).format(new Date(`${date}T12:00:00Z`))})`;
const indexNames = {
    spx_spot: ['S&P 500 현물', 'S&P 500 spot index', 'S&P 500現物指数'],
    spx_futures: ['S&P 500 선물', 'S&P 500 futures', 'S&P 500先物'],
    composite_spot: ['나스닥 종합 현물', 'Nasdaq Composite spot index', 'ナスダック総合現物指数'],
    ndx_spot: ['나스닥 100 현물', 'Nasdaq-100 spot index', 'ナスダック100現物指数'],
    ndx_futures: ['나스닥 100 선물', 'Nasdaq-100 futures', 'ナスダック100先物'],
    vix_spot: ['VIX 현물', 'VIX spot index', 'VIX現物指数'],
} as const;

function sentence(f: Fact, loc: FactLocale): string {
    const l = locales.indexOf(loc);
    const date = dateLabel(f.source.basisDate, loc);
    switch (f.kind) {
        case 'index': {
            const name = indexNames[f.instrument][l], n = rounded(f.change);
            const timing = { intraday: ['장중', 'intraday', '日中'], close: ['종가', 'close', '終値'], article: ['기사 관측값', 'article observation', '記事の観測値'] }[f.timing][l];
            const move = loc === 'ko' ? n > 0 ? '상승' : n < 0 ? '하락' : '보합'
                : loc === 'ja' ? n > 0 ? '上昇' : n < 0 ? '下落' : '横ばい' : n > 0 ? 'up' : n < 0 ? 'down' : 'unchanged';
            return loc === 'ko' ? `${date} ${timing} 기준 ${name}은 ${fmt(f.level)}포인트, 등락률은 ${fmt(Math.abs(n))}%(${move})이다(관측시각 ${f.source.observedAt}).`
                : loc === 'ja' ? `${date}の${timing}では、${name}は${fmt(f.level)}ポイント、騰落率は${fmt(Math.abs(n))}%（${move}）です（観測時刻${f.source.observedAt}）。`
                    : `${date}, ${timing}: ${name} at ${fmt(f.level)} points, ${move} ${fmt(Math.abs(n))}% (observed ${f.source.observedAt}).`;
        }
        case 'position': {
            const side = loc === 'ko' ? f.side === 'call' ? '콜' : '풋' : loc === 'ja' ? f.side === 'call' ? 'コール' : 'プット' : f.side;
            return loc === 'ko' ? `${date} 세션에 ${f.ticker} ${side} 신규 포지션 ${fmt(f.contracts, 0)}계약, 명목금액 $${fmt(f.notional)}가 열렸다.`
                : loc === 'ja' ? `${date}のセッションで${f.ticker}の${side}新規ポジション${fmt(f.contracts, 0)}契約（想定元本$${fmt(f.notional)}）が開かれました。`
                    : `In the ${date} session, ${fmt(f.contracts, 0)} new ${f.ticker} ${side} contracts opened with $${fmt(f.notional)} notional.`;
        }
        case 'calendar': {
            const event = f.event === 'earnings' ? ['실적 발표', 'earnings', '決算発表'][l] : ['옵션 만기', 'option expiry', 'オプション満期'][l];
            return loc === 'ko' ? `${f.ticker} ${event} 일정은 ${date}이다.` : loc === 'ja' ? `${f.ticker}の${event}は${date}です。` : `${f.ticker} ${event}: ${date}.`;
        }
        case 'ratio': {
            const volume = f.basis === 'volume_call_over_put';
            const basis = volume ? ['거래량 콜÷풋', 'volume calls/puts', '出来高コール÷プット'][l] : ['미결제약정 풋÷콜', 'open-interest puts/calls', '建玉プット÷コール'][l];
            const n = rounded(f.value);
            const dominant = n === 1 ? ['균형', 'balanced', '均衡'][l]
                : (volume ? n > 1 : n < 1) ? ['콜 우세', 'call-heavy', 'コール優勢'][l] : ['풋 우세', 'put-heavy', 'プット優勢'][l];
            return loc === 'ko' ? `${date} ${f.ticker} ${basis} 비율은 ${fmt(n)}(${dominant})이다.`
                : loc === 'ja' ? `${date}の${f.ticker}の${basis}比率は${fmt(n)}（${dominant}）です。` : `${date}, ${f.ticker} ${basis}: ${fmt(n)} (${dominant}).`;
        }
    }
}

export interface FactRenderResult { rendererVersion: typeof FACT_RENDERER_VERSION; text: string; sentences: string[]; issues: FactPlanIssue[] }
/** Final exit API: always validate again; never translate the rendered result through an LLM. */
export function renderFactPlan(plan: unknown, bundle: unknown, locale: unknown, explanations: readonly unknown[] = []): FactRenderResult {
    if (!locales.includes(locale as FactLocale)) return { rendererVersion: FACT_RENDERER_VERSION, text: '', sentences: [], issues: [{ block: null, code: 'unsupported_locale' }] };
    const validated = validateFactPlan(plan, bundle, explanations);
    const loc = locale as FactLocale;
    const sentences = validated.sentences.map(s => s.fact ? sentence(s.fact, loc) : s.explanation!.text[loc]);
    return { rendererVersion: FACT_RENDERER_VERSION, text: sentences.join(' '), sentences, issues: validated.issues };
}
