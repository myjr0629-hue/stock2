/**
 * 다크풀 해석 엔진 — 숫자를 «읽어 주는» 부분.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 왜 별도 모듈인가
 *   순수 함수라 서버(SEO·AI)와 클라이언트(앱 카드)가 **같은 해석**을 쓴다.
 *   화면마다 따로 쓰면 같은 데이터가 다른 말을 하게 된다 — 오늘 실제로
 *   겪었다(라벨은 「보통」인데 문장은 「쏠림이 적습니다」).
 *
 * 무엇을 읽는가 — 세 축을 «엮어서» 하나의 이야기로
 *   ① 비중  pct vs marketAvg   이 종목이 유난히 장외에서 거래되는가
 *   ② 물량  volRatio           그 장외 활동이 «지금» 늘었는가  ← 가장 강한 신호
 *   ③ 성격  shortPct           그 물량이 매수 쪽인가 공매도 쪽인가
 *
 *   ②가 핵심이다. 비중(pct)은 종목마다 구조적으로 다르다 — 대형 ETF 는
 *   늘 30%대, 소형주는 늘 70%대다. 그래서 «높다/낮다»를 절대값으로 말하면
 *   거의 항상 틀린다. 반면 volRatio 는 «이 종목 자신»과 비교하므로
 *   변화를 잡는다. 실측: NVDA 45.2%(평균 이하)인데 물량은 1.76배 —
 *   비중만 보면 조용해 보이지만 실제로는 평소의 두 배가 오갔다.
 *
 * ⚠️ 예측이 아니라 «포지셔닝 판독»이다. 미래를 암시하는 표현을 쓰지 않는다.
 *    (매수/매도 권유 금지 — 자본시장법·앱스토어 심사 양쪽에 걸린다.)
 * ══════════════════════════════════════════════════════════════════════
 */

export type DpLang = 'ko' | 'en' | 'ja';

export interface DarkPoolInput {
    pct: number;
    marketAvg?: number | null;
    volRatio?: number | null;
    shortPct?: number | null;
    regime?: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | null;
    /**
     * 같은 날 주가 등락률 %. **이것이 차별점이다.**
     *   장외 포지셔닝만 보면 「많이 샀다/팔았다」까지다. 주가 방향과 엮으면
     *   「내리는 걸 사고 있다」/「오르는데 팔고 있다」가 나온다 — 공개된
     *   화면만 보는 사람은 절대 못 보는 그림이다.
     */
    changePct?: number | null;
    /** 이 종목의 20일 평균 공매도 비중 — 기준선 */
    shortAvg?: number | null;
    /** 오늘 − 평소 (%p) */
    shortDev?: number | null;
    date?: string | null;
}

export interface DarkPoolRead {
    /** 한 줄 결론 — 카드 상단에 굵게 */
    headline: string;
    /** 왜 그렇게 읽는가 — 근거와 기전 */
    detail: string;
    /** 강조 색 힌트 */
    tone: 'positive' | 'negative' | 'neutral';
}

const T = <T,>(l: DpLang, ko: T, en: T, ja: T): T => (l === 'ko' ? ko : l === 'ja' ? ja : en);

/** 물량 배수 구간 */
function volBand(v: number | null | undefined): 'surge' | 'up' | 'flat' | 'quiet' | null {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (v >= 1.8) return 'surge';
    if (v >= 1.25) return 'up';
    if (v <= 0.7) return 'quiet';
    return 'flat';
}

/**
 * 공매도 비중의 «성격» — ★ 절대 수준이 아니라 «자기 평소 대비»로 판단한다.
 *
 * 왜: 장외 공매도 비중의 **시장 중앙값이 49.4%** 다(11,663종목 실측).
 *     도매업자가 소매 매수의 상대가 될 때 보유하지 않은 주식을 일단
 *     공매도로 팔고 나중에 되사기 때문이다. 즉 절반은 시장 배관이지
 *     하락 베팅이 아니다.
 *     실측: CRWD 45.5%(평소 46.3%) = 아무 일 없음.
 *           TSLA 61.9%(평소 48.5%) = **+13.4%p, 진짜 이상**.
 *     절대값 46%를 「낮다」고 읽으면 종목마다 다 틀린다.
 */
