/**
 * ★2026-10-31 Tactical «왜» 재료 — 대표 10/31 «UC 는 금리 인상 확률 72%·긴축 우려·공포 구간을 아는데 Tactical 은 "재료 확인 안 됨" + 지표 나열.
 *   소재를 지표로 풀어내서 시장이 왜 이렇게 돌아가는지 보고 바로 알 수 있게».
 *
 * 원인(10/30 장후 실측): Tactical 프롬프트의 원인 재료는 «오늘 시장 헤드라인»뿐이었고(그마저 거시 낱말 필터에 12건 중 1건만 통과),
 *   UC «지금 매크로 기류»가 쓰는 FedWatch 다음 FOMC 확률·10년물 변화·공포탐욕은 Tactical 에 아예 없었다(OBSERVATIONS 에 10년물 수준만).
 *
 * 여기서 하는 일(순수 함수 — 새 외부 호출 0, 이미 저장된 값만):
 *   · FedWatch(Redis fedwatch:latest·1주 전 기준 fedwatch:weekago:v1 — /api/guardian/fedwatch 와 같은 저장본)
 *   · 미국 10년물 수준·변화(bp)·2년물 수준(코어 macro — 화면 값과 같은 원본)
 *   · 공포·탐욕(CNN, RLSI 구성요소 — VIX 대체값이면 쓰지 않는다)
 *   · 섹터 등락 상위·하위 1개(코어 섹터 · 순환매 5일 표의 «그 세션» 등락과 날짜 — 세션 날짜를 붙여 «오늘»로 오독하지 않게)
 *   · 오늘의 시장 원인 기사(뉴스 펄스 보관본 — 이미 저장된 AI 요약, 거시·시장·지정학 + 시장 전체 기사만)
 * 값이 없거나 낡으면 그 칸을 «빼고»(0 으로 메우지 않는다), 전부 없으면 undefined — 프롬프트는 예전과 같은 «재료 없음» 경로로 간다.
 */
import { isTacticalCauseHeadline, isCompanyLedTitle } from './tacticalNews';
import { etDateOf } from '@/lib/marketCalendar';
import { textIntegrityReasons } from './textIntegrity';

export interface TacticalFedwatch {
    /** 다음 FOMC 인상·동결·인하 확률(%) */
    hike: number; hold: number; cut: number;
    /** 1주 전 인상 확률(없으면 null — 0 으로 메우지 않는다) */
    weekAgoHike: number | null;
    /** 스크랩 시각(ISO) */
    at: string;
}

/** FedWatch 저장본은 평일 4~7회 스크랩 — 주말(금 밤~월 아침)을 넘기는 96시간까지만 «지금 시장이 반영한 값»으로 쓴다 */
export const FEDWATCH_MAX_AGE_MS = 96 * 3600_000;
const WEEK_MS = 7 * 24 * 3600_000;
const WEEK_MAX_AGE_MS = 12 * 24 * 3600_000;

const pct = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);

export function tacticalFedwatchFrom(latest: any, weekAgo: any, nowMs: number): TacticalFedwatch | null {
    if (!latest || typeof latest !== 'object') return null;
    const hike = pct(latest.hike), hold = pct(latest.noChange), cut = pct(latest.ease);
    if (hike === null || hold === null || cut === null || hike + hold + cut <= 0) return null;
    const atRaw = typeof latest.scrapedAt === 'string' ? latest.scrapedAt : typeof latest.storedAt === 'string' ? latest.storedAt : '';
    const at = Date.parse(atRaw);
    if (!Number.isFinite(at) || at > nowMs + 5 * 60_000 || nowMs - at > FEDWATCH_MAX_AGE_MS) return null;
    let weekAgoHike: number | null = null;
    if (weekAgo && typeof weekAgo === 'object' && !weekAgo.none) {
        const wHike = pct(weekAgo.hike), wHold = pct(weekAgo.noChange), wCut = pct(weekAgo.ease);
        const wAt = Date.parse(String(weekAgo.at ?? ''));
        // «1주 전»은 지금 기준 7~12일 전 행만 — 화면 FedWatch 카드(/api/guardian/fedwatch 의 weekAgoFromRow)와 같은 창·같은 기준 시각
        if (wHike !== null && wHold !== null && wCut !== null && wHike + wHold + wCut > 0 && Number.isFinite(wAt)
            && nowMs - wAt >= WEEK_MS - 60_000 && nowMs - wAt <= WEEK_MAX_AGE_MS && wAt < at) weekAgoHike = wHike;
    }
    return { hike, hold, cut, weekAgoHike, at: new Date(at).toISOString() };
}

