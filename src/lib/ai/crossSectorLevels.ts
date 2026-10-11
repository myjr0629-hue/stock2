/**
 * 크로스섹터 브리프 입력의 «지수 ETF 옵션 구조 레벨» 블록 (2026-10-11) — SPY·QQQ·IWM 의 Put Floor · Call Wall · Max Pain · Gamma Flip.
 *
 * 왜: 10/11 수리(lib/ai/keyLevels)로 keyLevels 를 «입력에 찍힌 수준만» 쓰게 막았더니, 입력에 지수의 지지·저항이 없어
 *   결과가 [VIX3M 17.77] 한 칸이거나 빈 배열이었다 → 웹 «가격 범위 바»(2칸 이상 필요)가 사라지고 앱 «핵심 레벨» 칩은 1개만 남았다.
 * 처방: 지어내지 않고 «진짜 레벨»을 입력에 넣는다. 레벨은 옵션 구조 한 문(structure:v2:{T} 판본 → levelsFromStructure)에서만 읽는다
 *   (화면의 Command·Flow·워치리스트와 같은 값 — 같은 정의 게이트). 계산하지 않는다.
 *
 * 단위: 이 레벨은 ETF 한 주 가격이다(SPY 785 ≠ S&P 500 지수 7,8xx). 지수 포인트로 바꿔 쓰지 않는다 — 프롬프트가 금지하고,
 *   웹 범위 바의 현재가 표시는 같은 ETF 의 가격(optionLevels[].spot)을 쓴다.
 * Lambda 판(CommonJS): scripts/lambda-cross-sector/indexLevels.js — 같은 블록·같은 판정. tests/crossSectorLevels.test.ts 가 어긋남을 막는다.
 * 순수 함수만(I/O 없음).
 */
import { levelsFromStructure, type OptionLevels } from '@/lib/optionLevelGate';
import { enforceKeyLevels, isGroundedLevel, orderKeyLevels, type KeyLevel } from './keyLevels';

export const INDEX_LEVEL_TICKERS = ['SPY', 'QQQ', 'IWM'] as const;

/** 판본이 이보다 오래되면 쓰지 않는다 — 판본 TTL 72시간 + 하루. 오래된 레벨을 «오늘 레벨»처럼 보이지 않게. */
export const INDEX_LEVEL_MAX_AGE_MS = 96 * 3600_000;

export interface IndexLevelRow {
    ticker: string;
    /** 판본 기준가(ETF 한 주 가격) */
    spot: number;
    expiration: string | null;
    /** 체인(미결제약정) 날짜 — 공급사가 안 주면 null */
    chainDate: string | null;
    /** 판본이 계산된 시각(ms) */
    asOf: number | null;
    putFloor: number | null;
    callWall: number | null;
    maxPain: number | null;
    gammaFlip: number | null;
}

const posOrNull = (x: unknown): number | null => {
    const n = typeof x === 'number' ? x : x == null || x === '' ? NaN : Number(x);
    return Number.isFinite(n) && n > 0 ? n : null;
};

const etDate = (ms: number): string => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** 레벨 한 벌(OptionLevels, 판본에서 읽은 것) → 행. 쓸 수 없으면 null(기준가 없음 · 너무 오래됨 · 네 값 모두 없음). */
export function indexLevelRow(ticker: string, lv: OptionLevels | null | undefined, nowMs: number): IndexLevelRow | null {
    if (!lv || lv.levelsSource !== 'structure') return null;
    const spot = posOrNull(lv.levelsSpot);
    if (spot == null) return null;
    const asOf = typeof lv.levelsAsOf === 'number' && Number.isFinite(lv.levelsAsOf) ? lv.levelsAsOf : null;
    if (asOf != null && nowMs - asOf > INDEX_LEVEL_MAX_AGE_MS) return null;
    const row: IndexLevelRow = {
        ticker: ticker.toUpperCase(),
        spot,
        expiration: lv.levelsExpiration || null,
        chainDate: lv.levelsChainDate || null,
        asOf,
        putFloor: posOrNull(lv.putFloor),
        callWall: posOrNull(lv.callWall),
        maxPain: posOrNull(lv.maxPain),
        gammaFlip: posOrNull(lv.gammaFlipLevel),
    };
    return row.putFloor == null && row.callWall == null && row.maxPain == null && row.gammaFlip == null ? null : row;
}

