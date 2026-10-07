/**
 * AI 가 쓴 «사용자에게 나가는 글»의 출구 검사 — 언어 · 거절/메타 · 마크다운 · 연도.
 *
 * ★2026-09-29 실측(대표가 앱 가디언 «RLSI INSIGHT › TACTICAL» 에서 발견):
 *   한국어 화면에 이런 글이 나갔다(guardian:gemini:reality:ko 캐시 → ai_verdict → 스냅샷):
 *     «I appreciate the detailed framework, but I need to clarify my operational constraints.
 *      I'm operating under institutional compliance guidelines that require: 1. **Observational
 *      language only** … 2. **Plain English communication** — The request is in Korean, but my
 *      compliance mandate requires English-language output …»
 *   원인은 모델이 아니라 «우리 지시문의 자기모순»이었다:
 *     · system(영어) = «관찰어만 써라(observed/indicates/suggests)·일반 텍스트·권유 금지»
 *     · 한국어 프롬프트 = «[진단] 레이블 금지» «눌림목 매수 기회» «역발상 매수 구간 검토» …
 *     · 감마 프롬프트 = «"시사한다"·"관찰된다" 금지» ← system 이 시키는 바로 그 말
 *   모델은 둘 중 하나를 고르는 대신 «지시문에 대한 설명(거절)»을 영어로 썼고,
 *   생성 경로에는 검사가 하나도 없어서(`!result.includes("failed")` 뿐) 그대로 캐시·노출됐다.
 *   같은 날 일본어는 «# マクロ市場分析» «**市場動向の因果構造**» 처럼 마크다운이 날것으로 나갔다
 *   (화면의 renderColoredText 는 [현황] 같은 레이블만 칠하고 마크다운은 그리지 않는다).
 *
 * [원칙] 모델 출력은 «믿지 말고 검사한다». 검사는 저장 «전»과 캐시에서 «나갈 때» 둘 다 건다.
 *   (newsYearGuard.ts 와 같은 원칙 — 한 번 들어간 나쁜 글은 TTL 동안 계속 나간다.)
 *
 * 이 파일은 순수 함수만 둔다(네트워크·Redis 없음) → scripts/test-insight-gate.ts 가 실측 문장으로 고정한다.
 */
import { currentYearET, yearsWritten, type Lang as YearLang } from '@/lib/newsYearGuard';
import { stripCommonTermNames } from '@/lib/ai/commonTerms';

export type GateLocale = 'ko' | 'en' | 'ja';

export interface GateResult {
    ok: boolean;
    /** 기계가 읽는 사유 코드. 예: `language:ko-hangul=0.02`, `refusal:en:"I appreciate"` */
    reasons: string[];
}

export interface CleanOptions {
    /**
     * 화면이 보여 주기로 한 섹션 레이블(대괄호 없이). 예: ['현황', '해석', '전망'].
     * 모델이 «**현황**» «현황:» «# 현황» 처럼 멋대로 꾸민 것을 «[현황]» 하나로 맞추고,
     * 줄 가운데 끼어 있으면 줄 맨 앞으로 옮긴다(모바일 플로우 탭이 줄 머리에서 찾는다).
     */
    labels?: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) 정리 — 뜻을 바꾸지 않는 표면 정규화만 한다(문장을 고치거나 지우지 않는다)
// ─────────────────────────────────────────────────────────────────────────────

/** Upstash REST 를 깨뜨리는 4바이트 문자(이모지)와 장식 기호. intelligenceNode 의 옛 sanitizeText 와 같은 범위. */
function stripEmoji(text: string): string {
    return text
        .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
        .replace(/[\u2600-\u27BF\u2B50\u2934\u2935\u25AA-\u25FE\uFE0F\uFFFD\u25C6]/g, '');
}

/** 정규식용 이스케이프 — 곧은 따옴표(')와 굽은 따옴표(’)는 같은 글자로 본다(What's ↔ What’s). */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['\u2019]/g, "['\u2019]");

/** 문장이 끝난 줄인가(굵은 «소제목»과 굵게 쓴 «문장»을 가른다). */
const ENDS_LIKE_SENTENCE = /(?:[.!?。！？…]|다|요|음|함|됨|임|です|ます|だ|である|た)\s*$/;