export interface TacticalSectorMove { en: string; etf: string; chgPct: number }
export interface TacticalMacroDrivers {
    fedwatch?: { nextFomcHikePct: number; nextFomcHoldPct: number; nextFomcCutPct: number; weekAgoHikePct?: number };
    us10y?: { levelPct: number; changeBp?: number };
    us2y?: { levelPct: number };
    fearGreed?: { score: number; zone: 'extreme fear' | 'fear' | 'neutral' | 'greed' | 'extreme greed' };
    sectors?: { sessionDate: string; live?: boolean; leaders: TacticalSectorMove[]; laggards: TacticalSectorMove[] };
}

export interface DriverInput {
    fedwatch?: TacticalFedwatch | null;
    us10yLevel?: number | null;
    us10yChangeBp?: number | null;
    /** 10년물 원천이 낡음 표시면 수준·변화 모두 뺀다 */
    us10yStale?: boolean;
    us2yLevel?: number | null;
    fearGreedScore?: number | null;
    /** RLSI 구성요소의 출처 — «CNN F&G: …» 일 때만 공포·탐욕으로 쓴다(VIX 대체값은 공포탐욕 지수가 아니다) */
    fearGreedSource?: string | null;
    /** 코어 섹터(id·name(한국어)·change) */
    sectors?: Array<{ id?: string; name?: string; change?: number }> | null;
    /** 순환매 5일 표 — 섹터별 «그 세션» 등락(todayChange)과 날짜(asOf) */
    fiveDay?: Record<string, { todayChange?: number; asOf?: string }> | null;
    /** 섹터 이름 한국어 → 영어(sectorLabels.SECTOR_NAME_EN) */
    sectorNameEn?: (ko: string) => string;
    /** 지금 세션 — 섹터 등락의 «어느 세션» 판정에 쓴다 */
    session?: string;
    /** 직전(또는 지금) 정규장 날짜 — INDEX_FACTS 현물의 sessionDate */
    cashSessionDate?: string | null;
    nowMs?: number;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function fearGreedZone(s: number): NonNullable<TacticalMacroDrivers['fearGreed']>['zone'] {
    // CNN 구간(0–24 extreme fear · 25–44 fear · 45–55 neutral · 56–75 greed · 76–100 extreme greed)
    return s < 25 ? 'extreme fear' : s < 45 ? 'fear' : s <= 55 ? 'neutral' : s <= 75 ? 'greed' : 'extreme greed';
}

export function tacticalMacroDrivers(input: DriverInput): TacticalMacroDrivers | undefined {
    const out: TacticalMacroDrivers = {};
    const fw = input.fedwatch;
    if (fw) {
        out.fedwatch = { nextFomcHikePct: r1(fw.hike), nextFomcHoldPct: r1(fw.hold), nextFomcCutPct: r1(fw.cut),
            ...(fw.weekAgoHike !== null && finite(fw.weekAgoHike) ? { weekAgoHikePct: r1(fw.weekAgoHike) } : {}) };
    }
    if (!input.us10yStale && finite(input.us10yLevel) && input.us10yLevel > 0 && input.us10yLevel < 20) {
        out.us10y = { levelPct: r2(input.us10yLevel), ...(finite(input.us10yChangeBp) && Math.abs(input.us10yChangeBp) < 100 ? { changeBp: Math.round(input.us10yChangeBp) } : {}) };
    }
    if (finite(input.us2yLevel) && input.us2yLevel > 0 && input.us2yLevel < 20) out.us2y = { levelPct: r2(input.us2yLevel) };
    if (finite(input.fearGreedScore) && input.fearGreedScore >= 0 && input.fearGreedScore <= 100 && /^CNN F&G/i.test(String(input.fearGreedSource || ''))) {
        out.fearGreed = { score: Math.round(input.fearGreedScore), zone: fearGreedZone(input.fearGreedScore) };
    }
    // 섹터: ETF 티커가 있는 섹터만(AI_PWR·SAFE_HAVEN 같은 내부 묶음 id 는 글에 새지 않게).
    //   섹터 change 는 «지금 값»이고 5일 표의 asOf 는 «마지막 일봉 날짜»라, 세션마다 날짜를 다르게 단다:
    //   REG = 오늘(장중 진행 중) · POST/CLOSED = 5일 표 날짜가 직전 정규장 날짜와 같을 때만 그 날짜 · PRE = 쓰지 않는다(장전 값의 기준이 섞인다).
    const session = input.session;
    const nowMs = input.nowMs ?? Date.now();
    const sessionDate = session === 'REG' ? etDateOf(nowMs)
        : (session === 'POST' || session === 'CLOSED') && input.cashSessionDate ? input.cashSessionDate : null;
    const rows = !sessionDate ? [] : (input.sectors || []).flatMap(s => {
        const id = String(s?.id || '');
        const day = input.fiveDay?.[id];
        if (!/^[A-Z]{2,5}$/.test(id) || !finite(s?.change)) return [];
        if (session !== 'REG' && (!day || day.asOf !== sessionDate)) return [];
        const en = input.sectorNameEn ? input.sectorNameEn(String(s.name || '')) : String(s.name || '');
        if (!en || /[^\x20-\x7E]/.test(en)) return [];
        return [{ en, etf: id, chgPct: r1(s.change as number) }];
    }).sort((a, b) => b.chgPct - a.chgPct);
    if (sessionDate && rows.length >= 4) {
        // 상위·하위 한 개씩 — 두 개씩 주면 WHY 한 문장에 숫자가 여섯 개까지 늘어 나열이 된다(10/31 실모델 6/6회 «숫자 나열» 탈락)
        const leaders = rows.slice(0, 1).filter(r => r.chgPct > 0);
        const laggards = rows.slice(-1).filter(r => r.chgPct < 0);
        if (leaders.length || laggards.length) out.sectors = { sessionDate, ...(session === 'REG' ? { live: true } : {}), leaders, laggards };
    }
    return Object.keys(out).length ? out : undefined;
}

/** 뉴스 펄스 보관 항목(필요한 칸만) */
export interface CauseArchiveItem { summaryEN?: string; category?: string; urgency?: number; publishedAt?: string }
const CAUSE_QUOTA: Record<string, number> = { MACRO: 2, GEOPOLITICAL: 1, US_MARKET: 3 };
const fmtEt = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

/**
 * 오늘(ET)·지금 이전에 발행된 «시장 원인» 보관 기사 — 거시 2 · 지정학 1 · 시장 3(긴급도 7 이상, 긴급도→최신 순).
 *   코어 뉴스는 «최신 12건»이라 저녁이면 그날 낮의 원인 기사(실적·연준 발언·유가)가 장 마감 기사에 밀려 사라진다(10/30 실측).
 *   줄 모양은 datedHeadline 과 같다: «[NEWS PULSE; ISO; HH:MM ET] 요약» — 생성 검사의 보도 인용 대조가 그대로 읽는다.
 */
export function causeNewsFromArchive(items: readonly CauseArchiveItem[] | null | undefined, nowMs: number, cap = 6): string[] {
    const today = etDateOf(nowMs);
    const picked: string[] = [];
    for (const [cat, quota] of Object.entries(CAUSE_QUOTA)) {
        const rows = (items || []).flatMap(it => {
            const ms = Date.parse(String(it?.publishedAt || ''));
            const text = String(it?.summaryEN || '').replace(/\s+/g, ' ').trim();
            if (it?.category !== cat || !finite(it.urgency) || it.urgency < 7 || !Number.isFinite(ms) || ms > nowMs || etDateOf(ms) !== today) return [];
            if (!text || text.length < 20 || isCompanyLedTitle(text) || !isTacticalCauseHeadline(text) || /[^\x20-\x7E‘’“”–—€£¥…]/.test(text)) return [];
            const line = `[NEWS PULSE; ${new Date(ms).toISOString()}; ${fmtEt(ms)} ET] ${text.slice(0, 200)}`;
            return textIntegrityReasons(line).length ? [] : [{ ms, u: it.urgency, line }];
        }).sort((a, b) => b.u - a.u || b.ms - a.ms);
        const seen = new Set<string>();
        for (const r of rows) {
            const key = r.line.replace(/^\[[^\]]*\]\s*/, '').toLowerCase().slice(0, 40);
            if (seen.has(key)) continue;
            seen.add(key);
            picked.push(r.line);
            if (seen.size >= quota) break;
        }
    }
    return picked.sort((a, b) => (a < b ? 1 : -1)).slice(0, cap);
}

