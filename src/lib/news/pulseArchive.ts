// ============================================================================
// 뉴스 펄스 «보관본» (2026-10-13, 대표 10/13 «해석까지 붙은 자료를 날리는 것보다 모아서 볼 수 있으면 더 좋지 않을까»)
// ----------------------------------------------------------------------------
// 왜: 뉴스 펄스 카드는 «최신 10개»만 돌려 보여 준다(guardian:news:digest:v2). 15분마다 새 항목이 들어오면 옛 항목은
//   (a) 10개를 넘어 밀리거나 (b) 18시간이 지나 사라진다 — 돈을 들여 만든 AI 해석이 그대로 버려졌다.
//
// 이 모듈이 하는 일: 다이제스트를 «저장하는 그 자리»(app/api/guardian/news-digest)에서, AI 해석이 달린 항목을
//   뉴욕(ET) 날짜별 문서 하나(newsarchive:v1:YYYY-MM-DD)에 합쳐 둔다. 새 AI 호출·공급사 호출은 0 —
//   이미 만들어진 항목을 한 번 더 저장할 뿐이다. 읽는 쪽(GET /api/guardian/news-archive)은 저장본만 읽는다.
//
// 키 이름 주의 — «guardian:» 접두사를 쓰지 않는다. services/redisClient 의 REPLICATE_PREFIXES 가 /^guardian:/ 를
//   Upstash 로 복제하는데, 하루치 문서는 100~300KB 이고 15분마다 다시 쓰인다(Upstash 쓰기·대역폭 비용).
//   newsarchive: 는 복제 접두사 밖 → EC2(ElastiCache) 전용, EC2 가 정상인 동안 Upstash 명령 0
//   (EC2 쓰기가 실패한 때만 예전 규칙대로 Upstash 가 받는다). 같은 규칙으로 todaypicks: 키가 이미 돈다.
//   읽기 실패·키 유실의 결과는 «보관본이 비어 보임»뿐이다 — API 가 지금 다이제스트 항목으로 대신 채운다(빈 화면 없음).
//
// 창: 최근 48시간(기사 발행 시각 기준). 카드의 «전체 보기 · n»과 전체 화면이 같은 창·같은 규칙으로 센다.
// ============================================================================
import { getFromCache, setInCache } from '@/services/redisClient';
import { archiveIdentityKey, newsFocusKey } from './pulseIdentity';
export { titleKey } from './pulseIdentity';

export const ARCHIVE_KEY_PREFIX = 'newsarchive:v1:';
/** 하루 문서 수명 — 창(48시간)보다 넉넉히. 오래된 날은 TTL 로 사라진다 */
export const ARCHIVE_TTL_SEC = 5 * 24 * 3600;
export const ARCHIVE_WINDOW_MS = 48 * 3600_000;
/** 하루 문서에 담는 최대 항목 수(가장 최근 것부터) — 15분마다 새 5건씩이면 하루 많아야 수십 건이라 넉넉한 상한 */
export const ARCHIVE_DAY_CAP = 160;
/** API 가 한 번에 돌려주는 최대 항목 수 */
export const ARCHIVE_RETURN_CAP = 120;
/** 카드가 읽는 지금 다이제스트(보관본이 비었을 때 API 가 대신 쓴다) */
export const DIGEST_REDIS_KEY = 'guardian:news:digest:v2';

export type ArchiveLocale = 'ko' | 'ja' | 'en';
export type ArchiveCounts = Record<ArchiveLocale, number>;

/** 다이제스트 항목(route.ts 의 NewsDigestItem 과 같은 모양 — 필요한 칸만) */
export interface DigestLikeItem {
    id: string;
    headline?: string;
    summaryKR?: string; summaryEN?: string; summaryJP?: string;
    analysisKR?: string; analysisEN?: string; analysisJP?: string;
    category?: string;
    impact?: string;
    urgency?: number;
    source?: string;
    publishedAt?: string;
    _rawTitleKey?: string;
}

/** 보관하는 한 항목 — 3개 언어를 다 담고(응답 직전에 언어를 거른다), 화면에 안 쓰는 칸은 뺀다 */
export interface ArchiveItem {
    id: string;
    /** 같은 기사 중복 제거 키(원문 제목 키 → 없으면 헤드라인 키 → 없으면 id) */
    k: string;
    summaryKR: string; summaryEN: string; summaryJP: string;
    analysisKR: string; analysisEN: string; analysisJP: string;
    category: string;
    impact: string;
    urgency: number;
    source: string;
    publishedAt: string;
}

