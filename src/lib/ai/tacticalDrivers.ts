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
import { valueTokens } from './claimChecks';
import { SECTOR_NAME_EN, SECTOR_NAME_JA, SECTOR_ETF_KO, SECTOR_NAME_ALIASES } from './sectorLabels';
/** 섹터 이름(한·일) → 영어 — 재료 줄의 현지어 이름과 영어 이름을 같은 섹터로 본다 */
const SECTOR_EN_OF: Readonly<Record<string, string>> = { ...SECTOR_NAME_EN, ...Object.fromEntries(Object.entries(SECTOR_NAME_JA).map(([en, ja]) => [ja, en])) };

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
    /** 순환매 5일 표 — 섹터별 일봉 전일 대비 등락(changes, 마지막 = asOf 일봉)과 날짜(asOf). todayChange 는 코어 change 사본이라 쓰지 않는다 */
    fiveDay?: Record<string, { todayChange?: number; asOf?: string; changes?: number[] }> | null;
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
        if (!/^[A-Z]{2,5}$/.test(id)) return [];
        if (session !== 'REG' && (!day || day.asOf !== sessionDate)) return [];
        // 등락 값의 기준을 날짜와 맞춘다(관문 10311057 ①): REG = 코어 change(지금 장중) · POST/CLOSED = 그 날짜 일봉의 전일 대비(5일 표 changes 의 마지막).
        //   코어 change 는 장외에 «마지막 세션 등락» 조회가 실패하거나 그 ETF 가 빠지면 스냅샷 계산(장외 ≈0%)으로 대체된다 — 날짜만 맞고 값은 다른 기준이 될 수 있다.
        //   일봉 등락이 없으면 그 섹터를 뺀다(0 으로 메우지 않는다).
        const last = Array.isArray(day?.changes) && day!.changes!.length ? day!.changes![day!.changes!.length - 1] : undefined;
        const chg = session === 'REG' ? s?.change : last;
        if (!finite(chg)) return [];
        const en = input.sectorNameEn ? input.sectorNameEn(String(s.name || '')) : String(s.name || '');
        if (!en || /[^\x20-\x7E]/.test(en)) return [];
        return [{ en, etf: id, chgPct: r1(chg) }];
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

/* ────────────────────────────────────────────────────────────────────────────
 * ★2026-10-31 관문 10311015 — 재료 숫자는 «그 지표의 값»이어야 한다(지표별 대조).
 *   전체 숫자 대조(depthNumbers)는 «입력 어딘가에 있는 숫자»만 본다 → «인상 확률 26%»(26 = 공포탐욕) · «공포·탐욕 72»(72 = 확률)
 *   · «10년물 금리 30.8%»(30.8 = RLSI)가 통과했다. 여기서는 지표 이름이 나온 자리마다 그 바로 뒤(영어는 바로 앞도) 숫자를
 *   그 지표의 입력 값과 쓴 자릿수로 반올림해 대조하고, 방향어(상승·하락)는 입력 변화량의 부호와 대조한다.
 *   지표 이름이 없는 숫자·모르는 모양은 판정하지 않는다(기존 검사가 맡는다).
 * ──────────────────────────────────────────────────────────────────────────── */

interface DriverSpec { id: string; re: RegExp; values: Array<{ v: number; unit: 'pct' | 'bp' | 'any' }>; change?: number | null; sign?: number; prob?: boolean; hold?: number; cut?: number; week?: number | null; zone?: string; names?: string[]; others?: string[] }
const PROB_RE = /(?:금리\s*)?(?:인상|동결|인하)\s*확률|확률|chance of a (?:rate )?(?:hike|hold|cut)|(?:hike|hold|cut|rate[- ]hike) (?:odds|probability|chance)|(?:利上げ|据え置き|利下げ)(?:の)?確率|確率|FedWatch/gi;
const DIR_UP = /상승|올라|올랐|오른|오르|높아|뛰었|뛰어|뛰며|급등|늘어|반등|\b(?:rose|risen|rising|rises|up|higher|climb\w*|jump\w*|surg\w*|increas\w*|gain\w*)\b|上昇|上が|高ま|跳ね上が|急上昇/i;
const DIR_DOWN = /하락|내려|내렸|내린|낮아|떨어|밀려|밀리|급락|줄어|\b(?:fell|fallen|falling|falls|down|lower|declin\w*|drop\w*|slid|slipp\w*|decreas\w*|eased)\b|下落|低下|下が|急低下/i;

