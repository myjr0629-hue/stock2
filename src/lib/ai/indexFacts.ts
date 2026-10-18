/**
 * 뉴스 요약(news-digest) AI 문구의 «지수 이름 + 숫자 = 원천 값» — 순수 함수만(네트워크·Redis 없음).
 *
 * ★2026-10-18 감사 P1-6: 프롬프트 시장 데이터가 «NASDAQ 100: 29392 (-2.50%) | S&P 500: 7704 (-1.11%)» 였다.
 *   7704 는 선물 ES=F(macro.factors.spx.symbolUsed), 29392 는 NQ=F — 모델은 그대로 «S&P 500 -1.11%»라고 썼다.
 *   화면 지수 줄(/api/market/index-close = ^GSPC 현물 종가)은 7659.44 (-1.09%) — 같은 화면에서 45p 어긋났다.
 * 고침 두 겹:
 *   ① 입력 — 지수는 현물(^GSPC·^IXIC)로 주고, 선물은 «futures (ES=F/NQ=F)»라고 이름을 붙인다(buildIndexFacts·indexContextParts).
 *   ② 출구 — 문장에 «지수 이름 + 숫자(% 또는 지수 값)»가 있고 원천 값과 다르면 거절(indexClaimProblems·guardIndexClaims).
 *      이름에 «선물/futures/先物»이 붙은 숫자는 선물 값과, 붙지 않은 숫자는 현물 값과 대조한다. 기사 원문의 같은 지수·종류·방향인 숫자는 허용한다.
 * 호출자(route)가 거절된 항목을 내보내지 않는다(틀린 문장보다 빈칸이 낫다 — newsYearGuard·amountGuard 와 같은 방식).
 */

export type IndexKey = 'spx' | 'ndx' | 'comp';
export type IndexKind = 'spot' | 'futures';
export interface IndexFact { key: IndexKey; kind: IndexKind; level: number; chgPct: number; symbol: string }

type SpotQuote = { price?: number | null; changePct?: number | null } | null | undefined;
type MacroFactor = { level?: number | null; chgPct?: number | null; symbolUsed?: string | null } | null | undefined;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 현물(index-close: spx=^GSPC · nasdaq=^IXIC 종합) + macro.factors(선물)에서 사실 목록을 만든다. 없는 것은 넣지 않는다. */
export function buildIndexFacts(
    spot: { spx?: SpotQuote; nasdaq?: SpotQuote } | null | undefined,
    macro: { spx?: MacroFactor; nasdaq100?: MacroFactor } | null | undefined,
): IndexFact[] {
    const out: IndexFact[] = [];
    if (fin(spot?.spx?.price) && fin(spot?.spx?.changePct)) out.push({ key: 'spx', kind: 'spot', level: spot!.spx!.price!, chgPct: spot!.spx!.changePct!, symbol: '^GSPC' });
    else if (fin(macro?.spx?.level) && fin(macro?.spx?.chgPct) && /=F$/.test(String(macro?.spx?.symbolUsed || ''))) {
        out.push({ key: 'spx', kind: 'futures', level: macro!.spx!.level!, chgPct: macro!.spx!.chgPct!, symbol: String(macro!.spx!.symbolUsed) });
    }
    if (fin(spot?.nasdaq?.price) && fin(spot?.nasdaq?.changePct)) out.push({ key: 'comp', kind: 'spot', level: spot!.nasdaq!.price!, chgPct: spot!.nasdaq!.changePct!, symbol: '^IXIC' });
    if (fin(macro?.nasdaq100?.level) && fin(macro?.nasdaq100?.chgPct) && /=F$/.test(String(macro?.nasdaq100?.symbolUsed || ''))) {
        out.push({ key: 'ndx', kind: 'futures', level: macro!.nasdaq100!.level!, chgPct: macro!.nasdaq100!.chgPct!, symbol: String(macro!.nasdaq100!.symbolUsed) });
    }
    return out;
}

const sgn = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const NAME: Record<IndexKey, Record<IndexKind, string>> = {
    spx: { spot: 'S&P 500 index', futures: 'S&P 500 futures' },
    comp: { spot: 'NASDAQ Composite index', futures: 'NASDAQ Composite futures' },
    ndx: { spot: 'Nasdaq-100 index', futures: 'Nasdaq-100 futures' },
};

