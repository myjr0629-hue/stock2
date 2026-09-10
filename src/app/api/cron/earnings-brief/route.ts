// ============================================================================
// 실적 캘린더에 «회사 이름»과 «이번 분기 관전 포인트»를 붙인다.
// ----------------------------------------------------------------------------
// 지금 화면에 있는 것 (실측 2026-09-10):
//     ORCL   9/10   장 마감 후   EPS 1.74   매출 $19.13B      ← 이게 전부
//   티커·날짜·숫자뿐이라 «무슨 회사인지», «뭘 봐야 하는지»를 알 수 없다.
//   캘린더에는 162개 회사가 들어 있는데 전부 이 상태다.
//
// 왜 이 자리에 «가벼운 모델»을 쓰나 — 실측으로 정한 것이다.
//   모델별 한도를 재보니 Claude 만 0.1% 로 묶여 있었다(RPM 10).
//   Nova Lite 는 RPM 200 이고 단가가 1/18 이다. 162종목 × 3개국어는
//   RPM 10 으로는 한 번에 못 돈다 — 이건 «호출량이 필요한» 작업이다.
//   그리고 작업 성격이 «회사명 현지화 + 정형 서술»이라 번역성에 가깝다.
//   실측 벤치마크에서 Nova Lite 는 번역·현지화에서 Haiku 와 대등했고,
//   «해석»이 필요한 자리(종목 일일요약·푸시 문구)에서만 템플릿 수준으로 떨어졌다.
//   → 해석이 필요한 자리는 Haiku 로 두고, 여기만 가벼운 모델을 쓴다.
//
// 비용 실측: 162종목 전체 $0.007/회 · 하루 1회면 월 $0.21.
// ============================================================================
import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getFromCache, setInCache } from '@/services/redisClient';
import { publicBase } from '@/lib/net/publicBase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// v2 — 모델과 프롬프트가 바뀌었다. 옛 판(얕은 문장)이 남으면 안 되므로 키를 올린다.
export const EARNINGS_BRIEF_KEY = 'earnings:brief:v2';

/**
 * ★ [2026-09-10] 가벼운 모델(Nova Lite)에서 Haiku 로 되돌렸다.
 *
 *   처음엔 «회사명 현지화 + 정형 서술»이라 보고 가벼운 모델을 썼다. 형식은 통과했다.
 *   그런데 대표가 「조금 더 깊이를 줬으면 좋겠는데 그러면 이상하게 나오나?」라고 물어
 *   깊이를 요구하는 프롬프트로 두 모델을 실제로 돌려 봤다. 결과가 갈렸다:
 *
 *     Nova Lite  「메모리 가격 상승으로 인한 수익 증가가 **예상됩니다**」  ← 금지한 예측 표현
 *                「회원 유지 비용을 주목하세요; 회원 유지 비용은 운영 효율성을 반영합니다」 ← 동어반복
 *     Haiku      「DRAM·낸드 평균판매가(ASP) 추이와 서버 수요 강도;
 *                  메모리 사이클 회복 지속 여부가 분기 수익성을 결정」
 *                「클라우드 인프라(OCI) 매출 성장률…」 「FICC 거래 수익…」 「풀프라이스 상품 비중…」
 *
 *   깊이를 요구하면 가벼운 모델은 **더 나빠진다** — 아는 척을 하다가 예측 표현이 샌다.
 *   비용은 162종목 월 $6.98(분기 1회 갱신이면 그보다 훨씬 적다). 값어치가 있다.
 */
const LIGHT_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

/**
 * ★ 회사명은 «지어내게» 두지 않는다.
 *   실측에서 가벼운 모델이 JPM 을 「제이펀 모건 체이스」, ASML 을 「아스멜」로 썼다.
 *   회사명은 변하지 않으므로 한 번 적어 두면 영원히 맞다 — 모델에게 맡길 이유가 없다.
 *   여기 없는 종목만 모델이 짓고, 그건 아래 검증에서 길이·언어만 본다.
 */