function specsFrom(drivers: string, observations: string): DriverSpec[] {
    let d: Record<string, any> = {}, o: Record<string, any> = {};
    try { d = drivers ? JSON.parse(drivers) || {} : {}; } catch { d = {}; }
    try { o = observations ? JSON.parse(observations) || {} : {}; } catch { o = {}; }
    const out: DriverSpec[] = [];
    const fw = d['next FOMC rate pricing (FedWatch, Fed funds futures)'];
    if (fw && finite(fw.hikePct)) {
        const week = finite(fw.hikePctOneWeekAgo) ? fw.hikePctOneWeekAgo : null;
        // 인상·동결·인하는 이름으로 가른다(«인상 확률 28%»(28 = 동결) 통과 방지) — 1주 전 값은 인상에만 있다
        out.push({ id: 'fedwatch', re: PROB_RE, prob: true, values: [{ v: fw.hikePct, unit: 'pct' }],
            change: week !== null ? fw.hikePct - week : null, hold: fw.holdPct, cut: fw.cutPct, week });
    }
    const y10 = d['US 10-year Treasury yield'];
    const lvl10 = finite(y10?.levelPct) ? y10.levelPct : finite(o.us10y) ? o.us10y : null;
    const chg10 = finite(y10?.changeBpVsPreviousClose) ? y10.changeBpVsPreviousClose : finite(o.us10yChangeBp) ? o.us10yChangeBp : null;
    if (lvl10 !== null) out.push({ id: 'us10y', re: /10\s?년물|10[- ]?year|10年(?:債|物)/gi, values: [{ v: lvl10, unit: 'pct' }, ...(chg10 !== null ? [{ v: chg10, unit: 'bp' as const }] : [])], change: chg10 });
    const y2 = d['US 2-year Treasury yield'];
    if (finite(y2?.levelPct)) out.push({ id: 'us2y', re: /(?<!\d)2\s?년물|(?<!\d)2[- ]?year|(?<!\d)2年(?:債|物)/gi, values: [{ v: y2.levelPct, unit: 'pct' }], change: null });   // 2년물 변화는 입력에 없다 — 변화 서술은 탈락
    const fg = d['CNN Fear & Greed index'];
    const fgScore = finite(fg?.score) ? fg.score : finite(o.fearGreedScore) ? o.fearGreedScore : null;
    if (fgScore !== null) out.push({ id: 'feargreed', re: /공포\s?[·・&]?\s?탐욕|Fear\s?(?:&|and)\s?Greed|恐怖\s?[·・&]?\s?強欲/gi, values: [{ v: fgScore, unit: 'any' }],
        zone: typeof fg?.zone === 'string' ? fg.zone : fearGreedZone(fgScore), change: null });   // 공포탐욕 이전 값은 입력에 없다
    const sec = Object.entries(d).find(([k]) => k.startsWith('sector moves'))?.[1] as any;
    const secRows = [...(sec?.leaders || []), ...(sec?.laggards || [])].filter((x: any) => typeof x?.sector === 'string');
    for (const s of [...(sec?.leaders || []), ...(sec?.laggards || [])]) {
        const names = [s?.sector, SECTOR_EN_OF[s?.sector], ...(Object.entries(SECTOR_EN_OF).filter(([, en]) => en === s?.sector).map(([k]) => k))].filter((x): x is string => typeof x === 'string' && !!x);
        const others = secRows.filter((x: any) => x.etf !== s?.etf).map((x: any) => x.sector as string);
        if (typeof s?.etf === 'string' && /^[A-Z]{2,5}$/.test(s.etf) && finite(s.chgPct) && names.length)
            // 티커 없이 이름만 쓴 섹터(«에너지 섹터가 7% 하락» — 관문 10311028 ②)도 같은 대조 — 다른 섹터 이름의 일부(«클린에너지»·«Clean Energy» 속 에너지)는 제외
            out.push({ id: `sector:${s.etf}:name`, re: sectorNameRe(names), values: [{ v: s.chgPct, unit: 'pct' }], sign: Math.sign(s.chgPct), change: s.chgPct });
        if (typeof s?.etf === 'string' && /^[A-Z]{2,5}$/.test(s.etf) && finite(s.chgPct))
            // 부호 없이 쓴 숫자도 방향어(«1.9% 하락»)를 입력 등락 부호와 대조한다(관문 10311024 ②) — change = 그 세션 등락
            out.push({ id: `sector:${s.etf}`, re: new RegExp(`\\(\\s*${s.etf}\\s*\\)|(?<![A-Za-z])${s.etf}(?![A-Za-z])`, 'g'), values: [{ v: s.chgPct, unit: 'pct' }], sign: Math.sign(s.chgPct), change: s.chgPct, names, others });
    }
    return out;
}

