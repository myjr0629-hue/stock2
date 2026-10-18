/**
 * UC(언더커런트) 카드 문구 — «글 속 콜·풋 배수·P/C·스퀴즈 점수와 가격대 거리·방향 = 카드의 자금 숫자». 순수 함수만.
 *
 * ★2026-10-04 운영 실측(카드 12 × 3개 국어 = 36행 중 3행 불일치):
 *   en AAPL «the stock sits $4 below max pain» — 카드 값 price 333.69 · maxPain 330 → 실제로는 $3.69 «위»(방향 반대)
 *   ko COIN «콜이 풋의 5.9배» — 거래량 콜÷풋 5.75(→5.8) · ko PLTR «2.9배» — 2.97(→3.0)
 *   (같은 피드 재측정에서 en AMZN «$4 below the call wall at $260» — 실제 $8.48 아래.)
 * 기존 출구 검사는 금액 자릿수(amountGuard)와 풋·콜 «방향어» 모순(enforceLean)뿐이었다 — 배수 값·가격대 거리/방향은 안 봤다.
 * 판정(인벤토리 기준과 같다):
 *   배수 — 주어(콜/풋)에 맞는 실제 비율(거래량·포지션 둘 중 하나) ±0.05. 정수(«약 3배»)·한 자리(«5.8배») 반올림 표기는 그 자릿수만큼 허용.
 *          «2배 이상»·«more than 2x» 는 하한으로 본다.
 *   가격대 — «$N 위/아래»의 방향은 price−수준의 부호와 같아야 하고, 거리는 ±max($0.6, 5%). «N% 위/아래»는 ±max(0.35%p, 25%).
 *   수준 값(«call wall at $260»)은 ±1.5%.
 *   직접 기재한 P/C·스퀴즈 점수 — 표시한 소수 자릿수로 반올림한 값과 대조(0 포함). 거래량 P/C 는 volumePcr 의 역수.
 * 틀리면 호출자(shared.enforceLean)가 moneyRead·tickerRead 를 코드가 만든 사실 문장(factSentence)으로 바꾼다.
 */

export type UcLocale = 'ko' | 'en' | 'ja';
export interface UcMoney {
    price?: number | null;
    maxPain?: number | null;
    callWall?: number | null;
    putFloor?: number | null;
    /** 포지션(OI) 풋÷콜 */
    oiPcr?: number | null;
    /** ⚠ 이름과 반대로 거래량 «콜÷풋»(api/live/ticker: callVol/putVol) */
    volumePcr?: number | null;
    squeezeScore?: number | null;
}

const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const decimalsOf = (s: string) => { const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
const multTol = (written: string) => Math.max(0.05, 0.5 * Math.pow(10, -decimalsOf(written)) + 0.005);

type Side = 'call' | 'put';
const sideOf = (w: string): Side => (/풋|プット|put/i.test(w) ? 'put' : 'call');

/** 주어÷상대 비율의 실제 후보 — 거래량(콜÷풋 = volumePcr)과 포지션(풋÷콜 = oiPcr) */
function ratioCandidates(m: UcMoney, subj: Side): number[] {
    const vol = pos(m.volumePcr);
    const oi = pos(m.oiPcr);
    const c = subj === 'call' ? [vol, oi ? 1 / oi : null] : [vol ? 1 / vol : null, oi];
    return c.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0);
}

