import { buildIndexFacts, tacticalSessionAt, type TacticalSession } from '@/lib/ai/tacticalIndexFacts';
import { textIntegrityReasons } from '@/lib/ai/textIntegrity';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored, tacticalTokenRules, internalSourceReasons, polishTacticalText } from '@/lib/ai/tacticalPrompt';
import { buildRotationPrompt, checkRotationOutput, polishRotationText, rotationNums, rotationTokenRules, isLegacyRotationText, rotationHints, type RotationFacts, type RotationContext } from '@/lib/ai/rotationPrompt';

import { callBedrock, MODELS } from '@/services/bedrockClient';
import { textGate, triLangGate } from '@/lib/ai/ladderGates';
import { Redis } from "@upstash/redis";
import { etDateOf } from '@/lib/marketCalendar';
import { readSessionArchive, saveSessionArchive } from '@/lib/sessionArchive';
import { restoreKoSectorNames, restoreJaSectorNames } from '@/lib/ai/sectorLabels';
import { restoreCommonTermNames } from '@/lib/ai/commonTerms';
import { cleanInsight, validateInsight, previewForLog } from '@/lib/ai/outputGate';
import { fillGuardianTokens, checkGuardianLiterals, guardianLiterals, type GLiteral, stateStaleReasons, guardianNumbersGate, guardianNumsFromAiContext, guardianTokenRules, hasGuardianTokens, tokenizeGuardianLiterals, guardianMaterialIssues, guardianCmpFacts, type GNums } from '@/lib/ai/guardianNumbers';
import { forecastHits, stripForecastSentences, checkComparisons, checkRanges } from '@/lib/ai/trustLayer';

// Supported locales
type Locale = 'ko' | 'en' | 'ja';
/** 새 생성의 INDEX_FACTS 근거와 저장본 NEXT 일정 검사에 쓰는 현재 프롬프트. */
type TacticalPrompts = (locale: Locale) => string;

/**
 * 가디언 AI 문구 3종 — 화면 자리
 *   rotation = verdict.description   (플로우 탭·사이드바, TACTICAL 의 대체 본문)
 *   reality  = verdict.realityInsight (RLSI INSIGHT › TACTICAL)
 *   gamma    = verdict.gammaInsight   (감마 쉴드 AI 브리프)
 */
export type InsightType = 'rotation' | 'reality' | 'gamma';

// Redis Keys for persistent cache (per locale)
// ★2026-10-04 v2 — 저장 형식이 «자리표 글 + basis» 로 바뀌었다. 옛 키를 그대로 쓰면 배포 전후로 옛 코드가 자리표({NDX_CHG})가
//   남은 글을 화면에 내보낼 수 있어 키를 분리한다. Tactical v3는 첫 배포의 빈칸을 막기 위해 v2를 복구용으로만 읽고, 신규 정상본은 v3에만 쓴다.
//   ★2026-10-24 순환매 v3(lib/ai/rotationPrompt)도 새 계약 글을 v3 키에만 쓴다 — 옛 v2 글(나스닥 선물을 «나스닥»으로 쓴 자리표 글)과 섞지 않는다.
const getRedisKey = (type: InsightType, locale: Locale) => `guardian:gemini:${type === 'gamma' ? 'v2' : 'v3'}:${type}:${locale}`;

// Get Redis client
function getRedis(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
}