/** 섹터 이름 정규식 — 한글·가나는 앞 글자 경계, 영어는 낱말 경계 + 다른 섹터 이름의 꼬리(«Clean Energy»의 Energy) 제외 */
function sectorNameRe(names: string[]): RegExp {
    const all = [...new Set([...Object.keys(SECTOR_EN_OF), ...Object.values(SECTOR_EN_OF)])];
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = names.map(n => {
        const tails = all.filter(o => o !== n && o.endsWith(n)).map(o => o.slice(0, o.length - n.length)).filter(Boolean);
        const guard = tails.map(t => `(?<!${esc(t)})`).join('');
        return /^[A-Za-z]/.test(n) ? `${guard}(?<![A-Za-z])${esc(n)}(?![A-Za-z])` : `${guard}(?<![가-힣ァ-ヶー])${esc(n)}`;
    });
    return new RegExp(parts.join('|'), 'gi');
}

const BOUNDARY = /[;；。、!?！？]|[,，](?!\d)|\.(?!\d)/g;
function clauseEnd(text: string, from: number): number {
    BOUNDARY.lastIndex = from;
    const m = BOUNDARY.exec(text);
    return m ? m.index : text.length;
}
function clauseStart(text: string, to: number): number {
    let at = 0;
    for (const m of text.slice(0, to).matchAll(new RegExp(BOUNDARY.source, 'g'))) at = m.index! + 1;
    return at;
}
const fits = (written: number, decimals: number, actual: number) => Math.abs(written - Number(Math.abs(actual).toFixed(decimals))) < 1e-9;

/* ────────────────────────────────────────────────────────────────────────────
 * ★2026-10-31 관문 10311033 ① — «섹터 낱말(티커)»·«티커(섹터 낱말)» 짝은 고정 정본(SECTOR_ETF_KO → 3언어 이름)과 같아야 한다.
 *   예전 검사는 «입력에 들어온 다른 섹터 이름»과만 비교해, 재료에 XLE·SMH 만 있을 때 «기술주(XLE) +1.9%»가 통과했다(XLE 를 기술주 ETF로 오표시).
 *   정본 표에 있는 티커는 입력 유무와 관계없이 대조하고, 정본에 없는 티커(내부 묶음·개별 종목)는 기존 규칙(입력 섹터 이름 대조)만 쓴다.
 *   이름 판정은 «가장 긴 이름»으로(«Clean Energy»의 Energy · «클린에너지»의 에너지를 에너지 섹터로 읽지 않는다), 낱말 경계 필수(«Fintech»의 tech 제외).
 * ──────────────────────────────────────────────────────────────────────────── */
