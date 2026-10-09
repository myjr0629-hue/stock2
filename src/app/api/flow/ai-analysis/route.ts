/**
 * POST /api/flow/ai-analysis
 * 
 * [V2.0] AI Flow Intelligence — Claude Sonnet 4 (Centralized Client)
 * Generates TRILINGUAL (ko/en/ja) institutional-grade options analysis.
 * 
 * Single Bedrock call produces all 3 languages → cached per ticker (not per locale).
 * Frontend reads the cached multilingual object and picks the right locale.
 * 
 * Features:
 * - Automatic retry with exponential backoff on ThrottlingException
 * - Haiku 3.5 fallback if Sonnet 4 exhausts retries
 * - Concurrency-limited via centralized bedrockClient
 * 
 * Cache: Redis with session-aware TTL (key: ai-flow-analysis:v3:${TICKER} — 웹·옛 재료 / v4 — 앱(P/C=풋÷콜 선언 재료), 저장값에 basis — 2026-10-04 숫자 대조)
 * POLICY: Observation-only language. No investment advice.
 */

import { NextResponse } from 'next/server';
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { basisFromFlowData, checkFlowAnalysis, enrichmentLevels, flowPriceMatchesServer } from '@/lib/ai/flowNumbers';
import { flowAiCacheKey } from '@/lib/ai/flowCacheKey';
import {
    isTrustFlowData, flowTrustCacheKey, flowMaterialIssues, staleNowFromFlowData, staleBasisFromFlowData, buildTrustFlowXml,
    TRUST_FLOW_SYSTEM, gateFlowAnalysis, recheckStoredFlow, flowCorrective, flowTextSlots,
} from '@/lib/ai/flowTrust';
import { flowTokensFromFlowData } from '@/lib/ai/flowTokens';
import { flowStaleness } from '@/lib/ai/trustLayer';
import { presentTrust, resolveTrustCache, type PresentMode } from '@/lib/ai/trustCache';

export const maxDuration = 60;

// --- Session-aware TTL ---
function getSessionTTL(session: string): number {
    switch (session) {
        case 'PRE': return 90 * 60;          // 90 min
        case 'REG': return 20 * 60;          // 20 min
        case 'POST': return 90 * 60;         // 90 min
        case 'CLOSED': return 14 * 60 * 60;  // 14 hours (until next session)
        default: return 60 * 60;
    }
}

/**
 * ★ [2026-09-10] 같은 «호출 한 번»에 더 많은 재료를 담는다.
 *
 *   실측으로 확인한 제약: Bedrock 한도가 «호출 수»(RPM 10)로 묶여 있고
 *   토큰은 기본값 100%(TPM 5,000,000)다. 즉 **콜을 늘리는 건 비싸고,
 *   프롬프트를 키우는 건 사실상 공짜다.**
 *
 *   그런데 이 분석은 옵션 지표만 보고 있었다. 「OPI +68 인데 고래는 중립」 같은
 *   구조는 읽어도, **왜 그런 구조가 생겼는지**(실적 임박·내부자 매도·목표가 괴리·
 *   다크풀 비중)를 설명할 재료가 없었다. 그건 인사이트의 상한을 정한다.
 *
 *   그래서 우리 API 에서 이미 만들어 둔 값을 끌어와 프롬프트에 붙인다.
 *   Bedrock 콜은 0건 늘어난다. 전부 병렬·짧은 타임아웃이고, 실패한 것은 조용히 뺀다
 *   (보강 실패가 분석 자체를 막으면 안 된다).
 */
/**
 * ★ [2026-09-10] «분석 불가능»이 캐시에 앉는 사고를 막는다.
 *
 *   이 라우트는 옵션 지표를 **호출자가 넘겨 준다**(flowData). 화면은 그걸 계산해서
 *   보내지만, 서버끼리 부르는 경로(예열 크론)는 그 계산을 못 한다.
 *   그런데 가드가 없어서 빈 데이터로도 Bedrock 을 부르고, 모델이 정직하게
 *   「모든 팩터가 N/A 라 분석 불가능」이라고 쓴 것을 **그대로 캐시에 저장**했다.
 *   실측(2026-09-10): 인기 9종목 중 **8개가 이 문장으로 오염**돼 있었다.
 *   내가 만든 예열 크론이 저지른 일이다. → [[cmd-ai-stale-ticker-cache-poisoning]]
 *
 *   두 겹으로 막는다: ①빈 입력이면 아예 생성하지 않는다 ②이미 앉은 오염은 읽을 때 버린다.
 */