/** 원인 기사 합치기 — 지금 헤드라인(시장 원인만) + 보관 기사, 같은 기사 제거, 최신 먼저, 상한 cap */
export function mergeCauseNews(current: readonly string[], archive: readonly string[], cap = 8): string[] {
    const out: string[] = [];
    const keys = new Set<string>();
    const isoOf = (l: string) => l.match(/^\[[^\];]+; (\d{4}-\d\d-\d\dT[^\];]+)[;\]]/)?.[1] || '';
    for (const l of [...current.filter(isTacticalCauseHeadline), ...archive].sort((a, b) => (isoOf(a) < isoOf(b) ? 1 : -1))) {
        const k = l.replace(/^\[[^\]]*\]\s*/, '').split(' — ')[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 36);
        if (!k || keys.has(k)) continue;
        keys.add(k);
        out.push(l);
        if (out.length >= cap) break;
    }
    return out;
}

/** 프롬프트 줄(언어별) — 섹터 이름은 그 언어 이름만(한 호출 3언어에서 다른 언어 글자가 새지 않게, sectorLabels 머리말) */
export function driversForPrompt(d: TacticalMacroDrivers | undefined, locale: 'ko' | 'en' | 'ja', localName: (en: string, l: 'ko' | 'ja') => string | undefined): Record<string, unknown> | null {
    if (!d) return null;
    const name = (en: string) => (locale === 'en' ? en : localName(en, locale) ?? en);
    const sec = d.sectors ? {
        [d.sectors.live ? 'todaySoFar' : 'cashSessionDate']: d.sectors.sessionDate,
        leaders: d.sectors.leaders.map(s => ({ sector: name(s.en), etf: s.etf, chgPct: s.chgPct })),
        laggards: d.sectors.laggards.map(s => ({ sector: name(s.en), etf: s.etf, chgPct: s.chgPct })),
    } : undefined;
    const fw = d.fedwatch ? { 'next FOMC rate pricing (FedWatch, Fed funds futures)': { hikePct: d.fedwatch.nextFomcHikePct, holdPct: d.fedwatch.nextFomcHoldPct, cutPct: d.fedwatch.nextFomcCutPct,
        ...(d.fedwatch.weekAgoHikePct !== undefined ? { hikePctOneWeekAgo: d.fedwatch.weekAgoHikePct } : {}) } } : {};
    return {
        ...fw,
        ...(d.us10y ? { 'US 10-year Treasury yield': { levelPct: d.us10y.levelPct, ...(d.us10y.changeBp !== undefined ? { changeBpVsPreviousClose: d.us10y.changeBp } : {}) } } : {}),
        ...(d.us2y ? { 'US 2-year Treasury yield': { levelPct: d.us2y.levelPct } } : {}),
        ...(d.fearGreed ? { 'CNN Fear & Greed index': { score: d.fearGreed.score, zone: d.fearGreed.zone } } : {}),
        ...(sec && (sec.leaders.length || sec.laggards.length) ? { [d.sectors?.live ? 'sector moves (current cash session, vs previous close)' : 'sector moves (that completed cash session)']: sec } : {}),
    };
}
