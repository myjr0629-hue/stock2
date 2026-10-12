/**
 * aiq55 — 신뢰 레이어 경로(Flow AI INTEL · Command 딥 분석)에 새 입력을 붙이는 어댑터. 순수 함수만.
 *   · patchFlowDataWithAiq : 앱 Flow 화면은 regime.maxPain 을 0, impliedMove 를 'N/A' 로 보낸다(화면 재료에 없다). 서버가 아는 구조 사본으로 «복사본»을 메운다.
 *     원래 flowData 는 건드리지 않는다(낡음 판정·재료 완결 게이트는 화면 값 그대로).
 *   · aiqGateWrap : 기존 출구 게이트(gateFlowAnalysis·gateDeepAnalysis)가 통과한 글에 새 사실 문장 검사를 더한다 — 어긋난 문장은 빼고, 못 쓰게 되면 실패 사유로.
 *     strictAsOf: 새 숫자가 든 칸에 기준 시각이 없으면 실패(교정 재생성에 쓴다). 사다리 validate·마지막 시도는 false(기준 시각 때문에 ①을 버리지 않는다).
 */
import type { FlowGateResult } from '@/lib/ai/flowTrust';
import { checkAiqSlot } from '@/lib/ai/aiqGuard';
import { FL_LOCALES } from '@/lib/ai/flowTrust';
import type { AiqFacts } from '@/lib/ai/aiqContext';

const posNum = (v: unknown): number => { const n = typeof v === 'string' ? Number(v.replace(/[$,%\s]/g, '')) : Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export function patchFlowDataWithAiq(flowData: any, f: AiqFacts | null): any {
    if (!f || !flowData || typeof flowData !== 'object') return flowData;
    const regime = { ...(flowData.regime || {}) };
    const price = posNum(flowData.currentPrice);
    let changed = false;
    const mp = f.levels?.maxPain ?? 0;
    if (!(posNum(regime.maxPain) > 0) && mp > 0 && price > 0) {
        regime.maxPain = mp;
        const dist = (Math.abs(price - mp) / price) * 100;
        regime.maxPainDist = `${dist.toFixed(1)}% (Max Pain is ${mp < price ? 'BELOW' : 'ABOVE'} the current price)`;
        changed = true;
    }
    const im = f.implied;
    if ((regime.impliedMove == null || regime.impliedMove === 'N/A' || regime.impliedMove === '') && im) {
        regime.impliedMove = `±${im.pct}%${im.expiry ? ` to the ${im.expiry} expiry` : ''} (${im.basis === 'live' ? 'live' : 'EOD'}${im.session ? ` ${im.session}` : ''})`;
        changed = true;
    }
    return changed ? { ...flowData, regime } : flowData;
}

type SlotsFn = (a: any) => Array<{ path: string; obj: Record<string, string> }>;

export function aiqGateWrap(g: FlowGateResult, slotsOf: SlotsFn, ground: string, f: AiqFacts | null, strictAsOf: boolean): FlowGateResult {
    if (!f || !g.ok) return g;
    const analysis = g.analysis;
    const reasons: string[] = [];
    let removed = 0;
    const samples: string[] = [...(g.strippedSamples || [])];
    for (const { path, obj } of slotsOf(analysis)) {
        for (const loc of FL_LOCALES) {
            const t = obj[loc];
            if (typeof t !== 'string' || !t) continue;
            const r = checkAiqSlot(t, loc, ground);
            if (!r.usable) { reasons.push(`aiq:${loc}:${path}:unusable:${r.reasons.slice(0, 2).join(',') || 'removed'}`); continue; }
            if (r.removed.length) {
                obj[loc] = r.text; removed += r.removed.length;
                for (const s of r.removed) if (samples.length < 6) samples.push(`${loc}:${path}«${s.slice(0, 40)}»`);
            }
            if (strictAsOf && r.asOfMissing) reasons.push(`aiq:${loc}:${path}:asof-missing`);
        }
    }
    return reasons.length ? { ...g, ok: false, reasons } : { ...g, stripped: g.stripped + removed, strippedSamples: samples };
}

/** 교정 재생성 지시에 붙이는 aiq 줄 — 사유에 aiq: 가 있을 때만 */
export function aiqCorrective(reasons: string[]): string {
    if (!reasons.some((r) => r.includes('aiq:'))) return '';
    return `\n<rewrite_request_aiq>\nEvery sentence that cites a figure from <verified_context> must carry that figure's as-of date: copy the cite_* phrase for the language you write (date + source + number stay together). Use only figures that appear in the data; do not compute new numbers; if you cannot cite a block exactly, leave that topic out.\n</rewrite_request_aiq>`;
}
