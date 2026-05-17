import { NextRequest, NextResponse } from 'next/server';
import { callBedrock, MODELS } from '@/services/bedrockClient';
import Redis from 'ioredis';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// Lazy Redis
let _redis: Redis | null = null;
function getRedis(): Redis {
    if (!_redis) _redis = new Redis(process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || '');
    return _redis;
}

// M7 + Popular tickers
const UNIVERSE = ['NVDA','TSLA','AAPL','MSFT','GOOGL','AMZN','META','AMD','PLTR','COIN','SMCI','ARM','MSTR','TSM','AVGO','NFLX','CRM','SNOW','BA','DIS'];

export async function POST(req: NextRequest) {
    try {
        const { email, mode, ticker, platform } = await req.json();
        if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const redis = getRedis();

        // ─── Gather market data from Redis ───
        let targetTickers: string[] = [];
        let marketContext = '';

        if (mode === 'ticker' && ticker) {
            targetTickers = [ticker.toUpperCase()];
        } else if (mode === 'auto' || mode === 'market') {
            // Auto: find top trending tickers from Redis data
            const todayKey = `content-center:history:${new Date().toISOString().slice(0, 10)}`;
            const usedToday = await redis.smembers(todayKey);

            // Fetch analysis data for all universe tickers
            const pipeline = redis.pipeline();
            for (const t of UNIVERSE) {
                pipeline.get(`cache:analysis:${t}`);
            }
            const results = await pipeline.exec();

            type TickerScore = { ticker: string; score: number; change: number; reason: string };
            const ranked: TickerScore[] = [];
            for (let i = 0; i < UNIVERSE.length; i++) {
                const raw = results?.[i]?.[1] as string | null;
                if (!raw) continue;
                try {
                    const d = JSON.parse(raw);
                    const change = Math.abs(d.changePct || d.changePercent || 0);
                    const score = (d.score || 0) + change * 2;
                    const reason = change > 3 ? '급등락' : d.score > 70 ? '고점수' : '활성';
                    if (!usedToday.includes(`${UNIVERSE[i]}:analysis`)) {
                        ranked.push({ ticker: UNIVERSE[i], score, change, reason });
                    }
                } catch {}
            }
            ranked.sort((a, b) => b.score - a.score);

            if (mode === 'auto') {
                targetTickers = ranked.slice(0, 2).map(r => r.ticker);
            }
        }

        // Fetch detailed data for target tickers
        const tickerDataMap: Record<string, any> = {};
        if (targetTickers.length > 0) {
            const pipe2 = redis.pipeline();
            for (const t of targetTickers) {
                pipe2.get(`cache:command:unified:${t}`);
            }
            const res2 = await pipe2.exec();
            for (let i = 0; i < targetTickers.length; i++) {
                const raw = res2?.[i]?.[1] as string | null;
                if (raw) {
                    try { tickerDataMap[targetTickers[i]] = JSON.parse(raw); } catch {}
                }
            }
        }

        // Fetch morning briefing for market context
        const briefRaw = await redis.get('cache:morning-briefing:ko');
        if (briefRaw) {
            try {
                const brief = JSON.parse(briefRaw);
                marketContext = brief.summary || brief.headline || '';
            } catch {}
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

        // Parse response
        let parsed: any;
        try {
            parsed = JSON.parse(result.text);
        } catch {
            // Try to extract JSON from text
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('AI response is not valid JSON');
            }
        }

        // Record history
        if (mode === 'auto' || mode === 'ticker') {
            const todayKey = `content-center:history:${new Date().toISOString().slice(0, 10)}`;
            const items = targetTickers.map(t => `${t}:analysis`);
            if (items.length > 0) {
                await redis.sadd(todayKey, ...items);
                await redis.expire(todayKey, 86400 * 4); // 4 days
            }
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

## 네이버 블로그 형식 규칙
- 문단: 2~3줄씩 짧게 끊기 (네이버 가독성)
- 소제목: ■ 또는 ▶ 로 구분
- 이미지 포인트: [📸 이미지: 설명] 형식으로 5개 이상 삽입
- 핵심 수치는 굵게 또는 따로 한 줄
- SEO 키워드 3~5회 자연 삽입
- 마지막에 "데이터 출처: signumhq.com" 포함
- 태그: # 형식으로 7~10개
- 길이: 1500~2500자

## 이미지 가이드 규칙
각 [📸 이미지] 포인트에 대해 imageGuide 배열에 다음 정보 포함:
- slot: 번호
- label: "어떤 영역인지"
- url: signumhq.com 대시보드 경로
- area: "캡처할 화면 영역 설명"

## 출력 형식 (JSON)
{
  "posts": [
    {
      "type": "analysis" | "market",
      "ticker": "TSLA" | null,
      "naver": {
        "title": "제목",
        "body": "본문 (문단 사이에 [📸 이미지: 설명] 포함)",
        "tags": "#미국주식 #TSLA #GEX분석 ..."
      },
      "tistory": {
        "title": "제목",
        "body": "본문 (네이버와 동일 포맷, 소제목 강조 약간 다름 가능)",
        "tags": "#미국주식 #TSLA #GEX분석 ..."
      },
      "imageGuide": [
        { "slot": 1, "label": "대시보드 헤더", "url": "/ko/dashboard/TSLA", "area": "헤더 지표 카드 영역" }
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