const MULT: Record<UcLocale, Array<{ re: RegExp; subj: number; other: number; num: number }>> = {
    ko: [{ re: /(콜|풋)\s*(?:옵션)?\s*(?:거래량|포지션|건수)?\s*[이가은는]\s*(풋|콜)\s*(?:옵션)?\s*(?:의|보다|대비)\s*(?:약\s*|거의\s*)?(\d+(?:\.\d+)?)\s*배/g, subj: 1, other: 2, num: 3 }],
    ja: [{ re: /(コール|プット)(?:オプション)?(?:の取引量|の建玉|の出来高)?が(プット|コール)(?:オプション)?の(?:約)?(\d+(?:\.\d+)?)倍/g, subj: 1, other: 2, num: 3 }],
    en: [
        { re: /\b(calls?|puts?)\s+(?:outnumber(?:ed|ing|s)?|outweigh(?:ed|ing|s)?|outpac(?:e|ed|ing|es))\s+(puts?|calls?)\s+(?:by\s+)?(?:about\s+|roughly\s+|nearly\s+|almost\s+|more than\s+|over\s+)?(\d+(?:\.\d+)?)\s*(?:x\b|times|to\s*1|-to-1|:1)/gi, subj: 1, other: 2, num: 3 },
        { re: /\b(\d+(?:\.\d+)?)\s*(?:x|times)\s+(?:as many\s+|more\s+)?(calls?|puts?)\s+(?:than|vs\.?|versus|as|to)\s+(puts?|calls?)/gi, subj: 2, other: 3, num: 1 },
    ],
};
const LOWER_BOUND_AFTER = /^\s*(?:이상|넘|以上|超|plus)/i;
const LOWER_BOUND_BEFORE = /(more than|over|at least|upwards of)\s*$/i;

/** 배수 문장 검사 — 틀린 이유 목록 */
export function checkUcMultipliers(loc: UcLocale, text: string, m: UcMoney): string[] {
    const bad: string[] = [];
    for (const p of MULT[loc] || []) {
        p.re.lastIndex = 0;
        let x: RegExpExecArray | null;
        while ((x = p.re.exec(text))) {
            const subj = sideOf(x[p.subj]);
            if (subj === sideOf(x[p.other])) continue;
            const written = x[p.num];
            const n = Number(written);
            if (!Number.isFinite(n) || n <= 0) continue;
            const cands = ratioCandidates(m, subj);
            if (!cands.length) continue;
            const end = x.index + x[0].length;
            const lower = LOWER_BOUND_AFTER.test(text.slice(end, end + 6)) || LOWER_BOUND_BEFORE.test(text.slice(Math.max(0, x.index - 14), x.index) + x[0].slice(0, x[0].indexOf(written)));
            const tol = multTol(written);
            const ok = cands.some((r) => (lower ? r >= n - tol : Math.abs(r - n) <= tol));
            if (!ok) bad.push(`multiplier:${subj}/${subj === 'call' ? 'put' : 'call'} ${written}≠${cands.map((r) => r.toFixed(2)).join('|')}`);
        }
    }
    return bad;
}

// ★2026-10-08 금융 공통어는 번역하지 않는다(lib/ai/commonTerms) — 한·일 글이 «Max Pain보다 $4 위»처럼 영어 이름을 써도 같은 검사를 받아야 한다(옛 소리 표기와 함께 둔다)
type LevelName = 'maxPain' | 'callWall' | 'putFloor';
const levelOf = (w: string): LevelName =>
    /call|콜|コール/i.test(w) ? 'callWall' : /put|풋|プット/i.test(w) ? 'putFloor' : 'maxPain';