/** 프롬프트 <market_data> 의 지수 줄 — 현물은 «index», 선물은 «futures (심볼)». 선물 값에 지수 이름만 붙이지 않는다. */
export function indexContextParts(facts: IndexFact[]): string[] {
    const order: Array<[IndexKey, IndexKind]> = [['spx', 'spot'], ['spx', 'futures'], ['comp', 'spot'], ['ndx', 'futures']];
    const parts: string[] = [];
    for (const [key, kind] of order) {
        const f = facts.find((x) => x.key === key && x.kind === kind);
        if (!f) continue;
        parts.push(kind === 'spot'
            ? `${NAME[key].spot}: ${f.level.toFixed(2)} (${sgn(f.chgPct)})`
            : `${NAME[key].futures} (${f.symbol}): ${f.level.toFixed(0)} (${sgn(f.chgPct)})`);
    }
    return parts;
}

// ── 출구 검사 ────────────────────────────────────────────────────────────────

const NAME_RE = /(S&P\s?500|S&P|SPX|에스앤피(?:\s?500)?)|(Nasdaq[\s-]*Composite|나스닥\s*종합|ナスダック総合)|(Nasdaq[\s-]*100|NDX|나스닥\s*100|ナスダック\s*100)|(Nasdaq|나스닥|ナスダック)/gi;
const FUTURES_NEAR = /^.{0,6}?(?:futures|선물|先物)/i;
const FUTURES_BEFORE = /(?:futures\s+(?:on|for|tracking)\s+(?:the\s+)?|e-?mini\s*)$/i;
const MOVE_WORD = /(fell|fall|falls|drop|dropped|slid|slide|slump|sank|down|lost|lose|declin|retreat|gain|rose|rise|rises|up|climb|surge|jump|advanc|rall|tumbl|off\b|lower|higher|하락|상승|내린|내렸|오른|올랐|급락|급등|떨어|올라|밀렸|마감|下落|上昇|下げ|上げ|安|高|反落|続落|続伸|%\s*(?:down|up))/i;
const PERIOD_WORD = /(ytd|year|week|month|quarter|since|companies|earnings|yield|올해|연초|주간|이번 주|월간|분기|기업|실적|수익률|年初|今年|今週|月間|四半期|企業|業績|利回り|목표|target|forecast|전망|予想|目標)/i;
const MOVE_DOWN = /\b(?:fell|falls?|drop\w*|slid\w*|slump\w*|sank|down|lost|lose\w*|declin\w*|retreat\w*|tumbl\w*|lower)\b|하락|내린|내렸|급락|떨어|밀렸|下落|下げ|反落|続落|安/gi;
const MOVE_UP = /\b(?:gain\w*|rose|ris[ei]\w*|up|climb\w*|surge\w*|jump\w*|advanc\w*|rall\w*|higher)\b|상승|오른|올랐|급등|올라|上昇|上げ|続伸|高/gi;

/** 해당 퍼센트에 가장 가까운 방향어만 읽는다(«fell to 7,659, down 1.09%» 등). */
function moveDirection(before: string, after: string): number | null {
    const directions: Array<{ sign: number; distance: number }> = [];
    for (const [re, sign] of [[MOVE_DOWN, -1], [MOVE_UP, 1]] as const) {
        for (const m of before.matchAll(re)) directions.push({ sign, distance: before.length - m.index! - m[0].length });
        for (const m of after.matchAll(re)) directions.push({ sign, distance: m.index! });
    }
    directions.sort((a, b) => a.distance - b.distance);
    if (!directions.length || (directions[1]?.distance === directions[0].distance && directions[1].sign !== directions[0].sign)) return null;
    return directions[0].sign;
}

const tolFor = (written: string) => { const i = written.indexOf('.'); const d = i < 0 ? 0 : written.length - i - 1; return 0.5 * Math.pow(10, -d) + 0.005; };
const normNum = (s: string) => s.replace(/,/g, '').replace(/^[+\-−–]/, '');

