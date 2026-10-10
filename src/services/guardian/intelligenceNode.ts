
import { callBedrock, MODELS } from '@/services/bedrockClient';
import { textGate, triLangGate } from '@/lib/ai/ladderGates';
import { Redis } from "@upstash/redis";
import { SECTOR_MAP } from "@/services/universePolicy";
import { sectorLabelForAi, restoreKoSectorNames, restoreJaSectorNames } from '@/lib/ai/sectorLabels';
import { restoreCommonTermNames } from '@/lib/ai/commonTerms';
import { cleanInsight, validateInsight, previewForLog } from '@/lib/ai/outputGate';
import { fillGuardianTokens, guardianNumbersGate, guardianNumsFromAiContext, guardianTokenRules, hasGuardianTokens, tokenizeGuardianLiterals, guardianMaterialIssues, guardianCmpFacts, type GNums } from '@/lib/ai/guardianNumbers';
import { forecastHits, stripForecastSentences, checkComparisons, checkRanges } from '@/lib/ai/trustLayer';

// Supported locales
type Locale = 'ko' | 'en' | 'ja';

/**
 * 가디언 AI 문구 3종 — 화면 자리
 *   rotation = verdict.description   (플로우 탭·사이드바, TACTICAL 의 대체 본문)
 *   reality  = verdict.realityInsight (RLSI INSIGHT › TACTICAL)
 *   gamma    = verdict.gammaInsight   (감마 쉴드 AI 브리프)
 */
export type InsightType = 'rotation' | 'reality' | 'gamma';

// Redis Keys for persistent cache (per locale)
// ★2026-10-04 v2 — 저장 형식이 «자리표 글 + basis» 로 바뀌었다. 옛 키를 그대로 쓰면 배포 전후로 옛 코드가 자리표({NDX_CHG})가
//   남은 글을 화면에 내보낼 수 있고, 옛 키의 글은 생성 시점 숫자가 박힌 글이다 → 키를 바꿔 옛 글은 버린다(최대 12시간 뒤 만료).
const getRedisKey = (type: InsightType, locale: Locale) => `guardian:gemini:v2:${type}:${locale}`;

// Get Redis client
function getRedis(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
}



interface IntelligenceContext {
    rlsiScore: number;
    nasdaqChange: number;
    vectors: { source: string, target: string, strength: number }[];
    /** 정규장에서만 측정 가능. 시간외/휴장에는 undefined —
     *  0 을 넣으면 AI 가 «거래량 저조»라는 사실 주장으로 바꿔 쓴다. */
    rvol?: number;
    vix: number;
    locale?: Locale;
    // Macro indicators
    us10y?: number;         // Current 10Y yield (e.g., 4.29)
    /**
     * 10년물 금리의 «전일 대비 절대 변화»(bp). 예: 5.18% → 5.24% = +6.
     * ⚠️ 2026-09-29 까지는 여기에 «금리 수준의 상대 변화율»(chgPct, +1.08%)을 넣고 «(변동: +1.08%)» 로 찍었다.
     *    모델은 그걸 «108bp 급등»으로 읽어 사용자에게 썼다(실측). 금리 변화는 bp 로만 전달한다.
     */
    us10yChangeBp?: number;
    spread2s10s?: number;   // 2s10s spread (e.g., 0.72)
    realYield?: number;     // Real yield (e.g., 1.99)
    realYieldStance?: string; // TIGHT, LOOSE, NEUTRAL
    // Breadth indicators
    breadthPct?: number;     // % of advancing stocks (e.g., 81)
    adRatio?: number;        // Advance/Decline ratio (e.g., 4.84)
    volumeBreadth?: number;  // Volume breadth % (e.g., 77.4)
    breadthSignal?: string;  // STRONG, HEALTHY, NEUTRAL, WEAK, CRITICAL
    dxy?: number;            // Dollar index
    // [V6.0] Enhanced Rotation Fields
    rotationRegime?: string;          // e.g. "RISK_OFF_DEFENSE"
    topInflow5d?: string;             // e.g. "Energy(+6.3%), Staples(+4.0%)"
    topOutflow5d?: string;            // e.g. "Comm(-3.3%), Tech(-2.7%)"
    noiseWarning?: string;            // e.g. "XLRE,XLV low consistency"
    trendVsToday?: string;            // e.g. "XLK: today +4% but 5d -2.7%"
    rotationConviction?: string;      // HIGH, MEDIUM, LOW
    // [V6.1] Signal Conflict Detection
    signalConflict?: string;          // e.g. "BULL→NEUTRAL: RLSI 강세 but RISK_OFF HIGH"
    // [V8.0] Market News Headlines for context-aware analysis
    marketNewsHeadlines?: string[];   // e.g. ["CPI rises 3.0% vs 2.9% expected", "Fed signals patience on rate cuts"]
    // [V9.0] Macro Intelligence — full asset class context
    fearGreedScore?: number;          // CNN Fear & Greed Index (0-100)
    fearGreedRating?: string;         // e.g. "Greed", "Extreme Fear"
    spxChangePct?: number;            // S&P 500 daily change %
    goldChangePct?: number;           // Gold (GC=F) daily change %
    oilChangePct?: number;            // Oil (CL=F) daily change %
    btcChangePct?: number;            // BTC daily change %
    tltChangePct?: number;            // TLT (20Y Bond ETF) daily change %
    // [V10.0] GAMMA SHIELD — Options-based volatility intelligence
    gexIndex?: number;                // Normalized GEX (-100 to +100)
    gexLevel?: string;                // LONG_GAMMA, NEUTRAL, SHORT_GAMMA
    squeezeRisk?: number;             // Squeeze probability 0-100%
    squeezeLevel?: string;            // LOW, MEDIUM, HIGH, EXTREME
    triggerSupport?: number | null;    // S&P 500 options-based support
    triggerResistance?: number | null; // S&P 500 options-based resistance
    triggerCurrent?: number | null;    // S&P 500 current price
    gammaFlipPoint?: number | null;    // 감마 부호가 뒤집히는 지점 = 이 판단이 깨지는 자리
    // ★ 「평소와 무엇이 다른가」 축 (2026-09-03 추가).
    //   이게 없으면 AI 는 화면이 이미 보여 주는 숫자를 다시 읽어 주는 것 말고 할 말이 없다.
    gexPercentile?: number;            // 오늘 딜러 감마가 최근 이력에서 몇 번째인가 (0-100)
    gexSamples?: number;               // 그 백분위를 낸 표본 수 — 적으면 말을 아껴야 한다
    gexChange?: number | null;         // 직전 측정 대비 변화
    spyGexIndex?: number;              // SPY 단독
    qqqGexIndex?: number;              // QQQ 단독 — 둘이 갈리면 그 자체가 신호다
    // [V13.0] DIVERGENCE CONTEXT — Surface vs Internal flow mismatch
    divergenceCase?: 'A' | 'B' | 'C' | 'D' | 'N';  // A=FalseRally, B=StealthInflow, C=FullBull, D=DeepFreeze, N=Sync
    divergenceDesc?: string;          // Localized divergence description
    // [V14.0] Institutional Flow Score per sector
    sectorIFS?: { id: string; ifs: number; divergence: string }[];
    stealthAlert?: string;            // e.g. "Healthcare: -0.3% but IFS +55"
    exitAlert?: string;               // e.g. "Energy: +0.8% but IFS -42"
}


/** RVOL 표기 — 측정 불가를 «0.00x»(저조)로 오해시키지 않는다 */
function rvolText(v?: number): string {
    return v === undefined || !(v > 0) ? "측정 불가 (정규장 아님)" : `${v.toFixed(2)}x`;
}

/** 10년물 변화(bp) 표기 — «+6bp». 값이 없으면 null(줄 자체를 빼거나 «?»로 둔다). */
function bpText(bp?: number): string | null {
    if (typeof bp !== 'number' || !Number.isFinite(bp)) return null;
    const r = Math.round(bp);
    return `${r > 0 ? '+' : r < 0 ? '-' : '±'}${Math.abs(r)}bp`;
}

// === TIME-BASED GATING ===
/** 장중/장외 판정에 쓰는 시계. 테스트만 바꾼다(AWS 서명은 실제 시계를 그대로 쓰므로 전역 Date 를 건드리지 않는다). */
let _marketClock: () => Date = () => new Date();
/** 테스트 전용 — 장중/장외 판정 시계를 바꾼다. null = 원래대로 */
export function _setMarketClockForTest(fn: (() => Date) | null): void {
    _marketClock = fn || (() => new Date());
}

