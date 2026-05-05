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
 * Cache: Redis with session-aware TTL (key: ai-flow-analysis:${ticker})
 * POLICY: Observation-only language. No investment advice.
 */

import { NextResponse } from 'next/server';
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { getFromCache, setInCache } from '@/services/redisClient';

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

export async function POST(req: Request) {
    const startTime = Date.now();

    try {
        const body = await req.json();
        const { ticker, locale = 'ko', flowData, triggerReason = 'FIRST_LOAD' } = body;

        if (!ticker) {
            return NextResponse.json({ error: 'ticker required' }, { status: 400 });
        }

        const session = flowData?.session || 'CLOSED';
        // V2: Language-agnostic cache key — one generation serves all locales
        const cacheKey = `ai-flow-analysis:${ticker}`;

        // --- Check Cache (unless event trigger forces refresh) ---
        const forceRefresh = triggerReason === 'PRICE_MOVE' || triggerReason === 'SQUEEZE_CHANGE' || triggerReason === 'MANUAL_REFRESH';
        if (!forceRefresh) {
            const cached = await getFromCache<any>(cacheKey);
            if (cached && cached.structuralThesis) {
                console.log(`[FlowAI] Cache HIT for ${ticker} (locale: ${locale})`);
                return NextResponse.json({ ...cached, fromCache: true });
            }
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
    <gamma_flip_level price="$${regime.gammaFlipLevel || 'N/A'}" gamma_zone="${d.currentPrice > (regime.gammaFlipLevel || 0) ? 'LONG_GAMMA' : 'SHORT_GAMMA'}" />
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
    <implied_move value="${regime.impliedMove || 'N/A'}" />
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
  <trigger_reason>${triggerReason}</trigger_reason>
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
