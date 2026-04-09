import { callBedrock } from '../src/services/bedrockClient';

const systemPrompt = `You are a senior institutional equity research analyst writing a DEEP ANALYSIS NOTE.

<persona>
- You write like a Goldman Sachs or Morgan Stanley research team
- Your analysis connects indicators to tell a STORY, not list data points
- News is woven naturally into the narrative as supporting evidence or context
- The current state assessment is crystal clear
- You go DEEP — explain WHY indicators matter, how they RELATE to each other
</persona>

<language>
You MUST produce output in ALL THREE languages simultaneously: Korean (ko), English (en), Japanese (ja).
- Korean: 네이티브 품질. 번역체 금지. 기관 리서치 애널리스트급. "관찰됨" 등 관찰적 표현.
</language>

<output_format>
Return ONLY valid JSON (no markdown fences).
All text fields use { "ko": "...", "en": "...", "ja": "..." } trilingual structure.
{
  "currentState": { "ko": "1줄 현재 상태 핵심 판단" },
  "sections": [
    { "title": { "ko": "기술적 구조 분석" }, "content": { "ko": "2-4문장" } },
    { "title": { "ko": "옵션 포지셔닝" }, "content": { "ko": "2-3문장" } },
    { "title": { "ko": "뉴스 및 시장 맥락" }, "content": { "ko": "2-3문장" } }
  ],
  "keyInsight": { "ko": "핵심 인사이트 1줄" },
  "riskFlag": "HIGH | MEDIUM | LOW | NONE",
  "confidence": "HIGH | MEDIUM | LOW"
}
</output_format>

<critical_rules>
- SECTIONS: 3 sections with clear titles. Each section 2-4 sentences of DEEP analysis.
- DATA ACCURACY: Use EXACT values from the XML data. call_wall ≠ gamma_flip_level.
- NO DUPLICATE METRICS: Focus purely on narrative insight.
- NEWS INTEGRATION: DO NOT alter the core focus of 'News & Market Context'. Keep focusing entirely on the geopolitical risks and company news as before.
- NEW GAUGES INTEGRATION: The XML now provides <context_score> (overall momentum/fundamentals) and <smart_flow> (institutional money flow).
   -> MUST blend <context_score> NATURALLY into "Technical Structure Analysis".
   -> MUST blend <smart_flow> NATURALLY into "Options Positioning".
   -> IMPORTANT: Do NOT make the entire section about these two scores. They should act as supporting evidence (e.g., "The SMA golden cross is further validated by a solid Context Score of 66...") alongside the existing deep technical/options indicators.
- FORBIDDEN: investment advice, emojis.
</critical_rules>`;

const xmlContext = `<ticker_analysis ticker="NVDA" price="$182.08" session="REG" price_change="-0.62%">
  <signal_core direction="BULLISH" conviction="MIXED" condition="TREND">
    <conclusion>GOLDEN CROSS</conclusion>
  </signal_core>
  
  <high_level_gauges>
    <context_score value="66" grade="FAVORABLE"/>
    <smart_flow value="65" trend="INFLOW TREND"/>
  </high_level_gauges>

  <technicals>
    <sma cross="GOLDEN" sma50="182.23" sma200="180.34"/>
    <vwap value="182.26" distance="-0.10%"/>
    <conviction score="50" grade="C"/>
    <trend_phase>GOLDEN</trend_phase>
  </technicals>
  
  <options_flow>
    <net_gex>-266.9M</net_gex>
    <gamma_flip_level note="THIS_IS_NOT_CALL_WALL">$175 (LONG_GAMMA zone)</gamma_flip_level>
    <pc_ratio>0.66</pc_ratio>
    <call_wall note="HIGHEST_CALL_CONCENTRATION">$182.5</call_wall>
    <put_floor note="HIGHEST_PUT_CONCENTRATION">$170</put_floor>
    <max_pain>$175</max_pain>
    <net_premium>+$42.9M (CALL dominant)</net_premium>
  </options_flow>
  
  <news recency_weighted="true" count="2">
    <article age="1h" sentiment="positive" source="Reuters">Geopolitical risks ease with Iran ceasefire, Mag 7 rallies</article>
    <article age="3h" sentiment="positive" source="Bloomberg">NVDA $2B investment in Marvell Tech for NVLink ecosystem</article>
  </news>
</ticker_analysis>`;

async function run() {
    try {
        require('dotenv').config({ path: '.env.local' });
        console.log("Analyzing NVDA with Context Score and Smart Flow...");
        const res = await callBedrock({
            system: systemPrompt,
            userPrompt: xmlContext,
            maxTokens: 4096,
            temperature: 0.4,
            label: 'TestInsight'
        });
        
        let outputText = res.text;
        
        // Extract and display just the Korean sections for easier reading
        try {
            const aiJson = JSON.parse(outputText);
            console.log("\\n===== AI 응답 (한국어만 추출) =====\\n");
            console.log("[Current State]");
            console.log(aiJson.currentState.ko || aiJson.currentState);
            console.log("\\n[기술적 구조 분석]");
            console.log(aiJson.sections[0].content.ko || aiJson.sections[0].content);
            console.log("\\n[옵션 포지셔닝]");
            console.log(aiJson.sections[1].content.ko || aiJson.sections[1].content);
            console.log("\\n[뉴스 및 시장 맥락]");
            console.log(aiJson.sections[2].content.ko || aiJson.sections[2].content);
            console.log("\\n[Key Insight]");
            console.log(aiJson.keyInsight.ko || aiJson.keyInsight);
        } catch(e) {
            console.log("Raw Output:\\n", outputText);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
