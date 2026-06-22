"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Clock, ChevronDown, ChevronUp } from 'lucide-react';

// === TYPES ===
interface EconomicEvent {
    date: string;    // 'YYYY-MM-DD'
    time: string;    // 'HH:MM' (ET from FMP)
    event: string;
    impact: 'HIGH' | 'MEDIUM';
    category: string;
    actual?: number | null;
    estimate?: number | null;
    previous?: number | null;
    unit?: string | null;
}

interface Props {
    locale?: string;
    maxEvents?: number;
    localizeLabels?: boolean;
}

// === CATEGORY DISPLAY ===
const CATEGORY_ICONS: Record<string, string> = {
    inflation: 'CPI',
    employment: 'JOB',
    fed: 'FED',
    growth: 'GDP',
    manufacturing: 'PMI',
    consumer: 'RTL',
    other: 'ETC',
};

const CATEGORY_COLORS: Record<string, string> = {
    inflation: 'text-rose-400',
    employment: 'text-cyan-400',
    fed: 'text-amber-400',
    growth: 'text-emerald-400',
    manufacturing: 'text-indigo-400',
    consumer: 'text-purple-400',
    other: 'text-slate-400',
};

// === FALLBACK DATA ===
const FALLBACK_EVENTS: EconomicEvent[] = [
    { date: '2026-03-11', time: '08:30', event: 'CPI / Core CPI (Feb)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-03-12', time: '08:30', event: 'PPI / Core PPI (Feb)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-03-13', time: '08:30', event: 'GDP 2nd Estimate (Q4)', impact: 'HIGH', category: 'growth' },
    { date: '2026-03-13', time: '08:30', event: 'Core PCE Price Index (Jan)', impact: 'HIGH', category: 'inflation' },
    { date: '2026-03-18', time: '14:00', event: 'FOMC Rate Decision', impact: 'HIGH', category: 'fed' },
];

// === HELPERS ===
function getCountdown(eventDate: Date, now: Date): string {
    const diff = eventDate.getTime() - now.getTime();
    if (diff <= 0) return 'NOW';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function parseEventDate(event: EconomicEvent): Date {
    const [y, m, d] = event.date.split('-').map(Number);
    const [h, min] = event.time.split(':').map(Number);
    // Dynamic DST: detect if ET is currently UTC-4 (EDT) or UTC-5 (EST)
    const etUtcOffset = getETUtcOffset();
    return new Date(Date.UTC(y, m - 1, d, h + etUtcOffset, min));
}

// Detect ET UTC offset dynamically (4 for EDT summer, 5 for EST winter)
function getETUtcOffset(): number {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        timeZoneName: 'shortOffset',
    });
    const parts = fmt.formatToParts(new Date());
    const tz = parts.find(p => p.type === 'timeZoneName')?.value || '';
    return tz.includes('-4') ? 4 : 5;
}

// Format value with unit
function fmtVal(val: number | null | undefined, unit: string | null | undefined): string {
    if (val == null) return '—';
    const u = unit || '';
    if (u === '%') return `${val}%`;
    if (u === 'K') return `${val}K`;
    if (u === 'M') return `${val}M`;
    if (u === 'B') return `${val}B`;
    if (u === 'T') return `${val}T`;
    return `${val}${u}`;
}

const COLLAPSED_MAX_ROWS = 7; // Show 7 event rows when collapsed

const UI_LABELS = {
    en: {
        title: 'ECONOMIC CALENDAR',
        country: 'US',
        priority: 'HIGH',
        nextImpact: 'Next Impact:',
        estimate: 'Est',
        collapse: 'Collapse',
        moreEvents: 'more events',
        events: 'events',
        live: 'LIVE',
        high: 'HIGH',
        med: 'MED',
    },
    ko: {
        title: '경제 캘린더',
        country: '미국',
        priority: '중요',
        nextImpact: '다음 이벤트:',
        estimate: '예상',
        collapse: '접기',
        moreEvents: '개 이벤트 더보기',
        events: '개 이벤트',
        live: '실시간',
        high: '중요',
        med: '보통',
    },
    ja: {
        title: '経済カレンダー',
        country: '米国',
        priority: '重要',
        nextImpact: '次のイベント:',
        estimate: '予想',
        collapse: '閉じる',
        moreEvents: '件をさらに表示',
        events: '件',
        live: 'ライブ',
        high: '重要',
        med: '中',
    },
};

