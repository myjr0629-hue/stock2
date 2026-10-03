/**
 * UC(언더커런트) 카드 문구 — «글 속 콜·풋 배수와 가격대 거리·방향 = 카드의 자금 숫자». 순수 함수만.
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
        re: /(맥스\s?페인|최대\s?고통(?:\s?가격)?|옵션\s?자석(?:\s?가격)?|콜\s?월|콜\s?벽|풋\s?플로어|풋\s?바닥)([^.。!?\n]{0,14}?)(?:보다|에서)\s*(?:약\s*)?\$?(\d+(?:\.\d+)?)\s*(달러|%)\s*(?:정도\s*|가량\s*)?(위|아래|높|낮|밑|상회|하회)/g,
        num: 3, unit: 4, dir: 5, level: 1, upWords: /^(위|높|상회)$/,
    }],
    ja: [{
        re: /(マックスペイン|最大苦痛(?:価格)?|磁石価格|コールウォール|プットフロア)([^。!?\n]{0,12}?)(?:より|から)\s*(?:約)?\$?(\d+(?:\.\d+)?)\s*(ドル|%)\s*(上|下|高|低)/g,
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

/** 카드 문장 한 줄의 숫자 문제(비면 통과) */
export function ucNumberProblems(loc: UcLocale, text: string | null | undefined, m: UcMoney | null | undefined): string[] {
    if (typeof text !== 'string' || !text || !m) return [];
    return [...checkUcMultipliers(loc, text, m), ...checkUcLevels(loc, text, m)];
}