/** 저장된 판본({ data, timestamp }) → 행. 라우트는 levelsForExit 의 결과를 indexLevelRow 로 받고, 이 함수는 시험·하네스가 쓴다. */
export function indexLevelRowFromStored(ticker: string, stored: { data?: any; timestamp?: number } | null | undefined, nowMs: number): IndexLevelRow | null {
    if (!stored || !stored.data) return null;
    const lv = levelsFromStructure(stored.data);
    if (!lv) return null;
    return indexLevelRow(ticker, { ...lv, levelsAsOf: typeof stored.timestamp === 'number' ? stored.timestamp : null }, nowMs);
}

const numStr = (n: number): string => String(Number(n.toFixed(2)));

/** [이름, 값] — 프롬프트에 찍는 순서(아래 쪽 Put Floor → 위쪽 Call Wall → Max Pain → Gamma Flip) */
function pairsOf(r: IndexLevelRow): Array<[string, number]> {
    const out: Array<[string, number]> = [];
    if (r.putFloor != null) out.push(['Put Floor', r.putFloor]);
    if (r.callWall != null) out.push(['Call Wall', r.callWall]);
    if (r.maxPain != null) out.push(['Max Pain', r.maxPain]);
    if (r.gammaFlip != null) out.push(['Gamma Flip', r.gammaFlip]);
    return out;
}

export const LEVELS_BLOCK_TITLE = '## Index ETF Options Structure Levels';

/**
 * 프롬프트 블록 + 출구 필터의 근거 줄.
 *   block  = 모델이 읽는 글(날짜·기준가·만기 포함)
 *   ground = 근거 줄(«SPY Put Floor: 625 | …») — 날짜·기준가의 숫자는 «수준»의 근거로 쓰지 않으려고 뺀다.
 * 행이 없으면 둘 다 빈 문자열(프롬프트에 블록이 없다).
 */
export function buildLevelsBlock(rows: IndexLevelRow[]): { block: string; ground: string } {
    const usable = rows.filter((r) => pairsOf(r).length > 0);
    if (usable.length === 0) return { block: '', ground: '' };
    const lines: string[] = [];
    const ground: string[] = [];
    for (const r of usable) {
        const when = r.chainDate ? `open interest as of ${r.chainDate}` : r.asOf != null ? `computed ${etDate(r.asOf)}` : 'date n/a';
        const exp = r.expiration ? `; expiry ${r.expiration}` : '';
        const ps = pairsOf(r);
        lines.push(`- ${r.ticker} (price ${numStr(r.spot)}; ${when}${exp}): ${ps.map(([k, v]) => `${k}: ${numStr(v)}`).join(' | ')}`);
        ground.push(ps.map(([k, v]) => `${r.ticker} ${k}: ${numStr(v)}`).join(' | '));
    }
    const block = `${LEVELS_BLOCK_TITLE} (the app's options structure; strike prices per ETF share, NOT index points — never convert or rescale them)\n${lines.join('\n')}`;
    return { block, ground: ground.join('\n') };
}

/** 프롬프트에 끼우는 형태 — 블록이 있으면 앞에 빈 줄 하나, 없으면 빈 문자열 */
export function levelsPromptSection(block: string): string {
    return block ? `\n${block}` : '';
}

// ════════════════════════════════════════════════════════════════════════════
// 출구 — 모델이 쓴 keyLevels 를 입력의 실제 레벨과 맞춘다
// ════════════════════════════════════════════════════════════════════════════
const FIELD_OF: Record<string, 'putFloor' | 'callWall' | 'maxPain' | 'gammaFlip'> = { putfloor: 'putFloor', callwall: 'callWall', maxpain: 'maxPain', gammaflip: 'gammaFlip' };
const NAME_OF = { putFloor: 'Put Floor', callWall: 'Call Wall', maxPain: 'Max Pain', gammaFlip: 'Gamma Flip' } as const;
const LABEL_RE = /^\s*([A-Za-z]{2,5})\s+(put\s*floor|call\s*wall|max\s*pain|gamma\s*flip)\b/i;
function parseLevelLabel(label: unknown): { tk: string; field: keyof typeof NAME_OF } | null {
    const m = String(label || '').match(LABEL_RE);
    return m ? { tk: m[1].toUpperCase(), field: FIELD_OF[m[2].toLowerCase().replace(/\s+/g, '')] } : null;
}