type LocalizedEventName = { ko: string; ja: string };
type SupportedCalendarLocale = 'ko' | 'ja';

const EVENT_NAME_MAP: Record<string, LocalizedEventName> = {
    FedWallerSpeech: { ko: '월러 연준 이사 연설', ja: 'ウォラーFRB理事講演' },
    'Fed Waller Speech': { ko: '월러 연준 이사 연설', ja: 'ウォラーFRB理事講演' },
    'Fed Chair Powell Speech': { ko: '파월 연준 의장 연설', ja: 'パウエルFRB議長講演' },
    'FOMC Rate Decision': { ko: 'FOMC 금리 결정', ja: 'FOMC政策金利決定' },
    'FOMC Minutes': { ko: 'FOMC 의사록', ja: 'FOMC議事要旨' },
    'FOMC Economic Projections': { ko: 'FOMC 경제 전망', ja: 'FOMC経済見通し' },
};

const EVENT_RULES: { match: RegExp; ko: string; ja: string }[] = [
    { match: /\bcpi\s*\/\s*core\s+cpi\b|\bcore\s+cpi\s*\/\s*cpi\b/i, ko: 'CPI / 근원 CPI', ja: 'CPI / コアCPI' },
    { match: /\bppi\s*\/\s*core\s+ppi\b|\bcore\s+ppi\s*\/\s*ppi\b/i, ko: 'PPI / 근원 PPI', ja: 'PPI / コアPPI' },
    { match: /\bcore\s+cpi\b/i, ko: '근원 소비자물가지수(CPI)', ja: 'コア消費者物価指数(CPI)' },
    { match: /\bcpi\b|consumer price index/i, ko: '소비자물가지수(CPI)', ja: '消費者物価指数(CPI)' },
    { match: /\bcore\s+ppi\b/i, ko: '근원 생산자물가지수(PPI)', ja: 'コア生産者物価指数(PPI)' },
    { match: /\bppi\b|producer price index/i, ko: '생산자물가지수(PPI)', ja: '生産者物価指数(PPI)' },
    { match: /\bcore\s+pce\b/i, ko: '근원 PCE 물가지수', ja: 'コアPCE価格指数' },
    { match: /\bpce price index\b|\bpce\b/i, ko: 'PCE 물가지수', ja: 'PCE価格指数' },
    { match: /import price index/i, ko: '수입물가지수', ja: '輸入物価指数' },
    { match: /export price index/i, ko: '수출물가지수', ja: '輸出物価指数' },
    { match: /inflation rate/i, ko: '물가상승률', ja: 'インフレ率' },

    { match: /initial jobless claims/i, ko: '신규 실업수당 청구건수', ja: '新規失業保険申請件数' },
    { match: /continuing jobless claims/i, ko: '연속 실업수당 청구건수', ja: '継続失業保険受給件数' },
    { match: /nonfarm payrolls|non-farm payrolls|\bnfp\b/i, ko: '비농업 고용지수', ja: '非農業部門雇用者数' },
    { match: /unemployment rate/i, ko: '실업률', ja: '失業率' },
    { match: /average hourly earnings/i, ko: '평균 시간당 임금', ja: '平均時給' },
    { match: /adp.*employment|adp nonfarm/i, ko: 'ADP 민간고용 변화', ja: 'ADP民間雇用者数' },
    { match: /jolts.*job openings|job openings/i, ko: 'JOLTS 구인건수', ja: 'JOLTS求人件数' },
    { match: /labor force participation/i, ko: '경제활동참가율', ja: '労働参加率' },

    { match: /fomc.*rate decision|interest rate decision/i, ko: 'FOMC 금리 결정', ja: 'FOMC政策金利決定' },
    { match: /fomc.*minutes/i, ko: 'FOMC 의사록', ja: 'FOMC議事要旨' },
    { match: /fomc.*press conference/i, ko: 'FOMC 기자회견', ja: 'FOMC記者会見' },
    { match: /fomc.*economic projections/i, ko: 'FOMC 경제 전망', ja: 'FOMC経済見通し' },
    { match: /fed beige book/i, ko: '연준 베이지북', ja: 'FRBベージュブック' },
    { match: /fed balance sheet/i, ko: '연준 대차대조표', ja: 'FRBバランスシート' },

    { match: /\bgdp\b.*2nd estimate|gdp second estimate/i, ko: 'GDP 2차 추정치', ja: 'GDP改定値' },
    { match: /\bgdp\b.*3rd estimate|gdp third estimate/i, ko: 'GDP 3차 추정치', ja: 'GDP確定値' },
    { match: /\bgdp\b/i, ko: '국내총생산(GDP)', ja: '国内総生産(GDP)' },
    { match: /trade balance/i, ko: '무역수지', ja: '貿易収支' },
    { match: /current account/i, ko: '경상수지', ja: '経常収支' },

    { match: /ism manufacturing.*pmi|manufacturing pmi/i, ko: '제조업 PMI', ja: '製造業PMI' },
    { match: /ism services.*pmi|services pmi|non-manufacturing pmi/i, ko: '서비스업 PMI', ja: 'サービス業PMI' },
    { match: /industrial production/i, ko: '산업생산', ja: '鉱工業生産' },
    { match: /capacity utilization/i, ko: '설비가동률', ja: '設備稼働率' },
    { match: /factory orders/i, ko: '공장수주', ja: '製造業受注' },
    { match: /durable goods orders/i, ko: '내구재 주문', ja: '耐久財受注' },
    { match: /philadelphia fed manufacturing/i, ko: '필라델피아 연은 제조업지수', ja: 'フィラデルフィア連銀製造業指数' },
    { match: /ny empire state manufacturing|empire state manufacturing/i, ko: '뉴욕 엠파이어스테이트 제조업지수', ja: 'NY連銀製造業景気指数' },

    { match: /retail sales/i, ko: '소매판매', ja: '小売売上高' },
    { match: /consumer confidence/i, ko: '소비자신뢰지수', ja: '消費者信頼感指数' },
    { match: /michigan.*sentiment|consumer sentiment/i, ko: '미시간대 소비자심리지수', ja: 'ミシガン大学消費者信頼感指数' },
    { match: /personal income/i, ko: '개인소득', ja: '個人所得' },
    { match: /personal spending/i, ko: '개인지출', ja: '個人支出' },

    { match: /building permits/i, ko: '건축허가건수', ja: '住宅建設許可件数' },
    { match: /housing starts/i, ko: '주택착공건수', ja: '住宅着工件数' },
    { match: /existing home sales/i, ko: '기존주택판매', ja: '中古住宅販売件数' },
    { match: /new home sales/i, ko: '신규주택판매', ja: '新築住宅販売件数' },
    { match: /pending home sales/i, ko: '잠정주택판매', ja: '中古住宅販売成約指数' },
    { match: /nahb housing market index/i, ko: 'NAHB 주택시장지수', ja: 'NAHB住宅市場指数' },

    { match: /crude oil inventories|crude oil stocks change/i, ko: '원유 재고', ja: '原油在庫' },
    { match: /gasoline inventories/i, ko: '휘발유 재고', ja: 'ガソリン在庫' },
    { match: /natural gas storage/i, ko: '천연가스 재고', ja: '天然ガス貯蔵量' },
    { match: /eia short-term energy outlook/i, ko: 'EIA 단기 에너지 전망', ja: 'EIA短期エネルギー見通し' },

    { match: /10-year note auction/i, ko: '10년물 국채 입찰', ja: '10年国債入札' },
    { match: /30-year bond auction/i, ko: '30년물 국채 입찰', ja: '30年国債入札' },
    { match: /2-year note auction/i, ko: '2년물 국채 입찰', ja: '2年国債入札' },
    { match: /5-year note auction/i, ko: '5년물 국채 입찰', ja: '5年国債入札' },
    { match: /leading index|leading indicators/i, ko: '경기선행지수', ja: '景気先行指数' },
];

