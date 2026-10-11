// ★2026-10-11 크로스섹터 브리프 입력의 «지수 ETF 옵션 구조 레벨» — Lambda 판(CommonJS). 규칙·문구는 src/lib/ai/crossSectorLevels.ts 와 같다.
//
// 읽는 곳: 옵션 구조 «한 문»의 저장본 structure:v2:{T}({ data, timestamp }, 72시간) — 앱·웹의 Command·Flow·워치리스트가 읽는 바로 그 판본.
//   계산하지 않는다. 판본이 없거나 96시간보다 오래됐거나 기준가가 없으면 그 ETF 는 빼고(블록 없음 → 예전 규칙 그대로, 지어내지 않는다).
// 매핑 = src/lib/optionLevelGate.ts levelsFromStructure 의 복제(정의 게이트: 콜월 (S,1.2S] · 풋플로어 [0.8S,S) · 감마플립 ±15% · 맥스페인 ±35%, 감마플립은 누적 GEX 교차점만).
//   TS 판과 어긋나지 않게 tests/crossSectorLevels.test.ts 가 같은 저장본으로 두 구현을 대조한다.
// 순수 함수만(I/O 는 index.js).

const KEYLEVELS = require('./keyLevels');

const TICKERS = ['SPY', 'QQQ', 'IWM'];
const MAX_AGE_MS = 96 * 3600 * 1000;
const BANDS = { callWallMax: 1.2, putFloorMin: 0.8, gammaFlip: 0.15, maxPain: 0.35 };

const pos = (x) => {
    const n = typeof x === 'number' ? x : x == null || x === '' ? NaN : Number(x);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/** 분포(structure)에서 k 가 누적 GEX 부호가 바뀌는 자리인가 — optionLevelGate.isGammaCrossing 과 같다 */
function isGammaCrossing(st, k) {
    const ks = st && st.strikes, g = st && st.gexCum;
    if (!Array.isArray(g) || !Array.isArray(ks)) return false;
    let prev = 0, seen = false;
    for (let i = 0; i < ks.length; i++) {
        const cum = g[i];
        if (typeof cum !== 'number' || !Number.isFinite(cum)) continue;
        if (ks[i] === k) return seen && ((prev < 0 && cum >= 0) || (prev > 0 && cum <= 0));
        prev = cum; seen = true;
    }
    return false;
}

/** 구조 결과 → 네 값(정의 게이트 통과분). optionLevelGate.levelsFromStructure(+conformStructure+gateLevels) 와 같은 결과. 쓸 수 없으면 null. */
function levelsFromData(d) {
    if (!d || d.options_status !== 'OK') return null;
    const st = d.structure;
    const okProfile = st && Array.isArray(st.strikes) && st.strikes.length > 0 && Array.isArray(st.callsOI) && Array.isArray(st.putsOI)
        && st.callsOI.length === st.strikes.length && st.putsOI.length === st.strikes.length;
    const gexCum = okProfile && Array.isArray(st.gexCum) && st.gexCum.length === st.strikes.length ? st.gexCum : null;
    // 감마플립: 교차점이 아닌 값은 «정의상 없음»
    let gf = d.gammaFlipLevel == null ? null : d.gammaFlipLevel;
    if (gf != null) {
        const k = Number(gf);
        const bad = d.gammaFlipType === 'NEAR_ZERO' || !(k > 0) || (gexCum ? !isGammaCrossing({ strikes: st.strikes, gexCum }, k) : false);
        if (bad) gf = null;
    }
    const lvls = d.levels || {};
    const noValue = d.maxPain == null && lvls.callWall == null && lvls.putFloor == null && gf == null;
    if (noValue && !(st && Array.isArray(st.strikes) && st.strikes.length > 0)) return null;
    const s0 = pos(d.underlyingPrice);
    const out = { maxPain: pos(d.maxPain), callWall: pos(lvls.callWall), putFloor: pos(lvls.putFloor), gammaFlip: pos(gf), spot: s0 };
    if (s0 != null) {
        const eps = s0 * 1e-9;
        if (out.callWall != null && !(out.callWall > s0 && out.callWall <= s0 * BANDS.callWallMax + eps)) out.callWall = null;
        if (out.putFloor != null && !(out.putFloor < s0 && out.putFloor >= s0 * BANDS.putFloorMin - eps)) out.putFloor = null;
        if (out.gammaFlip != null && !(Math.abs(out.gammaFlip - s0) <= s0 * BANDS.gammaFlip + eps)) out.gammaFlip = null;
        if (out.maxPain != null && !(Math.abs(out.maxPain - s0) <= s0 * BANDS.maxPain + eps)) out.maxPain = null;
    }
    return out;
}

/** 저장본({ data, timestamp }) → 행. 쓸 수 없으면 null. */
function rowFromStored(ticker, stored, nowMs) {
    let v = stored;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { return null; } }
    if (!v || typeof v !== 'object' || !v.data) return null;
    const lv = levelsFromData(v.data);
    if (!lv || lv.spot == null) return null;
    const asOf = typeof v.timestamp === 'number' && Number.isFinite(v.timestamp) ? v.timestamp : null;
    if (asOf != null && nowMs - asOf > MAX_AGE_MS) return null;
    const row = {
        ticker: String(ticker).toUpperCase(),
        spot: lv.spot,
        expiration: v.data.expiration || null,
        chainDate: v.data.chainDate || null,
        asOf,
        putFloor: lv.putFloor, callWall: lv.callWall, maxPain: lv.maxPain, gammaFlip: lv.gammaFlip,
    };
    return row.putFloor == null && row.callWall == null && row.maxPain == null && row.gammaFlip == null ? null : row;
}

const etDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const numStr = (n) => String(Number(n.toFixed(2)));

function pairsOf(r) {
    const out = [];
    if (r.putFloor != null) out.push(['Put Floor', r.putFloor]);
    if (r.callWall != null) out.push(['Call Wall', r.callWall]);
    if (r.maxPain != null) out.push(['Max Pain', r.maxPain]);
    if (r.gammaFlip != null) out.push(['Gamma Flip', r.gammaFlip]);
    return out;
}

/** 프롬프트 블록 + 출구 필터의 근거 줄 — 글자까지 TS 판(buildLevelsBlock)과 같다 */
function buildLevelsBlock(rows) {
    const usable = rows.filter((r) => pairsOf(r).length > 0);
    if (usable.length === 0) return { block: '', ground: '' };
    const lines = [], ground = [];
    for (const r of usable) {
        const when = r.chainDate ? `open interest as of ${r.chainDate}` : r.asOf != null ? `computed ${etDate(r.asOf)}` : 'date n/a';
        const exp = r.expiration ? `; expiry ${r.expiration}` : '';
        const ps = pairsOf(r);
        lines.push(`- ${r.ticker} (price ${numStr(r.spot)}; ${when}${exp}): ${ps.map(([k, v]) => `${k}: ${numStr(v)}`).join(' | ')}`);
        ground.push(ps.map(([k, v]) => `${r.ticker} ${k}: ${numStr(v)}`).join(' | '));
    }
    const block = `## Index ETF Options Structure Levels (the app's options structure; strike prices per ETF share, NOT index points — never convert or rescale them)\n${lines.join('\n')}`;
    return { block, ground: ground.join('\n') };
}

const levelsPromptSection = (block) => (block ? `\n${block}` : '');

const FIELD_OF = { putfloor: 'putFloor', callwall: 'callWall', maxpain: 'maxPain', gammaflip: 'gammaFlip' };
const NAME_OF = { putFloor: 'Put Floor', callWall: 'Call Wall', maxPain: 'Max Pain', gammaFlip: 'Gamma Flip' };
const LABEL_RE = /^\s*([A-Za-z]{2,5})\s+(put\s*floor|call\s*wall|max\s*pain|gamma\s*flip)\b/i;
function parseLevelLabel(label) {
    const m = String(label || '').match(LABEL_RE);
    return m ? { tk: m[1].toUpperCase(), field: FIELD_OF[m[2].toLowerCase().replace(/\s+/g, '')] } : null;
}

/** «라벨 ↔ 값» 대조 — `<TICKER> <레벨 이름>` 라벨은 그 행의 그 필드 값과 같아야 남긴다(TS 판 reconcileLabeledLevels) */
function reconcileLabeledLevels(levels, rows) {
    const kept = [], dropped = [];
    for (const l of levels) {
        const p = parseLevelLabel(l && l.label);
        if (!p) { kept.push(l); continue; }
        const r = rows.find((x) => x.ticker === p.tk);
        const expected = r ? r[p.field] : null;
        (expected != null && KEYLEVELS.isGroundedLevel(l, KEYLEVELS.groundNumbers(`x: ${numStr(expected)}`)) ? kept : dropped).push(l);
    }
    return { kept, dropped };
}

/** 범위 바의 닻 — 같은 ETF 의 Put Floor·Call Wall 이 입력에 둘 다 있으면 맨 앞에(빠진 쪽은 입력의 값 그대로) (TS 판 anchorKeyLevels) */
function anchorKeyLevels(levels, rows) {
    const list = KEYLEVELS.orderKeyLevels(levels);
    for (const tk of TICKERS) {
        const r = rows.find((x) => x.ticker === tk);
        if (!r || r.putFloor == null || r.callWall == null) continue;
        const find = (f) => list.find((l) => { const p = parseLevelLabel(l && l.label); return p && p.tk === tk && p.field === f; });
        let added = 0;
        const mk = (f) => { added++; return { label: `${tk} ${NAME_OF[f]}`, value: numStr(r[f]) }; };
        const pf = find('putFloor') || mk('putFloor');
        const cw = find('callWall') || mk('callWall');
        return { levels: [pf, cw, ...list.filter((l) => l !== pf && l !== cw)].slice(0, 4), added };
    }
    return { levels: list, added: 0 };
}

/** 생성 출구 한 번에(제자리 수정): ① 입력에 없는 칸 제거 ② 라벨↔값 불일치 제거 ③ 범위 바 닻·순서. { dropped, added } */
function finalizeCrossSectorKeyLevels(structured, macroStr, rows) {
    if (!structured || typeof structured !== 'object' || !structured.outlook || typeof structured.outlook !== 'object') return { dropped: 0, added: 0 };
    const { ground } = buildLevelsBlock(rows);
    let dropped = KEYLEVELS.enforceKeyLevels(structured, ground ? `${macroStr}\n${ground}` : macroStr);
    const lv = Array.isArray(structured.outlook.keyLevels) ? structured.outlook.keyLevels : [];
    const rec = reconcileLabeledLevels(lv, rows);
    dropped += rec.dropped.length;
    const out = anchorKeyLevels(rec.kept, rows);
    structured.outlook.keyLevels = out.levels;
    return { dropped, added: out.added };
}

module.exports = {
    TICKERS, MAX_AGE_MS, levelsFromData, rowFromStored, buildLevelsBlock, levelsPromptSection,
    reconcileLabeledLevels, anchorKeyLevels, finalizeCrossSectorKeyLevels,
};