function isOffHours(): boolean {
    const nowET = new Date(_marketClock().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = nowET.getHours();
    const day = nowET.getDay();
    if (day === 0 || day === 6) return true;
    if (hour >= 20 || hour < 4) return true;
    return false;
}

// === CACHE SYSTEM (per type × locale) ===
// ★2026-09-29 세 생성기가 복사-붙여넣기 세 벌이었다(검사도 세 벌 다 없었다). 한 벌로 합치고 검사를 그 한 곳에 건다.
const TTL_NORMAL: Record<InsightType, number> = {
    rotation: 2 * 60 * 1000,
    reality: 10 * 60 * 1000,
    gamma: 15 * 60 * 1000,
};
const OFF_HOURS_TTL = 12 * 60 * 60 * 1000;
const REDIS_TTL_SEC = 43200; // 12 hour expiry
/** 생성 + 교정 재시도가 둘 다 검사에서 떨어지면, 이 시간 동안은 모델을 다시 부르지 않는다(요청마다 두드리지 않게) */
const GEN_FAIL_COOLDOWN_MS = 90 * 1000;
/** 첫 생성이 이 시간 안에 끝났을 때만 교정 재시도를 한다 — 라우트 한도(60초)를 넘기지 않게 */
const RETRY_BUDGET_MS = 25 * 1000;
/** 생성 경로에서 번역 대체까지 해도 되는 시간 */
const TRANSLATE_BUDGET_MS = 35 * 1000;

/** text = 자리표가 남은 정리본(저장·번역 원본) · basis = 그 글을 만들 때 프롬프트에 들어간 화면 숫자(2026-10-04) */
interface CachedInsight { text: string; at: number; basis?: GNums | null }
/** 생성기·복구가 돌려주는 단위 — tpl 은 자리표가 남은 글, 화면 글은 출구에서 화면 값으로 채운다 */
export interface InsightOut { tpl: string; basis: GNums | null }
const emptyByLocale = <T,>(v: T): Record<Locale, T> => ({ ko: v, en: v, ja: v });
/** 메모리 캐시 — «검사를 통과한 글»만 들어간다(그래서 나이가 지나도 «마지막 정상본»으로 쓸 수 있다) */
const _mem: Record<InsightType, Record<Locale, CachedInsight | null>> = {
    rotation: emptyByLocale<CachedInsight | null>(null),
    reality: emptyByLocale<CachedInsight | null>(null),
    gamma: emptyByLocale<CachedInsight | null>(null),
};
const _genFailUntil: Record<InsightType, Record<Locale, number>> = {
    rotation: emptyByLocale(0),
    reality: emptyByLocale(0),
    gamma: emptyByLocale(0),
};

/** 마지막으로 내보낸 글(화면 글)의 자리표 원본·기준 — unifiedDataStream 이 판정(verdict.num)에 같이 저장해 출구에서 다시 채운다 */
const _lastOut: Record<InsightType, Record<Locale, { shown: string; tpl: string; basis: GNums | null } | null>> = {
    rotation: emptyByLocale<{ shown: string; tpl: string; basis: GNums | null } | null>(null),
    reality: emptyByLocale<{ shown: string; tpl: string; basis: GNums | null } | null>(null),
    gamma: emptyByLocale<{ shown: string; tpl: string; basis: GNums | null } | null>(null),
};

// === LOCALIZED DEFAULT MESSAGES ===
const OFF_HOURS_ROTATION: Record<Locale, string> = {
    ko: "[현황] 장외 시간 - 실시간 분석 대기 중\n[해석] 프리마켓 시작 시 자동 갱신\n[전망] 다음 세션 시작 시 데이터 갱신 예정",
    en: "[Status] Off-hours - waiting for live analysis\n[Interpretation] Auto-refresh at pre-market\n[Outlook] Data will refresh at next session start",
    ja: "[現況] 場外時間 - リアルタイム分析待機中\n[解釈] プレマーケット開始時に自動更新\n[見通し] 次のセッション開始時にデータ更新予定"
};

const OFF_HOURS_REALITY: Record<Locale, string> = {
    ko: "[진단] 장외 시간 - 시장 비활성\n[결론] 프리마켓 04:00 ET 이후 분석 재개",
    en: "[Diagnosis] Off-hours - market inactive\n[Conclusion] Analysis resumes after pre-market 04:00 ET",
    ja: "[診断] 場外時間 - 市場非活性\n[結論] プレマーケット04:00 ET以降分析再開"
};

const OFF_HOURS_GAMMA: Record<Locale, string> = {
    ko: "[변동성] 장외 시간 - 시장 비활성 상태입니다.\n[범위] 프리마켓 시작 시 옵션 흐름 분석이 재개됩니다.",
    en: "[Volatility] Off-hours - market is currently inactive.\n[Range] Option flow analysis resumes at pre-market.",
    ja: "[ボラティリティ] 場外時間 - 市場非活性状態です。\n[範囲] プレマーケット開始時にオプションフロー分析が再開されます。"
};

/**
 * 장중인데 «쓸 수 있는 글»이 하나도 없을 때(생성·교정 재시도·마지막 정상본·번역 대체가 모두 실패).
 * 예전엔 이 자리에 «Insight generation failed. Market unstable.» 이 한국어·일본어 화면에도 영어로 나갔다.
 */
const PENDING_TEXT: Record<InsightType, Record<Locale, string>> = {
    rotation: {
        ko: "[현황] 최신 순환매 분석을 준비하고 있습니다\n[해석] 잠시 후 자동으로 갱신됩니다",
        en: "[Status] Preparing the latest sector rotation analysis\n[Interpretation] It will refresh automatically in a moment",
        ja: "[現況] 最新のセクターローテーション分析を準備しています\n[解釈] まもなく自動で更新されます",
    },
    reality: {
        ko: "[진단] 최신 시장 분석을 준비하고 있습니다\n[결론] 잠시 후 자동으로 갱신됩니다",
        en: "[Diagnosis] Preparing the latest market analysis\n[Conclusion] It will refresh automatically in a moment",
        ja: "[診断] 最新の市場分析を準備しています\n[結論] まもなく自動で更新されます",
    },
    gamma: {
        ko: "[변동성] 최신 옵션 구조 분석을 준비하고 있습니다\n[범위] 잠시 후 자동으로 갱신됩니다",
        en: "[Volatility] Preparing the latest options structure analysis\n[Range] It will refresh automatically in a moment",
        ja: "[ボラティリティ] 最新のオプション構造分析を準備しています\n[範囲] まもなく自動で更新されます",
    },
};

const OFF_HOURS_TEXT: Record<InsightType, Record<Locale, string>> = {
    rotation: OFF_HOURS_ROTATION,
    reality: OFF_HOURS_REALITY,
    gamma: OFF_HOURS_GAMMA,
};

/**
 * 화면이 보여 주기로 한 섹션 레이블(대괄호 없이). 정리기가 «**현황**»«현황:» 같은 변형을 «[현황]» 하나로 맞춘다.
 * TypewriterText 의 TAG_PATTERN 이 칠하는 표기, MobileGuardianFlow 가 줄 머리에서 찾는 표기와 같다.
 * reality 의 [진단]/[결론] 은 대기 문구에만 쓴다(생성 프롬프트는 레이블 없는 3문장을 요구한다).
 */
const SECTION_LABELS: Record<InsightType, Record<Locale, readonly string[]>> = {
    rotation: { ko: ['현황', '해석', '전망'], en: ['Status', 'Interpretation', 'Outlook'], ja: ['現況', '解釈', '見通し'] },
    reality: { ko: ['진단', '결론'], en: ['Diagnosis', 'Conclusion'], ja: ['診断', '結論'] },
    gamma: {
        ko: ['평소와 다른 점', '이 판단이 깨지는 지점', '변동성', '범위'],
        en: ["What's different from normal", 'Where this read breaks', 'Volatility', 'Range'],
        ja: ['平常との違い', 'この見方が崩れる地点', 'ボラティリティ', '範囲'],
    },
};

const normSpace = (s: string) => s.replace(/\s+/g, ' ').trim();
const PLACEHOLDERS = new Set<string>(
    [OFF_HOURS_TEXT, PENDING_TEXT].flatMap((byType) =>
        Object.values(byType).flatMap((byLocale) => Object.values(byLocale).map(normSpace)))
);
/** 옛 대기 문구 표식 — 짧은 글에서만 본다(«장외 시간 거래에서 …» 같은 진짜 분석을 대기 문구로 오인하지 않게) */
const LEGACY_PLACEHOLDER_MARKERS = [
    '장외 시간', 'Off-hours', '場外時間',
    '시장 비활성', 'market inactive', '市場非活性',
    '실시간 분석 대기', 'waiting for live analysis', 'リアルタイム分析待機',
];

/** 대기·장외 안내 문구인가(=분석이 아니다). 캐시에 넣지 않고, 번역 원본으로도 쓰지 않는다. */
function isPlaceholder(text: string): boolean {
    const n = normSpace(text);
    if (PLACEHOLDERS.has(n)) return true;
    return n.length < 160 && LEGACY_PLACEHOLDER_MARKERS.some((m) => n.includes(m));
}

/**
 * 정리 + 출구 검사. 사용자에게 나가는 모든 AI 글(생성·번역·캐시 읽기·저장된 판정)이 여기를 지난다.
 * ★2026-10-04 숫자 — tpl(자리표가 남은 정리본 = 저장용)을 화면 값(nums)으로 채운 text 를 검사한다:
 *   언어·거절·마크다운·연도(outputGate) + 화면 숫자 대조·낡은 서술(lib/ai/guardianNumbers).
 *   nums 가 없으면 basis(생성 때 값)로 채운다(숫자 대조도 basis 기준).
 */
function gateText(type: InsightType, tpl: string | null | undefined, locale: Locale, nums?: GNums | null, basis?: GNums | null, strict = false): { ok: boolean; tpl: string; text: string; reasons: string[] } {
    let cleaned = cleanInsight(String(tpl ?? ''), { labels: SECTION_LABELS[type][locale] });
    // ★2026-10-07 T5 예측어 — 생성(strict)은 걸리면 탈락(교정 재생성), 읽기·복구(lenient)는 그 문장만 뺀다(쓸 만하게 남을 때) —
    //   이미 저장돼 있던 글이 새 사전 때문에 통째로 «준비 중»으로 바뀌지 않게(보이던 표시를 없애지 않는다).
    const forecastReasons: string[] = [];
    const fh = forecastHits(cleaned, locale);
    if (fh.length) {
        if (strict) forecastReasons.push(`forecast:${fh[0].id}«${fh[0].match}»`);
        else { const st = stripForecastSentences(cleaned, locale, { allowEmptyLine: true }); if (st.usable && st.text) cleaned = st.text; }
    }
    const n = guardianNumbersGate(cleaned, nums ?? basis ?? null, nums ? basis ?? null : null);
    const r = validateInsight(n.text, locale);
    // ★2026-10-07 T5 문턱·비교·범위 문장 — «RLSI 42 sits below the 40 threshold»(42 는 40 아래가 아니다)
    const facts = guardianCmpFacts(nums ?? basis ?? null);
    const cmpReasons = [...checkComparisons(n.text, facts), ...checkRanges(n.text, facts)];
    const reasons = [...r.reasons, ...n.reasons, ...forecastReasons, ...cmpReasons];
    return { ok: reasons.length === 0, tpl: cleaned, text: n.text, reasons };
}

/** Redis 에서 읽기 — 읽을 때도 검사한다(언어·거절 + 화면 숫자). 검사를 도입하기 전에 저장된 나쁜 글이 TTL 동안 나가지 않게. */
async function readStoredInsight(type: InsightType, locale: Locale, nums?: GNums | null): Promise<CachedInsight | null> {
    const redis = getRedis();
    if (!redis) return null;
    const key = getRedisKey(type, locale);
    try {
        const data = await redis.get(key) as { text?: string; updatedAt?: string; basis?: GNums | null } | null;
        if (!data?.text) return null;
        const basis = data.basis && typeof data.basis === 'object' ? data.basis : null;
        const g = gateText(type, data.text, locale, nums, basis);
        if (!g.ok) {
            console.warn(`[InsightGate] REJECT stored ${key} (${g.reasons.join(' | ')}) :: ${previewForLog(g.text)}`);
            return null;
        }
        if (isPlaceholder(g.text)) return null;
        const at = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
        return { text: g.tpl, at: Number.isFinite(at) ? at : 0, basis };
    } catch (e) {
        console.warn("[IntelligenceNode] Redis load error:", e);
        return null;
    }
}

/** Redis 에 쓰기 — 호출자는 반드시 gateText 를 통과한(그리고 대기 문구가 아닌) 글만 넘긴다. 나쁜 글로 좋은 캐시를 덮지 않는다. */
async function writeStoredInsight(type: InsightType, locale: Locale, text: string, basis?: GNums | null): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    const key = getRedisKey(type, locale);
    try {
        await redis.set(key, JSON.stringify({ text, basis: basis ?? null, updatedAt: new Date().toISOString() }), { ex: REDIS_TTL_SEC });
        console.log(`[IntelligenceNode] Saved ${key} to Redis (${text.length} chars)`);
    } catch (e) {
        console.warn("[IntelligenceNode] Redis save error:", e);
    }
}

function rememberInsight(type: InsightType, locale: Locale, text: string, at: number, basis?: GNums | null): void {
    _mem[type][locale] = { text, at, basis: basis ?? null };
}

/** 자리표 글 → 화면 글. 채울 값이 없어 자리표가 남으면 대기 문구(자리표가 화면에 나가지 않게). 내보낸 원본·기준을 기억한다. */
function shownOut(type: InsightType, locale: Locale, out: InsightOut, nums?: GNums | null): string {
    const f = fillGuardianTokens(out.tpl, nums ?? out.basis ?? null);
    const shown = hasGuardianTokens(f.text) ? (isOffHours() ? OFF_HOURS_TEXT : PENDING_TEXT)[type][locale] : f.text;
    _lastOut[type][locale] = shown === f.text ? { shown, tpl: out.tpl, basis: out.basis } : null;
    return shown;
}

/** 모델 호출 함수 — 테스트가 바꿔 끼운다(검사·대체 경로를 네트워크 없이 고정: scripts/test-insight-gate.ts) */
let _modelCaller: typeof callBedrock = callBedrock;
/** 테스트 전용 — 모델 호출을 바꿔 끼운다. null = 원래대로 */
export function _setModelCallerForTest(fn: typeof callBedrock | null): void {
    _modelCaller = fn || callBedrock;
}
/** 테스트 전용 — 메모리 캐시·생성 실패 쿨다운 초기화 */
export function _resetInsightStateForTest(): void {
    for (const type of Object.keys(_mem) as InsightType[]) {
        for (const locale of Object.keys(_mem[type]) as Locale[]) {
            _mem[type][locale] = null;
            _genFailUntil[type][locale] = 0;
        }
    }
}

// === SYSTEM PROMPTS (per locale) ===
/**
 * ★2026-09-29 전면 교체 — 사고 경위는 lib/ai/outputGate.ts 머리말.
 * 예전 system(영어 한 벌)은 «관찰어(observed, noted, indicates, suggests)만 써라 · plain text only»라고 했는데,
 *   · 감마 프롬프트는 바로 그 «시사한다·관찰된다·suggests·indicates»를 금지했고
 *   · 한국어 현실 프롬프트는 «눌림목 매수 기회» «역발상 매수 구간 검토» «추격 매수 금지» 같은 권유 틀을 줬고
 *   · 출력 언어는 어디에도 system 에 없었다.
 * 모델은 한쪽을 고르는 대신 «지시문에 대한 설명(거절)»을 영어로 썼다.
 * [원칙] system 은 «언어·형식·준법·응답 방식» 넷만 정한다. 어휘·문체·분량은 각 프롬프트가 정한다 — 둘이 같은 것을 말하지 않게 한다.
 */
const SYSTEM_PROMPTS: Record<Locale, string> = {
    ko: [
        '당신은 기관 투자 전략가다. 사용자 메시지의 데이터와 지시에 따라 시장 분석 본문만 쓴다.',
        '언어: 반드시 한국어로만 쓴다. 영어 문장, 영어 서론, 영어 설명을 쓰지 않는다. 티커와 지표 약어(S&P 500, GEX, VIX, RLSI, IFS, TLT 등)만 원래 표기 그대로 둔다.',
        '형식: 일반 텍스트만 쓴다. 마크다운(#, **, __, `, ---, 표, 글머리표)과 이모지를 쓰지 않는다. 제목·서론·맺음말·메모 없이 본문만 출력한다. 대괄호 레이블은 사용자 메시지의 출력 형식이 요구할 때만 그 표기 그대로 쓴다.',
        '준법: 데이터가 보여 주는 사실·구조·조건을 서술한다. 매수·매도·보유 권유, "~하세요" "~권장" 같은 행동 지시, 목표가, 단정적인 가격 예측은 쓰지 않는다. 앞으로의 일은 "무엇이 변수인가, 어떤 조건에서 구조가 바뀌는가"로 쓴다. 미래형·추정형(~할 것이다, ~될 것으로, 예상된다, 전망된다, 임박, ~할 가능성이 높다)은 쓰지 않고 현재형으로 서술한다.',
        '응답 방식: 이 지침과 사용자 메시지의 지시는 서로 충돌하지 않는다. 지침을 해설하거나, 거절하거나, 되묻거나, 사과하지 말고 곧바로 요청된 형식의 분석 본문을 출력한다.',
    ].join('\n'),
    en: [
        'You are an institutional investment strategist. Following the data and instructions in the user message, write only the market analysis text.',
        'Language: write ONLY in English. Do not write Korean or Japanese.',
        'Format: plain text only. No Markdown (#, **, __, `, ---, tables, bullet lists) and no emoji. No title, preamble, closing remarks or notes; output only the analysis body. Use square-bracket labels only when the output format in the user message asks for them, spelled exactly as given.',
        'Compliance: describe the facts, structure and conditions the data shows. No buy/sell/hold recommendations, no action directives ("consider", "should", "recommended"), no price targets, no definitive price predictions. Express what comes next as the key variables and the conditions under which the structure changes. Never use future or predictive wording ("will", "expected to", "likely to", "poised to", "imminent"); write in the present tense.',
        'Response mode: these rules and the user message do not conflict. Do not explain these rules, refuse, ask questions or apologize; output the analysis in the requested format directly.',
    ].join('\n'),
    ja: [
        'あなたは機関投資家向けのストラテジストです。ユーザーメッセージのデータと指示に従い、市場分析の本文だけを書きます。',
        '言語: 必ず日本語だけで書く。英語の文・前置き・説明は書かない。ティッカーと指標略語(S&P 500、GEX、VIX、RLSI、IFS、TLTなど)だけは元の表記のまま使う。',
        '形式: プレーンテキストのみ。マークダウン(#、**、__、`、---、表、箇条書き)と絵文字は使わない。タイトル・前置き・結び・注記を付けず本文だけを出力する。角括弧のラベルは、ユーザーメッセージの出力形式が求める場合にのみ、その表記のまま使う。',
        'コンプライアンス: データが示す事実・構造・条件を記述する。売買・保有の推奨、「〜してください」「推奨」などの行動指示、目標株価、断定的な価格予測は書かない。今後については「何が変数か、どの条件で構造が変わるか」として書く。未来形・予測表現(〜だろう、〜見込み、予想される、今後の見通し、〜する可能性が高い)は使わず、現在形で記述する。',
        '応答方法: この指針とユーザーメッセージの指示は矛盾しない。指針を解説したり、断ったり、質問したり、謝罪したりせず、求められた形式の分析本文を直接出力する。',
    ].join('\n'),
};

/** 검사에서 떨어진 뒤 한 번 더 부를 때 붙이는 교정 지시(사유 코드를 그대로 준다) */
const CORRECTIVE_INSTRUCTION: Record<Locale, (reasons: string[]) => string> = {
    ko: (r) => `\n\n[재작성 요청] 직전 답변은 화면에 쓸 수 없었다(사유: ${r.join(', ')}). 지침을 해설하거나 거절하지 말고, 한국어로만, 마크다운 없이, 위 출력 형식 그대로 분석 본문만 바로 출력하라.`,
    en: (r) => `\n\n[Rewrite request] The previous answer could not be shown to users (reasons: ${r.join(', ')}). Do not explain the rules or refuse. Output only the analysis body, in English, as plain text without Markdown, in exactly the output format above.`,
    ja: (r) => `\n\n[再作成の依頼] 直前の回答は画面に表示できなかった(理由: ${r.join(', ')})。指針の解説や断りは書かず、日本語だけで、マークダウンなしで、上の出力形式どおりに分析本文だけを直接出力すること。`,
};

