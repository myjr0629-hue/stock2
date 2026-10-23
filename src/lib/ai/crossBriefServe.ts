/**
 * 크로스섹터 브리프 서빙 선택 — v4(Anthropic 크레딧 생성본)를 «출구 가드를 넘을 때만» 먼저 보여 주고, 아니면 v3(AWS Lambda) → v2 (2026-10-11).
 *
 * 배경: 브리프는 두 곳에서 만든다.
 *   · v3 `postmarket:cross-brief-v3:{ET날짜}` — AWS Lambda(Bedrock Sonnet 4.6). 화면 GET 이 읽는다. 출구 가드는 keyLevels 근거 필터뿐(언어·숫자 가드 없음).
 *   · v4 `postmarket:cross-brief-v4:{ET날짜}` — Vercel 크론 POST(제공자 사다리: Anthropic 크레딧 Haiku 5.5 → …). 화면이 읽지 않아 크레딧만 쓰고 있었다.
 * 10/10~11 품질 비교에서 Haiku 5.5 쪽이 같은 가드로 9/10 으로 더 나았다 → v4 를 먼저 보이되, «가드 통과 + 같은 거래일»일 때만. 못 넘으면 지금처럼 v3 → v2.
 *
 * 가드는 두 번 돈다.
 *   ① 생성 때(buildGenerationGuard, POST) — 입력(프롬프트)이 있어야 하는 검사까지 전부: 필수 구조 · 칸 길이 상한 · 언어 혼입/거절/연도/금액 자릿수(ladderGates.evaluateOutput) ·
 *      숫자 근거(depthNumbers) · keyLevels 근거. 결과를 저장본 `guard` 에 남긴다(내용 해시 포함).
 *   ② 서빙 때(evaluateServedV4, GET) — 저장본만으로 다시 확인할 수 있는 검사: guard 기록(ok·해시 일치) · 날짜 · 필수 구조 · 칸 길이 상한 · 문자 체계 혼입 · 거절문 · keyLevels 근거.
 *      프롬프트가 필요한 검사(숫자·금액·연도)는 ①의 기록을 믿는다 — 저장본에 guard 가 없는 옛 v4(10/9~10 크론분)는 «검증 불가»라 내보내지 않는다(닫힌 쪽으로 실패).
 *
 * 순수 함수만(I/O 는 `read` 로 주입) — tests/crossBriefServe.test.ts 가 우선순위·날짜 불일치·가드 실패 시 v3 로 내려감을 고정한다.
 */
import { evaluateOutput, collectLocaleStrings, scriptPurityReasons, refusalReasons } from '@/lib/ai/ladderGates';
import { checkOutputNumbers } from '@/lib/ai/depthNumbers';
import { groundKeyLevels, sanitizeServedBrief } from '@/lib/ai/keyLevels';
import { closingReportProblems, narrativeLengthCeiling } from '@/lib/ai/closingReport';

export type BriefSource = 'v4' | 'v3' | 'v2';

/** 서빙을 허용하는 제공자 — 품질을 잰 5.5 계열(Anthropic 크레딧 Haiku/Sonnet 5.5 · Bedrock 5.5). 현행 Bedrock Haiku 4.5(legacy)는 비교한 적 없어 v3 에 양보한다. */
export const V4_SERVE_PROVIDERS = ['a55', 'a55s', 'b55'] as const;

/** guard 기록 형식 버전 — 가드 규칙이 바뀌면 올려 옛 기록을 무효로 한다 */
export const GUARD_VERSION = 1;

/**
 * 입력에 없는 «서로 다른» 숫자(depthNumbers)의 허용 개수 — 이보다 많으면 v4 를 내보내지 않는다. 같은 숫자를 ko·en·ja 세 칸에 쓴 것은 한 개로 센다.
 * 근거(금요일 10/9 실데이터·같은 가드): v4(Haiku 5.5) 10회는 서로 다른 값 0개 7회 · 1개(IF→THEN 문턱 «100»·«$0.7B») 2회 · 3개(모델이 계산한 «3.45%·2.10%·1.20%») 1회 /
 * v3(Lambda·Sonnet 4.6) 5회는 4 · 1 · 3 · 0 · 3개(환산 «+2.7%»·문턱 «NASDAQ 27,500»·«160»·합계 «$472.1M»). 한두 개의 환산·문턱은 정상 범위로 두고, 세 개 이상 서로 다른 숫자가
 * 입력에 없으면 막는다. (keyLevels 의 지어낸 수준은 별도 가드로 이미 0칸 — 이 수는 서술 칸 속 숫자만 센다.)
 */
