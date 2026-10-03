// ============================================================================
// 랭킹 공개 페이지(허브 /rankings · 상세 /rankings/[id])가 함께 쓰는 표시 규칙.
// 두 페이지가 각자 쓰면 언젠가 갈라진다 — 자료 읽기·한 줄 요약·사유 문구를 한 곳에 둔다.
// ============================================================================
import { publicBase } from '@/lib/net/publicBase';
import { sessionYmd, weekdayName } from '@/lib/marketSession';

export type PLoc = 'en' | 'ko' | 'ja';

export type RankingSnapshot = { results?: Record<string, any>; generatedAt?: string } | null;

/**
 * ★ 랭킹 공개 페이지 36장은 «한 스냅샷»을 나눠 쓴다.
 *
 *   예전엔 허브(run=all&top=5)와 상세 11종(run=<id>&top=10)이 URL 마다 따로 데이터
 *   캐시 사본을 가졌다(30분). 사본은 «그 URL 이 방문될 때»만 뒤에서 갱신되므로, 드물게
 *   오는 페이지는 직전 방문 때의 랭킹이 첫 방문자(대개 크롤러)에게 나갔다 —
 *   2026-09-28 실측: 첫 요청의 «갱신» 03:17~12:18 UTC → 두 번째 요청 12:55.
 *   한 사본을 36장이 함께 쓰면 어느 페이지 방문이든 전체가 갱신되고, API 계산도
 *   12종 → 1종으로 준다. 10분 창은 API 자체의 Redis 캐시(600초)와 같게 맞췄다.
 *   (계산은 무겁다 — 콜드 약 7초 — 그래서 no-store 로 사용자 경로에 올리지 않는다.)
 */
export async function loadRankingSnapshot(): Promise<RankingSnapshot> {
    try {
        // ⚠️ 자체 API 는 «공개 도메인»으로 부른다 — 요청 origin 을 쓰면 보호된 주소로 나가 실패한다.
        const r = await fetch(`${publicBase()}/api/ranking?run=all&top=10`, { next: { revalidate: 600 } });
        if (!r.ok) return null;
        return await r.json();
    } catch { return null; }
}

const T = {
    en: { today: 'Today', usual: 'Usual', vs: 'vs usual', pp: 'pp', axes: (n: number) => `${n} axes`, iv: 'IV rank',
          money: 'Premium C/P', oi: 'OI C/P', buyers: (n: number) => `${n} buyer${n === 1 ? '' : 's'}`,
          pending: 'Waiting on the latest session’s data — this list fills in once it arrives.',
          regime: { ACCUMULATION: 'accumulation', DISTRIBUTION: 'distribution', NEUTRAL: 'neutral' } },
    ko: { today: '오늘', usual: '평소', vs: '평소 대비', pp: '%p', axes: (n: number) => `${n}개 축`, iv: 'IV 랭크',
          money: '프리미엄 콜/풋', oi: '미결제약정 콜/풋', buyers: (n: number) => `매수자 ${n}명`,
          pending: '최신 세션 자료를 기다리는 중입니다 — 들어오면 채워집니다.',
          regime: { ACCUMULATION: '축적', DISTRIBUTION: '분산', NEUTRAL: '중립' } },
    ja: { today: '本日', usual: '平常', vs: '平常比', pp: 'pt', axes: (n: number) => `${n}軸`, iv: 'IVランク',
          money: 'プレミアムC/P', oi: '建玉C/P', buyers: (n: number) => `買い手${n}人`,
          pending: '最新セッションのデータ待ちです — 届き次第表示されます。',
          regime: { ACCUMULATION: '買い集め', DISTRIBUTION: '売り抜け', NEUTRAL: '中立' } },
} as const;

/**
 * 값 한 줄을 사람이 읽는 형태로. 랭킹마다 필드가 다르므로 여기서 흡수한다.
 * «오늘» 자리에는 그 값이 속한 세션의 요일을 단다(«금요일 1,234 · 평소 …» — 2026-10-03).
 *   세션 = 블록의 마감 날짜(session — 마감 후 랭킹, 앱 랭킹 날짜 칩과 같은 값) → 없으면 행의 date(장중 랭킹도 행마다 싣는다).
 *   토요일 실측: deviation(장중)·darkpool-volume(마감 후) 모두 행 date 2026-10-02(금)인데 «Today»라고 적혀 있었다.
 *   둘 다 없을 때만 예전 «오늘».
 */
export function describeItem(it: Record<string, any>, l: PLoc, session?: unknown): string {
    const u = T[l];
    if (it.ratio != null) {
        const m = it.ratio >= 1 ? `${it.ratio.toFixed(1)}x` : `${Math.round(it.ratio * 100)}%`;
        const t = it.today != null ? Math.round(it.today * 100) / 100 : null;
        const b = it.baseline != null ? Math.round(it.baseline * 100) / 100 : null;
        const sd = sessionYmd(session) ?? sessionYmd(it.date);
        const dayLbl = sd ? weekdayName(sd, l) : u.today;
        return t != null && b != null ? `${dayLbl} ${t.toLocaleString()} · ${u.usual} ${b.toLocaleString()} · ${u.vs} ${m}` : m;
    }
    if (it.gapPct != null) return `${it.gapPct > 0 ? '+' : ''}${it.gapPct}%`;
    if (it.deviationPp != null) return `${it.deviationPp > 0 ? '+' : ''}${it.deviationPp}${u.pp} (${u.usual} ${it.baseline})`;
    if (it.stealth != null) {
        const rg = (u.regime as Record<string, string>)[it.regime] ?? it.regime ?? '';
        return `${it.stealth} / 100${rg ? ` · ${rg}` : ''}`;
    }
    if (it.axisCount != null) return u.axes(it.axisCount);
    if (it.dollarRatio != null) return `${u.money} ${it.dollarRatio} · ${u.oi} ${it.oiRatio}`;
    if (it.usd != null) return `$${Math.round(it.usd).toLocaleString()}${it.buyerCount != null ? ` · ${u.buyers(it.buyerCount)}` : ''}`;
    if (it.fcfYield != null) return `FCF ${it.fcfYield}% · EV/EBITDA ${it.evToEbitda}`;
    if (it.ivRank != null) return `${u.iv} ${it.ivRank}`;
    return '';
}

/**
 * 랭킹이 비었을 때의 한 줄. API 의 `reason` 은 운영용 «한국어» 문장이라(예: 「아직 안 들어옴 —
 * 보유분 …」) 영어·일본어 페이지에 그대로 찍으면 한국어가 샌다. ko 만 원문을 쓰고,
 * en·ja 는 같은 뜻의 일반 문장으로 바꾼다. 진행률(readiness)은 숫자라 그대로 쓴다.
 */
export function emptyText(block: any, l: PLoc, waiting: string, empty: string): string {
    if (block?.readiness) return `${waiting} — ${block.readiness.have}/${block.readiness.need}`;
    if (block?.reason) return l === 'ko' ? String(block.reason) : T[l].pending;
    return empty;
}
