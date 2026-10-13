/**
 * «✦ AI 오늘 볼 것» — 규칙 문장(순수 함수): 라벨 · «무엇이·숫자·기준» · 규칙 해설(AI 실패 때) · 푸시 한 줄 · AI 에게 주는 사실 글 · 화면 문구.
 *
 * 숫자는 facts 에서만 나온다(AI 가 숫자를 쓰지 않는다). 금융 공통어(Max Pain · Gamma Flip · GEX · Call Wall)는 한·일 화면에서도 번역하지 않는다(대표 10/8).
 * P/C 는 정의 결정 대기라 쓰지 않는다. 매수·매도·추천·목표가·예측 표현 없음 — 관찰 문장만(시험이 금지어를 전수 검사한다).
 * 날짜는 «M/D» 숫자(앱의 다른 AI 문구와 같다) · 금액은 $1.37B / $532M / $87K (한·일에서도 영어 약어 — 억·億 환산 오류가 없다).
 */
import type { DarkFacts, EarnFacts, GammaFacts, Loc, LocText, PickFacts, PickKind, TodayPick, WhaleFacts } from './types';
import { TP_LOCALES } from './types';

export const md = (ymd: string): string => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const trimZ = (s: string): string => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
export const intStr = (n: number): string => Math.round(n).toLocaleString('en-US');
/** 행사가·레벨 가격 — 소수 둘째 자리까지, 끝의 0 은 뗀다 */
export const priceStr = (n: number): string => trimZ(n.toFixed(2));
/** 거리 % — 1 미만은 소수 둘째 자리, 이상은 첫째 자리 */
export const distStr = (n: number): string => trimZ(n < 1 ? n.toFixed(2) : n.toFixed(1));
export const pct1 = (n: number): string => n.toFixed(1);

/** 금액(USD) 약어 */
export function usd(n: number): string {
    const a = Math.abs(n);
    if (a >= 1e9) return `$${trimZ((n / 1e9).toFixed(2))}B`;
    if (a >= 1e8) return `$${Math.round(n / 1e6)}M`;
    if (a >= 1e6) return `$${trimZ((n / 1e6).toFixed(1))}M`;
    if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
    return `$${Math.round(n)}`;
}

const LEVEL_NAME = { gammaFlip: 'Gamma Flip', maxPain: 'Max Pain' } as const;

// ── 라벨 ──────────────────────────────────────────────────────────────────────

export function kindLabel(f: PickFacts, loc: Loc): string {
    switch (f.kind) {
        case 'whale': return loc === 'ko' ? '고래 신규 포지션' : loc === 'ja' ? 'ホエール新規ポジション' : 'WHALE NEW POSITION';
        case 'darkpool': return loc === 'ko' ? '다크풀 급증' : loc === 'ja' ? 'ダークプール急増' : 'DARK POOL SURGE';
        case 'gamma': return f.level === 'gammaFlip'
            ? (loc === 'ko' ? 'Gamma Flip 근접' : loc === 'ja' ? 'Gamma Flip 接近' : 'NEAR GAMMA FLIP')
            : (loc === 'ko' ? 'Max Pain 근접' : loc === 'ja' ? 'Max Pain 接近' : 'NEAR MAX PAIN');
        case 'earnings': return loc === 'ko' ? '실적 임박' : loc === 'ja' ? '決算間近' : 'EARNINGS SOON';
    }
}

/** 오른쪽 위 작은 글자 — 자료의 날짜 */
export function asOfText(f: PickFacts, asOf: string, loc: Loc): string {
    const d = md(asOf);
    if (f.kind === 'whale') return loc === 'ko' ? `${d} 세션` : loc === 'ja' ? `${d}セッション` : `${d} session`;
    if (f.kind === 'darkpool') return `FINRA ${d}`;
    return loc === 'ko' ? `${d} 기준` : loc === 'ja' ? `${d}基準` : `as of ${d}`;
}

// ── 무엇이·숫자 ────────────────────────────────────────────────────────────────

const wSide = (t: 'call' | 'put', loc: Loc): string => (t === 'call' ? (loc === 'ko' ? '콜' : loc === 'ja' ? 'コール' : 'call') : (loc === 'ko' ? '풋' : loc === 'ja' ? 'プット' : 'put'));