const FED_SPEAKERS: Record<string, LocalizedEventName> = {
    powell: { ko: '파월 연준 의장', ja: 'パウエルFRB議長' },
    waller: { ko: '월러 연준 이사', ja: 'ウォラーFRB理事' },
    williams: { ko: '윌리엄스 뉴욕 연은 총재', ja: 'ウィリアムズNY連銀総裁' },
    bowman: { ko: '보먼 연준 이사', ja: 'ボウマンFRB理事' },
    barr: { ko: '바 연준 부의장', ja: 'バーFRB副議長' },
    jefferson: { ko: '제퍼슨 연준 부의장', ja: 'ジェファーソンFRB副議長' },
    cook: { ko: '쿡 연준 이사', ja: 'クックFRB理事' },
    kugler: { ko: '쿠글러 연준 이사', ja: 'クーグラーFRB理事' },
    daly: { ko: '데일리 샌프란시스코 연은 총재', ja: 'デイリーSF連銀総裁' },
    goolsbee: { ko: '굴스비 시카고 연은 총재', ja: 'グールズビー・シカゴ連銀総裁' },
    bostic: { ko: '보스틱 애틀랜타 연은 총재', ja: 'ボスティック・アトランタ連銀総裁' },
    collins: { ko: '콜린스 보스턴 연은 총재', ja: 'コリンズ・ボストン連銀総裁' },
    hammack: { ko: '해맥 클리블랜드 연은 총재', ja: 'ハマック・クリーブランド連銀総裁' },
    musalem: { ko: '무살렘 세인트루이스 연은 총재', ja: 'ムサレム・セントルイス連銀総裁' },
    schmid: { ko: '슈미드 캔자스시티 연은 총재', ja: 'シュミッド・カンザスシティ連銀総裁' },
};