export interface ArchiveDoc { v: 1; day: string; items: ArchiveItem[]; at: string }

/** API 가 화면에 주는 한 항목(요청한 언어 하나만) */
export interface LeanItem {
    id: string;
    focusKey: string;
    summary: string;
    analysis: string;
    category: string;
    impact: string;
    urgency: number;
    source: string;
    publishedAt: string;
}

// ── 순수 함수 ────────────────────────────────────────────────────────────────

const HAS_KO = /[가-힣]/;
const HAS_JA = /[ぁ-ゟ゠-ヿ]/;   // 가나 — 일본어엔 항상 있고 영어·한국어엔 없다

/** 그 언어로 읽을 수 있는 요약이 있는가 — 틀린 언어로 «조용히 대체»하지 않는다(route.ts readableIn 과 같은 규칙) */
export function readableIn(it: Pick<ArchiveItem, 'summaryKR' | 'summaryEN' | 'summaryJP'>, locale: ArchiveLocale): boolean {
    if (locale === 'ko') return HAS_KO.test(it.summaryKR || '');
    if (locale === 'ja') return HAS_JA.test(it.summaryJP || '');
    return !!(it.summaryEN || '').trim();
}

export function normLocale(raw: string | null | undefined): ArchiveLocale {
    const l = String(raw || 'en').toLowerCase();
    return l.startsWith('ko') ? 'ko' : l.startsWith('ja') ? 'ja' : 'en';
}

/** 뉴욕(ET) 달력 날짜 — 'YYYY-MM-DD'. 날짜 문서의 이름이다 */
export function etDay(t: number | string | Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

/** 48시간 창이 걸치는 ET 날짜들(최대 3개, 최신 먼저). 12시간 간격으로 훑어 서머타임 경계에서도 빠지지 않게 */
export function windowDays(now: number): string[] {
    const out: string[] = [];
    for (let h = 0; h <= 48; h += 12) {
        const d = etDay(now - h * 3600_000);
        if (!out.includes(d)) out.push(d);
    }
    return out;
}

/**
 * 다이제스트 항목 → 보관 항목. 보관 대상이 아니면 null.
 *  · AI 해석이 하나도 없는 항목(AI 실패 후 원문으로 채운 것)은 «해석본»이 아니라 보관하지 않는다.
 *  · 한국어도 일본어도 번역되지 않은 항목은 뺀다(다이제스트가 «translated»로 거르는 규칙과 같다 — 영어 원문만 든 항목 방지).
 *  · 발행 시각이 없거나 읽을 수 없으면 뺀다.
 */
export function toArchiveItem(src: DigestLikeItem): ArchiveItem | null {
    if (!src || !src.id) return null;
    const publishedAt = String(src.publishedAt || '');
    if (!Number.isFinite(Date.parse(publishedAt))) return null;
    const analysisAny = [src.analysisKR, src.analysisEN, src.analysisJP].some((x) => (x || '').trim().length > 0);
    if (!analysisAny) return null;
    const translated = HAS_KO.test(src.summaryKR || '') || HAS_JA.test(src.summaryJP || '');
    if (!translated) return null;
    const k = archiveIdentityKey(src);
    return {
        id: String(src.id),
        k,
        summaryKR: src.summaryKR || '', summaryEN: src.summaryEN || '', summaryJP: src.summaryJP || '',
        analysisKR: src.analysisKR || '', analysisEN: src.analysisEN || '', analysisJP: src.analysisJP || '',
        category: src.category || 'US_MARKET',
        impact: src.impact || 'NEUTRAL',
        urgency: Number.isFinite(src.urgency) ? Number(src.urgency) : 3,
        source: src.source || '',
        publishedAt: new Date(publishedAt).toISOString(),
    };
}

/**
 * 하루 문서에 새 항목을 합친다 — 같은 기사(id 또는 k 가 같은 것)는 «먼저 저장된 것»을 남기고, 발행 시각 내림차순으로 cap 개.
 * 입력은 바꾸지 않는다.
 */
export function mergeDay(existing: ArchiveItem[], incoming: ArchiveItem[], cap: number = ARCHIVE_DAY_CAP): ArchiveItem[] {
    const seen = new Set<string>();
    const out: ArchiveItem[] = [];
    for (const it of [...existing, ...incoming]) {
        if (!it || seen.has(`i:${it.id}`) || seen.has(`k:${it.k}`)) continue;
        seen.add(`i:${it.id}`);
        seen.add(`k:${it.k}`);
        out.push(it);
    }
    out.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || (a.id < b.id ? -1 : 1));
    return out.slice(0, cap);
}