export function whatText(f: PickFacts, loc: Loc): string {
    switch (f.kind) {
        case 'whale': {
            const b = f.best;
            const line = `${md(b.expiry)}${loc === 'ko' ? ' 만기 ' : loc === 'ja' ? '満期 ' : ' '}$${priceStr(b.strike)} ${wSide(b.type, loc)} +${intStr(b.added)}${loc === 'ko' ? '계약' : loc === 'ja' ? '枚' : ' contracts'}`;
            return loc === 'en' ? `${line} · ${usd(f.notional)} notional` : `${line} · ${loc === 'ko' ? '명목' : '名目'} ${usd(f.notional)}`;
        }
        case 'darkpool':
            return loc === 'ko' ? `다크풀 비중 ${pct1(f.pct)}% · 거래량 20일 평균의 ${pct1(f.ratio)}배`
                : loc === 'ja' ? `ダークプール比率 ${pct1(f.pct)}% · 出来高は20日平均の${pct1(f.ratio)}倍`
                    : `Dark pool share ${pct1(f.pct)}% · volume ${pct1(f.ratio)}× its 20-day avg`;
        case 'gamma': {
            const nm = LEVEL_NAME[f.level], p = priceStr(f.levelPrice), d = distStr(f.distPct), ex = md(f.expiry);
            if (f.side === 'at') return loc === 'ko' ? `가격이 ${nm} $${p} 위치 · ${ex} 만기` : loc === 'ja' ? `価格は${nm} $${p}と同水準 · ${ex}満期` : `Price at ${nm} $${p} · ${ex} expiry`;
            const up = f.side === 'a';
            return loc === 'ko' ? `${nm} $${p} ${up ? '위' : '아래'} ${d}% · ${ex} 만기`
                : loc === 'ja' ? `${nm} $${p}の${d}%${up ? '上' : '下'} · ${ex}満期`
                    : `${d}% ${up ? 'above' : 'below'} ${nm} $${p} · ${ex} expiry`;
        }
        case 'earnings': {
            const when = f.hour === 'bmo' ? (loc === 'ko' ? ' 장 시작 전' : loc === 'ja' ? ' 寄り付き前' : ' before the open')
                : f.hour === 'amc' ? (loc === 'ko' ? ' 장 마감 후' : loc === 'ja' ? ' 引け後' : ' after the close') : '';
            return loc === 'ko' ? `${md(f.date)}${when} 실적 · 옵션 예상 변동 ±${pct1(f.impliedPct)}%`
                : loc === 'ja' ? `${md(f.date)}${when} 決算 · 想定変動幅 ±${pct1(f.impliedPct)}%`
                    : `Reports ${md(f.date)}${when} · implied move ±${pct1(f.impliedPct)}%`;
        }
    }
}

// ── 규칙 해설(AI 가 못 쓰면 이것이 나간다 — 숫자 없이 «무엇을 재는 값인가»만) ──────────────────────────────────────────

export function fallbackWhy(f: PickFacts, loc: Loc): string {
    switch (f.kind) {
        case 'whale':
            return loc === 'ko' ? '한 만기에 새 계약이 한꺼번에 쌓였습니다' : loc === 'ja' ? '特定の満期に新規建玉が一気に積み上がりました' : 'New contracts piled into a single expiry';
        case 'darkpool':
            return loc === 'ko' ? '장외 거래량이 평소 수준을 크게 웃돌았습니다' : loc === 'ja' ? '場外の出来高が平常を大きく上回りました' : 'Off-exchange volume ran well above its norm';
        case 'gamma':
            return f.level === 'gammaFlip'
                ? (loc === 'ko' ? '딜러 헤지 방향이 바뀌는 경계 가까이에 있습니다' : loc === 'ja' ? 'ディーラーのヘッジ方向が切り替わる境目の近くです' : 'Sitting near the line where dealer hedging flips')
                : (loc === 'ko' ? '이번 만기에 가장 많은 옵션이 무가치가 되는 가격 근처입니다' : loc === 'ja' ? '今回の満期で最も多くのオプションが無価値になる価格の近くです' : 'Near the price where the most options expire worthless');
        case 'earnings':
            return loc === 'ko' ? '발표 직후 움직임의 크기를 옵션 시장이 미리 가격에 담았습니다' : loc === 'ja' ? '発表後の値動きの大きさをオプション市場が織り込んでいます' : 'The options market has priced in the size of the post-report move';
    }
}