export const MAX_UNGROUNDED_DISTINCT = 2;

/**
 * 한 칸(글 조각)의 길이 상한(글자 수) — 화면은 칸을 자르지 않고 줄바꿈하므로, 폭주(프롬프트의 «1~2문장»을 어긴 장문)가 카드를 늘리지 않게 하는 안전선.
 * 근거(금요일 10/9 실데이터): 현행 v3 화면의 칸 최대 ko 147 · en 227 · ja 110 (5회) → 그 두 배 안팎. v4 5.5 10회의 최대는 ko 238 · en 343 · ja 203 으로 전부 아래다
 * (유일하게 v3 보다 확실히 긴 칸은 marketOverview.summary — 지시문이 «2문장 이내»라 v3 는 1문장, v4 는 2문장을 쓴다).
 */
export const SLOT_LENGTH_CEILING = { ko: 300, en: 460, ja: 260 } as const;

export interface BriefGuard {
    v: number;
    ok: boolean;
    /** 판정 시각(ISO) */
    at: string;
    provider: string;
    model: string;
    /** 판정한 structured 의 내용 해시 — 저장본의 글이 바뀌었으면 기록을 믿지 않는다 */
    digest: string;
    numbers: { total: number; ungrounded: number; distinct: number; list: string[] };
    reasons: string[];
}

const LOCS = ['ko', 'en', 'ja'] as const;

