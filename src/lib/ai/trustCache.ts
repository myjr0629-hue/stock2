/**
 * 신뢰 레이어 캐시 단계(표면 공용) — 저장된 «템플릿 + 기준»을 읽어 쓸지·표기할지·다시 만들지 정한다.
 * Flow AI INTEL(/api/flow/ai-analysis)·Command 딥 분석(/api/command/deep-analysis)의 신뢰 경로가 같이 쓴다.
 *
 * 결정(보고서 §5.2 ② · 대표 지시 T5-③):
 *   fresh  → 그대로 낸다(자리표는 요청 화면 값으로 채운다)
 *   mild   → «생성 HH:MM ET 기준» 표기를 붙여 낸다(가격이 1% 이상 움직임)
 *   stale  → 가격이 기준 수준을 넘었거나 2% 이상 움직였거나 세션이 바뀜 → 재생성(종목당 5분에 1회).
 *            슬롯을 못 얻으면 «생성 시각 표기 + 방향·위치 서술 문장 제거»로 낸다.
 *   재료 미완결 → 저장된 정상본이 있으면 그것을 낸다(표기 포함), 없으면 호출자가 422.
 */
import { getFromCache, setInCache } from '@/services/redisClient';
import { asOfLabel, dropDirectionSentences, type StaleVerdict } from '@/lib/ai/trustLayer';
import { fillTrustAnalysis, FL_LOCALES, type MaterialVerdict } from '@/lib/ai/flowTrust';
import type { FlowTokens } from '@/lib/ai/flowTokens';

export type PresentMode = 'plain' | 'mild' | 'stale';
type SlotsFn = (a: any) => Array<{ path: string; obj: Record<string, string> }>;

/** 저장본 → 화면 글 + 메타. 채울 수 없는 자리표가 있으면 null. */
export function presentTrust(c: any, slotsOf: SlotsFn, tokensNow: FlowTokens | null, mode: PresentMode, labelPath = 'structuralThesis'): { analysis: any; meta: Record<string, unknown> } | null {
    const { analysis, missing } = fillTrustAnalysis(c.tpl, slotsOf, tokensNow, c.basisTokens || null);
    if (missing.length) return null;
    if (mode !== 'plain') {
        for (const { path, obj } of slotsOf(analysis)) {
            for (const loc of FL_LOCALES) {
                if (typeof obj[loc] !== 'string') continue;
                let t = obj[loc];
                if (mode === 'stale') { const d = dropDirectionSentences(t, loc); if (d.usable && d.text) t = d.text; }
                if (path === labelPath) t = `${t} ${asOfLabel(loc, c.generatedAt)}`.trim();
                obj[loc] = t;
            }
        }
    }
    return {
        analysis,
        meta: {
            ticker: c.ticker, session: c.session, triggerReason: c.triggerReason, generatedAt: c.generatedAt,
            model: c.model, usedFallback: c.usedFallback, fromCache: true,
            ...(mode !== 'plain' ? { asOfLabeled: true, staleMode: mode } : {}),
        },
    };
}

export type CacheStage =
    | { action: 'serve'; cached: any; mode: PresentMode }
    | { action: 'generate'; reasons: string[] }
    | { action: 'none' };

/**
 * 캐시를 읽고 결정한다. recheck 가 사유를 돌려주면 저장본은 버린다(예측어 사전 갱신 등).
 * staleness 는 (저장본) → StaleVerdict. 재료가 미완결이면 낡음을 판정하지 않는다(지금 가격을 모른다).
 */
export async function resolveTrustCache(a: {
    key: string;
    slotKey: string;
    ticker: string;
    material: MaterialVerdict;
    recheck: (tpl: any, basisTokens: FlowTokens) => string[];
    staleness: (cached: any) => StaleVerdict;
    regenTtlSec?: number;
    log?: string;
}): Promise<CacheStage> {
    const cached = await getFromCache<any>(a.key);
    let usable: any = null;
    if (cached?.tpl && cached.basisTokens && cached.basisState && cached.trust === 1) {
        const re = a.recheck(cached.tpl, cached.basisTokens);
        if (re.length) console.warn(`[${a.log || 'AI/trust'}] 저장본 재검사 탈락 — 버림: ${a.ticker} ${re.slice(0, 3).join(' | ')}`);
        else usable = cached;
    }
    if (!usable) return { action: 'none' };
    if (!a.material.ok) return { action: 'serve', cached: usable, mode: 'mild' };   // 이전 정상본 유지 — 지금 값은 모르니 생성 시각을 표기한다
    const v = a.staleness(usable);
    if (v.level === 'fresh') return { action: 'serve', cached: usable, mode: 'plain' };
    if (v.level === 'mild') return { action: 'serve', cached: usable, mode: 'mild' };
    // stale — 재생성 슬롯(종목당 5분에 1회)을 얻으면 다시 만든다
    const taken = await getFromCache<any>(a.slotKey);
    if (taken) return { action: 'serve', cached: usable, mode: 'stale' };
    await setInCache(a.slotKey, { at: Date.now() }, a.regenTtlSec ?? 300);
    console.log(`[${a.log || 'AI/trust'}] 낡음 → 재생성: ${a.ticker} ${v.reasons.join(',')}`);
    return { action: 'generate', reasons: v.reasons };
}
