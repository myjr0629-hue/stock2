// ============================================================================
// 매크로 스냅샷 «빈칸 잇기» (2026-10-22 장중 핫픽스)
// ----------------------------------------------------------------------------
// 왜: /api/market/macro 가 장중에 REAL·creditSpread 없이 나갔다(10/20 22:20·10/22 00:11~ KST 연속).
//   재계산에서 원천(Intrinio 경제계열·신용스프레드)이 실패하면 그 필드를 «지우고» 스냅샷을 그대로 저장·반환했다.
//   이전 정상값을 잇지 않았고, 메모리·Redis 읽기도 완전성을 보지 않았다.
// 어떻게: 필드 «묶음» 단위로 마지막 정상 관측을 보관하고, 새 결과에서 빠진 묶음만 그 값으로 잇는다.
//   · 값과 «원래 관측일»(asOf·date·updatedAt)을 그대로 옮긴다 — 옛 값을 새 값처럼 보이게 하지 않는다.
//   · 관측일이 상한(관측일 뒤 평일 3일)보다 오래되면 잇지 않는다(빈칸이 거짓 값보다 낫다).
//   · 대상은 일간 관측 묶음 REAL·creditSpread 뿐(아래 MACRO_CARRY_BUNDLES).
//   · 새 결과에 이미 있는 필드는 절대 건드리지 않는다 — 정상 경로는 바이트 동일.
//   · REAL 은 화면 관측값(realYieldObserved)만 잇는다. 점수·AI 입력(realYield)은 손대지 않는다
//     — 보관값을 정시 계산값으로 승격하지 않는다(관문 10200004 경계 유지, 점수 동작 무변경).
// 응답 필드 이름·구조는 바꾸지 않는다(새 필드 0).
// ============================================================================
import type { MacroSnapshot } from '@/services/macroHubProvider';

// 일간 관측 묶음만 잇는다.
//   yieldCurve 는 제외 — 10Y 헤드라인·날짜 꼬리표 선택(tnxIsNewer)이 곡선에 묶여 있어, 옛 곡선을 붙이면 «지금 10Y»의 날짜가 어긋난다.
//   fearGreed 는 제외 — 장중에 바뀌는 값이라 날짜 단위 원자 저장(CAS)으로는 «하루 중 최신»을 보장할 수 없다.
export type MacroCarryBundle = 'real' | 'creditSpread';
export const MACRO_CARRY_BUNDLES: MacroCarryBundle[] = ['real', 'creditSpread'];

type RealBundle = { realYieldObserved: NonNullable<MacroSnapshot['realYieldObserved']> };
export type MacroLastGood = {
    real?: RealBundle;
    creditSpread?: NonNullable<MacroSnapshot['creditSpread']>;
};

/** 묶음별 «잇기» 허용 상한 — 관측일 이후 지난 평일 수. 일간 계열은 하루 늦게 나오고 주말·휴일이 끼므로 3. */
export const MAX_CARRY_WEEKDAYS: Record<MacroCarryBundle, number> = {
    real: 3,
    creditSpread: 3,
};

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ymd = (s: unknown): string | null => {
    const d = typeof s === 'string' ? s.slice(0, 10) : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z')) ? d : null;
};

/** 묶음이 «유효한 값»으로 채워져 있는가 — 키 존재가 아니라 유한값·관측일까지 본다. */
export function bundleValid(snap: Partial<MacroSnapshot> | MacroLastGood | null | undefined, b: MacroCarryBundle): boolean {
    if (!snap) return false;
    const s: any = snap;
    switch (b) {
        case 'real': {
            const o = s.real ? s.real.realYieldObserved : s.realYieldObserved;
            return !!o && fin(o.realYield) && fin(o.us10y) && fin(o.inflationExpectation) && !!ymd(o.asOf);
        }
        case 'creditSpread': return !!s.creditSpread && fin(s.creditSpread.value) && !!ymd(s.creditSpread.date);
    }
}

/** 묶음의 원래 관측일(YYYY-MM-DD) */
export function bundleDate(snap: Partial<MacroSnapshot> | MacroLastGood | null | undefined, b: MacroCarryBundle): string | null {
    if (!snap) return null;
    const s: any = snap;
    switch (b) {
        case 'real': return ymd((s.real ? s.real.realYieldObserved : s.realYieldObserved)?.asOf);
        case 'creditSpread': return ymd(s.creditSpread?.date);
    }
}

/** 관측일 다음 날부터 오늘(뉴욕 날짜)까지 지난 평일 수 */
export function weekdaysSince(obsYmd: string, nowMs: number): number {
    const today = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const a = Date.parse(obsYmd + 'T00:00:00Z');
    const z = Date.parse(today + 'T00:00:00Z');
    if (!Number.isFinite(a) || !Number.isFinite(z)) return Infinity;
    if (z <= a) return 0;
    let n = 0;
    for (let t = a + 86400000; t <= z; t += 86400000) {
        const wd = new Date(t).getUTCDay();
        if (wd !== 0 && wd !== 6) n++;
        if (n > 30) break;
    }
    return n;
}