/** 빠르고 충돌 적은 문자열 해시(cyrb53) — 변조 방지가 아니라 «판정한 글 = 저장된 글» 확인용 */
export function textDigest(text: string): string {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const briefDigest = (structured: unknown): string => textDigest(JSON.stringify(structured ?? null));

const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const isTri = (o: any): boolean => !!o && typeof o === 'object' && LOCS.every((l) => isStr(o[l]));
const isTriArr = (o: any): boolean => !!o && typeof o === 'object' && LOCS.every((l) => Array.isArray(o[l]) && o[l].every((x: unknown) => typeof x === 'string'));

/**
 * 화면이 읽는 칸이 갖춰졌나 — 웹 PostMarketBriefView·앱 Intel 요약 카드가 읽는 필드(칸 구조는 바꾸지 않는다, 읽는 것만 본다).
 * 선택 칸(newsImpact·gammaOptions·edgeAlerts)은 있으면 모양만 본다.
 */
export function shapeProblems(s: any): string[] {
    const p: string[] = [];
    if (!s || typeof s !== 'object' || Array.isArray(s)) return ['shape:not-object'];
    const mo = s.marketOverview;
    if (!mo || !isStr(mo.tone)) p.push('shape:marketOverview.tone');
    if (!isTri(mo?.summary)) p.push('shape:marketOverview.summary');
    if (!isTriArr(mo?.keyDrivers)) p.push('shape:marketOverview.keyDrivers');
    const sr = s.sectorRotation;
    if (!sr || !Array.isArray(sr.winners) || !Array.isArray(sr.losers)) p.push('shape:sectorRotation.winners/losers');
    else {
        for (const k of ['winners', 'losers'] as const) {
            if (!sr[k].every((x: any) => x && isStr(x.sector) && typeof x.change === 'string' && isTri(x.reason))) p.push(`shape:sectorRotation.${k}[]`);
        }
    }
    if (!isTri(sr?.rotationInsight)) p.push('shape:sectorRotation.rotationInsight');
    const ni = s.newsImpact;
    if (ni != null) {
        if (!Array.isArray(ni.items)) p.push('shape:newsImpact.items');
        else if (!ni.items.every((it: any) => it && isTri(it.headline) && isTri(it.impact) && (it.impactChain == null || Array.isArray(it.impactChain)))) p.push('shape:newsImpact.items[]');
    }
    const go = s.gammaOptions;
    if (go != null && (typeof go !== 'object' || !isTri(go.insight))) p.push('shape:gammaOptions.insight');
    const ol = s.outlook;
    if (!ol || !isStr(ol.bias)) p.push('shape:outlook.bias');
    if (!Array.isArray(ol?.keyLevels) || !ol.keyLevels.every((x: any) => x && isStr(x.label) && isStr(x.value))) p.push('shape:outlook.keyLevels');
    for (const k of ['catalysts', 'risks', 'opportunities'] as const) if (!isTriArr(ol?.[k])) p.push(`shape:outlook.${k}`);
    if (s.edgeAlerts != null) {
        if (!Array.isArray(s.edgeAlerts) || !s.edgeAlerts.every((a: any) => a && isTri(a.title) && isTri(a.detail))) p.push('shape:edgeAlerts[]');
    }
    return p;
}

/** 프롬프트 없이 저장본만으로 되는 글 검사 — 문자 체계 혼입(ko 에 가나 · ja 에 한글 · en 에 한글/가나) · 거절·사과문 */
export function languageProblems(structured: unknown): string[] {
    const out: string[] = []; const seen = new Set<string>();
    for (const it of collectLocaleStrings(structured, null)) {
        for (const r of [...scriptPurityReasons(it.text, it.loc), ...refusalReasons(it.text)]) {
            const k = `${it.loc}:${r.split(':')[0]}:${r.split(':')[1] ?? ''}`;
            if (!seen.has(k)) { seen.add(k); out.push(`${it.loc}:${r.slice(0, 60)}`); }
        }
    }
    return out;
}

/** 칸 길이 상한(SLOT_LENGTH_CEILING) — 프롬프트 없이 저장본만으로 되는 검사 */
export function lengthProblems(structured: unknown): string[] {
    const out: string[] = [];
    for (const it of collectLocaleStrings(structured, null)) {
        const ceil = narrativeLengthCeiling(it.path, it.loc) ?? SLOT_LENGTH_CEILING[it.loc];
        if (it.text.length > ceil) out.push(`length:${it.loc}:${it.path}:${it.text.length}>${ceil}`);
    }
    return out.slice(0, 4);
}

/** keyLevels 칸이 저장본에 같이 있는 입력 요약(macroSnapshot · 지표 값 · VIX 기간구조 · 지수 ETF 레벨 근거 줄)에 근거하나 — 근거 없는 칸 수 */
export function keyLevelGroundText(brief: any): string {
    const parts: string[] = [];
    if (typeof brief?.macroSnapshot === 'string') parts.push(brief.macroSnapshot);
    if (Array.isArray(brief?.macroIndicators)) for (const m of brief.macroIndicators) if (m && typeof m.value === 'number') parts.push(`${m.key}: ${m.value}`);
    const t = brief?.vixTermStructure;
    if (t && typeof t === 'object') parts.push(`VIX: ${t.vix} VIX3M: ${t.vix3m} VIX/VIX3M Ratio: ${t.ratio}`);
    if (typeof brief?.levelsSnapshot === 'string') parts.push(brief.levelsSnapshot);
    return parts.join(' | ');
}
export const ungroundedKeyLevels = (brief: any): number => groundKeyLevels(brief?.structured?.outlook?.keyLevels, keyLevelGroundText(brief)).dropped.length;

// ─────────────────────────────────────────────────────────────────────────────
// ① 생성 때 — 입력(프롬프트)까지 아는 자리
// ─────────────────────────────────────────────────────────────────────────────
export interface GenerationGuardInput {
    /** 출구 처리(음차 복원·keyLevels 정리)까지 끝난 최종 structured */
    brief: { structured: any; macroSnapshot?: string; macroIndicators?: any[]; vixTermStructure?: any; levelsSnapshot?: string; reportEvidence?: any };
    /** 모델이 본 입력(프롬프트 + system) — 금액 자릿수·숫자 대조의 원문 */
    source: string;
    provider: string;
    model: string;
    now?: Date;
}

export function buildGenerationGuard(i: GenerationGuardInput): BriefGuard {
    const s = i.brief.structured;
    const reasons: string[] = [];
    if (!(V4_SERVE_PROVIDERS as readonly string[]).includes(i.provider)) reasons.push(`provider:${i.provider}`);
    reasons.push(...shapeProblems(s));
    reasons.push(...lengthProblems(s));
    reasons.push(...closingReportProblems(i.brief));
    // 사다리 ①② 의 출구 가드와 같은 잣대(언어 혼입·거절·마크다운·연도·금액 자릿수) — 현행(legacy) 응답엔 사다리가 기록만 했으므로 여기서 다시 센다. 음차는 출구가 복원하므로 제외.
    const text = JSON.stringify(s ?? null);
    const ev = evaluateOutput({ purpose: 'CrossSector', locale: 'multi', text, source: i.source, expectJson: true, structured: true });
    reasons.push(...ev.reasons.filter((r) => !/transliterated/.test(r)));
    const nums = checkOutputNumbers(text, i.source);
    const list = nums.ungrounded.slice(0, 12).map((u) => u.raw);
    const distinct = new Set(nums.ungrounded.map((u) => u.value)).size;
    if (distinct > MAX_UNGROUNDED_DISTINCT) reasons.push(`numbers:${distinct}>${MAX_UNGROUNDED_DISTINCT}`);
    const dropped = ungroundedKeyLevels(i.brief);
    if (dropped) reasons.push(`keyLevels:${dropped}`);
    return {
        v: GUARD_VERSION, ok: reasons.length === 0, at: (i.now ?? new Date()).toISOString(),
        provider: i.provider, model: i.model, digest: briefDigest(s),
        numbers: { total: nums.total, ungrounded: nums.ungrounded.length, distinct, list },
        reasons: reasons.slice(0, 12),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 서빙 때 — 저장본만 아는 자리
// ─────────────────────────────────────────────────────────────────────────────
const etDate = (iso: string): string | null => {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;
};

export interface ServedVerdict { ok: boolean; reasons: string[] }

/** 저장된 v4 가 `dateStr`(키의 ET 날짜) 의 브리프로 나가도 되나 */
export function evaluateServedV4(brief: any, dateStr: string): ServedVerdict {
    const reasons: string[] = [];
    if (!brief || typeof brief !== 'object' || !brief.structured) return { ok: false, reasons: ['empty'] };
    // 같은 거래일 — 키의 날짜 = 저장본의 date = 생성 시각의 ET 날짜
    if (brief.date !== dateStr) reasons.push(`date:${brief.date ?? 'none'}!=${dateStr}`);
    const genDay = typeof brief.generatedAt === 'string' ? etDate(brief.generatedAt) : null;
    if (!genDay) reasons.push('generatedAt:invalid');
    else if (genDay !== dateStr) reasons.push(`generatedAt:${genDay}!=${dateStr}`);
    // 생성 때의 판정 기록 — 없으면(옛 v4) 검증 불가, 글이 바뀌었으면(해시 불일치) 무효
    const g: BriefGuard | undefined = brief.guard;
    if (!g || typeof g !== 'object') reasons.push('guard:none');
    else {
        if (g.v !== GUARD_VERSION) reasons.push(`guard:v${g.v}`);
        if (g.ok !== true) reasons.push(`guard:failed${g.reasons?.length ? `(${String(g.reasons[0]).slice(0, 40)})` : ''}`);
        if (!(V4_SERVE_PROVIDERS as readonly string[]).includes(String(g.provider))) reasons.push(`provider:${g.provider}`);
        if (g.digest !== briefDigest(brief.structured)) reasons.push('guard:digest-mismatch');
    }
    // 저장본만으로 다시 확인되는 검사
    reasons.push(...shapeProblems(brief.structured));
    reasons.push(...lengthProblems(brief.structured));
    reasons.push(...languageProblems(brief.structured));
    reasons.push(...closingReportProblems(brief));
    const dropped = ungroundedKeyLevels(brief);
    if (dropped) reasons.push(`keyLevels:${dropped}`);
    return { ok: reasons.length === 0, reasons: reasons.slice(0, 8) };
}

export interface SelectedBrief { source: BriefSource; date: string; brief: any; /** 같은 날 v4 가 있었지만 가드에서 탈락한 사유 */ v4Rejected?: string[] }

export const crossBriefKey = (v: 'v2' | 'v3' | 'v4', date: string): string => `postmarket:cross-brief-${v}:${date}`;

/** Lambda's new narrative uses the same content gates as v4, with its actual provider retained. */
function newLegacyProblems(brief: any, date: string): string[] {
    if (!brief?.reportEvidence && !brief?.structured?.closingNarrative) return [];
    const reasons = [...shapeProblems(brief.structured), ...lengthProblems(brief.structured), ...closingReportProblems(brief)];
    if (brief.date !== date || etDate(brief.generatedAt) !== date) reasons.push('narrative:date');
    if (typeof brief.reportSource !== 'string') return [...reasons, 'narrative:source'];
    const text = JSON.stringify(brief.structured);
    reasons.push(...evaluateOutput({ purpose: 'CrossSector', locale: 'multi', text, source: brief.reportSource, expectJson: true, structured: true }).reasons.filter(r => !/transliterated/.test(r)));
    if (new Set(checkOutputNumbers(text, brief.reportSource).ungrounded.map(u => u.value)).size > MAX_UNGROUNDED_DISTINCT) reasons.push('narrative:numbers');
    return reasons;
}

/**
 * 서빙할 브리프 고르기 — 날짜는 최신순(`dates[0]` = 오늘 ET). 같은 날 안에서는 v4(가드 통과) → v3 → v2.
 * 날짜가 우선이다: 오늘 v3 가 있으면 어제 v4 보다 먼저 나간다(v4 는 «같은 거래일»일 때만 v3 를 앞선다).
 * v4·v3 는 함께 읽는다(왕복 한 번) — v4 가 없어도 v3 읽기가 늦어지지 않는다.
 */
export async function selectServedBrief(read: (key: string) => Promise<any>, dates: string[], log: (msg: string) => void = () => {}): Promise<SelectedBrief | null> {
    for (const date of dates) {
        const [v4, v3] = await Promise.all([read(crossBriefKey('v4', date)), read(crossBriefKey('v3', date))]);
        let v4Rejected: string[] | undefined;
        if (v4) {
            const verdict = evaluateServedV4(v4, date);
            if (verdict.ok) return { source: 'v4', date, brief: v4 };
            v4Rejected = verdict.reasons;
            log(`v4 ${date} 서빙 가드 탈락 → v3: ${verdict.reasons.join(', ')}`);
        }
        if (v3 && !newLegacyProblems(v3, date).length) return { source: 'v3', date, brief: v3, ...(v4Rejected ? { v4Rejected } : {}) };
        const v2 = await read(crossBriefKey('v2', date));
        if (v2 && !newLegacyProblems(v2, date).length) return { source: 'v2', date, brief: v2, ...(v4Rejected ? { v4Rejected } : {}) };
    }
    return null;
}

/** 응답에 싣는 모양 — 내부 판정 기록(guard)은 요약만, 나머지는 저장본 그대로(웹·앱이 읽는 필드 불변) + source */
export function toServedPayload(sel: SelectedBrief): Record<string, any> {
    // v4 는 서빙 가드가 keyLevels 근거를 이미 요구했으니 그대로, v3·v2 는 예전처럼 입력에 없는 칸을 걸러 내보낸다(lib/ai/keyLevels sanitizeServedBrief)
    const base = sel.source === 'v4' ? sel.brief : sanitizeServedBrief(sel.brief || {}).brief;
    const { guard, reportSource: _source, reportEvidence: _evidence, sectorInputs: _sectors, ...rest } = base || {};
    const out: Record<string, any> = { ...rest, source: sel.source };
    if (sel.source === 'v4' && guard) out.generatedBy = { provider: guard.provider, model: guard.model };
    if (sel.v4Rejected?.length) out.v4Rejected = sel.v4Rejected;
    return out;
}