interface IntelligenceContext {
    scheduledEvents?: string[];
    asOf?: string;
    rlsiScore: number;
    nasdaqChange: number | null;
    indexFacts?: import('@/lib/ai/tacticalIndexFacts').IndexFact[];
    session?: import('@/lib/ai/tacticalIndexFacts').TacticalSession;
    indexBasis?: import('@/lib/marketIndexBasis').MarketIndexBasis;
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
    /** ★2026-10-24 순환매 v3 재료 — 섹터 5거래일 등락률(소수 1자리)·강도·기관 수급(lib/ai/rotationPrompt.rotationFactsFrom) */
    rotationFacts?: RotationFacts;
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
/** ★2026-10-24 장외에 옛 순환매 글을 v3 로 바꿔 쓴 글의 보관 — 주말 내내(월요일 프리마켓 생성이 덮어쓸 때까지) */
const OFF_HOURS_UPGRADE_TTL_SEC = 72 * 3600;
/** 장외 순환매 v3 재작성 잠금(인스턴스 간 1회) — 실패해도 3시간 뒤에만 다시 시도 */
const OFF_HOURS_UPGRADE_LOCK = 'guardian:rotation:v3:offhours-lock';
const OFF_HOURS_UPGRADE_LOCK_SEC = 3 * 3600;
/** 장외 승격의 저장본·잠금 확인 시각(언어별, 인스턴스 메모리) — 60초에 한 번 */
const _upgradeCheckedAt: Record<Locale, number> = { ko: 0, en: 0, ja: 0 };
/** 생성 + 교정 재시도가 둘 다 검사에서 떨어지면, 이 시간 동안은 모델을 다시 부르지 않는다(요청마다 두드리지 않게) */
const GEN_FAIL_COOLDOWN_MS = 90 * 1000;
/** 첫 생성이 이 시간 안에 끝났을 때만 교정 재시도를 한다 — 라우트 한도(60초)를 넘기지 않게 */
const RETRY_BUDGET_MS = 25 * 1000;
/** 생성 경로에서 번역 대체까지 해도 되는 시간 */
const TRANSLATE_BUDGET_MS = 35 * 1000;

/** text = 자리표가 남은 정리본(저장·번역 원본) · basis = 그 글을 만들 때 프롬프트에 들어간 화면 숫자(2026-10-04) */
interface CachedInsight { text: string; at: number; basis?: GNums | null; session?: TacticalSession }
/** 생성기·복구가 돌려주는 단위 — tpl 은 자리표가 남은 글, 화면 글은 출구에서 화면 값으로 채운다 */
export interface InsightOut { tpl: string; basis: GNums | null; session?: TacticalSession }
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

/**
 * ★2026-10-21 Tactical 은 «화면 글 → 원본·기준»을 글마다 기억한다(언어당 최근 64개) — 동시 요청이 _lastOut 을 덮어도 그 글의 생성 기준값을 찾는다.
 *   자리표 없는 Tactical 의 «상태 판정» 낡음 비교는 생성 기준값이 있어야 한다(관문 10211015·10211022: 덮인 뒤 «지금 값»을 기준으로 저장하면 낡음이 안 보인다).
 */
const _outByShown: Record<Locale, Map<string, { tpl: string; basis: GNums | null }>> = { ko: new Map(), en: new Map(), ja: new Map() };
function rememberShown(locale: Locale, shown: string, tpl: string, basis: GNums | null): void {
    const m = _outByShown[locale];
    m.delete(shown);
    m.set(shown, { tpl, basis });
    while (m.size > 64) m.delete(m.keys().next().value as string);   // 언어당 64개(글 하나 ~1KB) — 새 Tactical 은 언어당 10분에 하나라 64개 = 10시간+
}

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

/** 새 Tactical 생성의 지수는 INDEX_FACTS로 검사하며, 직접 쓴 수익률은 공유 자리표로 바꾸지 않는다. */
function insightNums(type: InsightType, nums: GNums | null | undefined): GNums | null | undefined {
    if (type !== 'reality' || !nums) return nums;
    const { NDX_CHG, SPX_CHG, ...rest } = nums;
    return rest;
}
function tokenizeInsight(type: InsightType, text: string, nums: GNums | null | undefined): string {
    // 순환매는 지수·자산 등락률을 자리표로 바꾸지 않는다(INDEX_FACTS 값을 직접 쓴다 — 선물 값 {NDX_CHG} 로 채워지면 숫자 충돌)
    return tokenizeGuardianLiterals(text, type === 'rotation' ? rotationNums(nums) : insightNums(type, nums));
}

/** 생성 프롬프트에 붙이는 자리표 규칙 — Tactical·순환매 v3 는 지수 자리표 금지(INDEX_FACTS 직접), 감마는 공유 규칙 그대로 */
function tokenRulesFor(type: InsightType, locale: Locale, nums: GNums): string {
    return type === 'reality' ? tacticalTokenRules(locale, nums) : type === 'rotation' ? rotationTokenRules(locale, nums) : guardianTokenRules(locale, nums);
}

/**
 * ★2026-10-24 순환매 v3 저장본의 숫자 출구 — 자리표는 화면 값으로 채우고(옛 계약과 같다), 박힌 숫자 대조에서는 지수·자산 등락률을 뺀다.
 *   v3 글의 «나스닥 종합 0.2%»는 INDEX_FACTS(현물) 값이라 공유 NDX_CHG(나스닥100 선물)와 대조하면 정상 글이 «준비 중»으로 바뀐다.
 *   옛 계약 글(레이블)은 옛 대조 그대로(guardianNumbersGate).
 */
function rotationStoredGate(text: string, nums: GNums | null | undefined, basis: GNums | null | undefined) {
    const f = fillGuardianTokens(text, nums, basis);
    const lit = checkGuardianLiterals(f.text, rotationNums(nums));
    return { ok: f.ok && lit.length === 0, text: f.text, reasons: [...f.reasons, ...lit] };
}

/**
 * ★2026-10-24 T21 — Tactical 저장본(복구·캐시 재사용)의 자리표를 «지금 값»으로 채운다(같은 화면 순환매 카드·지표와 같은 시점 값 — 10/24 운영 RLSI 33 vs 29).
 *   지금 값으로 채우면 서술이 낡는 경우(자리표 지표의 구간 이동·큰 변화, 장중 상태 구간 변경)나 비교 문장이 틀어지는 경우에만
 *   생성 당시 값(basis)으로 채운다 — 복구본을 버리지 않는다(오탈락 금지, 10/21 사고 교훈). 숫자를 고르는 일만 하고 탈락은 만들지 않는다.
 */
function tacticalFillNums(tpl: string, nums: GNums | null | undefined, basis: GNums | null | undefined): GNums | null {
    if (!basis) return nums ?? null;
    if (!nums) return basis;
    const live: GNums = { ...basis, ...nums };
    const old: GNums = { ...nums, ...basis };
    const f = fillGuardianTokens(tpl, live, basis);
    if (!f.ok) return old;
    // 상태 구간 비교는 장외에도 본다 — 여기서는 탈락이 아니라 «어느 값으로 채울지»만 고른다(관문 10241021 ②: 장외 «0.00% 상승»)
    if (stateStaleReasons(live, basis).some((r) => tpl.includes(`{${r.split(':')[1]}}`))) return old;
    const facts = guardianCmpFacts(live);
    if (checkComparisons(f.text, facts).length || checkRanges(f.text, facts).length) return old;
    return live;
}

/**
 * ★2026-10-24 번역 숫자 대조(밤 검토 ③) — Tactical 번역은 저장본 경로로 검사돼 숫자 리터럴 대조가 빠졌다(VIX 99 가 화면·캐시 통과).
 *   ① 번역 글에 «지표 이름 + 숫자»로 박힌 값은 원문의 «같은 지표» 값과 크기·부호·방향어까지 맞아야 한다(기존 숫자 검사 판정 literalMatchesValue).
 *      지표끼리 숫자를 맞바꾸거나 «−2.6% 하락 → +2.6% 상승»으로 뒤집으면 탈락(관문 10241021 ①). 원문에서 «지표+숫자» 꼴로 안 잡힌 숫자
 *      (예: 영어 «Nasdaq Composite closed down 0.2%» — 이름과 숫자 사이가 길다)는 같은 크기·부호·방향어로 대조한다(다른 지표 리터럴 자리는 제외).
 *   ② Tactical 은 원문의 생성 기준값(basis)과도 기존 숫자 검사(checkGuardianLiterals)로 대조한다(지수는 INDEX_FACTS 계약이라 제외).
 *   탈락하면 그 번역은 쓰지도 저장하지도 않는다(기존 정상본 유지).
 */
// 번역 대조 전용 — lib/ai/guardianNumbers.literalMatches 와 같은 판정(허용 오차·명시 부호·방향어). 공유 파일은 origin/main 바이트 동일 유지(tacticalV3RecoveryBoundary).
const TR_CHG_KEYS = new Set(['NDX_CHG', 'SPX_CHG', 'GOLD_CHG', 'OIL_CHG', 'TLT_CHG', 'BTC_CHG']);
const TR_UP = /(상승|올라|오른|오르|강세|반등|급등|rose|rise|gain|up\b|climb|advanc|rall|jump|上昇|高く|上げ|反発)/i;
const TR_DOWN = /(하락|내린|내려|약세|떨어|급락|fell|fall|drop|declin|down\b|slid|lost|lower|下落|安く|下げ|続落)/i;
function literalMatchesValue(l: GLiteral, actual: number, text: string): boolean {
    const written = l.written.replace(/^[+-]/, '');
    const i = written.indexOf('.');
    const half = 0.5 * Math.pow(10, -(i < 0 ? 0 : written.length - i - 1)) + 1e-9;
    const kind = TR_CHG_KEYS.has(l.key) ? 'chg' : (l.key === 'RLSI' || l.key === 'GEX' || l.key === 'SQUEEZE' || l.key === 'BREADTH') ? 'score' : 'level';
    const tol = kind === 'chg' ? Math.max(0.02, half + 0.005) : kind === 'score' ? Math.max(1, half) : Math.max(Math.abs(actual) * 0.015, half);
    if (kind !== 'chg') return Math.abs(l.value - actual) <= tol;
    if (/^[+-]/.test(l.written)) {
        if (Math.abs(l.value - actual) > tol) return false;
        return !(Math.abs(actual) >= 0.05 && Math.abs(l.value) >= 0.05 && Math.sign(l.value) !== Math.sign(actual));
    }
    if (Math.abs(Math.abs(l.value) - Math.abs(actual)) > tol) return false;
    if (Math.abs(actual) >= 0.05) {
        const around = text.slice(Math.max(0, l.numIndex - 12), l.numIndex + l.numLength + 10);
        if (actual > 0 && TR_DOWN.test(around) && !TR_UP.test(around)) return false;
        if (actual < 0 && TR_UP.test(around) && !TR_DOWN.test(around)) return false;
    }
    return true;
}

function translationNumberReasons(type: InsightType, sourceText: string, translatedTpl: string, basis: GNums | null | undefined): string[] {
    const src = String(sourceText ?? '');
    const srcLits = guardianLiterals(src);
    // 원문 리터럴이 가질 수 있는 부호 있는 값(부호·방향어로 정해지면 하나, 방향 정보가 없으면 ±)
    const signedOf = (l: GLiteral) => [l.value, -l.value].filter((c, i, a) => a.indexOf(c) === i && literalMatchesValue(l, c, src));
    const bad: string[] = [];
    for (const l of guardianLiterals(translatedTpl)) {
        // 같은 지표 리터럴 + 원문에서 «지표+숫자»로 안 잡힌 같은 크기 숫자(다른 지표의 리터럴 자리는 빼서 지표 간 맞바꿈은 계속 잡는다)
        const loose = [...src.matchAll(/[+\-−]?\d+(?:\.\d+)?/g)]
            .filter((m) => Math.abs(Math.abs(Number(m[0].replace('−', '-'))) - Math.abs(l.value)) < 1e-9)
            .filter((m) => !srcLits.some((s) => m.index! < s.numIndex + s.numLength && s.numIndex < m.index! + m[0].length))
            .map((m): GLiteral => ({ key: l.key, written: m[0].replace('−', '-'), value: Number(m[0].replace('−', '-')), index: m.index!, numIndex: m.index!, numLength: m[0].length, ctx: '' }));
        const pool: GLiteral[] = [...srcLits.filter((s) => s.key === l.key), ...loose];
        if (!pool.some((s) => signedOf(s).some((c) => literalMatchesValue(l, c, translatedTpl)))) bad.push(`translation-number:${l.key}:${l.written}`);
    }
    if (type === 'reality') bad.push(...checkGuardianLiterals(translatedTpl, insightNums(type, basis)));
    return bad;
}

/**
 * 정리 + 출구 검사. 사용자에게 나가는 모든 AI 글(생성·번역·캐시 읽기·저장된 판정)이 여기를 지난다.
 * ★2026-10-04 숫자 — tpl(자리표가 남은 정리본 = 저장용)을 화면 값(nums)으로 채운 text 를 검사한다:
 *   언어·거절·마크다운·연도(outputGate) + 화면 숫자 대조·낡은 서술(lib/ai/guardianNumbers).
 *   nums 가 없으면 basis(생성 때 값)로 채운다(숫자 대조도 basis 기준).
 */
function gateText(type: InsightType, tpl: string | null | undefined, locale: Locale, nums?: GNums | null, basis?: GNums | null, strict = false, tacticalPrompt?: string, restore = false, generated = strict): { ok: boolean; tpl: string; text: string; reasons: string[] } {
    let cleaned = cleanInsight(String(tpl ?? ''), { labels: SECTION_LABELS[type][locale] });
    // ★2026-10-07 T5 예측어 — 생성(strict)은 걸리면 탈락(교정 재생성), 읽기·복구(lenient)는 그 문장만 뺀다(쓸 만하게 남을 때) —
    //   이미 저장돼 있던 글이 새 사전 때문에 통째로 «준비 중»으로 바뀌지 않게(보이던 표시를 없애지 않는다).
    const forecastReasons: string[] = [];
    const fh = forecastHits(cleaned, locale);
    if (fh.length) {
        if (strict) forecastReasons.push(`forecast:${fh[0].id}«${fh[0].match}»`);
        else { const st = stripForecastSentences(cleaned, locale, { allowEmptyLine: true }); if (st.usable && st.text) cleaned = st.text; }
    }
    // 새 생성만 INDEX_FACTS로 검사한다. 저장본의 지수 리터럴은 현재 선물/현물과 재대조하지 않는다.
    // 마지막 정상본은 재생성 실패에도 보존한다 — 자리표는 지금 값(같은 화면 다른 카드와 같은 시점), 지금 값이면 서술이 낡을 때만 저장 당시 값(T21 · tacticalFillNums).
    const currentNums = type === 'reality' && restore ? tacticalFillNums(cleaned, nums, basis) : nums ?? basis ?? null;
    const appliedNums = generated ? insightNums(type, currentNums) : currentNums;
    // 순환매: 새 생성 = v3 계약(지수·자산 등락률 자리표 없음) · 저장본은 레이블 유무로 옛/새 계약을 가른다(옛 글은 옛 검사 그대로)
    const rotationV3 = type === 'rotation' && (generated || !isLegacyRotationText(cleaned));
    const n = type === 'reality' && !generated
        ? fillGuardianTokens(cleaned, appliedNums, !restore && nums ? insightNums(generated ? type : 'rotation', basis) : null)
        : type === 'rotation' && generated
            ? guardianNumbersGate(cleaned, rotationNums(currentNums), nums ? rotationNums(basis) : null)
            : rotationV3
                ? rotationStoredGate(cleaned, currentNums, nums ? basis : null)
                : guardianNumbersGate(cleaned, appliedNums, nums ? insightNums(generated ? type : 'rotation', basis) : null);
    const r = validateInsight(n.text, locale);
    // ★2026-10-07 T5 문턱·비교·범위 문장 — «RLSI 42 sits below the 40 threshold»(42 는 40 아래가 아니다)
    const facts = guardianCmpFacts(currentNums);
    const cmpReasons = [...checkComparisons(n.text, facts), ...checkRanges(n.text, facts)];
    // 기존 상태 낡음은 캐시 재사용을 막아 재생성을 유도한다. 마지막 정상본 복구에서는 적용하지 않는다.
    //   장중만 — 장외 카드는 «Last session analysis»(지난 세션 해석)라 밤사이 선물 움직임으로 지우지 않는다(장외엔 다시 만들 수도 없다).
    const implied = type === 'reality' && !restore && nums && !isOffHours() ? stateStaleReasons(nums, basis ?? null) : [];
    const reasons = [...textIntegrityReasons(String(tpl ?? '')), ...r.reasons, ...n.reasons, ...implied, ...forecastReasons, ...cmpReasons, ...(type !== 'gamma' ? internalSourceReasons(n.text) : []),
        // ★2026-10-24 순환매 v3 — 새 생성에만(구조·INDEX_FACTS·보도 인용·숫자 근거·자릿수). 저장본·복구·번역은 위 기존 검사 + 내부 출처명만.
        ...(type === 'rotation' && generated && tacticalPrompt && !isPlaceholder(n.text) ? checkRotationOutput(n.text, locale, tacticalPrompt) : []),
        // 생성 직후(strict)는 구조·근거 전체, 저장본·복구·번역은 «지난 일정을 다음 예정으로» 내보내는지만 현재 시각으로 본다
        //   (뉴스 순환·날짜 변경만으로 멀쩡한 글을 버려 모델을 다시 부르거나 장외에 «준비 중»으로 바꾸지 않게).
        ...(type === 'reality' && tacticalPrompt && !isPlaceholder(n.text)
            ? (generated ? checkTacticalOutput(n.text, locale, tacticalPrompt) : checkTacticalStored(n.text, tacticalPrompt)) : [])];
    // ★2026-10-21 Tactical 다듬기 — 내부 지표명 날것(RLSI·GEX 단독)·«게이트»·한국어 연결어미 오타를 읽는 말로(lib/ai/tacticalPrompt.polishTacticalText).
    //   검사는 다듬기 «전» 글로 한다(다듬기가 «RLSI36» 의 숫자를 셈에 드러내거나 글을 늘려 새 탈락을 만들지 않게 — 측정 2/180).
    //   저장·화면 글만 다듬는다(뜻·숫자·시각·사건 이름·자리표 불변, 같은 글을 다시 다듬어도 그대로).
    const polish = (x: string) => (type === 'reality' ? polishTacticalText(x, locale) : rotationV3 ? polishRotationText(polishTacticalText(x, locale), locale) : x);
    return { ok: reasons.length === 0, tpl: polish(cleaned), text: polish(n.text), reasons };
}

/** Redis 에서 읽기 — 읽을 때도 검사한다(언어·거절 + 화면 숫자). 검사를 도입하기 전에 저장된 나쁜 글이 TTL 동안 나가지 않게. */
async function readStoredInsight(type: InsightType, locale: Locale, nums?: GNums | null, tacticalPrompts?: TacticalPrompts, opts: { previousKey?: boolean; restore?: boolean } = {}): Promise<CachedInsight | null> {
    const redis = getRedis();
    if (!redis) return null;
    const key = opts.previousKey ? `guardian:gemini:v2:reality:${locale}` : getRedisKey(type, locale);
    try {
        const data = await redis.get(key) as { text?: string; updatedAt?: string; basis?: GNums | null; session?: TacticalSession } | null;
        if (!data?.text) return null;
        const at = data.updatedAt ? Date.parse(data.updatedAt) : 0;
        // ★2026-10-24 밤 검토 ① — 신선한 캐시로 쓸 때만 세션 일치를 본다(09:29 PRE 글이 09:31 REG 에서 «지금 개장 전» 그대로 나갔다). 복구는 세션 무관(글 보존).
        if (!opts.restore && !opts.previousKey && !sameTacticalSession(type, at, tacticalPrompts?.(locale), data.session)) return null;
        const basis = data.basis && typeof data.basis === 'object' ? data.basis : null;
        const g = gateText(type, data.text, locale, nums, basis, false, tacticalPrompts?.(locale), opts.restore);
        if (!g.ok) {
            console.warn(`[InsightGate] REJECT stored ${key} (${g.reasons.join(' | ')}) :: ${previewForLog(g.text)}`);
            return null;
        }
        if (isPlaceholder(g.text)) return null;
        return { text: g.tpl, at: Number.isFinite(at) ? at : 0, basis, session: data.session };
    } catch (e) {
        console.warn("[IntelligenceNode] Redis load error:", e);
        return null;
    }
}

/** Redis 에 쓰기 — 호출자는 반드시 gateText 를 통과한(그리고 대기 문구가 아닌) 글만 넘긴다. 나쁜 글로 좋은 캐시를 덮지 않는다. */
async function writeStoredInsight(type: InsightType, locale: Locale, text: string, basis?: GNums | null, session?: TacticalSession, ttlSec = REDIS_TTL_SEC): Promise<void> {
    await archiveInsight(type, locale, text, basis, session);   // 완료 세션 보관본(EC2) — Upstash 저장본과 별개로
    const redis = getRedis();
    if (!redis) return;
    const key = getRedisKey(type, locale);
    try {
        await redis.set(key, JSON.stringify({ text, basis: basis ?? null, updatedAt: new Date(Date.now()).toISOString(), ...(type === 'reality' ? { session: session ?? tacticalSessionAt(Date.now()) } : {}) }), { ex: ttlSec });
        console.log(`[IntelligenceNode] Saved ${key} to Redis (${text.length} chars)`);
    } catch (e) {
        console.warn("[IntelligenceNode] Redis save error:", e);
    }
}

/**
 * [2026-10-19 묶음 3 · D26] 전술 인사이트 «완료 세션 보관본» — session:insight:{TYPE_LOCALE}:{그 거래일}(8일, lib/sessionArchive).
 * 위 Redis 저장본은 12시간 TTL 이라 금요일 저녁 글이 토요일 아침에 사라지고, 장외엔 모델을 부르지 않으니
 * 주말 내내 «장외 시간 - 시장 비활성» 안내 문구만 나갔다(바로 밑 «Last session analysis» 표식과 모순).
 * 검사를 통과한 글(자리표 원본)만 그날 키에 저장하고, 장외 복구 때 마지막 완료 세션 글을 같은 검사로 다시 거른다.
 * 장 전(09:30 ET 전)의 글은 그날 키로 저장하지 않는다(그 세션은 아직 끝나지 않았다 — 모듈이 거부).
 */
const insightScope = (type: InsightType, locale: Locale) => `${type === 'reality' ? 'reality_v3' : type}_${locale}`;
async function archiveInsight(type: InsightType, locale: Locale, text: string, basis?: GNums | null, session?: TacticalSession): Promise<void> {
    try {
        if (!text || isPlaceholder(text)) return;
        // 장외의 쓰기는 번역·복구뿐이다(생성은 장중에만) — 그 글의 원래 세션을 «지금 날짜»로 보관하지 않는다(관문 2차: 금요일 글이 월요일 확정본이 됐다)
        if (isOffHours()) return;
        const now = Date.now();
        await saveSessionArchive('insight', insightScope(type, locale), etDateOf(now), { text, basis: basis ?? null, updatedAt: new Date(now).toISOString(), ...(session ? { session } : {}) }, { observedAt: now });
    } catch { /* 보관 실패가 응답을 막지 않는다 */ }
}
async function archivedInsight(type: InsightType, locale: Locale, nums?: GNums | null, tacticalPrompts?: TacticalPrompts, opts: { previousKey?: boolean; restore?: boolean } = {}): Promise<(InsightOut & { at: number }) | null> {
    try {
        // 마지막 완료 세션 «그 날짜»만(lookback 0) — 금요일 글이 없을 때 목요일 글을 «Last session»으로 내보내지 않는다
        const a = await readSessionArchive<{ text?: string; basis?: GNums | null }>('insight', opts.previousKey ? `reality_${locale}` : insightScope(type, locale), { lookback: 0 });
        const text = a?.value?.text;
        if (!text) return null;
        const basis = a!.value.basis && typeof a!.value.basis === 'object' ? a!.value.basis : null;
        const g = gateText(type, text, locale, nums, basis, false, tacticalPrompts?.(locale), opts.restore);
        if (!g.ok || isPlaceholder(g.text)) return null;
        return { tpl: g.tpl, basis, at: a!.stamp.observedAt ?? 0 };
    } catch { return null; }
}

function promptSession(prompt?: string): TacticalSession | undefined {
    const session = prompt?.match(/^SESSION: (PRE|REG|POST|CLOSED)$/m)?.[1];
    return session as TacticalSession | undefined;
}

/**
 * Tactical 저장 글의 생성 세션(PRE·REG·POST·CLOSED)이 지금 프롬프트의 세션과 같은가 — 다르면 «신선한 캐시»로 쓰지 않고 재생성을 유도한다.
 *   (재생성이 실패하면 복구 경로가 같은 글을 그대로 보여 준다 — 빈칸·«준비 중» 금지.) 생성 세션을 모르면 저장 시각으로 판정한다. Tactical 외에는 늘 true.
 */
function sameTacticalSession(type: InsightType, at: number, prompt?: string, savedSession?: string): boolean {
    if (type !== 'reality' || !prompt) return true;
    const current = promptSession(prompt);
    return !!at && Number.isFinite(at) && (savedSession || tacticalSessionAt(at)) === current;
}

function rememberInsight(type: InsightType, locale: Locale, text: string, at: number, basis?: GNums | null, session?: TacticalSession): void {
    _mem[type][locale] = { text, at, basis: basis ?? null, session };
}

/** 자리표 글 → 화면 글. 채울 값이 없어 자리표가 남으면 대기 문구(자리표가 화면에 나가지 않게). 내보낸 원본·기준을 기억한다. */
function shownOut(type: InsightType, locale: Locale, out: InsightOut, nums?: GNums | null): string {
    const f = fillGuardianTokens(out.tpl, type === 'reality' ? tacticalFillNums(out.tpl, nums, out.basis) : nums ?? out.basis ?? null);
    const shown = hasGuardianTokens(f.text) ? (isOffHours() ? OFF_HOURS_TEXT : PENDING_TEXT)[type][locale] : f.text;
    _lastOut[type][locale] = shown === f.text ? { shown, tpl: out.tpl, basis: out.basis } : null;
    if (type === 'reality' && shown === f.text) rememberShown(locale, shown, out.tpl, out.basis ?? null);
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
            _outByShown[locale].clear();
            _upgradeCheckedAt[locale] = 0;
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
    `\n\n[Rewrite request] The previous JSON failed these automatic checks — ${(['ko', 'en', 'ja'] as Locale[]).filter((l) => reasons[l]?.length).map((l) => `${l}: ${reasons[l]!.slice(0, 4).join(', ')}`).join(' | ')}. Rewrite the whole JSON object: use the placeholders exactly as defined (never type those numbers), no predictions or future tense, every above/below/미만/以上 statement must be true for the data, the same facts in all three languages, plain text only.${triHints(Object.values(reasons).flat() as string[])}`;
/** 새 검사(claimChecks·절대 날짜) 사유 → 고쳐 쓰는 방법 한 줄씩(사유 코드만으로는 모델이 무엇을 고칠지 모른다) */
function triHints(all: string[]): string {
    const h: string[] = [];
    if (all.some(r => r.includes('orphan-number'))) h.push('Put the metric name right before every number in the same clause (e.g. "TLT {TLT_CHG}"), never a bare number after "this/이는/これは".');
    if (all.some(r => r.includes('direction-sign'))) h.push('A positive change is never weak/약세/弱気 and a negative change is never strong/강세/強気; for a smaller gain say it rose less.');
    if (all.some(r => /schedule:(?:relative-day|date-required|weekday)/.test(r))) h.push('Write the event date exactly as DATE_LABELS gives it plus HH:MM ET; no today/tomorrow/오늘/내일/今日/明日.');
    if (all.some(r => r.includes('number-rollcall'))) h.push('Use at most three numbers in the SO WHAT sentence (the one about money and options positioning).');
    if (all.some(r => r.includes('internal-label'))) h.push('Never write TODAY_NEWS, SCHEDULED_EVENTS, DATE_LABELS, WHY:, SO WHAT: or NEXT: — cite the report by its time and source.');
    if (all.some(r => r.includes('positioning-required'))) h.push('Name Gamma Shield/GEX (or SPY/QQQ gamma) before the last sentence and say whether it absorbs or amplifies the pressure.');
    h.push(...rotationHints(all));
    return h.length ? ' ' + h.join(' ') : '';
}

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
/**
 * ★2026-10-24 순환매(rotation) 프롬프트는 lib/ai/rotationPrompt(v3)로 옮겼다 — 옛 프롬프트는 «NASDAQ 변동»에 나스닥100 선물(정산 대비)을 이름·기준 없이 넣고
 *   내부 등급(RISK_OFF_DEFENSE·확신도 HIGH)·flowScore 를 «%»로 그대로 줘서, 같은 화면 Tactical(현물 −0.2%)과 숫자가 충돌하고(«나스닥 +0.11%») 라벨이 글에 나왔다(10/24 운영).
 *   요청 시각으로 세션·INDEX_FACTS 를 다시 만든다(Tactical 과 같은 값 — 두 카드의 지수 숫자가 갈리지 않게).
 */
function rotationCurrent(ctx: IntelligenceContext, now = Date.now()): IntelligenceContext {
    const session = tacticalSessionAt(now);
    return { ...ctx, asOf: new Date(now).toISOString(), session, ...(ctx.indexBasis ? { indexFacts: buildIndexFacts(ctx.indexBasis, session, now) } : {}) };
}
function rotationPromptFor(ctx: IntelligenceContext, locale: Locale): string {
    return buildRotationPrompt(ctx as RotationContext, locale);
}

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
    ko: ctx => buildTacticalPrompt(ctx, 'ko'),
    en: ctx => buildTacticalPrompt(ctx, 'en'),
    ja: ctx => buildTacticalPrompt(ctx, 'ja'),
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
        // ★2026-10-24 순환매 v3 글은 레이블이 없다(4문장 3줄) — 옛 계약 글만 레이블을 옮긴다
        const structure = type === 'rotation' && isLegacyRotationText(sourceText)
            ? `Keep the section structure, one section per line, and map the labels exactly: ${pairs(3)}.`
            : type === 'rotation'
                ? 'Do NOT add labels or brackets such as [Status]; keep the same four sentences in the same order and the same line breaks, and keep every sector name, ETF ticker, index name, date and HH:MM ET time.'
            : type === 'gamma'
                ? `Keep the two-line structure and map the labels exactly: ${pairs(2)}.`
                : 'Do NOT add labels such as [Diagnosis] or [Conclusion]; keep the same sentences in the same order.';
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
 * Tactical 복구는 저장 당시 기준으로 채운다. 현재 값의 낡음 판정은 신선한 캐시 재사용 단계에만 쓴다.
 */
async function lastValidInsight(type: InsightType, locale: Locale, storedChecked = false, nums?: GNums | null, tacticalPrompts?: TacticalPrompts): Promise<InsightOut | null> {
    const m = _mem[type][locale];
    if (m && gateText(type, m.text, locale, nums, m.basis, false, tacticalPrompts?.(locale), type === 'reality').ok) return { tpl: m.text, basis: m.basis ?? null };
    if (storedChecked && type !== 'reality') return null;
    // 신선도 검사에서 낡음으로 빠졌어도 복구 때는 마지막 글을 보존한다.
    const stored = await readStoredInsight(type, locale, nums, tacticalPrompts, { restore: type === 'reality' });
    if (stored) {
        if (type !== 'reality') rememberInsight(type, locale, stored.text, stored.at, stored.basis, stored.session);
        return { tpl: stored.text, basis: stored.basis ?? null };
    }
    return null;
}

/** 다른 언어의 «검사를 통과한» 문구를 번역해 채운다. 번역도 검사하고(화면 숫자 포함), 통과한 것만 저장한다. */
async function translatedInsight(type: InsightType, locale: Locale, nums?: GNums | null, tacticalPrompts?: TacticalPrompts): Promise<InsightOut | null> {
    if (!process.env.AWS_ACCESS_KEY_ID) return null;
    for (const src of TRANSLATE_SOURCES[locale]) {
        const m = _mem[type][src];
        const source = m && sameTacticalSession(type, m.at, tacticalPrompts?.(src), m.session) && gateText(type, m.text, src, nums, m.basis, false, tacticalPrompts?.(src)).ok ? m : await readStoredInsight(type, src, nums, tacticalPrompts);
        if (!source) continue;
        const translated = await translateInsight(source.text, src, locale, type);
        if (!translated) continue;
        // 원본에 기준이 없으면(옛 저장본) 지금 화면 값이 기준 — 자리표로 바꾸는 숫자도 그 값과 같은 것뿐이다
        const basis = source.basis ?? nums ?? null;
        const tokenized = tokenizeInsight(type, translated, basis);
        const g = gateText(type, tokenized, locale, nums, basis, false, tacticalPrompts?.(locale));
        const numReasons = translationNumberReasons(type, source.text, tokenized, basis);
        if (!g.ok || isPlaceholder(g.text) || numReasons.length) {
            console.warn(`[InsightGate] REJECT translation ${type} ${src}→${locale} (${[...g.reasons, ...numReasons].join(' | ') || 'placeholder'}) :: ${previewForLog(translated)}`);
            continue;
        }
        const session = promptSession(tacticalPrompts?.(locale));
        rememberInsight(type, locale, g.tpl, Date.now(), basis, session);
        await writeStoredInsight(type, locale, g.tpl, basis, session);
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
        const current = rotationCurrent(ctx);
        return IntelligenceNode.produceInsight('rotation', current, (locale) => rotationPromptFor(current, locale));
    }

    static async generateRealityInsight(ctx: IntelligenceContext): Promise<string> {
        // [V11.1] Reality Insight downgraded to Haiku 4.5 — 350-char output, sufficient quality, 1/3 cost
        // 공유 코어의 관측 시각이 낡아도 일정의 미래 여부는 요청 시각으로 판정한다.
        const now = Date.now();
        const current = { ...ctx, asOf: new Date(now).toISOString(), session: tacticalSessionAt(now),
            ...(ctx.indexBasis ? { indexFacts: buildIndexFacts(ctx.indexBasis, tacticalSessionAt(now), now) } : {}) };
        return IntelligenceNode.produceInsight('reality', current, (locale) => REALITY_PROMPTS[locale](current));
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
    private static async generateTrilingual(type: InsightType, nums: GNums, buildPrompt: (locale: Locale) => string, opts: { ttlSec?: number } = {}): Promise<TriOutcome> {
        // 요청마다 달라지는 확인 시각은 공유 키에서 뺀다. 뉴스·일정이 바뀌면 별도 생성하고,
        // 공유 결과도 아래 호출자의 현재 근거로 재검사한다(언어별 중복 모델 호출 방지).
        const material = type === 'reality' ? buildPrompt('en').replace(/^AS_OF: .*$/m, '').replace(/"asOf":"[^"]*",?/, '') : '';
        const key = `${type}:${JSON.stringify(nums)}:${material}`;
        const inflight = _triInflight.get(key);
        if (inflight) return inflight;
        const job = IntelligenceNode.generateTrilingualOnce(type, nums, buildPrompt, opts).finally(() => { _triInflight.delete(key); });
        _triInflight.set(key, job);
        return job;
    }

    private static async generateTrilingualOnce(type: InsightType, nums: GNums, buildPrompt: (locale: Locale) => string, opts: { ttlSec?: number } = {}): Promise<TriOutcome> {
        const started = Date.now();
        const locales: Locale[] = ['ko', 'en', 'ja'];
        const blocks = locales.map((l) => `=== ${LOCALE_NAMES[l].toUpperCase()} (${l}) INSTRUCTIONS ===\n${buildPrompt(l) + tokenRulesFor(type, l, nums)}`).join('\n\n');
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
                let g = gateText(type, tokenizeInsight(type, r, nums), l, nums, nums, true, type !== 'gamma' ? buildPrompt(l) : undefined);
                // 예측어만 걸렸고 이게 마지막 기회이면 그 문장을 빼고 쓴다(먼저 교정 재생성을 해 본다)
                if (last && !g.ok && g.reasons.every((x) => x.startsWith('forecast:'))) {
                    const lenient = gateText(type, tokenizeInsight(type, r, nums), l, nums, nums, false, type !== 'gamma' ? buildPrompt(l) : undefined, false, true);
                    if (lenient.ok) g = lenient;
                }
                if (g.ok && !isPlaceholder(g.text)) into[l] = { tpl: g.tpl, basis: nums, session: type === 'reality' ? promptSession(buildPrompt(l)) : undefined };
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
            rememberInsight(type, l, o.tpl, now, nums, o.session);
            await writeStoredInsight(type, l, o.tpl, nums, o.session, opts.ttlSec);
        }
        console.log(`[IntelligenceNode] trilingual ${type}: ${Object.keys(out).join(',') || '없음'} 통과 (${Date.now() - started}ms)`);
        return { parsed: true, out };
    }

    private static async produceInsightOut(type: InsightType, locale: Locale, nums: GNums, buildPrompt: (locale: Locale) => string): Promise<InsightOut> {
        // 새 생성 검사에 쓰는 현재 프롬프트 — Tactical(INDEX_FACTS·일정)과 순환매 v3(INDEX_FACTS·보도·섹터 재료). 저장본 검사에서 순환매는 쓰지 않는다(gateText).
        const tacticalPrompts = type !== 'gamma' ? buildPrompt : undefined;
        const now = Date.now();
        const offHours = isOffHours();
        const ttl = offHours ? OFF_HOURS_TTL : TTL_NORMAL[type];

        // ① 메모리 — 검사를 통과한 글만 들어 있다. 화면 값이 움직여 서술이 낡았으면 쓰지 않는다.
        const mem = _mem[type][locale];
        if (mem && now - mem.at < ttl && sameTacticalSession(type, mem.at, tacticalPrompts?.(locale), mem.session) && gateText(type, mem.text, locale, nums, mem.basis, false, tacticalPrompts?.(locale)).ok) return { tpl: mem.text, basis: mem.basis ?? null };

        // ② Redis — 콜드 스타트마다 모델을 부르지 않게. 읽을 때도 검사한다.
        const stored = await readStoredInsight(type, locale, nums, tacticalPrompts);
        if (stored) {
            if (!mem || stored.at >= mem.at) rememberInsight(type, locale, stored.text, stored.at, stored.basis, stored.session);
            if (now - stored.at < ttl) {
                console.log(`[IntelligenceNode] Redis cache hit for ${type}/${locale} (age: ${((now - stored.at) / 1000).toFixed(0)}s, TTL: ${ttl / 1000}s)`);
                return { tpl: stored.text, basis: stored.basis ?? null };
            }
        }

        // ③ 장외(주말·20:00~04:00 ET) — 모델을 부르지 않는다
        if (offHours) {
            console.log(`[IntelligenceNode] Off-hours: skipping model call for ${type} (${locale})`);
            return IntelligenceNode.recoverInsightOut(type, locale, { storedChecked: true, nums, tacticalPrompts });
        }

        if (!process.env.AWS_ACCESS_KEY_ID) {
            console.error(`[IntelligenceNode] AWS_ACCESS_KEY_ID missing — ${type}/${locale} serves last valid text or placeholder`);
            return IntelligenceNode.recoverInsightOut(type, locale, { translate: false, storedChecked: true, nums, tacticalPrompts });
        }

        // 직전 생성이 두 번 다 검사에서 떨어졌다 — 쿨다운 동안은 모델을 두드리지 않는다
        // (세션이 바뀌었으면 — 예: PRE 실패 직후 개장 — 쿨다운을 넘어 새 세션 글을 만든다)
        if (now < _genFailUntil[type][locale] && sameTacticalSession(type, _genFailUntil[type][locale] - GEN_FAIL_COOLDOWN_MS, tacticalPrompts?.(locale))) {
            return IntelligenceNode.recoverInsightOut(type, locale, { translate: false, storedChecked: true, nums, tacticalPrompts });
        }

        // ★2026-10-07 T5 재료 완결 게이트 — 시장 데이터(RLSI·VIX)가 안 온 조기 재료로는 생성하지 않는다(마지막 정상본 유지)
        const issues = guardianMaterialIssues(nums);
        if (issues.length) {
            console.warn(`[IntelligenceNode] 재료 미완결(${issues.join(',')}) — 생성 안 함, 마지막 정상본 유지: ${type}/${locale}`);
            return IntelligenceNode.recoverInsightOut(type, locale, { translate: false, storedChecked: true, nums, tacticalPrompts });
        }

        // ④-a 3개 언어 1호출 — 같은 재료로 ko·en·ja 를 한 번에(사실이 언어 간 같다). 통과한 언어는 전부 저장한다.
        const started = Date.now();
        const tri = await IntelligenceNode.generateTrilingual(type, nums, buildPrompt);
        const candidate = tri.out[locale];
        if (candidate && gateText(type, candidate.tpl, locale, nums, candidate.basis, false, tacticalPrompts?.(locale)).ok) return candidate;
        if (tri.parsed) {
            // 모델은 답했지만 이 언어의 글이 검사를 못 넘었다(교정 재생성까지) — 같은 재료로 단일 언어를 또 부르면 같은 이유로 떨어지기 쉽다 → 복구
            _genFailUntil[type][locale] = Date.now() + GEN_FAIL_COOLDOWN_MS;
            return IntelligenceNode.recoverInsightOut(type, locale, { translate: Date.now() - started < TRANSLATE_BUDGET_MS, storedChecked: true, nums, tacticalPrompts });
        }

        if (Date.now() - started > TRI_FALLBACK_MAX_ELAPSED_MS) {
            // 3개 언어 호출이 오래 걸리고 실패했다 — 옛 경로까지 가면 라우트 한도(60초)를 넘는다 → 복구
            _genFailUntil[type][locale] = Date.now() + GEN_FAIL_COOLDOWN_MS;
            return IntelligenceNode.recoverInsightOut(type, locale, { translate: false, storedChecked: true, nums, tacticalPrompts });
        }
        // ④-b (3개 언어 호출이 응답·파싱에 실패했을 때만) 옛 방식 — 이 언어 하나만 생성 → (숫자를 직접 쓴 자리는 같은 값이면 자리표로) → 검사 → (떨어지면) 교정 지시 + 한 번 더 → 검사
        const prompt = buildPrompt(locale) + tokenRulesFor(type, locale, nums);
        const label = `${type.toUpperCase()}_${locale}`;
        let raw = await callInsightModel(prompt, locale, label);
        let gated = raw !== null ? gateText(type, tokenizeInsight(type, raw, nums), locale, nums, nums, true, tacticalPrompts?.(locale)) : null;
        if (raw !== null && gated && !gated.ok) {
            console.warn(`[InsightGate] REJECT generated ${type}/${locale} (1/2: ${gated.reasons.join(' | ')}) :: ${previewForLog(raw)}`);
            if (Date.now() - started < RETRY_BUDGET_MS) {
                raw = await callInsightModel(prompt + CORRECTIVE_INSTRUCTION[locale](gated.reasons), locale, `${label}/retry`, true);
                gated = raw !== null ? gateText(type, tokenizeInsight(type, raw, nums), locale, nums, nums, true, tacticalPrompts?.(locale)) : null;
                if (raw !== null && gated && !gated.ok) {
                    console.warn(`[InsightGate] REJECT generated ${type}/${locale} (2/2: ${gated.reasons.join(' | ')}) :: ${previewForLog(raw)}`);
                }
            }
            // 예측어만 걸렸으면 그 문장을 빼고 쓴다(사유가 forecast 뿐일 때)
            if (raw !== null && gated && !gated.ok && gated.reasons.every((r) => r.startsWith('forecast:'))) {
                const lenient = gateText(type, tokenizeInsight(type, raw, nums), locale, nums, nums, false, tacticalPrompts?.(locale), false, true);
                if (lenient.ok) gated = lenient;
            }
        }

        if (gated?.ok && !isPlaceholder(gated.text)) {
            const session = promptSession(tacticalPrompts?.(locale));
            rememberInsight(type, locale, gated.tpl, Date.now(), nums, session);
            await writeStoredInsight(type, locale, gated.tpl, nums, session);
            return { tpl: gated.tpl, basis: nums };
        }

        // ⑤ 검사를 통과한 새 글이 없다 → 마지막 정상본 / 번역 / 고정 문구
        _genFailUntil[type][locale] = Date.now() + GEN_FAIL_COOLDOWN_MS;
        return IntelligenceNode.recoverInsightOut(type, locale, { translate: Date.now() - started < TRANSLATE_BUDGET_MS, storedChecked: true, nums, tacticalPrompts });
    }

    /**
     * 모델을 새로 부르지 않고 «지금 보여 줄 수 있는 검사 통과 글»을 찾는다.
     *   마지막 정상본(메모리·Redis) → 다른 언어 정상본의 번역(검사 통과분만, 저장) → 고정 안내 문구(장외/대기).
     * Tactical은 저장 당시 기준으로 복구하고, 다른 유형은 현재 화면 숫자를 대조한다. 절대 throw 하지 않는다. 돌려주는 tpl 은 자리표가 남은 글.
     */
    static async recoverInsightOut(type: InsightType, locale: Locale, opts: { translate?: boolean; storedChecked?: boolean; nums?: GNums | null; tacticalPrompts?: TacticalPrompts } = {}): Promise<InsightOut> {
        try {
            const last = await lastValidInsight(type, locale, opts.storedChecked === true, opts.nums, opts.tacticalPrompts);
            if (last) return last;
            // 장외: 12시간 저장본이 사라졌으면 마지막 완료 세션의 같은 언어 글(검사 통과분) — 안내 문구보다 먼저, 번역(모델 호출)보다 먼저
            if (isOffHours() || type === 'reality') {
                const arch = await archivedInsight(type, locale, opts.nums, opts.tacticalPrompts, { restore: type === 'reality' });
                // 메모리에 올리지 않는다 — 올리면 다른 언어 요청이 이 글을 번역 원천으로 써 장외 모델 호출이 생긴다(관문 2차: 0회 → 1회).
                //   보관본 읽기는 EC2 GET 한 번이라 매 요청 읽어도 싸다.
                if (arch) return { tpl: arch.tpl, basis: arch.basis };
            }
            if (type === 'reality') {
                // 첫 v3 배포: v2 Redis → REALITY 보관본. 복구 전용이며 v3 저장·메모리 TTL 갱신은 하지 않는다.
                const old = await readStoredInsight(type, locale, opts.nums, opts.tacticalPrompts, { previousKey: true, restore: true });
                if (old) return { tpl: old.text, basis: old.basis ?? null };
                const oldArchive = await archivedInsight(type, locale, opts.nums, opts.tacticalPrompts, { previousKey: true, restore: true });
                if (oldArchive) return oldArchive;
            }
            if (opts.translate !== false && (type !== 'reality' || !isOffHours())) {
                const translated = await translatedInsight(type, locale, opts.nums, opts.tacticalPrompts);
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

    /** recoverInsightOut의 화면 글(Tactical은 저장 당시 기준, 다른 유형은 현재 값으로 채운다). */
    static async recoverInsight(type: InsightType, locale: Locale, opts: { translate?: boolean; storedChecked?: boolean; nums?: GNums | null; tacticalPrompts?: TacticalPrompts } = {}): Promise<string> {
        return shownOut(type, locale, await IntelligenceNode.recoverInsightOut(type, locale, opts), opts.nums);
    }

    /**
     * 방금 내보낸 화면 글의 자리표 원본·기준(생성 때 값). 판정(verdict.num)에 같이 저장해 두면 출구가 화면 값으로 다시 채운다.
     * 화면 글이 마지막으로 내보낸 글과 다르면(동시 요청 등) null — 그때는 출구가 숫자를 대조만 한다.
     */
    static numbersFor(type: InsightType, locale: Locale, shown: string | null | undefined): InsightOut | null {
        // Tactical 은 자리표가 없어도 기준값(basis)을 남긴다 — 숫자 없는 «상태 판정»의 낡음 비교(stateStaleReasons)에 필요(관문 10211005 ①).
        //   글마다 기억한 원본에서 찾는다(동시 요청에 덮이지 않게, 관문 10211022).
        if (type === 'reality' && typeof shown === 'string') {
            const r = _outByShown[locale].get(shown);
            if (r && (r.tpl !== shown || !!r.basis)) return { tpl: r.tpl, basis: r.basis };
        }
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
     * Tactical은 저장 당시 basis를 우선해 채우고 기존 저장본 검사와 내부 출처명 차단을 적용한다(버전 판별 없음).
     *   rotation/gamma는 기존처럼 현재 nums로 채우며 숫자·낡음을 대조한다.
     */
    static async repairVerdictTexts<V extends VerdictLike>(
        verdict: V, locale: Locale, where: string, nums?: GNums | null, tacticalPrompts?: TacticalPrompts,
    ): Promise<{ verdict: V; changed: boolean; repaired: string[] }> {
        let out = verdict;
        let changed = false;
        const repaired: string[] = [];
        const tplIn = verdict?.num?.tpl || {};
        const basisIn = verdict?.num?.basis || {};
        const tplOut: Partial<Record<VerdictField, string>> = { ...tplIn };
        const basisOut: Partial<Record<VerdictField, GNums | null>> = { ...basisIn };
        let numChanged = false;
        const setNum = (field: VerdictField, tpl: string, shown: string, basis: GNums | null, type?: InsightType) => {
            // 자리표가 있는 글만 원본을 남긴다 — Tactical 은 자리표가 없어도 기준값을 남긴다(상태 판정 낡음 비교, 관문 10211005 ①)
            const keep = tpl !== shown || (type === 'reality' && !!basis);
            if (keep ? tplOut[field] !== tpl || basisOut[field] !== basis : field in tplOut || field in basisOut) numChanged = true;
            if (keep) { tplOut[field] = tpl; basisOut[field] = basis; } else { delete tplOut[field]; delete basisOut[field]; }
        };
        for (const [field, type] of VERDICT_FIELDS) {
            const value = verdict?.[field];
            const tpl = typeof tplIn[field] === 'string' && tplIn[field] ? tplIn[field] as string : value;
            if (typeof tpl !== 'string' || !tpl.trim()) continue;
            const basis = basisIn[field] ?? null;
            const g = gateText(type, tpl, locale, nums, basis, false, tacticalPrompts?.(locale), type === 'reality');
            if (g.ok) {
                if (g.text !== value) { out = { ...out, [field]: g.text }; changed = true; }
                setNum(field, g.tpl, g.text, basis, type);
                continue;
            }
            console.warn(`[InsightGate] REJECT ${where} verdict.${field} (${locale}: ${g.reasons.join(' | ')}) :: ${previewForLog(g.text)}`);
            const rec = await IntelligenceNode.recoverInsightOut(type, locale, { nums, tacticalPrompts });
            const g2 = gateText(type, rec.tpl, locale, nums, rec.basis, false, tacticalPrompts?.(locale), type === 'reality');
            const shown = g2.ok ? g2.text : (isOffHours() ? OFF_HOURS_TEXT : PENDING_TEXT)[type][locale];
            out = { ...out, [field]: shown };
            setNum(field, g2.ok ? g2.tpl : shown, shown, g2.ok ? rec.basis : null, type);
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
     * (장중 생성 실패가 밤새 «준비 중»으로 굳지 않게. Tactical 직전본도 같은 저장본 복구 계약을 쓴다.)
     */
    static keepRealTextOverPlaceholders<V extends VerdictLike>(
        next: V, prev: V | null | undefined, locale: Locale, nums?: GNums | null, tacticalPrompts?: TacticalPrompts,
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
            const g = gateText(type, typeof prevTpl === 'string' && prevTpl ? prevTpl : before, locale, nums, prevBasis, false, tacticalPrompts?.(locale), type === 'reality');
            if (!g.ok) continue;
            out = { ...out, [field]: g.text };
            // Tactical 은 자리표가 없어도 기준값을 함께 옮긴다 — 상태 판정 낡음 비교(관문 10211010)
            if (g.tpl !== g.text || (type === 'reality' && !!prevBasis)) {
                const num: VerdictNumbers = { tpl: { ...(out.num?.tpl || {}), [field]: g.tpl }, basis: { ...(out.num?.basis || {}), [field]: prevBasis } };
                out = { ...out, num };
            }
        }
        return out;
    }

    /**
     * ★2026-10-24 장외(주말·야간) 판정의 순환매 글이 옛 계약(레이블 [현황]…)이면 v3 글로 바꾼다.
     *   장외 경로는 저장된 판정(ai_verdict)을 다시 쓰고 모델을 부르지 않아, 배포 뒤에도 월요일 프리마켓까지 옛 글(«나스닥 +0.11%»)이 남는다.
     *   ① v3 저장본(Redis, 검사 통과)이 있으면 그 글로 교체 ② 없으면 인스턴스 간 잠금(3시간)으로 1회만, 응답을 막지 않게 백그라운드로
     *      3개 언어를 생성해 v3 키에 72시간 저장(다음 요청이 ①로 교체). 생성이 검사를 못 넘으면 옛 글을 그대로 둔다(«준비 중»으로 바꾸지 않는다).
     *   돌려주는 판정은 바뀐 경우만(아니면 null). 절대 throw 하지 않는다.
     */
    static async offHoursRotationUpgrade<V extends VerdictLike>(
        verdict: V, locale: Locale, nums: GNums | null | undefined, context: () => IntelligenceContext,
        schedule: (job: () => Promise<void>) => boolean,
    ): Promise<V | null> {
        try {
            if (!isOffHours()) return null;
            const desc = verdict?.description;
            if (typeof desc !== 'string' || !(isLegacyRotationText(desc) || isPlaceholder(desc))) return null;
            // 요청마다 Redis 를 두드리지 않게 — 메모리(검사 통과 v3 글) 먼저, 없으면 언어당 60초에 한 번만 저장본·잠금을 본다
            const m = _mem.rotation[locale];
            // 메모리 글도 지금 값으로 검사를 통과할 때만(낡은 메모리 글이 Redis 의 새 글을 가리지 않게 — 관문 10240908)
            let stored: CachedInsight | null = m && !isLegacyRotationText(m.text) && gateText('rotation', m.text, locale, nums, m.basis).ok ? m : null;
            if (!stored) {
                if (Date.now() - _upgradeCheckedAt[locale] < 60_000) return null;
                _upgradeCheckedAt[locale] = Date.now();
                stored = await readStoredInsight('rotation', locale, nums);
                if (stored && !isLegacyRotationText(stored.text)) rememberInsight('rotation', locale, stored.text, stored.at, stored.basis);
            }
            if (stored && !isLegacyRotationText(stored.text)) {
                const g = gateText('rotation', stored.text, locale, nums, stored.basis);
                if (!g.ok || isPlaceholder(g.text)) return null;
                const keep = g.tpl !== g.text;
                const tpl = { ...(verdict.num?.tpl || {}) };
                const basis = { ...(verdict.num?.basis || {}) };
                if (keep) { tpl.description = g.tpl; basis.description = stored.basis ?? null; } else { delete tpl.description; delete basis.description; }
                const out = { ...verdict, description: g.text } as V & { num?: VerdictNumbers };
                if (Object.keys(tpl).length) out.num = { tpl, basis }; else delete out.num;
                return out;
            }
            const redis = getRedis();
            if (!redis || !process.env.AWS_ACCESS_KEY_ID) return null;
            const locked = await redis.set(OFF_HOURS_UPGRADE_LOCK, String(Date.now()), { nx: true, ex: OFF_HOURS_UPGRADE_LOCK_SEC });
            if (locked !== 'OK') return null;
            const job = async () => {
                try {
                    const current = rotationCurrent(context());
                    const genNums = guardianNumsFromAiContext(current);
                    if (guardianMaterialIssues(genNums).length) return;
                    const tri = await IntelligenceNode.generateTrilingual('rotation', genNums, (l) => rotationPromptFor(current, l), { ttlSec: OFF_HOURS_UPGRADE_TTL_SEC });
                    console.log(`[IntelligenceNode] off-hours rotation v3: ${Object.keys(tri.out).join(',') || '없음'} 통과`);
                } catch (e: any) {
                    console.warn('[IntelligenceNode] off-hours rotation v3 failed:', e?.message);
                }
            };
            if (!schedule(job)) await job();
            return null;
        } catch (e: any) {
            console.warn('[IntelligenceNode] off-hours rotation upgrade skipped:', e?.message);
            return null;
        }
    }

}

/** 비교·시험 전용(scripts/rotation-v3-compare.cjs·tests/rotationV3.test.ts) — 운영 경로와 같은 함수를 그대로 노출한다(동작 변경 없음) */
export const _rotationCompareHooks = { gateText, tokenizeInsight, rotationCurrent, rotationPromptFor, tokenRulesFor, TRI_SYSTEM, parseTriJson, restoreSectorLabels };
