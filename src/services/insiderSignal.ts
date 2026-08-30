/**
 * 내부자 거래 시그널 — 카드 한 칸에 들어갈 표시값을 만든다.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 이 파일이 따로 있나]
 *   같은 「기관 레이더」 칸이 앱(app-view/cmd)·모바일 웹(MobileCmdMetrics)·
 *   티커 SSR 페이지(CommandSSRCards) 세 곳에 있다. 예전 다크풀 시절엔
 *   세 곳이 각자 임계값을 들고 있어 같은 종목이 화면마다 다르게 보였다.
 *   판정은 여기 한 곳에서만 하고, 각 화면은 그리기만 한다.
 *
 * [왜 다크풀을 대체했나]
 *   Intrinio 피드는 market_center·sales_conditions 를 주지 않는다
 *   (실측: MarketCenter=" " · IsDarkpool=false 전건). 비중을 만들려면
 *   지어내야 하므로 지표 자체를 버렸다. 대신 SEC Form 4 내부자 거래는
 *   «누가·언제·얼마에» 가 전부 공시된다 — 익명 다크풀보다 오히려 강하다.
 *
 * [원칙]  없는 데이터는 0 이 아니라 «없음» 이다.
 *   ① 공시 자체가 없음        → none
 *   ② 공시는 있는데 실매매 0  → noTrade + 무엇이 몇 건이었는지
 *   ③ 실매매 있음             → net + 순매매 금액
 *
 *   ②를 «0원» 이라고 쓰면 «내부자가 아무것도 안 했다» 로 읽히지만
 *   실제로는 무상부여·옵션행사·세금원천 같은 보상/행정 절차가 있었던 것이다.
 *   그건 시장에서 산 게 아니므로 금액에 넣지 않고, 대신 그대로 밝힌다.
 */

export type Locale = 'ko' | 'en' | 'ja';

export interface InsiderSignalView {
    /** none = 공시 없음 · noTrade = 실매매 없음 · net = 실매매 있음 */
    state: 'none' | 'noTrade' | 'net';
    /** 카드 큰 글씨. 실매매가 없으면 '—' */
    value: string;
    direction: 'up' | 'down' | 'flat';
    buy: number;
    sell: number;
    /** noTrade 일 때 실제로 있었던 것들 — ['부여 13','행사 16'] */
    kinds: string[];
    /** 한 줄 요약 (플레인 문자열만 받는 카드용) */
    subText: string;
}

const T = {
    none: { ko: '30일 내 공시 없음', en: 'No filings in 30d', ja: '30日以内の届出なし' },
    noTrade: { ko: '실매매 없음', en: 'No open-market trades', ja: '市場売買なし' },
    buy: { ko: '매수', en: 'Buy', ja: '買い' },
    sell: { ko: '매도', en: 'Sell', ja: '売り' },
    cnt: { ko: '건', en: '', ja: '件' },
    award: { ko: '부여', en: 'Award', ja: '付与' },
    exercise: { ko: '행사', en: 'Exercise', ja: '行使' },
    tax: { ko: '세금', en: 'Tax', ja: '税' },
    gift: { ko: '증여', en: 'Gift', ja: '贈与' },
    // 30일 내 실매매가 없을 때 «가장 최근 실매매»를 말해 준다
    lastBuy: { ko: '최근 매수', en: 'Last buy', ja: '直近の買い' },
    lastSell: { ko: '최근 매도', en: 'Last sell', ja: '直近の売り' },
    director: { ko: '이사', en: 'Director', ja: '取締役' },
    officer: { ko: '임원', en: 'Officer', ja: '役員' },
    daysAgo: { ko: '일 전', en: 'd ago', ja: '日前' },
} as const;

/** 'STEVENS MARK A' → 'Stevens Mark A' (전부 대문자로 오는 SEC 표기를 완화) */
function titleCase(n: string): string {
    return String(n || '')
        .toLowerCase()
        .replace(/\b[a-z]/g, (c) => c.toUpperCase())
        .trim();
}

function daysSince(iso: string): number | null {
    const t = Date.parse(String(iso || ''));
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.round((Date.now() - t) / 86400_000));
}

/** $12,400,000 → "$12.4M" */
export function compactUsd(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
    return `$${a.toFixed(0)}`;
}

export function buildInsiderSignal(insider: any, locale: Locale = 'en'): InsiderSignalView {
    const L = (k: keyof typeof T) => T[k][locale] ?? T[k].en;
    const empty = { direction: 'flat' as const, buy: 0, sell: 0, kinds: [] as string[] };

    if (!insider) {
        return { ...empty, state: 'none', value: '—', subText: L('none') };
    }

    const buy = Number(insider.buyCount) || 0;
    const sell = Number(insider.sellCount) || 0;

    // 실매매(P/S)가 없으면 금액을 만들지 않는다
    if (buy + sell === 0) {
        const b = insider.breakdown || {};
        const kinds: string[] = [];
        const push = (n: any, key: keyof typeof T) => {
            if (Number(n) > 0) kinds.push(`${L(key)} ${Number(n)}`);
        };
        push(b.award, 'award');
        push(b.optionExercise, 'exercise');
        push(b.taxWithheld, 'tax');
        push(b.gift, 'gift');
        // ★ 「실매매 없음 · 부여 13 · 세금 5 · 증여 4」는 사실이지만 **쓸모가 없다.**
        //   30일 «밖»에 실매매가 있었다면 그게 훨씬 중요한 정보다.
        //   실측(2026-08-30 NVDA): 30일 내 실매매 0 인데, 6/23 에 이사가
        //   $67.0M 를 팔았다. 카드는 그걸 안 보여주고 「없음」이라고만 했다.
        //   → 가장 최근 실매매를 문장으로 만들어 준다.
        const latest = insider.latest;
        const code = String(latest?.code || '').toUpperCase();
        const isRealTrade = code === 'P' || code === 'S';
        const val = Number(latest?.value);
        const ago = isRealTrade ? daysSince(latest?.date) : null;

        if (isRealTrade && Number.isFinite(val) && val > 0 && ago != null) {
            const who = /director/i.test(String(latest?.title || '')) ? L('director')
                : /officer|ceo|cfo|president|chief/i.test(String(latest?.title || '')) ? L('officer')
                    : titleCase(latest?.name || '');
            const head = code === 'P' ? L('lastBuy') : L('lastSell');
            return {
                ...empty,
                state: 'noTrade',
                value: '—',
                kinds,
                direction: code === 'P' ? 'up' : 'down',
                // 「최근 매도 · 이사 $67.0M · 68일 전」
                subText: `${head} · ${who} ${compactUsd(val)} · ${ago}${L('daysAgo')}`,
            };
        }

        return {
            ...empty,
            state: 'noTrade',
            value: '—',
            kinds,
            subText: kinds.length ? kinds.join(' · ') : L('noTrade'),
        };
    }

    const net = Number(insider.net30d) || 0;
    const up = net > 0;
    return {
        state: 'net',
        value: `${up ? '+' : '-'}${compactUsd(net)}`,
        direction: up ? 'up' : 'down',
        buy,
        sell,
        kinds: [],
        subText: `${L('buy')} ${buy} · ${L('sell')} ${sell}${L('cnt')}`,
    };
}