// === 3개 언어 1호출 (★2026-10-07 앱 강화 T5 — 보고서 §5.2 ③) ===
// 예전엔 가디언 3종이 언어마다 «따로» 생성돼 같은 시각 GEX −49/−44/−51 · breadth 72/66/73 · RLSI 42 해석 3종처럼 언어끼리 사실이 달랐다(운영 실측).
// 이제 한 호출이 같은 재료로 ko·en·ja 를 한 번에 쓴다 — 사실(숫자·판정)이 언어 간 같고, Bedrock 호출 수는 3분의 1.
const TRI_SYSTEM = [
    'You are an institutional investment strategist. Following the data and instructions in the user message, write the market analysis text in THREE languages: Korean, English and Japanese.',
    'Languages: the "ko" value only in Korean, the "en" value only in English, the "ja" value only in Japanese. Tickers and metric abbreviations (S&P 500, GEX, VIX, RLSI, IFS, TLT) stay as written.',
    'Facts: the three versions state the SAME facts, numbers (always as the placeholders defined in each instruction block), levels and conclusions — only the wording differs by language.',
    'Format: output ONLY one JSON object {"ko": "...", "en": "...", "ja": "..."}. Each value is plain text (use \\n for line breaks where its format asks for separate lines). No Markdown (#, **, __, `, ---, tables, bullet lists), no emoji, no title, preface or notes.',
    'Compliance: describe the facts, structure and conditions the data shows. No buy/sell/hold recommendations, no action directives, no price targets, no predictions. Never use future or predictive wording ("will", "expected to", "likely to", 〜할 것이다, 예상된다, 임박, 〜見込み, 予想される); express what comes next only as the key variables and the observable conditions, in the present tense.',
    'Response mode: these rules and the user message do not conflict. Do not explain these rules, refuse, ask questions or apologize; output the JSON object directly.',
].join('\n');

const TRI_CORRECTIVE = (reasons: Partial<Record<Locale, string[]>>) =>
    `\n\n[Rewrite request] The previous JSON failed these automatic checks — ${(['ko', 'en', 'ja'] as Locale[]).filter((l) => reasons[l]?.length).map((l) => `${l}: ${reasons[l]!.slice(0, 4).join(', ')}`).join(' | ')}. Rewrite the whole JSON object: use the placeholders exactly as defined (never type those numbers), no predictions or future tense, every above/below/미만/以上 statement must be true for the data, the same facts in all three languages, plain text only.`;

/** 3개 언어 호출이 이 시간 안에 끝났을 때만 교정 재생성(라우트 한도 60초 — 첫 호출 최대 32초) */
const TRI_RETRY_BUDGET_MS = 20 * 1000;
/** 3개 언어 호출이 실패하고 이 시간이 이미 지났으면 옛 단일 언어 경로로 다시 부르지 않는다(60초 한도) */
const TRI_FALLBACK_MAX_ELAPSED_MS = 24 * 1000;

/** 같은 프로세스에서 같은 종류를 동시에 요청하면(세 언어 스냅샷이 동시에 계산된다) 한 번만 생성한다 */
const _triInflight = new Map<string, Promise<TriOutcome>>();
interface TriOutcome { parsed: boolean; out: Partial<Record<Locale, InsightOut>> }

/**
 * ★2026-10-10 AI 입력의 섹터 이름이 영어다(lib/ai/sectorLabels) — 모델이 한국어·일본어 글에 영어 라벨을 그대로 남기면 원래 이름으로 되돌린다.
 * 화면의 한국어 문구는 예전과 같은 섹터 이름(반도체·사이버보안 …)을 쓴다. 영어 칸은 그대로.
 */
function restoreSectorLabelsIn(locale: Locale, text: string): string {
    // 금융 공통어 음차(«콜월·맥스페인»)도 같은 자리에서 영어 이름으로 — 현행 모델도 12건 중 1건 음차했다(A/B 실측)
    if (locale === 'ko') return restoreCommonTermNames(restoreKoSectorNames(text).text).text;
    if (locale === 'ja') return restoreCommonTermNames(restoreJaSectorNames(text).text).text;
    return text;
}
function restoreSectorLabels(raw: Partial<Record<Locale, string>> | null): Partial<Record<Locale, string>> | null {
    if (!raw) return raw;
    const out: Partial<Record<Locale, string>> = { ...raw };
    for (const l of ['ko', 'ja'] as Locale[]) if (typeof out[l] === 'string') out[l] = restoreSectorLabelsIn(l, out[l]!);
    return out;
}

