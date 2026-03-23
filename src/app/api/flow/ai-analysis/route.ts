/**
 * POST /api/flow/ai-analysis
 * 
 * [V1.0] AI Flow Intelligence — Claude Sonnet 4
 * Professional options strategist analysis for the Flow Radar page.
 * 
 * Reads all 11 Flow factors (OPI, Whale, Squeeze, IV Skew, Smart Money, DEX, UOA, P/C, GEX)
 * plus positional context (price vs levels) → generates institutional-grade options analysis.
 * 
 * Triggers: FIRST_LOAD | SCHEDULED | PRICE_MOVE | SQUEEZE_CHANGE
 * Cache: Redis with session-aware TTL
 * 
 * COMPLIANCE: Observation-only language. No investment advice.
 */

import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { getFromCache, setInCache } from '@/services/redisClient';

export const maxDuration = 60;

const BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

// --- Bedrock Client (Singleton) ---
let _bedrockClient: BedrockRuntimeClient | null = null;
function getBedrock(): BedrockRuntimeClient {
    if (_bedrockClient) return _bedrockClient;
    _bedrockClient = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    });
    return _bedrockClient;
}

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
        if (!process.env.AWS_ACCESS_KEY_ID) {
            return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 500 });
        }

        const session = flowData?.session || 'CLOSED';
        const cacheKey = `ai-flow-analysis:${ticker}:${locale}`;

        // --- Check Cache (unless event trigger forces refresh) ---
        const forceRefresh = triggerReason === 'PRICE_MOVE' || triggerReason === 'SQUEEZE_CHANGE';
        if (!forceRefresh) {
            const cached = await getFromCache<any>(cacheKey);
            if (cached && cached.structuralThesis) {
                console.log(`[FlowAI] Cache HIT for ${ticker}:${locale}`);
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

        // --- System Prompt ---
        const langInstructions = locale === 'ko'
            ? `한국어로 네이티브 품질 작성. 번역체 절대 금지. 기관 파생상품 리서치 애널리스트가 작성하는 전문가급 분석.
목표: 모든 팩터의 교차 분석을 통해 "왜 이런 포지셔닝이 관찰되는지", "구조적으로 어떤 의미인지"를 블룸버그 터미널 이상의 깊이로 풀어냄.
"관찰됨", "확인됨", "시사됨", "나타남" 등 관찰적 표현만 사용. 투자 권유/매수매도 추천 엄격 금지.`
            : locale === 'ja'
                ? `日本語でネイティブ品質の文章を作成。翻訳調禁止。機関デリバティブリサーチアナリストが執筆する専門家級分析。
目標：全ファクターのクロス分析により「なぜこのポジショニングが観測されるのか」「構造的にどのような意味があるのか」をBloombergターミナル以上の深さで解説。
「観測された」「確認された」「示唆される」等の観察的表現のみ使用。投資勧誘・売買推奨は厳禁。`
                : `Write in native-quality English. Senior institutional derivatives research analyst tone.
Goal: Cross-analyze all factors to explain WHY these positioning patterns are observed and WHAT they structurally mean, with depth exceeding Bloomberg Terminal analysis.
Use ONLY observational language: "observed", "noted", "suggests", "indicates". Investment advice and buy/sell recommendations are STRICTLY FORBIDDEN.`;

        const systemPrompt = `You are a senior institutional derivatives strategist at a top-tier investment bank, writing a professional Flow Intelligence analysis note.

<persona>
- You are THE expert in options market microstructure and institutional flow analysis
- You interpret options positioning the way a hedge fund PM would: connecting factors to build a STRUCTURAL thesis
- You understand gamma dynamics, dealer hedging mechanics, and how institutional positioning creates support/resistance
- You transform raw factor scores into ACTIONABLE INSIGHT about market structure
- Your analysis reveals what the "smart money" is positioning for and what structural catalysts could trigger repricing
</persona>

<language>
${langInstructions}
</language>

<output_format>
Return ONLY valid JSON (no markdown fences).
ALL text values (structuralThesis, factor insights, repricingCondition) MUST be written in ${locale === 'ko' ? 'Korean (한국어)' : locale === 'ja' ? 'Japanese (日本語)' : 'English'}.
{
  "structuralThesis": "2-4 sentences. The MAIN structural thesis: What is the dominant positioning pattern observed? Why is it structurally significant? Connect at least 3 factors to build a cohesive narrative about institutional intent. This is the PRIMARY analysis — deep, professional, Bloomberg-exceeding quality.",
  
  "factorHighlights": [
    {
      "factor": "Factor Name (e.g., Whale, OPI, Smart Money)",
      "insight": "1-2 sentences. Professional interpretation of THIS specific factor: WHY it shows this value, WHAT it means structurally, HOW it connects to other factors.",
      "impact": "bull | bear | mixed"
    }
  ],
  
  "repricingCondition": "1-2 sentences. SPECIFIC conditions that would trigger a structural repricing. Include exact price levels (put floor, call wall) and what mechanism would activate (gamma flip, squeeze trigger, wall break).",
  
  "riskAssessment": "HIGH | MEDIUM | LOW",
  "confidence": "HIGH | MEDIUM | LOW"
}
</output_format>

<critical_rules>
- DEPTH: Write at the level of a Goldman Sachs derivatives research note. Each sentence should reveal insight that a retail trader cannot see on their own.
- CROSS-ANALYSIS: Never analyze factors in isolation. ALWAYS connect at least 2-3 factors together to reveal structural patterns (e.g., ${locale === 'ko' ? '"역감마 진입과 동시에 스마트머니 매도가 관찰되며, 이는 기관의 방어적 전환을 구조적으로 시사함"' : locale === 'ja' ? '"逆ガンマ移行と同時にスマートマネーの売りが観測され、これは機関の防御的転換を構造的に示唆する"' : '"The simultaneous entry into short gamma alongside observed smart money selling structurally suggests an institutional defensive pivot"'}).
- FACTOR HIGHLIGHTS: Select the 2-4 MOST significant factors (not all 9). Focus on factors that tell the most important story.
- ACCURACY: Use EXACT values from the XML data. Do NOT invent or approximate numbers.
- COMPLIANCE: STRICTLY observational language only. NO investment advice, NO buy/sell recommendations, NO "should" or "consider buying/selling". Only describe what IS observed and what it structurally IMPLIES.
- ALPHA TRADE: If a significant alpha trade is detected (>$100K), analyze its strategic intent (hedging vs directional bet vs spread).
- EXPLAIN MECHANICS: Don't just say "OPI is bullish" — explain WHY: ${locale === 'ko' ? '"OPI +25의 콜 우위 집중은 단기 만기 콜 매수의 증가에서 기인하며, 이는 기관의 방향성 베팅보다 딜러 헤징 수요에 의한 것으로 해석됨"' : locale === 'ja' ? '"OPI +25のコール優位集中は短期満期コール買いの増加に起因し、これは機関の方向性ベットよりディーラーヘッジ需要によるものと解釈される"' : '"The OPI +25 call dominance concentration stems from increased near-term expiry call buying, interpreted as driven by dealer hedging demand rather than institutional directional betting"'}
- LANGUAGE: ALL output text MUST be in ${locale === 'ko' ? 'Korean (한국어)' : locale === 'ja' ? 'Japanese (日本語)' : 'English'}. Do NOT mix languages.
</critical_rules>`;

        const userPrompt = xmlContext;

        // --- Call Claude Sonnet 4 ---
        const client = getBedrock();
        const command = new InvokeModelCommand({
            modelId: BEDROCK_MODEL,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 4096,
                temperature: 0.3,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: userPrompt },
                    { role: 'assistant', content: '{' },
                ],
            }),
        });

        const result = await Promise.race([
            client.send(command),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Claude timeout 55s')), 55000))
        ]);

        const responseBody = JSON.parse(new TextDecoder().decode(result.body));
        const rawText = '{' + (responseBody.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();

        if (!rawText || rawText === '{') {
            return NextResponse.json({ error: 'Claude returned empty response' }, { status: 500 });
        }

        const analysis = JSON.parse(rawText);
        const elapsed = Date.now() - startTime;

        // --- Save to Redis ---
        const resultPayload = {
            ...analysis,
            ticker,
            locale,
            session,
            triggerReason,
            generatedAt: new Date().toISOString(),
            elapsedMs: elapsed,
            model: 'claude-sonnet-4',
        };

        const ttl = getSessionTTL(session);
        await setInCache(cacheKey, resultPayload, ttl);

        console.log(`[FlowAI] ✅ ${ticker}:${locale} generated in ${elapsed}ms (trigger: ${triggerReason}, TTL: ${ttl}s)`);

        return NextResponse.json({ ...resultPayload, fromCache: false });

    } catch (e: any) {
        console.error('[FlowAI] Error:', e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