// ── 푸시 한 줄 ────────────────────────────────────────────────────────────────

export const PUSH_PREFIX: LocText = { ko: '✦ 오늘 볼 것 · ', en: '✦ Worth watching · ', ja: '✦ 今日の注目 · ' };

export function pushBody(t: string, f: PickFacts, loc: Loc): string {
    switch (f.kind) {
        case 'whale': {
            const b = f.best;
            return loc === 'ko' ? `${t} ${md(b.expiry)} $${priceStr(b.strike)} ${wSide(b.type, loc)} +${intStr(b.added)}계약 (${md(f.openedOn)} 세션)`
                : loc === 'ja' ? `${t} ${md(b.expiry)} $${priceStr(b.strike)} ${wSide(b.type, loc)} +${intStr(b.added)}枚（${md(f.openedOn)}セッション）`
                    : `${t} ${md(b.expiry)} $${priceStr(b.strike)} ${wSide(b.type, loc)} +${intStr(b.added)} contracts (${md(f.openedOn)} session)`;
        }
        case 'darkpool':
            return loc === 'ko' ? `${t} 다크풀 비중 ${pct1(f.pct)}%, 거래량 20일 평균의 ${pct1(f.ratio)}배 (${md(f.date)})`
                : loc === 'ja' ? `${t} ダークプール比率 ${pct1(f.pct)}%、出来高は20日平均の${pct1(f.ratio)}倍（${md(f.date)}）`
                    : `${t} dark pool share ${pct1(f.pct)}%, volume ${pct1(f.ratio)}× its 20-day avg (${md(f.date)})`;
        case 'gamma': {
            const nm = LEVEL_NAME[f.level], p = priceStr(f.levelPrice), d = distStr(f.distPct), ex = md(f.expiry);
            if (f.side === 'at') return loc === 'ko' ? `${t} 가격이 ${nm} $${p} 위치 (${ex} 만기)` : loc === 'ja' ? `${t} 価格は${nm} $${p}と同水準（${ex}満期）` : `${t} price at ${nm} $${p} (${ex} expiry)`;
            const up = f.side === 'a';
            return loc === 'ko' ? `${t} ${nm} $${p} ${up ? '위' : '아래'} ${d}% (${ex} 만기)`
                : loc === 'ja' ? `${t} ${nm} $${p}の${d}%${up ? '上' : '下'}（${ex}満期）`
                    : `${t} ${d}% ${up ? 'above' : 'below'} ${nm} $${p} (${ex} expiry)`;
        }
        case 'earnings': {
            const when = f.hour === 'bmo' ? (loc === 'ko' ? ' 장 전' : loc === 'ja' ? ' 寄り前' : ' pre-market') : f.hour === 'amc' ? (loc === 'ko' ? ' 장 후' : loc === 'ja' ? ' 引け後' : ' after close') : '';
            return loc === 'ko' ? `${t} ${md(f.date)}${when} 실적, 옵션 예상 변동 ±${pct1(f.impliedPct)}%`
                : loc === 'ja' ? `${t} ${md(f.date)}${when} 決算、想定変動幅 ±${pct1(f.impliedPct)}%`
                    : `${t} reports ${md(f.date)}${when}, implied move ±${pct1(f.impliedPct)}%`;
        }
    }
}

export const pushLine = (t: string, f: PickFacts, loc: Loc): string => `${PUSH_PREFIX[loc]}${pushBody(t, f, loc)}`;

// ── 규칙 문장 한 벌(저장용) ───────────────────────────────────────────────────

export function ruleTexts(ticker: string, f: PickFacts): { what: LocText; fallback: LocText; push: LocText } {
    const what = {} as LocText, fallback = {} as LocText, push = {} as LocText;
    for (const l of TP_LOCALES) {
        what[l] = whatText(f, l);
        fallback[l] = fallbackWhy(f, l);
        push[l] = pushLine(ticker, f, l);
    }
    return { what, fallback, push };
}