const NAME_KO: Record<string, string> = {
    AAPL: '애플', MSFT: '마이크로소프트', GOOGL: '알파벳', AMZN: '아마존', META: '메타',
    NVDA: '엔비디아', TSLA: '테슬라', AVGO: '브로드컴', ORCL: '오라클', CRM: '세일즈포스',
    AMD: 'AMD', INTC: '인텔', MU: '마이크론', TSM: 'TSMC', ASML: 'ASML', ARM: 'ARM',
    QCOM: '퀄컴', TXN: '텍사스인스트루먼트', ADBE: '어도비', NOW: '서비스나우',
    JPM: 'JP모간체이스', BAC: '뱅크오브아메리카', WFC: '웰스파고', GS: '골드만삭스',
    MS: '모간스탠리', C: '씨티그룹', BLK: '블랙록', V: '비자', MA: '마스터카드',
    JNJ: '존슨앤드존슨', LLY: '일라이릴리', PFE: '화이자', MRK: '머크', ABBV: '애브비',
    UNH: '유나이티드헬스', AMGN: '암젠', GILD: '길리어드', NVO: '노보노디스크',
    WMT: '월마트', COST: '코스트코', HD: '홈디포', NKE: '나이키', MCD: '맥도날드',
    PEP: '펩시코', KO: '코카콜라', PG: 'P&G', DIS: '디즈니', NFLX: '넷플릭스',
    XOM: '엑슨모빌', CVX: '셰브론', CAT: '캐터필러', BA: '보잉', GE: 'GE',
    LMT: '록히드마틴', RTX: 'RTX', UPS: 'UPS', UNP: '유니언퍼시픽', HON: '허니웰',
    COIN: '코인베이스', PYPL: '페이팔', SQ: '블록', HOOD: '로빈후드', PLTR: '팔란티어',
    SMCI: '슈퍼마이크로', DELL: '델', SNOW: '스노우플레이크', DDOG: '데이터독',
    PANW: '팔로알토네트웍스', CRWD: '크라우드스트라이크', FTNT: '포티넷', ZS: '지스케일러',
    CEG: '컨스텔레이션에너지', VST: '비스트라', NEE: '넥스트에라에너지', SO: '서던컴퍼니',
};
const NAME_JA: Record<string, string> = {
    AAPL: 'アップル', MSFT: 'マイクロソフト', GOOGL: 'アルファベット', AMZN: 'アマゾン',
    META: 'メタ', NVDA: 'エヌビディア', TSLA: 'テスラ', ORCL: 'オラクル', AVGO: 'ブロードコム',
    AMD: 'AMD', INTC: 'インテル', MU: 'マイクロン', TSM: 'TSMC', ASML: 'ASML',
    JPM: 'JPモルガン・チェース', GS: 'ゴールドマン・サックス', WFC: 'ウェルズ・ファーゴ',
    C: 'シティグループ', BLK: 'ブラックロック', V: 'ビザ', MA: 'マスターカード',
    JNJ: 'ジョンソン・エンド・ジョンソン', LLY: 'イーライリリー', PFE: 'ファイザー',
    WMT: 'ウォルマート', COST: 'コストコ', NKE: 'ナイキ', MCD: 'マクドナルド',
    PEP: 'ペプシコ', KO: 'コカ・コーラ', DIS: 'ディズニー', NFLX: 'ネットフリックス',
    XOM: 'エクソンモービル', CVX: 'シェブロン', BA: 'ボーイング', CAT: 'キャタピラー',
};

const bedrock = () => new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
        ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! }
        : undefined,
    maxAttempts: 2,
});

