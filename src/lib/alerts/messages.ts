/**
 * 알림 문구 — 한·영·일, «숫자와 사실만».
 *
 * 원칙(기획 §6-1·§7, 기존 발행 규칙과 같다):
 *   - 방향 예측·매수/매도 권유·해석 금지(Apple 3.2.1(viii)·Play «개인화된 조언» 정책). 판정 기준(5분 종가 등)은 사실로 밝힌다.
 *   - 광고·구독 권유를 섞지 않는다(정보통신망법 제50조 — 권유는 앱 안 화면에서만).
 *   - 제목 = 사건 한 줄, 본문 = 맥락 숫자. 둘을 이어 읽으면 기획의 예문이 된다:
 *       «NVDA 콜월 250 돌파» + «다음 벽 260 · 풋콜 0.97 · 현재 251.30»
 */
import { calendarDaysBetween } from './calendar';
import type { AlertLocale, DetectedEvent, EarningsInput } from './types';

export interface AlertCopy {
    title: string;
    body: string;
}

const L3 = <T,>(l: AlertLocale, ko: T, en: T, ja: T): T => (l === 'ko' ? ko : l === 'ja' ? ja : en);

/** 행사가·레벨: 쓸데없는 0 없이(250 · 332.5 · 1,100) */
export function fmtLevel(n: number): string {
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** 가격: 소수 둘째 자리 고정(251.30) */
export function fmtPrice(n: number): string {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 부호 있는 퍼센트(+2.1% · −0.8%) */
export function fmtSignedPct(n: number, digits = 1): string {
    const v = Number(n.toFixed(digits));
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`;
}

export function fmtPct(n: number, digits = 1): string {
    return `${n.toFixed(digits)}%`;
}

/** 명목: $850K · $209M · $1.2B */
export function fmtUsdCompact(n: number): string {
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
    if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
    return `$${Math.round(n)}`;
}

const WEEKDAY: Record<AlertLocale, string[]> = {
    ko: ['일', '월', '화', '수', '목', '금', '토'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    ja: ['日', '月', '火', '水', '木', '金', '土'],
};

/** '2026-10-02' → ko «10/2(금)» · en «Fri 10/2» · ja «10/2(金)» */
export function fmtDate(dateStr: string, l: AlertLocale): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    if (!m) return dateStr || '';
    const md = `${+m[2]}/${+m[3]}`;
    const wd = WEEKDAY[l][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
    return l === 'en' ? `${wd} ${md}` : `${md}(${wd})`;
}

function shortDate(dateStr: string | null | undefined): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    return m ? `${+m[2]}/${+m[3]}` : '';
}

const join = (parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(' · ');

const TIMING: Record<AlertLocale, Record<EarningsInput['timing'], string>> = {
    ko: { bmo: '장 시작 전', amc: '장 마감 후', dmh: '장중', unknown: '' },
    en: { bmo: 'before the open', amc: 'after the close', dmh: 'during market hours', unknown: '' },
    ja: { bmo: '寄り前', amc: '引け後', dmh: '取引時間中', unknown: '' },
};

/**
 * 사건 하나의 문구. `today` = 오늘 ET 거래일(실적 «내일» 판정용).
 */
export function formatAlert(ev: DetectedEvent, l: AlertLocale, today: string): AlertCopy {
    const T = ev.ticker;
    const f = ev.facts;
    const px = typeof f.price === 'number' ? fmtPrice(f.price) : null;
    const lastLabel = L3(l, '현재', 'Last', '現在');

    switch (ev.event) {
        case 'call_wall_break': {
            const L = fmtLevel(f.level!);
            return {
                title: L3(l, `${T} 콜월 ${L} 돌파`, `${T} broke above call wall ${L}`, `${T} コールウォール${L}を上抜け`),
                body: join([
                    f.nextWall ? L3(l, `다음 벽 ${fmtLevel(f.nextWall)}`, `Next wall ${fmtLevel(f.nextWall)}`, `次の壁 ${fmtLevel(f.nextWall)}`) : null,
                    typeof f.pcr === 'number' ? L3(l, `풋콜 ${f.pcr.toFixed(2)}`, `P/C ${f.pcr.toFixed(2)}`, `プット/コール ${f.pcr.toFixed(2)}`) : null,
                    px && `${lastLabel} ${px}`,
                    L3(l, '5분 종가 기준', '5-min close', '5分足終値'),
                ]),
            };
        }
        case 'put_floor_break': {
            const L = fmtLevel(f.level!);
            return {
                title: L3(l, `${T} 풋플로어 ${L} 이탈`, `${T} fell below put floor ${L}`, `${T} プットフロア${L}を下抜け`),
                body: join([
                    typeof f.maxPain === 'number' ? L3(l, `맥스페인 ${fmtLevel(f.maxPain)}`, `Max pain ${fmtLevel(f.maxPain)}`, `マックスペイン ${fmtLevel(f.maxPain)}`) : null,
                    px && `${lastLabel} ${px}`,
                    L3(l, '5분 종가 기준', '5-min close', '5分足終値'),
                ]),
            };
        }
        case 'gamma_flip_cross': {
            const L = fmtLevel(f.level!);
            const up = f.direction === 'up';
            return {
                title: L3(l,
                    `${T} 감마플립 ${L} ${up ? '위로' : '아래로'}`,
                    `${T} crossed ${up ? 'above' : 'below'} gamma flip ${L}`,
                    `${T} ガンマフリップ${L}を${up ? '上回る' : '下回る'}`),
                body: join([px && `${lastLabel} ${px}`, L3(l, '5분 종가 기준', '5-min close', '5分足終値')]),
            };
        }
        case 'maxpain_divergence': {
            const mp = fmtLevel(f.maxPain!);
            const d = fmtSignedPct(f.divergencePct ?? 0);
            const exp = f.expiration ? fmtDate(f.expiration, l) : '';
            return {
                title: L3(l, `${T} 맥스페인 대비 ${d}`, `${T} ${d} vs max pain`, `${T} マックスペイン比 ${d}`),
                body: join([
                    L3(l, `${exp} 만기 맥스페인 ${mp}`, `Max pain ${mp} (${exp} expiry)`, `${exp}満期 マックスペイン ${mp}`),
                    px && `${lastLabel} ${px}`,
                    L3(l, '20일 괴리 상위 10%', 'top 10% gap in 20 days', '20日間の乖離上位10%'),
                ]),
            };
        }
        case 'darkpool_spike': {
            const pct = fmtPct(f.pct!);
            const mean = fmtPct(f.mean!);
            const ratio = (f.ratio ?? 0).toFixed(1);
            const sig = (f.sigma ?? 0).toFixed(1);
            const d = shortDate(f.date);
            return {
                title: L3(l, `${T} 장외 비중 ${pct}`, `${T} off-exchange share ${pct}`, `${T} 市場外比率 ${pct}`),
                body: join([
                    L3(l, `20일 평균 ${mean}의 ${ratio}배(+${sig}σ)`, `${ratio}× its 20-day avg ${mean} (+${sig}σ)`, `20日平均${mean}の${ratio}倍(+${sig}σ)`),
                    `FINRA ${d}`,
                ]),
            };
        }
        case 'whale_new': {
            const c = f.contract!;
            const side = c.type === 'call' ? L3(l, '콜', 'call', 'コール') : L3(l, '풋', 'put', 'プット');
            const qty = c.oiChange.toLocaleString('en-US');
            const exp = shortDate(c.expiration);
            const asOf = shortDate(f.date);
            return {
                title: L3(l, `${T} 고래 신규 포지션`, `${T} new whale position`, `${T} 大口の新規ポジション`),
                body: join([
                    L3(l,
                        `${exp} $${fmtLevel(c.strike)} ${side} +${qty}계약(명목 ${fmtUsdCompact(c.notional)})`,
                        `${exp} $${fmtLevel(c.strike)} ${side} +${qty} contracts (notional ${fmtUsdCompact(c.notional)})`,
                        `${exp} $${fmtLevel(c.strike)} ${side} +${qty}枚(想定元本 ${fmtUsdCompact(c.notional)})`),
                    L3(l, `${asOf} 장 마감 미결제약정 기준`, `open interest as of ${asOf} close`, `${asOf}終値時点の建玉`),
                ]),
            };
        }
        case 'earnings_d1': {
            const date = f.earningsDate!;
            const tomorrow = calendarDaysBetween(today, date) === 1;
            const when = tomorrow ? L3(l, '내일', 'tomorrow', '明日') : L3(l, fmtDate(date, 'ko'), `on ${fmtDate(date, 'en')}`, fmtDate(date, 'ja'));
            const timing = TIMING[l][f.timing ?? 'unknown'];
            const title = L3(l,
                `${T} ${[when, timing].filter(Boolean).join(' ')} 실적`,
                `${T} reports ${[when, timing].filter(Boolean).join(' ')}`,
                `${T} ${when}${timing}に決算`);
            const im = typeof f.impliedMovePct === 'number' && f.impliedMovePct > 0 ? f.impliedMovePct : null;
            const body = im != null
                ? L3(l, `옵션 내재 변동 ±${im.toFixed(1)}%`, `Options imply ±${im.toFixed(1)}%`, `オプション織り込み変動 ±${im.toFixed(1)}%`)
                : L3(l, `발표일 ${fmtDate(date, 'ko')}`, `Report date ${fmtDate(date, 'en')}`, `発表日 ${fmtDate(date, 'ja')}`);
            return { title, body };
        }
    }
}

/** 한 종목에 사건이 여러 개면 한 통으로(같은 종목 알림은 덮어쓰이므로 — collapse id = 티커) */
export function formatTickerGroup(evs: DetectedEvent[], l: AlertLocale, today: string): AlertCopy {
    const first = formatAlert(evs[0], l, today);
    if (evs.length === 1) return first;
    const rest = evs.slice(1).map((e) => formatAlert(e, l, today).title);
    return { title: first.title, body: [first.body, ...rest].filter(Boolean).join(' / ') };
}

/** 한 기기에 한 번에 여러 종목이면 요약 한 통(장 마감 뒤 몰림 방지 — 기획 §6-2) */
export function formatBundle(groups: DetectedEvent[][], l: AlertLocale, today: string, maxLines = 3): AlertCopy {
    const n = groups.reduce((a, g) => a + g.length, 0);
    const titles = groups.slice(0, maxLines).map((g) => formatAlert(g[0], l, today).title);
    const more = groups.length - Math.min(groups.length, maxLines);
    return {
        title: L3(l, `내 종목 알림 ${n}건`, `${n} watchlist alerts`, `ウォッチリスト通知 ${n}件`),
        body: titles.join(' / ') + (more > 0 ? L3(l, ` 외 ${more}종목`, ` +${more} more`, ` ほか${more}銘柄`) : ''),
    };
}