/** 창 안(now−48시간 이후 발행) 항목만 — 여러 날 문서를 합칠 때 중복도 제거한다. 최신 먼저 */
export function inWindow(items: ArchiveItem[], now: number): ArchiveItem[] {
    const from = now - ARCHIVE_WINDOW_MS;
    const live = items.filter((it) => {
        const t = Date.parse(it.publishedAt);
        return Number.isFinite(t) && t >= from && t <= now + 3600_000;
    });
    return mergeDay([], live, Number.POSITIVE_INFINITY);
}

/** 언어별 «읽을 수 있는 항목 수» — 카드의 «전체 보기 · n» */
export function countsFor(items: ArchiveItem[]): ArchiveCounts {
    return {
        ko: items.filter((it) => readableIn(it, 'ko')).length,
        ja: items.filter((it) => readableIn(it, 'ja')).length,
        en: items.filter((it) => readableIn(it, 'en')).length,
    };
}

/** 화면에 주는 모양(요청한 언어 하나) */
export function toLean(it: ArchiveItem, locale: ArchiveLocale): LeanItem {
    const [summary, analysis] = locale === 'ko' ? [it.summaryKR, it.analysisKR]
        : locale === 'ja' ? [it.summaryJP, it.analysisJP]
            : [it.summaryEN, it.analysisEN];
    return {
        id: it.id, focusKey: newsFocusKey(it), summary: summary || '', analysis: analysis || '', category: it.category, impact: it.impact,
        urgency: it.urgency, source: it.source, publishedAt: it.publishedAt,
    };
}

// ── 저장·읽기(레디스) ────────────────────────────────────────────────────────

const keyOf = (day: string) => `${ARCHIVE_KEY_PREFIX}${day}`;

async function readDocs(days: string[]): Promise<Array<ArchiveDoc | null>> {
    return Promise.all(days.map((d) => getFromCache<ArchiveDoc>(keyOf(d)).catch(() => null)));
}

const docItems = (doc: ArchiveDoc | null): ArchiveItem[] =>
    (doc && Array.isArray(doc.items) ? doc.items : []).filter((it) => it && typeof it.id === 'string' && typeof it.publishedAt === 'string');

/**
 * 다이제스트 항목을 보관한다. 다이제스트를 저장할 때마다 «지금 가진 모든 항목»을 넘긴다(이미 있는 것은 그대로 — 멱등).
 * 반환: 창 안 항목 수(언어별) — 다이제스트에 실어 카드가 «전체 보기 · n»을 읽는다.
 * 실패해도 던지지 않는다(호출자가 다이제스트 저장을 막지 않게) — 대신 null.
 */
export async function saveToPulseArchive(
    items: DigestLikeItem[],
    now: number = Date.now(),
): Promise<{ counts: ArchiveCounts; written: number } | null> {
    try {
        const days = windowDays(now);
        const dayIdx = new Set(days);
        const incoming = items.map(toArchiveItem).filter((x): x is ArchiveItem => !!x);
        const byDay = new Map<string, ArchiveItem[]>();
        for (const it of incoming) {
            const d = etDay(it.publishedAt);
            if (!dayIdx.has(d)) continue;           // 창 밖 날짜는 저장하지 않는다
            (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(it);
        }
        const docs = await readDocs(days);
        let written = 0;
        const all: ArchiveItem[] = [];
        for (let i = 0; i < days.length; i++) {
            const day = days[i];
            const existing = docItems(docs[i]);
            const add = byDay.get(day) ?? [];
            const merged = add.length ? mergeDay(existing, add) : existing;
            const changed = add.length > 0 && (merged.length !== existing.length || merged.some((m, j) => m.id !== existing[j]?.id));
            if (changed) {
                const doc: ArchiveDoc = { v: 1, day, items: merged, at: new Date(now).toISOString() };
                const ok = await setInCache(keyOf(day), doc, ARCHIVE_TTL_SEC).catch(() => false);
                if (ok) written++;
            }
            all.push(...merged);
        }
        return { counts: countsFor(inWindow(all, now)), written };
    } catch (e) {
        console.warn('[PulseArchive] save failed:', e);
        return null;
    }
}

/** 창(48시간) 안의 보관 항목 — 최신 먼저. 저장본뿐 읽는다 */
export async function readPulseArchive(now: number = Date.now()): Promise<ArchiveItem[]> {
    const docs = await readDocs(windowDays(now));
    return inWindow(docs.flatMap(docItems), now);
}