function parseTriJson(text: string): Partial<Record<Locale, string>> | null {
    let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const i = t.indexOf('{');
    if (i < 0) return null;
    t = t.slice(i);
    const pick = (o: any): Partial<Record<Locale, string>> | null => {
        if (!o || typeof o !== 'object') return null;
        const r: Partial<Record<Locale, string>> = {};
        for (const l of ['ko', 'en', 'ja'] as Locale[]) if (typeof o[l] === 'string' && o[l].trim()) r[l] = o[l];
        return Object.keys(r).length ? r : null;
    };
    try { return pick(JSON.parse(t)); } catch { /* 아래 괄호 맞춤 */ }
    let depth = 0, end = -1, inStr = false;
    for (let k = 0; k < t.length; k++) {
        const c = t[k];
        if (c === '"' && t[k - 1] !== '\\') inStr = !inStr;
        if (inStr) continue;
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    if (end > 0) { try { return pick(JSON.parse(t.slice(0, end + 1))); } catch { return null; } }
    return null;
}

// === LOCALIZED PROMPTS ===
// ★2026-09-29 — 프롬프트는 system(SYSTEM_PROMPTS)과 같은 말을 해야 한다. 이번에 걷어낸 모순:
//   · 권유 틀(«실질적 조언 제공» «눌림목 매수 기회» «역발상 매수 구간 검토» «추격 매수 금지» «주시 필요») → 관찰·조건 서술로
//   · 프롬프트 본문의 마크다운(**굵게**) — 모델이 그대로 따라 써서 화면에 «**»«#»가 날것으로 나갔다 → 전부 제거
//   · 출력 형식을 줄 단위로 못 박는다(레이블은 줄 맨 앞, 빈 줄 없음) — TypewriterText·MobileGuardianFlow 가 그 모양을 읽는다
//   · 10년물 변화는 bp 로(예전: 금리 수준의 상대 변화율 %를 «변동»으로 찍어 «108bp 급등»으로 읽혔다)
const ROTATION_PROMPTS: Record<Locale, (ctx: IntelligenceContext, vectorDesc: string) => string> = {
    ko: (ctx, vectorDesc) => {
        // [V9.0] Build macro asset summary for rotation context
        const macroLines: string[] = [];
        if (ctx.spxChangePct !== undefined) macroLines.push(`S&P 500: ${ctx.spxChangePct >= 0 ? '+' : ''}${ctx.spxChangePct.toFixed(2)}%`);
        if (ctx.dxy !== undefined) macroLines.push(`달러(DXY): ${ctx.dxy.toFixed(1)}`);
        if (ctx.goldChangePct !== undefined) macroLines.push(`금: ${ctx.goldChangePct >= 0 ? '+' : ''}${ctx.goldChangePct.toFixed(2)}%`);
        if (ctx.oilChangePct !== undefined) macroLines.push(`유가(WTI): ${ctx.oilChangePct >= 0 ? '+' : ''}${ctx.oilChangePct.toFixed(2)}%`);
        if (ctx.tltChangePct !== undefined) macroLines.push(`채권(TLT): ${ctx.tltChangePct >= 0 ? '+' : ''}${ctx.tltChangePct.toFixed(2)}%`);
        if (ctx.fearGreedScore !== undefined) macroLines.push(`공포탐욕: ${ctx.fearGreedScore.toFixed(0)} (${ctx.fearGreedRating || ''})`);
        const macroContext = macroLines.length > 0 ? `\n        [거시경제 자산]
        ${macroLines.map(l => `- ${l}`).join('\n        ')}` : '';

        return `
        당신은 기관 투자 전략가입니다. 5일 추세 데이터, 거시경제 자산 동향, 실시간 뉴스를 기반으로 정확한 순환매 분석을 제공합니다.

        현재 데이터:
        - NASDAQ 변동: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - 오늘의 자금 흐름: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${rvolText(ctx.rvol)}
        ${ctx.rotationRegime ? `- 5일 순환매 레짐: ${ctx.rotationRegime}` : ''}
        ${ctx.topInflow5d ? `- 5일 유입 섹터: ${ctx.topInflow5d}` : ''}
        ${ctx.topOutflow5d ? `- 5일 유출 섹터: ${ctx.topOutflow5d}` : ''}
        ${ctx.trendVsToday ? `- 당일 vs 추세 괴리: ${ctx.trendVsToday}` : ''}
        ${ctx.noiseWarning ? `- 노이즈 경고: ${ctx.noiseWarning}` : ''}
        ${ctx.rotationConviction ? `- 순환매 확신도: ${ctx.rotationConviction}` : ''}
        ${macroContext}

        ${ctx.signalConflict ? `- [경고] 신호 충돌: ${ctx.signalConflict}` : ''}

        ${ctx.gexIndex !== undefined ? `GAMMA SHIELD:
        - GEX 지수: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'})
        - 스퀴즈 리스크: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'})
        ${ctx.triggerSupport ? `- 옵션 지지선(S&P 500): ${ctx.triggerSupport.toLocaleString()}` : ''}
        ${ctx.triggerResistance ? `- 옵션 저항선(S&P 500): ${ctx.triggerResistance.toLocaleString()}` : ''}
        ${ctx.triggerCurrent ? `- 현재가(S&P 500): ${ctx.triggerCurrent.toLocaleString()}` : ''}` : ''}

        ${ctx.sectorIFS && ctx.sectorIFS.length > 0 ? `기관 수급 (Institutional Flow Score):
        ${ctx.sectorIFS.map(s => `- ${s.id}: IFS ${s.ifs > 0 ? '+' : ''}${s.ifs.toFixed(0)} (${s.divergence})`).join('\n        ')}` : ''}
        ${ctx.stealthAlert ? `- [STEALTH 매집] ${ctx.stealthAlert}` : ''}
        ${ctx.exitAlert ? `- [SMART EXIT] ${ctx.exitAlert}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `실시간 시장 뉴스:
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        중요 분석 규칙:
        - 당일 반등이 있더라도 5일 추세가 하락이면 "일시적 반등"으로 판단
        - 5일 유입/유출 데이터가 당일 데이터보다 우선
        - 노이즈 경고가 있는 섹터는 신뢰도가 낮음을 언급
        - 레짐(RISK_OFF_DEFENSE 등)을 해석에 반영
        - 신호 충돌 시: RLSI/나스닥은 강세이나 순환매가 RISK_OFF이면 "겉은 강세, 속은 약세" 같은 표현으로 혼재 신호를 명확히 전달. 반대로 지표는 약세이나 성장주로 자금 유입 시 "저점 매집 가능성" 표현 사용
        - 뉴스가 제공된 경우: 수치 변동의 원인을 뉴스에서 찾아 반드시 언급 (예: "CPI 예상 상회로 인한 매도세", "연준 발언으로 금리 인하 기대 후퇴"). 단, 뉴스를 번호로 참조하지 말 것 ("뉴스 1번", "뉴스 4번" 등 금지). 뉴스 내용을 자연스럽게 녹여서 서술

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `DIVERGENCE 상황 (최우선 분석 필수):
        현재 지수 표면과 내부 유동성 간 괴리(Divergence)가 관측됩니다.
        - 유형: ${ctx.divergenceCase === 'A' ? 'False Rally (지수↑ 유동성↓)' : ctx.divergenceCase === 'B' ? 'Stealth Inflow (지수↓ 유동성↑)' : ctx.divergenceCase === 'C' ? 'Momentum Surge (지수↑ 유동성↑)' : 'Deep Freeze (지수↓ 유동성↓)'}
        - 상황: ${ctx.divergenceDesc || ''}
        이 Divergence가 순환매 맥락에서 무엇을 의미하는지 반드시 [해석]에 포함하세요. (예: "지수는 상승하나 스마트머니는 이미 방어주로 이동 중으로, 표면 강세의 지속 가능성이 낮다" 또는 "가격 하락 속 기관 자금 유입이 관측되어 저점 매집 가능성")` : ''}
        - 거시경제 자산 교차 검증: 금+채권(TLT) 동반 상승 시 안전자산 선호 언급, 유가 급등 시 인플레 우려, 달러 강세 시 신흥국/원자재 약세 연결
        - 감마 쉴드 분석: GEX가 -20 이하면 딜러 매수 헤지로 변동성 확대 경고, +20 이상이면 감마 클램핑으로 안정 언급. 스퀴즈 리스크 45% 이상이면 급변동 가능성 경고. 옵션 지지/저항선 근접 시 해당 레벨 언급

        출력 형식 (반드시 이 형식으로. 레이블 3개를 각각 줄 맨 앞에 쓰고, 섹션 사이에 빈 줄을 두지 않는다):
        [현황] (5일 기준 섹터 이동 현황 + 거시 배경 1문장)
        [해석] (의미 + 뉴스 기반 원인 1문장, 신호 충돌 시 반드시 언급)
        [전망] (방향을 가르는 핵심 변수와 지금의 조건 1문장 — 현재형으로 «~가 변수다» 꼴, 미래형(~할 것이다·~될 것)·예측·행동 지시 금지)

        규칙:
        - 한국어로만 쓰는 전문가 문체
        - 섹터명은 한글 (기술주, 에너지, 부동산 등)
        - 3줄 이내, 간결하게
        - 뉴스에서 핵심 이벤트를 추출하여 수치의 "왜"를 설명
        - 거시경제 자산 동향으로 순환매의 배경을 설명 (예: "유가 급등으로 에너지 유입")
        - 이모지·마크다운(#, **) 금지. 일반 텍스트만 사용
        - "~해야 한다" "~주목할 필요" "~모니터링" 같은 당부·지시 표현 금지(관찰과 조건으로만 서술)
        - 기관 수급(IFS)이 제공된 경우: 가격 상승인데 IFS 음수 섹터는 "개인 주도 상승" 언급, 가격 하락인데 IFS 양수는 "기관 스텔스 매집" 패턴으로 분석. STEALTH/EXIT 알러트가 있으면 반드시 [해석]에 포함
    `;
    },
    en: (ctx, vectorDesc) => `
        You are an institutional investment strategist. Analyze sector rotation using 5-day trend data and real-time news.

        Current Data:
        - NASDAQ Change: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - Today's Money Flow: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${rvolText(ctx.rvol)}
        ${ctx.rotationRegime ? `- 5-Day Rotation Regime: ${ctx.rotationRegime}` : ''}
        ${ctx.topInflow5d ? `- 5-Day Inflow Leaders: ${ctx.topInflow5d}` : ''}
        ${ctx.topOutflow5d ? `- 5-Day Outflow Leaders: ${ctx.topOutflow5d}` : ''}
        ${ctx.trendVsToday ? `- Today vs Trend Divergence: ${ctx.trendVsToday}` : ''}
        ${ctx.noiseWarning ? `- Noise Warning: ${ctx.noiseWarning}` : ''}
        ${ctx.rotationConviction ? `- Rotation Conviction: ${ctx.rotationConviction}` : ''}

        ${ctx.signalConflict ? `- [WARNING] Signal Conflict: ${ctx.signalConflict}` : ''}

        ${ctx.gexIndex !== undefined ? `GAMMA SHIELD:
        - GEX Index: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'})
        - Squeeze Risk: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'})
        ${ctx.triggerSupport ? `- Options Support (S&P 500): ${ctx.triggerSupport.toLocaleString()}` : ''}
        ${ctx.triggerResistance ? `- Options Resistance (S&P 500): ${ctx.triggerResistance.toLocaleString()}` : ''}
        ${ctx.triggerCurrent ? `- Current Price (S&P 500): ${ctx.triggerCurrent.toLocaleString()}` : ''}` : ''}

        ${ctx.sectorIFS && ctx.sectorIFS.length > 0 ? `Institutional Flow Score (IFS):
        ${ctx.sectorIFS.map(s => `- ${s.id}: IFS ${s.ifs > 0 ? '+' : ''}${s.ifs.toFixed(0)} (${s.divergence})`).join('\n        ')}` : ''}
        ${ctx.stealthAlert ? `- [STEALTH ACCUMULATION] ${ctx.stealthAlert}` : ''}
        ${ctx.exitAlert ? `- [SMART MONEY EXIT] ${ctx.exitAlert}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `Real-time Market News:
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        Critical Analysis Rules:
        - If today shows a bounce but 5-day trend is down, call it a "relief rally"
        - 5-day inflow/outflow data takes priority over single-day data
        - Sectors with noise warnings have low reliability
        - Reflect the regime (RISK_OFF_DEFENSE etc.) in market outlook
        - Signal Conflict: When RLSI/NASDAQ are bullish but rotation is RISK_OFF, describe it as "surface strength masks underlying weakness"
        - When news is provided: Identify the root cause of market movements from news (e.g., "CPI beat triggered selloff", "Fed hawkish tone pressures growth"). Do NOT reference news by number (e.g., "news #1", "news #4"). Weave news context naturally into analysis
        - Gamma Shield: If GEX <= -20, warn about dealer hedging amplifying volatility. If GEX >= +20, note gamma clamping stabilizing prices. If squeeze risk >= 45%, warn about potential sharp moves. Reference options support/resistance levels when price is near them

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `DIVERGENCE ALERT (prioritize in analysis):
        A significant divergence between index surface and internal liquidity is detected.
        - Type: ${ctx.divergenceCase === 'A' ? 'False Rally (Index UP, Liquidity DOWN)' : ctx.divergenceCase === 'B' ? 'Stealth Inflow (Index DOWN, Liquidity UP)' : ctx.divergenceCase === 'C' ? 'Momentum Surge (Index UP, Liquidity UP)' : 'Deep Freeze (Index DOWN, Liquidity DOWN)'}
        - Context: ${ctx.divergenceDesc || ''}
        You MUST address what this divergence means for sector rotation in [Interpretation]. (e.g., "Index rises but smart money is already rotating to defensives, questioning rally sustainability" or "Institutional accumulation during selloff suggests potential bottom formation")` : ''}

        Output Format (strictly follow; put each of the three labels at the start of its own line, no blank lines between sections):
        [Status] (1 sentence on 5-day sector movement)
        [Interpretation] (1 sentence on meaning + news-based cause, MUST mention signal conflicts if present)
        [Outlook] (1 sentence naming the key variables and the conditions that decide direction — present tense, e.g. "The key variable is …"; no future tense, no predictions or action directives)

        Rules:
        - Professional briefing style, written only in English
        - Be specific with sector names
        - Max 3 lines, concise
        - Reference key news events to explain the "why" behind the numbers
        - No emoji and no Markdown (#, **). Plain text only
        - No reader directives such as "should", "watch", "monitor", "investors need to"; describe conditions instead
        - When IFS data is provided: If a sector shows price rise but negative IFS, describe as "retail-driven rally". If price falls but positive IFS, describe as "stealth institutional accumulation". STEALTH/EXIT alerts MUST be addressed in [Interpretation]
    `,
    ja: (ctx, vectorDesc) => `
        あなたは機関投資戦略家です。5日間のトレンドデータとリアルタイムニュースに基づいてセクターローテーションを分析します。

        現在のデータ:
        - NASDAQ変動: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - 本日の資金フロー: [${vectorDesc}]
        - VIX: ${ctx.vix.toFixed(1)}
        - RVOL: ${rvolText(ctx.rvol)}
        ${ctx.rotationRegime ? `- 5日ローテーションレジーム: ${ctx.rotationRegime}` : ''}
        ${ctx.topInflow5d ? `- 5日流入リーダー: ${ctx.topInflow5d}` : ''}
        ${ctx.topOutflow5d ? `- 5日流出リーダー: ${ctx.topOutflow5d}` : ''}
        ${ctx.trendVsToday ? `- 本日 vs トレンド: ${ctx.trendVsToday}` : ''}
        ${ctx.noiseWarning ? `- ノイズ警告: ${ctx.noiseWarning}` : ''}
        ${ctx.rotationConviction ? `- ローテーション確信度: ${ctx.rotationConviction}` : ''}

        ${ctx.gexIndex !== undefined ? `ガンマシールド:
        - GEX指数: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'})
        - スクイーズリスク: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'})
        ${ctx.triggerSupport ? `- オプションサポート(S&P 500): ${ctx.triggerSupport.toLocaleString()}` : ''}
        ${ctx.triggerResistance ? `- オプションレジスタンス(S&P 500): ${ctx.triggerResistance.toLocaleString()}` : ''}` : ''}

        ${ctx.sectorIFS && ctx.sectorIFS.length > 0 ? `機関需給 (Institutional Flow Score):
        ${ctx.sectorIFS.map(s => `- ${s.id}: IFS ${s.ifs > 0 ? '+' : ''}${s.ifs.toFixed(0)} (${s.divergence})`).join('\n        ')}` : ''}
        ${ctx.stealthAlert ? `- [ステルス買集] ${ctx.stealthAlert}` : ''}
        ${ctx.exitAlert ? `- [スマートマネー流出] ${ctx.exitAlert}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `リアルタイム市場ニュース:
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        重要な分析ルール:
        - 本日反発があっても5日トレンドが下降なら「一時的反発」と判断
        - 5日流入/流出データが1日データより優先
        - ノイズ警告のあるセクターは信頼性が低い
        - レジーム(RISK_OFF_DEFENSEなど)を解釈に反映する
        - ニュースが提供された場合: 数値変動の原因をニュースから特定して必ず言及。ニュースを番号で参照しないこと（「ニュース1番」等禁止）。自然に文脈に織り込む

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `DIVERGENCE アラート(分析最優先):
        指数表面と内部流動性の乖離が観測されています。
        - タイプ: ${ctx.divergenceCase === 'A' ? '偽のラリー(指数↑ 流動性↓)' : ctx.divergenceCase === 'B' ? 'ステルス流入(指数↓ 流動性↑)' : ctx.divergenceCase === 'C' ? 'モメンタムサージ(指数↑ 流動性↑)' : '同時弱体化(指数↓ 流動性↓)'}
        - 状況: ${ctx.divergenceDesc || ''}
        このDivergenceがセクターローテーションの文脈で何を意味するか必ず[解釈]に含めてください。` : ''}

        出力形式 (必ずこの形式で。3つのラベルをそれぞれ行頭に置き、セクションの間に空行を入れない):
        [現況] (5日基準セクター移動現況 1文)
        [解釈] (意味 + ニュース基盤の原因 1文)
        [見通し] (方向を分ける核心変数と現在の条件 1文 — 現在形で「〜が変数だ」の形、未来形・予測・行動指示禁止)

        ルール:
        - 日本語だけで書く専門家スタイル
        - セクター名は日本語（テクノロジー、エネルギー、不動産など）
        - 3行以内、簡潔に
        - ニュースから核心イベントを抽出して「なぜ」を説明
        - 絵文字・マークダウン(#、**)禁止。プレーンテキストのみ
        - 「〜すべき」「注視」「注目する必要」などの呼びかけ禁止(観察と条件で書く)
        - 機関需給(IFS)が提供された場合: 価格上昇だがIFSマイナスのセクターは「個人主導上昇」と言及、価格下落だがIFSプラスは「機関ステルス買集」パターンとして分析
    `
};

const GAMMA_PROMPTS: Record<Locale, (ctx: IntelligenceContext) => string> = {
    ko: (ctx) => {
        const gex = ctx.gexIndex ?? 0;
        const squeeze = ctx.squeezeRisk ?? 0;
        // ⚠️ 이 프롬프트는 2026-09-03 에 다시 썼다. 이유는 아래 셋이다.
        //   ① 예전 규칙 2번은 「학술적 표현 절대 금지」인데 8번은 「'관찰된다·시사한다'
        //      어조 유지」를 요구했다. 그 어조가 바로 학술 문체다. 프롬프트가
        //      자기모순이라 금지가 먹히지 않았다. 컴플라이언스는 «단정·권유를 안 하는 것»이지
        //      한자어 문체가 아니다 — 평서형으로도 지킬 수 있다.
        //   ② 출력 형식이 GEX·Squeeze·현재가·벽 거리를 «서술»하라고 시켰는데,
        //      그 숫자는 카드가 이미 값으로 보여 준다. 그래서 AI 가 화면을 다시 읽어 줬다.
        //      실측 출력: "현재가 7,714는 풋 플로어 7,650 대비 64포인트 상방…"
        //   ③ 그래서 정작 인사이트인 것 — 오늘이 평소와 어떻게 다른가, 무엇이 이 판단을
        //      뒤집는가 — 이 하나도 없었다. 이제 백분위·직전 대비 변화를 넣어 준다.
        const pct = ctx.gexPercentile;
        const samples = ctx.gexSamples ?? 0;
        const chg = ctx.gexChange;
        return `
        당신은 파생상품 데스크의 시니어 전략가입니다. 아래 데이터로 오늘 옵션 구조에서 남들이 놓치는 한 가지를 짚어 주십시오.

        오늘 값:
        - GEX 지수 ${gex >= 0 ? '+' : ''}${gex} (${ctx.gexLevel || 'NEUTRAL'}) / SPY ${ctx.spyGexIndex ?? '—'} · QQQ ${ctx.qqqGexIndex ?? '—'}
        - 변동성 압축 ${squeeze}% (${ctx.squeezeLevel || 'LOW'})
        ${typeof chg === 'number' ? `- 직전 측정 대비 GEX 변화: ${chg >= 0 ? '+' : ''}${chg}` : ''}
        ${typeof pct === 'number' && samples >= 10 ? `- 오늘 딜러 감마는 최근 ${samples}거래일 중 상위 ${100 - pct}% 수준 (백분위 ${pct})` : ''}
        ${ctx.triggerCurrent ? `- S&P500 현재가 ${ctx.triggerCurrent.toLocaleString()} / Put Floor ${ctx.triggerSupport?.toLocaleString() ?? '—'} / Call Wall ${ctx.triggerResistance?.toLocaleString() ?? '—'}${ctx.gammaFlipPoint ? ` / Gamma Flip ${ctx.gammaFlipPoint.toLocaleString()}` : ''}` : ''}

        화면이 이미 보여 주는 것 (절대 다시 쓰지 마십시오):
        GEX 숫자와 등급, 압축 %, 현재가·지지·저항까지의 거리. 이 값들을 문장으로 옮겨 적는 것은 실패입니다.

        당신만 할 수 있는 것 — 이 둘만 쓰십시오:
        [평소와 다른 점] 오늘 수치가 최근 이력·직전 대비 어떤 위치인지, 그게 무슨 뜻인지 한 문장.
          백분위 자료가 없으면 SPY와 QQQ가 갈리는지, 직전 대비 어디로 움직였는지로 대신하십시오.
        [이 판단이 깨지는 지점] 어떤 가격을 지나면 지금 구조가 반대로 작동하기 시작하는지 한 문장.
          숫자를 쓰되 «왜 그 자리인지»를 붙이십시오 (예: 그 아래에서는 같은 딜러가 반대로 팔기 시작한다).

        문체:
        - 한 문장에 한 가지만. 짧게. 「~다」로 끝내는 평서형.
        - 「~함을 시사한다」 「~가 관찰된다」 「~에 기인한다」 금지. 번역투 금지.
        - 전문어를 쓰면 바로 뒤에 일상어로 풀어 주십시오.
        - 비유(압력밥솥·쿠션·에어백) 금지. 이모지 금지.

        ★ 가격 예측 절대 금지 (가장 중요):
        평서형은 «지금 구조»를 말할 때만 씁니다. 앞으로의 가격에는 쓰지 마십시오.
        「~할 것이다」뿐 아니라 「~나타난다」 「~가속된다」 「~하락한다」 처럼
        앞으로 일어날 일을 현재형으로 단정하는 것도 전부 금지입니다.
        구조가 «어떤 자리에서 어떻게 바뀌는지»만 쓰고, 그래서 무슨 일이 생길지는 쓰지 마십시오.
          나쁜 예: 7,650 아래로 내려가면 하락 가속이 나타난다.
          좋은 예: 7,650 아래는 같은 딜러가 반대로 팔아야 하는 자리로 바뀐다.
          나쁜 예: 변동성이 확대된다 / 상승 흐름이 이어진다
          좋은 예: 그 구간에서는 헤지 방향이 반대가 된다

        ★ 화면과 모순 금지: 등급이 중립이면 「감마가 변동성을 키운다」처럼
        등급과 어긋나는 말을 쓰지 마십시오. 중립은 «누르지도 키우지도 않는다»는 뜻입니다.

        출력 형식: 아래 두 줄만 쓴다. 대괄호 레이블을 각 줄 맨 앞에 그대로 쓰고, 마크다운(**)은 쓰지 않는다.
        [평소와 다른 점] (한 문장)
        [이 판단이 깨지는 지점] (한 문장)
        분량: 두 문장, 각 60자 이내. 초과하면 실패입니다.
        `;
    },
    en: (ctx) => {
        const gex = ctx.gexIndex ?? 0;
        const squeeze = ctx.squeezeRisk ?? 0;
        return `
        You are a senior derivatives strategist. Point out the ONE thing about today's options structure that a reader would otherwise miss.

        Today:
        - GEX ${gex >= 0 ? '+' : ''}${gex} (${ctx.gexLevel || 'NEUTRAL'}) / SPY ${ctx.spyGexIndex ?? '—'} · QQQ ${ctx.qqqGexIndex ?? '—'}
        - Compression ${squeeze}% (${ctx.squeezeLevel || 'LOW'})
        ${typeof ctx.gexChange === 'number' ? `- GEX change vs prior reading: ${ctx.gexChange >= 0 ? '+' : ''}${ctx.gexChange}` : ''}
        ${typeof ctx.gexPercentile === 'number' && (ctx.gexSamples ?? 0) >= 10 ? `- Today's dealer gamma sits in the top ${100 - ctx.gexPercentile}% of the last ${ctx.gexSamples} sessions (percentile ${ctx.gexPercentile})` : ''}
        ${ctx.triggerCurrent ? `- S&P 500 ${ctx.triggerCurrent.toLocaleString()} / put floor ${ctx.triggerSupport?.toLocaleString() ?? '—'} / call wall ${ctx.triggerResistance?.toLocaleString() ?? '—'}${ctx.gammaFlipPoint ? ` / gamma flip ${ctx.gammaFlipPoint.toLocaleString()}` : ''}` : ''}

        Already on screen (NEVER restate):
        The GEX number and label, the compression %, and the distances from price to support/resistance.
        Turning those numbers back into prose is a failure.

        Only you can supply these two:
        [What's different from normal] Where today sits versus its own recent history, and what that means. One sentence.
          If no percentile is given, use the SPY vs QQQ split or the change from the prior reading instead.
        [Where this read breaks] The price at which the current structure starts working in reverse. One sentence.
          Give the number AND why that level (e.g. below it the same dealers have to sell instead of buy).

        Style:
        - One idea per sentence. Short. Plain English.
        - Banned: "suggests", "is observed", "indicates", "presents", "underscores". No research-report register.
        - Explain any jargon in the same breath.
        - No analogies (pressure cooker, cushion, airbag). No emojis.

        CRITICAL (never predict price):
        Describe how the structure works, never what price will do.
        Banned not just as "will" but any present-tense claim about a future outcome
        ("acceleration follows", "volatility expands", "the move extends").
          Bad:  Below 7,650 downside acceleration follows.
          Good: Below 7,650 the same dealers have to sell instead of buy.
          Bad:  Volatility expands from here.
          Good: In that zone the hedging flips direction.

        Never contradict the label: if the level says NEUTRAL, do not write that gamma is amplifying moves.

        Output format: exactly these two lines, each square-bracket label at the start of its line, no Markdown (**).
        [What's different from normal] (one sentence)
        [Where this read breaks] (one sentence)
        Length: two sentences, each under 130 characters. Longer is a failure.
        `;
    },
    ja: (ctx) => {
        const gex = ctx.gexIndex ?? 0;
        const squeeze = ctx.squeezeRisk ?? 0;
        return `
        あなたはデリバティブ・デスクのシニアストラテジストです。今日のオプション構造で読者が見落とす一点を指摘してください。

        今日の値:
        - GEX ${gex >= 0 ? '+' : ''}${gex} (${ctx.gexLevel || 'NEUTRAL'}) / SPY ${ctx.spyGexIndex ?? '—'}・QQQ ${ctx.qqqGexIndex ?? '—'}
        - 圧縮 ${squeeze}% (${ctx.squeezeLevel || 'LOW'})
        ${typeof ctx.gexChange === 'number' ? `- 直前計測比のGEX変化: ${ctx.gexChange >= 0 ? '+' : ''}${ctx.gexChange}` : ''}
        ${typeof ctx.gexPercentile === 'number' && (ctx.gexSamples ?? 0) >= 10 ? `- 今日のディーラーガンマは直近${ctx.gexSamples}営業日で上位${100 - ctx.gexPercentile}%（パーセンタイル${ctx.gexPercentile}）` : ''}
        ${ctx.triggerCurrent ? `- S&P500 ${ctx.triggerCurrent.toLocaleString()} / Put Floor ${ctx.triggerSupport?.toLocaleString() ?? '—'} / Call Wall ${ctx.triggerResistance?.toLocaleString() ?? '—'}${ctx.gammaFlipPoint ? ` / Gamma Flip ${ctx.gammaFlipPoint.toLocaleString()}` : ''}` : ''}

        画面が既に表示しているもの（絶対に書き直さないこと）:
        GEXの数値と等級、圧縮%、現在値から支持・抵抗までの距離。これらを文章に置き換えるのは失敗です。

        あなたにしか書けない二つだけ:
        [平常との違い] 今日の値が直近の履歴・直前と比べてどの位置にあり、それが何を意味するかを1文で。
          パーセンタイルが無い場合は、SPYとQQQの分かれ方、または直前比の動きで代替してください。
        [この見方が崩れる地点] 今の構造が逆に働き始める価格を1文で。
          数値とともに «なぜその水準か» を添えてください（例：その下では同じディーラーが買いではなく売りに回る）。

        文体:
        - 一文に一つだけ。短く。平易な日本語で。
        - 禁止：「示唆する」「観測される」「呈している」「起因する」。研究レポート調にしないこと。
        - 専門用語を使ったらその場で日常語に言い換えること。
        - 比喩（圧力鍋・クッション・エアバッグ）禁止。絵文字禁止。

        ★ 価格予測は絶対禁止:
        構造が «どう働くか» だけを書き、価格が «どうなるか» は書かないでください。
        「〜だろう」だけでなく、「加速する」「拡大する」「続く」のように
        これから起きることを現在形で断定するのも全て禁止です。
          悪い例：7,650を割れば下落が加速する。
          良い例：7,650の下では同じディーラーが買いではなく売りに回る水準に変わる。
          悪い例：ボラティリティが拡大する。
          良い例：その領域ではヘッジの向きが反対になる。

        ★ 等級と矛盾しないこと: 等級がNEUTRALなら「ガンマが変動を増幅する」とは書かないでください。

        出力形式: 次の2行だけを書く。角括弧のラベルを各行の先頭にそのまま置き、マークダウン(**)は使わない。
        [平常との違い] (1文)
        [この見方が崩れる地点] (1文)
        分量：2文、各60字以内。超えたら失敗です。
        `;
    }
};

const REALITY_PROMPTS: Record<Locale, (ctx: IntelligenceContext) => string> = {
    ko: (ctx) => {
        // Determine market condition
        const rlsiLevel = ctx.rlsiScore >= 65 ? '건강' : ctx.rlsiScore >= 45 ? '중립' : '취약';
        const priceAction = ctx.nasdaqChange >= 0.5 ? '강세' : ctx.nasdaqChange <= -0.5 ? '약세' : '보합';
        const vixLevel = ctx.vix >= 25 ? '공포' : ctx.vix >= 18 ? '경계' : '안정';
        const rvolLevel = ctx.rvol === undefined || !(ctx.rvol > 0) ? '측정 불가'
            : ctx.rvol >= 1.5 ? '급증' : ctx.rvol >= 1.1 ? '활발' : '저조';

        // Macro context strings
        const yieldLine = ctx.us10y !== undefined
            ? `- US10Y 금리: ${ctx.us10y?.toFixed(2)}%${bpText(ctx.us10yChangeBp) ? ` (전일 대비 ${bpText(ctx.us10yChangeBp)})` : ''}` : '';
        const spreadLine = ctx.spread2s10s !== undefined
            ? `- 장단기 금리차(2s10s): ${ctx.spread2s10s?.toFixed(2)}% ${ctx.spread2s10s! < 0 ? '[경고]역전' : ctx.spread2s10s! < 0.25 ? '[경고]축소' : '정상'}` : '';
        const realYieldLine = ctx.realYield !== undefined
            ? `- 실질금리: ${ctx.realYield?.toFixed(2)}% (${ctx.realYieldStance === 'TIGHT' ? '긴축적 → 성장주 압박' : ctx.realYieldStance === 'LOOSE' ? '완화적 → 성장주 유리' : '중립'})` : '';
        const breadthLine = ctx.breadthPct !== undefined
            ? `- 시장 참여폭(Breadth): 상승 ${Math.round(ctx.breadthPct!)}% / A/D 비율 ${ctx.adRatio?.toFixed(2) || '?'} / 거래량 Breadth ${ctx.volumeBreadth?.toFixed(1) || '?'}% [${ctx.breadthSignal || '?'}]` : '';

        // [V9.0] Cross-asset macro context
        const assetLines: string[] = [];
        if (ctx.spxChangePct !== undefined) assetLines.push(`- S&P 500: ${ctx.spxChangePct >= 0 ? '+' : ''}${ctx.spxChangePct.toFixed(2)}%`);
        if (ctx.dxy !== undefined) assetLines.push(`- 달러 인덱스(DXY): ${ctx.dxy.toFixed(1)}`);
        if (ctx.goldChangePct !== undefined) assetLines.push(`- 금(Gold): ${ctx.goldChangePct >= 0 ? '+' : ''}${ctx.goldChangePct.toFixed(2)}%`);
        if (ctx.oilChangePct !== undefined) assetLines.push(`- 유가(WTI): ${ctx.oilChangePct >= 0 ? '+' : ''}${ctx.oilChangePct.toFixed(2)}%`);
        if (ctx.btcChangePct !== undefined) assetLines.push(`- 비트코인: ${ctx.btcChangePct >= 0 ? '+' : ''}${ctx.btcChangePct.toFixed(2)}%`);
        if (ctx.tltChangePct !== undefined) assetLines.push(`- 채권 ETF(TLT): ${ctx.tltChangePct >= 0 ? '+' : ''}${ctx.tltChangePct.toFixed(2)}%`);
        const assetBlock = assetLines.length > 0 ? `\n        [글로벌 자산 동향]
        ${assetLines.join('\n        ')}` : '';

        // Fear & Greed context
        const fgLine = ctx.fearGreedScore !== undefined
            ? `- CNN 공포탐욕지수: ${ctx.fearGreedScore.toFixed(0)}점 (${ctx.fearGreedRating || '?'}) ${ctx.fearGreedScore < 25 ? '[경고]극단적 공포' : ctx.fearGreedScore < 40 ? '공포' : ctx.fearGreedScore > 75 ? '[경고]탐욕 과열' : ctx.fearGreedScore > 60 ? '탐욕' : '중립'}` : '';

        return `
        당신은 월가 최고의 매크로 전략가이자 기술적 분석가입니다. 모든 지표, 자산군 동향, 실시간 뉴스를 종합하여 정확한 판단과 실전 데이터 인사이트를 제공합니다.

        판단 정확성 최우선 원칙:
        - 수치가 보여주는 사실과 뉴스 해석이 충돌하면 수치를 우선
        - 불확실하면 "~가능성" "~여부가 변수" 같은 유보적 표현 사용, 확정 표현 금지
        - 하나의 뉴스 헤드라인만으로 전체 시장을 판단하지 말 것
        - 최소 2개 이상 지표가 동일 방향을 가리킬 때만 확신 있는 판단

        현재 시장 데이터 (종합 대시보드):

        [가격 & 내부지표]
        - RLSI (시장 건강도): ${ctx.rlsiScore.toFixed(0)}점 (${rlsiLevel})
        - 나스닥: ${ctx.nasdaqChange >= 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}% (${priceAction})
        - VIX (변동성): ${ctx.vix.toFixed(1)} (${vixLevel})
        - 거래량(RVOL): ${rvolText(ctx.rvol)} (${rvolLevel})

        [매크로 금리 환경]
        ${yieldLine}
        ${spreadLine}
        ${realYieldLine}
        ${assetBlock}

        [시장 심리]
        ${fgLine}

        [시장 참여도 — Breadth]
        ${breadthLine}

        ${ctx.gexIndex !== undefined ? `[옵션 구조 — GAMMA SHIELD]
        - GEX 지수: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'}) → ${ctx.gexIndex >= 20 ? '딜러 감마 방어(안정)' : ctx.gexIndex <= -20 ? '딜러 매도 증폭(불안정)' : '약한 감마 방어(취약)'}
        - 스퀴즈 리스크: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'}) → ${ctx.squeezeRisk! >= 55 ? '변동성 임계' : ctx.squeezeRisk! >= 30 ? '에너지 축적 중' : '안정'}
        ${ctx.triggerCurrent ? `- S&P 500 현재: ${ctx.triggerCurrent.toLocaleString()}` : ''}
        ${ctx.triggerSupport ? `- 옵션 지지선: ${ctx.triggerSupport.toLocaleString()} (${ctx.triggerCurrent ? (((ctx.triggerCurrent - ctx.triggerSupport) / ctx.triggerCurrent) * 100).toFixed(1) + '% 아래' : ''})` : ''}
        ${ctx.triggerResistance ? `- 옵션 저항선: ${ctx.triggerResistance.toLocaleString()} (${ctx.triggerCurrent ? (((ctx.triggerResistance - ctx.triggerCurrent) / ctx.triggerCurrent) * 100).toFixed(1) + '% 위' : ''})` : ''}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `[실시간 시장 뉴스 -- 거시경제 이벤트]
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        종합 분석 프레임워크 (교차 검증 필수. 해석을 위한 참고이며, 문장에 권유·지시로 옮기지 않는다):

        [기술적 분석]
        1. RLSI 65+ & 상승 & Breadth 70%+ → 참여가 넓은 건강한 상승
        2. RLSI 65+ & 상승 & Breadth 50% 미만 → 대형주 주도 상승, 쏠림 심화
        3. RLSI 65+ & 하락 → 내부 체력은 유지된 채 가격만 조정(매집 가능성)
        4. RLSI 45 이하 & 상승 → 내부 참여 없는 상승(가짜 랠리 가능성)
        5. RLSI 45 이하 & 하락 → 약세 확인, 위험 회피 흐름

        [거시경제 판단 규칙]
        6. VIX 25+ & 공포탐욕 25 미만 → 극단적 공포 구간
        7. 실질금리 2%+ (긴축) → 성장주 밸류에이션 압박, 방어주 상대 강세 경향
        8. 2s10s 역전 → 경기침체 경계, 은행/금융주 약세
        9. 금+TLT 동반 상승 → 안전자산 선호 (위기 신호)
        10. 유가 급등(+2%↑) + 금리 상승 → 인플레이션 재점화 우려, 연준 정책 경로가 변수
        11. 달러(DXY) 강세 + 금 약세 → 긴축 기대, 신흥국/원자재 약세 연결
        12. 공포탐욕 75+ & VIX 15 미만 → 과열 구간, 차익실현 매물이 나오기 쉬운 심리
        13. BTC 급락(-3%↓) & 금 상승 → 리스크 자산 회피, 전통 안전자산 선호
        14. Breadth 약한데 지수 상승 → 소수 종목 의존, 상승 기반이 좁음

        [뉴스 해석 규칙]
        15. CPI/PPI/고용 관련 뉴스 → 금리 정책 방향 + 시장 반응 함께 평가
        16. 연준 관련 뉴스 → 금리 선물 반영 여부까지 교차 확인
        17. 지정학 뉴스 → 유가/금/달러 반응으로 실제 영향 판단

        [옵션 구조 분석 규칙 — GAMMA SHIELD]
        18. GEX +20 이상 → 딜러 헤지가 변동을 누르는 구조(레인지 성격)
        19. GEX -20 이하 → 딜러 헤지가 움직임을 키우는 구조(하방 변동성 증폭 위험)
        20. Squeeze 55%+ → 변동성 압축이 임계 수준(방향 불문 급변동 위험)
        21. 옵션 지지선/저항선 3% 이내 접근 → 해당 레벨 돌파/이탈 시나리오 언급
        22. GEX 약(−19~+19) + Squeeze 30%+ → "감마 방어력 부족, Squeeze 에너지 축적" 언급

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `
        출력 — DIVERGENCE 상황 전용 형식 (반드시 이 형식으로):
        현재 ${ctx.divergenceCase === 'A' ? '\"가짜 랠리(False Rally)\"' : ctx.divergenceCase === 'B' ? '\"은밀 매집(Stealth Inflow)\"' : ctx.divergenceCase === 'C' ? '\"모멘텀 서지\"' : '\"동반 약세\"'} 패턴이 관측됩니다.
        상황: ${ctx.divergenceDesc || ''}

        자연스러운 한국어 3문장으로 작성하세요.
        - 첫 문장 (필수 — 괴리 진단으로 시작): "지수는 ~하고 있으나/~에도 불구하고, 내부 유동성은 ~" 형태로 표면과 내부의 괴리를 대비하며 시작. RLSI, Breadth, 거래량 등 괴리를 입증하는 수치를 반드시 포함. 뉴스가 있으면 괴리 발생 원인과 연결
        - 두 번째 문장 (괴리의 배경): 왜 이 괴리가 발생했는지 설명. ${ctx.divergenceCase === 'A' ? '소수 대형주 주도 상승인지, 숏커버 반등인지, 특정 뉴스에 의한 일시적 반등인지 판별' : ctx.divergenceCase === 'B' ? '기관이 왜 하락 구간에서 매집하는지, 밸류에이션 매력인지, 정책 기대인지 판별' : '유동성과 가격이 왜 동시에 움직이는지 분석'}. 교차 자산(금/채권/달러/VIX) 으로 뒷받침
        - 세 번째 문장 (괴리 시사점): 이 괴리가 지속되거나 해소되는 «조건»을 현재형으로 서술(미래형·예측 금지). ${ctx.divergenceCase === 'A' ? '\"Breadth 참여 없는 지수 상승은 소수 종목에 기댄 구조\"와 같은 상태 서술' : ctx.divergenceCase === 'B' ? '\"가격이 내리는 구간에서 유동성이 들어오는 상태\"와 같은 상태 서술' : '방향성 전망'}. 행동 지시 금지
        - 핵심 원칙: 모든 문장이 괴리(Divergence)를 중심축으로 전개. 뉴스와 지표는 괴리의 원인/근거로만 사용
        - 전문가가 시장 상황을 객관적으로 전달하듯이 작성 (자문/권유 표현 절대 금지. "~해야 한다" "~주시 필요" 같은 당부도 금지)
        - 공백 포함 400자 이내
        - 한국어로만 쓴다. 이모지·마크다운(#, **)·제목·대괄호 레이블 없이 일반 텍스트 3문장만 출력
        ` : `
        출력 — "왜 시장이 이렇게 움직이는가"를 최우선으로 작성:
        자연스러운 한국어 3문장으로 작성하세요.
        - 대괄호 레이블·제목 없이 문장만 쓴다
        - 첫 문장 (필수): 오늘 시장을 움직인 핵심 뉴스 이벤트와 시장 반응의 인과관계를 명확히 서술 (예: "2월 CPI 3.2%로 예상 상회하며 6월 금리인하 기대가 후퇴, 10Y 금리 4.31%로 급등하며 성장주 중심 매도세 확산"). 뉴스를 "(뉴스 1번)" 같은 번호로 참조하지 말 것. 뉴스 내용 자체를 자연스럽게 서술
        - 두 번째 문장: 뉴스 영향이 자산군에 어떻게 전이되었는지 교차 검증 (금/채권/유가/달러 등으로 뒷받침 + RLSI/Breadth 등 핵심 지표로 시장 상태 확인)
        - 세 번째 문장: 방향을 가르는 핵심 변수와 지금의 조건을 현재형으로 (미래형·단정적 예측·행동 지시 금지. "~하세요" "~보류" "~권장" 같은 표현 금지)
        - 핵심 원칙: 지표 나열이 아닌 뉴스→시장 반응의 인과 스토리를 전달. 지표는 뉴스의 근거로 사용
        - 전문가가 시장 상황을 객관적으로 전달하듯이 작성 (자문/권유 표현 절대 금지. "~해야 한다" "~주시 필요" 같은 당부도 금지)
        - 공백 포함 350자 이내
        - 한국어로만 쓴다. 이모지·마크다운(#, **)·제목·대괄호 레이블 없이 일반 텍스트 3문장만 출력
        `}
    `;
    },
    en: (ctx) => {
        const assetLines: string[] = [];
        if (ctx.spxChangePct !== undefined) assetLines.push(`S&P 500: ${ctx.spxChangePct >= 0 ? '+' : ''}${ctx.spxChangePct.toFixed(2)}%`);
        if (ctx.dxy !== undefined) assetLines.push(`DXY: ${ctx.dxy.toFixed(1)}`);
        if (ctx.goldChangePct !== undefined) assetLines.push(`Gold: ${ctx.goldChangePct >= 0 ? '+' : ''}${ctx.goldChangePct.toFixed(2)}%`);
        if (ctx.oilChangePct !== undefined) assetLines.push(`Oil: ${ctx.oilChangePct >= 0 ? '+' : ''}${ctx.oilChangePct.toFixed(2)}%`);
        if (ctx.tltChangePct !== undefined) assetLines.push(`TLT: ${ctx.tltChangePct >= 0 ? '+' : ''}${ctx.tltChangePct.toFixed(2)}%`);
        if (ctx.fearGreedScore !== undefined) assetLines.push(`Fear & Greed: ${ctx.fearGreedScore.toFixed(0)} (${ctx.fearGreedRating || '?'})`);
        const assetBlock = assetLines.length > 0 ? `\n        [Cross-Asset]
        ${assetLines.map(l => `- ${l}`).join('\n        ')}` : '';

        return `
        You are a top macro strategist and market analyst. Synthesize all indicators, cross-asset flows, and news for accurate market assessment.

        Accuracy Rules:
        - Data overrides narrative. If numbers contradict news interpretation, trust numbers.
        - Require 2+ confirming signals before making confident calls.
        - Use hedged wording ("potential", "may") when evidence is thin; no definitive calls on price.

        Current Data:
        - RLSI: ${ctx.rlsiScore.toFixed(0)} points
        - NASDAQ: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - VIX: ${ctx.vix.toFixed(1)}, RVOL: ${rvolText(ctx.rvol)}
        ${ctx.us10y !== undefined ? `- US10Y: ${ctx.us10y.toFixed(2)}%${bpText(ctx.us10yChangeBp) ? ` (${bpText(ctx.us10yChangeBp)} vs prior close)` : ''}` : ''}
        ${ctx.breadthPct !== undefined ? `- Breadth: ${Math.round(ctx.breadthPct)}% [${ctx.breadthSignal || '?'}]` : ''}
        ${assetBlock}

        ${ctx.gexIndex !== undefined ? `[Gamma Shield — Options Structure]
        - GEX: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'})
        - Squeeze: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'})
        ${ctx.triggerCurrent ? `- S&P 500: ${ctx.triggerCurrent.toLocaleString()}` : ''}
        ${ctx.triggerSupport ? `- Support: ${ctx.triggerSupport.toLocaleString()}` : ''}
        ${ctx.triggerResistance ? `- Resistance: ${ctx.triggerResistance.toLocaleString()}` : ''}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `[News]
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `
        Output — DIVERGENCE MODE (strictly follow this format):
        A ${ctx.divergenceCase === 'A' ? '"False Rally"' : ctx.divergenceCase === 'B' ? '"Stealth Inflow"' : ctx.divergenceCase === 'C' ? '"Momentum Surge"' : '"Synchronized Weakness"'} pattern is detected.
        Context: ${ctx.divergenceDesc || ''}

        Write 2-3 natural English sentences:
        1. First sentence (REQUIRED — lead with the divergence): Start with "Index is [rising/falling] but internal liquidity [contradicts]..." contrasting surface vs internals. Include RLSI, breadth, volume data proving the divergence. Connect to news if available
        2. Second sentence (divergence cause): Why this divergence exists — ${ctx.divergenceCase === 'A' ? 'large-cap driven rally, short-covering bounce, or news-driven temporary rebound?' : ctx.divergenceCase === 'B' ? 'institutional accumulation at value levels, policy expectations, or sector rotation?' : 'analyze why price and liquidity are moving together'}. Cross-validate with gold/bonds/dollar/VIX
        3. Third sentence (divergence implications): The conditions under which this divergence persists or resolves, in the present tense (no predictions). ${ctx.divergenceCase === 'A' ? '"A rally without breadth participation rests on a narrow set of names"' : ctx.divergenceCase === 'B' ? '"Liquidity is flowing in while price falls"' : 'directional outlook'}. No action directives
        Core principle: Every sentence must revolve around the divergence. News and indicators serve as evidence for the divergence story.
        Max 350 chars. Plain text only: no emoji, no Markdown, no title, no labels such as "Market Assessment:"; start directly with the analysis. No reader directives ("should", "watch for", "monitor").
        ` : `
        Output — "WHY is the market moving this way" is your #1 priority:
        Write 2-3 natural English sentences.
        1. First sentence (REQUIRED): Identify the key news event driving today's market and explain the causal chain. Do NOT reference news by number (no "news #1"). Weave news context naturally
        2. Second sentence: How news impact propagated across asset classes (cross-validate with gold/bonds/oil/dollar + key indicators like RLSI/Breadth)
        3. Third sentence: the key variables and the conditions that decide direction, in the present tense (no future tense, no definitive predictions, no action directives)
        Core principle: Tell the news → market reaction causal story, not a list of indicators. Use indicators as evidence for the narrative.
        Max 350 chars. Plain text only: no emoji, no Markdown, no title, no labels such as "Market Assessment:"; start directly with the analysis. No reader directives ("should", "watch for", "monitor").
        `}
    `;
    },
    ja: (ctx) => {
        const assetLines: string[] = [];
        if (ctx.spxChangePct !== undefined) assetLines.push(`S&P 500: ${ctx.spxChangePct >= 0 ? '+' : ''}${ctx.spxChangePct.toFixed(2)}%`);
        if (ctx.dxy !== undefined) assetLines.push(`DXY: ${ctx.dxy.toFixed(1)}`);
        if (ctx.goldChangePct !== undefined) assetLines.push(`金: ${ctx.goldChangePct >= 0 ? '+' : ''}${ctx.goldChangePct.toFixed(2)}%`);
        if (ctx.oilChangePct !== undefined) assetLines.push(`原油: ${ctx.oilChangePct >= 0 ? '+' : ''}${ctx.oilChangePct.toFixed(2)}%`);
        if (ctx.tltChangePct !== undefined) assetLines.push(`TLT: ${ctx.tltChangePct >= 0 ? '+' : ''}${ctx.tltChangePct.toFixed(2)}%`);
        if (ctx.fearGreedScore !== undefined) assetLines.push(`恐怖貪欲: ${ctx.fearGreedScore.toFixed(0)} (${ctx.fearGreedRating || '?'})`);
        const assetBlock = assetLines.length > 0 ? `\n        [グローバル資産]
        ${assetLines.map(l => `- ${l}`).join('\n        ')}` : '';

        return `
        あなたはトップマクロ戦略家です。全指標、クロスアセット、ニュースを総合して正確な市場分析を提供します。

        精度ルール:
        - データはナラティブに優先。数値とニュース解釈が矛盾する場合、数値を信頼。
        - 2つ以上の確認シグナルがある場合のみ確信ある判断。

        現在のデータ:
        - RLSI: ${ctx.rlsiScore.toFixed(0)}点
        - NASDAQ: ${ctx.nasdaqChange > 0 ? '+' : ''}${ctx.nasdaqChange.toFixed(2)}%
        - VIX: ${ctx.vix.toFixed(1)}, RVOL: ${rvolText(ctx.rvol)}
        ${ctx.us10y !== undefined ? `- US10Y: ${ctx.us10y.toFixed(2)}%${bpText(ctx.us10yChangeBp) ? `(前日比 ${bpText(ctx.us10yChangeBp)})` : ''}` : ''}
        ${ctx.breadthPct !== undefined ? `- Breadth: ${Math.round(ctx.breadthPct)}% [${ctx.breadthSignal || '?'}]` : ''}
        ${assetBlock}

        ${ctx.gexIndex !== undefined ? `[ガンマシールド — オプション構造]
        - GEX: ${ctx.gexIndex >= 0 ? '+' : ''}${ctx.gexIndex} (${ctx.gexLevel || 'N/A'})
        - スクイーズ: ${ctx.squeezeRisk}% (${ctx.squeezeLevel || 'N/A'})
        ${ctx.triggerCurrent ? `- S&P 500: ${ctx.triggerCurrent.toLocaleString()}` : ''}
        ${ctx.triggerSupport ? `- サポート: ${ctx.triggerSupport.toLocaleString()}` : ''}
        ${ctx.triggerResistance ? `- レジスタンス: ${ctx.triggerResistance.toLocaleString()}` : ''}` : ''}

        ${ctx.marketNewsHeadlines && ctx.marketNewsHeadlines.length > 0 ? `[ニュース]
        ${ctx.marketNewsHeadlines.map(h => `- ${h}`).join('\n        ')}` : ''}

        ${ctx.divergenceCase && ctx.divergenceCase !== 'N' ? `
        出力 — DIVERGENCE専用形式（必ずこの形式で）:
        現在 ${ctx.divergenceCase === 'A' ? '「偽のラリー(False Rally)」' : ctx.divergenceCase === 'B' ? '「ステルス流入(Stealth Inflow)」' : ctx.divergenceCase === 'C' ? '「モメンタムサージ」' : '「同時弱体化」'} パターンが観測されています。
        状況: ${ctx.divergenceDesc || ''}

        自然な日本語3文で作成:
        1. 第1文（必須 — 乖離の診断で開始）: 「指数は~しているが、内部流動性は~」の形で表面と内部の乖離を対比して開始。RLSI、Breadth、出来高等の乖離を証明するデータを必ず含む
        2. 第2文（乖離の背景）: なぜこの乖離が発生しているか。クロスアセット（金/債券/ドル/VIX）で裏付け
        3. 第3文（乖離の示唆）: この乖離が持続/解消する«条件»を現在形で(未来形・予測禁止)。行動指示禁止
        核心原則: 全ての文が乖離(Divergence)を中心軸に展開。ニュースと指標は乖離の原因/根拠としてのみ使用。
        350字以内。日本語だけで書く。絵文字・マークダウン(#、**)・タイトル・角括弧ラベルなしのプレーンテキスト3文だけを出力。「〜すべき」「注視」などの呼びかけ禁止。
        ` : `
        出力 — 「なぜ市場がこう動いているのか」を最優先で記述:
        自然な日本語3文で作成してください。
        1. 第1文（必須）: 本日の市場を動かした核心ニュースイベントと市場反応の因果関係を明確に記述。ニュースを番号で参照しないこと。自然に文脈に織り込む
        2. 第2文: ニュースの影響が資産クラスにどう波及したか（金/債券/原油/ドルで交差検証 + RLSI/Breadth等の核心指標）
        3. 第3文: 方向を分ける核心変数と現在の条件を現在形で（未来形・断定的予測・行動指示禁止）
        核心原則: 指標の羅列ではなくニュース→市場反応の因果ストーリーを伝達。指標はナラティブの根拠として使用。
        350字以内。日本語だけで書く。絵文字・マークダウン(#、**)・タイトル・角括弧ラベルなしのプレーンテキスト3文だけを出力。「〜すべき」「注視」などの呼びかけ禁止。
        `}
    `;
    }
};

// [V9.1 → 2026-09-29] 번역 대체 — «검사를 통과한 다른 언어 문구»를 이 언어로 옮긴다.
//   예전엔 한국어 캐시만 원본으로 썼고(ko→en/ja), 번역 결과도 검사 없이 저장했다.
//   이제 어느 언어든 원본이 될 수 있고(ko 가 망가지면 en→ko), 번역 결과도 같은 출구 검사를 지난다.
const LOCALE_NAMES: Record<Locale, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };
/** 번역 원본으로 먼저 볼 언어 순서 */
const TRANSLATE_SOURCES: Record<Locale, Locale[]> = { ko: ['en', 'ja'], en: ['ko', 'ja'], ja: ['ko', 'en'] };

async function translateInsight(sourceText: string, from: Locale, to: Locale, type: InsightType): Promise<string | null> {
    try {
        const pairs = (n: number) => SECTION_LABELS[type][from].slice(0, n)
            .map((l, i) => `[${l}] -> [${SECTION_LABELS[type][to][i]}]`).join(', ');
        const structure = type === 'rotation'
            ? `Keep the section structure, one section per line, and map the labels exactly: ${pairs(3)}.`
            : type === 'gamma'
                ? `Keep the two-line structure and map the labels exactly: ${pairs(2)}.`
                : 'Do NOT add labels such as [Diagnosis] or [Conclusion]; write 2-3 natural sentences.';
        const prompt = `Translate the following ${LOCALE_NAMES[from]} market analysis into natural ${LOCALE_NAMES[to]}.
${structure}
Keep every number, ticker and index name exactly as written. Keep placeholders in curly braces such as {NDX_CHG} or {RLSI} exactly as written, braces included. Keep the tone factual and observational: no recommendations or action directives.
Output ONLY the ${LOCALE_NAMES[to]} translation as plain text: no preamble, no notes, no Markdown, no emoji.

${LOCALE_NAMES[from]} text:
${sourceText}`;

        const result = await _modelCaller({
            modelId: MODELS.HAIKU_35,
            system: `You are an expert financial translator. You answer only with the translation, written entirely in ${LOCALE_NAMES[to]}.`,
            userPrompt: prompt,
            maxTokens: 700,
            temperature: 0.2,
            timeoutMs: 15000,
            maxRetries: 1,
            fallbackModel: null,
            allowLastResort: false,
            jsonPrefill: false,
            label: `Translate/${type}/${from}->${to}`,
            locale: to,
            validate: textGate(to),   // ★2026-10-10 사다리 출구 가드(언어·거절·마크다운·연도)
        });

        const text = restoreSectorLabelsIn(to, result.text?.trim() ?? '');   // 영어 원문의 섹터 라벨·음차를 이 언어의 표준 이름으로(번역 결과도 같은 출구 규칙)
        if (text && text.length > 10) {
            console.log(`[IntelligenceNode] Translated ${type} ${from}→${to} (${text.length} chars)`);
            return text;
        }
    } catch (e) {
        console.warn(`[IntelligenceNode] Translation failed (${type} ${from}→${to}):`, e);
    }
    return null;
}

/** 모델 호출 — 실패하면 null(예전처럼 «Insight generation failed…» 글자를 돌려주지 않는다: 그 글자가 화면에 나갔다). */
async function callInsightModel(prompt: string, locale: Locale, label: string, retry = false): Promise<string | null> {
    try {
        const result = await _modelCaller({
            modelId: MODELS.HAIKU_35,
            system: SYSTEM_PROMPTS[locale],
            userPrompt: prompt,
            maxTokens: 1024,
            temperature: 0.2,
            timeoutMs: retry ? 20000 : 30000,
            fallbackModel: null,
            jsonPrefill: false,
            label: `Guardian/${label}`,
            locale,
            validate: textGate(locale),   // ★2026-10-10 사다리 출구 가드(언어·거절·마크다운·연도)
            ...(retry ? { maxRetries: 1, allowLastResort: false } : {}),
        });
        const text = restoreSectorLabelsIn(locale, result.text?.trim() ?? '');
        return text && text.length > 10 ? text : null;
    } catch (e: any) {
        console.error(`[IntelligenceNode] model call failed (${label}):`, e?.message);
        return null;
    }
}

/**
 * 마지막 정상본 — 메모리(나이 무관) → Redis(나이 무관, 읽을 때 검사). 둘 다 «검사를 통과한 글»뿐이다.
 * storedChecked: 호출자가 방금 같은 키를 읽었다(통과분은 이미 메모리에 있다) → Redis 를 다시 읽지 않는다.
 * nums(화면 값)가 있으면 메모리 글도 다시 대조한다 — 생성 뒤 값이 움직여 서술이 낡은 글은 «정상본»이 아니다.
 */
async function lastValidInsight(type: InsightType, locale: Locale, storedChecked = false, nums?: GNums | null): Promise<InsightOut | null> {
    const m = _mem[type][locale];
    if (m && gateText(type, m.text, locale, nums, m.basis).ok) return { tpl: m.text, basis: m.basis ?? null };
    if (storedChecked) return null;
    const stored = await readStoredInsight(type, locale, nums);
    if (stored) {
        rememberInsight(type, locale, stored.text, stored.at, stored.basis);
        return { tpl: stored.text, basis: stored.basis ?? null };
    }
    return null;
}

/** 다른 언어의 «검사를 통과한» 문구를 번역해 채운다. 번역도 검사하고(화면 숫자 포함), 통과한 것만 저장한다. */
async function translatedInsight(type: InsightType, locale: Locale, nums?: GNums | null): Promise<InsightOut | null> {
    if (!process.env.AWS_ACCESS_KEY_ID) return null;
    for (const src of TRANSLATE_SOURCES[locale]) {
        const m = _mem[type][src];
        const source = m && gateText(type, m.text, src, nums, m.basis).ok ? m : await readStoredInsight(type, src, nums);
        if (!source) continue;
        const translated = await translateInsight(source.text, src, locale, type);
        if (!translated) continue;
        // 원본에 기준이 없으면(옛 저장본) 지금 화면 값이 기준 — 자리표로 바꾸는 숫자도 그 값과 같은 것뿐이다
        const basis = source.basis ?? nums ?? null;
        const g = gateText(type, tokenizeGuardianLiterals(translated, basis), locale, nums, basis);
        if (!g.ok || isPlaceholder(g.text)) {
            console.warn(`[InsightGate] REJECT translation ${type} ${src}→${locale} (${g.reasons.join(' | ') || 'placeholder'}) :: ${previewForLog(translated)}`);
            continue;
        }
        rememberInsight(type, locale, g.tpl, Date.now(), basis);
        await writeStoredInsight(type, locale, g.tpl, basis);
        return { tpl: g.tpl, basis };
    }
    return null;
}

type VerdictField = 'description' | 'realityInsight' | 'gammaInsight';
/** 판정에 같이 저장하는 숫자 기준 — tpl(자리표 원본)·basis(생성 때 값). 출구에서 화면 값으로 다시 채운다. */
export interface VerdictNumbers { tpl?: Partial<Record<VerdictField, string>>; basis?: Partial<Record<VerdictField, GNums | null>> }
type VerdictLike = { description?: string; realityInsight?: string; gammaInsight?: string; num?: VerdictNumbers };

const VERDICT_FIELDS: ReadonlyArray<readonly [VerdictField, InsightType]> = [
    ['description', 'rotation'],
    ['realityInsight', 'reality'],
    ['gammaInsight', 'gamma'],
];

export class IntelligenceNode {

    static async generateRotationInsight(ctx: IntelligenceContext): Promise<string> {
        return IntelligenceNode.produceInsight('rotation', ctx, (locale) => {
            // ETF ID → sector name conversion (e.g. SMH → 반도체, HACK → 사이버보안)
            // ★2026-10-10 AI 입력에는 섹터 이름을 영어로 — 한국어 이름이 일본어·영어 칸으로 그대로 새던 원인(lib/ai/sectorLabels). 화면의 한국어 글은 출구에서 원래 이름으로 되돌린다.
            const etfToName = (id: string): string => sectorLabelForAi(SECTOR_MAP[id]?.name || id);
            const vectorDesc = ctx.vectors.length > 0
                ? ctx.vectors.slice(0, 3).map(v => `${etfToName(v.source)}->${etfToName(v.target)}`).join(", ")
                : "No significant rotation";
            return ROTATION_PROMPTS[locale](ctx, vectorDesc);
        });
    }

    static async generateRealityInsight(ctx: IntelligenceContext): Promise<string> {
        // [V11.1] Reality Insight downgraded to Haiku 4.5 — 350-char output, sufficient quality, 1/3 cost
        return IntelligenceNode.produceInsight('reality', ctx, (locale) => REALITY_PROMPTS[locale](ctx));
    }

    static async generateGammaInsight(ctx: IntelligenceContext): Promise<string> {
        return IntelligenceNode.produceInsight('gamma', ctx, (locale) => GAMMA_PROMPTS[locale](ctx));
    }

    /**
     * 세 생성기의 공통 경로. **사용자에게 나가는 글은 전부 gateText 를 통과한 글이거나 고정 안내 문구다.**
     *   ① 메모리(TTL 안) → ② Redis(TTL 안, 읽을 때 검사) → ③ 장외면 모델을 부르지 않고 recoverInsight
     *   ④ 생성 → 검사 → 떨어지면 교정 지시를 붙여 한 번 더 → 검사
     *   ⑤ 그래도 떨어지면 recoverInsight: 마지막 정상본 → 다른 언어 정상본 번역(검사) → 고정 안내 문구
     *   저장은 검사를 통과한 글만 한다 — 나쁜 글로 좋은 캐시를 덮지 않는다.
     * ★2026-10-04 숫자: 프롬프트에 자리표 규칙을 붙이고(guardianTokenRules), 저장은 자리표 글 + basis(이 ctx 의 값),
     *   돌려주는 글은 이 ctx 의 값으로 채운 화면 글이다. 원본·기준은 numbersFor 로 꺼내 판정(verdict.num)에 저장한다.
     */
    private static async produceInsight(type: InsightType, ctx: IntelligenceContext, buildPrompt: (locale: Locale) => string): Promise<string> {
        const locale: Locale = ctx.locale || 'ko';
        const nums = guardianNumsFromAiContext(ctx);
        const out = await IntelligenceNode.produceInsightOut(type, locale, nums, buildPrompt);
        return shownOut(type, locale, out, nums);
    }

    /**
     * 한 호출로 ko·en·ja 를 쓴다(JSON). 언어별로 검사(strict: 예측어 포함)해 통과한 것은 메모리·Redis 에 저장하고 돌려준다.
     * 실패 언어가 있으면 사유를 담은 교정 지시로 한 번 더(시간 여유가 있을 때). parsed=false 는 «모델 응답·파싱 실패»(호출자가 옛 방식으로).
     */
    private static async generateTrilingual(type: InsightType, nums: GNums, buildPrompt: (locale: Locale) => string): Promise<TriOutcome> {
        const key = `${type}:${JSON.stringify(nums)}`;
        const inflight = _triInflight.get(key);
        if (inflight) return inflight;
        const job = IntelligenceNode.generateTrilingualOnce(type, nums, buildPrompt).finally(() => { _triInflight.delete(key); });
        _triInflight.set(key, job);
        return job;
    }

    private static async generateTrilingualOnce(type: InsightType, nums: GNums, buildPrompt: (locale: Locale) => string): Promise<TriOutcome> {
        const started = Date.now();
        const locales: Locale[] = ['ko', 'en', 'ja'];
        const blocks = locales.map((l) => `=== ${LOCALE_NAMES[l].toUpperCase()} (${l}) INSTRUCTIONS ===\n${buildPrompt(l) + guardianTokenRules(l, nums)}`).join('\n\n');
        const user = `Write the analysis once, in three languages, following each language's own instruction block below. All three must carry the same facts and the same placeholders. Return the JSON object only.\n\n${blocks}`;
        const call = async (extra: string, retry: boolean): Promise<Partial<Record<Locale, string>> | null> => {
            try {
                const result = await _modelCaller({
                    modelId: MODELS.HAIKU_35,
                    system: TRI_SYSTEM,
                    userPrompt: user + extra,
                    maxTokens: 3500,
                    temperature: 0.2,
                    timeoutMs: retry ? 20000 : 32000,   // 라우트 한도 60초 안에서: 첫 호출 32초 + (여유가 있을 때만) 교정 20초
                    fallbackModel: null,
                    jsonPrefill: false,
                    label: `Guardian/${type.toUpperCase()}_TRI${retry ? '/retry' : ''}`,
                    expectJson: true,
                    locale: 'multi',
                    validate: triLangGate(),   // ★2026-10-10 사다리 출구 가드: ko/en/ja 세 칸이 각자 언어 규칙을 통과해야 ①② 응답을 쓴다
                    ...(retry ? { maxRetries: 1, allowLastResort: false } : {}),
                });
                return restoreSectorLabels(parseTriJson(result.text || ''));
            } catch (e: any) {
                console.error(`[IntelligenceNode] trilingual call failed (${type}):`, e?.message);
                return null;
            }
        };
        let out: Partial<Record<Locale, InsightOut>> = {};
        const gateAll = (raw: Partial<Record<Locale, string>>, only: Locale[], last = false, into: Partial<Record<Locale, InsightOut>> = out): Partial<Record<Locale, string[]>> => {
            const failed: Partial<Record<Locale, string[]>> = {};
            for (const l of only) {
                const r = raw[l];
                if (!r) { failed[l] = ['missing']; continue; }
                let g = gateText(type, tokenizeGuardianLiterals(r, nums), l, nums, nums, true);
                // 예측어만 걸렸고 이게 마지막 기회이면 그 문장을 빼고 쓴다(먼저 교정 재생성을 해 본다)
                if (last && !g.ok && g.reasons.every((x) => x.startsWith('forecast:'))) {
                    const lenient = gateText(type, tokenizeGuardianLiterals(r, nums), l, nums, nums, false);
                    if (lenient.ok) g = lenient;
                }
                if (g.ok && !isPlaceholder(g.text)) into[l] = { tpl: g.tpl, basis: nums };
                else { failed[l] = g.reasons.length ? g.reasons : ['placeholder']; console.warn(`[InsightGate] REJECT generated ${type}/${l} (tri: ${(failed[l] || []).join(' | ')}) :: ${previewForLog(r)}`); }
            }
            return failed;
        };
        let raw = await call('', false);
        if (!raw) return { parsed: false, out };
        let failed = gateAll(raw, locales);
        if (Object.keys(failed).length && Date.now() - started < TRI_RETRY_BUDGET_MS) {
            const again = await call(TRI_CORRECTIVE(failed), true);
            if (again) {
                // 교정본이 세 언어 모두 통과하면 «한 번의 생성»으로 통일한다(언어 간 해석이 같은 생성에서 나오게). 아니면 첫 생성의 통과분 + 교정본의 통과분을 섞는다.
                const outAgain: Partial<Record<Locale, InsightOut>> = {};
                const failedAgain = gateAll(again, locales, true, outAgain);
                if (!Object.keys(failedAgain).length) { out = outAgain; failed = {}; }
                else {
                    for (const l of Object.keys(failed) as Locale[]) { if (outAgain[l]) { out[l] = outAgain[l]; delete failed[l]; } else failed[l] = failedAgain[l] || failed[l]; }
                }
                raw = again;
            } else failed = gateAll(raw, Object.keys(failed) as Locale[], true);
        } else if (Object.keys(failed).length) {
            failed = gateAll(raw, Object.keys(failed) as Locale[], true);   // 교정 재생성 시간이 없으면 예측어 문장 제거로 마무리
        }
        // 통과한 언어는 전부 저장 — 다른 언어 요청이 오면 방금 만든 같은 재료의 글이 나간다
        const now = Date.now();
        for (const l of locales) {
            const o = out[l];
            if (!o) continue;
            rememberInsight(type, l, o.tpl, now, nums);
            await writeStoredInsight(type, l, o.tpl, nums);
        }
        console.log(`[IntelligenceNode] trilingual ${type}: ${Object.keys(out).join(',') || '없음'} 통과 (${Date.now() - started}ms)`);
        return { parsed: true, out };
    }

    private static async produceInsightOut(type: InsightType, locale: Locale, nums: GNums, buildPrompt: (locale: Locale) => string): Promise<InsightOut> {
        const now = Date.now();
        const offHours = isOffHours();
        const ttl = offHours ? OFF_HOURS_TTL : TTL_NORMAL[type];

        // ① 메모리 — 검사를 통과한 글만 들어 있다. 화면 값이 움직여 서술이 낡았으면 쓰지 않는다.
        const mem = _mem[type][locale];
        if (mem && now - mem.at < ttl && gateText(type, mem.text, locale, nums, mem.basis).ok) return { tpl: mem.text, basis: mem.basis ?? null };

        // ② Redis — 콜드 스타트마다 모델을 부르지 않게. 읽을 때도 검사한다.
        const stored = await readStoredInsight(type, locale, nums);
        if (stored) {
            if (!mem || stored.at >= mem.at) rememberInsight(type, locale, stored.text, stored.at, stored.basis);
            if (now - stored.at < ttl) {
                console.log(`[IntelligenceNode] Redis cache hit for ${type}/${locale} (age: ${((now - stored.at) / 1000).toFixed(0)}s, TTL: ${ttl / 1000}s)`);
                return { tpl: stored.text, basis: stored.basis ?? null };
            }
        }

        // ③ 장외(주말·20:00~04:00 ET) — 모델을 부르지 않는다
        if (offHours) {
            console.log(`[IntelligenceNode] Off-hours: skipping model call for ${type} (${locale})`);
            return IntelligenceNode.recoverInsightOut(type, locale, { storedChecked: true, nums });
        }

        if (!process.env.AWS_ACCESS_KEY_ID) {
            console.error(`[IntelligenceNode] AWS_ACCESS_KEY_ID missing — ${type}/${locale} serves last valid text or placeholder`);
            return IntelligenceNode.recoverInsightOut(type, locale, { translate: false, storedChecked: true, nums });
        }

        // 직전 생성이 두 번 다 검사에서 떨어졌다 — 쿨다운 동안은 모델을 두드리지 않는다
        if (now < _genFailUntil[type][locale]) {
            return IntelligenceNode.recoverInsightOut(type, locale, { translate: false, storedChecked: true, nums });
        }

        // ★2026-10-07 T5 재료 완결 게이트 — 시장 데이터(RLSI·VIX)가 안 온 조기 재료로는 생성하지 않는다(마지막 정상본 유지)
        const issues = guardianMaterialIssues(nums);
        if (issues.length) {
            console.warn(`[IntelligenceNode] 재료 미완결(${issues.join(',')}) — 생성 안 함, 마지막 정상본 유지: ${type}/${locale}`);
            return IntelligenceNode.recoverInsightOut(type, locale, { translate: false, storedChecked: true, nums });
        }

        // ④-a 3개 언어 1호출 — 같은 재료로 ko·en·ja 를 한 번에(사실이 언어 간 같다). 통과한 언어는 전부 저장한다.
        const started = Date.now();
        const tri = await IntelligenceNode.generateTrilingual(type, nums, buildPrompt);
        if (tri.out[locale]) return tri.out[locale]!;
        if (tri.parsed) {
            // 모델은 답했지만 이 언어의 글이 검사를 못 넘었다(교정 재생성까지) — 같은 재료로 단일 언어를 또 부르면 같은 이유로 떨어지기 쉽다 → 복구
            _genFailUntil[type][locale] = Date.now() + GEN_FAIL_COOLDOWN_MS;
            return IntelligenceNode.recoverInsightOut(type, locale, { translate: Date.now() - started < TRANSLATE_BUDGET_MS, storedChecked: true, nums });
        }

        if (Date.now() - started > TRI_FALLBACK_MAX_ELAPSED_MS) {
            // 3개 언어 호출이 오래 걸리고 실패했다 — 옛 경로까지 가면 라우트 한도(60초)를 넘는다 → 복구
            _genFailUntil[type][locale] = Date.now() + GEN_FAIL_COOLDOWN_MS;
            return IntelligenceNode.recoverInsightOut(type, locale, { translate: false, storedChecked: true, nums });
        }
        // ④-b (3개 언어 호출이 응답·파싱에 실패했을 때만) 옛 방식 — 이 언어 하나만 생성 → (숫자를 직접 쓴 자리는 같은 값이면 자리표로) → 검사 → (떨어지면) 교정 지시 + 한 번 더 → 검사
        const prompt = buildPrompt(locale) + guardianTokenRules(locale, nums);
        const label = `${type.toUpperCase()}_${locale}`;
        let raw = await callInsightModel(prompt, locale, label);
        let gated = raw !== null ? gateText(type, tokenizeGuardianLiterals(raw, nums), locale, nums, nums, true) : null;
        if (raw !== null && gated && !gated.ok) {
            console.warn(`[InsightGate] REJECT generated ${type}/${locale} (1/2: ${gated.reasons.join(' | ')}) :: ${previewForLog(raw)}`);
            if (Date.now() - started < RETRY_BUDGET_MS) {
                raw = await callInsightModel(prompt + CORRECTIVE_INSTRUCTION[locale](gated.reasons), locale, `${label}/retry`, true);
                gated = raw !== null ? gateText(type, tokenizeGuardianLiterals(raw, nums), locale, nums, nums, true) : null;
                if (raw !== null && gated && !gated.ok) {
                    console.warn(`[InsightGate] REJECT generated ${type}/${locale} (2/2: ${gated.reasons.join(' | ')}) :: ${previewForLog(raw)}`);
                }
            }
            // 예측어만 걸렸으면 그 문장을 빼고 쓴다(사유가 forecast 뿐일 때)
            if (raw !== null && gated && !gated.ok && gated.reasons.every((r) => r.startsWith('forecast:'))) {
                const lenient = gateText(type, tokenizeGuardianLiterals(raw, nums), locale, nums, nums, false);
                if (lenient.ok) gated = lenient;
            }
        }

        if (gated?.ok && !isPlaceholder(gated.text)) {
            rememberInsight(type, locale, gated.tpl, Date.now(), nums);
            await writeStoredInsight(type, locale, gated.tpl, nums);
            return { tpl: gated.tpl, basis: nums };
        }

        // ⑤ 검사를 통과한 새 글이 없다 → 마지막 정상본 / 번역 / 고정 문구
        _genFailUntil[type][locale] = Date.now() + GEN_FAIL_COOLDOWN_MS;
        return IntelligenceNode.recoverInsightOut(type, locale, { translate: Date.now() - started < TRANSLATE_BUDGET_MS, storedChecked: true, nums });
    }

    /**
     * 모델을 새로 부르지 않고 «지금 보여 줄 수 있는 검사 통과 글»을 찾는다.
     *   마지막 정상본(메모리·Redis) → 다른 언어 정상본의 번역(검사 통과분만, 저장) → 고정 안내 문구(장외/대기).
     * nums(화면 값)를 주면 후보마다 화면 숫자 대조까지 한다. 절대 throw 하지 않는다. 돌려주는 tpl 은 자리표가 남은 글.
     */
    static async recoverInsightOut(type: InsightType, locale: Locale, opts: { translate?: boolean; storedChecked?: boolean; nums?: GNums | null } = {}): Promise<InsightOut> {
        try {
            const last = await lastValidInsight(type, locale, opts.storedChecked === true, opts.nums);
            if (last) return last;
            if (opts.translate !== false) {
                const translated = await translatedInsight(type, locale, opts.nums);
                if (translated) {
                    console.log(`[IntelligenceNode] ${type}/${locale}: 다른 언어의 정상 문구를 번역해 채웠다`);
                    return translated;
                }
            }
        } catch (e) {
            console.warn(`[IntelligenceNode] recoverInsight failed (${type}/${locale}):`, e);
        }
        return { tpl: (isOffHours() ? OFF_HOURS_TEXT : PENDING_TEXT)[type][locale], basis: null };
    }

    /** recoverInsightOut 의 화면 글(자리표를 nums — 없으면 생성 때 값 — 로 채운 글). */
    static async recoverInsight(type: InsightType, locale: Locale, opts: { translate?: boolean; storedChecked?: boolean; nums?: GNums | null } = {}): Promise<string> {
        return shownOut(type, locale, await IntelligenceNode.recoverInsightOut(type, locale, opts), opts.nums);
    }

    /**
     * 방금 내보낸 화면 글의 자리표 원본·기준(생성 때 값). 판정(verdict.num)에 같이 저장해 두면 출구가 화면 값으로 다시 채운다.
     * 화면 글이 마지막으로 내보낸 글과 다르면(동시 요청 등) null — 그때는 출구가 숫자를 대조만 한다.
     */
    static numbersFor(type: InsightType, locale: Locale, shown: string | null | undefined): InsightOut | null {
        const o = _lastOut[type][locale];
        return o && typeof shown === 'string' && o.shown === shown && o.tpl !== o.shown ? { tpl: o.tpl, basis: o.basis } : null;
    }

    /** 대기·장외 안내 문구인가 */
    static isPlaceholderInsight(text: string | null | undefined): boolean {
        return typeof text === 'string' && isPlaceholder(text);
    }

    /**
     * 저장·캐시된 «판정(verdict)» 안의 AI 글 3개를 출구 검사한다.
     *   통과 → 정리본(마크다운 제거 등)으로 바꿔 끼움 / 탈락 → recoverInsight 로 교체.
     * guardian:ai_verdict:* · guardian:snapshot:* · lastgood 처럼 생성기를 거치지 않고 나가는 경로가 쓴다.
     * ★2026-10-04 nums(같은 응답의 화면 값)를 주면: verdict.num.tpl(자리표 원본)을 화면 값으로 채워 화면 글을 만들고,
     *   생성 때 값(basis)에서 방향이 뒤집혔거나 크게 움직였으면(서술이 낡음) 탈락, 숫자로 박힌 지표는 화면 값과 대조한다.
     */
    static async repairVerdictTexts<V extends VerdictLike>(
        verdict: V, locale: Locale, where: string, nums?: GNums | null,
    ): Promise<{ verdict: V; changed: boolean; repaired: string[] }> {
        let out = verdict;
        let changed = false;
        const repaired: string[] = [];
        const tplIn = verdict?.num?.tpl || {};
        const basisIn = verdict?.num?.basis || {};
        const tplOut: Partial<Record<VerdictField, string>> = { ...tplIn };
        const basisOut: Partial<Record<VerdictField, GNums | null>> = { ...basisIn };
        let numChanged = false;
        const setNum = (field: VerdictField, tpl: string, shown: string, basis: GNums | null) => {
            const keep = tpl !== shown;  // 자리표가 있는 글만 원본을 남긴다
            if (keep ? tplOut[field] !== tpl || basisOut[field] !== basis : field in tplOut || field in basisOut) numChanged = true;
            if (keep) { tplOut[field] = tpl; basisOut[field] = basis; } else { delete tplOut[field]; delete basisOut[field]; }
        };
        for (const [field, type] of VERDICT_FIELDS) {
            const value = verdict?.[field];
            const tpl = typeof tplIn[field] === 'string' && tplIn[field] ? tplIn[field] as string : value;
            if (typeof tpl !== 'string' || !tpl.trim()) continue;
            const basis = basisIn[field] ?? null;
            const g = gateText(type, tpl, locale, nums, basis);
            if (g.ok) {
                if (g.text !== value) { out = { ...out, [field]: g.text }; changed = true; }
                setNum(field, g.tpl, g.text, basis);
                continue;
            }
            console.warn(`[InsightGate] REJECT ${where} verdict.${field} (${locale}: ${g.reasons.join(' | ')}) :: ${previewForLog(g.text)}`);
            const rec = await IntelligenceNode.recoverInsightOut(type, locale, { nums });
            const g2 = gateText(type, rec.tpl, locale, nums, rec.basis);
            const shown = g2.ok ? g2.text : (isOffHours() ? OFF_HOURS_TEXT : PENDING_TEXT)[type][locale];
            out = { ...out, [field]: shown };
            setNum(field, g2.ok ? g2.tpl : shown, shown, g2.ok ? rec.basis : null);
            changed = true;
            repaired.push(field);
        }
        if (numChanged) {
            const hasAny = Object.keys(tplOut).length > 0;
            const base = { ...out } as V & { num?: VerdictNumbers };
            if (hasAny) base.num = { tpl: tplOut, basis: basisOut };
            else delete base.num;
            out = base;
            changed = true;
        }
        return { verdict: out, changed, repaired };
    }

    /**
     * 새 판정을 저장하기 전에 — 대기 문구가 된 칸은 직전 저장본의 «검사 통과» 글을 살린다.
     * (장중에 생성이 잠깐 실패한 칸이 밤새 «준비 중»으로 굳지 않게. 직전본도 검사한다 — nums 를 주면 화면 숫자까지.)
     */
    static keepRealTextOverPlaceholders<V extends VerdictLike>(
        next: V, prev: V | null | undefined, locale: Locale, nums?: GNums | null,
    ): V {
        if (!prev) return next;
        let out = next;
        for (const [field, type] of VERDICT_FIELDS) {
            const now = next?.[field];
            const before = prev?.[field];
            if (typeof now !== 'string' || !isPlaceholder(now)) continue;
            if (typeof before !== 'string' || isPlaceholder(before)) continue;
            const prevTpl = prev?.num?.tpl?.[field];
            const prevBasis = prev?.num?.basis?.[field] ?? null;
            const g = gateText(type, typeof prevTpl === 'string' && prevTpl ? prevTpl : before, locale, nums, prevBasis);
            if (!g.ok) continue;
            out = { ...out, [field]: g.text };
            if (g.tpl !== g.text) {
                const num: VerdictNumbers = { tpl: { ...(out.num?.tpl || {}), [field]: g.tpl }, basis: { ...(out.num?.basis || {}), [field]: prevBasis } };
                out = { ...out, num };
            }
        }
        return out;
    }
}