/** 제목 끝을 알리는 날짜 꼴 — «(2026-09-28)» «2026年9月28日» «2026년 9월 28일» «2026-09-28» */
const TITLE_DATE = /\(\s*\d{4}-\d{2}-\d{2}\s*\)|\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}-\d{2}-\d{2}/;

/**
 * `#` 제목 줄에서 «제목»만 걷고 본문은 살린다.
 * ⚠️ 옛 캐시(intelligenceNode 의 옛 sanitizeText 가 빈 줄을 공백으로 접었다)는 제목과 본문이 «한 줄»이다:
 *    «# 시장 분석 리포트 (2026-09-28) 채권 수익률이 …» · «# マクロ市場分析 — 2026年9月28日 **市場動向の因果構造** 本日の…»
 *    처음엔 제목 줄을 통째로 지웠고, 그러면 본문까지 사라져 빈 글이 됐다(2026-09-29 운영 값으로 확인).
 * 순서: [레이블] 이 있으면 거기부터 → 짧은 제목뿐이면 버림 → 굵은 소제목까지 걷기 → 날짜까지 걷기 → 그래도 모르면 `#`만 걷기.
 */
function stripHeading(rest: string): string {
    const t = rest.trim();
    // 제목 바로 뒤에 붙은 [레이블]만 본다(그 앞에 문장 끝이 없어야 한다) — 본문 뒤의 «[경고]» 에서 자르면 본문을 잃는다
    const head = t.slice(0, 80);
    const label = head.search(/\[[^\]\n]{1,40}\]/);
    if (label >= 0 && !/[.。!?！？]/.test(head.slice(0, label))) return t.slice(label);
    const plain = t.replace(/\*\*|__/g, '').trim();
    if (plain.length <= 60 && !ENDS_LIKE_SENTENCE.test(plain)) return '';
    const bold = t.match(/^[^\n]{0,80}?(?:\*\*|__)[^*_\n]{1,60}(?:\*\*|__)\s*[:：]?\s*/);
    if (bold) return t.slice(bold[0].length);
    const date = t.slice(0, 80).match(TITLE_DATE);
    if (date && date.index !== undefined) return t.slice(date.index + date[0].length).replace(/^[\s:：—–-]+/, '');
    return t;
}

/**
 * 마크다운·장식을 걷고 줄 모양을 맞춘다.
 *  · `# 제목` 줄은 «제목»만 걷는다(stripHeading). 짧은 제목뿐인 줄은 버리고, 같은 줄에 붙은 [레이블]·본문은 살린다
 *    — 옛 캐시는 줄바꿈이 공백으로 접혀 «# 시장 순환매 분석 (2026-09-28) [현황] …» 처럼 한 줄에 붙어 있다.
 *  · 줄 전체가 굵은 글씨인 짧은 소제목(«**市場動向の因果構造**»)도 제목과 같이 지운다. 레이블이면 «[레이블]»로.
 *  · `**` `__` 백틱, 가로줄(---), 인용(>) 표시를 걷는다. `* 항목` 은 `- 항목` 으로.
 *  · 빈 줄은 없앤다(섹션 사이는 줄바꿈 하나). 레이블만 있는 줄은 다음 줄과 합친다: «[현황] 본문».
 */