const SYSTEM = [
    'You write the "what to watch" line for upcoming US earnings in an institutional-grade stock app.',
    'For each ticker produce: name (company name in that language) and watch.',
    '',
    'DEPTH — this is the whole point. A generic line is worthless.',
    '- Name the SPECIFIC line item, segment, or metric that decides this quarter for THIS company.',
    '  Not "revenue growth" — say which segment. Not "margins" — say which margin and what drives it.',
    '- Tie it to something real about the company: a business shift, a product cycle, a pricing',
    '  regime, a capex cycle, a regulatory change, a competitive position.',
    '- Where the estimate given is unusual (very high EPS, huge revenue), say what that implies',
    '  structurally — a memory pricing cycle, a buyback-shrunk share count, a seasonal quarter.',
    '- Two clauses is the shape: WHAT to look at ; WHY that number moves the read.',
    '',
    'HARD RULES',
    '- Korean 55-95자 · Japanese 40-70자 · English 90-165 chars.',
    '- NEVER predict a result or a direction. No "전망", "예상됩니다", "상회할", "will beat/miss",',
    '  "expected to". Describe what to LOOK at and why it matters structurally — observation, not forecast.',
    '- No investment advice. Do not invent numbers; you may reference the estimate given.',
    '- LANGUAGE PURITY: "ko" Korean only, "en" English only, "ja" Japanese only.',
    '  Ticker symbols and standard finance acronyms (OCI, FICC, ASP, DRAM) are fine in any language.',
    '',
    'Return ONLY JSON keyed by ticker: {"ORCL":{"ko":{"name":"..","watch":".."},"en":{...},"ja":{...}}, ...}',
].join('\n');

const HANGUL = /[가-힣]/, KANA = /[぀-ヿ]/, KANJI = /[一-鿿]/;
/** 예측 표현은 우리 규칙상 절대 나가면 안 된다 — 여기서 잘라 낸다. */
const PREDICT = /전망|예상\s*(상회|됩니다|된다)|상회할|하회할|증가가\s*예상|will\s+(beat|miss|rise|fall|increase)|expected\s+(to|increase)|予想されます/i;