/** 숫자 목록은 이전 저장 형식과 호환. 면제에는 v2의 지수·종류·방향 근거만 쓴다. */
export function indexSourceNums(text: string | null | undefined): string[] {
    const s = String(text || '');
    const out = new Set<string>();
    for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s?%/g)) out.add(`${m[1]}%`);
    for (const m of s.matchAll(/(?<![\d.])(\d{1,3}(?:,\d{3})+|\d{4,5})(?:\.\d+)?(?![\d])/g)) out.add(normNum(m[0]));
    for (const w of claimWindows(s)) {
        for (const p of percentClaims(w.win)) out.add(sourceToken(w, 'pct', p.value, p.direction));
        for (const p of w.win.matchAll(LEVEL_RE)) {
            const before = w.win.slice(0, p.index);
            const after = w.win.slice(p.index! + p[0].length);
            if (PERIOD_WORD.test(before) || /^\s?(?:년|年|월|月|일|日)/.test(after)) continue;
            out.add(sourceToken(w, 'level', Number(normNum(p[0])), moveDirection(before, after)));
        }
    }
    return [...out];
}

function candidatesFor(facts: IndexFact[], grp: number, futures: boolean): IndexFact[] {
    const keys: IndexKey[] = grp === 1 ? ['spx'] : grp === 2 ? ['comp'] : grp === 3 ? ['ndx'] : ['comp', 'ndx'];
    return facts.filter((f) => keys.includes(f.key) && f.kind === (futures ? 'futures' : 'spot'));
}

type ClaimWindow = { start: number; end: number; grp: number; futures: boolean; win: string };
const LEVEL_RE = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d{4,5})(\.\d+)?(?![\d%])/g;

/** 같은 지수의 쉼표 뒤 보충 설명은 이어 읽고, 다른 주어로 넘어가는 절은 자른다. */
function claimWindows(t: string): ClaimWindow[] {
    const mentions: Array<{ start: number; end: number; grp: number }> = [];
    NAME_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NAME_RE.exec(t))) {
        const grp = [1, 2, 3, 4].find((g) => m![g] !== undefined) || 4;
        mentions.push({ start: m.index, end: m.index + m[0].length, grp });
    }
    const windows: ClaimWindow[] = [];
    mentions.forEach((mn, i) => {
        // «S&P 500 과 나스닥은 1.1%·2.3% …» 처럼 이름이 붙어 나열되면 숫자 짝을 알 수 없어 판정하지 않는다
        const next = mentions[i + 1], prev = mentions[i - 1];
        if ((next && next.start - mn.end <= 8) || (prev && mn.start - prev.end <= 8)) return;
        let win = t.slice(mn.end, next?.start);
        // 절이 바뀌면 다른 자산(VIX·금리 등)의 수치일 수 있다. 소수점·천 단위 쉼표는 보존한다.
        const stop = win.search(/[;；。！？\n]|[.!?](?=\s|$)|[,、](?!\d|\s*(?:down|up|off|lower|higher|at|to)\b)|\s+(?:and|while|but|whereas|as)\s+|(?:했고|했으며|했지만|하는 반면)\s*|(?<=(?:下落|上昇|下げ|上げ)し)(?=[^\d\s])/i);
        if (stop >= 0) win = win.slice(0, stop);
        const futures = FUTURES_NEAR.test(win) || FUTURES_BEFORE.test(t.slice(Math.max(0, mn.start - 16), mn.start));
        windows.push({ ...mn, futures, win });
    });
    return windows;
}

function percentClaims(win: string) {
    const claims: Array<{ written: string; value: number; direction: number | null; signed: number | null }> = [];
    for (const p of win.matchAll(/([+\-−–]?)\s?(\d+(?:\.\d+)?)\s?%/g)) {
        const before = win.slice(0, p.index);
        const after = win.slice(p.index! + p[0].length, p.index! + p[0].length + 12);
        if (!(p[1] || MOVE_WORD.test(before) || MOVE_WORD.test(after.slice(0, 6)))) continue;
        if (PERIOD_WORD.test(before) || PERIOD_WORD.test(after)) continue;
        const value = Number(p[2]);
        if (!Number.isFinite(value)) continue;
        const direction = p[1] ? (/[-−–]/.test(p[1]) ? -1 : 1) : moveDirection(before, after);
        claims.push({ written: p[2], value, direction, signed: direction === null ? null : direction * value });
    }
    return claims;
}

function sourceToken(w: ClaimWindow, measure: 'pct' | 'level', value: number, direction: number | null): string {
    return `idx:v2:${w.grp}:${w.futures ? 'futures' : 'spot'}:${measure}:${value}:${direction ?? '?'}`;
}

function sourceAllows(src: Set<string>, w: ClaimWindow, measure: 'pct' | 'level', value: number, direction: number | null): boolean {
    // 방향을 쓴 요약은 같은 방향의 원문만 면제한다. 방향 없는 수준 표기는 원문의 방향을 생략할 수 있다.
    const directions = direction === null ? [null, -1, 1] : [direction];
    return directions.some(d => src.has(sourceToken(w, measure, value, d)));
}