const SECTOR_KO_OF_NAME: ReadonlyArray<readonly [string, string]> = (() => {
    const rows: Array<[string, string]> = [];
    for (const ko of new Set(Object.values(SECTOR_ETF_KO))) {
        const en = SECTOR_NAME_EN[ko];
        for (const n of [ko, en, en ? SECTOR_NAME_JA[en] : undefined, ...(SECTOR_NAME_ALIASES[ko] || [])]) if (n) rows.push([n, ko]);
    }
    // 정본 밖 섹터 이름(AI 전력망·안전자산)도 «다른 섹터 이름»으로 알아본다 — 정본 ETF 앞에 붙으면 오표시다
    for (const [ko, en] of Object.entries(SECTOR_NAME_EN)) if (!rows.some(r => r[1] === ko)) for (const n of [ko, en, SECTOR_NAME_JA[en]]) if (n) rows.push([n, ko]);
    return rows.sort((a, b) => b[0].length - a[0].length);
})();
const LATIN_START = /^[A-Za-z]/;
/** 글 조각 끝(또는 처음)에 붙은 섹터 이름 → 한국어 정본 이름(가장 긴 이름, 낱말 경계) */
function sectorNameAt(piece: string, where: 'end' | 'start'): string | null {
    for (const [n, ko] of SECTOR_KO_OF_NAME) {
        const latin = LATIN_START.test(n);
        const a = latin ? piece.toLowerCase() : piece, b = latin ? n.toLowerCase() : n;
        if (where === 'end' ? !a.endsWith(b) : !a.startsWith(b)) continue;
        // 경계 — 영어는 앞뒤 모두 낱말 경계 · 한글·가나·한자는 이름 «앞»만(뒤에는 조사가 붙는다)
        const edge = where === 'end' ? piece.slice(0, piece.length - n.length).slice(-1) : piece.slice(n.length, n.length + 1);
        if (latin ? /[A-Za-z]/.test(edge) : where === 'end' && /[가-힣ァ-ヶー一-龥]/.test(edge)) continue;
        return ko;
    }
    return null;
}
const SECTOR_SUFFIX = /\s*(?:섹터|업종|sector|stocks|shares|ETF|セクター|株)$/i;
/** 섹터 이름·ETF 짝 대조 — 사유: tactical:driver-sector-name:sector:<ETF> */
export function sectorPairReasons(text: string): string[] {
    if (!text) return [];
    const out: string[] = [];
    for (const [etf, ko] of Object.entries(SECTOR_ETF_KO)) {
        for (const m of text.matchAll(new RegExp(`(?<![A-Za-z0-9])${etf}(?![A-Za-z0-9])`, 'g'))) {
            // 앞: «기술주(XLE)» · «Technology (XLE)» · «テクノロジー(XLE)» · «기술 섹터(XLE)» — 괄호·공백·접미어(섹터·sector·株)를 걷어 내고 끝에 붙은 이름
            const lead = text.slice(Math.max(0, m.index! - 40), m.index!).replace(/[\s(（「『“"']*$/, '');
            let said = sectorNameAt(lead, 'end') ?? sectorNameAt(lead.replace(SECTOR_SUFFIX, ''), 'end');
            if (said === null) {
                // 뒤: «XLE(기술주)» · «XLE (Technology)» — 괄호 안 이름만(«Energy (XLE) Technology (XLK)» 처럼 다음 짝의 이름을 빌리지 않게)
                const trail = text.slice(m.index! + etf.length, m.index! + etf.length + 40).match(/^\s?[(（]\s*([^)）]{1,30})[)）]/)?.[1]?.trim() ?? '';
                said = trail ? (sectorNameAt(trail, 'start') ?? sectorNameAt(trail.replace(SECTOR_SUFFIX, ''), 'start')) : null;
            }
            if (said !== null && said !== ko) out.push(`tactical:driver-sector-name:sector:${etf}`);
        }
    }
    return [...new Set(out)];
}

/** 재료 지표 숫자·방향 대조 — 사유: tactical:driver-value:<id> · tactical:driver-direction:<id> · tactical:driver-unsupported-change:<id> */
export function driverClaimReasons(text: string, drivers: string, observations = ''): string[] {
    if (!text) return [];
    // 섹터 이름·ETF 짝은 재료와 무관한 고정 사실 — 재료가 없어도 본다(관문 10311033 ①)
    const pairs = sectorPairReasons(text);
    const specs = specsFrom(drivers, observations);
    if (!specs.length) return pairs;
    const mentions = specs.flatMap(sp => [...text.matchAll(new RegExp(sp.re.source, sp.re.flags.includes('g') ? sp.re.flags : sp.re.flags + 'g'))]
        // 스퀴즈 «확률»은 금리 경로 확률이 아니다
        .filter(m => !(sp.prob && /스퀴즈|squeeze|スクイーズ/i.test(text.slice(Math.max(0, m.index! - 8), m.index!))))
        .map(m => {
            // 금리 경로 확률: «동결·hold·据え置き» = 동결 값만, «인하·cut·利下げ» = 인하 값만(변화 서술 불가), 그 밖 = 인상(+1주 전)
            const ctx = sp.prob ? text.slice(Math.max(0, m.index! - 14), m.index! + m[0].length) : '';
            const kind = sp.prob ? (/동결|hold|据え置き/i.test(ctx) ? 'hold' : /인하|cut|利下げ/i.test(ctx) ? 'cut' : 'hike') : 'hike';
            const own: DriverSpec = kind === 'hike' ? sp : { ...sp, id: `fedwatch:${kind}`, values: finite(sp[kind]) ? [{ v: sp[kind] as number, unit: 'pct' }] : [], change: null, week: null };
            return { sp: own, at: m.index!, end: m.index! + m[0].length };
        })).sort((a, b) => a.at - b.at);
    const toks = valueTokens(text).filter(t => !t.exempt || /%|bp/i.test(t.raw));
    const out: string[] = [];
    mentions.forEach((m, i) => {
        const stop = Math.min(clauseEnd(text, m.end), mentions.find((n, j) => j > i && n.at >= m.end)?.at ?? text.length);
        let mine = toks.filter(t => t.index >= m.end && t.index < stop);
        if (!mine.length && /chance|odds|probabilit|index|yield/i.test(text.slice(m.at, m.end + 12))) {
            // 영어 «a 72% chance of a hike» — 이름 바로 앞 숫자(같은 절·다른 지표 이름 뒤가 아님·20자 안). 한국어·일본어는 숫자가 이름 뒤에 온다(앞 숫자는 다른 주어의 것)
            const from = Math.max(clauseStart(text, m.at), mentions.filter((n, j) => j < i).reduce((a, n) => Math.max(a, n.end), 0), m.at - 20);
            const prev = toks.filter(t => t.index >= from && t.end <= m.at).slice(-1);
            mine = prev;
        }
        if (!mine.length) return;
        // 그 지표의 숫자 = 첫 숫자 + 바로 붙은 둘째(«4.94%(전일 대비 4bp» · «9.4%에서 72%로», 15자 안)까지 — 그 뒤 숫자는 다음 주어의 것(«rose to 4.94% as markets price a 72% chance»)
        mine = mine.length > 1 && mine[1].index - mine[0].end <= 15 ? mine.slice(0, 2) : mine.slice(0, 1);
        // 인상 확률의 «지금 값 / 1주 전 값» 자리 — 1주 전 표식(«1주 전»·«a week ago»·«1週間前»)이 바로 앞에 붙은 숫자만 1주 전 값이고,
        //   표식 없이 두 숫자면 «A에서 B로 / from A to B / AからBへ» = 1주 전 → 지금 순서다. 표식 없는 숫자 하나는 지금 값(관문 10311024 ① «72%에서 9.4%로»)
        const WEEK_MARK = /(?:1\s?주\s?전|일주일\s?전|a week (?:ago|earlier)|one week (?:ago|earlier)|week[- ]ago|1\s?週間?前)[^\d]{0,6}$/i;
        const WEEK_AFTER = /^\s?(?:a week (?:ago|earlier)|one week (?:ago|earlier)|last week)\b/i;
        const roles = (m.sp.id === 'fedwatch' ? mine.map((t, k) => {
            const lead = text.slice(Math.max(k ? mine[k - 1].end : m.end, t.index - 14), t.index);
            const trail = text.slice(t.end, t.end + 16);
            return WEEK_MARK.test(lead) || WEEK_AFTER.test(trail) ? 'week' : mine.length === 2 && k === 0 && !WEEK_MARK.test(text.slice(mine[0].end, mine[1].index)) ? 'week' : 'now';
        }) : mine.map(() => 'now')) as Array<'week' | 'now'>;
        for (const [k, t] of mine.entries()) {
            const num = Number((t.raw.match(/\d[\d,]*(?:\.\d+)?/) || ['NaN'])[0].replace(/,/g, ''));
            const decimals = (t.raw.match(/\.(\d+)/)?.[1].length) ?? 0;
            const unit = /bp/i.test(t.raw) ? 'bp' : /%/.test(t.raw) ? 'pct' : 'none';
            const allowed = roles[k] === 'week' ? (finite(m.sp.week) ? [{ v: m.sp.week as number, unit: 'pct' as const }] : []) : m.sp.values;
            const hit = allowed.find(v => (v.unit === 'any' || unit === 'none' || v.unit === unit) && fits(num, decimals, v.v));
            if (!hit) { out.push(`tactical:driver-value:${m.sp.id}`); return; }
            // 부호를 붙인 숫자는 맞춘 입력 값의 부호와 같아야 한다(관문 10311118 — 크기만 맞는 «10년물 −4.94%»·«-72% chance» 차단). 0 은 부호 판정 없음
            if (t.sign && hit.v !== 0 && t.sign !== Math.sign(hit.v)) { out.push(`tactical:driver-direction:${m.sp.id}`); return; }
            if (m.sp.sign && t.sign && t.sign !== m.sp.sign) { out.push(`tactical:driver-direction:${m.sp.id}`); return; }
            // 부호를 붙인 변화량(«+4bp»)은 입력 변화량 부호와 같아야 한다(관문 10311028 ① — 크기만 맞고 부호가 반대인 «전일 대비 +4bp»)
            if (unit === 'bp' && t.sign && typeof m.sp.change === 'number' && m.sp.change !== 0 && t.sign !== Math.sign(m.sp.change)) { out.push(`tactical:driver-direction:${m.sp.id}`); return; }
        }
        // 공포·탐욕 구간 낱말(값 바로 뒤 괄호·조사 14자 안)은 입력 구간과 같아야 한다(«26(탐욕 구간)» 차단)
        if (m.sp.zone) {
            const after = text.slice(mine[mine.length - 1].end, mine[mine.length - 1].end + 14);
            const said = /극단적\s?공포|extreme fear|極度の恐怖/i.test(after) ? 'extreme fear' : /극단적\s?탐욕|extreme greed|極度の強欲/i.test(after) ? 'extreme greed'
                : /공포|\bfear\b|恐怖/i.test(after) ? 'fear' : /탐욕|\bgreed\b|強欲/i.test(after) ? 'greed' : /중립|neutral|中立/i.test(after) ? 'neutral' : null;
            // 같은 구간만 — 넓은 말(«공포»)로 «극단적 공포»를 말하는 것은 허용, 더 센 말(«극단적 공포»)로 «공포»를 말하는 것은 탈락(관문 10311028 ③)
            if (said && !(said === m.sp.zone || `extreme ${said}` === m.sp.zone)) out.push(`tactical:driver-zone:${m.sp.id}`);
        }
        // 섹터 이름 — ETF 바로 앞 이름이 다른 재료 섹터 이름이면 탈락(«에너지(SMH)»)
        if (m.sp.names?.length && m.sp.others?.length) {
            const lead = text.slice(Math.max(0, m.at - 16), m.at);
            if (m.sp.others.some(o => lead.endsWith(o) || lead.trimEnd().endsWith(o)) && !m.sp.names.some(n => lead.trimEnd().endsWith(n))) out.push(`tactical:driver-sector-name:${m.sp.id}`);
        }
        // 방향어 — 이름과 숫자 사이 + 마지막 숫자 바로 뒤 12자(다른 주어의 동사를 빌리지 않게)
        if (m.sp.change !== undefined) {
            const last = mine[mine.length - 1];
            const span = text.slice(m.end, Math.min(stop, Math.max(last.end, m.end) + 12));
            const before = m.at > last.index ? text.slice(last.end, m.at) : '';
            const words = span + ' ' + before;
            const up = DIR_UP.test(words), down = DIR_DOWN.test(words);
            if (up || down) {
                if (m.sp.change === null) out.push(`tactical:driver-unsupported-change:${m.sp.id}`);
                else if ((up && !down && m.sp.change < 0) || (down && !up && m.sp.change > 0)) out.push(`tactical:driver-direction:${m.sp.id}`);
            }
        }
    });
    return [...new Set([...pairs, ...out])];
}