export async function GET(request: Request) {
    const t0 = Date.now();
    const baseUrl = publicBase(request.url.split('/api/')[0]);
    const bypass: Record<string, string> = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : {};

    // ── 1) 캘린더를 그대로 읽는다(이미 만들어 둔 것을 다시 만들지 않는다) ──
    let rows: any[] = [];
    try {
        const res = await fetch(`${baseUrl}/api/market/earnings-calendar`, {
            headers: bypass, cache: 'no-store', signal: AbortSignal.timeout(25000),
        });
        rows = (await res.json())?.rows || [];
    } catch (e: any) {
        return NextResponse.json({ success: false, error: `calendar: ${e?.message}` }, { status: 502 });
    }
    if (!rows.length) return NextResponse.json({ success: true, skipped: 'empty-calendar' });

    // 이미 만들어 둔 것은 다시 만들지 않는다. 새로 들어온 종목만 채운다.
    const prev = (await getFromCache<any>(EARNINGS_BRIEF_KEY).catch(() => null)) || {};
    const have = new Set(Object.keys(prev.tickers || {}));
    const todo = rows.map((r) => r.ticker).filter((t: string) => !have.has(t));
    if (!todo.length) {
        return NextResponse.json({ success: true, skipped: 'all-cached', have: have.size, ms: Date.now() - t0 });
    }

    // ── 2) 배치로 만든다. ──
    // ★ 첫 판은 14개씩 넣었는데 **뒤쪽 8종목이 통째로 잘렸다**(DHR·GE·KO·NFLX…).
    //   같은 8종목을 따로 돌리니 8/8 통과했다 — 모델 능력이 아니라 출력 토큰 한계였다.
    //   14 × 3개국어 × (회사명+한 줄) 이면 4,000 토큰으로 모자란다.
    //   → 배치를 10 으로 줄이고 토큰을 6,000 으로 올린다. 토큰은 이 모델에서 사실상 공짜다.
    // Haiku 는 RPM 10 이라 «호출 수»가 비싸다 → 배치를 키우고 토큰을 넉넉히 준다.
    const BATCH = 8;
    const client = bedrock();
    const out: Record<string, any> = { ...(prev.tickers || {}) };
    let made = 0, rejected: string[] = [], calls = 0;

    for (let i = 0; i < todo.length && Date.now() - t0 < 46_000; i += BATCH) {
        const slice = todo.slice(i, i + BATCH);
        const facts = slice.map((t: string) => {
            const r = rows.find((x: any) => x.ticker === t) || {};
            return { ticker: t, date: r.date, hour: r.hour || null, eps: r.epsEstimate, rev: r.revenueEstimate, q: r.quarter, y: r.year };
        });
        const user = [
            `Upcoming earnings (${facts.length} companies):`,
            JSON.stringify(facts, null, 1),
            `Return ALL ${facts.length} tickers: ${slice.join(', ')}. JSON only.`,
        ].join('\n');

        try {
            calls++;
            const r = await client.send(new ConverseCommand({
                modelId: LIGHT_MODEL,
                system: [{ text: SYSTEM }],
                messages: [{ role: 'user', content: [{ text: user }] }],
                inferenceConfig: { maxTokens: 6000, temperature: 0.3 },
            }));
            const txt = (r.output?.message?.content || []).map((x: any) => x.text || '').join('').trim();
            const m = txt.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(m ? m[0] : txt);

            for (const t of slice) {
                const v = parsed?.[t];
                if (!v) { rejected.push(`${t}(누락)`); continue; }
                const entry: any = {};
                // 언어별로 따로 받는다 — 하나가 오염돼도 나머지는 살린다.
                for (const [lang, ok] of [
                    // 깊이 판이므로 하한을 올린다 — 짧으면 «일반론»이라는 뜻이다.
                    ['ko', (w: string) => w.length >= 34 && HANGUL.test(w) && !PREDICT.test(w)],
                    ['en', (w: string) => w.length >= 60 && !HANGUL.test(w) && !KANA.test(w) && !PREDICT.test(w)],
                    ['ja', (w: string) => w.length >= 26 && !HANGUL.test(w) && (KANA.test(w) || KANJI.test(w)) && !PREDICT.test(w)],
                ] as [string, (w: string) => boolean][]) {
                    const cell = v[lang] || {};
                    const watch = String(cell.watch || '').trim();
                    if (!ok(watch)) continue;
                    // ★ 회사명은 사전이 이긴다. 모델이 지어낸 이름을 쓰지 않는다.
                    const name = lang === 'ko' ? (NAME_KO[t] || String(cell.name || '').trim())
                               : lang === 'ja' ? (NAME_JA[t] || String(cell.name || '').trim())
                               : String(cell.name || '').trim();
                    if (!name) continue;
                    entry[lang] = { name, watch };
                }
                if (!entry.ko) { rejected.push(`${t}(ko실패)`); continue; }
                out[t] = entry;
                made++;
            }
        } catch (e: any) {
            rejected.push(`batch@${i}(${e?.name || 'err'})`);
        }
    }

    if (!made && !have.size) {
        return NextResponse.json({ success: false, error: 'nothing produced', rejected, ms: Date.now() - t0 }, { status: 502 });
    }

    // ★ 실적 «관전 포인트»는 분기 단위 정보다 — 매일 다시 만들 이유가 없다.
    //   크론은 이미 «새로 들어온 종목만» 만들고(이미 있으면 all-cached 로 즉시 종료,
    //   Bedrock 호출 0건), TTL 만 짧으면 그 이점이 주 1회 리셋된다. 30일로 둔다.
    //   실적 일정 자체가 바뀌면 캘린더가 새 티커를 물고 오고, 그때만 그 종목을 만든다.
    await setInCache(EARNINGS_BRIEF_KEY, {
        generatedAt: new Date().toISOString(),
        source: 'ai',
        tickers: out,
    }, 30 * 24 * 3600);

    return NextResponse.json({
        success: true, made, total: Object.keys(out).length, todo: todo.length,
        calls, rejected: rejected.slice(0, 8), ms: Date.now() - t0,
        sample: out[todo[0]] || null,
    });
}