/** 한 문장(칸)의 지수 이름 + 숫자 주장 중 원천과 다른 것의 사유 목록(비면 통과) */
export function indexClaimProblems(text: string | null | undefined, facts: IndexFact[] | null | undefined, srcNums: string[] | null | undefined = []): string[] {
    const t = typeof text === 'string' ? text : '';
    if (!t) return [];
    const fs = facts || [];
    const src = new Set(srcNums || []);
    const bad: string[] = [];
    for (const mn of claimWindows(t)) {
        const { futures, win } = mn;
        const cands = candidatesFor(fs, mn.grp, futures);
        if (futures && cands.length === 0) continue;                 // 프롬프트에 없던 선물 값 — 판정 근거가 없다

        // ① 퍼센트 — 움직임을 말하는 퍼센트만(부호가 있거나 오르내림 말이 앞에 있고, 기간·기업 수 같은 말이 없을 때)
        for (const p of percentClaims(win)) {
            if (sourceAllows(src, mn, 'pct', p.value, p.direction)) continue;
            const tol = tolFor(p.written);
            const ok = cands.some((f) => (p.signed === null ? Math.abs(p.value - Math.abs(f.chgPct)) : Math.abs(p.signed - f.chgPct)) <= tol);
            if (!ok) bad.push(`index-pct:${m0(t, mn)} ${p.signed ?? p.value}%≠${cands.map((f) => sgn(f.chgPct)).join('/') || '(원천 값 없음)'}`);
        }
        // ② 지수 값 — 원천 지수 값 ±25% 안의 수. 옛 캐시(사실 없음)는 수준 표현이 명확할 때만 검사한다.
        const known = fs.filter((f) => candidatesFor([f], mn.grp, true).length || candidatesFor([f], mn.grp, false).length);
        for (const p of win.matchAll(LEVEL_RE)) {
            const before = win.slice(0, p.index);
            const after = win.slice((p.index || 0) + p[0].length);
            if (/^\s?(?:년|年|월|月|일|日)/.test(after)) continue;
            if (PERIOD_WORD.test(before)) continue;
            const num = Number(`${p[1].replace(/,/g, '')}${p[2] || ''}`);
            if (known.length) {
                if (!known.some((f) => Math.abs(num - f.level) / f.level <= 0.25)) continue;
            } else {
                const levelClaim = /\b(?:at|to|near|around|above|below|under|over)\s*$/i.test(before)
                    || /^\s*(?:부근|선(?:에|을|으로|에서)?|포인트|pt\b|points?\b|まで|付近|台|で)/i.test(after);
                if (!levelClaim || num < 3000 || num > 99999) continue;
            }
            if (sourceAllows(src, mn, 'level', num, moveDirection(before, after))) continue;
            const ok = cands.some((f) => Math.abs(num - f.level) <= Math.max(tolFor(`${p[1]}${p[2] || ''}`), f.level * 0.001));
            if (!ok) bad.push(`index-level:${m0(t, mn)} ${p[0]}≠${cands.map((f) => f.level.toFixed(2)).join('/') || '(원천 값 없음)'}`);
        }
    }
    return bad;
}
const m0 = (t: string, mn: { start: number; end: number }) => t.slice(mn.start, mn.end);

const FIELDS = ['headline', 'summaryKR', 'summaryEN', 'summaryJP', 'analysisKR', 'analysisEN', 'analysisJP'] as const;

/**
 * 뉴스 항목 한 건 검사 — 틀린 지수 주장이 있으면 사유(문자열), 없으면 null.
 * facts: 항목이 만들어질 때 프롬프트에 준 사실(저장해 둔다). undefined 면 «사실이 저장되지 않은 옛 항목»(선물 값을 지수로 쓰던 시절) — 사실 0건으로 대조해 원문에 없는 지수 숫자는 거절.
 */
export function guardIndexClaims(item: Partial<Record<(typeof FIELDS)[number], string>>, facts: IndexFact[] | undefined, srcNums: string[] | undefined): string | null {
    for (const f of FIELDS) {
        const p = indexClaimProblems(item[f], facts ?? [], srcNums ?? []);
        if (p.length) return `${f}: ${p[0]}`;
    }
    return null;
}
