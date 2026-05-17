import { NextRequest, NextResponse } from 'next/server';
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { getFromCache, mgetFromCache, setInCache } from '@/services/redisClient';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// M7 + Popular tickers
const UNIVERSE = ['NVDA','TSLA','AAPL','MSFT','GOOGL','AMZN','META','AMD','PLTR','COIN','SMCI','ARM','MSTR','TSM','AVGO','NFLX','CRM','SNOW','BA','DIS'];

export async function POST(req: NextRequest) {
    try {
        const { email, mode, ticker, platform } = await req.json();
        if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ─── Gather market data from Redis ───
        let targetTickers: string[] = [];
        let marketContext = '';

        if (mode === 'ticker' && ticker) {
            targetTickers = [ticker.toUpperCase()];
        } else if (mode === 'auto' || mode === 'market') {
            // Auto: find top trending tickers from Redis data
            const todayKey = `content-center:history:${new Date().toISOString().slice(0, 10)}`;
            const usedTodayRaw = await getFromCache<string[]>(todayKey);
            const usedToday = usedTodayRaw || [];

            // Fetch analysis data for all universe tickers (batch)
            const analysisKeys = UNIVERSE.map(t => `cache:analysis:${t}`);
            const analysisResults = await mgetFromCache<any>(analysisKeys);

            type TickerScore = { ticker: string; score: number; change: number; reason: string };
            const ranked: TickerScore[] = [];
            for (let i = 0; i < UNIVERSE.length; i++) {
                const d = analysisResults[i];
                if (!d) continue;
                try {
                    const data = typeof d === 'string' ? JSON.parse(d) : d;
                    const change = Math.abs(data.changePct || data.changePercent || 0);
                    const score = (data.score || 0) + change * 2;
                    const reason = change > 3 ? '급등락' : data.score > 70 ? '고점수' : '활성';
                    if (!usedToday.includes(`${UNIVERSE[i]}:analysis`)) {
                        ranked.push({ ticker: UNIVERSE[i], score, change, reason });
                    }
                } catch {}
            }
            ranked.sort((a, b) => b.score - a.score);

            if (mode === 'auto') {
                targetTickers = ranked.slice(0, 2).map(r => r.ticker);
                // Fallback: if less than 2 ranked, use first available
                if (targetTickers.length === 0) {
                    targetTickers = UNIVERSE.slice(0, 2);
                }
            } else {
                // market mode: pick top 3 for context
                targetTickers = ranked.slice(0, 3).map(r => r.ticker);
            }
        }

        // Fetch detailed data for target tickers (batch)
        const tickerDataMap: Record<string, any> = {};
        if (targetTickers.length > 0) {
            const detailKeys = targetTickers.map(t => `cache:command:unified:${t}`);
            const detailResults = await mgetFromCache<any>(detailKeys);
            for (let i = 0; i < targetTickers.length; i++) {
                const d = detailResults[i];
                if (d) {
                    tickerDataMap[targetTickers[i]] = typeof d === 'string' ? JSON.parse(d) : d;
                }
            }
        }

        // Fetch morning briefing for market context
        const briefData = await getFromCache<any>('cache:morning-briefing:ko');
        if (briefData) {
            const brief = typeof briefData === 'string' ? JSON.parse(briefData) : briefData;
            marketContext = brief.summary || brief.headline || '';
        }

        // ─── Build AI prompt ───
        const systemPrompt = buildSystemPrompt(platform || 'naver');
        const userPrompt = buildUserPrompt(mode, targetTickers, tickerDataMap, marketContext);

        const result = await callBedrock({
            modelId: MODELS.HAIKU_35,
            system: systemPrompt,
            userPrompt,
            maxTokens: 6000,
            temperature: 0.7,
            jsonPrefill: true,
            label: 'ContentCenter',
            timeoutMs: 50000,
        });

        // Parse response — robust JSON recovery for Korean blog content
        let parsed: any;
        const rawText = result.text;
        
        // Attempt 1: direct parse
        try {
            parsed = JSON.parse(rawText);
        } catch (e1) {
            // Attempt 2: extract outermost JSON object
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch (e2) {
                    // Attempt 3: fix common JSON issues in AI output
                    let fixed = jsonMatch[0];
                    // Fix unescaped newlines inside string values
                    fixed = fixed.replace(/(?<=":[ ]*"[^"]*)\n/g, '\\n');
                    // Fix trailing commas before }]
                    fixed = fixed.replace(/,\s*([}\]])/g, '$1');
                    try {
                        parsed = JSON.parse(fixed);
                    } catch (e3) {
                        // Attempt 4: use more aggressive cleanup
                        try {
                            // Extract posts array manually
                            const postsMatch = rawText.match(/"posts"\s*:\s*\[[\s\S]*\]/);
                            if (postsMatch) {
                                parsed = JSON.parse(`{${postsMatch[0]}}`);
                            } else {
                                throw new Error(`AI JSON parse failed: ${(e1 as Error).message}`);
                            }
                        } catch {
                            throw new Error(`AI JSON parse failed after 4 attempts: ${(e1 as Error).message}`);
                        }
                    }
                }
            } else {
                throw new Error('AI response contains no JSON object');
            }
        }

        // Record history (store as array in cache)
        if (mode === 'auto' || mode === 'ticker') {
            const todayKey = `content-center:history:${new Date().toISOString().slice(0, 10)}`;
            const existing = await getFromCache<string[]>(todayKey) || [];
            const newItems = targetTickers.map(t => `${t}:analysis`);
            const merged = Array.from(new Set([...existing, ...newItems]));
            await setInCache(todayKey, merged, 86400 * 4);
        }

        return NextResponse.json({
            success: true,
            mode,
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

function buildSystemPrompt(platform: string): string {
    return `당신은 SIGNUM HQ의 미국 주식 시장 분석 블로그 작성 전문가입니다.

## 역할
- 관찰자/리뷰어 톤으로 작성 (투자 조언 X, 데이터 분석 리뷰)
- "이 도구의 데이터를 살펴보니" 식의 제3자 시점
- 전문적이지만 쉽게 읽히는 문체

## ⚠️ JSON 안전 규칙 (절대 준수)
- 모든 문자열 값 안의 큰따옴표는 반드시 \\"로 이스케이프
- 줄바꿈은 반드시 \\n으로 표현 (실제 개행 금지)
- JSON 이외의 텍스트 출력 금지

## 네이버 블로그 형식 규칙 (한국어)
- 문단: 2~3줄씩 짧게 끊기 (네이버 가독성)
- 소제목: ■ 또는 ▶ 로 구분
- 이미지 포인트: [IMAGE: 설명] 형식으로 5개 이상 삽입
- 핵심 수치는 굵게 또는 따로 한 줄
- SEO 키워드: 미국주식, GEX분석, 다크풀, 옵션플로우 등 3~5회 자연 삽입
- 마지막에 "데이터 출처: signumhq.com" 포함
- 태그: # 형식으로 7~10개
- 길이: 1500~2500자

## 티스토리 형식 규칙 (한국어)
- 네이버와 유사하되 소제목에 ## 마크다운 사용 가능
- 본문 흐름 자연스럽게

## Medium 형식 규칙 (영어)
- Language: English only
- Tone: Data-driven analyst, third-person perspective
- Structure: Hook paragraph → Data breakdown → Analysis → CTA
- Headers: ## style (Medium supports markdown headers)
- Image points: [IMAGE: description] format, 4~5 insertions
- SEO keywords: GEX, dark pool, options flow, institutional analysis
- End with: "Data source: signumhq.com — Institutional Intelligence, Democratized"
- Tags (5): e.g., "Stock Market, Options Trading, GEX Analysis, Dark Pool, Institutional Trading"
- Length: 800~1500 words

## note.com 形式ルール (日本語)
- 言語: 日本語のみ
- トーン: データ分析レビュアー、第三者の視点
- 構成: フック段落 → データ分析 → 考察 → CTA
- 見出し: ■ または ## で区分
- 画像ポイント: [IMAGE: 説明] 形式、4~5個挿入
- SEOキーワード: 米国株、GEX分析、ダークプール、オプションフロー
- 末尾に: "データソース: signumhq.com"
- タグ (5~7): 例: #米国株 #TSLA #GEX分析 #オプション #機関投資家
- 文字数: 1000~2000文字

## 이미지 가이드 규칙
각 [IMAGE] 포인트에 대해 imageGuide 배열에 다음 정보 포함:
- slot: 번호
- label: 어떤 영역인지
- url: signumhq.com 대시보드 경로
- area: 캡처할 화면 영역 설명

## 출력 형식 (반드시 유효한 JSON)
{
  "posts": [
    {
      "type": "analysis",
      "ticker": "TSLA",
      "naver": {
        "title": "제목",
        "body": "본문 내용 (줄바꿈은 \\\\n으로)",
        "tags": "#미국주식 #TSLA"
      },
      "tistory": {
        "title": "제목",
        "body": "본문 내용",
        "tags": "#미국주식 #TSLA"
      },
      "medium": {
        "title": "English Title",
        "body": "English body content",
        "tags": "Stock Market, Options Trading"
      },
      "note": {
        "title": "日本語タイトル",
        "body": "日本語本文",
        "tags": "#米国株 #TSLA #GEX分析"
      },
      "imageGuide": [
        { "slot": 1, "label": "Dashboard header", "url": "/en/dashboard/TSLA", "area": "Header metrics cards" }
      ]
    }
  ]
}`;
}

function buildUserPrompt(mode: string, tickers: string[], dataMap: Record<string, any>, marketContext: string): string {
    let prompt = '';

    if (mode === 'market') {
        prompt = `## 요청: 시황/이슈 기반 블로그 글 1개 작성

오늘의 시장 상황:
${marketContext || '일반적인 미국 주식 시장 거래일'}

트렌딩 종목들의 데이터:
${Object.entries(dataMap).map(([t, d]) => `${t}: 가격 $${d?.price || d?.currentPrice || '?'}, 변동 ${d?.changePct || d?.changePercent || '?'}%, GEX ${d?.gex || '?'}, 다크풀 ${d?.darkPoolPct || d?.darkPool?.pct || '?'}%`).join('\n')}

이슈가 될만한 내용을 찾아서 관심을 끌 수 있는 제목과 본문을 작성해주세요.
예시: "버크셔 vs 애크먼", "연준 금리와 옵션 시장", "실적 시즌 포지션 분석" 등`;

    } else if (mode === 'auto') {
        prompt = `## 요청: 자동 생성 — 종목 분석 블로그 글 ${tickers.length}개 + 시황 1개 = 총 ${tickers.length + 1}개 작성

선별된 종목: ${tickers.join(', ')}

각 종목의 실시간 데이터:
${tickers.map(t => {
    const d = dataMap[t];
    if (!d) return `${t}: 데이터 없음`;
    return `${t}: 가격 $${d?.price || d?.currentPrice || '?'}, 변동 ${d?.changePct || d?.changePercent || '?'}%, Score ${d?.score || d?.alphaScore || '?'}, GEX $${d?.gex || '?'}, 다크풀 ${d?.darkPoolPct || d?.darkPool?.pct || '?'}%, Smart Flow ${d?.whaleIndex || d?.smartFlow || '?'}`;
}).join('\n')}

시장 컨텍스트:
${marketContext || '일반 거래일'}

종목 분석 ${tickers.length}개 + 시황/이슈 1개를 posts 배열에 총 ${tickers.length + 1}개 작성해주세요.
각 글은 서로 다른 관점에서 작성. 중복 내용 없이.`;

    } else {
        // ticker mode
        const t = tickers[0];
        const d = dataMap[t];
        prompt = `## 요청: ${t} 종목 분석 블로그 글 1개 작성

${t} 실시간 데이터:
- 가격: $${d?.price || d?.currentPrice || '?'}
- 변동: ${d?.changePct || d?.changePercent || '?'}%
- Alpha Score: ${d?.score || d?.alphaScore || '?'}
- GEX: $${d?.gex || '?'}
- 다크풀 비율: ${d?.darkPoolPct || d?.darkPool?.pct || '?'}%
- Smart Flow: ${d?.whaleIndex || d?.smartFlow || '?'}
- RSI: ${d?.rsi || '?'}
- IV Skew: ${d?.ivSkew || '?'}
- SMA 20: ${d?.sma20 || '?'}
- 추세: ${d?.trendPhase || d?.trend || '?'}

이 데이터를 기반으로 전문적이고 흥미로운 분석 블로그 글을 작성해주세요.
posts 배열에 1개만.`;
    }

    return prompt;
}