/** 스냅샷에서 «원천에서 새로 받은» 유효 묶음만 뽑는다(보관 갱신용). */
export function extractLastGood(snap: Partial<MacroSnapshot> | null | undefined): MacroLastGood {
    const out: MacroLastGood = {};
    if (!snap) return out;
    if (bundleValid(snap, 'real')) out.real = { realYieldObserved: snap.realYieldObserved! };
    if (bundleValid(snap, 'creditSpread')) out.creditSpread = snap.creditSpread!;
    return out;
}

/** 두 보관본을 묶음별로 합친다 — 관측일이 더 새로운 쪽을 남긴다(같으면 prev). */
export function mergeLastGood(prev: MacroLastGood | null | undefined, next: MacroLastGood | null | undefined): MacroLastGood {
    const out: MacroLastGood = {};
    for (const b of MACRO_CARRY_BUNDLES) {
        const p = prev && bundleValid(prev, b) ? (prev as any)[b] : undefined;
        const n = next && bundleValid(next, b) ? (next as any)[b] : undefined;
        if (!p && !n) continue;
        if (!p) { (out as any)[b] = n; continue; }
        if (!n) { (out as any)[b] = p; continue; }
        const pd = bundleDate(prev, b)!, nd = bundleDate(next, b)!;
        // 같은 관측일이면 먼저 있던 것을 둔다(저장소 CAS 와 같은 규칙 — 같은 날짜로 다시 쓰지 않는다)
        (out as any)[b] = nd > pd ? n : p;
    }
    return out;
}

/** 보관본이 바뀌었는가(쓰기 줄이기용) */
export function lastGoodChanged(a: MacroLastGood | null | undefined, b: MacroLastGood): boolean {
    return JSON.stringify(a ?? {}) !== JSON.stringify(b);
}

/**
 * 새 스냅샷에서 빠진 묶음만 보관본으로 잇는다. 있는 필드는 손대지 않는다.
 * 잇는 게 하나도 없으면 «같은 객체»를 그대로 돌려준다(정상 경로 바이트 동일).
 */
export function carryMissingMacroFields(
    snap: MacroSnapshot,
    lastGood: MacroLastGood | null | undefined,
    nowMs: number,
): { snapshot: MacroSnapshot; carried: MacroCarryBundle[]; missing: MacroCarryBundle[] } {
    const carried: MacroCarryBundle[] = [];
    const missing: MacroCarryBundle[] = [];
    let out: MacroSnapshot = snap;
    for (const b of MACRO_CARRY_BUNDLES) {
        if (bundleValid(snap, b)) continue;
        const lg = lastGood && bundleValid(lastGood, b) ? lastGood : null;
        const d = lg ? bundleDate(lg, b) : null;
        if (!lg || !d || weekdaysSince(d, nowMs) > MAX_CARRY_WEEKDAYS[b]) { missing.push(b); continue; }
        if (out === snap) out = { ...snap };
        if (b === 'real') {
            // 화면 관측값만 — realYield(점수·AI 입력)는 그대로 둔다.
            // fromPair=true: 기존 화면 규칙대로 관측일(MM/DD)이 함께 표시된다 — 지난 관측을 «지금» 계산처럼 보이지 않게.
            //   (보관값도 같은 날짜 두 관측의 짝이다: 정시 계산은 명목·기대인플레이션 관측일이 같을 때만 성립)
            out.realYieldObserved = { ...lg.real!.realYieldObserved, fromPair: true };
        } else {
            (out as any)[b] = (lg as any)[b];
        }
        carried.push(b);
    }
    return { snapshot: out, carried, missing };
}

// ── 원자 저장 레코드 — 기존 관측일 CAS(setIfNewerAsOf: 같은 날짜·옛 날짜는 덮지 않음)를 그대로 쓴다 ──
export const MACRO_CARRY_CAS_PREFIX = 'macro:economy:lastgood:v2:snapshot.';
export type MacroCarryRecord = { value: number; asOf: string; bundle: MacroCarryBundle; data: any };

export function toCarryRecords(lg: MacroLastGood): MacroCarryRecord[] {
    const out: MacroCarryRecord[] = [];
    if (bundleValid(lg, 'real')) out.push({ value: lg.real!.realYieldObserved.realYield, asOf: bundleDate(lg, 'real')!, bundle: 'real', data: lg.real });
    if (bundleValid(lg, 'creditSpread')) out.push({ value: lg.creditSpread!.value, asOf: bundleDate(lg, 'creditSpread')!, bundle: 'creditSpread', data: lg.creditSpread });
    return out;
}

export function fromCarryRecords(recs: (MacroCarryRecord | null | undefined)[]): MacroLastGood {
    const out: MacroLastGood = {};
    for (const r of recs) {
        if (!r || !r.data || (r.bundle !== 'real' && r.bundle !== 'creditSpread')) continue;
        const cand: MacroLastGood = { [r.bundle]: r.data } as MacroLastGood;
        // 레코드의 관측일과 본문 관측일이 어긋나면 버린다
        if (bundleValid(cand, r.bundle) && bundleDate(cand, r.bundle) === r.asOf) (out as any)[r.bundle] = r.data;
    }
    return out;
}

/** 완전성 — 묶음이 하나라도 빠졌으면 false */
export function macroSnapshotComplete(snap: Partial<MacroSnapshot> | null | undefined): boolean {
    return !!snap && MACRO_CARRY_BUNDLES.every((b) => bundleValid(snap, b));
}