const CFTC_ASSETS: Record<string, LocalizedEventName> = {
    'crude oil': { ko: '원유', ja: '原油' },
    gold: { ko: '금', ja: '金' },
    silver: { ko: '은', ja: '銀' },
    copper: { ko: '구리', ja: '銅' },
    'natural gas': { ko: '천연가스', ja: '天然ガス' },
    's&p 500': { ko: 'S&P500', ja: 'S&P500' },
    'sp 500': { ko: 'S&P500', ja: 'S&P500' },
    'nasdaq 100': { ko: '나스닥100', ja: 'ナスダック100' },
    'dow jones': { ko: '다우존스', ja: 'ダウ・ジョーンズ' },
    'russell 2000': { ko: '러셀2000', ja: 'ラッセル2000' },
    wheat: { ko: '밀', ja: '小麦' },
    corn: { ko: '옥수수', ja: 'トウモロコシ' },
    soybeans: { ko: '대두', ja: '大豆' },
};

function getCalendarLocale(locale: string): SupportedCalendarLocale | null {
    if (locale.startsWith('ko')) return 'ko';
    if (locale.startsWith('ja')) return 'ja';
    return null;
}

function normalizeEventName(name: string): string {
    return name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
}

function getParentheticalSuffix(name: string): string {
    const matches = [...name.matchAll(/\s*\([^)]*\)/g)];
    if (matches.length === 0) return '';
    return matches.map(match => match[0].trim()).join(' ');
}

function translateCftcEvent(name: string, locale: SupportedCalendarLocale): string | null {
    if (!/\bcftc\b/i.test(name) || !/speculative|net positions|position/i.test(name)) return null;
    const normalized = name.toLowerCase();
    const matched = Object.entries(CFTC_ASSETS)
        .find(([asset]) => normalized.includes(asset));
    const asset = matched ? matched[1][locale] : name
        .replace(/cftc/ig, '')
        .replace(/speculative/ig, '')
        .replace(/net positions/ig, '')
        .replace(/positions/ig, '')
        .trim();

    return locale === 'ko'
        ? `CFTC ${asset} 투기 순포지션`
        : `CFTC ${asset} 投機筋ネットポジション`;
}