function shortBand(dev: number | null | undefined, raw: number | null | undefined): 'low' | 'mid' | 'high' | null {
    if (typeof dev === 'number' && Number.isFinite(dev)) {
        if (dev <= -4) return 'low';
        if (dev >= 4) return 'high';
        return 'mid';
    }
    // 기준선이 아직 없으면 시장 중앙값(49.4%)을 임시 기준으로 쓴다
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    if (raw <= 42) return 'low';
    if (raw >= 57) return 'high';
    return 'mid';
}

export function readDarkPool(d: DarkPoolInput, lang: DpLang = 'ko'): DarkPoolRead {
    // ── 왜 «호가창 밖»이 중요한가 — 모든 해석의 공통 전제 ──────────────
    const why = T(lang,
        '장외 체결은 주문이 공개 호가창에 뜨지 않아 가격을 밀지 않습니다. 큰 물량을 조용히 옮길 때 쓰는 통로입니다.',
        'Off-exchange prints never touch the public book, so they move size without moving the quote. That is the point of using them.',
        '場外約定は板に載らないため価格を動かさずに大口をさばけます。だからこそ大口はここを使います。');

    const vb = volBand(d.volRatio);
    // ⚠️ 성격 판정은 **백엔드 regime 이 권위**다. regime 은 자기 20일 백분위로
    //    계산되므로 종목별 차이를 흡수한다. 여기서 절대 임계값으로 다시
    //    판정하면 라벨(은밀 매집)과 문장(중립)이 서로 다른 말을 한다 —
    //    2026-08-31 실제로 CRWD 에서 그렇게 어긋났다.
    /**
     * ★ 극단 이탈은 합성 점수가 상쇄해도 «이상»이다.
     *   실측 반례(SLB 2026-08-28): 물량 1.9배 + 공매도 73%(평소 48%, **+25%p**).
     *   그런데 stealth = volP*0.6 + (100-shortP)*0.4 는 둘이 반대로 커서
     *   가운데로 수렴 → regime NEUTRAL → 화면이 「73% vs 48% 는 **평범하다**」
     *   고 말했다. +25%p 는 평범할 수 없다.
     *   → |shortDev| ≥ 10%p 면 합성 점수를 «무시하고» 이탈 방향을 쓴다.
     *      (마케팅 게시물로 나가기 직전에 잡았다.)
     */
    const extremeShort = typeof d.shortDev === 'number' && Number.isFinite(d.shortDev)
        && Math.abs(d.shortDev) >= 10;
    const sb: 'low' | 'mid' | 'high' | null =
        extremeShort ? (d.shortDev! > 0 ? 'high' : 'low')
        : d.regime === 'ACCUMULATION' ? 'low'
        : d.regime === 'DISTRIBUTION' ? 'high'
        : d.regime === 'NEUTRAL' ? 'mid'
        : shortBand(d.shortDev, d.shortPct);
    const gap = typeof d.marketAvg === 'number' ? d.pct - d.marketAvg : null;
    const vr = d.volRatio;
    const sp = d.shortPct;
    /** 「46%」가 아니라 「46% (평소 46%)」로 말한다 — 기준선 없이는 오해한다 */
    const shortTxt = (v: number) => {
        const a = d.shortAvg;
        if (typeof a !== 'number') return T(lang, `${v.toFixed(0)}%`, `${v.toFixed(0)}%`, `${v.toFixed(0)}%`);
        return T(lang, `${v.toFixed(0)}%(평소 ${a.toFixed(0)}%)`, `${v.toFixed(0)}% vs a ${a.toFixed(0)}% norm`, `${v.toFixed(0)}%（平常${a.toFixed(0)}%）`);
    };

    // ══ ⓪ 주가와의 «어긋남» — 있으면 이것이 가장 강한 이야기다.
    //    장외 포지셔닝만 보면 「샀다/팔았다」까지다. 주가 방향과 엮어야
    //    「내리는 걸 사고 있다」가 나온다. 화면만 보는 사람은 못 보는 그림이다.
    const chg = typeof d.changePct === 'number' && Number.isFinite(d.changePct) ? d.changePct : null;
    const active = vb === 'surge' || vb === 'up';
    if (chg != null && active && Math.abs(chg) >= 1.5 && sb && sb !== 'mid') {
        const mult = vr!.toFixed(1);
        const down = chg < 0;
        const absChg = Math.abs(chg).toFixed(1);
        // 하락 + 매집 = 받아 담는 중 / 상승 + 분산 = 올려서 파는 중
        if (down && sb === 'low') {
            return {
                tone: 'positive',
                headline: T(lang,
                    `주가는 ${absChg}% 내렸는데 장외 물량은 평소의 ${mult}배 — 내리는 쪽을 받아 담고 있습니다`,
                    `Price fell ${absChg}% while off-exchange volume ran ${mult}× its norm — the decline was being absorbed`,
                    `株価は${absChg}%下げたのに場外出来高は平常の${mult}倍 — 下げを引き受けています`),
                detail: T(lang,
                    `${why} 공개 화면에는 «하락»만 보입니다. 그런데 같은 날 호가창 밖에서는 평소의 ${mult}배 물량이 오갔고 그중 공매도는 ${shortTxt(sp!)}에 그쳤습니다. 파는 쪽이 아니라 받는 쪽이 컸다는 뜻입니다.`,
                    `${why} The public screen shows only the drop. Off the book, ${mult}× the usual size changed hands that same day, and only ${shortTxt(sp!)} of it printed short — the flow leaned toward absorbing, not selling.`,
                    `${why} 公開画面には「下落」しか見えません。しかし同じ日、板の外では平常の${mult}倍が動き、うち空売りは${shortTxt(sp!)}にとどまりました。売り手ではなく引き受け手が大きかったということです。`),
            };
        }
        if (!down && sb === 'high') {
            return {
                tone: 'negative',
                headline: T(lang,
                    `주가는 ${absChg}% 올랐는데 장외 물량의 ${sp!.toFixed(0)}%가 공매도입니다${d.shortAvg != null ? ` (평소 ${d.shortAvg.toFixed(0)}%)` : ''} — 오르는 데 대고 팔았습니다`,
                    `Price rose ${absChg}% while ${sp!.toFixed(0)}% of the off-exchange size printed short${d.shortAvg != null ? `, against a ${d.shortAvg.toFixed(0)}% norm` : ''} — sold into the strength`,
                    `株価は${absChg}%上げたのに場外出来高の${sp!.toFixed(0)}%が空売り${d.shortAvg != null ? `（平常${d.shortAvg.toFixed(0)}%）` : ''} — 上昇に向けて売っています`),
                detail: T(lang,
                    `${why} 화면에는 «상승»만 보입니다. 그러나 호가창 밖에서는 평소의 ${mult}배 물량 중 절반 넘게가 공매도로 찍혔습니다. 오른 가격에 물량을 넘기거나 헤지를 얹은 쪽에 가깝습니다.`,
                    `${why} The screen shows only the rally. Off the book, more than half of ${mult}× the usual size printed short — closer to distributing into strength or layering hedges.`,
                    `${why} 画面には「上昇」しか見えません。しかし板の外では平常の${mult}倍のうち半分以上が空売りでした。上げたところで渡すか、ヘッジを重ねた形に近いです。`),
            };
        }
    }

    // ══ ① 물량 급증 — 가장 강한 신호. 성격(공매도 비중)으로 방향을 가른다
    if (vb === 'surge' || vb === 'up') {
        const mult = vr!.toFixed(1);
        if (sb === 'low') {
            return {
                tone: 'positive',
                headline: T(lang,
                    `장외 물량이 평소의 ${mult}배 — 그중 공매도는 ${shortTxt(sp!)}뿐입니다`,
                    `Off-exchange volume ran ${mult}× its norm — and only ${shortTxt(sp!)} of it was short`,
                    `場外出来高が平常の${mult}倍 — うち空売りは${shortTxt(sp!)}だけです`),
                detail: T(lang,
                    `${why} 물량이 늘었는데 공매도 비중은 낮다는 것은, 그 늘어난 물량 대부분이 «파는 쪽»이 아니었다는 뜻입니다. 호가창 밖에서 조용히 모으는 전형적인 모양입니다.`,
                    `${why} Volume rose while the short share stayed low, meaning most of that extra size was not sell-side. This is what quiet accumulation looks like on the tape.`,
                    `${why} 出来高が増えたのに空売り比率は低い — 増えた分の大半が「売り」ではなかったということです。板の外で静かに集める典型的な形です。`),
            };
        }
        if (sb === 'high') {
            return {
                tone: 'negative',
                headline: T(lang,
                    `장외 물량이 평소의 ${mult}배 — 그런데 절반 넘는 ${shortTxt(sp!)}가 공매도입니다`,
                    `Off-exchange volume ran ${mult}× its norm — but ${shortTxt(sp!)} of it was short`,
                    `場外出来高が平常の${mult}倍 — ただし${shortTxt(sp!)}が空売りです`),
                detail: T(lang,
                    `${why} 물량은 늘었지만 그 대부분이 공매도로 찍혔습니다. 새로 사 모으는 것이 아니라 «헤지하거나 덜어내는» 쪽에 가깝습니다. 같은 «장외 급증»이라도 성격이 정반대입니다.`,
                    `${why} The size showed up, but most of it printed short — closer to hedging or trimming than to fresh buying. Same volume surge, opposite meaning.`,
                    `${why} 出来高は増えましたが大半が空売りとして記録されました。新規の買い集めではなく「ヘッジ・圧縮」に近い形です。同じ急増でも意味は正反対です。`),
            };
        }
        return {
            tone: 'neutral',
            headline: T(lang,
                `장외 물량이 평소의 ${mult}배로 늘었습니다`,
                `Off-exchange volume ran ${mult}× its norm`,
                `場外出来高が平常の${mult}倍に増えました`),
            detail: T(lang,
                `${why} 활동은 뚜렷하게 늘었지만 공매도 비중${sp != null ? ` ${shortTxt(sp)}` : ''}은 평범해서, 매집인지 정리인지 한쪽으로 읽기는 이릅니다. 며칠 이어지는지가 판단 재료입니다.`,
                `${why} Activity clearly picked up, but the short share${sp != null ? ` at ${shortTxt(sp)}` : ''} is unremarkable — too early to call it accumulation or unwinding. Whether it persists is the tell.`,
                `${why} 活動は明確に増えましたが空売り比率${sp != null ? `（${shortTxt(sp)}）` : ''}は平凡で、買い集めか整理かはまだ判断できません。数日続くかどうかが手がかりです。`),
        };
    }

    // ══ ② 물량 한산
    if (vb === 'quiet') {
        return {
            tone: 'neutral',
            headline: T(lang,
                `장외 물량이 평소의 ${vr!.toFixed(1)}배로 한산합니다`,
                `Off-exchange volume was quiet at ${vr!.toFixed(1)}× its norm`,
                `場外出来高は平常の${vr!.toFixed(1)}倍と閑散です`),
            detail: T(lang,
                `${why} 큰손이 이 종목에서 조용한 날이었습니다. 비중(${d.pct.toFixed(1)}%)만 보면 평소와 비슷해 보여도, 실제로 오간 물량 자체가 적었습니다.`,
                `${why} Large players were quiet in this name today. The share (${d.pct.toFixed(1)}%) may look normal, but the absolute size behind it was thin.`,
                `${why} 大口はこの銘柄で静かな一日でした。比率（${d.pct.toFixed(1)}%）は普通に見えても、実際の出来高そのものが薄かったということです。`),
        };
    }

    // ══ ③ 물량은 평소 — 비중과 성격으로 읽는다
    if (gap != null && Math.abs(gap) >= 8) {
        const high = gap > 0;
        return {
            tone: 'neutral',
            headline: high
                ? T(lang,
                    `거래의 ${d.pct.toFixed(0)}%가 호가창 밖에서 체결됐습니다 — 시장 평균보다 ${gap.toFixed(0)}%p 높습니다`,
                    `${d.pct.toFixed(0)}% of the tape printed away from the public book — ${gap.toFixed(0)}pp above the market`,
                    `売買の${d.pct.toFixed(0)}%が板の外で約定 — 市場平均より${gap.toFixed(0)}pt高い水準です`)
                : T(lang,
                    `장외 비중 ${d.pct.toFixed(0)}% — 시장 평균보다 ${Math.abs(gap).toFixed(0)}%p 낮습니다`,
                    `${d.pct.toFixed(0)}% off-exchange — ${Math.abs(gap).toFixed(0)}pp below the market`,
                    `場外比率${d.pct.toFixed(0)}% — 市場平均より${Math.abs(gap).toFixed(0)}pt低い水準です`),
            detail: high
                ? T(lang,
                    `${why} 이 종목은 구조적으로 장외 비중이 높은 편입니다. 다만 오늘 물량 자체는 평소 수준이라, «비중이 높다»는 사실만으로 오늘 무슨 일이 있었다고 읽기는 어렵습니다.${sp != null ? ` 그중 공매도는 ${shortTxt(sp)}입니다.` : ''}`,
                    `${why} This name structurally trades more off-exchange than most. Today's size was normal, though, so the elevated share alone does not say something happened today.${sp != null ? ` Short share of it: ${shortTxt(sp)}.` : ''}`,
                    `${why} この銘柄は構造的に場外比率が高めです。ただし本日の出来高自体は平常水準で、比率の高さだけで今日何かがあったとは読めません。${sp != null ? `うち空売りは${shortTxt(sp)}です。` : ''}`)
                : T(lang,
                    `${why} 대부분이 공개 시장에서 소화됐다는 뜻입니다. 기관이 굳이 숨길 필요가 없었거나, 오늘은 참여가 적었습니다.${sp != null ? ` 장외 물량 중 공매도는 ${shortTxt(sp)}입니다.` : ''}`,
                    `${why} Most of the day cleared on the lit market — either there was nothing to hide, or the large players sat out.${sp != null ? ` Short share of the off-exchange piece: ${shortTxt(sp)}.` : ''}`,
                    `${why} 大半が公開市場で消化されたということです。隠す必要がなかったか、今日は大口の参加が少なかったかです。${sp != null ? `場外分のうち空売りは${shortTxt(sp)}です。` : ''}`),
        };
    }

    // ══ ④ 물량·비중 모두 평범 — 성격만 남는다
    if (sb === 'high' && sp != null) {
        return {
            tone: 'negative',
            headline: T(lang,
                `장외 물량의 ${shortTxt(sp)}가 공매도로 찍혔습니다`,
                `${shortTxt(sp)} of the off-exchange volume printed short`,
                `場外出来高の${shortTxt(sp)}が空売りとして記録されました`),
            detail: T(lang,
                `${why} 전체 규모는 평소 수준이지만, 그 안에서 파는 쪽 비중이 높습니다. 매집보다는 헤지·차익 거래에 가까운 구성입니다.`,
                `${why} Overall size was ordinary, but the sell side dominated within it — a mix that reads closer to hedging or arbitrage than to accumulation.`,
                `${why} 全体の規模は平常水準ですが、その中で売り側の比率が高い構成です。買い集めよりヘッジ・裁定に近い形です。`),
        };
    }
    if (sb === 'low' && sp != null) {
        return {
            tone: 'positive',
            headline: T(lang,
                `장외 물량 중 공매도는 ${shortTxt(sp)}에 그쳤습니다`,
                `Only ${shortTxt(sp)} of the off-exchange volume was short`,
                `場外出来高のうち空売りは${shortTxt(sp)}にとどまりました`),
            detail: T(lang,
                `${why} 규모는 평소 수준이지만, 그 안에서 파는 쪽 비중이 낮습니다. 급하게 모으는 모양은 아니어도 매도 압력이 크지 않았다는 뜻입니다.`,
                `${why} Size was ordinary, but the sell side was light within it — not aggressive accumulation, yet no real selling pressure either.`,
                `${why} 規模は平常水準ですが、その中で売り側は軽めです。急いで集める形ではないものの、売り圧力も大きくなかったということです。`),
        };
    }

    // ══ ⑤ 전부 평범
    return {
        tone: 'neutral',
        headline: T(lang,
            `장외 비중 ${d.pct.toFixed(1)}% — 평소 수준입니다`,
            `${d.pct.toFixed(1)}% off-exchange — a normal session`,
            `場外比率${d.pct.toFixed(1)}% — 平常水準です`),
        detail: T(lang,
            `${why} 비중도 물량도 이 종목의 평소 범위 안입니다. 오늘은 특별히 읽어 낼 것이 없습니다.`,
            `${why} Both the share and the size sat inside this name's usual range. Nothing unusual to read today.`,
            `${why} 比率も出来高もこの銘柄の通常範囲内です。本日は特に読み取るものはありません。`),
    };
}