export function cleanInsight(text: string, opts: CleanOptions = {}): string {
    if (typeof text !== 'string' || !text) return '';
    const labels = (opts.labels || []).filter(Boolean);
    const alt = labels.map(escapeRe).join('|');
    const labelOnly = alt ? new RegExp(`^\\[?(${alt})\\]?\\s*[:：]?$`, 'i') : null;
    // 모델이 쓴 표기(대소문자·굽은 따옴표)를 화면이 아는 표기 하나로 맞춘다 — TAG_PATTERN 은 «[Status]» 만 칠한다
    const canon = (found: string) => labels.find((l) => new RegExp(`^${escapeRe(l)}$`, 'i').test(found)) || found;

    let s = stripEmoji(text.replace(/\r\n?/g, '\n'))
        .replace(/```[a-zA-Z]*\n?/g, '')
        .replace(/`/g, '');

    // 굵게 쓴 레이블은 어디에 있든(줄 가운데 포함) 제 줄로 뺀다: «… 示している。 **この見方が崩れる地点**» → 줄 머리
    if (alt) s = s.replace(new RegExp(`\\*\\*\\s*\\[?(${alt})\\]?\\s*[:：]?\\s*\\*\\*\\s*[:：]?`, 'gi'), (_m, l) => `\n[${canon(l)}]\n`);

    const out: string[] = [];
    for (const rawLine of s.split('\n')) {
        let line = rawLine;
        // 제목(#) — 제목만 걷고, 같은 줄에 붙은 레이블·본문은 살린다
        const h = line.match(/^\s{0,3}#{1,6}\s+(.*)$/) || line.match(/^\s{0,3}#{1,6}$/);
        if (h) {
            const lm = labelOnly ? (h[1] || '').replace(/\*\*|__/g, '').trim().match(labelOnly) : null;
            if (lm) { out.push(`[${canon(lm[1])}]`); continue; }
            line = stripHeading(h[1] || '');
            if (!line) continue;
        }
        // 줄 전체가 굵은 글씨 — 레이블이면 살리고, 짧은 소제목이면 버린다(굵게 쓴 «문장»은 남긴다)
        const b = line.match(/^\s*(\*\*|__)((?:(?!\*\*|__).)+)\1\s*[:：]?\s*$/);
        if (b) {
            const inner = b[2].trim();
            const lm = labelOnly ? inner.match(labelOnly) : null;
            if (lm) { out.push(`[${canon(lm[1])}]`); continue; }
            if (inner.length <= 40 && !ENDS_LIKE_SENTENCE.test(inner) && !/^\[[^\]]+\]$/.test(inner)) continue;
        }
        // 가로줄
        if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) continue;
        // 인용 표시
        line = line.replace(/^\s*>\s?/, '');
        // 마크다운 글머리 «* » → «- »
        line = line.replace(/^\s*\*\s+/, '- ');
        // 굵게·기울임 표시(쌍)
        line = line.replace(/\*\*/g, '').replace(/__/g, '');
        line = line.replace(/[ \t\u00A0]{2,}/g, ' ').trim();
        if (!line) continue;
        out.push(line);
    }
    s = out.join('\n');

    if (alt) {
        // 줄 전체가 레이블(대괄호·콜론 유무 무관) → «[레이블]»
        s = s.replace(new RegExp(`^\\[?(${alt})\\]?[ \\t]*[:：]?$`, 'gim'), (_m, l) => `[${canon(l)}]`);
        // 줄 머리의 «레이블:» → «[레이블] »
        s = s.replace(new RegExp(`^(${alt})[ \\t]*[:：][ \\t]*`, 'gim'), (_m, l) => `[${canon(l)}] `);
        // 줄 가운데 끼어 있는 «[레이블]» → 줄 머리로
        s = s.replace(new RegExp(`([^\\n])[ \\t]*\\[(${alt})\\]`, 'gi'), (_m, pre, l) => `${pre}\n[${canon(l)}]`);
        // 줄 머리 «[레이블]» 표기 통일 + 바로 뒤 콜론 정리
        s = s.replace(new RegExp(`^\\[(${alt})\\][ \\t]*[:：]?[ \\t]*`, 'gim'), (_m, l) => `[${canon(l)}] `);
        // 레이블만 있는 줄 + 다음 줄 → 한 줄
        s = s.replace(new RegExp(`^(\\[(?:${alt})\\]) ?\\n(?!\\[)`, 'gim'), '$1 ');
        s = s.replace(/[ \t]+$/gm, '');
    }
    return s.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) 판정 — 하나라도 걸리면 «이 글은 사용자에게 나가면 안 된다»
// ─────────────────────────────────────────────────────────────────────────────

const RE_HANGUL = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF]/g;
const RE_KANA = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/g;
const RE_KANJI = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

const count = (s: string, re: RegExp) => (s.match(re) || []).length;

