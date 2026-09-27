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
import {
    EARNINGS_BRIEF_KEY, SAME_REPORT_DAYS, sameReport, headerFactIn,
    type BriefEntry, type BriefLang, type BriefPack,
} from '@/lib/earningsBrief';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 키·«같은 발표» 판정·숫자 검사는 @/lib/earningsBrief — 캘린더 라우트가 같은 것을 읽는다.

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

/**
 * ★ [2026-09-27] 숫자를 쓰지 못하게 했다.
 *   카드 머리글이 이미 EPS·매출 추정치를 보여 주고, 그 값은 매일 바뀐다. 문장에 박힌 숫자는
 *   만든 날의 값이라 곧 머리글과 어긋났다(MU 머리글 $31.52 ↔ 문장 $31.16).
 *   원인은 프롬프트 두 줄이었다 — 「추정치가 특이하면(very high EPS) 그 의미를 말하라 — 예: 메모리
 *   가격 사이클」 예시와 「추정치를 인용해도 된다」. 예시는 오염원이다(뉴스 번역 NVIDIA→앤스로픽과 같은 꼴).
 *   → 예시를 걷고, 모델 입력에서 EPS·매출 숫자 자체를 뺐다. 없는 숫자는 옮겨 적을 수 없다.
 *   프롬프트만 믿지 않고 아래에서 headerFactIn 으로 다시 거른다.
 *
 * ★ 회사 신원도 모델에게 맡기지 않는다 (같은 날 실측).
 *   티커만 주자 S 를 「Sprint」, SYM 을 「Symposium International」, PL 을 「Platinum Group Metals」,
 *   ASTS 를 「Astrotech」, SMR 을 「Small Modular Reactor」로 짓고 그 회사 얘기를 썼다
 *   (실제는 SentinelOne · Symbotic · Planet Labs · AST SpaceMobile · NuScale).
 *   → 등록 회사명과 한 줄 설명(FMP profile)을 같이 준다. 못 얻으면 그 종목은 만들지 않는다.
 */
const SYSTEM = [
    'You write the "what to watch" line for upcoming US earnings in an institutional-grade stock app.',
    'For each ticker produce: name (company name in that language) and watch.',
    '',
    'IDENTITY — when an item has "company" (its registered name) and "about" (what it does), that IS',
    '  the company behind the ticker. Write about that business only — never about another company whose',
    '  ticker or name looks similar. Localize that name for "name".',
    '',
    'DEPTH — this is the whole point. A generic line is worthless.',
    '- Name the SPECIFIC line item, segment, or metric that decides this quarter for THIS company.',
    '  Not "revenue growth" — say which segment. Not "margins" — say which margin and what drives it.',
    '- Tie it to something real about the company: a business shift, a product cycle, a pricing',
    '  regime, a capex cycle, a regulatory change, a competitive position.',
    '- Two clauses is the shape: WHAT to look at ; WHY that number moves the read.',
    '',
    'HARD RULES',
    '- Korean 55-95자 · Japanese 40-70자 · English 90-165 chars.',
    '- NEVER predict a result or a direction. No "전망", "예상됩니다", "상회할", "will beat/miss",',
    '  "expected to". Describe what to LOOK at and why it matters structurally — observation, not forecast.',
    '- No investment advice.',
    '- NO FIGURES. Never write an EPS, revenue or dollar amount, a growth rate, or any other value.',
    '  The card already shows the live estimate above your line and it is revised often — a number',
    '  in your line goes stale and contradicts it. Name the metric, never its value.',
    '  Do not label the fiscal quarter or fiscal year either — the card shows it.',
    '- LANGUAGE PURITY: "ko" Korean only, "en" English only, "ja" Japanese only.',
    '  Ticker symbols and standard finance acronyms (OCI, FICC, ASP, DRAM) are fine in any language.',
    '',
    'Return ONLY JSON keyed by ticker: {"ORCL":{"ko":{"name":"..","watch":".."},"en":{...},"ja":{...}}, ...}',
].join('\n');

const HANGUL = /[가-힣]/, KANA = /[぀-ヿ]/, KANJI = /[一-鿿]/;
/** 예측 표현은 우리 규칙상 절대 나가면 안 된다 — 여기서 잘라 낸다. */
const PREDICT = /전망|예상\s*(상회|됩니다|된다)|상회할|하회할|증가가\s*예상|will\s+(beat|miss|rise|fall|increase)|expected\s+(to|increase)|予想されます/i;