const POISON_RE = /분석\s*불가능|판단\s*불가|데이터\s*(부재|전무|결측)|피드\s*단절|N\/A\s*또는\s*0|data (is )?unavailable|cannot (be )?analyz|分析(が)?不可能/i;

function isPoisoned(payload: any): boolean {
    const t = payload?.structuralThesis;
    const s = typeof t === 'string' ? t : [t?.ko, t?.en, t?.ja].filter(Boolean).join(' ');
    return !s || POISON_RE.test(s);
}

/** 생성을 시도할 만큼 재료가 있는가. 없으면 부르지 않는다 — 콜과 캐시를 둘 다 아낀다. */
function hasEnoughFlowData(d: any): boolean {
    if (!d || typeof d !== 'object') return false;
    if (!(Number(d.currentPrice) > 0)) return false;
    const f = d.factors || {};
    const signals = [f.opi?.value, f.whale?.premium, f.squeeze?.probability, f.ivSkew?.value,
                     f.dex?.value, f.pcRatio?.value, f.gex?.pinStrength, d.compositeScore];
    return signals.filter((v) => v !== undefined && v !== null && v !== 'N/A').length >= 3;
}

/**
 * ★ [2026-10-04] 서버가 아는 «그 종목» 가격 — 요청 재료(flowData)가 정말 그 티커 것인지 대조한다(lib/ai/flowNumbers 머리말).
 *   정규장·시간외·전일 종가를 다 돌려준다(화면이 어느 세션 가격을 보냈든 그중 하나와는 맞아야 한다). 실패하면 빈 배열 = 판정 안 함.
 */