/**
 * 라틴 글자 수 — 단, 티커·지표 약어(ETF·GEX·RLSI·VIX·S&P·IFS·TLT·XLK·US10Y·AI_PWR …)는 뺀다.
 * 한국어·일본어 분석문에는 이 약어들이 원래 섞여 있다. «소문자가 하나도 없는 토큰» = 약어로 본다.
 * «2s10s»«10Y»처럼 숫자가 섞인 짧은 토큰도 약어로 본다.
 */
function latinLetters(s: string, ignoreCommonNames = false): number {
    let n = 0;
    // ★2026-10-08 한국어·일본어 글의 «Max Pain·Call Wall·Put Floor·Gamma Flip» 은 번역하지 않는 금융 공통어(lib/ai/commonTerms) — 영어 누출로 세지 않는다
    if (ignoreCommonNames) s = stripCommonTermNames(s);
    for (const tok of s.match(/[A-Za-z\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F&/._'\u2019-]*|[0-9]+[A-Za-z][A-Za-z0-9]*/g) || []) {
        const letters = (tok.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
        if (!/[a-z\u00DF-\u00FF]/.test(tok)) continue;             // 전부 대문자 = 약어·티커
        if (/\d/.test(tok) && letters <= 3) continue;               // 2s10s · 1.5x · 5bp
        n += letters;
    }
    return n;
}

export interface LanguageStats { hangul: number; kana: number; kanji: number; latin: number }

export function languageStats(text: string, opts: { ignoreCommonNames?: boolean } = {}): LanguageStats {
    return {
        hangul: count(text, RE_HANGUL),
        kana: count(text, RE_KANA),
        kanji: count(text, RE_KANJI),
        latin: latinLetters(text, !!opts.ignoreCommonNames),
    };
}

/**
 * 언어 판정. 임계값은 2026-09-28~29 운영 실측 문장(가디언 3종 × 3개국어 · 아침 브리핑 · 크로스섹터 · 뉴스 다이제스트)으로 맞췄다
 * — 정상 한국어 문장의 한글 비율은 최저 0.9 안팎, 거절문은 0.0x 였다. 60% 는 넉넉한 경계다.
 */
function languageReasons(text: string, locale: GateLocale): string[] {
    const st = languageStats(text, { ignoreCommonNames: locale !== 'en' });
    const total = st.hangul + st.kana + st.kanji + st.latin;
    const r2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);
    if (locale === 'ko') {
        const ratio = total ? st.hangul / total : 0;
        const out: string[] = [];
        if (st.hangul < 10 || ratio < 0.6) out.push(`language:ko-hangul=${r2(ratio)}`);
        if (st.kana > 2) out.push(`language:ko-has-kana=${st.kana}`);
        return out;
    }
    if (locale === 'ja') {
        const ratio = total ? (st.kana + st.kanji) / total : 0;
        const out: string[] = [];
        if (st.kana < 3 || ratio < 0.6) out.push(`language:ja-kana+kanji=${r2(ratio)},kana=${st.kana}`);
        if (st.hangul > 0) out.push(`language:ja-has-hangul=${st.hangul}`);
        return out;
    }
    // en
    const out: string[] = [];
    if (st.hangul > 0) out.push(`language:en-has-hangul=${st.hangul}`);
    if (st.kana > 0) out.push(`language:en-has-kana=${st.kana}`);
    if (st.kanji > 3) out.push(`language:en-has-kanji=${st.kanji}`);
    if (st.latin < 10) out.push(`language:en-latin=${st.latin}`);
    return out;
}

/**
 * 거절·메타 발화(«지시문에 대한 말»). 분석문은 3인칭 서술이다 — 1인칭 «I cannot»·«죄송»·«申し訳»은
 * 분석이 아니라 모델이 우리에게 하는 말이다. 로케일과 무관하게 세 언어 패턴을 모두 건다.
 */
const REFUSAL_PATTERNS: Array<[string, RegExp]> = [
    // en
    ['en', /\bI (?:appreciate|understand|apologi[sz]e|must|need to|have to|cannot|can ?not|can't|can’t|won't|won’t|will not|am unable|'m unable|’m unable|am not able|'m not able|’m not able|would be happy|'d be happy|’d be happy)\b/i],
    ['en', /\bI(?:'m|’m| am) (?:operating|required|designed|programmed|not permitted|not allowed)\b/i],
    ['en', /\b(?:need|have|must|want) to clarify\b/i],
    ['en', /\boperational constraints?\b/i],
    ['en', /\bcompliance (?:guidelines?|mandate|requirements?|rules?|constraints?)\b/i],
    ['en', /\bmy (?:guidelines|instructions|constraints|mandate|programming)\b/i],
    ['en', /\bas an? (?:AI|language model|assistant)\b/i],
    ['en', /\blanguage model\b/i],
    ['en', /\bWhat I can (?:provide|offer|do)\b/i],
    ['en', /\bthe (?:request|prompt) (?:is|was|asks|requires)\b/i],
    ['en', /\b(?:here is|here's|here’s) (?:the|my|a|an) (?:translation|translated|analysis|summary|rewrite|revised)\b/i],
    ['en', /^\s*(?:translation|translated text)\s*[:：]/im],
    // ko
    ['ko', /죄송/],
    ['ko', /제약\s*사항/],
    ['ko', /(?:운영|준법|컴플라이언스)\s*(?:상의?\s*)?(?:제약|지침|가이드라인)/],
    ['ko', /할\s*수\s*없습니다/],
    ['ko', /(?:드릴|해\s*드릴)\s*수\s*(?:없|있)/],
    ['ko', /AI\s*(?:로서|어시스턴트|모델)/],
    ['ko', /언어\s*모델/],
    ['ko', /요청(?:하신|하셨|해\s*주신)/],
    ['ko', /(?:다음은|아래는)[^\n]{0,24}(?:번역|분석|요약)(?:입니다|이다|한\s*것)/],
    ['ko', /^\s*번역(?:문|본)?\s*[:：]/m],
    // ja
    ['ja', /申し訳/],
    ['ja', /(?:お答え|回答|対応|提供|作成|お手伝い|応じる|従う|実行|翻訳|分析|記述|出力)(?:することが|すること|は)?できません/],
    ['ja', /(?:運用|コンプライアンス)上?の?(?:制約|ガイドライン|方針)/],
    ['ja', /制約(?:事項|により|のため)/],
    ['ja', /AI(?:として|アシスタント|モデル)/],
    ['ja', /言語モデル/],
    ['ja', /ご(?:要望|依頼|要求|指示)(?:に|の|を|では)/],
    ['ja', /(?:以下|次)[^\n]{0,24}(?:翻訳|分析|要約)(?:です|となります)/],
    ['ja', /^\s*翻訳(?:文)?\s*[:：]/m],
];

/** 생성 실패·설정 누락·로딩 문구 — 글자는 차 있지만 «분석»이 아니다. */
const FAILURE_MARKERS: RegExp[] = [
    /Insight generation failed/i,
    /^\s*SETUP REQUIRED/i,
    /Gathering Pulse/i,
    /SYSTEM INITIALIZING/i,
];

function yearLang(locale: GateLocale): YearLang {
    return locale === 'ko' ? 'KR' : locale === 'ja' ? 'JP' : 'EN';
}

/**
 * 연도 검사 — 올해·작년(뉴욕 기준) 밖의 연도가 «연도로» 쓰였으면 실패.
 * 모델은 날짜를 모르면 학습 시점을 «지금»으로 가정하고 연도를 채운다(2026-09-24 뉴스 펄스 «2025년 1월 10일» 사고).
 * 판정은 newsYearGuard 의 yearsWritten(러셀 2000·2000억은 연도로 안 본다) + ISO 날짜(2025-01-10).
 */
function yearReasons(text: string, locale: GateLocale, now: Date): string[] {
    const cur = Number(currentYearET(now));
    const allowed = new Set([String(cur), String(cur - 1)]);
    const found = new Set<string>([
        ...yearsWritten(text, yearLang(locale)),
        ...[...text.matchAll(/(?<!\d)((?:19|20)\d{2})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?!\d)/g)].map((m) => m[1]),
    ]);
    const bad = [...found].filter((y) => !allowed.has(y));
    return bad.length ? [`year:${bad.join(',')}`] : [];
}

/**
 * 금리 변동 상식 검사 — 국채 수익률의 «하루» 변동을 60bp(0.6%포인트) 이상이라고 쓴 글은 실패.
 * 2026-09-29 운영 실측: ko 현실 인사이트가 «10Y 5.24%, +108bp 급등» — 수익률의 «상대 변화율» 1.08% 를
 * 모델이 108bp 로 읽었다(실제 +6~7bp). 1990년 이후 10년물 하루 변동은 대부분 ±30bp 안이라 60bp 는 넉넉한 상한이다.
 * 금리 단어(10Y·10년물·国債·利回り·yield·Treasury 등)와 같은 문장 가까이(앞뒤 60자)에 있는 bp·%포인트만 본다.
 */
const YIELD_WORD = /(\b(?:US)?(?:2|5|10|20|30)Y\b|10-?year|two-year|ten-year|treasury|yield|국채|금리|수익률|\d+년물|国債|利回り|金利|\d+年債)/i;
function yieldMoveReasons(text: string): string[] {
    const out: string[] = [];
    const re = /([+\-−]?\s?\d{1,4}(?:\.\d+)?)\s?(bps?|bp|베이시스\s?포인트|ベーシスポイント|%\s?p\b|%포인트|%ポイント|percentage points?)/gi;
    for (const m of text.matchAll(re)) {
        const raw = Number(m[1].replace(/[\s−]/g, (c) => (c === '−' ? '-' : '')));
        if (!Number.isFinite(raw)) continue;
        const unit = m[2].toLowerCase();
        const bp = /bp|베이시스|ベーシス/.test(unit) ? Math.abs(raw) : Math.abs(raw) * 100;
        if (bp < 60) continue;
        const i = m.index ?? 0;
        const around = text.slice(Math.max(0, i - 60), i + m[0].length + 60);
        if (YIELD_WORD.test(around)) out.push(`implausible-yield-move:${m[0].replace(/\s+/g, '')}`);
    }
    return out;
}

export interface ValidateOptions {
    now?: Date;
    /** 이보다 짧으면 실패(기본 15자) */
    minLength?: number;
}

/**
 * 사용자에게 나가도 되는 글인가. 반드시 cleanInsight 를 거친 글에 건다.
 * (마크다운 검사는 «정리 뒤에도 남은 것» = 정리기가 모르는 모양을 잡는 안전망이다.)
 */
export function validateInsight(text: string, locale: GateLocale, opts: ValidateOptions = {}): GateResult {
    const reasons: string[] = [];
    const s = typeof text === 'string' ? text.trim() : '';
    if (s.length < (opts.minLength ?? 15)) {
        return { ok: false, reasons: [`too-short:${s.length}`] };
    }
    for (const re of FAILURE_MARKERS) {
        if (re.test(s)) { reasons.push(`failure-marker:${re.source.slice(0, 30)}`); break; }
    }
    reasons.push(...languageReasons(s, locale));
    for (const [lang, re] of REFUSAL_PATTERNS) {
        const m = s.match(re);
        if (m) reasons.push(`refusal:${lang}:"${m[0].trim().slice(0, 40)}"`);
    }
    if (/(?:^|\n)\s{0,3}#{1,6}\s/.test(s) || /\*\*|__|```/.test(s) || /^\s*\|.*\|\s*$/m.test(s)) {
        reasons.push('markdown');
    }
    reasons.push(...yearReasons(s, locale, opts.now ?? new Date()));
    reasons.push(...yieldMoveReasons(s));
    return { ok: reasons.length === 0, reasons };
}

/** 정리 + 판정을 한 번에. 판정은 «정리된 글»에 건다. */
export function gateInsight(text: string, locale: GateLocale, opts: CleanOptions & ValidateOptions = {}): GateResult & { text: string } {
    const cleaned = cleanInsight(text, opts);
    return { text: cleaned, ...validateInsight(cleaned, locale, opts) };
}

/** 로그용 미리보기 — 줄바꿈을 접고 앞부분만. */
export function previewForLog(text: string, n = 90): string {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? `${s.slice(0, n)}…` : s;
}