/**
 * 등록 회사명과 한 줄 설명 (FMP profile — 캘린더와 같은 벤더·같은 키).
 * 못 얻으면 null 이다. 신원을 모델에게 추측시키지 않는다 — 새로 만들 종목에만 부른다.
 */
async function registered(t: string, key: string | undefined): Promise<{ name: string; about: string } | null> {
    if (!key) return null;
    try {
        const r = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(t)}&apikey=${key}`, {
            cache: 'no-store', signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return null;
        const p = (await r.json())?.[0];
        const name = String(p?.companyName || '').trim();
        if (!name || name.toUpperCase() === t) return null;          // 티커 자신이 이름 자리에 오는 때가 있다
        // 첫 문장만 자르면 「SentinelOne, Inc.」에서 끊긴다(Inc. 의 마침표) — 글자 수로 자른다.
        const desc = String(p?.description || '').replace(/\s+/g, ' ').trim();
        const about = desc.length <= 220 ? desc : `${desc.slice(0, 220).replace(/\s+\S*$/, '')}…`;
        return { name, about };
    } catch {
        return null;
    }
}

/** 「SentinelOne, Inc.」→「SentinelOne」 — 법인 꼬리만 뗀다. */
const LEGAL_TAIL = /[\s,]+(?:inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|limited|plc|pbc|n\.v\.|s\.a\.|a\/s|ag|se|llc|l\.p\.)$/i;
function shortName(reg: string): string {
    let s = reg.trim().replace(/^the\s+/i, '');
    for (let i = 0; i < 4 && LEGAL_TAIL.test(s); i++) s = s.replace(LEGAL_TAIL, '').replace(/[\s,&]+$|\s+and$/i, '').trim();
    return s || reg.trim();
}

/** 모델이 쓴 영문 이름이 등록명과 같은 회사인가 — 고유 단어가 겹치거나, 약칭(AMD·TSMC·P&G)이 머리글자와 맞으면. */
const GENERIC = new Set(['the', 'and', 'inc', 'corp', 'corporation', 'company', 'holdings', 'holding', 'group', 'international',
    'technologies', 'technology', 'systems', 'global', 'energy', 'financial', 'services', 'solutions', 'industries',
    'therapeutics', 'pharmaceuticals', 'platforms', 'networks', 'capital', 'partners', 'resources', 'brands']);
function sameCompany(said: string, reg: string): boolean {
    const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w));
    const r = words(shortName(reg));
    if (words(said).some((w) => r.includes(w))) return true;
    if (!/^[A-Z][A-Z&.\-]{1,5}$/.test(said.trim())) return false;    // 약칭처럼 생긴 것만 머리글자와 맞춘다
    const abbr = said.replace(/[^A-Z]/g, '').toLowerCase();
    const initials = shortName(reg).split(/[^A-Za-z0-9]+/).filter((w) => w && !/^(the|and|of)$/i.test(w))
        .map((w) => w[0].toLowerCase()).join('');
    return abbr.length >= 2 && initials.length >= 2 && (initials.startsWith(abbr) || abbr.startsWith(initials));
}

const LANGS: BriefLang[] = ['ko', 'en', 'ja'];

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

    // 이미 만들어 둔 것은 다시 만들지 않는다 — 단 «지금 행의 발표»를 보고 쓴 것만.
    // ★ [2026-09-27] 전에는 티커만 봤다. 한 번 만들면 다음 분기 행에도 그 문장이 붙었다
    //   (COST: 9/24 발표용 「Q4 EPS 6.53」이 12/10 행에). 이제 문장마다 어느 발표 행을 보고
    //   썼는지(in)를 남기고, 그 발표가 아니면 새로 만든다. 같은 발표면 일정이 며칠 옮겨져도
    //   다시 만들지 않는다 — 분기에 한 번이면 된다(«한 번 많이 해 놓으면» 지시 그대로).
    //   세 언어가 다 없는 항목도 다시 만든다(하나가 검사에 걸려 빠진 채 분기 내내 비지 않게).
    const prev = await getFromCache<BriefPack>(EARNINGS_BRIEF_KEY).catch(() => null);
    const out: Record<string, BriefEntry> = {};
    const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    let pruned = 0;
    for (const [t, e] of Object.entries(prev?.tickers || {})) {
        // 발표가 30일 넘게 지난 문장은 어떤 행에도 다시 붙을 수 없다 — 버린다.
        const d = e?.in?.date ? Date.parse(`${e.in.date}T00:00:00Z`) : NaN;
        if (Number.isFinite(d) && today - d <= SAME_REPORT_DAYS * 86_400_000) out[t] = e;
        else pruned++;
    }
    const nearest = new Map<string, any>();      // 티커당 가장 가까운 발표 한 행(행은 날짜순)
    for (const r of rows) if (r?.ticker && !nearest.has(r.ticker)) nearest.set(r.ticker, r);
    const todo = [...nearest.keys()].filter((t) => {
        const e = out[t];
        return !sameReport(e?.in, nearest.get(t)) || !LANGS.every((l) => e?.[l]);
    });
    const stale = todo.filter((t) => out[t]).length;

    const save = () => {
        const pack: BriefPack = { generatedAt: new Date().toISOString(), source: 'ai', tickers: out };
        // ★ 분기 단위 정보라 30일. 항목마다 in 으로 발표를 가려 붙이므로 TTL 이 늘어나도 옛 분기가 새지 않는다.
        return setInCache(EARNINGS_BRIEF_KEY, pack, 30 * 24 * 3600);
    };
    if (!todo.length) {
        if (pruned) await save();
        return NextResponse.json({ success: true, skipped: 'all-cached', have: Object.keys(out).length, pruned, ms: Date.now() - t0 });
    }

    // ── 2) 배치로 만든다. ──
    // ★ 첫 판은 14개씩 넣었는데 **뒤쪽 8종목이 통째로 잘렸다**(DHR·GE·KO·NFLX…).
    //   같은 8종목을 따로 돌리니 8/8 통과했다 — 모델 능력이 아니라 출력 토큰 한계였다.
    //   14 × 3개국어 × (회사명+한 줄) 이면 4,000 토큰으로 모자란다.
    //   → 배치를 10 으로 줄이고 토큰을 6,000 으로 올린다. 토큰은 이 모델에서 사실상 공짜다.
    // Haiku 는 RPM 10 이라 «호출 수»가 비싸다 → 배치를 키우고 토큰을 넉넉히 준다.
    const BATCH = 8;
    const client = bedrock();
    const fmpKey = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
    let made = 0, calls = 0, saves = 0, firstMade: string | null = null;
    const rejected: string[] = [], partial: string[] = [], noName: string[] = [];

    // 새 배치는 38초 안에서만 시작한다 — 배치 하나가 7~20초라 46초에 시작하면 60초 제한을 넘는다
    // (로컬 실측: 46초 한도에서 52초에 끝났다).
    for (let i = 0; i < todo.length && Date.now() - t0 < 38_000; i += BATCH) {
        // 신원부터 확정한다. 등록명도 없고 사전에도 없으면 이번엔 만들지 않는다(다음 회차에 다시 본다).
        const cand = todo.slice(i, i + BATCH);
        const regs = await Promise.all(cand.map((t) => registered(t, fmpKey)));
        const reg = new Map<string, { name: string; about: string }>();
        const slice: string[] = [];
        cand.forEach((t, k) => {
            if (regs[k]) reg.set(t, regs[k]!);
            if (regs[k] || NAME_KO[t]) slice.push(t); else noName.push(t);
        });
        if (!slice.length) continue;

        // ★ EPS·매출 숫자는 넣지 않는다 — 카드 머리글이 보여 주고, 옮겨 적으면 곧 어긋난다.
        const facts = slice.map((t) => {
            const r = nearest.get(t) || {};
            // 등록명이 없으면(사전 종목·FMP 실패) 필드 자체를 뺀다 — null 로 두자 모델이 «필수 필드가 없다»며
            // 배치 전체를 거절했다(로컬 실측 2026-09-27, 8종목 통째 유실).
            const g = reg.get(t);
            return { ticker: t, ...(g ? { company: g.name, about: g.about } : {}), date: r.date, q: r.quarter ?? null, y: r.year ?? null };
        });
        const user = [
            `Upcoming earnings (${facts.length} companies):`,
            JSON.stringify(facts, null, 1),
            `Return ALL ${facts.length} tickers: ${slice.join(', ')}. JSON only.`,
        ].join('\n');

        let txt = '';
        try {
            calls++;
            const r = await client.send(new ConverseCommand({
                modelId: LIGHT_MODEL,
                system: [{ text: SYSTEM }],
                messages: [{ role: 'user', content: [{ text: user }] }],
                inferenceConfig: { maxTokens: 6000, temperature: 0.3 },
            }));
            txt = (r.output?.message?.content || []).map((x: any) => x.text || '').join('').trim();
            const m = txt.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(m ? m[0] : txt);

            let madeHere = 0;
            for (const t of slice) {
                const v = parsed?.[t];
                if (!v) { rejected.push(`${t}(누락)`); continue; }
                const entry: BriefEntry = {};
                const why: string[] = [];
                // 언어별로 따로 받는다 — 하나가 오염돼도 나머지는 살린다.
                for (const [lang, ok] of [
                    // 깊이 판이므로 하한을 올린다 — 짧으면 «일반론»이라는 뜻이다.
                    ['ko', (w: string) => w.length >= 34 && HANGUL.test(w) && !PREDICT.test(w)],
                    ['en', (w: string) => w.length >= 60 && !HANGUL.test(w) && !KANA.test(w) && !PREDICT.test(w)],
                    ['ja', (w: string) => w.length >= 26 && !HANGUL.test(w) && (KANA.test(w) || KANJI.test(w)) && !PREDICT.test(w)],
                ] as [BriefLang, (w: string) => boolean][]) {
                    const cell = v[lang] || {};
                    const watch = String(cell.watch || '').trim();
                    if (!ok(watch)) { why.push(`${lang}:형식`); continue; }
                    // ★ 머리글이 보여 주는 사실(숫자·분기)을 다시 말하면 버린다 — 프롬프트만 믿지 않는다.
                    const fact = headerFactIn(watch);
                    if (fact) { why.push(`${lang}:${fact}`); continue; }
                    // ★ 회사명은 사전이 이긴다. 영어는 등록명과 다른 회사를 가리키면 등록명으로 바꾼다.
                    const said = String(cell.name || '').trim();
                    const g = reg.get(t);
                    const name = lang === 'ko' ? (NAME_KO[t] || said)
                               : lang === 'ja' ? (NAME_JA[t] || said)
                               : (g && !sameCompany(said, g.name) ? shortName(g.name) : said);
                    if (!name) { why.push(`${lang}:이름`); continue; }
                    entry[lang] = { name, watch };
                }
                if (!entry.ko) { rejected.push(`${t}(${why.join(',')})`); continue; }
                if (why.length) partial.push(`${t}(${why.join(',')})`);
                const row = nearest.get(t);
                entry.in = { date: row.date, q: row.quarter ?? null, y: row.year ?? null, eps: row.epsEstimate ?? null };
                entry.at = new Date().toISOString();
                out[t] = entry;
                made++; madeHere++; firstMade ??= t;
            }
            // 배치마다 저장한다 — 마지막 배치가 60초 제한에 잘려도 앞의 배치는 남는다.
            if (madeHere) { await save(); saves++; }
        } catch (e: any) {
            rejected.push(`batch@${i}(${e?.name || 'err'})`);
            // 원인을 로그로 남긴다 — 파싱 실패면 모델 출력의 앞뒤를 본다(그 배치는 다음 회차에 다시 만든다).
            console.warn(`[earnings-brief] batch@${i} ${slice.join(',')} ${e?.name}: ${String(e?.message || '').slice(0, 160)}`,
                txt ? `| out(${txt.length}) head=${JSON.stringify(txt.slice(0, 100))} tail=${JSON.stringify(txt.slice(-100))}` : '');
        }
    }

    if (!made && !Object.keys(out).length) {
        return NextResponse.json({ success: false, error: 'nothing produced', rejected, noName, ms: Date.now() - t0 }, { status: 502 });
    }
    if (!saves && pruned) await save();

    return NextResponse.json({
        success: true, made, total: Object.keys(out).length, todo: todo.length, stale, pruned,
        calls, rejected: rejected.slice(0, 8), partial: partial.slice(0, 12), noName: noName.slice(0, 12),
        ms: Date.now() - t0, sample: firstMade ? out[firstMade] : null,
    });
}