function translateFedEvent(name: string, locale: SupportedCalendarLocale): string | null {
    if (!/\bfed\b|\bfrb\b|federal reserve/i.test(name)) return null;
    const lowered = name.toLowerCase();
    const speaker = Object.entries(FED_SPEAKERS).find(([key]) => lowered.includes(key))?.[1];

    if (/testimony|testifies/i.test(name)) {
        if (speaker) return locale === 'ko' ? `${speaker.ko} 증언` : `${speaker.ja}証言`;
        return locale === 'ko' ? '연준 인사 증언' : 'FRB関係者証言';
    }

    if (/speech|speaks|remarks|appearance/i.test(name)) {
        if (speaker) return locale === 'ko' ? `${speaker.ko} 연설` : `${speaker.ja}講演`;
        return locale === 'ko' ? '연준 인사 연설' : 'FRB関係者講演';
    }

    if (/meeting/i.test(name)) return locale === 'ko' ? '연준 회의' : 'FRB会合';
    return null;
}

function translateRuleBasedEvent(name: string, locale: SupportedCalendarLocale): string | null {
    const cftc = translateCftcEvent(name, locale);
    if (cftc) return cftc;

    const fed = translateFedEvent(name, locale);
    if (fed) return fed;

    const rule = EVENT_RULES.find(item => item.match.test(name));
    if (rule) return rule[locale];

    return null;
}

function formatEventName(name: string, locale: string, localizeLabels: boolean): string {
    const spaced = normalizeEventName(name);
    if (!localizeLabels) return spaced;

    const calendarLocale = getCalendarLocale(locale);
    if (!calendarLocale) return spaced;

    const exact = EVENT_NAME_MAP[name] || EVENT_NAME_MAP[spaced];
    const translated = exact?.[calendarLocale] || translateRuleBasedEvent(spaced, calendarLocale);
    if (!translated) return spaced;

    const suffix = getParentheticalSuffix(spaced);
    return suffix && !translated.includes(suffix) ? `${translated} ${suffix}` : translated;
}