// ── AI 에게 주는 사실 글(영어) — 이 글에 있는 숫자만 AI 가 쓸 수 있다(출구 가드가 대조) ───────────────────────────────

const HOUR_EN = { bmo: 'before the market opens', amc: 'after the market closes', '': 'time not announced' } as const;

/** 달력 날짜 사이 일수(b − a) — 모양이 틀리면 null */
export function daysUntil(a: string | null | undefined, b: string | null | undefined): number | null {
    if (!a || !b || !/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
    const t = (x: string) => Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
    return Math.round((t(b) - t(a)) / 86400000);
}

/**
 * 이 항목의 «각도» — 해설이 매일 같은 문장이 되지 않도록, 사실에서 규칙으로 정한 한 가지 특징을 앞세우게 한다(영어 지시).
 * 각도에 쓰인 숫자는 모두 factsForAi 에 들어 있다(출구 가드가 그 글의 숫자로 대조).
 */
export function angleHint(f: PickFacts, todayEt: string): string {
    switch (f.kind) {
        case 'whale': {
            const d = daysUntil(todayEt, f.best.expiry);
            if (f.jump == null) return 'Lead with the fact that this line did not exist before — it is brand new.';
            if (f.jump >= 4) return `Lead with how many times the line's open interest multiplied (${pct1(f.jump)}x).`;
            if (d != null && d <= 7) return `Lead with the fact that the new line expires within days (${d} days away).`;
            if (f.callPct >= 90 || f.callPct <= 10) return `Lead with the lopsided mix: ${Math.round(f.callPct)}% of the new notional is calls.`;
            return 'Lead with the size of the new notional compared with a normal day for this stock — in words, no number.';
        }
        case 'darkpool': {
            if (f.ratio >= 2.5) return `Lead with the multiple: volume ran ${pct1(f.ratio)}x its own 20-day average.`;
            if (f.marketAvg != null && f.pct < f.marketAvg - 8) return `Say the surge is in VOLUME even though the share of the day's volume (${pct1(f.pct)}%) is below the all-stock average (${pct1(f.marketAvg)}%).`;
            return 'Lead with the volume running above its own 20-day norm; keep the wording about volume, not share.';
        }
        case 'gamma': {
            const d = daysUntil(todayEt, f.expiry);
            if (f.level === 'maxPain') return f.distPct <= 0.3 || f.side === 'at'
                ? 'Say the price is nearly pinned to Max Pain with the expiry close — pinning is a tendency, not a promise.'
                : 'Say the price sits close to Max Pain and that price sometimes drifts toward it into expiry.';
            if (f.side === 'at') return 'Say the price is RIGHT AT the Gamma Flip switch point, where the dealer-hedging regime changes — never say above, below or just above.';
            const side = f.side === 'a' ? 'above, where dealer hedging tends to dampen moves' : 'below, where dealer hedging tends to amplify moves';
            return d != null && d <= 2 ? `Say the price is just ${side}, with the expiry only ${d} day${d === 1 ? '' : 's'} away.` : `Say the price is just ${side}.`;
        }
        case 'earnings': {
            if (f.impliedPct >= 8) return 'Say the options price in an unusually large move for this report.';
            if (f.hour === 'bmo') return 'Say the report lands before the open — timing only; never say what the move will do or when it will show up.';
            if (f.hour === 'amc') return 'Say the report lands after the close — timing only; never say what the move will do or when it will show up.';
            return 'Say the options already price in a range of movement through the report.';
        }
    }
}

export function factsForAi(ticker: string, f: PickFacts, todayEt?: string): string {
    switch (f.kind) {
        case 'whale': {
            const b = f.best;
            const before = b.oi - b.added;
            const days = todayEt ? daysUntil(todayEt, b.expiry) : null;
            return [
                `FACTS — ${ticker}: new options positions (open-interest increase, confirmed by OCC; positions were opened in the ${md(f.openedOn)} session)`,
                `- Largest new line: the ${md(b.expiry)} $${priceStr(b.strike)} ${b.type}, open interest +${intStr(b.added)} contracts${before > 0 && f.jump != null ? ` (from ${intStr(before)} to ${intStr(b.oi)}, ${pct1(f.jump)}x)` : ' (a brand-new line)'}`,
                ...(days != null && days >= 0 ? [`- That expiry is ${days} days away (as of ${md(todayEt!)})`] : []),
                `- New notional across this stock's unexpired top contracts: ${usd(f.notional)}, ${Math.round(f.callPct)}% calls`,
            ].join('\n');
        }
        case 'darkpool':
            return [
                `FACTS — ${ticker}: off-exchange ("dark pool") trading on ${md(f.date)} (FINRA)`,
                `- Off-exchange share of the day's volume: ${pct1(f.pct)}%${f.marketAvg != null ? ` (all-stock average that day: ${pct1(f.marketAvg)}%)` : ''}`,
                `- Off-exchange volume vs its own 20-day average: ${pct1(f.ratio)}x`,
            ].join('\n');
        case 'gamma': {
            const nm = LEVEL_NAME[f.level];
            const rel = f.side === 'at' ? `the price is at ${nm}` : `the price is ${distStr(f.distPct)}% ${f.side === 'a' ? 'above' : 'below'} ${nm}`;
            const zone = f.level === 'gammaFlip' && f.side !== 'at' ? ` (${f.side === 'a' ? 'positive' : 'negative'} gamma zone)` : '';
            const days = todayEt ? daysUntil(todayEt, f.expiry) : null;
            return [
                `FACTS — ${ticker}: options structure for the ${md(f.expiry)} expiry (open interest as of the ${md(f.chainDate)} close)`,
                `- ${nm} is $${priceStr(f.levelPrice)}; ${rel}${zone}`,
                ...(days != null && days >= 0 ? [`- The expiry is ${days} day${days === 1 ? '' : 's'} away (as of ${md(todayEt!)})`] : []),
            ].join('\n');
        }
        case 'earnings':
            return [
                `FACTS — ${ticker}: earnings report on ${md(f.date)}, ${HOUR_EN[f.hour]}`,
                `- Options-implied move: ±${pct1(f.impliedPct)}% (at-the-money straddle for the ${md(f.impliedExpiry)} expiry${f.session ? `, quotes as of the ${md(f.session)} close` : ''})`,
            ].join('\n');
    }
}

/** 이 종류의 신호가 «무엇을 재는 값인가» — 모델이 기전을 지어내지 않게 주는 정의(영어) */
export const MEANING: Record<PickKind, string> = {
    whale: 'Open interest is the number of option contracts still open. When one line\'s open interest jumps in a session, new positions were opened (not just traded). It says nothing about direction by itself — a call can be a hedge or a bet.',
    darkpool: 'Off-exchange ("dark pool") volume is trading reported to FINRA outside the exchanges (alternative venues and wholesalers). The ratio compares today\'s off-exchange VOLUME (shares traded) with that stock\'s own 20-day average; it is not the share percentage, which is a separate figure.',
    gamma: 'Gamma Flip is the price where dealers\' net gamma changes sign: above it, dealer hedging tends to dampen moves (positive gamma); below it, hedging tends to amplify them (negative gamma). Max Pain is the strike where the most options expire worthless at that expiry; price sometimes drifts toward it into expiry (pinning).',
    earnings: 'The options-implied move is the size of move the at-the-money straddle prices in for the expiry that contains the report. It is the market\'s priced-in range, not a prediction of direction or outcome.',
};

// ── 화면 문구 ──────────────────────────────────────────────────────────────────

export interface UiCopy {
    title: string;
    aiAria: string;
    empty: string;
    updated: (hhmm: string) => string;
    sourceFinra: string;
    webKicker: string;
    webH1: string;
    webLead: string;
    metaTitle: string;
    metaDesc: (top: string | null) => string;
    shareTitle: string;
    shareText: (top: string | null) => string;
    howT: string;
    how: Array<[string, string]>;
    howRule: string;
    pickedLine: (at: string) => string;
    /** 대시보드 카드 아래 한 줄 — «전체 보기 · 5 ›» */
    viewAll: (n: number) => string;
    back: string;
    backAria: string;
}

export const UI: Record<Loc, UiCopy> = {
    ko: {
        title: '오늘 볼 것', aiAria: 'AI 생성 문구', empty: '오늘 고른 항목이 아직 없습니다',
        updated: (t) => `${t} ET 선별`, sourceFinra: '다크풀 데이터 출처 FINRA',
        webKicker: 'AI 오늘 볼 것', webH1: '오늘 옵션 시장에서 볼 만한 5가지',
        webLead: '고래 신규 포지션 · 다크풀 · Gamma Flip와 Max Pain · 실적 전 옵션 예상 변동. 공개 데이터에서 규칙으로 고르고, AI가 항목마다 한 줄로 풀어 줍니다.',
        metaTitle: 'AI 오늘 볼 것 — 고래 신규 포지션·다크풀·Gamma Flip·실적 전 옵션 | SIGNUM HQ',
        metaDesc: (top) => `${top ? `${top} 외 ` : ''}오늘 옵션 시장에서 볼 만한 5가지를 하루 두 번 고릅니다. 고래 신규 포지션, 다크풀 급증, Gamma Flip·Max Pain 근접, 실적 전 옵션 예상 변동 — 숫자는 공개 데이터 기준 날짜와 함께.`,
        shareTitle: '오늘 옵션 시장에서 볼 만한 5가지 — SIGNUM HQ',
        shareText: (top) => `${top ? `${top} 외 ` : ''}오늘 볼 것 5가지 (고래 신규 포지션·다크풀·Gamma Flip·실적 전 옵션)`,
        howT: '이 목록은 이렇게 만듭니다',
        how: [
            ['고래 신규 포지션', '미결제약정(아직 열려 있는 계약 수)이 한 세션에 크게 늘어난 계약입니다. 새 포지션이 열렸다는 뜻이며, 방향(오름·내림)을 말해 주지는 않습니다.'],
            ['다크풀', 'FINRA에 보고되는 거래소 밖 체결 거래량이 그 종목의 20일 평균보다 크게 늘었습니다. 출처는 FINRA입니다.'],
            ['Gamma Flip · Max Pain', '이번 주 만기에서 가격이 딜러 헤지 방향이 바뀌는 지점(Gamma Flip) 또는 가장 많은 옵션이 무가치가 되는 가격(Max Pain) 가까이에 있습니다.'],
            ['실적 전 옵션 예상 변동', '회사가 직접 공지한 실적 발표일 기준으로, 옵션이 그 발표를 낀 만기에 가격으로 반영한 움직임의 크기입니다. 방향은 말하지 않습니다.'],
        ],
        howRule: '저장된 공개 데이터(옵션 미결제약정·FINRA·회사 공지 일정)에서 규칙으로 고르고, AI는 항목마다 한 줄 설명만 씁니다. 숫자와 날짜는 규칙이 계산하며 AI가 새로 만들지 않습니다.',
        pickedLine: (at) => `선별 시각 ${at} ET`,
        viewAll: (n) => `전체 보기 · ${n}`, back: '뒤로', backAria: '뒤로 가기',
    },
    ja: {
        title: '今日の注目', aiAria: 'AI生成', empty: '本日の注目はまだありません',
        updated: (t) => `${t} ET 選定`, sourceFinra: 'ダークプールのデータ出典 FINRA',
        webKicker: 'AI 今日の注目', webH1: '今日のオプション市場で見ておきたい5つ',
        webLead: '大口の新規ポジション・ダークプール・Gamma FlipとMax Pain・決算前の想定変動幅。公開データからルールで選び、AIが項目ごとに一言で解説します。',
        metaTitle: 'AI 今日の注目 — 大口の新規ポジション・ダークプール・Gamma Flip・決算前のオプション | SIGNUM HQ',
        metaDesc: (top) => `${top ? `${top}ほか、` : ''}今日のオプション市場で見ておきたい5つを1日2回選びます。大口の新規ポジション、ダークプールの急増、Gamma Flip・Max Painへの接近、決算前の想定変動幅。数字は公開データの基準日つき。`,
        shareTitle: '今日のオプション市場で見ておきたい5つ — SIGNUM HQ',
        shareText: (top) => `${top ? `${top}ほか、` : ''}今日の注目5つ(大口の新規ポジション・ダークプール・Gamma Flip・決算前のオプション)`,
        howT: 'このリストの作り方',
        how: [
            ['大口の新規ポジション', '建玉(まだ残っている契約数)が1セッションで大きく増えた契約です。新規ポジションが建てられたことを示すだけで、方向(上げ・下げ)は示しません。'],
            ['ダークプール', 'FINRAに報告される取引所外の出来高が、その銘柄の20日平均を大きく上回りました。出典はFINRAです。'],
            ['Gamma Flip · Max Pain', '今週の満期で、価格がディーラーのヘッジ方向が切り替わる水準(Gamma Flip)、または最も多くのオプションが無価値になる価格(Max Pain)の近くにあります。'],
            ['決算前の想定変動幅', '企業が自ら告知した決算日を基準に、その発表を含む満期のオプションが織り込む値動きの大きさです。方向は示しません。'],
        ],
        howRule: '保存された公開データ(オプション建玉・FINRA・企業が告知した日程)からルールで選び、AIは項目ごとの一言解説だけを書きます。数字と日付はルールが計算し、AIが新たに作ることはありません。',
        pickedLine: (at) => `選定時刻 ${at} ET`,
        viewAll: (n) => `すべて見る · ${n}`, back: '戻る', backAria: '前の画面に戻る',
    },
    en: {
        title: 'Worth watching today', aiAria: 'AI-generated', empty: 'No picks yet today',
        updated: (t) => `Picked ${t} ET`, sourceFinra: 'Dark pool data: FINRA',
        webKicker: 'AI · WORTH WATCHING TODAY', webH1: '5 things worth watching in options today',
        webLead: 'Whale new positions, dark pool surges, Gamma Flip and Max Pain, pre-earnings implied moves — picked by rules from public data, with a one-line AI note on each.',
        metaTitle: 'AI: Worth watching in options today — whale positions, dark pool, Gamma Flip, earnings | SIGNUM HQ',
        metaDesc: (top) => `${top ? `${top} and 4 more: ` : ''}five things worth watching in the options market, picked twice a day. Whale new positions, dark pool surges, names near Gamma Flip or Max Pain, pre-earnings implied moves — every number dated to its public source.`,
        shareTitle: '5 things worth watching in options today — SIGNUM HQ',
        shareText: (top) => `${top ? `${top} and 4 more — ` : ''}5 things worth watching in options today (whale positions, dark pool, Gamma Flip, earnings)`,
        howT: 'How this list is made',
        how: [
            ['Whale new positions', 'A contract whose open interest (contracts still open) jumped in a single session. It means new positions were opened — it does not say which way the price will go.'],
            ['Dark pool', 'Off-exchange volume reported to FINRA ran well above the stock\'s own 20-day average. Source: FINRA.'],
            ['Gamma Flip · Max Pain', 'For this week\'s expiry, the price sits near the level where dealer hedging flips (Gamma Flip) or the strike where the most options expire worthless (Max Pain).'],
            ['Pre-earnings implied move', 'Based on the report date the company itself announced: the size of move the options for the expiry containing the report price in. It does not say which way.'],
        ],
        howRule: 'Picked by rules from stored public data (options open interest, FINRA, company-announced dates); AI writes only the one-line note on each item. Rules compute every number and date — AI does not create new ones.',
        pickedLine: (at) => `Picked ${at} ET`,
        viewAll: (n) => `View all · ${n}`, back: 'Back', backAria: 'Go back',
    },
};

/** TodayPick → 화면이 쓰는 한 언어 묶음 */
export function viewOf(p: TodayPick, loc: Loc): { id: string; ticker: string; kind: PickKind; label: string; asOf: string; what: string; why: string; ai: boolean } {
    return { id: p.id, ticker: p.ticker, kind: p.kind, label: kindLabel(p.facts, loc), asOf: asOfText(p.facts, p.asOf, loc), what: p.what[loc], why: p.why[loc], ai: p.whyAi };
}

// 내보내기 편의
export type { WhaleFacts, DarkFacts, GammaFacts, EarnFacts };