async function fetchServerPrices(ticker: string, baseUrl: string): Promise<number[]> {
    try {
        const headers: Record<string, string> = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
            ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {};
        const r = await fetch(`${baseUrl}/api/live/ticker?t=${encodeURIComponent(ticker)}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(3500) });
        if (!r.ok) return [];
        const j: any = await r.json();
        if (j?.ticker && String(j.ticker).toUpperCase().replace(/[^A-Z0-9]/g, '') !== ticker.replace(/[^A-Z0-9]/g, '')) return [];
        return [j?.price, j?.display?.price, j?.prices?.postPrice, j?.prices?.prePrice, j?.extended?.postPrice, j?.extended?.prePrice, j?.prevClose]
            .map(Number).filter((v) => Number.isFinite(v) && v > 0);
    } catch { return []; }
}

async function buildEnrichment(ticker: string, baseUrl: string): Promise<string> {
    const bypass: Record<string, string> = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : {};
    const grab = async (path: string) => {
        try {
            const r = await fetch(baseUrl + path, { headers: bypass, cache: 'no-store', signal: AbortSignal.timeout(6000) });
            return r.ok ? await r.json() : null;
        } catch { return null; }
    };

    const [insider, analyst, earnings, darkpool] = await Promise.all([
        grab(`/api/command/insider?ticker=${ticker}`),
        grab(`/api/live/analyst?t=${ticker}`),
        grab(`/api/live/earnings?t=${ticker}`),
        grab(`/api/flow/dark-pool-trades?ticker=${ticker}&limit=1`),
    ]);

    const parts: string[] = [];

    const ins = insider?.summary || insider?.data || insider;
    if (ins && (ins.buyCount != null || ins.sellCount != null || ins.netValue != null)) {
        parts.push(`  <insider window="recent" buys="${ins.buyCount ?? 'N/A'}" sells="${ins.sellCount ?? 'N/A'}" net_usd="${ins.netValue ?? 'N/A'}" note="Corporate insiders. Selling into call-heavy options flow is a contradiction worth naming." />`);
    }

    const an = analyst?.data || analyst;
    const target = an?.targetMedian ?? an?.priceTarget ?? an?.targetMean;
    if (target != null) {
        parts.push(`  <analyst target_median="$${target}" count="${an?.analystCount ?? an?.numberOfAnalysts ?? 'N/A'}" note="Street target. A price far above or below it changes what the options positioning implies." />`);
    }

    const ea = earnings?.data || earnings;
    const nextDate = ea?.nextEarningsDate || ea?.date || ea?.earningsDate;
    if (nextDate) {
        parts.push(`  <earnings next_date="${nextDate}" note="Elevated IV and dated flow near an earnings date usually means event positioning, not directional conviction." />`);
    }

    const dpRatio = darkpool?.summary?.darkPoolRatio ?? darkpool?.darkPoolRatio ?? darkpool?.ratio;
    if (dpRatio != null) {
        parts.push(`  <dark_pool off_exchange_ratio="${dpRatio}" note="Off-exchange share of volume (FINRA). High ratio with quiet lit tape suggests accumulation away from the screen." />`);
    }

    if (!parts.length) return '';
    return `\n  <context note="cross_asset_evidence_use_only_if_it_changes_the_read">\n${parts.join('\n')}\n  </context>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// ★ [2026-10-07 앱 강화 T5] 신뢰 레이어 경로 — flowData.trustLayer === 1 (앱 새 화면)만.
//   ① 재료 완결 게이트: 화면이 «보조 응답까지 다 온 뒤»(materialPhase:'complete')에, 가격·종합점수·P/C·OPI 가 있을 때만 생성한다.
//      미완결이면 생성하지 않고 이전 정상본(캐시)을 유지한다 — 없으면 422(화면은 기존 폴백 문구).
//   ② 자리표: 글 속 수치는 {PRICE}·{PC}… — 저장은 템플릿, 나갈 때 «요청한 화면의 값»으로 채운다(글 숫자 = 화면 숫자).
//   ③ 낡음: 생성 뒤 가격이 수준을 넘었거나 2% 이상 움직였으면 재생성(5분에 1회) — 못 하면 «생성 HH:MM ET 기준» 표기 + 방향 서술 문장 제거.
//   ④ 출구 게이트: 예측어·비교 문장·직접 쓴 수치·언어(lib/ai/flowTrust.gateFlowAnalysis). 실패하면 교정 지시로 1회 재생성.
//   캐시 칸은 v5(템플릿+기준) — 웹 v3·옛 앱 v4 와 섞이지 않는다.
// ═════════════════════════════════════════════════════════════════════════════
function parseModelJson(raw: string): any {
    let rawText = String(raw || '').trim();
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const jsonStart = rawText.indexOf('{');
    if (jsonStart > 0) rawText = rawText.slice(jsonStart);
    try { return JSON.parse(rawText); } catch {
        let depth = 0, endIdx = -1;
        for (let i = 0; i < rawText.length; i++) {
            if (rawText[i] === '{') depth++;
            else if (rawText[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
        }
        if (endIdx > 0) return JSON.parse(rawText.slice(0, endIdx + 1));
        throw new Error('Failed to parse AI response as JSON');
    }
}

const REGEN_SLOT_TTL = 5 * 60;      // 낡음 재생성은 종목당 5분에 1회
const RETRY_BUDGET_MS = 24 * 1000;  // 첫 생성이 이 안에 끝났을 때만 교정 재생성(라우트 한도 60초 — 생성 1회 약 17~28초, 스로틀 시 더)

async function trustPost(a: { req: Request; ticker: string; locale: string; flowData: any; triggerReason: string; startTime: number }) {
    const { req, flowData, triggerReason, startTime } = a;
    const TICKER = String(a.ticker).toUpperCase();
    const key = flowTrustCacheKey(TICKER);
    const tkNorm = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (flowData?.ticker && tkNorm(flowData.ticker) !== tkNorm(TICKER)) {
        return NextResponse.json({ error: 'flowdata_ticker_mismatch', ticker: TICKER, flowTicker: String(flowData.ticker).toUpperCase() }, { status: 409 });
    }
    const tokensNow = flowTokensFromFlowData(flowData);
    const material = flowMaterialIssues(flowData);
    const session = String(flowData?.session || 'CLOSED');
    const respond = (c: any, mode: PresentMode, extra: Record<string, unknown> = {}) => {
        const p = presentTrust(c, flowTextSlots, material.ok ? tokensNow : null, mode);
        return p ? NextResponse.json({ ...p.analysis, ...p.meta, ...extra }) : null;
    };

    // ① 캐시 — 정상본이면 쓰고(낡았으면 표기), 많이 낡았으면 재생성 대상, 재료 미완결이면 이전 정상본 유지
    const stage = await resolveTrustCache({
        key, slotKey: `ai-flow-analysis:regen:${TICKER}`, ticker: TICKER, material, log: 'FlowAI/trust',
        recheck: recheckStoredFlow,
        staleness: (c) => flowStaleness(c.basisState, staleNowFromFlowData(flowData)),
        regenTtlSec: REGEN_SLOT_TTL,
    });
    if (stage.action === 'serve') { const r = respond(stage.cached, stage.mode); if (r) return r; }

    // ② 재료가 완결되지 않았으면 생성하지 않는다(콜·캐시 둘 다 아낀다) — 이전 정상본이 있었다면 위에서 이미 나갔다
    if (!material.ok) {
        return NextResponse.json({ error: 'material_incomplete', message: '재료가 완결되지 않아 생성하지 않습니다(조기 재료로 만든 글이 화면과 어긋나는 사고 방지).', reasons: material.reasons, ticker: TICKER, cached: false }, { status: 422 });
    }

    // ③-0 최근에 생성이 실패한 종목은 2분간 다시 부르지 않는다(실패를 사용자 요청마다 두드리면 Bedrock 호출만 쓴다 — 10/7 프로덕션 TSLA 딥 분석 실측)
    const failKey = `ai-flow-analysis:fail:${TICKER}`;
    if (await getFromCache<any>(failKey)) {
        return NextResponse.json({ error: 'recently_failed', ticker: TICKER, message: '직전 생성이 검사를 통과하지 못해 잠시 쉽니다(2분).' }, { status: 422 });
    }
    // ③ 생성 — 입구(재료가 그 종목 것인가·서버 가격과 맞는가)는 웹 경로와 같은 규칙
    const enrichBase = new URL(req.url).origin.includes('localhost')
        ? new URL(req.url).origin
        : (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com');
    const [enrichment, serverPrices] = await Promise.all([buildEnrichment(TICKER, enrichBase), fetchServerPrices(TICKER, enrichBase)]);
    const basis = basisFromFlowData(TICKER, flowData);
    basis.extras.push(...enrichmentLevels(enrichment));
    if (!flowPriceMatchesServer(basis.price, serverPrices)) {
        console.warn(`[FlowAI/trust] 재료 가격 불일치 — 생성 안 함: ${TICKER} flowData $${basis.price} vs 서버 ${serverPrices.join('/')}`);
        return NextResponse.json({ error: 'flowdata_mismatch', ticker: TICKER, flowPrice: basis.price, serverPrices }, { status: 409 });
    }
    const xml = buildTrustFlowXml(TICKER, flowData, enrichment, triggerReason);

    const callOnce = async (extra = '') => {
        const r = await callBedrock({
            system: TRUST_FLOW_SYSTEM, userPrompt: xml + extra, maxTokens: 4096, temperature: 0.3, label: 'FlowAI',
            // ★2026-10-10 사다리 출구 가드 — ①② 응답이 이 라우트의 진짜 출구 게이트(gateFlowAnalysis)를 못 넘으면 현행 Bedrock Haiku 4.5 로 넘어간다
            expectJson: true, locale: 'multi',
            validate: (t: string) => { try { return gateFlowAnalysis(parseModelJson(t), tokensNow, basis).ok; } catch { return false; } },
        });
        return { r, analysis: parseModelJson(r.text) };
    };
    let used: Awaited<ReturnType<typeof callOnce>>;
    try { used = await callOnce(); } catch (e) { await setInCache(failKey, { at: Date.now(), err: String((e as any)?.message || e).slice(0, 120) }, 120); throw e; }
    let gate = gateFlowAnalysis(used.analysis, tokensNow, basis);
    let calls = 1;
    if (!gate.ok) {
        console.warn(`[FlowAI/trust] 출구 게이트 탈락(1/2): ${TICKER} ${gate.reasons.slice(0, 4).join(' | ')}`);
        if (Date.now() - startTime < RETRY_BUDGET_MS) {
            const second = await callOnce(flowCorrective(gate.reasons));
            calls = 2;
            used = second; gate = gateFlowAnalysis(second.analysis, tokensNow, basis);
            if (!gate.ok) console.warn(`[FlowAI/trust] 출구 게이트 탈락(2/2): ${TICKER} ${gate.reasons.slice(0, 4).join(' | ')}`);
        }
    }
    if (!gate.ok) {
        await setInCache(failKey, { at: Date.now(), reasons: gate.reasons.slice(0, 4) }, 120);
        return NextResponse.json({ error: 'gate_failed', ticker: TICKER, reasons: gate.reasons.slice(0, 6) }, { status: 422 });
    }

    const payload = {
        tpl: gate.analysis, trust: 1, ticker: TICKER, session, triggerReason,
        generatedAt: new Date().toISOString(), elapsedMs: Date.now() - startTime,
        model: used.r.model, usedFallback: used.r.usedFallback,
        basis, basisTokens: tokensNow, basisState: staleBasisFromFlowData(flowData), calls, stripped: gate.stripped,
    };
    const ttl = getSessionTTL(session);
    await setInCache(key, payload, ttl);
    console.log(`[FlowAI/trust] ✅ ${TICKER} 생성 ${payload.elapsedMs}ms (calls ${calls}, 예측어 문장 ${gate.stripped}건 제거 ${JSON.stringify(gate.strippedSamples || [])}, TTL ${ttl}s, model ${used.r.model})`);
    const r = respond(payload, 'plain', { fromCache: false, calls });
    return r ?? NextResponse.json({ error: 'fill_failed', ticker: TICKER }, { status: 422 });
}

export async function POST(req: Request) {
    const startTime = Date.now();

    try {
        const body = await req.json();
        const { ticker, locale = 'ko', flowData, triggerReason = 'FIRST_LOAD' } = body;

        if (!ticker) {
            return NextResponse.json({ error: 'ticker required' }, { status: 400 });
        }

        // ★ [2026-10-07 앱 강화 T5] 신뢰 레이어 재료(앱 새 화면)는 별도 경로 — 웹·옛 앱 요청은 아래 기존 경로가 바이트 단위로 그대로 받는다.
        if (isTrustFlowData(flowData)) {
            return await trustPost({ req, ticker, locale, flowData, triggerReason, startTime });
        }

        const session = flowData?.session || 'CLOSED';
        // V3(2026-10-04): 저장값에 basis(생성 재료의 가격 수준)를 같이 두고, 나갈 때도 글 속 가격을 basis 와 대조한다.
        //   v2 에는 다른 종목 숫자로 쓴 글이 앉아 있었다(AAPL 글에 PLTR 값 등 5종목) → 키를 바꿔 통째로 버린다.
        const TICKER = String(ticker).toUpperCase();
        // ★ [2026-10-07] P/C 를 «풋÷콜» 로 정정해 보내는 재료(앱)는 별도 칸(v4) — 웹의 옛 재료(콜÷풋 값에 P/C 이름)가 만든 글과 섞이지 않는다.
        //   선언이 없는 재료(웹)는 예전과 똑같이 v3. lib/ai/flowCacheKey.ts
        const cacheKey = flowAiCacheKey(TICKER, flowData);

        // --- Check Cache (unless event trigger forces refresh) ---
        const forceRefresh = triggerReason === 'PRICE_MOVE' || triggerReason === 'SQUEEZE_CHANGE' || triggerReason === 'MANUAL_REFRESH';
        if (!forceRefresh) {
            const cached = await getFromCache<any>(cacheKey);
            const numbersOk = !!cached?.basis && checkFlowAnalysis(cached, cached.basis).ok;
            if (cached && cached.structuralThesis && !isPoisoned(cached) && !numbersOk) {
                console.warn(`[FlowAI] 캐시 숫자 불일치·기준 없음 — 버림: ${TICKER}`);
            }
            if (cached && cached.structuralThesis && !isPoisoned(cached) && numbersOk) {
                console.log(`[FlowAI] Cache HIT for ${ticker} (locale: ${locale})`);
                return NextResponse.json({ ...cached, fromCache: true });
            }
            if (cached && isPoisoned(cached)) {
                // 옛 오염분은 «없는 것»으로 친다. 재료가 있으면 아래에서 다시 만든다.
                console.warn(`[FlowAI] 오염 캐시 폐기: ${ticker}`);
            }
        }

        // ★ 재료가 없으면 여기서 끝낸다. Bedrock 을 부르지도, 캐시에 쓰지도 않는다.
        //   (예열 크론처럼 flowData 를 만들 수 없는 호출자가 캐시를 오염시키던 자리)
        if (!hasEnoughFlowData(flowData)) {
            return NextResponse.json({
                error: 'insufficient_flow_data',
                message: 'flowData(currentPrice + 최소 3개 팩터)가 필요합니다. 이 라우트는 화면이 계산한 값을 받아야 합니다.',
                ticker, cached: false,
            }, { status: 422 });
        }

        // 옵션 지표 밖의 근거를 모은다 — Bedrock 콜은 안 늘어난다(위 buildEnrichment 주석 참조).
        const enrichBase = new URL(req.url).origin.includes('localhost')
            ? new URL(req.url).origin
            : (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com');
        // ★ 재료가 그 티커 것인가 — 화면이 종목을 넘기는 순간 이전 종목 숫자를 보낸 사고(10/3 AAPL←PLTR 등 5건)를 입구에서 막는다.
        const tkNorm = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (flowData?.ticker && tkNorm(flowData.ticker) !== tkNorm(TICKER)) {
            return NextResponse.json({ error: 'flowdata_ticker_mismatch', ticker: TICKER, flowTicker: String(flowData.ticker).toUpperCase() }, { status: 409 });
        }
        const [enrichment, serverPrices] = await Promise.all([
            buildEnrichment(TICKER, enrichBase),
            fetchServerPrices(TICKER, enrichBase),
        ]);
        const basis = basisFromFlowData(TICKER, flowData);
        basis.extras.push(...enrichmentLevels(enrichment));
        if (!flowPriceMatchesServer(basis.price, serverPrices)) {
            console.warn(`[FlowAI] 재료 가격 불일치 — 생성 안 함: ${TICKER} flowData $${basis.price} vs 서버 ${serverPrices.join('/')}`);
            return NextResponse.json({ error: 'flowdata_mismatch', ticker: TICKER, flowPrice: basis.price, serverPrices }, { status: 409 });
        }

        // --- Build XML Context from Flow Data ---
        const d = flowData || {};
        const factors = d.factors || {};
        const position = d.position || {};
        const regime = d.regime || {};
        const alpha = d.alphaTrade || {};

        const xmlContext = `<flow_analysis ticker="${ticker}" price="$${d.currentPrice || 0}" session="${session}">
  <composite_score value="${d.compositeScore ?? 0}" range="-100_to_+100" />
  
  <position zone="${position.zone || 'UNKNOWN'}">
    <put_floor price="$${position.putFloor || 'N/A'}" distance="${position.distToPut || 'N/A'}" />
    <call_wall price="$${position.callWall || 'N/A'}" distance="${position.distToCall || 'N/A'}" />
    <max_pain price="$${regime.maxPain || 'N/A'}" distance="${regime.maxPainDist || 'N/A'}" />
    <gamma_flip_level price="$${regime.gammaFlipLevel || 'N/A'}" gamma_zone="${!(Number(regime.gammaFlipLevel) > 0) ? 'UNKNOWN' : d.currentPrice > regime.gammaFlipLevel ? 'LONG_GAMMA' : 'SHORT_GAMMA'}" />
  </position>
  
  <factors note="11_weighted_factors_composite">
    <opi value="${factors.opi?.value ?? 'N/A'}" score="${factors.opi?.score ?? 0}" max_weight="25" label="${factors.opi?.label || ''}" interpretation="OPI(Options Pressure Index): +50=extreme_call_dominance, -50=extreme_put_dominance. Measures net directional pressure from options flow." />
    <whale premium="${factors.whale?.premium || 'N/A'}" score="${factors.whale?.score ?? 0}" max_weight="25" bias="${factors.whale?.bias || 'NEUTRAL'}" interpretation="Institutional whale trades >$100K premium. Shows where smart money is positioning large directional bets." />
    <squeeze probability="${factors.squeeze?.probability ?? 'N/A'}%" score="${factors.squeeze?.score ?? 0}" max_weight="15" label="${factors.squeeze?.label || ''}" interpretation="Short squeeze probability 0-100%. Measures trapped short positions that could trigger forced buying." />
    <iv_skew value="${factors.ivSkew?.value ?? 'N/A'}" score="${factors.ivSkew?.score ?? 0}" max_weight="15" label="${factors.ivSkew?.label || ''}" interpretation="IV Skew measures put-call implied volatility differential. Positive=fear/hedging, Negative=greed/complacency." />
    <smart_money score="${factors.smartMoney?.score ?? 0}" max_weight="10" label="${factors.smartMoney?.label || ''}" interpretation="Institutional flow pattern detection. Tracks whether professional traders are accumulating or distributing." />
    <dex value="${factors.dex?.value ?? 'N/A'}" score="${factors.dex?.score ?? 0}" max_weight="10" label="${factors.dex?.label || ''}" interpretation="Delta Exposure Index. Measures net delta positioning across all options. Positive=bullish positioning." />
    <uoa score="${factors.uoa?.score ?? 0}" max_weight="5" label="${factors.uoa?.label || ''}" interpretation="Unusual Options Activity multiplier. High values indicate abnormal institutional positioning." />
    <pc_ratio value="${factors.pcRatio?.value ?? 'N/A'}" score="${factors.pcRatio?.score ?? 0}" max_weight="5" interpretation="Put/Call ratio by volume. >1.3=put_heavy(bearish), <0.75=call_heavy(bullish)." />
    <gex pin_strength="${factors.gex?.pinStrength ?? 'N/A'}%" score="${factors.gex?.score ?? 0}" max_weight="5" regime="${factors.gex?.regime || 'N/A'}" flip_percentage="${regime.flipPercentage || 'N/A'}%" interpretation="Gamma Exposure regime. High pinning = price stability. Low = volatile moves likely." />
  </factors>
  
  <volatility_regime>
    <iv_percentile value="${regime.ivPercentile ?? 'N/A'}%" />
    <implied_move value="${regime.impliedMove || 'N/A'}" definition="(ATM call mid + ATM put mid) / price for the stated expiry — the move options price in by that expiry. NOT the call-wall/put-floor distance." />
    <gex_regime label="${regime.gexRegime || 'N/A'}" />
  </volatility_regime>

  <alpha_trade note="largest_single_trade_detected">
    <type>${alpha.type || 'NONE'}</type>
    <strike>$${alpha.strike || 'N/A'}</strike>
    <premium>$${alpha.premium || 'N/A'}</premium>
    <expiry>${alpha.expiry || 'N/A'}</expiry>
    <impact>${alpha.impact || 'N/A'}</impact>
  </alpha_trade>

  <rule_based_verdict status="${d.ruleVerdict?.status || ''}" composite="${d.compositeScore ?? 0}" />
  <trigger_reason>${triggerReason}</trigger_reason>${enrichment}
</flow_analysis>`;

        // --- System Prompt (V2: Trilingual Output) ---
        const systemPrompt = `You are a senior institutional derivatives strategist at a top-tier investment bank, writing a professional Flow Intelligence analysis note.

<persona>
- You are THE expert in options market microstructure and institutional flow analysis
- You interpret options positioning the way a hedge fund PM would: connecting factors to build a STRUCTURAL thesis
- You understand gamma dynamics, dealer hedging mechanics, and how institutional positioning creates support/resistance
- You transform raw factor scores into ACTIONABLE INSIGHT about market structure
- Your analysis reveals what the "smart money" is positioning for and what structural catalysts could trigger repricing
</persona>

<language>
You MUST produce output in ALL THREE languages simultaneously: Korean (ko), English (en), and Japanese (ja).
- Korean: 네이티브 품질. 번역체 금지. 기관 파생상품 리서치 애널리스트급.
- English: Native quality. Institutional derivatives research tone.
- Japanese: ネイティブ品質。翻訳調禁止。機関デリバティブリサーチアナリスト級。
All three versions should convey the SAME analysis but with NATIVE expressions for each language.
Use ONLY observational language in all languages. No investment advice.
</language>

<output_format>
Return ONLY valid JSON (no markdown fences).
All text fields use { "ko": "...", "en": "...", "ja": "..." } trilingual structure.
{
  "structuralThesis": {
    "ko": "2-4문장. 핵심 구조적 테시스. 최소 3개 팩터를 연결하여 기관 포지셔닝 의도를 분석.",
    "en": "2-4 sentences. Main structural thesis connecting 3+ factors.",
    "ja": "2-4文。核心的構造テーゼ。3つ以上のファクターを連結して機関ポジショニング意図を分析。"
  },
  
  "factorHighlights": [
    {
      "factor": "Factor Name (e.g., Whale, OPI, Smart Money)",
      "insight": {
        "ko": "1-2문장. 이 팩터의 전문적 해석.",
        "en": "1-2 sentences. Professional interpretation.",
        "ja": "1-2文。このファクターの専門的解釈。"
      },
      "impact": "bull | bear | mixed"
    }
  ],
  
  "repricingCondition": {
    "ko": "1-2문장. 구조적 리프라이싱 트리거 조건.",
    "en": "1-2 sentences. Structural repricing trigger conditions.",
    "ja": "1-2文。構造的リプライシングトリガー条件。"
  },
  
  "riskAssessment": "HIGH | MEDIUM | LOW",
  "confidence": "HIGH | MEDIUM | LOW"
}
</output_format>

<critical_rules>
- DEPTH: Goldman Sachs derivatives research note level.
- CROSS-ANALYSIS: ALWAYS connect 2-3 factors together.
- FACTOR HIGHLIGHTS: Select 2-4 MOST significant factors only.
- ACCURACY: Use EXACT values from the XML data.
- COMPLIANCE (STRICT): You are an OBSERVER, not an advisor. Use ONLY observation-based language:
  → ALLOWED: "관찰됨/observed", "확인됨/noted", "시사함/suggests", "나타남/indicates"
  → FORBIDDEN: "~해야 한다/should", "매수/매도/buy/sell", "~될 것이다/will happen", "breakout expected"
  → ALL sentences must describe CURRENT or PAST conditions, NEVER predict future outcomes.
- ALPHA TRADE: If significant (>$100K), analyze strategic intent.
- CROSS-ASSET CONTEXT (if a <context> block is present): it carries evidence from OUTSIDE the options
  chain — insider transactions, the street target, the next earnings date, off-exchange (dark pool) share.
  → Use it ONLY where it CHANGES the read. Naming it without a consequence is noise.
  → It is most valuable when it CONTRADICTS the options structure. Say the contradiction plainly.
    e.g. call-heavy flow while insiders sell; price far above the street target while whales stay neutral;
    dated flow with elevated IV right before an earnings date (that is event positioning, not conviction).
  → If nothing in <context> changes the conclusion, ignore it entirely. Do not pad.
- EXPLAIN MECHANICS (CRITICAL): Do NOT merely state values. For each factor:
  → Explain the MECHANISM (WHY this reading matters for dealer/institutional positioning)
  → Explain the INTERACTION (HOW it connects to other factors in the structural thesis)
  → Example BAD: "OPI is +5, whale bias is bullish"
  → Example GOOD: "The +5 OPI reveals moderate call-side dominance, and when cross-referenced with bullish whale premium flow, this suggests institutional directional bets are aligning with options market structure — creating a self-reinforcing call demand loop."
</critical_rules>`;

        // --- Call Bedrock (with retry + fallback) ---
        const bedrockResult = await callBedrock({
            system: systemPrompt,
            userPrompt: xmlContext,
            maxTokens: 4096,
            temperature: 0.3,
            label: 'FlowAI',
            expectJson: true,
            locale: 'multi',
        });

        // Robust JSON parsing — handle markdown fences + trailing text
        let rawText = bedrockResult.text.trim();
        rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        const jsonStart = rawText.indexOf('{');
        if (jsonStart > 0) rawText = rawText.slice(jsonStart);
        
        let analysis;
        try {
            analysis = JSON.parse(rawText);
        } catch {
            // Haiku sometimes appends text after JSON — extract valid JSON
            let depth = 0, endIdx = -1;
            for (let i = 0; i < rawText.length; i++) {
                if (rawText[i] === '{') depth++;
                else if (rawText[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
            }
            if (endIdx > 0) {
                analysis = JSON.parse(rawText.slice(0, endIdx + 1));
            } else {
                throw new Error('Failed to parse AI response as JSON');
            }
        }
        const elapsed = Date.now() - startTime;

        // ★ 출구 대조 — 글 속 가격 수준은 생성 재료와 같아야 한다. 한 언어라도 틀리면 저장도 제공도 하지 않는다(화면은 폴백).
        const numCheck = checkFlowAnalysis(analysis, basis);
        if (!numCheck.ok) {
            console.warn(`[FlowAI] 숫자 불일치 — 저장·제공 안 함: ${TICKER} ${numCheck.reasons.join(' | ')}`);
            return NextResponse.json({ error: 'number_mismatch', ticker: TICKER, reasons: numCheck.reasons }, { status: 422 });
        }

        // --- Save to Redis (language-agnostic) ---
        const resultPayload = {
            ...analysis,
            ticker,
            session,
            triggerReason,
            generatedAt: new Date().toISOString(),
            elapsedMs: elapsed,
            model: bedrockResult.model,
            usedFallback: bedrockResult.usedFallback,
            basis,
        };

        const ttl = getSessionTTL(session);
        await setInCache(cacheKey, resultPayload, ttl);

        console.log(`[FlowAI] ✅ ${ticker} trilingual generated in ${elapsed}ms (trigger: ${triggerReason}, TTL: ${ttl}s, model: ${bedrockResult.model})`);

        return NextResponse.json({ ...resultPayload, fromCache: false });

    } catch (e: any) {
        console.error('[FlowAI] Error:', e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