// === COMPONENT ===
export function EconomicCalendarWidget({ locale = 'ko', maxEvents = 10, localizeLabels = false }: Props) {
    const [now, setNow] = useState(() => new Date());
    const [events, setEvents] = useState<EconomicEvent[]>(FALLBACK_EVENTS);
    const [source, setSource] = useState<string>('FALLBACK');
    const [totalCount, setTotalCount] = useState(FALLBACK_EVENTS.length);
    const [expanded, setExpanded] = useState(false);

    // Fetch from API
    useEffect(() => {
        let cancelled = false;
        async function fetchCalendar() {
            try {
                const res = await fetch('/api/guardian/economic-calendar', {
                    cache: 'no-store',
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled && data.events?.length > 0) {
                    setEvents(data.events);
                    setSource(data.source || 'API');
                    setTotalCount(data.totalUS || data.events.length);
                }
            } catch {
                console.warn('[EconCal] API failed, using fallback');
            }
        }
        fetchCalendar();
        return () => { cancelled = true; };
    }, []);

    // Clock tick
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // Timezone offset for display — dynamic DST handling
    // EDT (summer): ET is UTC-4, KST is UTC+9, diff = 13h
    // EST (winter): ET is UTC-5, KST is UTC+9, diff = 14h
    const etUtcOff = getETUtcOffset(); // 4 or 5
    const tzOffset = locale === 'ko' ? (9 + etUtcOff) : locale === 'ja' ? (9 + etUtcOff) : 0;
    const tzLabel = locale === 'ko' ? 'KST' : locale === 'ja' ? 'JST' : 'ET';

    const convertTime = (etTime: string): string => {
        if (tzOffset === 0) return etTime;
        const [h, m] = etTime.split(':').map(Number);
        const converted = (h + tzOffset) % 24;
        return `${String(converted).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // Does the time conversion cross midnight? (for date display adjustment)
    const doesCrossMidnight = useCallback((etTime: string): boolean => {
        if (tzOffset === 0) return false;
        const [h] = etTime.split(':').map(Number);
        return (h + tzOffset) >= 24;
    }, [tzOffset]);

    const upcomingEvents = useMemo(() => {
        return events
            .map(e => ({ ...e, dateObj: parseEventDate(e) }))
            .filter(e => e.dateObj.getTime() > now.getTime() - 3600_000)
            .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    }, [now, events]);

    // Group events by display date (adjusted for timezone)
    const allGroupedEvents = useMemo(() => {
        const groups: { dateStr: string; displayDate: string; events: (EconomicEvent & { dateObj: Date })[] }[] = [];
        const shown = upcomingEvents.slice(0, maxEvents * 4);

        for (const event of shown) {
            // Adjust date if timezone crosses midnight
            let displayDateStr = event.date;
            if (doesCrossMidnight(event.time)) {
                if (locale === 'ko' || locale === 'ja') {
                    const [h] = event.time.split(':').map(Number);
                    if ((h + tzOffset) >= 24) {
                        const nextDay = new Date(event.dateObj);
                        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
                        const ny = nextDay.getUTCFullYear();
                        const nm = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
                        const nd = String(nextDay.getUTCDate()).padStart(2, '0');
                        displayDateStr = `${ny}-${nm}-${nd}`;
                    }
                }
            }

            const existing = groups.find(g => g.dateStr === displayDateStr);
            if (existing) {
                existing.events.push(event);
            } else {
                const [y, m, d] = displayDateStr.split('-').map(Number);
                const date = new Date(y, m - 1, d);
                const weekday = date.toLocaleDateString(
                    locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : 'en-US',
                    { weekday: 'short' }
                );
                groups.push({
                    dateStr: displayDateStr,
                    displayDate: `${m}/${d} ${weekday}`,
                    events: [event],
                });
            }
        }
        return groups.slice(0, maxEvents);
    }, [upcomingEvents, maxEvents, locale, tzOffset, doesCrossMidnight]);

    // Collapse: limit to ~7 event rows total
    const groupedEvents = useMemo(() => {
        if (expanded) return allGroupedEvents;
        let rowCount = 0;
        const limited: typeof allGroupedEvents = [];
        for (const group of allGroupedEvents) {
            rowCount += 1; // date header row
            const remainingRows = COLLAPSED_MAX_ROWS - rowCount;
            if (remainingRows <= 0) break;
            const slicedEvents = group.events.slice(0, remainingRows);
            limited.push({ ...group, events: slicedEvents });
            rowCount += slicedEvents.length;
            if (rowCount >= COLLAPSED_MAX_ROWS) break;
        }
        return limited;
    }, [allGroupedEvents, expanded]);

    const totalVisibleRows = allGroupedEvents.reduce((acc, g) => acc + g.events.length, 0);
    const hasMore = totalVisibleRows > COLLAPSED_MAX_ROWS;

    const nextEvent = upcomingEvents[0];
    const countdown = nextEvent ? getCountdown(nextEvent.dateObj, now) : '--';
    const labels = localizeLabels
        ? UI_LABELS[(locale === 'ko' || locale === 'ja') ? locale : 'en']
        : UI_LABELS.en;

    return (
        <div className="relative">
            <div className={`border border-slate-800 rounded-lg p-4 flex flex-col shadow-2xl flex-none overflow-hidden ${expanded ? 'absolute top-0 left-0 right-0 z-50 ring-1 ring-amber-500/30' : ''}`}
                style={{
                    background: 'linear-gradient(90deg, rgba(249,115,22,0.12) 0%, rgba(249,115,22,0.03) 30%, transparent 60%), linear-gradient(135deg, rgba(15,23,42,0.98), rgba(10,14,20,1))',
                    backdropFilter: 'blur(20px)',
                    borderLeft: '3px solid rgba(249,115,22,0.25)',
                    ...(expanded ? { maxHeight: '500px' } : {}),
                }}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-amber-400 flex items-center gap-1.5 font-jakarta">
                        <Calendar className="w-3.5 h-3.5" />
                        {labels.title}
                    </h3>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[12px] bg-blue-950/50 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20 font-bold font-jakarta">
                            {labels.country}
                        </span>
                        <span className="text-[12px] bg-rose-950/50 text-rose-300 px-2 py-0.5 rounded border border-rose-500/20 font-bold font-jakarta">
                            {labels.priority}
                        </span>
                    </div>
                </div>

                {/* Next Impact Countdown */}
                {nextEvent && (
                    <div className="flex items-center gap-2 mb-3 bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-700/30">
                        <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="text-[12px] text-white font-bold font-jakarta">{labels.nextImpact}</span>
                        <span className="text-[13px] font-mono font-black text-amber-400">{countdown}</span>
                        <span className="text-[12px] text-slate-300 truncate ml-auto font-jakarta">{formatEventName(nextEvent.event, locale, localizeLabels)}</span>
                    </div>
                )}

                {/* Event List — Date as header, events below */}
                <div className={`space-y-2.5 flex-1 ${expanded ? 'max-h-[320px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent' : ''}`}>
                    {groupedEvents.map((group, gi) => (
                        <div key={gi}>
                            {/* Date header */}
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[12px] font-mono font-bold text-amber-400/80 font-jakarta">{group.displayDate}</span>
                                <div className="flex-1 h-px bg-slate-700/40" />
                            </div>
                            {/* Events */}
                            <div className="space-y-0.5 pl-1">
                                {group.events.map((event, ei) => {
                                    const hasActual = event.actual != null;
                                    const hasEstimate = event.estimate != null;
                                    const isBeat = hasActual && hasEstimate && event.actual! > event.estimate!;
                                    const isMiss = hasActual && hasEstimate && event.actual! < event.estimate!;

                                    return (
                                        <div key={ei} className="flex items-center gap-1.5 min-h-[20px]">
                                            {/* Category badge */}
                                            <span className={`text-[11px] font-mono font-black px-1 py-0 rounded ${CATEGORY_COLORS[event.category] || 'text-slate-400'} bg-white/5 flex-shrink-0 font-jakarta`}>
                                                {CATEGORY_ICONS[event.category] || 'ETC'}
                                            </span>
                                            {/* Time (local) */}
                                            <span className="text-[11px] font-mono text-slate-400 flex-shrink-0 w-[34px]">
                                                {convertTime(event.time)}
                                            </span>
                                            {/* Event name */}
                                            <span className={`text-[12px] font-semibold truncate flex-1 ${CATEGORY_COLORS[event.category] || 'text-white'} font-jakarta`}>
                                                {formatEventName(event.event, locale, localizeLabels)}
                                            </span>
                                            {/* Estimate / Actual values */}
                                            {hasActual ? (
                                                <span className={`text-[11px] font-mono font-bold flex-shrink-0 ${isBeat ? 'text-emerald-400' : isMiss ? 'text-rose-400' : 'text-slate-300'}`}>
                                                    {fmtVal(event.actual, event.unit)}
                                                    {hasEstimate && (
                                                        <span className="text-slate-500 ml-0.5">
                                                            ({isBeat ? '▲' : isMiss ? '▼' : '='}{fmtVal(event.estimate, event.unit)})
                                                        </span>
                                                    )}
                                                </span>
                                            ) : hasEstimate ? (
                                                <span className="text-[11px] font-mono text-slate-400 flex-shrink-0">
                                                    {labels.estimate} {fmtVal(event.estimate, event.unit)}
                                                </span>
                                            ) : (
                                                <span className={`flex-shrink-0 w-2 h-2 rounded-full ${event.impact === 'HIGH' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Expand/Collapse button */}
                {hasMore && (
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 rounded text-[11px] font-bold text-amber-400/70 hover:text-amber-400 hover:bg-slate-800/40 transition-all duration-200 font-jakarta"
                    >
                        {expanded ? (
                            <><ChevronUp className="w-3.5 h-3.5" /> {labels.collapse}</>
                        ) : (
                            <><ChevronDown className="w-3.5 h-3.5" /> +{totalVisibleRows - COLLAPSED_MAX_ROWS + allGroupedEvents.length} {labels.moreEvents}</>
                        )}
                    </button>
                )}

                {/* Footer */}
                <div className="mt-2 pt-2 border-t border-slate-800/40 flex items-center justify-between">
                    <span className="text-[12px] text-slate-300 font-mono font-jakarta">
                        {totalCount} {labels.events} · {tzLabel}
                        {source === 'REDIS' && <span className="text-emerald-500 ml-1">● {labels.live}</span>}
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                            <span className="text-[12px] text-slate-300 font-jakarta">{labels.high}</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="text-[12px] text-slate-300 font-jakarta">{labels.med}</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