/**
 * «라벨 ↔ 값» 대조 — 값이 입력에 있는 숫자여도(필터 통과) 라벨이 다른 레벨의 값이면 틀린 자료다(예: «SPY Put Floor 785» = Call Wall 의 값).
 * `<TICKER> <레벨 이름>` 라벨은 그 행의 그 필드 값과 같아야 남긴다. 행이 없거나 그 필드가 없으면 제거. 다른 모양의 라벨(VIX3M 등)은 건드리지 않는다.
 */
export function reconcileLabeledLevels(levels: KeyLevel[], rows: IndexLevelRow[]): { kept: KeyLevel[]; dropped: KeyLevel[] } {
    const kept: KeyLevel[] = [], dropped: KeyLevel[] = [];
    for (const l of levels) {
        const p = parseLevelLabel(l?.label);
        if (!p) { kept.push(l); continue; }
        const r = rows.find((x) => x.ticker === p.tk);
        const expected = r ? r[p.field] : null;
        (expected != null && isGroundedLevel(l, numStr(expected)) ? kept : dropped).push(l);
    }
    return { kept, dropped };
}

/**
 * 범위 바의 닻 — 입력에 같은 ETF 의 Put Floor·Call Wall 이 둘 다 있으면(SPY → QQQ → IWM 순) 그 둘이 keyLevels 맨 앞(Put Floor → Call Wall)에 온다.
 * 모델이 한쪽을 빠뜨렸으면 «입력에 찍힌 그 값 그대로» 채운다(새 숫자 없음). 짝이 있는 ETF 가 없으면 순서만 정리한다.
 */
export function anchorKeyLevels(levels: KeyLevel[], rows: IndexLevelRow[]): { levels: KeyLevel[]; added: number } {
    const list = orderKeyLevels(levels);
    for (const tk of INDEX_LEVEL_TICKERS) {
        const r = rows.find((x) => x.ticker === tk);
        if (!r || r.putFloor == null || r.callWall == null) continue;
        const find = (f: 'putFloor' | 'callWall') => list.find((l) => { const p = parseLevelLabel(l?.label); return p && p.tk === tk && p.field === f; });
        let added = 0;
        const mk = (f: 'putFloor' | 'callWall'): KeyLevel => { added++; return { label: `${tk} ${NAME_OF[f]}`, value: numStr(r[f] as number) }; };
        const pf = find('putFloor') || mk('putFloor');
        const cw = find('callWall') || mk('callWall');
        return { levels: [pf, cw, ...list.filter((l) => l !== pf && l !== cw)].slice(0, 4), added };
    }
    return { levels: list, added: 0 };
}

/**
 * 생성 출구 한 번에: ① 입력(매크로 시세 + 레벨 근거 줄)에 없는 칸 제거 ② 라벨↔값 불일치 제거 ③ 범위 바 닻·순서.
 * 제자리 수정. outlook 이 없으면 아무것도 하지 않는다. { dropped: 제거한 칸, added: 입력에서 채운 칸 }
 */
export function finalizeCrossSectorKeyLevels(structured: any, macroStr: string, rows: IndexLevelRow[]): { dropped: number; added: number } {
    if (!structured || typeof structured !== 'object' || !structured.outlook || typeof structured.outlook !== 'object') return { dropped: 0, added: 0 };
    const { ground } = buildLevelsBlock(rows);
    let dropped = enforceKeyLevels(structured, ground ? `${macroStr}\n${ground}` : macroStr);
    let lv: KeyLevel[] = Array.isArray(structured.outlook.keyLevels) ? structured.outlook.keyLevels : [];
    const rec = reconcileLabeledLevels(lv, rows);
    dropped += rec.dropped.length;
    const out = anchorKeyLevels(rec.kept, rows);
    structured.outlook.keyLevels = out.levels;
    return { dropped, added: out.added };
}
