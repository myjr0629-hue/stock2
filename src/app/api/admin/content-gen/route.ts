import { NextRequest, NextResponse } from 'next/server';
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { getFromCache, mgetFromCache, setInCache } from '@/services/redisClient';

// Vercel Pro: allow up to 60s
export const maxDuration = 60;

const UNIVERSE = ['NVDA','TSLA','AAPL','MSFT','GOOGL','AMZN','META','AMD','PLTR','COIN','SMCI','ARM','MSTR','TSM','AVGO','NFLX','CRM','SNOW','BA','DIS'];

export async function POST(req: NextRequest) {
    try {
        const { email, mode, ticker, platform } = await req.json();
        if (!email) {
            return NextResponse.json({ error: 'Missing email' }, { status: 400 });
        }
        if (!platform || !['naver','tistory','medium','note'].includes(platform)) {
            return NextResponse.json({ error: 'Missing or invalid platform' }, { status: 400 });
        }

        // ─── Gather market data from Redis ───
        let targetTickers: string[] = [];
        let marketContext = '';

        if (mode === 'ticker' && ticker) {
            targetTickers = [ticker.toUpperCase()];
        } else if (mode === 'auto' || mode === 'market') {
            const todayKey = `content-center:history:${new Date().toISOString().slice(0, 10)}`;
            const usedTodayRaw = await getFromCache<string[]>(todayKey);
            const usedToday = usedTodayRaw || [];

            const analysisKeys = UNIVERSE.map(t => `cache:analysis:${t}`);
            const analysisResults = await mgetFromCache<any>(analysisKeys);

            type TickerScore = { ticker: string; score: number; change: number };
            const ranked: TickerScore[] = [];
            for (let i = 0; i < UNIVERSE.length; i++) {
                const d = analysisResults[i];
                if (!d) continue;
                try {
                    const data = typeof d === 'string' ? JSON.parse(d) : d;
                    const change = Math.abs(data.changePct || data.changePercent || 0);
                    const score = (data.score || 0) + change * 2;
                    if (!usedToday.includes(`${UNIVERSE[i]}:analysis`)) {
                        ranked.push({ ticker: UNIVERSE[i], score, change });
                    }
                } catch {}
            }
            ranked.sort((a, b) => b.score - a.score);

            if (mode === 'auto') {
                targetTickers = ranked.slice(0, 1).map(r => r.ticker);
                if (targetTickers.length === 0) targetTickers = [UNIVERSE[0]];
            } else {
                targetTickers = ranked.slice(0, 2).map(r => r.ticker);
                if (targetTickers.length === 0) targetTickers = UNIVERSE.slice(0, 2);
            }
        }

        // Fetch detailed data
        const tickerDataMap: Record<string, any> = {};
        if (targetTickers.length > 0) {
            const detailKeys = targetTickers.map(t => `cache:command:unified:${t}`);
            const detailResults = await mgetFromCache<any>(detailKeys);
            for (let i = 0; i < targetTickers.length; i++) {
                const d = detailResults[i];
                if (d) tickerDataMap[targetTickers[i]] = typeof d === 'string' ? JSON.parse(d) : d;
            }
        }

        const briefData = await getFromCache<any>('cache:morning-briefing:ko');
        if (briefData) {
            const brief = typeof briefData === 'string' ? JSON.parse(briefData) : briefData;
            marketContext = brief.summary || brief.headline || '';
        }

        // ─── Build AI prompt (single platform only) ───
        const systemPrompt = buildSystemPrompt(platform);
        const userPrompt = buildUserPrompt(mode, targetTickers, tickerDataMap, marketContext, platform);

        const result = await callBedrock({
            modelId: MODELS.HAIKU_35,
            system: systemPrompt,
            userPrompt,
            maxTokens: 4096,
            temperature: 0.7,
            jsonPrefill: true,
            label: `ContentCenter-${platform}`,
            timeoutMs: 45000,
        });

        // Parse response
        let parsed: any;
        try {
            parsed = JSON.parse(result.text);
        } catch {
            // Try to repair
            let raw = result.text;
            const jsonStart = raw.indexOf('{');
            if (jsonStart >= 0) raw = raw.substring(jsonStart);
            // Close unclosed strings/brackets
            let inStr = false;
            for (let i = 0; i < raw.length; i++) {
                if (raw[i] === '"' && (i === 0 || raw[i-1] !== '\\')) inStr = !inStr;
            }
            if (inStr) raw += '"';
            const braces: string[] = [];
            for (const ch of raw) {
                if (ch === '{') braces.push('}');
                else if (ch === '[') braces.push(']');
                else if (ch === '}' || ch === ']') braces.pop();
            }
            raw = raw.replace(/,\s*$/, '');
            raw += braces.reverse().join('');
            try {
                parsed = JSON.parse(raw);
            } catch (e2) {
                throw new Error(`JSON parse failed: ${(e2 as Error).message}`);
            }
        }

        // Record history
        if (mode === 'auto' || mode === 'ticker') {
            const todayKey = `content-center:history:${new Date().toISOString().slice(0, 10)}`;
            const existing = await getFromCache<string[]>(todayKey) || [];
            const newItems = targetTickers.map(t => `${t}:${platform}`);
            const merged = Array.from(new Set([...existing, ...newItems]));
            await setInCache(todayKey, merged, 86400 * 4);
        }

        return NextResponse.json({
            success: true,
            mode,
            platform,
            tickers: targetTickers,
            content: parsed,
            model: result.model,
            elapsedMs: result.elapsedMs,
        });

    } catch (err: any) {
        console.error('[ContentCenter] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ─── System prompts per platform ───
function buildSystemPrompt(platform: string): string {
    const common = `당신은 SIGNUM HQ의 미국 주식 시장 분석 블로그 작성 전문가입니다.

## 역할
- 관찰자/리뷰어 톤 (투자 조언 X, 데이터 분석 리뷰)
- 전문적이지만 쉽게 읽히는 문체

## ⚠️ JSON 규칙 (절대 준수)
- 모든 문자열 내 큰따옴표 → \\"
- 줄바꿈 → \\n (실제 개행 금지)
- JSON 이외 출력 금지`;

    const rules: Record<string, string> = {
        naver: `## 네이버 블로그 (한국어)
- 문단: 2~3줄씩 짧게 끊기
- 소제목: ■ 또는 ▶ 사용
- 이미지: [IMAGE: 설명] 5개 이상
- SEO: 미국주식, GEX분석, 다크풀 등 3~5회
- 마지막: "데이터 출처: signumhq.com"
- 태그: # 형식 7~10개
- 길이: 1500~2500자`,

        tistory: `## 티스토리 (한국어)
- 소제목: ## 마크다운 사용
- 이미지: [IMAGE: 설명] 4~5개
- SEO: 미국주식, 옵션분석, 기관투자자 등 3~5회
- 마지막: "데이터 출처: signumhq.com"
- 태그: # 형식 7~10개
- 길이: 1500~2500자`,

        medium: `## Medium (English only)
- Tone: Data-driven analyst, third-person
- Structure: Hook → Data → Analysis → CTA
- Headers: ## markdown style
- Images: [IMAGE: description] 4~5 points
- SEO: GEX, dark pool, options flow, institutional
- End: "Data source: signumhq.com — Institutional Intelligence, Democratized"
- Tags (5): Stock Market, Options Trading, etc.
- Length: 800~1500 words`,

        note: `## note.com (日本語のみ)
- トーン: データ分析レビュアー、第三者視点
- 見出し: ■ または ## で区分
- 画像: [IMAGE: 説明] 4~5個
- SEO: 米国株、GEX分析、ダークプール、オプション
- 末尾: "データソース: signumhq.com"
- タグ: #米国株 #GEX分析 等 5~7個
- 文字数: 1000~2000文字`,
    };

    return `${common}

${rules[platform] || rules.naver}

## 출력 (유효한 JSON)
{
  "title": "제목",
  "body": "본문 (줄바꿈은 \\\\n)",
  "tags": "#태그1 #태그2",
  "imageGuide": [
    { "slot": 1, "label": "영역명", "url": "/dashboard/TSLA", "area": "설명" }
  ]
}`;
}

function buildUserPrompt(mode: string, tickers: string[], dataMap: Record<string, any>, marketContext: string, platform: string): string {
    const lang = platform === 'medium' ? 'in English' : platform === 'note' ? '日本語で' : '한국어로';

    if (mode === 'market') {
        return `## ${lang} 시황/이슈 블로그 글 1개 작성

시장 상황: ${marketContext || '일반 거래일'}
트렌딩: ${Object.entries(dataMap).map(([t, d]) => `${t}: $${d?.price || '?'}, ${d?.changePct || '?'}%`).join(', ')}

이슈가 될 만한 내용으로 작성해주세요.`;
    }

    const t = tickers[0];
    const d = dataMap[t];
    return `## ${t} 종목 분석 블로그 글 1개 ${lang} 작성

${t} 데이터:
- 가격: $${d?.price || d?.currentPrice || '?'}
- 변동: ${d?.changePct || d?.changePercent || '?'}%
- Score: ${d?.score || d?.alphaScore || '?'}
- GEX: $${d?.gex || '?'}
- 다크풀: ${d?.darkPoolPct || d?.darkPool?.pct || '?'}%
- Smart Flow: ${d?.whaleIndex || d?.smartFlow || '?'}
- RSI: ${d?.rsi || '?'}

시장: ${marketContext || '일반 거래일'}

이 데이터 기반으로 전문적이고 흥미로운 분석 글 작성.`;
}