const LEVEL_EN = '(max(?:imum)?[\\s-]?pain(?:\\s+(?:level|price|strike))?|call wall|put floor|options?[\\s-]magnet|magnet price)';
const DIST: Record<UcLocale, Array<{ re: RegExp; num: number; unit: number | null; dir: number; level: number; upWords: RegExp }>> = {
    en: [{
        re: new RegExp(`(\\$)?(\\d+(?:\\.\\d+)?)(%)?\\s+(above|below|under|beneath|over|short of)\\s+(?:the\\s+|its\\s+|their\\s+)?(?:stock's\\s+)?${LEVEL_EN}`, 'gi'),
        num: 2, unit: 3, dir: 4, level: 5, upWords: /^(above|over)$/i,
    }],
    ko: [{
        re: /(맥스\s?페인|최대\s?고통(?:\s?가격)?|옵션\s?자석(?:\s?가격)?|콜\s?월|콜\s?벽|풋\s?플로어|풋\s?바닥|[Mm]ax(?:imum)?[\s-]?[Pp]ain|[Cc]all[\s-]?[Ww]all|[Pp]ut[\s-]?(?:[Ff]loor|[Ww]all))([^.。!?\n]{0,14}?)(?:보다|에서)\s*(?:약\s*)?\$?(\d+(?:\.\d+)?)\s*(달러|%)\s*(?:정도\s*|가량\s*)?(위|아래|높|낮|밑|상회|하회)/g,
        num: 3, unit: 4, dir: 5, level: 1, upWords: /^(위|높|상회)$/,
    }],
    ja: [{
        re: /(マックスペイン|最大苦痛(?:価格)?|磁石価格|コールウォール|プットフロア|[Mm]ax(?:imum)?[\s-]?[Pp]ain|[Cc]all[\s-]?[Ww]all|[Pp]ut[\s-]?(?:[Ff]loor|[Ww]all))([^。!?\n]{0,12}?)(?:より|から)\s*(?:約)?\$?(\d+(?:\.\d+)?)\s*(ドル|%)\s*(上|下|高|低)/g,
        num: 3, unit: 4, dir: 5, level: 1, upWords: /^(上|高)$/,
    }],
};
const LEVEL_VALUE_AFTER = /^\s*(?:\(|（)?\s*(?:at|of|near|around|=)?\s*\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/i;
const REVERSED_SUBJECT = /(주가|현재가|株価|価格)/;

/** «$N / N% 위·아래 (가격대)» 문장 검사 — 방향·거리·수준 값 */
export function checkUcLevels(loc: UcLocale, text: string, m: UcMoney): string[] {
    const bad: string[] = [];
    const price = pos(m.price);
    if (!price) return bad;
    for (const p of DIST[loc] || []) {
        p.re.lastIndex = 0;
        let x: RegExpExecArray | null;
        while ((x = p.re.exec(text))) {
            if (loc !== 'en' && REVERSED_SUBJECT.test(x[2] || '')) continue;   // «맥스페인이 주가보다 …» — 주어가 거꾸로
            const name = levelOf(x[p.level]);
            const level = pos(m[name]);
            if (!level) continue;
            const written = x[p.num];
            const n = Number(written);
            if (!Number.isFinite(n)) continue;
            const isPct = !!(p.unit && x[p.unit] && x[p.unit].includes('%'));
            if (loc === 'en' && !isPct && !x[1]) continue;                    // «4 below» 처럼 단위 없는 숫자는 판정하지 않는다
            const diff = price - level;
            const saysAbove = p.upWords.test(x[p.dir]);
            const dist = Math.abs(diff);
            if (dist / price > 0.001 && (diff > 0) !== saysAbove) {
                bad.push(`direction:${name} «${x[0].trim()}» — 실제 ${diff > 0 ? '위' : '아래'} $${dist.toFixed(2)}`);
                continue;
            }
            if (isPct) {
                const pct = (dist / price) * 100;
                if (Math.abs(pct - n) > Math.max(0.35, pct * 0.25)) bad.push(`distance:${name} ${n}%≠${pct.toFixed(2)}%`);
            } else if (Math.abs(dist - n) > Math.max(0.6, dist * 0.05)) {
                bad.push(`distance:${name} $${n}≠$${dist.toFixed(2)}`);
            }
            if (loc === 'en') {
                const end = x.index + x[0].length;
                const lv = text.slice(end, end + 16).match(LEVEL_VALUE_AFTER);
                if (lv) {
                    const v = Number(lv[1].replace(/,/g, ''));
                    if (Number.isFinite(v) && Math.abs(v - level) / level > 0.015) bad.push(`level:${name} $${v}≠$${level}`);
                }
            }
        }
    }
    return bad;
}

// Direct metric claims are distinct from «calls outnumber puts N times».
// A bare P/C means OI; a volume qualifier means put/call = 1 / volumePcr.
const PCR_LABEL = /(?:\bP\s*[/／]\s*C\b|\bPCR\b|\bput\s*[/÷-]\s*call\b|풋\s*[/÷·]\s*콜|プット\s*[/÷・]\s*コール)/gi;
const SQUEEZE_LABEL = /(?:\bsqueeze\s+score\b|스퀴즈\s*점수|スクイーズ\s*スコア)/gi;
// 이름 바로 뒤 괄호 설명(«P/C(풋÷콜) 1.40»·«스퀴즈 점수(100점 만점) 80») 은 건너뛰고 그 뒤 숫자를, 괄호 속 숫자(«P/C (1.40)»)는 그 숫자를 읽는다 — 괄호 안 글은 [1](기준 판정용), 숫자는 [2] (10/18 관문 10181910)
const METRIC_VALUE = /^\s*(?:[(（]([^()（）]{0,24})[)）])?\s*(?:ratio|비율|比率|レシオ)?\s*(?:는|은|이|가|は|が|[:=：]|is|was|of|at)?\s*[(（]?\s*(?:약\s*|約\s*|about\s+|roughly\s+)?([+-]?\d+(?:\.\d+)?)/i;

function checkOptionClaims(text: string, m: UcMoney): string[] {
    const bad: string[] = [];
    for (const [label, kind] of [[PCR_LABEL, 'pcr'], [SQUEEZE_LABEL, 'squeeze']] as const) {
        for (const x of text.matchAll(label)) {
            const value = text.slice(x.index! + x[0].length).match(METRIC_VALUE);
            if (!value) continue;
            let actual = kind === 'pcr' ? m.oiPcr : m.squeezeScore;
            if (kind === 'pcr') {
                // Inspect only the current clause, taking the nearest source qualifier.
                // This also accepts factSentence's OI + volume clauses independently.
                const clause = (text.slice(0, x.index).split(/[;。!?\n、,]|\.(?!\d)/).pop() || '') + ' ' + (value[1] || '');
                const scopes = [...clause.matchAll(/volume|거래량|出来高|取引量|open\s+(?:interest|positions)|\bOI\b|포지션|미결제|建玉/gi)];
                const scope = scopes[scopes.length - 1]?.[0] || '';
                if (/volume|거래량|出来高|取引量/i.test(scope)) {
                    const vol = pos(m.volumePcr);
                    actual = vol == null ? null : 1 / vol;
                }
            }
            // Match existing numeric guards: compare only with measured evidence;
            // zero is a measurement, while null/NaN/Infinity are unavailable.
            if (typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0) continue;
            const written = value[2];
            const tolerance = 0.5 * Math.pow(10, -decimalsOf(written)) + 1e-9;
            if (Math.abs(Number(written) - actual) > tolerance) bad.push(`option:${kind} ${written}≠${actual}`);
        }
    }
    return bad;
}

/** 글이 P/C·스퀴즈 점수를 «숫자로» 직접 적었는가(값 대조 없이 — 값이 없어진 지표의 옛 숫자를 찾는 데 쓴다) */
export function citedOptionMetrics(text: string | null | undefined): { pcr: boolean; squeeze: boolean } {
    const out = { pcr: false, squeeze: false };
    if (typeof text !== 'string' || !text) return out;
    for (const [label, kind] of [[PCR_LABEL, 'pcr'], [SQUEEZE_LABEL, 'squeeze']] as const) {
        for (const x of text.matchAll(label)) if (METRIC_VALUE.test(text.slice(x.index! + x[0].length))) out[kind] = true;
    }
    return out;
}

/** 카드 문장 한 줄의 숫자 문제(비면 통과) */
export function ucNumberProblems(loc: UcLocale, text: string | null | undefined, m: UcMoney | null | undefined): string[] {
    if (typeof text !== 'string' || !text || !m) return [];
    return [...checkUcMultipliers(loc, text, m), ...checkUcLevels(loc, text, m), ...checkOptionClaims(text, m)];
}
